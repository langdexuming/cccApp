use std::{
  collections::{HashMap, HashSet},
  env, fs,
  path::{Path, PathBuf},
};

use serde_json::Value;

use crate::models::{LocalToolConfigResponse, LocalToolConfigSource, LocalToolProviderPatch};

fn read_utf8(file_path: &Path) -> Option<String> {
  fs::read_to_string(file_path).ok()
}

fn parse_env_file(file_path: &Path) -> HashMap<String, String> {
  let Some(raw) = read_utf8(file_path) else {
    return HashMap::new();
  };

  let mut values = HashMap::new();
  for line in raw.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
      continue;
    }
    let Some((key, value)) = trimmed.split_once('=') else {
      continue;
    };
    let normalized = value.trim().trim_matches('"').trim_matches('\'').to_string();
    values.insert(key.trim().to_string(), normalized);
  }
  values
}

fn read_json_file(file_path: &Path) -> Option<Value> {
  let raw = read_utf8(file_path)?;
  serde_json::from_str::<Value>(&raw).ok()
}

fn extract_toml_value(content: &str, key: &str) -> Option<String> {
  for line in content.lines() {
    let no_comment = line.split('#').next().unwrap_or_default().trim();
    if no_comment.is_empty() || no_comment.starts_with('[') {
      continue;
    }
    let Some((left, right)) = no_comment.split_once('=') else {
      continue;
    };
    if left.trim() != key {
      continue;
    }
    let value = right.trim().trim_matches('"').trim_matches('\'').trim();
    if value.is_empty() {
      return None;
    }
    return Some(value.to_string());
  }
  None
}

fn normalize_claude_messages_url(raw: &str) -> String {
  let trimmed = raw.trim().trim_end_matches('/');
  if trimmed.ends_with("/messages") {
    trimmed.to_string()
  } else if trimmed.ends_with("/v1") {
    format!("{trimmed}/messages")
  } else {
    format!("{trimmed}/v1/messages")
  }
}

fn pick_claude_env_from_settings(root: &Value) -> (Option<String>, Option<String>) {
  let mut api_key = None;
  let mut base_url = None;

  for block_name in ["env", "environmentVariables"] {
    let Some(block) = root.get(block_name).and_then(Value::as_object) else {
      continue;
    };

    if let Some(value) = block.get("ANTHROPIC_API_KEY").and_then(Value::as_str) {
      let trimmed = value.trim();
      if !trimmed.is_empty() {
        api_key = Some(trimmed.to_string());
      }
    }

    if let Some(value) = block.get("ANTHROPIC_BASE_URL").and_then(Value::as_str) {
      let trimmed = value.trim();
      if !trimmed.is_empty() {
        base_url = Some(normalize_claude_messages_url(trimmed));
      }
    }
  }

  (api_key, base_url)
}

fn find_sk_like_key(value: &Value, depth: usize) -> Option<String> {
  if depth > 5 {
    return None;
  }

  match value {
    Value::String(text) => {
      let trimmed = text.trim();
      if trimmed.starts_with("sk-") && trimmed.len() >= 24 {
        Some(trimmed.to_string())
      } else {
        None
      }
    }
    Value::Array(items) => items.iter().find_map(|item| find_sk_like_key(item, depth + 1)),
    Value::Object(map) => map.values().find_map(|item| find_sk_like_key(item, depth + 1)),
    _ => None,
  }
}

fn push_source(sources: &mut Vec<LocalToolConfigSource>, file_path: &Path, keys: Vec<&str>) {
  let unique_keys = keys
    .into_iter()
    .filter(|item| !item.is_empty())
    .map(str::to_string)
    .collect::<HashSet<_>>();
  if unique_keys.is_empty() {
    return;
  }
  sources.push(LocalToolConfigSource {
    path: file_path.display().to_string(),
    keys: unique_keys.into_iter().collect(),
  });
}

fn merge_provider_patch(
  providers: &mut HashMap<String, LocalToolProviderPatch>,
  provider_id: &str,
  api_key: Option<String>,
  base_url: Option<String>,
) {
  let entry = providers.entry(provider_id.to_string()).or_default();
  if api_key.is_some() {
    entry.api_key = api_key;
  }
  if base_url.is_some() {
    entry.base_url = base_url;
  }
}

fn current_project_codex_config() -> Option<PathBuf> {
  let cwd = env::current_dir().ok()?;
  Some(cwd.join(".codex").join("config.toml"))
}

#[tauri::command]
pub fn read_local_tool_configs() -> LocalToolConfigResponse {
  let Some(home_dir) = dirs::home_dir() else {
    return LocalToolConfigResponse::error("failed to resolve user home directory");
  };

  let mut response = LocalToolConfigResponse {
    ok: true,
    home_dir: Some(home_dir.display().to_string()),
    ..LocalToolConfigResponse::default()
  };

  let gemini_env_path = home_dir.join(".gemini").join(".env");
  if gemini_env_path.exists() {
    let env_values = parse_env_file(&gemini_env_path);
    let gemini_key = env_values
      .get("GEMINI_API_KEY")
      .or_else(|| env_values.get("GOOGLE_API_KEY"))
      .or_else(|| env_values.get("GOOGLE_GENAI_API_KEY"))
      .map(|item| item.trim().to_string())
      .filter(|item| !item.is_empty());

    if let Some(api_key) = gemini_key {
      merge_provider_patch(&mut response.providers, "gemini", Some(api_key), None);
      let mut keys = Vec::new();
      for key in ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_API_KEY"] {
        if env_values.get(key).is_some_and(|item| !item.trim().is_empty()) {
          keys.push(key);
        }
      }
      push_source(&mut response.sources, &gemini_env_path, keys);
    }
  }

  let claude_dir = home_dir.join(".claude");
  for file_name in ["settings.json", "settings.local.json"] {
    let file_path = claude_dir.join(file_name);
    if !file_path.exists() {
      continue;
    }
    let Some(json) = read_json_file(&file_path) else {
      continue;
    };
    let (api_key, base_url) = pick_claude_env_from_settings(&json);
    if api_key.is_some() || base_url.is_some() {
      let mut keys = Vec::new();
      if api_key.is_some() {
        keys.push("ANTHROPIC_API_KEY");
      }
      if base_url.is_some() {
        keys.push("ANTHROPIC_BASE_URL");
      }
      merge_provider_patch(&mut response.providers, "claude", api_key, base_url);
      push_source(&mut response.sources, &file_path, keys);
    }
  }

  let codex_home = env::var("CODEX_HOME")
    .map(PathBuf::from)
    .unwrap_or_else(|_| home_dir.join(".codex"));
  let mut codex_paths = vec![codex_home.join("config.toml")];
  if let Some(project_path) = current_project_codex_config() {
    codex_paths.push(project_path);
  }
  for file_path in codex_paths {
    if !file_path.exists() {
      continue;
    }
    let Some(raw) = read_utf8(&file_path) else {
      continue;
    };
    let Some(base) = extract_toml_value(&raw, "openai_base_url") else {
      continue;
    };
    let trimmed = base.trim().trim_end_matches('/');
    let normalized = if trimmed.ends_with("/v1") {
      trimmed.to_string()
    } else {
      format!("{trimmed}/v1")
    };
    merge_provider_patch(&mut response.providers, "openai", None, Some(normalized));
    push_source(&mut response.sources, &file_path, vec!["openai_base_url"]);
  }

  let auth_path = codex_home.join("auth.json");
  if auth_path.exists() {
    if let Some(json) = read_json_file(&auth_path) {
      if let Some(api_key) = find_sk_like_key(&json, 0) {
        merge_provider_patch(&mut response.providers, "openai", Some(api_key), None);
        push_source(&mut response.sources, &auth_path, vec!["api_key_pattern"]);
      }
    }
  }

  response
}
