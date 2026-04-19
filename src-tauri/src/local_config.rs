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

fn normalize_claude_base_url(raw: &str) -> String {
  let trimmed = raw.trim().trim_end_matches('/');
  if let Some(value) = trimmed.strip_suffix("/messages") {
    value.to_string()
  } else if let Some(value) = trimmed.strip_suffix("/chat/completions") {
    value.to_string()
  } else {
    trimmed.to_string()
  }
}

fn normalize_claude_model(raw: &str) -> Option<String> {
  let trimmed = raw.trim();
  if trimmed.is_empty() || !trimmed.to_ascii_lowercase().starts_with("claude-") {
    return None;
  }
  Some(trimmed.to_string())
}

fn take_non_empty_string(value: Option<&Value>) -> Option<String> {
  value
    .and_then(Value::as_str)
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string)
}

fn pick_gemini_env_from_dotenv(
  env_values: &HashMap<String, String>,
) -> (Option<String>, Option<String>, Vec<&'static str>) {
  let api_key = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_API_KEY"]
    .iter()
    .find_map(|key| env_values.get(*key).map(String::as_str))
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string);

  let base_url = ["GOOGLE_GEMINI_BASE_URL", "GEMINI_BASE_URL", "GOOGLE_API_BASE_URL"]
    .iter()
    .find_map(|key| env_values.get(*key).map(String::as_str))
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(|value| value.trim_end_matches('/').to_string());

  let mut keys = Vec::new();
  for key in [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENAI_API_KEY",
    "GOOGLE_GEMINI_BASE_URL",
    "GEMINI_BASE_URL",
    "GOOGLE_API_BASE_URL",
  ] {
    if env_values.get(key).is_some_and(|item| !item.trim().is_empty()) {
      keys.push(key);
    }
  }

  (api_key, base_url, keys)
}

fn pick_claude_env_from_settings(
  root: &Value,
) -> (
  Option<String>,
  Option<String>,
  Option<String>,
  Option<String>,
  Vec<&'static str>,
) {
  let mut api_key = None;
  let mut auth_token = None;
  let mut base_url = None;
  let model = root
    .get("model")
    .and_then(Value::as_str)
    .and_then(normalize_claude_model);
  let mut keys = Vec::new();

  for block_name in ["env", "environmentVariables"] {
    let Some(block) = root.get(block_name).and_then(Value::as_object) else {
      continue;
    };

    if api_key.is_none() {
      if let Some(value) = take_non_empty_string(block.get("ANTHROPIC_API_KEY")) {
        api_key = Some(value);
        keys.push("ANTHROPIC_API_KEY");
      }
    }

    if auth_token.is_none() {
      if let Some(value) = take_non_empty_string(block.get("ANTHROPIC_AUTH_TOKEN")) {
        auth_token = Some(value);
        keys.push("ANTHROPIC_AUTH_TOKEN");
      }
    }

    if base_url.is_none() {
      if let Some(value) = take_non_empty_string(block.get("ANTHROPIC_BASE_URL")) {
        base_url = Some(normalize_claude_base_url(&value));
        keys.push("ANTHROPIC_BASE_URL");
      }
    }
  }

  if model.is_some() {
    keys.push("model");
  }

  (api_key, auth_token, base_url, model, keys)
}

fn pick_claude_env_from_process() -> (Option<String>, Option<String>, Option<String>, Vec<&'static str>) {
  let mut keys = Vec::new();

  let api_key = env::var("ANTHROPIC_API_KEY")
    .ok()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());

  if env::var("ANTHROPIC_API_KEY").ok().is_some_and(|value| !value.trim().is_empty()) {
    keys.push("ANTHROPIC_API_KEY");
  }

  let auth_token = env::var("ANTHROPIC_AUTH_TOKEN")
    .ok()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());

  if env::var("ANTHROPIC_AUTH_TOKEN").ok().is_some_and(|value| !value.trim().is_empty()) {
    keys.push("ANTHROPIC_AUTH_TOKEN");
  }

  let base_url = env::var("ANTHROPIC_BASE_URL")
    .ok()
    .map(|value| normalize_claude_base_url(&value))
    .filter(|value| !value.trim().is_empty());

  if env::var("ANTHROPIC_BASE_URL").ok().is_some_and(|value| !value.trim().is_empty()) {
    keys.push("ANTHROPIC_BASE_URL");
  }

  (api_key, auth_token, base_url, keys)
}

fn parse_toml_section_name(line: &str) -> Option<String> {
  let trimmed = line.trim();
  let section = trimmed.strip_prefix('[')?.strip_suffix(']')?.trim();
  if section.is_empty() {
    None
  } else {
    Some(section.to_string())
  }
}

fn quoted_toml_table_key(value: &str) -> String {
  let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
  format!("\"{escaped}\"")
}

fn pick_codex_provider_value(content: &str, key: &str) -> Option<(String, Vec<String>)> {
  if key == "base_url" {
    if let Some(base) = extract_toml_value(content, "openai_base_url") {
      return Some((base, vec!["openai_base_url".to_string()]));
    }
  }

  let selected_provider = extract_toml_value(content, "model_provider")?;
  let provider_section = format!("model_providers.{selected_provider}");
  let quoted_provider_section = format!(
    "model_providers.{}",
    quoted_toml_table_key(&selected_provider)
  );

  let mut current_section = String::new();
  for line in content.lines() {
    let no_comment = line.split('#').next().unwrap_or_default().trim();
    if no_comment.is_empty() {
      continue;
    }
    if let Some(section) = parse_toml_section_name(no_comment) {
      current_section = section;
      continue;
    }
    if current_section != provider_section && current_section != quoted_provider_section {
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
    return Some((
      value.to_string(),
      vec![
        "model_provider".to_string(),
        format!("{current_section}.{key}"),
      ],
    ));
  }

  None
}

fn pick_codex_base_url(content: &str) -> Option<(String, Vec<String>)> {
  pick_codex_provider_value(content, "base_url")
}

fn pick_codex_wire_api(content: &str) -> Option<(String, Vec<String>)> {
  pick_codex_provider_value(content, "wire_api")
}

fn pick_codex_model(content: &str) -> Option<String> {
  extract_toml_value(content, "model")
}

fn pick_codex_cached_models(root: &Value) -> Vec<String> {
  let Some(models) = root.get("models").and_then(Value::as_array) else {
    return Vec::new();
  };

  models
    .iter()
    .filter(|item| item.get("visibility").and_then(Value::as_str) == Some("list"))
    .filter(|item| item.get("supported_in_api").and_then(Value::as_bool).unwrap_or(true))
    .filter_map(|item| item.get("slug").and_then(Value::as_str))
    .map(str::trim)
    .filter(|slug| !slug.is_empty())
    .map(str::to_string)
    .collect()
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
  auth_token: Option<String>,
  base_url: Option<String>,
  wire_api: Option<String>,
  models: Option<Vec<String>>,
) {
  let entry = providers.entry(provider_id.to_string()).or_default();
  if api_key.is_some() {
    entry.api_key = api_key;
  }
  if auth_token.is_some() {
    entry.auth_token = auth_token;
  }
  if base_url.is_some() {
    entry.base_url = base_url;
  }
  if wire_api.is_some() {
    entry.wire_api = wire_api;
  }
  if models.is_some() {
    entry.models = models;
  }
}

fn current_project_codex_config() -> Option<PathBuf> {
  let cwd = env::current_dir().ok()?;
  Some(cwd.join(".codex").join("config.toml"))
}

#[tauri::command]
pub fn read_local_tool_configs() -> LocalToolConfigResponse {
  load_local_tool_configs()
}

pub fn load_local_tool_configs() -> LocalToolConfigResponse {
  let Some(home_dir) = dirs::home_dir() else {
    return LocalToolConfigResponse::error("failed to resolve user home directory");
  };

  let mut response = LocalToolConfigResponse {
    ok: true,
    home_dir: Some(home_dir.display().to_string()),
    ..LocalToolConfigResponse::default()
  };

  let (claude_env_api_key, claude_env_auth_token, claude_env_base_url, claude_env_keys) =
    pick_claude_env_from_process();
  if claude_env_api_key.is_some() || claude_env_auth_token.is_some() || claude_env_base_url.is_some() {
    merge_provider_patch(
      &mut response.providers,
      "claude",
      claude_env_api_key,
      claude_env_auth_token,
      claude_env_base_url,
      None,
      None,
    );
    push_source(
      &mut response.sources,
      Path::new("[process-env]"),
      claude_env_keys,
    );
  }

  let gemini_env_path = home_dir.join(".gemini").join(".env");
  if gemini_env_path.exists() {
    let env_values = parse_env_file(&gemini_env_path);
    let (api_key, base_url, keys) = pick_gemini_env_from_dotenv(&env_values);

    if api_key.is_some() || base_url.is_some() {
      merge_provider_patch(
        &mut response.providers,
        "gemini",
        api_key,
        None,
        base_url,
        None,
        None,
      );
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
    let (api_key, auth_token, base_url, model, keys) = pick_claude_env_from_settings(&json);
    if api_key.is_some() || auth_token.is_some() || base_url.is_some() || model.is_some() {
      merge_provider_patch(
        &mut response.providers,
        "claude",
        api_key,
        auth_token,
        base_url,
        None,
        model.map(|item| vec![item]),
      );
      push_source(&mut response.sources, &file_path, keys);
    }
  }

  let codex_home = env::var("CODEX_HOME")
    .map(PathBuf::from)
    .unwrap_or_else(|_| home_dir.join(".codex"));
  let mut codex_paths = vec![codex_home.join("config.toml")];
  let mut codex_model = None;
  let mut codex_models = Vec::new();
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
    if codex_model.is_none() {
      codex_model = pick_codex_model(&raw);
      if codex_model.is_some() {
        push_source(&mut response.sources, &file_path, vec!["model"]);
      }
    }
    let Some((base, keys)) = pick_codex_base_url(&raw) else {
      if let Some((wire_api, keys)) = pick_codex_wire_api(&raw) {
        merge_provider_patch(
          &mut response.providers,
          "openai",
          None,
          None,
          None,
          Some(wire_api),
          None,
        );
        let key_refs = keys.iter().map(String::as_str).collect::<Vec<_>>();
        push_source(&mut response.sources, &file_path, key_refs);
      }
      continue;
    };
    let trimmed = base.trim().trim_end_matches('/');
    let normalized = if trimmed.ends_with("/v1") {
      trimmed.to_string()
    } else {
      format!("{trimmed}/v1")
    };
    let wire_api = pick_codex_wire_api(&raw).map(|item| item.0);
    merge_provider_patch(
      &mut response.providers,
      "openai",
      None,
      None,
      Some(normalized),
      wire_api,
      None,
    );
    let mut merged_keys = keys;
    if let Some((_, wire_keys)) = pick_codex_wire_api(&raw) {
      merged_keys.extend(wire_keys);
    }
    let key_refs = merged_keys.iter().map(String::as_str).collect::<Vec<_>>();
    push_source(&mut response.sources, &file_path, key_refs);
  }

  let models_cache_path = codex_home.join("models_cache.json");
  if models_cache_path.exists() {
    if let Some(json) = read_json_file(&models_cache_path) {
      codex_models = pick_codex_cached_models(&json);
      if !codex_models.is_empty() {
        push_source(&mut response.sources, &models_cache_path, vec!["models[].slug"]);
      }
    }
  }

  let mut merged_codex_models = Vec::new();
  if let Some(model) = codex_model {
    merged_codex_models.push(model);
  }
  for model in codex_models {
    if !merged_codex_models.contains(&model) {
      merged_codex_models.push(model);
    }
  }
  if !merged_codex_models.is_empty() {
    merge_provider_patch(
      &mut response.providers,
      "openai",
      None,
      None,
      None,
      None,
      Some(merged_codex_models),
    );
  }

  let auth_path = codex_home.join("auth.json");
  if auth_path.exists() {
    if let Some(json) = read_json_file(&auth_path) {
      if let Some(api_key) = find_sk_like_key(&json, 0) {
        merge_provider_patch(
          &mut response.providers,
          "openai",
          Some(api_key),
          None,
          None,
          None,
          None,
        );
        push_source(&mut response.sources, &auth_path, vec!["api_key_pattern"]);
      }
    }
  }
  response
}

#[cfg(test)]
mod tests {
  use std::collections::HashMap;

  use super::{
    pick_claude_env_from_settings,
    pick_codex_base_url,
    pick_codex_cached_models,
    pick_codex_model,
    pick_codex_wire_api,
    pick_gemini_env_from_dotenv,
  };
  use serde_json::json;

  #[test]
  fn reads_gemini_api_key_and_base_url_from_dotenv() {
    let mut env = HashMap::new();
    env.insert("GEMINI_API_KEY".to_string(), "PROXY_MANAGED".to_string());
    env.insert(
      "GOOGLE_GEMINI_BASE_URL".to_string(),
      "https://ai.centos.hk/".to_string(),
    );
    env.insert(
      "GEMINI_API_KEY".to_string(),
      "sk-gemini-proxy".to_string(),
    );

    let (api_key, base_url, keys) = pick_gemini_env_from_dotenv(&env);

    assert_eq!(api_key.as_deref(), Some("sk-gemini-proxy"));
    assert_eq!(base_url.as_deref(), Some("https://ai.centos.hk"));
    assert!(keys.contains(&"GEMINI_API_KEY"));
    assert!(keys.contains(&"GOOGLE_GEMINI_BASE_URL"));
  }

  #[test]
  fn reads_claude_auth_token_from_settings_json() {
    let data = json!({
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "sk-test",
        "ANTHROPIC_BASE_URL": "https://example.com"
      }
    });

    let (api_key, auth_token, base_url, _, keys) = pick_claude_env_from_settings(&data);

    assert_eq!(api_key, None);
    assert_eq!(auth_token.as_deref(), Some("sk-test"));
    assert_eq!(base_url.as_deref(), Some("https://example.com"));
    assert_eq!(keys.contains(&"model"), false);
    assert!(keys.contains(&"ANTHROPIC_AUTH_TOKEN"));
    assert!(keys.contains(&"ANTHROPIC_BASE_URL"));
  }

  #[test]
  fn reads_claude_model_from_settings_json() {
    let data = json!({
      "model": "huihui_ai/qwen3.5-abliterated:4b-Claude",
      "env": {
        "ANTHROPIC_AUTH_TOKEN": "sk-test"
      }
    });

    let (_, _, _, model, keys) = pick_claude_env_from_settings(&data);

    assert_eq!(model.as_deref(), None);
    assert!(!keys.contains(&"model"));
  }

  #[test]
  fn reads_codex_provider_base_url_from_model_provider_block() {
    let raw = r#"
model_provider = "rightcode"

[model_providers.rightcode]
base_url = "https://right.codes/codex/v1"
"#;

    let (base_url, keys) = pick_codex_base_url(raw).expect("base url should be parsed");

    assert_eq!(base_url, "https://right.codes/codex/v1");
    assert_eq!(
      keys,
      vec![
        "model_provider".to_string(),
        "model_providers.rightcode.base_url".to_string()
      ]
    );
  }

  #[test]
  fn reads_codex_wire_api_from_model_provider_block() {
    let raw = r#"
model_provider = "rightcode"

[model_providers.rightcode]
wire_api = "responses"
"#;

    let (wire_api, keys) = pick_codex_wire_api(raw).expect("wire api should be parsed");

    assert_eq!(wire_api, "responses");
    assert_eq!(
      keys,
      vec![
        "model_provider".to_string(),
        "model_providers.rightcode.wire_api".to_string()
      ]
    );
  }

  #[test]
  fn reads_codex_current_model_from_config() {
    let raw = r#"
model_provider = "rightcode"
model = "gpt-5.4"
"#;

    assert_eq!(pick_codex_model(raw).as_deref(), Some("gpt-5.4"));
  }

  #[test]
  fn reads_codex_models_from_cache() {
    let data = json!({
      "models": [
        {"slug": "gpt-5.4", "visibility": "list", "supported_in_api": true},
        {"slug": "gpt-5.4-mini", "visibility": "list", "supported_in_api": true},
        {"slug": "hidden-model", "visibility": "hidden", "supported_in_api": true},
        {"slug": "unsupported-model", "visibility": "list", "supported_in_api": false}
      ]
    });

    assert_eq!(
      pick_codex_cached_models(&data),
      vec!["gpt-5.4".to_string(), "gpt-5.4-mini".to_string()]
    );
  }
}
