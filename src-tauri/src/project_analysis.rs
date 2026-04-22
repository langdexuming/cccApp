use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::Utc;
use tauri::AppHandle;

use crate::models::{
  AppSettings, ChatCompletionPayload, KairosLogEntry, KairosLogsResponse, Message, ProjectAnalysisPayload,
  ProjectApplyFixPayload, ProjectApplyFixResponse, ProjectContextPayload, ProjectContextResponse,
  ProjectGeneratePayload,
};
use crate::text_decode::decode_text;

fn now_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0)
}

fn now_iso() -> String {
  Utc::now().to_rfc3339()
}

fn skip_dir(name: &str) -> bool {
  matches!(
    name,
    "node_modules"
      | ".git"
      | "target"
      | "dist"
      | "build"
      | ".next"
      | "__pycache__"
      | ".venv"
      | "venv"
      | "Pods"
      | ".idea"
      | ".turbo"
      | "coverage"
      | ".cache"
      | "out"
      | ".cargo-target"
      | "backend"
  ) || name.starts_with("__MACOSX")
}

fn interesting_file(name: &str) -> bool {
  let lower = name.to_ascii_lowercase();
  lower == "package.json"
    || lower == "cargo.toml"
    || lower == "pyproject.toml"
    || lower == "go.mod"
    || lower == "tsconfig.json"
    || lower == "readme.md"
    || lower == "readme.rst"
    || lower == "vite.config.ts"
    || lower == "server.ts"
    || lower.ends_with(".sln")
}

fn read_snippet(path: &Path, max_bytes: usize) -> Option<String> {
  let bytes = fs::read(path).ok()?;
  let slice = if bytes.len() > max_bytes {
    &bytes[..max_bytes]
  } else {
    bytes.as_slice()
  };
  Some(decode_text(slice))
}

fn resolve_root_path(raw: &str) -> Result<PathBuf, String> {
  let candidate = if raw.trim().is_empty() {
    std::env::current_dir().map_err(|err| format!("failed to resolve current workspace: {err}"))?
  } else {
    PathBuf::from(raw.trim())
  };
  fs::canonicalize(&candidate).map_err(|err| format!("failed to resolve workspace path: {err}"))
}

fn collect_project_outline(root: &Path, max_chars: usize) -> Result<String, String> {
  let root = fs::canonicalize(root).map_err(|e| format!("failed to resolve project path: {e}"))?;
  let mut out = String::new();
  let mut seen_files = 0usize;
  let max_depth = 5usize;
  let max_files = 180usize;

  #[derive(Clone)]
  struct Job {
    path: PathBuf,
    depth: usize,
  }

  let mut stack: Vec<Job> = vec![Job {
    path: root.clone(),
    depth: 0,
  }];
  let mut visited_dirs: HashSet<PathBuf> = HashSet::new();

  while let Some(job) = stack.pop() {
    if out.len() >= max_chars || seen_files >= max_files {
      break;
    }
    if job.depth > max_depth || !visited_dirs.insert(job.path.clone()) {
      continue;
    }

    let rel = job
      .path
      .strip_prefix(&root)
      .map(|p| p.display().to_string())
      .unwrap_or_else(|_| ".".to_string());

    let meta = match fs::metadata(&job.path) {
      Ok(meta) => meta,
      Err(_) => continue,
    };

    if meta.is_file() {
      seen_files += 1;
      let _ = writeln!(&mut out, "[file] {} ({} bytes)", rel, meta.len());
      if interesting_file(job.path.file_name().and_then(|s| s.to_str()).unwrap_or(""))
        && out.len() < max_chars.saturating_sub(2048)
      {
        if let Some(snippet) = read_snippet(&job.path, 1800) {
          let _ = writeln!(&mut out, "----- snippet: {} -----\n{}\n-----", rel, snippet.trim());
        }
      }
      continue;
    }

    if !meta.is_dir() {
      continue;
    }

    let _ = writeln!(&mut out, "[dir] {}/", rel);
    let read_dir = match fs::read_dir(&job.path) {
      Ok(items) => items,
      Err(_) => continue,
    };

    let mut children: Vec<PathBuf> = Vec::new();
    for entry in read_dir.flatten() {
      let name = entry.file_name().to_string_lossy().to_string();
      if entry.path().is_dir() && skip_dir(&name) {
        continue;
      }
      children.push(entry.path());
    }
    children.sort();
    for path in children.into_iter().rev() {
      let name = path
        .file_name()
        .map(|item| item.to_string_lossy().to_string())
        .unwrap_or_default();
      if path.is_dir() && skip_dir(&name) {
        continue;
      }
      stack.push(Job {
        path,
        depth: job.depth + 1,
      });
    }
  }

  if out.trim().is_empty() {
    return Err("no readable project files were scanned".to_string());
  }

  Ok(out)
}

fn collect_workspace_facts(root: &Path) -> Vec<String> {
  let mut facts = Vec::new();
  let checks = [
    ("package.json", "Detected package.json"),
    ("src-tauri/Cargo.toml", "Detected Tauri Rust backend"),
    ("src", "Detected frontend source directory"),
    ("README.md", "Detected README.md"),
    (".env.example", "Detected environment example file"),
    ("server.ts", "Detected local server entry"),
  ];

  for (rel, message) in checks {
    if root.join(rel).exists() {
      facts.push(message.to_string());
    }
  }

  if facts.is_empty() {
    facts.push("Workspace scanned successfully".to_string());
  }

  facts
}

fn normalize_provider_id(provider_id: &str) -> String {
  match provider_id.trim() {
    "vertex-ai" => "vertex_ai".to_string(),
    other => other.to_string(),
  }
}

fn default_model_for_provider(provider_id: &str) -> &'static str {
  match provider_id {
    "gemini" => "gemini-2.5-flash",
    "openai" => "gpt-5.4",
    "claude" => "claude-sonnet-4-5",
    "vertex_ai" => "gemini-2.5-flash",
    _ => "default",
  }
}

fn build_chat_payload(payload: &ProjectGeneratePayload, outline: &str, root_display: &str) -> ChatCompletionPayload {
  let provider_id = normalize_provider_id(&payload.provider_id);
  let mut settings = AppSettings {
    active_provider: provider_id.clone(),
    ..AppSettings::default()
  };
  let mut provider = payload.provider.clone();
  provider.id = provider_id.clone();
  settings.providers = HashMap::from([(provider_id.clone(), provider.clone())]);

  let model = if !payload.active_model.trim().is_empty() {
    payload.active_model.trim().to_string()
  } else {
    provider
      .models
      .first()
      .cloned()
      .unwrap_or_else(|| default_model_for_provider(&provider_id).to_string())
  };

  let body = format!(
    "You are helping the CCC desktop app power its project analysis workspace.\n\
Respond in Chinese unless the user prompt explicitly asks otherwise.\n\n\
Workspace root: `{root_display}`\n\n\
Project scan summary:\n\
----- BEGIN PROJECT OUTLINE -----\n\
{outline}\n\
----- END PROJECT OUTLINE -----\n\n\
User task:\n\
{prompt}",
    prompt = payload.prompt.trim()
  );

  ChatCompletionPayload {
    messages: vec![Message {
      id: "project-analysis-action".to_string(),
      role: "user".to_string(),
      content: body,
      timestamp: now_ms(),
    }],
    settings,
    active_model: model,
    effort: None,
    workspace: None,
    request_id: None,
  }
}

fn normalize_fix_content(content: &str) -> String {
  let trimmed = content.trim();
  if let Some(rest) = trimmed.strip_prefix("```") {
    let body = if let Some(idx) = rest.find('\n') {
      &rest[idx + 1..]
    } else {
      rest
    };
    if let Some(end) = body.rfind("```") {
      return body[..end].trim_end().to_string();
    }
  }
  trimmed.to_string()
}

fn resolve_fix_target(root: &Path, raw_file: &str) -> Result<PathBuf, String> {
  let requested = raw_file.trim();
  if requested.is_empty() {
    return Err("target file path is required".to_string());
  }

  let root = fs::canonicalize(root).map_err(|err| format!("failed to resolve workspace path: {err}"))?;
  let candidate = PathBuf::from(requested);
  let target = if candidate.is_absolute() {
    candidate
  } else {
    root.join(candidate)
  };

  let normalized = if target.exists() {
    fs::canonicalize(&target).map_err(|err| format!("failed to resolve target file: {err}"))?
  } else {
    let parent = target
      .parent()
      .ok_or_else(|| "target file path has no parent directory".to_string())?;
    let parent = fs::canonicalize(parent).map_err(|err| format!("failed to resolve target parent: {err}"))?;
    let name = target
      .file_name()
      .ok_or_else(|| "target file name is invalid".to_string())?;
    parent.join(name)
  };

  if !normalized.starts_with(&root) {
    return Err(format!(
      "refusing to write outside workspace root: {}",
      normalized.display()
    ));
  }

  Ok(normalized)
}

#[tauri::command]
pub async fn read_project_context(payload: ProjectContextPayload) -> Result<ProjectContextResponse, String> {
  let root = resolve_root_path(&payload.root_path)?;
  let outline = collect_project_outline(&root, 14_000)?;
  Ok(ProjectContextResponse {
    root_path: root.display().to_string(),
    outline,
  })
}

#[tauri::command]
pub async fn generate_project_text(app: AppHandle, payload: ProjectGeneratePayload) -> Result<String, String> {
  let root = resolve_root_path(&payload.root_path)?;
  let outline = collect_project_outline(&root, 14_000)?;
  let root_display = root.display().to_string();
  let completion = build_chat_payload(&payload, &outline, &root_display);
  crate::chat::chat_completion(app, completion).await
}

#[tauri::command]
pub fn apply_project_fix(payload: ProjectApplyFixPayload) -> Result<ProjectApplyFixResponse, String> {
  let root = resolve_root_path(&payload.root_path)?;
  let target = resolve_fix_target(&root, &payload.file)?;
  let content = normalize_fix_content(&payload.content);

  if let Some(parent) = target.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("failed to create target directory: {err}"))?;
  }
  fs::write(&target, content).map_err(|err| format!("failed to write target file: {err}"))?;

  Ok(ProjectApplyFixResponse {
    path: target.display().to_string(),
  })
}

#[tauri::command]
pub fn get_kairos_logs(payload: ProjectContextPayload) -> Result<KairosLogsResponse, String> {
  let root = resolve_root_path(&payload.root_path)?;
  let timestamp = now_iso();
  let mut logs = vec![KairosLogEntry {
    timestamp: timestamp.clone(),
    event: format!("Workspace patrol ready: {}", root.display()),
    kind: "info".to_string(),
  }];

  for fact in collect_workspace_facts(&root) {
    logs.push(KairosLogEntry {
      timestamp: timestamp.clone(),
      event: fact,
      kind: "info".to_string(),
    });
  }

  let outline = collect_project_outline(&root, 2500).unwrap_or_default();
  if !outline.trim().is_empty() {
    logs.push(KairosLogEntry {
      timestamp: timestamp.clone(),
      event: "Live patrol refreshed project outline snapshot".to_string(),
      kind: "scan".to_string(),
    });
  }

  logs.push(KairosLogEntry {
    timestamp: timestamp.clone(),
    event: "No dedicated daemon log file detected; showing live desktop patrol summary".to_string(),
    kind: "warning".to_string(),
  });

  Ok(KairosLogsResponse {
    logs,
    last_patrol: timestamp,
  })
}

#[tauri::command]
pub async fn analyze_project(app: AppHandle, payload: ProjectAnalysisPayload) -> Result<String, String> {
  let root = resolve_root_path(&payload.root_path)?;
  let outline = collect_project_outline(&root, 14_000)?;
  let root_display = root.display().to_string();

  let body = format!(
    "You are a senior software architect and code reviewer.\n\
Please produce a structured Chinese Markdown analysis with:\n\
1. Project type and stack inference\n\
2. Module and directory responsibilities\n\
3. Maintainability and delivery risks\n\
4. Suggested next reading or refactor entry points\n\n\
Workspace root: `{root_display}`\n\n\
----- BEGIN PROJECT OUTLINE -----\n\
{outline}\n\
----- END PROJECT OUTLINE -----"
  );

  let completion = ChatCompletionPayload {
    messages: vec![Message {
      id: "project-analysis".to_string(),
      role: "user".to_string(),
      content: body,
      timestamp: now_ms(),
    }],
    settings: payload.settings,
    active_model: payload.active_model.trim().to_string(),
    effort: None,
    workspace: None,
    request_id: None,
  };

  crate::chat::chat_completion(app, completion).await
}
