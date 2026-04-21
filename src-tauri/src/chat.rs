use std::{
  env,
  error::Error,
  fs,
  path::Path,
  process,
  time::{Duration, SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::{Client, RequestBuilder, Response, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

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

fn uses_cli(provider: &ProviderConfig) -> bool {
  provider
    .wire_api
    .as_deref()
    .map(str::trim)
    .map(|value| value.eq_ignore_ascii_case("cli"))
    .unwrap_or(false)
}

fn uses_claude_cli_bridge(provider: &ProviderConfig) -> bool {
  provider
    .wire_api
    .as_deref()
    .map(str::trim)
    .map(|value| {
      value.eq_ignore_ascii_case("claude_cli") || value.eq_ignore_ascii_case("claude_bridge")
    })
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

fn claude_models_url(provider: &ProviderConfig) -> String {
  let root = claude_api_root(provider);
  if root.ends_with("/v1") {
    format!("{root}/models")
  } else {
    format!("{root}/v1/models")
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
  format!("{root}/chat/completions")
}

fn claude_beta_headers(_model: &str) -> Vec<&'static str> {
  Vec::new()
}

fn uses_claude_chat_completions_api(provider: &ProviderConfig) -> bool {
  provider
    .wire_api
    .as_deref()
    .map(str::trim)
    .map(|value| value.eq_ignore_ascii_case("chat_completions"))
    .unwrap_or(false)
}

fn claude_metadata_user_id() -> String {
  format!("user_{}_account__session_{}", process::id(), Uuid::new_v4())
}

fn claude_metadata() -> Value {
  json!({
    "user_id": claude_metadata_user_id(),
    "organization_id": "ccc-desktop",
    "user_type": "external",
    "device_id": "desktop",
    "account_uuid": "",
    "session_id": "desktop",
  })
}

fn claude_system_blocks(system: Option<&str>) -> Option<Value> {
  let mut blocks = vec![json!({
    "type": "text",
    "text": "You are Claude Code, Anthropic's official CLI for Claude."
  })];

  if let Some(system) = system.map(str::trim).filter(|value| !value.is_empty()) {
    blocks.push(json!({
      "type": "text",
      "text": system,
    }));
  }

  Some(Value::Array(blocks))
}

fn extract_text_from_claude_response(value: &Value) -> String {
  value["content"]
    .as_array()
    .map(|items| {
      items
        .iter()
        .filter_map(|item| item.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("")
    })
    .unwrap_or_default()
}

fn extract_text_from_claude_sse(raw: &str) -> String {
  let mut text = String::new();

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

    if value.get("type").and_then(Value::as_str) == Some("content_block_delta") {
      if let Some(delta) = value.get("delta") {
        if let Some(piece) = delta.get("text").and_then(Value::as_str) {
          text.push_str(piece);
        } else if let Some(piece) = delta.get("text_delta").and_then(Value::as_str) {
          text.push_str(piece);
        }
      }
    }
  }

  text
}

async fn send_claude_json_with_retry(
  _client: &Client,
  _context: &ClaudeDebugContext,
  _credentials: &ClaudeCredentials,
  _body: &Value,
  _include_anthropic_version: bool,
) -> Result<Value, String> {
  Err("Claude HTTP fallback is unavailable in this build".to_string())
}

async fn send_claude_text_with_retry(
  _client: &Client,
  _context: &ClaudeDebugContext,
  _credentials: &ClaudeCredentials,
  _body: &Value,
  _include_anthropic_version: bool,
  _accepts_sse: bool,
) -> Result<String, String> {
  Err("Claude HTTP fallback is unavailable in this build".to_string())
}

fn claude_billing_header_value() -> String {
  format!(
    "cc_version={CLAUDE_CLI_VERSION_WITH_FINGERPRINT}; cc_entrypoint={CLAUDE_CLI_ENTRYPOINT}; cch=00000;"
  )
}

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

struct VertexDebugContext {
  endpoint: String,
  project_id: String,
  location: String,
  selected_model: String,
  auth_mode: String,
  auth_source: Option<String>,
  token_uri: Option<String>,
  service_account_email: Option<String>,
  proxy_env: String,
}

struct VertexResolvedAuth {
  bearer: String,
  auth_mode: String,
  auth_source: Option<String>,
  token_uri: Option<String>,
  service_account_email: Option<String>,
  proxy_env: String,
}

#[derive(Deserialize)]
struct VertexServiceAccountCredentials {
  client_email: String,
  token_uri: String,
}

#[derive(Serialize)]
struct VertexServiceAccountJwtClaims<'a> {
  iss: &'a str,
  aud: &'a str,
  exp: u64,
  iat: u64,
  scope: String,
}

#[derive(Deserialize)]
struct VertexServiceAccountTokenResponse {
  access_token: String,
}

enum VertexServiceAccountSource {
  InlineJson,
  FilePath,
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

#[allow(dead_code)]
fn vertex_generate_content_url(project_id: &str, location: &str, model: &str) -> String {
  let pid = normalize_vertex_project_id(project_id);
  let loc = location.trim();
  let m = model.trim();
  format!(
    "https://{loc}-aiplatform.googleapis.com/v1/projects/{pid}/locations/{loc}/publishers/google/models/{m}:generateContent"
  )
}

#[allow(dead_code)]
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

fn normalize_vertex_location_safe(raw: &str) -> String {
  let trimmed = raw.trim().trim_end_matches('/');
  if trimmed.is_empty() {
    return "us-central1".to_string();
  }

  let without_scheme = trimmed
    .strip_prefix("https://")
    .or_else(|| trimmed.strip_prefix("http://"))
    .unwrap_or(trimmed);
  let host_or_region = without_scheme.split('/').next().unwrap_or(without_scheme).trim();
  let region = host_or_region
    .strip_suffix("-aiplatform.googleapis.com")
    .unwrap_or(host_or_region)
    .trim();

  if region.is_empty() {
    "us-central1".to_string()
  } else {
    region.to_string()
  }
}

fn vertex_stream_generate_content_url_safe(project_id: &str, location: &str, model: &str) -> String {
  let pid = normalize_vertex_project_id(project_id);
  let loc = normalize_vertex_location_safe(location);
  let m = model.trim();
  format!(
    "https://{loc}-aiplatform.googleapis.com/v1/projects/{pid}/locations/{loc}/publishers/google/models/{m}:streamGenerateContent"
  )
}

fn extract_gemini_candidate_text(value: &Value) -> String {
  value["candidates"]
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
    .unwrap_or_default()
}

fn collect_vertex_stream_text_safe(
  value: &Value,
  text: &mut String,
  first_error: &mut Option<String>,
) {
  match value {
    Value::Array(items) => {
      for item in items {
        collect_vertex_stream_text_safe(item, text, first_error);
      }
    }
    _ => {
      if first_error.is_none() {
        *first_error = value
          .get("error")
          .and_then(|error| error.get("message").and_then(Value::as_str))
          .map(str::to_string);
      }
      text.push_str(&extract_gemini_candidate_text(value));
    }
  }
}

fn parse_vertex_stream_text_safe(raw: &str) -> Result<String, String> {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return Err("Vertex returned an empty body".to_string());
  }

  let mut text = String::new();
  let mut first_error = None;

  if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
    collect_vertex_stream_text_safe(&value, &mut text, &mut first_error);
  } else {
    let stream = serde_json::Deserializer::from_str(trimmed).into_iter::<Value>();
    for item in stream {
      let value =
        item.map_err(|err| format!("failed to parse Vertex stream response: {err}"))?;
      collect_vertex_stream_text_safe(&value, &mut text, &mut first_error);
    }
  }

  let normalized = text.trim().to_string();
  if normalized.is_empty() {
    Err(first_error.unwrap_or_else(|| "Vertex returned empty content".to_string()))
  } else {
    Ok(normalized)
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

fn enhance_vertex_error_message_safe(api_message: &str) -> String {
  let lower = api_message.to_ascii_lowercase();
  if lower.contains("invalid authentication")
    || lower.contains("oauth 2 access token")
    || lower.contains("invalid credential")
    || lower.contains("unauthenticated")
  {
    return format!(
      "Vertex auth failed: {api_message}\n\nVertex REST requires an OAuth 2.0 Bearer token, not a Google AI Studio API key."
    );
  }
  api_message.to_string()
}

fn vertex_debug_suffix_safe(context: &VertexDebugContext) -> String {
  let mut lines = vec![
    "Vertex diagnostics:".to_string(),
    format!("endpoint={}", context.endpoint),
    format!("projectId={}", context.project_id),
    format!("location={}", context.location),
    format!("model={}", context.selected_model),
    format!("authMode={}", context.auth_mode),
    format!("proxyEnv={}", context.proxy_env),
  ];
  if let Some(auth_source) = context.auth_source.as_deref() {
    lines.push(format!("authSource={auth_source}"));
  }
  if let Some(token_uri) = context.token_uri.as_deref() {
    lines.push(format!("tokenUri={token_uri}"));
  }
  if let Some(service_account_email) = context.service_account_email.as_deref() {
    lines.push(format!("serviceAccountEmail={service_account_email}"));
  }
  format!("\n\n{}", lines.join("\n"))
}

fn clarify_vertex_error_safe(api_message: &str, context: &VertexDebugContext) -> String {
  format!(
    "{}{}",
    enhance_vertex_error_message_safe(api_message).trim(),
    vertex_debug_suffix_safe(context),
  )
}

fn vertex_proxy_env_summary() -> String {
  [
    "HTTPS_PROXY",
    "https_proxy",
    "HTTP_PROXY",
    "http_proxy",
    "ALL_PROXY",
    "all_proxy",
    "NO_PROXY",
    "no_proxy",
  ]
  .into_iter()
  .map(|name| match env::var(name) {
    Ok(value) if !value.trim().is_empty() => format!("{name}=set(len={})", value.trim().len()),
    _ => format!("{name}=unset"),
  })
  .collect::<Vec<_>>()
  .join(", ")
}

fn vertex_auth_debug_suffix(
  auth_mode: &str,
  auth_source: Option<&str>,
  token_uri: Option<&str>,
  service_account_email: Option<&str>,
  proxy_env: &str,
) -> String {
  let mut lines = vec![
    "Vertex auth diagnostics:".to_string(),
    format!("authMode={auth_mode}"),
    format!("proxyEnv={proxy_env}"),
  ];
  if let Some(auth_source) = auth_source.filter(|value| !value.is_empty()) {
    lines.push(format!("authSource={auth_source}"));
  }
  if let Some(token_uri) = token_uri.filter(|value| !value.is_empty()) {
    lines.push(format!("tokenUri={token_uri}"));
  }
  if let Some(service_account_email) = service_account_email.filter(|value| !value.is_empty()) {
    lines.push(format!("serviceAccountEmail={service_account_email}"));
  }
  format!("\n\n{}", lines.join("\n"))
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

#[allow(dead_code)]
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

#[allow(dead_code)]
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

const VERTEX_SERVICE_ACCOUNT_GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:jwt-bearer";

fn vertex_service_account_auth_mode(auth_token: &str, source: &VertexServiceAccountSource) -> String {
  let source = match source {
    VertexServiceAccountSource::InlineJson => "service_account_json",
    VertexServiceAccountSource::FilePath => "service_account_file",
  };
  if !auth_token.is_empty() {
    format!("{source}(authToken)")
  } else {
    format!("{source}(apiKey)")
  }
}

fn normalize_vertex_service_account_path(manual: &str) -> String {
  manual.trim().trim_matches('"').trim_matches('\'').to_string()
}

fn looks_like_vertex_service_account_path(manual: &str) -> bool {
  let normalized = normalize_vertex_service_account_path(manual);
  normalized.ends_with(".json") || normalized.contains('\\') || normalized.contains('/')
}

fn parse_vertex_service_account_credentials(
  raw: &str,
  label: &str,
) -> Result<VertexServiceAccountCredentials, String> {
  serde_json::from_str::<VertexServiceAccountCredentials>(raw)
    .map_err(|err| format!("Vertex {label} is invalid: {err}"))
}

fn build_vertex_service_account_jwt(
  credentials: &VertexServiceAccountCredentials,
  signer: &gcp_auth::Signer,
  scopes: &[&str],
) -> Result<String, String> {
  let iat = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();
  let claims = VertexServiceAccountJwtClaims {
    iss: &credentials.client_email,
    aud: &credentials.token_uri,
    exp: iat.saturating_add(3595),
    iat,
    scope: scopes.join(" "),
  };
  let header = URL_SAFE_NO_PAD.encode(r#"{"alg":"RS256","typ":"JWT"}"#);
  let claims_json = serde_json::to_vec(&claims)
    .map_err(|err| format!("Vertex service account claims serialization failed: {err}"))?;
  let claims = URL_SAFE_NO_PAD.encode(claims_json);
  let signing_input = format!("{header}.{claims}");
  let signature = signer
    .sign(signing_input.as_bytes())
    .map_err(|err| format!("Vertex service account JWT signing failed: {err}"))?;
  Ok(format!(
    "{signing_input}.{}",
    URL_SAFE_NO_PAD.encode(signature)
  ))
}

async fn fetch_vertex_service_account_bearer(
  client: &Client,
  credentials: &VertexServiceAccountCredentials,
  signer: &gcp_auth::Signer,
  scopes: &[&str],
  auth_mode: &str,
  auth_source: &str,
  proxy_env: &str,
) -> Result<String, String> {
  let jwt = build_vertex_service_account_jwt(credentials, signer, scopes)?;
  let response = client
    .post(credentials.token_uri.trim())
    .form(&[
      ("grant_type", VERTEX_SERVICE_ACCOUNT_GRANT_TYPE),
      ("assertion", jwt.as_str()),
    ])
    .send()
    .await
    .map_err(|err| {
      let detail = chain_transport_error(&err);
      let mut message = format!(
        "Vertex service account token fetch failed while connecting to {}: {}. The service account JSON/path was loaded successfully, so the failure happened while exchanging the signed JWT for an OAuth access token.",
        credentials.token_uri.trim(),
        detail
      );
      if err.is_timeout() || detail.contains("timed out") {
        message.push_str(
          " This usually means the desktop app cannot reach Google's OAuth endpoint in time. Check system proxy/VPN, DNS, firewall, or corporate network policy.",
        );
      } else if err.is_connect() || detail.contains("dns") || detail.contains("connect") {
        message.push_str(
          " This usually points to a proxy, DNS, firewall, or outbound network restriction rather than a bad JSON file.",
        );
      } else if detail.contains("certificate") || detail.contains("Certificate") {
        message.push_str(
          " Certificate interception may also cause this. Confirm the current network allows rustls/native-roots HTTPS traffic.",
        );
      }
      message.push_str(&vertex_auth_debug_suffix(
        auth_mode,
        Some(auth_source),
        Some(credentials.token_uri.trim()),
        Some(credentials.client_email.trim()),
        proxy_env,
      ));
      message
    })?;

  let status = response.status();
  let body = response
    .text()
    .await
    .unwrap_or_else(|err| format!("failed to read token endpoint body: {err}"));
  if !status.is_success() {
    let body = body.trim();
    let detail = if body.is_empty() { "<empty body>" } else { body };
    return Err(format!(
      "Vertex service account token fetch failed: HTTP {} from {}: {}. The service account JSON/path was loaded successfully, so the failure happened during OAuth token exchange.{}",
      status,
      credentials.token_uri.trim(),
      detail,
      vertex_auth_debug_suffix(
        auth_mode,
        Some(auth_source),
        Some(credentials.token_uri.trim()),
        Some(credentials.client_email.trim()),
        proxy_env,
      )
    ));
  }

  let parsed = serde_json::from_str::<VertexServiceAccountTokenResponse>(&body).map_err(|err| {
    format!(
      "Vertex service account token response parse failed: {}. Raw body: {}.{}",
      err,
      body.trim(),
      vertex_auth_debug_suffix(
        auth_mode,
        Some(auth_source),
        Some(credentials.token_uri.trim()),
        Some(credentials.client_email.trim()),
        proxy_env,
      )
    )
  })?;
  let access_token = parsed.access_token.trim();
  if access_token.is_empty() {
    return Err(format!(
      "Vertex service account token response did not include a usable access_token.{}",
      vertex_auth_debug_suffix(
        auth_mode,
        Some(auth_source),
        Some(credentials.token_uri.trim()),
        Some(credentials.client_email.trim()),
        proxy_env,
      )
    ));
  }
  Ok(access_token.to_string())
}

async fn resolve_vertex_auth_safe(
  client: &Client,
  provider: &ProviderConfig,
) -> Result<VertexResolvedAuth, String> {
  let auth_token = provider.auth_token.trim();
  let api_key = provider.api_key.trim();
  let manual = if !auth_token.is_empty() { auth_token } else { api_key };
  let scopes = [VERTEX_CLOUD_PLATFORM_SCOPE];
  let proxy_env = vertex_proxy_env_summary();

  if !manual.is_empty() {
    if manual.starts_with("AIza") {
      return Err(
        "Vertex requires an OAuth Bearer token. Google AI Studio API keys starting with AIza are not valid here."
          .to_string(),
      );
    }

    if manual.trim_start().starts_with('{') {
      let credentials = parse_vertex_service_account_credentials(manual, "service account JSON")?;
      let service_account = gcp_auth::CustomServiceAccount::from_json(manual)
        .map_err(|err| format!("Vertex service account JSON is invalid: {err}"))?;
      let auth_mode =
        vertex_service_account_auth_mode(auth_token, &VertexServiceAccountSource::InlineJson);
      let auth_source = if !auth_token.is_empty() {
        "inline_json(authToken)"
      } else {
        "inline_json(apiKey)"
      };
      let token = fetch_vertex_service_account_bearer(
        client,
        &credentials,
        service_account.signer(),
        &scopes,
        &auth_mode,
        auth_source,
        &proxy_env,
      )
      .await?;
      return Ok(VertexResolvedAuth {
        bearer: token,
        auth_mode,
        auth_source: Some(auth_source.to_string()),
        token_uri: Some(credentials.token_uri.trim().to_string()),
        service_account_email: Some(credentials.client_email.trim().to_string()),
        proxy_env,
      });
    }

    let manual_path = normalize_vertex_service_account_path(manual);
    if Path::new(&manual_path).is_file() {
      let file_contents = fs::read_to_string(&manual_path).map_err(|err| {
        format!("Vertex service account file could not be read: {err}")
      })?;
      let credentials =
        parse_vertex_service_account_credentials(&file_contents, "service account file")?;
      let service_account =
        gcp_auth::CustomServiceAccount::from_file(&manual_path).map_err(|err| {
          format!("Vertex service account file could not be loaded: {err}")
        })?;
      let auth_mode =
        vertex_service_account_auth_mode(auth_token, &VertexServiceAccountSource::FilePath);
      let auth_source = if !auth_token.is_empty() {
        "file_path(authToken)"
      } else {
        "file_path(apiKey)"
      };
      let token = fetch_vertex_service_account_bearer(
        client,
        &credentials,
        service_account.signer(),
        &scopes,
        &auth_mode,
        auth_source,
        &proxy_env,
      )
      .await?;
      return Ok(VertexResolvedAuth {
        bearer: token,
        auth_mode,
        auth_source: Some(auth_source.to_string()),
        token_uri: Some(credentials.token_uri.trim().to_string()),
        service_account_email: Some(credentials.client_email.trim().to_string()),
        proxy_env,
      });
    }
    if looks_like_vertex_service_account_path(manual) {
      return Err(format!(
        "Vertex service account file was not found: {}.{}",
        manual_path,
        vertex_auth_debug_suffix(
          if !auth_token.is_empty() {
            "service_account_file(authToken)"
          } else {
            "service_account_file(apiKey)"
          },
          Some(if !auth_token.is_empty() {
            "file_path(authToken)"
          } else {
            "file_path(apiKey)"
          }),
          None,
          None,
          &proxy_env,
        )
      ));
    }

    return Ok(VertexResolvedAuth {
      bearer: manual.to_string(),
      auth_mode: if !auth_token.is_empty() {
        "manual_bearer(authToken)".to_string()
      } else {
        "manual_bearer(apiKey)".to_string()
      },
      auth_source: None,
      token_uri: None,
      service_account_email: None,
      proxy_env,
    });
  }

  let provider = gcp_auth::provider()
    .await
    .map_err(|err| {
      format!(
        "Vertex local auth init failed: {err}. Provide an OAuth Bearer token, a service account JSON path/JSON content, set GOOGLE_APPLICATION_CREDENTIALS, or run `gcloud auth application-default login`.{}",
        vertex_auth_debug_suffix("adc(gcp_auth provider)", Some("local_provider_chain"), None, None, &proxy_env)
      )
    })?;
  let token = provider
    .token(&scopes)
    .await
    .map_err(|err| {
      format!(
        "Vertex access token fetch failed: {err}. If you are not using ADC, enter an OAuth Bearer token or a service account JSON path/JSON content in settings.{}",
        vertex_auth_debug_suffix("adc(gcp_auth provider)", Some("local_provider_chain"), None, None, &proxy_env)
      )
    })?;

  Ok(VertexResolvedAuth {
    bearer: token.as_str().to_string(),
    auth_mode: "adc(gcp_auth provider)".to_string(),
    auth_source: Some("local_provider_chain".to_string()),
    token_uri: None,
    service_account_email: None,
    proxy_env,
  })
}

async fn request_vertex_gemini_stream(
  client: &Client,
  provider: &ProviderConfig,
  model: &str,
  contents: Value,
) -> Result<String, String> {
  let project_id = normalize_vertex_project_id(&provider.project_id);
  if project_id.is_empty() {
    return Err("Vertex project_id is required".to_string());
  }

  let auth = resolve_vertex_auth_safe(client, provider).await?;
  let location = normalize_vertex_location_safe(provider.base_url.as_deref().unwrap_or("us-central1"));
  let url = vertex_stream_generate_content_url_safe(&project_id, &location, model.trim());
  let context = VertexDebugContext {
    endpoint: url.clone(),
    project_id: project_id.clone(),
    location: location.clone(),
    selected_model: model.trim().to_string(),
    auth_mode: auth.auth_mode.clone(),
    auth_source: auth.auth_source.clone(),
    token_uri: auth.token_uri.clone(),
    service_account_email: auth.service_account_email.clone(),
    proxy_env: auth.proxy_env.clone(),
  };

  let response = client
    .post(&url)
    .bearer_auth(auth.bearer.trim())
    .json(&json!({ "contents": contents }))
    .send()
    .await
    .map_err(|err| {
      let detail = chain_transport_error(&err);
      clarify_vertex_error_safe(
        &format!("Vertex request failed before HTTP response: {detail}"),
        &context,
      )
    })?;

  if !response.status().is_success() {
    let msg = api_error(response).await;
    return Err(clarify_vertex_error_safe(&msg, &context));
  }

  let raw = response
    .text()
    .await
    .map_err(|err| clarify_vertex_error_safe(&format!("failed to read Vertex response: {err}"), &context))?;

  parse_vertex_stream_text_safe(&raw)
    .map_err(|message| clarify_vertex_error_safe(&message, &context))
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
      if uses_cli(&provider) {
        return crate::gemini_cli::chat_with_gemini_cli(
          &provider,
          &payload.active_model,
          &payload.messages,
          payload.workspace.as_deref(),
        )
        .await;
      }
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
      request_vertex_gemini_stream(
        &client,
        &provider,
        &payload.active_model,
        gemini_messages(&payload.messages),
      )
      .await
    }
    "claude" => {
      crate::claude_cli::chat_with_claude_cli(
        &provider,
        &payload.active_model,
        &payload.messages,
        payload.workspace.as_deref(),
      )
      .await
    }
    "openai" => {
      crate::codex_cli::chat_with_codex_cli(
        &provider,
        &payload.active_model,
        &payload.messages,
        payload.workspace.as_deref(),
      )
      .await
    }
    "custom" => {
      if uses_claude_cli_bridge(&provider) {
        return crate::openai_compatible_claude_cli::chat_with_openai_compatible_claude_cli(
          &provider,
          &payload.active_model,
          &payload.messages,
          payload.workspace.as_deref(),
        )
        .await;
      }
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
  if provider_id == "gemini" {
    if !uses_cli(&provider) && provider.api_key.trim().is_empty() {
      return Ok("New Chat".to_string());
    }
  } else if provider_id == "custom" {
    let has_base_url = provider
      .base_url
      .as_deref()
      .map(str::trim)
      .map(|value| !value.is_empty())
      .unwrap_or(false);
    if uses_claude_cli_bridge(&provider) {
      if !has_base_url {
        return Ok("New Chat".to_string());
      }
    } else if provider.api_key.trim().is_empty() {
      return Ok("New Chat".to_string());
    }
  } else if provider_id == "vertex_ai" {
    if provider.project_id.trim().is_empty() {
      return Ok("New Chat".to_string());
    }
  } else if provider_id != "claude" && provider_id != "openai" && provider.api_key.trim().is_empty() {
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
      if uses_cli(&provider) {
        let model = model_or_default(&provider, "gemini-2.5-flash");
        crate::gemini_cli::title_with_gemini_cli(&provider, &model, &prompt).await?
      } else {
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
    }
    "vertex_ai" => {
      let model = model_or_default(&provider, "gemini-2.5-flash");
      request_vertex_gemini_stream(
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
      crate::claude_cli::title_with_claude_cli(&provider, &model, &prompt).await?
    }
    "openai" => {
      let model = model_or_default(&provider, "gpt-4o-mini");
      crate::codex_cli::title_with_codex_cli(&provider, &model, &prompt).await?
    }
    "custom" => {
      let model = model_or_default(&provider, "gpt-4o-mini");
      if uses_claude_cli_bridge(&provider) {
        crate::openai_compatible_claude_cli::title_with_openai_compatible_claude_cli(
          &provider,
          &model,
          &prompt,
        )
        .await?
      } else {
      let api_key = provider.api_key.trim().to_string();
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
    extract_text_from_responses_sse, parse_vertex_stream_text_safe,
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
  fn extracts_text_from_vertex_stream_array_payload() {
    let raw = r#"[
      {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]},
      {"candidates":[{"content":{"parts":[{"text":" world"}]}}]}
    ]"#;

    assert_eq!(
      parse_vertex_stream_text_safe(raw).unwrap(),
      "Hello world".to_string()
    );
  }

  #[test]
  fn extracts_text_from_vertex_stream_concatenated_objects() {
    let raw = r#"{"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}
{"candidates":[{"content":{"parts":[{"text":" world"}]}}]}"#;

    assert_eq!(
      parse_vertex_stream_text_safe(raw).unwrap(),
      "Hello world".to_string()
    );
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
