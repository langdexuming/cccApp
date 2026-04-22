use std::env;
use std::path::PathBuf;
use std::process::Stdio;

use serde_json::{json, Value};
use tokio::io::{AsyncWriteExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

use crate::cli_session_store;
use crate::models::ProviderConfig;
use crate::text_decode::{collect_decoded_output, read_decoded_line};

const SESSION_NAMESPACE: Uuid = Uuid::from_bytes([
  0xb5, 0xc4, 0x2d, 0x3c, 0x9f, 0x62, 0x4f, 0xae, 0x8a, 0x3b, 0xcc, 0xf1, 0x18, 0xd0, 0x77, 0x21,
]);

#[derive(Debug)]
struct CliArgs {
  args: Vec<String>,
  via_stdin: bool,
}

#[derive(Debug, Clone)]
pub struct ProxyOverride {
  pub base_url: String,
  pub auth_token: String,
}

fn emit_progress_chunk(
  progress: &mut Option<&mut (dyn FnMut(String) + Send)>,
  chunk: impl Into<String>,
) {
  if let Some(progress) = progress.as_mut() {
    (*progress)(chunk.into());
  }
}

fn format_progress_line(prefix: &str, detail: &str) -> String {
  let trimmed = detail.trim();
  if trimmed.is_empty() {
    String::new()
  } else {
    format!("\n[{prefix}] {trimmed}\n")
  }
}

fn derive_session_id(chat_id: &str) -> String {
  Uuid::new_v5(&SESSION_NAMESPACE, chat_id.as_bytes()).to_string()
}

fn claude_binary() -> String {
  if let Ok(path) = env::var("CLAUDE_CLI_PATH") {
    let trimmed = path.trim();
    if !trimmed.is_empty() {
      return trimmed.to_string();
    }
  }
  which_claude()
    .map(|p| p.to_string_lossy().to_string())
    .unwrap_or_else(|| "claude".to_string())
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn build_claude_command(bin: &str) -> Command {
  #[cfg(windows)]
  {
    let lower = bin.to_ascii_lowercase();
    if lower.ends_with(".cmd") || lower.ends_with(".bat") {
      let mut cmd = Command::new("cmd");
      cmd.creation_flags(CREATE_NO_WINDOW);
      cmd.arg("/c");
      cmd.arg(bin);
      return cmd;
    }
    let mut cmd = Command::new(bin);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
  }
  #[cfg(not(windows))]
  {
    Command::new(bin)
  }
}

fn which_claude() -> Option<PathBuf> {
  let raw = env::var_os("PATH")?;
  let ext_list: Vec<String> = if cfg!(windows) {
    env::var("PATHEXT")
      .unwrap_or_else(|_| ".EXE;.CMD;.BAT".to_string())
      .split(';')
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
      .collect()
  } else {
    vec![String::new()]
  };

  for entry in env::split_paths(&raw) {
    for ext in &ext_list {
      let candidate = if ext.is_empty() {
        entry.join("claude")
      } else {
        entry.join(format!("claude{ext}"))
      };
      if candidate.is_file() {
        return Some(candidate);
      }
    }
  }
  None
}

fn build_args(
  model: &str,
  session_id: &str,
  is_first_turn: bool,
  user_message: &str,
  use_stdin: bool,
) -> CliArgs {
  let mut args = vec!["-p".to_string()];

  if use_stdin {
    args.push(String::new());
    args.push("--input-format".to_string());
    args.push("stream-json".to_string());
  } else {
    args.push(user_message.to_string());
  }

  args.push("--output-format".to_string());
  args.push("stream-json".to_string());
  args.push("--verbose".to_string());
  args.push("--permission-mode".to_string());
  args.push("default".to_string());
  args.push("--model".to_string());
  args.push(model.to_string());

  if is_first_turn {
    args.push("--session-id".to_string());
    args.push(session_id.to_string());
  } else {
    args.push("--resume".to_string());
    args.push(session_id.to_string());
  }

  CliArgs { args, via_stdin: use_stdin }
}

fn should_use_stdin(user_message: &str) -> bool {
  user_message.contains('\n') || user_message.contains('\r')
}

fn stdin_payload(user_message: &str) -> String {
  let payload = json!({
    "type": "user",
    "message": {
      "role": "user",
      "content": [{ "type": "text", "text": user_message }],
    }
  });
  format!("{payload}\n")
}

fn extract_assistant_delta(event: &Value) -> Option<String> {
  let message = event.get("message")?;
  let content = message.get("content")?.as_array()?;
  let mut out = String::new();
  for block in content {
    if block.get("type").and_then(Value::as_str) == Some("text") {
      if let Some(text) = block.get("text").and_then(Value::as_str) {
        out.push_str(text);
      }
    }
  }
  if out.is_empty() {
    None
  } else {
    Some(out)
  }
}

fn extract_result_fallback(event: &Value) -> Option<String> {
  if let Some(text) = event.get("result").and_then(Value::as_str) {
    if !text.trim().is_empty() {
      return Some(text.to_string());
    }
  }
  if let Some(arr) = event
    .get("result")
    .and_then(|r| r.get("content"))
    .and_then(Value::as_array)
  {
    let mut out = String::new();
    for block in arr {
      if let Some(text) = block.get("text").and_then(Value::as_str) {
        out.push_str(text);
      }
    }
    if !out.is_empty() {
      return Some(out);
    }
  }
  if let Some(text) = event.get("content").and_then(Value::as_str) {
    if !text.trim().is_empty() {
      return Some(text.to_string());
    }
  }
  None
}

fn extract_result_error(event: &Value) -> Option<String> {
  event
    .get("error")
    .and_then(|value| match value {
      Value::String(text) => Some(text.trim().to_string()),
      Value::Object(map) => map
        .get("message")
        .and_then(Value::as_str)
        .map(str::trim)
        .map(str::to_string)
        .or_else(|| {
          map.get("error")
            .and_then(Value::as_str)
            .map(str::trim)
            .map(str::to_string)
        })
        .or_else(|| {
          let serialized = Value::Object(map.clone()).to_string();
          let trimmed = serialized.trim();
          if trimmed.is_empty() {
            None
          } else {
            Some(trimmed.to_string())
          }
        }),
      _ => None,
    })
    .or_else(|| {
      event
        .get("message")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
    })
}

fn extract_api_error_status(event: &Value) -> Option<String> {
  match event.get("api_error_status") {
    Some(Value::String(text)) => {
      let trimmed = text.trim();
      if trimmed.is_empty() {
        None
      } else {
        Some(trimmed.to_string())
      }
    }
    Some(Value::Number(number)) => Some(number.to_string()),
    _ => None,
  }
}

fn extract_retry_status(event: &Value) -> Option<String> {
  match event.get("error_status") {
    Some(Value::String(text)) => {
      let trimmed = text.trim();
      if trimmed.is_empty() {
        None
      } else {
        Some(trimmed.to_string())
      }
    }
    Some(Value::Number(number)) => Some(number.to_string()),
    _ => None,
  }
}

fn apply_provider_env(
  cmd: &mut Command,
  provider: &ProviderConfig,
  proxy: Option<&ProxyOverride>,
) {
  if let Some(proxy) = proxy {
    cmd.env("ANTHROPIC_BASE_URL", proxy.base_url.trim());
    cmd.env("ANTHROPIC_AUTH_TOKEN", proxy.auth_token.trim());
    cmd.env_remove("ANTHROPIC_API_KEY");
  } else {
    if let Some(base_url) = provider
      .base_url
      .as_deref()
      .map(str::trim)
      .filter(|v| !v.is_empty())
    {
      cmd.env("ANTHROPIC_BASE_URL", base_url);
    }

    let auth_token = provider.auth_token.trim();
    let api_key = provider.api_key.trim();
    if !auth_token.is_empty() {
      cmd.env("ANTHROPIC_AUTH_TOKEN", auth_token);
      cmd.env_remove("ANTHROPIC_API_KEY");
    } else if !api_key.is_empty() {
      cmd.env("ANTHROPIC_API_KEY", api_key);
      cmd.env_remove("ANTHROPIC_AUTH_TOKEN");
    }
  }

  cmd.env("DISABLE_TELEMETRY", "1");
  cmd.env("DISABLE_ERROR_REPORTING", "1");
  cmd.env("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1");

  #[cfg(windows)]
  apply_windows_git_bash_env(cmd);
}

#[cfg(windows)]
fn apply_windows_git_bash_env(cmd: &mut Command) {
  if let Ok(existing) = env::var("CLAUDE_CODE_GIT_BASH_PATH") {
    if !existing.trim().is_empty() {
      return;
    }
  }

  let candidates = [
    r"D:\Program Files\Git\bin\bash.exe",
    r"C:\Program Files\Git\bin\bash.exe",
    r"C:\Program Files (x86)\Git\bin\bash.exe",
    r"D:\Program Files (x86)\Git\bin\bash.exe",
  ];
  for candidate in candidates {
    if std::path::Path::new(candidate).is_file() {
      cmd.env("CLAUDE_CODE_GIT_BASH_PATH", candidate);
      return;
    }
  }

  if let Some(path_os) = env::var_os("PATH") {
    for entry in env::split_paths(&path_os) {
      let candidate = entry.join("bash.exe");
      if candidate.is_file() {
        let as_str = candidate.to_string_lossy().to_string();
        let lowered = as_str.to_ascii_lowercase();
        if lowered.contains("\\git\\") || lowered.contains("/git/") {
          cmd.env("CLAUDE_CODE_GIT_BASH_PATH", &as_str);
          return;
        }
      }
    }
  }
}

pub async fn chat_with_claude_cli(
  provider: &ProviderConfig,
  model: &str,
  messages: &[crate::models::Message],
  workspace: Option<&str>,
  progress: Option<&mut (dyn FnMut(String) + Send)>,
) -> Result<String, String> {
  chat_with_claude_cli_overridden(provider, model, messages, workspace, None, progress).await
}

pub async fn chat_with_claude_cli_overridden(
  provider: &ProviderConfig,
  model: &str,
  messages: &[crate::models::Message],
  workspace: Option<&str>,
  proxy: Option<&ProxyOverride>,
  mut progress: Option<&mut (dyn FnMut(String) + Send)>,
) -> Result<String, String> {
  let user_message = last_user_message(messages)
    .ok_or_else(|| "No user message found for Claude CLI request.".to_string())?;
  let base_seed = messages
    .first()
    .map(|m| m.id.as_str())
    .filter(|id| !id.is_empty())
    .unwrap_or("cccapp-claude-cli");
  let seed = cli_session_store::session_seed(base_seed, workspace);
  let session_id = derive_session_id(&seed);
  let first_turn = is_first_turn(messages);

  match invoke_claude_cli(
    provider,
    model,
    &session_id,
    first_turn,
    user_message,
    workspace,
    proxy,
    &mut progress,
  )
  .await
  {
    Ok(text) => Ok(text),
    Err(err) if first_turn && err.contains("already in use") => {
      invoke_claude_cli(
        provider,
        model,
        &session_id,
        false,
        user_message,
        workspace,
        proxy,
        &mut progress,
      )
      .await
    }
    Err(err) if !first_turn && looks_like_missing_session(&err) => {
      invoke_claude_cli(
        provider,
        model,
        &session_id,
        true,
        user_message,
        workspace,
        proxy,
        &mut progress,
      )
      .await
    }
    Err(err) => Err(err),
  }
}

fn looks_like_missing_session(err: &str) -> bool {
  let lowered = err.to_ascii_lowercase();
  lowered.contains("no such session")
    || lowered.contains("session not found")
    || lowered.contains("could not find session")
    || lowered.contains("does not exist")
}

pub async fn title_with_claude_cli(
  provider: &ProviderConfig,
  model: &str,
  prompt: &str,
) -> Result<String, String> {
  title_with_claude_cli_overridden(provider, model, prompt, None).await
}

pub async fn title_with_claude_cli_overridden(
  provider: &ProviderConfig,
  model: &str,
  prompt: &str,
  proxy: Option<&ProxyOverride>,
) -> Result<String, String> {
  let session_id = Uuid::new_v4().to_string();
  let mut progress = None;
  invoke_claude_cli(provider, model, &session_id, true, prompt, None, proxy, &mut progress).await
}

async fn invoke_claude_cli(
  provider: &ProviderConfig,
  model: &str,
  session_id: &str,
  is_first_turn: bool,
  user_message: &str,
  workspace: Option<&str>,
  proxy: Option<&ProxyOverride>,
  progress: &mut Option<&mut (dyn FnMut(String) + Send)>,
) -> Result<String, String> {
  if user_message.trim().is_empty() {
    return Err("Claude CLI requires a non-empty user message.".to_string());
  }

  let use_stdin = should_use_stdin(user_message);
  let built = build_args(model, session_id, is_first_turn, user_message, use_stdin);

  let bin = claude_binary();
  let mut cmd = build_claude_command(&bin);
  cmd.args(&built.args);
  if let Some(workspace) = workspace.map(str::trim).filter(|value| !value.is_empty()) {
    cmd.current_dir(workspace);
  }
  cmd.stdout(Stdio::piped());
  cmd.stderr(Stdio::piped());
  if built.via_stdin {
    cmd.stdin(Stdio::piped());
  } else {
    cmd.stdin(Stdio::null());
  }
  apply_provider_env(&mut cmd, provider, proxy);

  let mut child = cmd
    .spawn()
    .map_err(|err| format!("Failed to spawn Claude CLI process: {err}"))?;

  if built.via_stdin {
    if let Some(mut stdin) = child.stdin.take() {
      let payload = stdin_payload(user_message);
      if let Err(err) = stdin.write_all(payload.as_bytes()).await {
        let _ = child.kill().await;
        return Err(format!("Failed to write Claude CLI stdin: {err}"));
      }
      drop(stdin);
    }
  }

  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| "Claude CLI stdout pipe was unavailable".to_string())?;
  let stderr = child
    .stderr
    .take()
    .ok_or_else(|| "Claude CLI stderr pipe was unavailable".to_string())?;

  let stderr_task = tokio::spawn(async move { collect_decoded_output(stderr, 8192).await });

  let mut reader = BufReader::new(stdout);
  let mut line_buf = Vec::new();
  let mut accumulated = String::new();
  let mut fallback: Option<String> = None;
  let mut result_error: Option<String> = None;
  let mut non_json_stdout = String::new();
  let mut result_api_error: Option<String> = None;
  let mut last_retry_status: Option<String> = None;
  let mut last_retry_error: Option<String> = None;
  let mut last_progress_line: Option<String> = None;

  while let Ok(Some(raw_line)) = read_decoded_line(&mut reader, &mut line_buf).await {
    let trimmed = raw_line.trim();
    if trimmed.is_empty() {
      continue;
    }

    let event: Value = match serde_json::from_str(trimmed) {
      Ok(value) => value,
      Err(_) => {
        if non_json_stdout.len() < 4096 {
          non_json_stdout.push_str(trimmed);
          non_json_stdout.push('\n');
        }
        continue;
      }
    };

    let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");
    match event_type {
      "assistant" => {
        if let Some(delta) = extract_assistant_delta(&event) {
          emit_progress_chunk(progress, delta.clone());
          accumulated.push_str(&delta);
        }
      }
      "result" => {
        let subtype = event
          .get("subtype")
          .and_then(Value::as_str)
          .unwrap_or("");
        let is_success_subtype = subtype.eq_ignore_ascii_case("success");
        let is_error_flag = event.get("is_error").and_then(Value::as_bool).unwrap_or(false);
        let has_error_string = extract_result_error(&event).is_some();
        let fallback_text = extract_result_fallback(&event);

        if is_success_subtype && !is_error_flag {
          if let Some(text) = fallback_text.clone().filter(|text| !text.trim().is_empty()) {
            fallback = Some(text);
          }
          result_error = None;
          result_api_error = None;
        } else if is_error_flag || subtype.contains("error") || has_error_string {
          if fallback.is_none() {
            fallback = fallback_text.clone();
          }
          let detail = extract_result_error(&event)
            .or_else(|| fallback_text.clone().filter(|value| !value.trim().is_empty()))
            .unwrap_or_else(|| {
              if subtype.is_empty() {
                "Claude CLI returned an error.".to_string()
              } else {
                format!("Claude CLI returned an error (type={subtype})")
              }
            });
          result_error = Some(detail);
          if result_api_error.is_none() {
            result_api_error = extract_api_error_status(&event);
          }
          let detail_line =
            format_progress_line("Claude CLI", result_error.as_deref().unwrap_or_default());
          if !detail_line.is_empty() && last_progress_line.as_deref() != Some(detail_line.as_str()) {
            emit_progress_chunk(progress, detail_line.clone());
            last_progress_line = Some(detail_line);
          }
        } else if fallback.is_none() {
          fallback = fallback_text;
        }
      }
      "system" => {
        let subtype = event.get("subtype").and_then(Value::as_str).unwrap_or("");
        if subtype.eq_ignore_ascii_case("api_retry") {
          if let Some(status) = extract_retry_status(&event) {
            last_retry_status = Some(status);
          }
          if let Some(error) = event
            .get("error")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
          {
            last_retry_error = Some(error);
          }
          let mut detail_parts = Vec::new();
          if let Some(status) = last_retry_status.as_deref() {
            detail_parts.push(format!("status={status}"));
          }
          if let Some(error) = last_retry_error.as_deref() {
            detail_parts.push(format!("error={error}"));
          }
          let detail = if detail_parts.is_empty() {
            "upstream retry".to_string()
          } else {
            format!("upstream retry ({})", detail_parts.join(", "))
          };
          let progress_line = format_progress_line("Claude CLI", &detail);
          if !progress_line.is_empty() && last_progress_line.as_deref() != Some(progress_line.as_str()) {
            emit_progress_chunk(progress, progress_line.clone());
            last_progress_line = Some(progress_line);
          }
        }
      }
      _ => {}
    }
  }

  let status = child
    .wait()
    .await
    .map_err(|err| format!("Failed to wait for Claude CLI process: {err}"))?;
  let stderr_text = stderr_task.await.unwrap_or_default();

  let text = if !accumulated.trim().is_empty() {
    accumulated
  } else if let Some(text) = fallback {
    text
  } else {
    String::new()
  };

  if !status.success() {
    let stdout_err = non_json_stdout.trim();
    let stderr_err = stderr_text.trim();
    let combined = result_error
      .clone()
      .or_else(|| {
        if !stdout_err.is_empty() {
          Some(stdout_err.to_string())
        } else if !stderr_err.is_empty() {
          Some(stderr_err.to_string())
        } else {
          None
        }
      })
      .or_else(|| match (last_retry_status.as_deref(), last_retry_error.as_deref()) {
        (Some(status), Some(error)) => Some(format!("upstream retry failed (status={status}, error={error})")),
        (Some(status), None) => Some(format!("upstream retry failed (status={status})")),
        (None, Some(error)) => Some(format!("upstream retry failed (error={error})")),
        (None, None) => None,
      })
      .unwrap_or_else(|| format!("Claude CLI exited with non-zero status ({status})"));
    return Err(format!("Claude CLI call failed: {combined}"));
  }

  if let Some(err) = result_error.clone() {
    if text.trim().is_empty() {
      let extra = result_api_error
        .as_deref()
        .map(|s| format!(" (api_error_status={s})"))
        .unwrap_or_default();
      let retry_extra = match (last_retry_status.as_deref(), last_retry_error.as_deref()) {
        (Some(status), Some(error)) => format!(" (last_retry_status={status}, last_retry_error={error})"),
        (Some(status), None) => format!(" (last_retry_status={status})"),
        (None, Some(error)) => format!(" (last_retry_error={error})"),
        (None, None) => String::new(),
      };
      return Err(format!("Claude CLI returned error: {err}{extra}{retry_extra}"));
    }
  }

  if text.trim().is_empty() {
    let stderr_err = stderr_text.trim();
    let stdout_err = non_json_stdout.trim();
    if !stdout_err.is_empty() {
      return Err(format!("Claude CLI returned no parsable output. Raw stdout: {stdout_err}"));
    }
    if !stderr_err.is_empty() {
      return Err(format!("Claude CLI returned no parsable output. Raw stderr: {stderr_err}"));
    }
    return Err("Claude CLI returned no parsable output.".to_string());
  }

  Ok(text)
}

fn is_first_turn(messages: &[crate::models::Message]) -> bool {
  !messages.iter().any(|m| m.role == "assistant")
}

fn last_user_message(messages: &[crate::models::Message]) -> Option<&str> {
  messages
    .iter()
    .rev()
    .find(|m| m.role == "user")
    .map(|m| m.content.as_str())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn derives_stable_session_id_from_chat_id() {
    let a = derive_session_id("chat-abc");
    let b = derive_session_id("chat-abc");
    let c = derive_session_id("chat-xyz");
    assert_eq!(a, b);
    assert_ne!(a, c);
    assert!(Uuid::parse_str(&a).is_ok());
  }

  #[test]
  fn build_args_first_turn_uses_session_id_flag() {
    let built = build_args("claude-opus-4-7[1m]", "sess-1", true, "hi", false);
    let joined = built.args.join(" ");
    assert!(joined.contains("--session-id sess-1"));
    assert!(!joined.contains("--resume"));
    assert!(joined.contains("--model claude-opus-4-7[1m]"));
    assert!(joined.contains("--output-format stream-json"));
    assert!(joined.contains("-p hi"));
    assert!(!built.via_stdin);
  }

  #[test]
  fn build_args_resume_uses_resume_flag() {
    let built = build_args("claude-opus-4-7[1m]", "sess-1", false, "hi", false);
    let joined = built.args.join(" ");
    assert!(joined.contains("--resume sess-1"));
    assert!(!joined.contains("--session-id"));
  }

  #[test]
  fn build_args_stdin_mode_uses_stream_json_input() {
    let built = build_args("claude-opus-4-7[1m]", "sess-1", true, "line 1\nline 2", true);
    let joined = built.args.join(" ");
    assert!(joined.contains("--input-format stream-json"));
    assert!(built.via_stdin);
  }

  #[test]
  fn should_use_stdin_detects_newlines() {
    assert!(!should_use_stdin("single line"));
    assert!(should_use_stdin("line 1\nline 2"));
    assert!(should_use_stdin("line 1\r\nline 2"));
  }

  #[test]
  fn parses_assistant_delta_from_stream_line() {
    let event: Value = serde_json::from_str(
      r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}]}}"#,
    )
    .unwrap();
    assert_eq!(extract_assistant_delta(&event).as_deref(), Some("Hello"));
  }

  #[test]
  fn parses_assistant_concatenates_multiple_text_blocks() {
    let event: Value = serde_json::from_str(
      r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"A"},{"type":"text","text":"B"}]}}"#,
    )
    .unwrap();
    assert_eq!(extract_assistant_delta(&event).as_deref(), Some("AB"));
  }

  #[test]
  fn result_fallback_picks_up_plain_string() {
    let event: Value = serde_json::from_str(r#"{"type":"result","result":"Hi there"}"#).unwrap();
    assert_eq!(extract_result_fallback(&event).as_deref(), Some("Hi there"));
  }

  #[test]
  fn result_fallback_picks_up_content_blocks() {
    let event: Value = serde_json::from_str(
      r#"{"type":"result","result":{"content":[{"type":"text","text":"X"},{"type":"text","text":"Y"}]}}"#,
    )
    .unwrap();
    assert_eq!(extract_result_fallback(&event).as_deref(), Some("XY"));
  }

  #[test]
  fn result_error_reads_nested_error_message() {
    let event: Value = serde_json::from_str(
      r#"{"type":"result","error":{"message":"upstream model not found"}}"#,
    )
    .unwrap();
    assert_eq!(
      extract_result_error(&event).as_deref(),
      Some("upstream model not found")
    );
  }

  #[test]
  fn api_error_status_reads_numeric_values() {
    let event: Value = serde_json::from_str(r#"{"type":"result","api_error_status":429}"#).unwrap();
    assert_eq!(extract_api_error_status(&event).as_deref(), Some("429"));
  }

  #[test]
  fn retry_status_reads_numeric_values() {
    let event: Value = serde_json::from_str(
      r#"{"type":"system","subtype":"api_retry","error_status":503}"#,
    )
    .unwrap();
    assert_eq!(extract_retry_status(&event).as_deref(), Some("503"));
  }

  #[test]
  fn stdin_payload_has_stream_json_user_shape() {
    let payload = stdin_payload("hello");
    let value: Value = serde_json::from_str(payload.trim()).unwrap();
    assert_eq!(value["type"], json!("user"));
    assert_eq!(value["message"]["role"], json!("user"));
    assert_eq!(value["message"]["content"][0]["type"], json!("text"));
    assert_eq!(value["message"]["content"][0]["text"], json!("hello"));
  }

  #[test]
  fn is_first_turn_when_no_assistant() {
    let msgs = vec![crate::models::Message {
      id: "1".into(),
      role: "user".into(),
      content: "hi".into(),
      timestamp: 0,
    }];
    assert!(is_first_turn(&msgs));
  }

  #[test]
  fn is_not_first_turn_when_assistant_exists() {
    let msgs = vec![
      crate::models::Message {
        id: "1".into(),
        role: "user".into(),
        content: "hi".into(),
        timestamp: 0,
      },
      crate::models::Message {
        id: "2".into(),
        role: "assistant".into(),
        content: "hello".into(),
        timestamp: 0,
      },
      crate::models::Message {
        id: "3".into(),
        role: "user".into(),
        content: "again".into(),
        timestamp: 0,
      },
    ];
    assert!(!is_first_turn(&msgs));
  }
}
