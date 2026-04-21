use std::{
  fs::{self, File},
  io::{BufRead, BufReader},
  path::{Path, PathBuf},
};

use chrono::DateTime;
use serde_json::Value;

use crate::models::{WorkspaceExternalConversation, WorkspaceExternalConversationMessage};

const MAX_EXTERNAL_CONVERSATIONS: usize = 50;

#[tauri::command]
pub fn get_workspace_external_conversations(
  workspace: String,
) -> Result<Vec<WorkspaceExternalConversation>, String> {
  let normalized_workspace = clean_workspace_path(&workspace);
  let Some(workspace_key) = normalize_workspace_key(&normalized_workspace) else {
    return Ok(Vec::new());
  };

  let home_dir = dirs::home_dir().ok_or_else(|| "failed to resolve home directory".to_string())?;
  let mut conversations = Vec::new();

  scan_claude_conversations(&home_dir, &workspace_key, &normalized_workspace, &mut conversations);
  scan_codex_conversations(&home_dir, &workspace_key, &normalized_workspace, &mut conversations);

  conversations.sort_by(|a, b| {
    b.updated_at
      .cmp(&a.updated_at)
      .then_with(|| a.source_label.cmp(&b.source_label))
      .then_with(|| a.title.cmp(&b.title))
  });
  conversations.truncate(MAX_EXTERNAL_CONVERSATIONS);

  Ok(conversations)
}

fn scan_claude_conversations(
  home_dir: &Path,
  workspace_key: &str,
  workspace_display: &str,
  out: &mut Vec<WorkspaceExternalConversation>,
) {
  let projects_dir = home_dir.join(".claude").join("projects");
  if !projects_dir.is_dir() {
    return;
  }

  let mut files = Vec::new();
  let preferred_dir = projects_dir.join(encode_claude_project_folder(workspace_display));
  if preferred_dir.is_dir() {
    collect_jsonl_files(&preferred_dir, &mut files);
  } else {
    collect_jsonl_files(&projects_dir, &mut files);
  }

  for path in files {
    if let Some(conversation) = parse_claude_conversation(&path, workspace_key, workspace_display) {
      out.push(conversation);
    }
  }
}

fn scan_codex_conversations(
  home_dir: &Path,
  workspace_key: &str,
  workspace_display: &str,
  out: &mut Vec<WorkspaceExternalConversation>,
) {
  let sessions_dir = home_dir.join(".codex").join("sessions");
  if !sessions_dir.is_dir() {
    return;
  }

  let mut files = Vec::new();
  collect_jsonl_files(&sessions_dir, &mut files);

  for path in files {
    if let Some(conversation) = parse_codex_conversation(&path, workspace_key, workspace_display) {
      out.push(conversation);
    }
  }
}

fn parse_claude_conversation(
  path: &Path,
  workspace_key: &str,
  workspace_display: &str,
) -> Option<WorkspaceExternalConversation> {
  let file = File::open(path).ok()?;
  let reader = BufReader::new(file);

  let mut matches_workspace = false;
  let mut messages = Vec::new();
  let mut session_id = None;
  let mut entrypoint = None;
  let mut updated_at = 0_i64;

  for line in reader.lines().map_while(Result::ok) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }

    let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
      continue;
    };

    if let Some(cwd) = value.get("cwd").and_then(Value::as_str) {
      if normalize_workspace_key(cwd).as_deref() == Some(workspace_key) {
        matches_workspace = true;
      }
    }

    if session_id.is_none() {
      session_id = value
        .get("sessionId")
        .and_then(Value::as_str)
        .map(str::to_string);
    }
    if entrypoint.is_none() {
      entrypoint = value
        .get("entrypoint")
        .and_then(Value::as_str)
        .map(str::to_string);
    }

    let Some(event_type) = value.get("type").and_then(Value::as_str) else {
      continue;
    };
    if !matches!(event_type, "user" | "assistant") {
      continue;
    }

    let role = value
      .get("message")
      .and_then(|message| message.get("role"))
      .and_then(Value::as_str)
      .unwrap_or(event_type);
    if !matches!(role, "user" | "assistant" | "system") {
      continue;
    }

    let content = value
      .get("message")
      .and_then(|message| message.get("content"))
      .map(extract_text_value)
      .unwrap_or_default();
    if content.trim().is_empty() {
      continue;
    }

    let timestamp = extract_timestamp_millis(value.get("timestamp"));
    updated_at = updated_at.max(timestamp);

    messages.push(WorkspaceExternalConversationMessage {
      id: value
        .get("uuid")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("claude-{}-{}", messages.len(), timestamp)),
      role: role.to_string(),
      content,
      timestamp,
    });
  }

  if !matches_workspace || messages.is_empty() {
    return None;
  }

  let entrypoint_value = entrypoint.unwrap_or_else(|| "cli".to_string());
  if !entrypoint_value.to_ascii_lowercase().contains("cli") {
    return None;
  }

  let fallback_id = path
    .file_stem()
    .and_then(|stem| stem.to_str())
    .unwrap_or("claude-transcript");
  let session_id = session_id.or_else(|| Some(fallback_id.to_string()));

  Some(WorkspaceExternalConversation {
    id: format!("claude::{}", session_id.as_deref().unwrap_or(fallback_id)),
    workspace: workspace_display.to_string(),
    source_kind: "claude_cli".to_string(),
    source_label: "Claude CLI".to_string(),
    title: derive_conversation_title(&messages, fallback_id),
    updated_at,
    preview: build_preview(&messages),
    messages,
    source_detail: Some(entrypoint_value),
    session_id,
    transcript_path: Some(path.to_string_lossy().to_string()),
  })
}

fn parse_codex_conversation(
  path: &Path,
  workspace_key: &str,
  workspace_display: &str,
) -> Option<WorkspaceExternalConversation> {
  let file = File::open(path).ok()?;
  let reader = BufReader::new(file);

  let mut matches_workspace = false;
  let mut messages = Vec::new();
  let mut session_id = None;
  let mut originator = None;
  let mut source = None;
  let mut updated_at = 0_i64;

  for line in reader.lines().map_while(Result::ok) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }

    let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
      continue;
    };
    let Some(event_type) = value.get("type").and_then(Value::as_str) else {
      continue;
    };

    if event_type == "session_meta" {
      let payload = value.get("payload")?;
      let cwd = payload.get("cwd").and_then(Value::as_str).unwrap_or_default();
      if normalize_workspace_key(cwd).as_deref() != Some(workspace_key) {
        return None;
      }

      matches_workspace = true;
      session_id = payload.get("id").and_then(Value::as_str).map(str::to_string);
      originator = payload
        .get("originator")
        .and_then(Value::as_str)
        .map(str::to_string);
      source = payload.get("source").and_then(Value::as_str).map(str::to_string);
      updated_at = updated_at.max(extract_timestamp_millis(payload.get("timestamp")));
      continue;
    }

    if !matches_workspace || event_type != "response_item" {
      continue;
    }

    let payload = value.get("payload")?;
    if payload.get("type").and_then(Value::as_str) != Some("message") {
      continue;
    }

    let role = payload.get("role").and_then(Value::as_str).unwrap_or_default();
    if !matches!(role, "user" | "assistant" | "system") {
      continue;
    }

    let content = payload
      .get("content")
      .map(extract_text_value)
      .unwrap_or_default();
    if content.trim().is_empty() {
      continue;
    }

    let timestamp = extract_timestamp_millis(value.get("timestamp"));
    updated_at = updated_at.max(timestamp);

    messages.push(WorkspaceExternalConversationMessage {
      id: format!(
        "codex-{}-{}",
        session_id.as_deref().unwrap_or("session"),
        messages.len()
      ),
      role: role.to_string(),
      content,
      timestamp,
    });
  }

  if !matches_workspace || messages.is_empty() {
    return None;
  }

  let fallback_id = path
    .file_stem()
    .and_then(|stem| stem.to_str())
    .unwrap_or("codex-transcript");
  let session_id = session_id.or_else(|| Some(fallback_id.to_string()));
  let (source_kind, source_label) = classify_codex_source(originator.as_deref(), source.as_deref());

  Some(WorkspaceExternalConversation {
    id: format!("codex::{}", session_id.as_deref().unwrap_or(fallback_id)),
    workspace: workspace_display.to_string(),
    source_kind: source_kind.to_string(),
    source_label: source_label.to_string(),
    title: derive_conversation_title(&messages, fallback_id),
    updated_at,
    preview: build_preview(&messages),
    messages,
    source_detail: Some(format!(
      "{} / {}",
      originator.as_deref().unwrap_or("unknown"),
      source.as_deref().unwrap_or("unknown")
    )),
    session_id,
    transcript_path: Some(path.to_string_lossy().to_string()),
  })
}

fn extract_text_value(value: &Value) -> String {
  match value {
    Value::String(text) => text.to_string(),
    Value::Array(items) => items
      .iter()
      .filter_map(|item| match item {
        Value::String(text) => Some(text.to_string()),
        Value::Object(map) => map
          .get("text")
          .and_then(Value::as_str)
          .map(str::to_string)
          .or_else(|| map.get("content").and_then(Value::as_str).map(str::to_string)),
        _ => None,
      })
      .collect::<Vec<_>>()
      .join(""),
    Value::Object(map) => map
      .get("text")
      .and_then(Value::as_str)
      .map(str::to_string)
      .unwrap_or_default(),
    _ => String::new(),
  }
}

fn extract_timestamp_millis(value: Option<&Value>) -> i64 {
  let Some(value) = value else {
    return 0;
  };

  if let Some(text) = value.as_str() {
    if let Ok(timestamp) = DateTime::parse_from_rfc3339(text) {
      return timestamp.timestamp_millis();
    }
  }

  if let Some(number) = value.as_i64() {
    return if number > 1_000_000_000_000 {
      number
    } else {
      number.saturating_mul(1000)
    };
  }

  if let Some(number) = value.as_u64() {
    return if number > 1_000_000_000_000 {
      number as i64
    } else {
      (number as i64).saturating_mul(1000)
    };
  }

  0
}

fn derive_conversation_title(
  messages: &[WorkspaceExternalConversationMessage],
  fallback: &str,
) -> String {
  messages
    .iter()
    .find(|message| {
      message.role == "user"
        && !message.content.trim().is_empty()
        && !message.content.trim_start().starts_with("<environment_context>")
    })
    .or_else(|| {
      messages
        .iter()
        .find(|message| message.role == "user" && !message.content.trim().is_empty())
    })
    .or_else(|| messages.first())
    .map(|message| ellipsize(&collapse_whitespace(&message.content), 56))
    .filter(|title| !title.is_empty())
    .unwrap_or_else(|| fallback.to_string())
}

fn build_preview(messages: &[WorkspaceExternalConversationMessage]) -> String {
  messages
    .iter()
    .rev()
    .find(|message| !message.content.trim().is_empty())
    .map(|message| ellipsize(&collapse_whitespace(&message.content), 88))
    .unwrap_or_default()
}

fn collapse_whitespace(input: &str) -> String {
  input.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn ellipsize(input: &str, max_chars: usize) -> String {
  let mut output = String::new();
  let mut count = 0;
  for ch in input.chars() {
    if count >= max_chars {
      output.push_str("...");
      return output;
    }
    output.push(ch);
    count += 1;
  }
  output
}

fn classify_codex_source(originator: Option<&str>, source: Option<&str>) -> (&'static str, &'static str) {
  let originator = originator.unwrap_or_default().to_ascii_lowercase();
  let source = source.unwrap_or_default().to_ascii_lowercase();

  if source == "exec" || originator.contains("exec") {
    ("codex_cli", "Codex CLI")
  } else {
    ("codex_app", "Codex App")
  }
}

fn collect_jsonl_files(dir: &Path, out: &mut Vec<PathBuf>) {
  let Ok(entries) = fs::read_dir(dir) else {
    return;
  };

  for entry in entries.flatten() {
    let path = entry.path();
    if path.is_dir() {
      collect_jsonl_files(&path, out);
      continue;
    }

    let is_jsonl = path
      .extension()
      .and_then(|extension| extension.to_str())
      .map(|extension| extension.eq_ignore_ascii_case("jsonl"))
      .unwrap_or(false);
    if is_jsonl {
      out.push(path);
    }
  }
}

fn encode_claude_project_folder(workspace: &str) -> String {
  clean_workspace_path(workspace)
    .chars()
    .map(|ch| match ch {
      ':' | '\\' | '/' | '_' | ' ' => '-',
      _ => ch,
    })
    .collect()
}

fn clean_workspace_path(workspace: &str) -> String {
  let trimmed = workspace.trim().trim_matches('"').trim_matches('\'');

  #[cfg(windows)]
  {
    if let Some(stripped) = trimmed.strip_prefix(r"\\?\UNC\") {
      return format!(r"\\{stripped}");
    }
    if let Some(stripped) = trimmed.strip_prefix(r"\\?\") {
      return stripped.to_string();
    }
  }

  trimmed.to_string()
}

fn normalize_workspace_key(workspace: &str) -> Option<String> {
  let cleaned = clean_workspace_path(workspace);
  if cleaned.is_empty() {
    return None;
  }

  #[cfg(windows)]
  {
    let mut normalized = cleaned.replace('/', "\\");
    while normalized.len() > 3 && normalized.ends_with('\\') {
      normalized.pop();
    }
    return Some(normalized.to_ascii_lowercase());
  }

  #[cfg(not(windows))]
  {
    let mut normalized = cleaned.replace('\\', "/");
    while normalized.len() > 1 && normalized.ends_with('/') {
      normalized.pop();
    }
    Some(normalized)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn normalizes_windows_workspace_prefix() {
    assert_eq!(
      normalize_workspace_key(r"\\?\D:\ai_work\cccApp").as_deref(),
      Some(r"d:\ai_work\cccapp")
    );
  }

  #[test]
  fn encodes_claude_project_directory_name() {
    assert_eq!(
      encode_claude_project_folder(r"D:\ai_work\cccApp"),
      "D--ai-work-cccApp"
    );
  }

  #[test]
  fn classifies_codex_exec_as_cli() {
    assert_eq!(
      classify_codex_source(Some("codex_exec"), Some("exec")),
      ("codex_cli", "Codex CLI")
    );
  }
}
