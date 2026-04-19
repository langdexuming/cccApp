use std::{
  error::Error,
  process,
  time::{Duration, SystemTime, UNIX_EPOCH},
};

use reqwest::{Client, RequestBuilder, Response, StatusCode};
use serde_json::{json, Value};
use tokio::time::sleep;

use crate::models::{
  AppSettings, ChatCompletionPayload, FetchProviderModelsPayload, FetchProviderModelsResponse,
  LocalToolProviderPatch, ProviderConfig, TitlePayload,
};

fn active_provider(settings: &AppSettings) -> Result<(String, ProviderConfig), String> {
  let provider_id = settings.active_provider.clone();
  let mut provider = settings
    .providers
    .get(&provider_id)
    .cloned()
    .ok_or_else(|| format!("unknown provider: {}", settings.active_provider))?;
  apply_runtime_local_provider_override(&provider_id, &mut provider);
  Ok((provider_id, provider))
}

fn apply_local_provider_patch(provider: &mut ProviderConfig, patch: &LocalToolProviderPatch) {
  if let Some(api_key) = patch.api_key.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
    provider.api_key = api_key.to_string();
  }
  if let Some(auth_token) = patch
    .auth_token
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
  {
    provider.auth_token = auth_token.to_string();
  }
  if let Some(base_url) = patch.base_url.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
    provider.base_url = Some(base_url.to_string());
  }
  if let Some(wire_api) = patch.wire_api.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
    provider.wire_api = Some(wire_api.to_string());
  }
  if let Some(models) = patch.models.as_ref().filter(|items| !items.is_empty()) {
    provider.models = models.clone();
  }
}

fn apply_runtime_local_provider_override(provider_id: &str, provider: &mut ProviderConfig) {
  let local = crate::local_config::load_local_tool_configs();
  if !local.ok {
    return;
  }
  let Some(patch) = local.providers.get(provider_id) else {
    return;
  };
  apply_local_provider_patch(provider, patch);
}

fn require_api_key(provider: &ProviderConfig) -> Result<String, String> {
  let api_key = provider.api_key.trim();
  if api_key.is_empty() {
    Err(format!("请先在设置中配置 {} 的 API Key", provider.name))
  } else {
    Ok(api_key.to_string())
  }
}

#[derive(Clone, Default)]
struct ClaudeCredentials {
  api_key: Option<String>,
  auth_token: Option<String>,
}

fn require_claude_credentials(provider: &ProviderConfig) -> Result<ClaudeCredentials, String> {
  let api_key = Some(provider.api_key.trim().to_string()).filter(|value| !value.is_empty());
  let auth_token = Some(provider.auth_token.trim().to_string()).filter(|value| !value.is_empty());

  if api_key.is_none() && auth_token.is_none() {
    Err(format!(
      "请先在设置中配置 {} 的 API Key 或 Auth Token",
      provider.name
    ))
  } else {
    Ok(ClaudeCredentials {
      api_key,
      auth_token,
    })
  }
}

fn openai_base_url(provider_id: &str, provider: &ProviderConfig) -> Result<String, String> {
  let base = provider
    .base_url
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty());
  let raw = match (provider_id, base) {
    (_, Some(base)) => base.to_string(),
    ("openai", None) => "https://api.openai.com/v1".to_string(),
    _ => return Err("请先配置 OpenAI 兼容接口的 Base URL".to_string()),
  };

  Ok(raw.trim_end_matches('/').to_string())
}

fn openai_chat_url(provider_id: &str, provider: &ProviderConfig) -> Result<String, String> {
  let base = openai_base_url(provider_id, provider)?;
  if base.ends_with("/chat/completions") {
    Ok(base)
  } else {
    Ok(format!("{base}/chat/completions"))
  }
}

fn openai_responses_url(provider_id: &str, provider: &ProviderConfig) -> Result<String, String> {
  let base = openai_base_url(provider_id, provider)?;
  if base.ends_with("/responses") {
    Ok(base)
  } else {
    Ok(format!("{base}/responses"))
  }
}

fn openai_models_url(provider_id: &str, provider: &ProviderConfig) -> Result<String, String> {
  let base = openai_base_url(provider_id, provider)?;
  if base.ends_with("/models") {
    Ok(base)
  } else {
    Ok(format!("{base}/models"))
  }
}

fn uses_responses_api(provider: &ProviderConfig) -> bool {
  provider
    .wire_api
    .as_deref()
    .map(str::trim)
    .map(|value| value.eq_ignore_ascii_case("responses"))
    .unwrap_or(false)
}

fn uses_claude_chat_completions_api(provider: &ProviderConfig) -> bool {
  provider
    .wire_api
    .as_deref()
    .map(str::trim)
    .map(|value| value.eq_ignore_ascii_case("chat_completions"))
    .unwrap_or(false)
}

fn uses_claude_cli(provider: &ProviderConfig) -> bool {
  provider
    .wire_api
    .as_deref()
    .map(str::trim)
    .map(|value| value.eq_ignore_ascii_case("cli"))
    .unwrap_or(false)
}

fn claude_api_root(provider: &ProviderConfig) -> String {
  let raw = provider
    .base_url
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or("https://api.anthropic.com");
  let trimmed = raw.trim_end_matches('/');
  if let Some(value) = trimmed.strip_suffix("/messages") {
    value.to_string()
  } else if let Some(value) = trimmed.strip_suffix("/chat/completions") {
    value.to_string()
  } else {
    trimmed.to_string()
  }
}

fn claude_messages_url(provider: &ProviderConfig) -> String {
  let root = claude_api_root(provider);
  if root.ends_with("/v1") {
    format!("{root}/messages")
  } else {
    format!("{root}/v1/messages")
  }
}

fn claude_chat_completions_url(provider: &ProviderConfig) -> String {
  let root = claude_api_root(provider);
  if root.ends_with("/v1") {
    format!("{root}/chat/completions")
  } else {
    format!("{root}/v1/chat/completions")
  }
}

fn claude_models_url(provider: &ProviderConfig) -> String {
  let root = claude_api_root(provider);
  if root.ends_with("/v1") {
    format!("{root}/models")
  } else {
    format!("{root}/v1/models")
  }
}

fn claude_uses_1m_context(model: &str) -> bool {
  let trimmed = model.trim();
  trimmed.ends_with("[1m]") || trimmed.ends_with("[1M]")
}

fn claude_api_model(model: &str) -> String {
  model
    .trim()
    .replace("[1m]", "")
    .replace("[1M]", "")
    .replace("[2m]", "")
    .replace("[2M]", "")
    .trim()
    .to_string()
}

fn claude_beta_headers(model: &str) -> Vec<&'static str> {
  let normalized = claude_api_model(model).to_ascii_lowercase();
  let mut betas = Vec::new();

  if !normalized.contains("haiku") {
    betas.push("claude-code-20250219");
  }
  if claude_uses_1m_context(model) {
    betas.push("context-1m-2025-08-07");
  }

  betas
}

fn claude_system_blocks(system: Option<&str>) -> Option<Value> {
  let mut blocks = vec![json!({
    "type": "text",
    "text": "You are Claude Code, Anthropic's official CLI for Claude.",
  })];

  if let Some(system) = system.map(str::trim).filter(|value| !value.is_empty()) {
    blocks.push(json!({
      "type": "text",
      "text": system,
    }));
  }

  Some(Value::Array(blocks))
}

fn claude_metadata_user_id() -> String {
  let session_seed = claude_session_id();
  let user_hex = session_seed
    .as_bytes()
    .iter()
    .cycle()
    .take(32)
    .map(|byte| format!("{byte:02x}"))
    .collect::<String>();
  let uuid_hex = session_seed
    .as_bytes()
    .iter()
    .rev()
    .cycle()
    .take(16)
    .map(|byte| format!("{byte:02x}"))
    .collect::<String>();
  let uuid = format!(
    "{}-{}-{}-{}-{}",
    &uuid_hex[0..8],
    &uuid_hex[8..12],
    &uuid_hex[12..16],
    &uuid_hex[16..20],
    &uuid_hex[20..32]
  );
  format!("user_{user_hex}_account__session_{uuid}")
}

fn claude_metadata() -> Value {
  json!({
    "user_id": claude_metadata_user_id()
  })
}

fn claude_billing_header_value() -> String {
  format!(
    "cc_version={CLAUDE_CLI_VERSION_WITH_FINGERPRINT}; cc_entrypoint={CLAUDE_CLI_ENTRYPOINT}; cch=00000;"
  )
}

const CLAUDE_MAX_RETRIES: usize = 3;
const CLAUDE_BASE_DELAY_MS: u64 = 500;
const CLAUDE_MAX_DELAY_MS: u64 = 8_000;
const CLAUDE_CLI_VERSION: &str = "2.1.113";
const CLAUDE_CLI_VERSION_WITH_FINGERPRINT: &str = "2.1.113.f12";
const CLAUDE_CLI_ENTRYPOINT: &str = "sdk-cli";
const HTTP_CONNECT_TIMEOUT_SECS: u64 = 10;
const HTTP_REQUEST_TIMEOUT_SECS: u64 = 25;
/// Vertex 走 Google 边缘域名，跨境或受限网络下握手更慢，单独放宽超时。
const VERTEX_HTTP_CONNECT_TIMEOUT_SECS: u64 = 90;
const VERTEX_HTTP_REQUEST_TIMEOUT_SECS: u64 = 300;

#[derive(Clone, Copy)]
enum ClaudeAuthModeKind {
  Bearer,
  ApiKey,
}

#[derive(Clone)]
struct ClaudeAuthMode {
  kind: ClaudeAuthModeKind,
  value: String,
  source: &'static str,
}

struct ApiErrorDetails {
  status: StatusCode,
  body: String,
  message: String,
}

struct ClaudeDebugContext {
  request_kind: &'static str,
  base_url: String,
  endpoint: String,
  auth_modes: Vec<String>,
  selected_model: String,
  api_model: String,
  beta_headers: Vec<String>,
}

fn claude_user_agent() -> String {
  format!(
    "claude-cli/{CLAUDE_CLI_VERSION} (external, {CLAUDE_CLI_ENTRYPOINT})"
  )
}

fn claude_session_id() -> String {
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis();
  format!("ccc-desktop-{}-{timestamp}", process::id())
}

fn claude_auth_modes(credentials: &ClaudeCredentials) -> Vec<ClaudeAuthMode> {
  let mut modes = Vec::new();

  if let Some(auth_token) = credentials
    .auth_token
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
  {
    modes.push(ClaudeAuthMode {
      kind: ClaudeAuthModeKind::Bearer,
      value: auth_token.to_string(),
      source: "auth_token",
    });
    return modes;
  }

  if let Some(api_key) = credentials
    .api_key
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
  {
    if credentials.auth_token.is_none() {
      if api_key.starts_with("sk-ant-") {
        modes.push(ClaudeAuthMode {
          kind: ClaudeAuthModeKind::ApiKey,
          value: api_key.to_string(),
          source: "api_key",
        });
        modes.push(ClaudeAuthMode {
          kind: ClaudeAuthModeKind::Bearer,
          value: api_key.to_string(),
          source: "api_key",
        });
      } else {
        modes.push(ClaudeAuthMode {
          kind: ClaudeAuthModeKind::Bearer,
          value: api_key.to_string(),
          source: "api_key",
        });
        modes.push(ClaudeAuthMode {
          kind: ClaudeAuthModeKind::ApiKey,
          value: api_key.to_string(),
          source: "api_key",
        });
      }
    } else {
      modes.push(ClaudeAuthMode {
        kind: ClaudeAuthModeKind::ApiKey,
        value: api_key.to_string(),
        source: "api_key",
      });
    }
  }

  modes
}

fn claude_auth_mode_label(mode: &ClaudeAuthMode) -> String {
  let kind = match mode.kind {
    ClaudeAuthModeKind::Bearer => "Bearer",
    ClaudeAuthModeKind::ApiKey => "ApiKey",
  };
  format!("{kind}({})", mode.source)
}

fn claude_debug_context(
  request_kind: &'static str,
  provider: &ProviderConfig,
  credentials: &ClaudeCredentials,
  endpoint: &str,
  selected_model: Option<&str>,
  api_model: Option<&str>,
  beta_headers: &[&str],
) -> ClaudeDebugContext {
  ClaudeDebugContext {
    request_kind,
    base_url: provider
      .base_url
      .as_deref()
      .map(str::trim)
      .filter(|value| !value.is_empty())
      .unwrap_or("https://api.anthropic.com")
      .to_string(),
    endpoint: endpoint.to_string(),
    auth_modes: claude_auth_modes(credentials)
      .iter()
      .map(claude_auth_mode_label)
      .collect(),
    selected_model: selected_model.unwrap_or("(none)").trim().to_string(),
    api_model: api_model.unwrap_or("(none)").trim().to_string(),
    beta_headers: beta_headers.iter().map(|item| (*item).to_string()).collect(),
  }
}

fn claude_debug_suffix(context: &ClaudeDebugContext) -> String {
  let auth_modes = if context.auth_modes.is_empty() {
    "(none)".to_string()
  } else {
    context.auth_modes.join(" -> ")
  };
  let beta_headers = if context.beta_headers.is_empty() {
    "(none)".to_string()
  } else {
    context.beta_headers.join(", ")
  };

  format!(
    "\n\nClaude diagnostics:\nrequest={}\nbaseUrl={}\nendpoint={}\nauthMode={}\nselectedModel={}\napiModel={}\nbeta={}",
    context.request_kind,
    context.base_url,
    context.endpoint,
    auth_modes,
    context.selected_model,
    context.api_model,
    beta_headers,
  )
}

fn apply_claude_default_headers(
  request: RequestBuilder,
  session_id: &str,
  beta_headers: &[String],
  include_anthropic_version: bool,
  accepts_sse: bool,
) -> RequestBuilder {
  let mut request = request
    .header("content-type", "application/json")
    .header("x-app", "cli")
    .header("user-agent", claude_user_agent())
    .header("x-claude-code-session-id", session_id)
    .header("x-anthropic-billing-header", claude_billing_header_value());

  if accepts_sse {
    request = request.header("accept", "text/event-stream");
  }
  if include_anthropic_version {
    request = request.header("anthropic-version", "2023-06-01");
  }
  if !beta_headers.is_empty() {
    request = request.header("anthropic-beta", beta_headers.join(","));
  }

  request
}

fn apply_claude_auth(
  request: RequestBuilder,
  auth_mode: &ClaudeAuthMode,
) -> RequestBuilder {
  match auth_mode.kind {
    ClaudeAuthModeKind::Bearer => {
      request.header("authorization", format!("Bearer {}", auth_mode.value))
    }
    ClaudeAuthModeKind::ApiKey => request.header("x-api-key", &auth_mode.value),
  }
}

fn claude_should_retry_status(status: StatusCode) -> bool {
  let code = status.as_u16();
  code == 429 || code >= 500
}

fn claude_is_auth_error(status: StatusCode, message: &str) -> bool {
  let code = status.as_u16();
  if code == 401 || code == 403 {
    return true;
  }
  if code != 400 {
    return false;
  }

  let lower = message.to_ascii_lowercase();
  ["auth", "token", "api key", "x-api-key", "authorization"]
    .iter()
    .any(|needle| lower.contains(needle))
}

fn claude_should_retry_transport_error(error: &reqwest::Error) -> bool {
  error.is_timeout() || error.is_connect() || error.is_request() || error.is_body()
}

fn claude_retry_delay_ms(attempt: usize) -> u64 {
  let multiplier = 1_u64 << attempt.saturating_sub(1).min(4);
  let base = (CLAUDE_BASE_DELAY_MS * multiplier).min(CLAUDE_MAX_DELAY_MS);
  let jitter = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .subsec_millis() as u64
    % 250;
  (base + jitter).min(CLAUDE_MAX_DELAY_MS)
}

fn claude_error_output(details: &ApiErrorDetails) -> String {
  if !details.body.trim().is_empty() {
    details.body.trim().to_string()
  } else {
    details.message.trim().to_string()
  }
}

fn build_http_client() -> Result<Client, String> {
  Client::builder()
    .connect_timeout(Duration::from_secs(HTTP_CONNECT_TIMEOUT_SECS))
    .timeout(Duration::from_secs(HTTP_REQUEST_TIMEOUT_SECS))
    .build()
    .map_err(|err| format!("failed to create HTTP client: {err}"))
}

fn build_vertex_http_client() -> Result<Client, String> {
  Client::builder()
    .connect_timeout(Duration::from_secs(VERTEX_HTTP_CONNECT_TIMEOUT_SECS))
    .timeout(Duration::from_secs(VERTEX_HTTP_REQUEST_TIMEOUT_SECS))
    .build()
    .map_err(|err| format!("failed to create Vertex HTTP client: {err}"))
}

fn normalize_vertex_project_id(raw: &str) -> String {
  let trimmed = raw.trim().trim_end_matches('/');
  trimmed
    .strip_prefix("projects/")
    .unwrap_or(trimmed)
    .trim()
    .to_string()
}

fn chain_transport_error(err: &reqwest::Error) -> String {
  let mut out = err.to_string();
  let mut src = err.source();
  let mut n = 0;
  while let Some(e) = src {
    out.push_str(" → ");
    out.push_str(&e.to_string());
    n += 1;
    if n >= 6 {
      break;
    }
    src = e.source();
  }
  out
}

fn vertex_generate_content_url(project_id: &str, location: &str, model: &str) -> String {
  let pid = normalize_vertex_project_id(project_id);
  let loc = location.trim();
  let m = model.trim();
  format!(
    "https://{loc}-aiplatform.googleapis.com/v1/projects/{pid}/locations/{loc}/publishers/google/models/{m}:generateContent"
  )
}

fn vertex_location(provider: &ProviderConfig) -> &str {
  provider
    .base_url
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or("us-central1")
}

fn gemini_generate_content_text(value: &Value) -> Result<String, String> {
  let text = value["candidates"]
    .as_array()
    .and_then(|items| items.first())
    .and_then(|item| item.get("content"))
    .and_then(|content| content.get("parts"))
    .and_then(Value::as_array)
    .map(|parts| {
      parts
        .iter()
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("")
    })
    .unwrap_or_default();

  if text.trim().is_empty() {
    Err("Gemini 返回了空内容".to_string())
  } else {
    Ok(text)
  }
}

fn gemini_generate_content_url(provider: &ProviderConfig, model: &str, api_key: &str) -> String {
  let raw = provider
    .base_url
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or("https://generativelanguage.googleapis.com");
  let trimmed = raw.trim_end_matches('/');
  if trimmed.ends_with("/v1beta") {
    format!("{trimmed}/models/{model}:generateContent?key={api_key}")
  } else {
    format!("{trimmed}/v1beta/models/{model}:generateContent?key={api_key}")
  }
}

fn model_or_default(provider: &ProviderConfig, fallback: &str) -> String {
  provider
    .models
    .first()
    .map(String::as_str)
    .unwrap_or(fallback)
    .to_string()
}

fn sanitize_title(raw: &str) -> String {
  let cleaned = raw.trim().trim_matches('"').trim_matches('\'').replace('\n', " ");
  let collapsed = cleaned
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ")
    .trim()
    .to_string();
  if collapsed.is_empty() {
    "New Chat".to_string()
  } else {
    collapsed
  }
}

fn extract_text_from_value(value: &Value) -> String {
  match value {
    Value::String(text) => text.clone(),
    Value::Array(items) => items
      .iter()
      .map(extract_text_from_value)
      .filter(|item| !item.is_empty())
      .collect::<Vec<_>>()
      .join(""),
    Value::Object(map) => {
      if let Some(text) = map.get("text").and_then(Value::as_str) {
        return text.to_string();
      }
      if let Some(content) = map.get("content") {
        return extract_text_from_value(content);
      }
      if let Some(output_text) = map.get("output_text").and_then(Value::as_str) {
        return output_text.to_string();
      }
      String::new()
    }
    _ => String::new(),
  }
}

fn extract_text_from_responses_output(value: &Value) -> String {
  if let Some(text) = value.get("output_text").and_then(Value::as_str) {
    if !text.trim().is_empty() {
      return text.to_string();
    }
  }

  value["output"]
    .as_array()
    .map(|items| {
      items
        .iter()
        .flat_map(|item| item.get("content").and_then(Value::as_array).into_iter().flatten())
        .map(extract_text_from_value)
        .filter(|item| !item.trim().is_empty())
        .collect::<Vec<_>>()
        .join("")
    })
    .unwrap_or_default()
}

fn extract_text_from_responses_sse(raw: &str) -> String {
  let mut streamed_text = String::new();
  let mut final_text = String::new();

  for line in raw.lines() {
    let trimmed = line.trim();
    if !trimmed.starts_with("data: ") {
      continue;
    }

    let data = trimmed.trim_start_matches("data: ").trim();
    if data.is_empty() || data == "[DONE]" {
      continue;
    }

    let Ok(value) = serde_json::from_str::<Value>(data) else {
      continue;
    };

    match value.get("type").and_then(Value::as_str) {
      Some("response.output_text.delta") => {
        if let Some(delta) = value.get("delta").and_then(Value::as_str) {
          streamed_text.push_str(delta);
        }
      }
      Some("response.output_text.done") => {
        if let Some(text) = value.get("text").and_then(Value::as_str) {
          final_text = text.to_string();
        }
      }
      Some("response.completed") => {
        if final_text.trim().is_empty() {
          if let Some(response) = value.get("response") {
            final_text = extract_text_from_responses_output(response);
          }
        }
      }
      _ => {}
    }
  }

  if final_text.trim().is_empty() {
    streamed_text
  } else {
    final_text
  }
}

fn extract_text_from_claude_response(value: &Value) -> String {
  value["content"]
    .as_array()
    .map(|items| {
      items
        .iter()
        .filter(|item| item.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|item| item.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("")
    })
    .unwrap_or_default()
}

fn apply_claude_sse_payload(data: &str, streamed_text: &mut String, final_text: &mut String) {
  if data.is_empty() || data == "[DONE]" {
    return;
  }

  let Ok(value) = serde_json::from_str::<Value>(data) else {
    return;
  };

  match value.get("type").and_then(Value::as_str) {
    Some("content_block_start") => {
      if let Some(content_block) = value.get("content_block") {
        streamed_text.push_str(&extract_text_from_value(content_block));
      }
    }
    Some("content_block_delta") => {
      if value.pointer("/delta/type").and_then(Value::as_str) == Some("text_delta") {
        if let Some(delta) = value.pointer("/delta/text").and_then(Value::as_str) {
          streamed_text.push_str(delta);
        }
      }
    }
    Some("message_start") => {
      if final_text.trim().is_empty() {
        if let Some(message) = value.get("message") {
          *final_text = extract_text_from_claude_response(message);
        }
      }
    }
    Some("message_delta") => {
      if final_text.trim().is_empty() {
        if let Some(message) = value.get("message") {
          *final_text = extract_text_from_claude_response(message);
        }
      }
    }
    _ => {}
  }
}

fn extract_text_from_claude_sse(raw: &str) -> String {
  let mut streamed_text = String::new();
  let mut final_text = String::new();
  let mut event_data = Vec::new();

  for line in raw.lines() {
    let trimmed = line.trim_end();
    if let Some(data) = trimmed.strip_prefix("data:") {
      event_data.push(data.trim_start().to_string());
      continue;
    }

    if trimmed.is_empty() && !event_data.is_empty() {
      apply_claude_sse_payload(
        &event_data.join("\n"),
        &mut streamed_text,
        &mut final_text,
      );
      event_data.clear();
    }
  }

  if !event_data.is_empty() {
    apply_claude_sse_payload(
      &event_data.join("\n"),
      &mut streamed_text,
      &mut final_text,
    );
  }

  if final_text.trim().is_empty() {
    streamed_text
  } else {
    final_text
  }
}

async fn api_error_details(response: Response) -> ApiErrorDetails {
  let status = response.status();
  let fallback = format!("request failed with status {status}");
  let Ok(body) = response.text().await else {
    return ApiErrorDetails {
      status,
      body: String::new(),
      message: fallback,
    };
  };

  let mut message = String::new();
  if let Ok(json) = serde_json::from_str::<Value>(&body) {
    let candidates = [
      json.pointer("/error/message").and_then(Value::as_str),
      json.pointer("/message").and_then(Value::as_str),
      json.pointer("/error/status").and_then(Value::as_str),
    ];
    for candidate in candidates.into_iter().flatten() {
      if !candidate.trim().is_empty() {
        message = candidate.trim().to_string();
        break;
      }
    }
  }

  if message.trim().is_empty() {
    message = if body.trim().is_empty() {
      fallback
    } else {
      body.trim().to_string()
    };
  }

  ApiErrorDetails {
    status,
    body,
    message,
  }
}

async fn api_error(response: Response) -> String {
  api_error_details(response).await.message
}

fn clarify_claude_error(message: String, context: &ClaudeDebugContext) -> String {
  let trimmed = message.trim();
  if trimmed.is_empty() {
    return format!("Claude request failed{}", claude_debug_suffix(context));
  }
  let lower = trimmed.to_ascii_lowercase();
  if lower.contains("new_api_panic")
    || lower.contains("nil pointer dereference")
    || lower.contains("panic detected")
  {
    return format!(
      "{}{}",
      concat!(
        "当前 Claude 1m 请求已经通过了本地配置与 1m 启用校验，",
        "但上游中转 new-api 在处理该请求时发生了内部崩溃（nil pointer dereference）。\n\n",
        "这说明问题已经不在桌面版模型选择、Base URL、API Key/Auth Token 或 1m 开关，",
        "而是在该中转自身的 Claude 兼容实现。"
      ),
      claude_debug_suffix(context)
    );
  }
  if lower.contains("service unavailable") {
    return format!(
      "{}{}",
      concat!(
        "当前 Claude 中转依赖官方 Claude Code 客户端能力，",
        "现有桌面版请求已按标准 Messages API 发送，但上游仍返回 Service Unavailable。\n\n",
        "这通常不是本地模型配置或接口地址填写错误，",
        "而是该中转只对官方客户端能力开放，或其上游服务当前不可用。"
      ),
      claude_debug_suffix(context)
    );
  }
  format!("{trimmed}{}", claude_debug_suffix(context))
}

async fn send_claude_json_with_retry(
  client: &Client,
  context: &ClaudeDebugContext,
  credentials: &ClaudeCredentials,
  body: &Value,
  include_anthropic_version: bool,
) -> Result<Value, String> {
  let session_id = claude_session_id();
  let auth_modes = claude_auth_modes(credentials);
  let mut last_error = None;

  for (auth_index, auth_mode) in auth_modes.iter().enumerate() {
    for attempt in 1..=(CLAUDE_MAX_RETRIES + 1) {
      let request = apply_claude_auth(
        apply_claude_default_headers(
          client.post(&context.endpoint),
          &session_id,
          &context.beta_headers,
          include_anthropic_version,
          false,
        ),
        auth_mode,
      );

      match request.json(body).send().await {
        Ok(response) => {
          if response.status().is_success() {
            return response
              .json::<Value>()
              .await
              .map_err(|err| format!("failed to parse Claude response: {err}"));
          }

          let details = api_error_details(response).await;
          let output = claude_error_output(&details);

          if claude_is_auth_error(details.status, &output) && auth_index + 1 < auth_modes.len() {
            last_error = Some(output);
            break;
          }

          if claude_should_retry_status(details.status) && attempt <= CLAUDE_MAX_RETRIES {
            last_error = Some(output);
            sleep(Duration::from_millis(claude_retry_delay_ms(attempt))).await;
            continue;
          }

          return Err(clarify_claude_error(output, context));
        }
        Err(err) => {
          let message = format!("Claude request failed: {err}");
          if claude_should_retry_transport_error(&err) && attempt <= CLAUDE_MAX_RETRIES {
            last_error = Some(message);
            sleep(Duration::from_millis(claude_retry_delay_ms(attempt))).await;
            continue;
          }
          return Err(clarify_claude_error(message, context));
        }
      }
    }
  }

  Err(clarify_claude_error(
    last_error.unwrap_or_else(|| "Claude request failed".to_string()),
    context,
  ))
}

async fn send_claude_text_with_retry(
  client: &Client,
  context: &ClaudeDebugContext,
  credentials: &ClaudeCredentials,
  body: &Value,
  include_anthropic_version: bool,
  accepts_sse: bool,
) -> Result<String, String> {
  let session_id = claude_session_id();
  let auth_modes = claude_auth_modes(credentials);
  let mut last_error = None;

  for (auth_index, auth_mode) in auth_modes.iter().enumerate() {
    for attempt in 1..=(CLAUDE_MAX_RETRIES + 1) {
      let request = apply_claude_auth(
        apply_claude_default_headers(
          client.post(&context.endpoint),
          &session_id,
          &context.beta_headers,
          include_anthropic_version,
          accepts_sse,
        ),
        auth_mode,
      );

      match request.json(body).send().await {
        Ok(response) => {
          if response.status().is_success() {
            return response
              .text()
              .await
              .map_err(|err| format!("failed to read Claude response: {err}"));
          }

          let details = api_error_details(response).await;
          let output = claude_error_output(&details);

          if claude_is_auth_error(details.status, &output) && auth_index + 1 < auth_modes.len() {
            last_error = Some(output);
            break;
          }

          if claude_should_retry_status(details.status) && attempt <= CLAUDE_MAX_RETRIES {
            last_error = Some(output);
            sleep(Duration::from_millis(claude_retry_delay_ms(attempt))).await;
            continue;
          }

          return Err(clarify_claude_error(output, context));
        }
        Err(err) => {
          let message = format!("Claude request failed: {err}");
          if claude_should_retry_transport_error(&err) && attempt <= CLAUDE_MAX_RETRIES {
            last_error = Some(message);
            sleep(Duration::from_millis(claude_retry_delay_ms(attempt))).await;
            continue;
          }
          return Err(clarify_claude_error(message, context));
        }
      }
    }
  }

  Err(clarify_claude_error(
    last_error.unwrap_or_else(|| "Claude request failed".to_string()),
    context,
  ))
}

fn extract_model_ids(value: &Value) -> Vec<String> {
  if let Some(items) = value.get("data").and_then(Value::as_array) {
    return items
      .iter()
      .filter_map(|item| item.get("id").and_then(Value::as_str))
      .map(str::trim)
      .filter(|item| !item.is_empty())
      .map(str::to_string)
      .collect();
  }

  if let Some(items) = value.as_array() {
    return items
      .iter()
      .filter_map(|item| {
        item
          .get("id")
          .and_then(Value::as_str)
          .or_else(|| item.as_str())
      })
      .map(str::trim)
      .filter(|item| !item.is_empty())
      .map(str::to_string)
      .collect();
  }

  Vec::new()
}

async fn fetch_claude_models(
  client: &Client,
  provider: &ProviderConfig,
  credentials: &ClaudeCredentials,
) -> Result<Vec<String>, String> {
  let url = claude_models_url(provider);
  let context = claude_debug_context(
    "fetch_models",
    provider,
    credentials,
    &url,
    None,
    None,
    &[],
  );
  let session_id = claude_session_id();
  let mut last_error = None;

  let auth_modes = claude_auth_modes(credentials);
  for (auth_index, auth_mode) in auth_modes.iter().enumerate() {
    let response = apply_claude_auth(
      apply_claude_default_headers(
        client.get(&url),
        &session_id,
        &context.beta_headers,
        true,
        false,
      ),
      auth_mode,
    )
    .send()
    .await
    .map_err(|err| format!("Claude model list request failed: {err}"))?;

    if response.status().is_success() {
      let value = response
        .json::<Value>()
        .await
        .map_err(|err| format!("failed to parse Claude model list: {err}"))?;

      let mut models = extract_model_ids(&value)
        .into_iter()
        .filter(|model| model.to_ascii_lowercase().starts_with("claude-"))
        .collect::<Vec<_>>();
      models.sort();
      models.dedup();
      return Ok(models);
    }

    let details = api_error_details(response).await;
    let output = claude_error_output(&details);
    last_error = Some(output.clone());

    if claude_is_auth_error(details.status, &output) && auth_index + 1 < 2 {
      continue;
    }

    return Err(clarify_claude_error(output, &context));
  }

  Err(clarify_claude_error(
    last_error.unwrap_or_else(|| "Claude model list request failed".to_string()),
    &context,
  ))
}

async fn fetch_openai_compatible_models(
  client: &Client,
  provider_id: &str,
  provider: &ProviderConfig,
  api_key: &str,
) -> Result<Vec<String>, String> {
  let response = client
    .get(openai_models_url(provider_id, provider)?)
    .header("authorization", format!("Bearer {api_key}"))
    .send()
    .await
    .map_err(|err| format!("model list request failed: {err}"))?;

  if !response.status().is_success() {
    return Err(api_error(response).await);
  }

  let value = response
    .json::<Value>()
    .await
    .map_err(|err| format!("failed to parse model list response: {err}"))?;

  let mut models = extract_model_ids(&value);
  models.sort();
  models.dedup();
  Ok(models)
}

async fn request_gemini(
  client: &Client,
  provider: &ProviderConfig,
  api_key: &str,
  model: &str,
  contents: Value,
) -> Result<String, String> {
  let url = gemini_generate_content_url(provider, model, api_key);
  let response = client
    .post(url)
    .json(&json!({
      "contents": contents,
    }))
    .send()
    .await
    .map_err(|err| format!("Gemini request failed: {err}"))?;

  if !response.status().is_success() {
    return Err(api_error(response).await);
  }

  let value = response
    .json::<Value>()
    .await
    .map_err(|err| format!("failed to parse Gemini response: {err}"))?;
  gemini_generate_content_text(&value)
}

/// 与 Vertex 官方计费路径一致：`…/v1/projects/{project}/locations/{loc}/publishers/google/models/{model}:generateContent`
const VERTEX_CLOUD_PLATFORM_SCOPE: &str = "https://www.googleapis.com/auth/cloud-platform";

async fn vertex_bearer_token(manual_token: &str) -> Result<String, String> {
  let trimmed = manual_token.trim();
  if !trimmed.is_empty() {
    return Ok(trimmed.to_string());
  }
  let provider = gcp_auth::provider().await.map_err(|err| {
    format!(
      "Vertex 本机认证失败（gcp_auth）: {err}。请设置 GOOGLE_APPLICATION_CREDENTIALS、执行 gcloud auth application-default login，或在设置中填写 OAuth 访问令牌。"
    )
  })?;
  let scopes = [VERTEX_CLOUD_PLATFORM_SCOPE];
  let token = provider.token(&scopes).await.map_err(|err| {
    format!("Vertex 获取 cloud-platform 令牌失败: {err}")
  })?;
  Ok(token.as_str().to_string())
}

async fn request_vertex_gemini(
  client: &Client,
  provider: &ProviderConfig,
  model: &str,
  contents: Value,
) -> Result<String, String> {
  let project_id = normalize_vertex_project_id(&provider.project_id);
  if project_id.is_empty() {
    return Err("请先在设置中填写 Vertex AI 的 GCP Project ID".to_string());
  }
  let bearer = vertex_bearer_token(&provider.api_key).await?;
  let location = vertex_location(provider);
  let url = vertex_generate_content_url(&project_id, location, model.trim());
  let response = client
    .post(url)
    .bearer_auth(bearer.trim())
    .json(&json!({
      "contents": contents,
    }))
    .send()
    .await
    .map_err(|err| {
      let detail = chain_transport_error(&err);
      let mut msg = format!("Vertex AI 连接失败（未收到 HTTP 响应）: {detail}");
      if err.is_timeout() || detail.contains("timed out") {
        msg.push_str(
          " 常见原因：本机无法在超时时间内连上 *.googleapis.com（跨境网络、运营商路由、防火墙）。可尝试稳定代理/VPN、更换网络，或在系统环境变量中配置 HTTPS_PROXY 后重开应用。",
        );
      } else if detail.contains("certificate") || detail.contains("Certificate") {
        msg.push_str(" 若为证书错误，请确认企业代理/杀毒未劫持 HTTPS，并已使用系统证书（本应用 reqwest 已启用 rustls-native-roots）。");
      }
      msg
    })?;

  if !response.status().is_success() {
    return Err(api_error(response).await);
  }

  let value = response
    .json::<Value>()
    .await
    .map_err(|err| format!("failed to parse Vertex AI response: {err}"))?;
  gemini_generate_content_text(&value).map_err(|_| {
    value
      .get("error")
      .and_then(|error| error.get("message").and_then(Value::as_str))
      .unwrap_or("Vertex AI 返回了空内容")
      .to_string()
  })
}

async fn chat_with_claude(
  client: &Client,
  provider: &ProviderConfig,
  credentials: &ClaudeCredentials,
  model: &str,
  system: Option<&str>,
  messages: Value,
  max_tokens: u32,
) -> Result<String, String> {
  let api_model = model.trim().to_string();
  let beta_headers = claude_beta_headers(model);

  if uses_claude_chat_completions_api(provider) {
    let context = claude_debug_context(
      "chat_completion",
      provider,
      credentials,
      &claude_chat_completions_url(provider),
      Some(model),
      Some(&api_model),
      &beta_headers,
    );
    let value = send_claude_json_with_retry(
      client,
      &context,
      credentials,
      &json!({
        "model": api_model,
        "messages": messages,
        "stream": false,
      }),
      false,
    )
    .await?;
    let text = value["choices"]
      .as_array()
      .and_then(|items| items.first())
      .and_then(|choice| choice.get("message"))
      .and_then(|message| message.get("content"))
      .map(extract_text_from_value)
      .unwrap_or_default();

    return if text.trim().is_empty() {
      Err("Claude 返回了空内容".to_string())
    } else {
      Ok(text)
    };
  }

  let body = claude_messages_body(&api_model, max_tokens, messages, system);
  let context = claude_debug_context(
    "messages",
    provider,
    credentials,
    &claude_messages_url(provider),
    Some(model),
    Some(&api_model),
    &beta_headers,
  );
  let raw = send_claude_text_with_retry(
    client,
    &context,
    credentials,
    &body,
    true,
    true,
  )
  .await?;
  let trimmed = raw.trim_start();
  let text = if trimmed.starts_with('{') {
    let value = serde_json::from_str::<Value>(&raw)
      .map_err(|err| format!("failed to parse Claude response: {err}"))?;
    extract_text_from_claude_response(&value)
  } else {
    extract_text_from_claude_sse(&raw)
  };

  if text.trim().is_empty() {
    Err("Claude 返回了空内容".to_string())
  } else {
    Ok(text)
  }
}

fn claude_messages_body(
  api_model: &str,
  max_tokens: u32,
  messages: Value,
  system: Option<&str>,
) -> Value {
  let mut body = json!({
    "model": api_model,
    "max_tokens": max_tokens,
    "messages": messages,
    "metadata": claude_metadata(),
    "stream": true,
    "temperature": 1
  });
  if let Some(system) = claude_system_blocks(system) {
    body["system"] = system;
  }

  body
}

async fn chat_with_openai_compatible(
  client: &Client,
  provider_id: &str,
  provider: &ProviderConfig,
  api_key: &str,
  model: &str,
  messages: Value,
  effort: Option<&str>,
) -> Result<String, String> {
  let using_responses_api = uses_responses_api(provider);
  let mut body = if using_responses_api {
    json!({
      "model": model,
      "input": messages,
      "stream": false,
    })
  } else {
    json!({
      "model": model,
      "messages": messages,
      "stream": false,
    })
  };

  if let Some(effort) = effort.filter(|value| !value.trim().is_empty()) {
    if using_responses_api {
      body["reasoning"] = json!({"effort": effort});
    } else {
      body["reasoning_effort"] = Value::String(effort.to_string());
    }
  }

  let url = if using_responses_api {
    openai_responses_url(provider_id, provider)?
  } else {
    openai_chat_url(provider_id, provider)?
  };

  let response = client
    .post(url)
    .header("content-type", "application/json")
    .header("authorization", format!("Bearer {api_key}"))
    .json(&body)
    .send()
    .await
    .map_err(|err| format!("OpenAI-compatible request failed: {err}"))?;

  if !response.status().is_success() {
    return Err(api_error(response).await);
  }

  let text = if using_responses_api {
    let raw = response
      .text()
      .await
      .map_err(|err| format!("failed to read Responses API payload: {err}"))?;
    let trimmed = raw.trim_start();
    if trimmed.starts_with('{') {
      let value = serde_json::from_str::<Value>(&raw)
        .map_err(|err| format!("failed to parse Responses API JSON payload: {err}"))?;
      extract_text_from_responses_output(&value)
    } else {
      extract_text_from_responses_sse(&raw)
    }
  } else {
    let value = response
      .json::<Value>()
      .await
      .map_err(|err| format!("failed to parse OpenAI-compatible response: {err}"))?;
    value["choices"]
      .as_array()
      .and_then(|items| items.first())
      .and_then(|choice| choice.get("message"))
      .and_then(|message| message.get("content"))
      .map(extract_text_from_value)
      .unwrap_or_default()
  };

  if text.trim().is_empty() {
    Err("模型返回了空内容".to_string())
  } else {
    Ok(text)
  }
}

fn gemini_messages(messages: &[crate::models::Message]) -> Value {
  Value::Array(
    messages
      .iter()
      .map(|message| {
        json!({
          "role": if message.role == "user" { "user" } else { "model" },
          "parts": [
            {
              "text": message.content
            }
          ]
        })
      })
      .collect(),
  )
}

fn openai_messages(messages: &[crate::models::Message]) -> Value {
  Value::Array(
    messages
      .iter()
      .map(|message| {
        json!({
          "role": message.role,
          "content": message.content,
        })
      })
      .collect(),
  )
}

fn claude_system_prompt(messages: &[crate::models::Message]) -> Option<String> {
  let system_messages = messages
    .iter()
    .filter(|message| message.role == "system")
    .map(|message| message.content.trim())
    .filter(|content| !content.is_empty())
    .collect::<Vec<_>>();

  if system_messages.is_empty() {
    None
  } else {
    Some(system_messages.join("\n\n"))
  }
}

fn claude_messages(messages: &[crate::models::Message]) -> Value {
  Value::Array(
    messages
      .iter()
      .filter(|message| message.role == "user" || message.role == "assistant")
      .map(|message| {
        json!({
          "role": message.role,
          "content": [{"type": "text", "text": message.content}],
        })
      })
      .collect(),
  )
}

fn responses_input_messages(messages: &[crate::models::Message]) -> Value {
  Value::Array(
    messages
      .iter()
      .map(|message| {
        json!({
          "role": message.role,
          "content": message.content,
        })
      })
      .collect(),
  )
}

fn text_prompt_for_title(first_message: &str) -> String {
  format!(
    "Generate a concise chat title in at most 5 words. Return only the title text.\n\nUser message: {}",
    first_message.trim()
  )
}

#[tauri::command]
pub async fn chat_completion(payload: ChatCompletionPayload) -> Result<String, String> {
  let (provider_id, provider) = active_provider(&payload.settings)?;
  let client = if provider_id == "vertex_ai" {
    build_vertex_http_client()?
  } else {
    build_http_client()?
  };

  match provider_id.as_str() {
    "gemini" => {
      let api_key = require_api_key(&provider)?;
      request_gemini(
        &client,
        &provider,
        &api_key,
        &payload.active_model,
        gemini_messages(&payload.messages),
      )
      .await
    }
    "vertex_ai" => {
      request_vertex_gemini(
        &client,
        &provider,
        &payload.active_model,
        gemini_messages(&payload.messages),
      )
      .await
    }
    "claude" => {
      if uses_claude_cli(&provider) {
        return crate::claude_cli::chat_with_claude_cli(
          &provider,
          &payload.active_model,
          &payload.messages,
        )
        .await;
      }
      let credentials = require_claude_credentials(&provider)?;
      let system = claude_system_prompt(&payload.messages);
      let messages = if uses_claude_chat_completions_api(&provider) {
        openai_messages(&payload.messages)
      } else {
        claude_messages(&payload.messages)
      };
      chat_with_claude(
        &client,
        &provider,
        &credentials,
        &payload.active_model,
        system.as_deref(),
        messages,
        4096,
      )
      .await
    }
    "openai" | "custom" => {
      let api_key = require_api_key(&provider)?;
      let messages = if uses_responses_api(&provider) {
        responses_input_messages(&payload.messages)
      } else {
        openai_messages(&payload.messages)
      };
      chat_with_openai_compatible(
        &client,
        &provider_id,
        &provider,
        &api_key,
        &payload.active_model,
        messages,
        payload.effort.as_deref(),
      )
      .await
    }
    _ => Err("未知的模型提供商".to_string()),
  }
}

#[tauri::command]
pub async fn generate_chat_title(payload: TitlePayload) -> Result<String, String> {
  let (provider_id, provider) = active_provider(&payload.settings)?;
  if provider_id == "claude" {
    if !uses_claude_cli(&provider)
      && provider.api_key.trim().is_empty()
      && provider.auth_token.trim().is_empty()
    {
      return Ok("New Chat".to_string());
    }
  } else if provider_id == "vertex_ai" {
    if provider.project_id.trim().is_empty() {
      return Ok("New Chat".to_string());
    }
  } else if provider.api_key.trim().is_empty() {
    return Ok("New Chat".to_string());
  }

  let client = if provider_id == "vertex_ai" {
    build_vertex_http_client()?
  } else {
    build_http_client()?
  };
  let prompt = text_prompt_for_title(&payload.first_message);
  let title = match provider_id.as_str() {
    "gemini" => {
      let api_key = provider.api_key.trim().to_string();
      let model = model_or_default(&provider, "gemini-2.5-flash");
      request_gemini(
        &client,
        &provider,
        &api_key,
        &model,
        Value::Array(vec![json!({
          "role": "user",
          "parts": [{ "text": prompt }],
        })]),
      )
      .await?
    }
    "vertex_ai" => {
      let model = model_or_default(&provider, "gemini-2.5-flash");
      request_vertex_gemini(
        &client,
        &provider,
        &model,
        Value::Array(vec![json!({
          "role": "user",
          "parts": [{ "text": prompt }],
        })]),
      )
      .await?
    }
    "claude" => {
      let model = model_or_default(&provider, "claude-3-5-sonnet-latest");
      if uses_claude_cli(&provider) {
        crate::claude_cli::title_with_claude_cli(&provider, &model, &prompt).await?
      } else {
        let credentials = require_claude_credentials(&provider)?;
        let title_messages = [crate::models::Message {
          id: "title-user".to_string(),
          role: "user".to_string(),
          content: prompt,
          timestamp: 0,
        }];
        chat_with_claude(
          &client,
          &provider,
          &credentials,
          &model,
          None,
          if uses_claude_chat_completions_api(&provider) {
            openai_messages(&title_messages)
          } else {
            claude_messages(&title_messages)
          },
          64,
        )
        .await?
      }
    }
    "openai" | "custom" => {
      let api_key = provider.api_key.trim().to_string();
      let model = model_or_default(&provider, "gpt-4o-mini");
      let messages = if uses_responses_api(&provider) {
        Value::Array(vec![json!({
          "role": "user",
          "content": prompt,
        })])
      } else {
        Value::Array(vec![json!({
          "role": "user",
          "content": prompt,
        })])
      };
      chat_with_openai_compatible(
        &client,
        &provider_id,
        &provider,
        &api_key,
        &model,
        messages,
        None,
      )
      .await?
    }
    _ => "New Chat".to_string(),
  };

  Ok(sanitize_title(&title))
}

#[tauri::command]
pub async fn fetch_provider_models(
  payload: FetchProviderModelsPayload,
) -> Result<FetchProviderModelsResponse, String> {
  let mut provider = payload
    .settings
    .providers
    .get(&payload.provider_id)
    .cloned()
    .ok_or_else(|| format!("unknown provider: {}", payload.provider_id))?;
  apply_runtime_local_provider_override(&payload.provider_id, &mut provider);
  let client = build_http_client()?;

  let models = match payload.provider_id.as_str() {
    "claude" => {
      let credentials = require_claude_credentials(&provider)?;
      fetch_claude_models(&client, &provider, &credentials).await?
    }
    "openai" | "custom" => {
      let api_key = require_api_key(&provider)?;
      fetch_openai_compatible_models(&client, &payload.provider_id, &provider, &api_key).await?
    }
    _ => return Err("当前提供商暂不支持远程模型探测".to_string()),
  };

  Ok(FetchProviderModelsResponse { models })
}

#[cfg(test)]
mod tests {
  use super::{
    claude_messages_body, claude_messages_url,
    claude_metadata_user_id, extract_model_ids, extract_text_from_claude_sse,
    extract_text_from_responses_sse,
  };
  use crate::models::ProviderConfig;
  use serde_json::json;

  #[test]
  fn extracts_text_from_responses_sse_stream() {
    let raw = r#"event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"O"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"K"}

event: response.output_text.done
data: {"type":"response.output_text.done","text":"OK"}
"#;

    assert_eq!(extract_text_from_responses_sse(raw), "OK".to_string());
  }

  #[test]
  fn extracts_text_from_claude_sse_stream() {
    let raw = r#"event: message_start
data: {"type":"message_start","message":{"content":[]}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}

event: message_stop
data: {"type":"message_stop"}
"#;

    assert_eq!(extract_text_from_claude_sse(raw), "Hello world".to_string());
  }

  #[test]
  fn extracts_model_ids_from_openai_style_payload() {
    let value = json!({
      "data": [
        {"id": "claude-3-5-sonnet-20241022"},
        {"id": "gpt-5.4"}
      ]
    });

    assert_eq!(
      extract_model_ids(&value),
      vec![
        "claude-3-5-sonnet-20241022".to_string(),
        "gpt-5.4".to_string()
      ]
    );
  }

  #[test]
  fn claude_messages_endpoint_has_no_beta_query() {
    let provider = ProviderConfig {
      id: "claude".to_string(),
      name: "Claude".to_string(),
      api_key: String::new(),
      project_id: String::new(),
      auth_token: String::new(),
      base_url: Some("https://example.com".to_string()),
      wire_api: None,
      enabled: true,
      models: Vec::new(),
    };

    assert_eq!(
      claude_messages_url(&provider),
      "https://example.com/v1/messages".to_string()
    );
  }

  #[test]
  fn claude_messages_body_uses_cli_compatible_shape() {
    let body = claude_messages_body(
      "claude-opus-4-7[1m]",
      4096,
      json!([{ "role": "user", "content": "hello world" }]),
      Some("system prompt"),
    );

    assert_eq!(body["model"], json!("claude-opus-4-7[1m]"));
    assert_eq!(
      body["system"][0]["text"],
      json!("You are Claude Code, Anthropic's official CLI for Claude.")
    );
    assert_eq!(body["system"][1]["text"], json!("system prompt"));
    assert_eq!(body["system"].as_array().map(|arr| arr.len()), Some(2));
    assert_eq!(body["stream"], json!(true));
    assert!(body.get("betas").is_none());
    assert!(body.get("thinking").is_none());
  }

  #[test]
  fn claude_metadata_user_id_matches_proxy_friendly_shape() {
    let user_id = claude_metadata_user_id();

    assert!(user_id.starts_with("user_"));
    assert!(user_id.contains("_account__session_"));
    let uuid = user_id
      .split("_account__session_")
      .nth(1)
      .expect("expected session uuid suffix");
    let parts = uuid.split('-').collect::<Vec<_>>();
    assert_eq!(parts.len(), 5);
    assert_eq!(parts[0].len(), 8);
    assert_eq!(parts[1].len(), 4);
    assert_eq!(parts[2].len(), 4);
    assert_eq!(parts[3].len(), 4);
    assert_eq!(parts[4].len(), 12);
  }
}
