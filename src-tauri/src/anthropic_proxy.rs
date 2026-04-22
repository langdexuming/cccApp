use std::{collections::HashMap, convert::Infallible, sync::Arc};

use axum::{
  extract::State,
  http::{HeaderMap, StatusCode},
  response::{
    sse::{Event, KeepAlive},
    IntoResponse, Response, Sse,
  },
  routing::post,
  Json, Router,
};
use futures_util::{Stream, StreamExt};
use reqwest::Client;
use serde_json::{json, Map, Value};
use tokio::{net::TcpListener, sync::oneshot, task::JoinHandle};
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct ProxyConfig {
  pub upstream_base_url: String,
  pub upstream_api_key: String,
  pub forced_model: String,
  /// Optional extra headers to forward (e.g. custom auth schemes).
  #[allow(dead_code)]
  pub extra_headers: Vec<(String, String)>,
}

#[derive(Clone)]
struct AppState {
  config: Arc<ProxyConfig>,
  http: Client,
}

pub struct ProxyHandle {
  pub base_url: String,
  pub auth_token: String,
  shutdown: Option<oneshot::Sender<()>>,
  join: Option<JoinHandle<()>>,
}

impl ProxyHandle {
  pub async fn shutdown(mut self) {
    if let Some(tx) = self.shutdown.take() {
      let _ = tx.send(());
    }
    if let Some(join) = self.join.take() {
      let _ = join.await;
    }
  }
}

impl Drop for ProxyHandle {
  fn drop(&mut self) {
    if let Some(tx) = self.shutdown.take() {
      let _ = tx.send(());
    }
  }
}

pub async fn start_proxy(config: ProxyConfig) -> Result<ProxyHandle, String> {
  let listener = TcpListener::bind("127.0.0.1:0")
    .await
    .map_err(|err| format!("bind local anthropic proxy failed: {err}"))?;
  let addr = listener
    .local_addr()
    .map_err(|err| format!("resolve local anthropic proxy addr failed: {err}"))?;

  let auth_token = format!("ccc-proxy-{}", Uuid::new_v4());
  let http = Client::builder()
    .timeout(std::time::Duration::from_secs(300))
    .connect_timeout(std::time::Duration::from_secs(30))
    .build()
    .map_err(|err| format!("build anthropic proxy http client failed: {err}"))?;

  let state = AppState {
    config: Arc::new(config),
    http,
  };

  let app = Router::new()
    .route("/v1/messages", post(handle_messages))
    .route("/v1/messages/count_tokens", post(handle_count_tokens))
    .with_state(state);

  let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
  let join = tokio::spawn(async move {
    let _ = axum::serve(listener, app)
      .with_graceful_shutdown(async move {
        let _ = shutdown_rx.await;
      })
      .await;
  });

  Ok(ProxyHandle {
    base_url: format!("http://{addr}"),
    auth_token,
    shutdown: Some(shutdown_tx),
    join: Some(join),
  })
}

async fn handle_count_tokens(
  State(_state): State<AppState>,
  Json(_body): Json<Value>,
) -> Response {
  Json(json!({"input_tokens": 0})).into_response()
}

async fn handle_messages(
  State(state): State<AppState>,
  _headers: HeaderMap,
  Json(body): Json<Value>,
) -> Response {
  let want_stream = body.get("stream").and_then(Value::as_bool).unwrap_or(true);
  let cli_model = body
    .get("model")
    .and_then(Value::as_str)
    .map(str::to_string)
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| state.config.forced_model.clone());
  let openai_body = translate_request(&body, &state.config.forced_model);
  let upstream_url = build_upstream_url(&state.config.upstream_base_url);

  log::info!("[anthropic-proxy] forwarding to upstream: {upstream_url} model={}", state.config.forced_model);

  let mut req = state
    .http
    .post(&upstream_url)
    .header("authorization", format!("Bearer {}", state.config.upstream_api_key))
    .header("content-type", "application/json");
  for (k, v) in &state.config.extra_headers {
    req = req.header(k.as_str(), v.as_str());
  }
  let response = match req
    .json(&openai_body)
    .send()
    .await
  {
    Ok(r) => r,
    Err(err) => {
      return build_error_response(
        StatusCode::BAD_GATEWAY,
        "api_error",
        &format!("upstream request failed: {err}"),
      )
    }
  };

  let upstream_status = response.status();
  if !upstream_status.is_success() {
    let body_text = response.text().await.unwrap_or_default();
    log::warn!("[anthropic-proxy] upstream error {upstream_status}: {body_text}");
    let error_type = map_error_type(upstream_status);
    return build_error_response(to_axum_status(upstream_status), error_type, &body_text);
  }

  if want_stream {
    let model = cli_model.clone();
    let content_type = response
      .headers()
      .get("content-type")
      .and_then(|v| v.to_str().ok())
      .unwrap_or("")
      .to_ascii_lowercase();
    // Many OpenAI-compatible APIs use text/event-stream, but some use
    // application/octet-stream, text/plain, or other content types for SSE.
    // Treat anything that is NOT obviously JSON as a potential SSE stream.
    let looks_like_sse = content_type.contains("text/event-stream")
      || content_type.contains("octet-stream")
      || (!content_type.contains("application/json") && !content_type.is_empty());
    if looks_like_sse {
      let sse_stream = translate_openai_sse_stream(response, model);
      Sse::new(sse_stream)
        .keep_alive(KeepAlive::default())
        .into_response()
    } else {
      let openai_value: Value = match response.json().await {
        Ok(v) => v,
        Err(err) => {
          return build_error_response(
            StatusCode::BAD_GATEWAY,
            "api_error",
            &format!(
              "upstream returned non-SSE body but it failed to parse as JSON: {err}"
            ),
          )
        }
      };
      let sse_stream = synthesize_sse_from_openai_json(openai_value, model);
      Sse::new(sse_stream)
        .keep_alive(KeepAlive::default())
        .into_response()
    }
  } else {
    let openai_value: Value = match response.json().await {
      Ok(v) => v,
      Err(err) => {
        return build_error_response(
          StatusCode::BAD_GATEWAY,
          "api_error",
          &format!("parse upstream response failed: {err}"),
        )
      }
    };
    let anthropic = translate_response_json(&openai_value, &cli_model);
    Json(anthropic).into_response()
  }
}

fn to_axum_status(status: reqwest::StatusCode) -> StatusCode {
  StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY)
}

fn map_error_type(status: reqwest::StatusCode) -> &'static str {
  match status.as_u16() {
    401 => "authentication_error",
    403 => "permission_error",
    404 => "not_found_error",
    429 => "rate_limit_error",
    400..=499 => "invalid_request_error",
    500..=599 => "api_error",
    _ => "api_error",
  }
}

fn build_error_response(status: StatusCode, error_type: &str, message: &str) -> Response {
  let body = json!({
    "type":"error",
    "error": {"type": error_type, "message": message},
  });
  (status, Json(body)).into_response()
}

// --- Request translation ----------------------------------------------------

/// Build the upstream /chat/completions URL, handling various base URL formats.
fn build_upstream_url(base_url: &str) -> String {
  let trimmed = base_url.trim().trim_end_matches('/');
  // If the URL already ends with /chat/completions, use as-is
  if trimmed.ends_with("/chat/completions") {
    return trimmed.to_string();
  }
  // If the URL ends with /v1, append /chat/completions
  if trimmed.ends_with("/v1") {
    return format!("{trimmed}/chat/completions");
  }
  // Otherwise append /chat/completions directly
  format!("{trimmed}/chat/completions")
}

pub(crate) fn translate_request(anthropic: &Value, forced_model: &str) -> Value {
  let mut openai = Map::new();
  openai.insert("model".into(), json!(forced_model));

  let mut messages: Vec<Value> = Vec::new();

  if let Some(sys) = anthropic.get("system") {
    if let Some(text) = flatten_system(sys) {
      messages.push(json!({"role":"system","content": text}));
    }
  }

  if let Some(arr) = anthropic.get("messages").and_then(Value::as_array) {
    for msg in arr {
      translate_message(msg, &mut messages);
    }
  }
  openai.insert("messages".into(), Value::Array(messages));

  if let Some(tools) = anthropic.get("tools").and_then(Value::as_array) {
    let translated: Vec<Value> = tools.iter().map(translate_tool).collect();
    if !translated.is_empty() {
      openai.insert("tools".into(), Value::Array(translated));
    }
  }

  if let Some(tc) = anthropic.get("tool_choice") {
    if let Some(translated) = translate_tool_choice(tc) {
      openai.insert("tool_choice".into(), translated);
    }
  }

  for (src, dst) in [
    ("max_tokens", "max_tokens"),
    ("temperature", "temperature"),
    ("top_p", "top_p"),
    ("stream", "stream"),
  ] {
    if let Some(v) = anthropic.get(src) {
      openai.insert(dst.into(), v.clone());
    }
  }

  // Ask upstream to include usage stats in the streaming response
  if anthropic.get("stream").and_then(Value::as_bool).unwrap_or(false) {
    openai.insert(
      "stream_options".into(),
      json!({"include_usage": true}),
    );
  }

  if let Some(stop) = anthropic.get("stop_sequences") {
    openai.insert("stop".into(), stop.clone());
  }

  Value::Object(openai)
}

fn flatten_system(sys: &Value) -> Option<String> {
  match sys {
    Value::String(s) => {
      let trimmed = s.trim();
      if trimmed.is_empty() {
        None
      } else {
        Some(s.clone())
      }
    }
    Value::Array(arr) => {
      let mut parts: Vec<String> = Vec::new();
      for item in arr {
        if let Some(text) = item.get("text").and_then(Value::as_str) {
          if !text.is_empty() {
            parts.push(text.to_string());
          }
        }
      }
      if parts.is_empty() {
        None
      } else {
        Some(parts.join("\n\n"))
      }
    }
    _ => None,
  }
}

fn translate_message(msg: &Value, out: &mut Vec<Value>) {
  let role = msg.get("role").and_then(Value::as_str).unwrap_or("user");
  let Some(content) = msg.get("content") else {
    return;
  };

  match content {
    Value::String(s) => {
      out.push(json!({"role": role, "content": s}));
    }
    Value::Array(blocks) => {
      let mut text_buf = String::new();
      let mut tool_calls: Vec<Value> = Vec::new();

      for block in blocks {
        let block_type = block.get("type").and_then(Value::as_str).unwrap_or("");
        match block_type {
          "text" => {
            if let Some(t) = block.get("text").and_then(Value::as_str) {
              if !text_buf.is_empty() {
                text_buf.push('\n');
              }
              text_buf.push_str(t);
            }
          }
          "tool_use" => {
            let id = block.get("id").and_then(Value::as_str).unwrap_or("").to_string();
            let name = block
              .get("name")
              .and_then(Value::as_str)
              .unwrap_or("")
              .to_string();
            let input = block.get("input").cloned().unwrap_or(json!({}));
            let args = serde_json::to_string(&input).unwrap_or_else(|_| "{}".to_string());
            tool_calls.push(json!({
              "id": id,
              "type": "function",
              "function": {"name": name, "arguments": args},
            }));
          }
          // Skip thinking/reasoning blocks — they have no equivalent in the
          // OpenAI chat/completions format and should not be forwarded.
          "thinking" | "redacted_thinking" | "reasoning" => {}
          "tool_result" => {
            if !text_buf.is_empty() || !tool_calls.is_empty() {
              out.push(build_role_message(role, &mut text_buf, &mut tool_calls));
            }
            let tool_use_id = block
              .get("tool_use_id")
              .and_then(Value::as_str)
              .unwrap_or("")
              .to_string();
            let content_text = stringify_tool_result_content(block.get("content"));
            out.push(json!({
              "role": "tool",
              "tool_call_id": tool_use_id,
              "content": content_text,
            }));
          }
          _ => {}
        }
      }

      if !text_buf.is_empty() || !tool_calls.is_empty() {
        out.push(build_role_message(role, &mut text_buf, &mut tool_calls));
      }
    }
    _ => {}
  }
}

fn build_role_message(role: &str, text_buf: &mut String, tool_calls: &mut Vec<Value>) -> Value {
  let mut m = Map::new();
  m.insert("role".into(), Value::String(role.to_string()));
  if !text_buf.is_empty() {
    m.insert("content".into(), Value::String(std::mem::take(text_buf)));
  } else {
    m.insert("content".into(), Value::Null);
  }
  if !tool_calls.is_empty() {
    m.insert(
      "tool_calls".into(),
      Value::Array(std::mem::take(tool_calls)),
    );
  }
  Value::Object(m)
}

fn stringify_tool_result_content(content: Option<&Value>) -> String {
  match content {
    None => String::new(),
    Some(Value::String(s)) => s.clone(),
    Some(Value::Array(arr)) => {
      let mut parts: Vec<String> = Vec::new();
      for item in arr {
        if let Some(text) = item.get("text").and_then(Value::as_str) {
          parts.push(text.to_string());
        } else {
          parts.push(item.to_string());
        }
      }
      parts.join("\n")
    }
    Some(other) => other.to_string(),
  }
}

fn translate_tool(tool: &Value) -> Value {
  let name = tool.get("name").cloned().unwrap_or_default();
  let description = tool.get("description").cloned().unwrap_or_default();
  let parameters = tool
    .get("input_schema")
    .cloned()
    .unwrap_or_else(|| json!({"type":"object","properties":{}}));
  json!({
    "type":"function",
    "function": {
      "name": name,
      "description": description,
      "parameters": parameters,
    }
  })
}

fn translate_tool_choice(choice: &Value) -> Option<Value> {
  let type_ = choice.get("type").and_then(Value::as_str)?;
  match type_ {
    "auto" => Some(json!("auto")),
    "any" => Some(json!("required")),
    "none" => Some(json!("none")),
    "tool" => {
      let name = choice.get("name").cloned().unwrap_or_default();
      Some(json!({"type":"function","function":{"name": name}}))
    }
    _ => None,
  }
}

// --- Response translation (non-stream) --------------------------------------

pub(crate) fn translate_response_json(openai: &Value, model: &str) -> Value {
  let choice = openai
    .get("choices")
    .and_then(Value::as_array)
    .and_then(|a| a.first());
  let message = choice.and_then(|c| c.get("message"));

  let mut content_blocks: Vec<Value> = Vec::new();
  if let Some(text) = message
    .and_then(|m| m.get("content"))
    .and_then(Value::as_str)
  {
    if !text.is_empty() {
      content_blocks.push(json!({"type":"text","text": text}));
    }
  }
  if let Some(tool_calls) = message
    .and_then(|m| m.get("tool_calls"))
    .and_then(Value::as_array)
  {
    for tc in tool_calls {
      let id = tc.get("id").and_then(Value::as_str).unwrap_or("").to_string();
      let name = tc
        .get("function")
        .and_then(|f| f.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
      let args_str = tc
        .get("function")
        .and_then(|f| f.get("arguments"))
        .and_then(Value::as_str)
        .unwrap_or("{}");
      let input: Value = serde_json::from_str(args_str).unwrap_or(json!({}));
      content_blocks.push(json!({"type":"tool_use","id": id, "name": name, "input": input}));
    }
  }

  let finish = choice
    .and_then(|c| c.get("finish_reason"))
    .and_then(Value::as_str)
    .unwrap_or("stop");
  let stop_reason = map_finish_reason(finish);

  let usage = openai.get("usage");
  let input_tokens = usage
    .and_then(|u| u.get("prompt_tokens"))
    .and_then(Value::as_u64)
    .unwrap_or(0);
  let output_tokens = usage
    .and_then(|u| u.get("completion_tokens"))
    .and_then(Value::as_u64)
    .unwrap_or(0);

  json!({
    "id": format!("msg_{}", Uuid::new_v4().simple()),
    "type": "message",
    "role": "assistant",
    "model": model,
    "content": content_blocks,
    "stop_reason": stop_reason,
    "stop_sequence": Value::Null,
    "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
  })
}

fn map_finish_reason(reason: &str) -> &'static str {
  match reason {
    "stop" => "end_turn",
    "length" => "max_tokens",
    "tool_calls" => "tool_use",
    "content_filter" => "stop_sequence",
    _ => "end_turn",
  }
}

// --- SSE translation --------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BlockKind {
  Text,
  ToolUse,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct EmittedEvent {
  pub(crate) event: String,
  pub(crate) data: Value,
}

impl EmittedEvent {
  fn to_sse(&self) -> Event {
    Event::default()
      .event(self.event.clone())
      .data(self.data.to_string())
  }
}

#[derive(Debug)]
pub(crate) struct SseTranslator {
  model: String,
  message_id: String,
  emitted_message_start: bool,
  next_block_idx: u64,
  current_block: Option<(u64, BlockKind)>,
  tool_call_idx_to_block: HashMap<u64, u64>,
  input_tokens: u64,
  output_tokens: u64,
  stop_reason: Option<String>,
  finished: bool,
}

impl SseTranslator {
  pub(crate) fn new(model: String) -> Self {
    Self {
      model,
      message_id: format!("msg_{}", Uuid::new_v4().simple()),
      emitted_message_start: false,
      next_block_idx: 0,
      current_block: None,
      tool_call_idx_to_block: HashMap::new(),
      input_tokens: 0,
      output_tokens: 0,
      stop_reason: None,
      finished: false,
    }
  }

  pub(crate) fn handle_chunk(&mut self, chunk: &Value) -> Vec<EmittedEvent> {
    let mut events: Vec<EmittedEvent> = Vec::new();

    if self.finished {
      return events;
    }

    if !self.emitted_message_start {
      self.emitted_message_start = true;
      events.push(EmittedEvent {
        event: "message_start".into(),
        data: json!({
          "type":"message_start",
          "message": {
            "id": self.message_id,
            "type":"message",
            "role":"assistant",
            "model": self.model,
            "content": [],
            "stop_reason": Value::Null,
            "stop_sequence": Value::Null,
            "usage": {"input_tokens": 0, "output_tokens": 0},
          }
        }),
      });
    }

    if let Some(usage) = chunk.get("usage") {
      if let Some(p) = usage.get("prompt_tokens").and_then(Value::as_u64) {
        self.input_tokens = p;
      }
      if let Some(c) = usage.get("completion_tokens").and_then(Value::as_u64) {
        self.output_tokens = c;
      }
    }

    let Some(choice) = chunk
      .get("choices")
      .and_then(Value::as_array)
      .and_then(|a| a.first())
    else {
      return events;
    };

    if let Some(delta) = choice.get("delta") {
      if let Some(text) = delta.get("content").and_then(Value::as_str) {
        if !text.is_empty() {
          self.ensure_text_block(&mut events);
          let (idx, _) = self.current_block.expect("text block open");
          events.push(EmittedEvent {
            event: "content_block_delta".into(),
            data: json!({
              "type":"content_block_delta",
              "index": idx,
              "delta": {"type":"text_delta","text": text},
            }),
          });
        }
      }

      if let Some(tool_calls) = delta.get("tool_calls").and_then(Value::as_array) {
        for tc in tool_calls {
          self.handle_tool_call_delta(tc, &mut events);
        }
      }
    }

    let finish_reason = choice
      .get("finish_reason")
      .and_then(Value::as_str)
      .filter(|s| !s.is_empty());

    if let Some(reason) = finish_reason {
      self.close_current(&mut events);
      let stop = map_finish_reason(reason);
      self.stop_reason = Some(stop.to_string());
      events.push(EmittedEvent {
        event: "message_delta".into(),
        data: json!({
          "type":"message_delta",
          "delta": {"stop_reason": stop, "stop_sequence": Value::Null},
          "usage": {"output_tokens": self.output_tokens},
        }),
      });
      events.push(EmittedEvent {
        event: "message_stop".into(),
        data: json!({"type":"message_stop"}),
      });
      self.finished = true;
    }

    events
  }

  fn ensure_text_block(&mut self, events: &mut Vec<EmittedEvent>) {
    if let Some((_, kind)) = self.current_block {
      if kind == BlockKind::Text {
        return;
      }
      self.close_current(events);
    }
    let idx = self.next_block_idx;
    self.next_block_idx += 1;
    self.current_block = Some((idx, BlockKind::Text));
    events.push(EmittedEvent {
      event: "content_block_start".into(),
      data: json!({
        "type":"content_block_start",
        "index": idx,
        "content_block": {"type":"text","text":""},
      }),
    });
  }

  fn handle_tool_call_delta(&mut self, tc: &Value, events: &mut Vec<EmittedEvent>) {
    let index = tc.get("index").and_then(Value::as_u64).unwrap_or(0);
    let block_idx = if let Some(existing) = self.tool_call_idx_to_block.get(&index) {
      *existing
    } else {
      self.close_current(events);
      let idx = self.next_block_idx;
      self.next_block_idx += 1;
      self.current_block = Some((idx, BlockKind::ToolUse));
      self.tool_call_idx_to_block.insert(index, idx);
      let tool_id = tc.get("id").and_then(Value::as_str).unwrap_or("").to_string();
      let tool_name = tc
        .get("function")
        .and_then(|f| f.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
      events.push(EmittedEvent {
        event: "content_block_start".into(),
        data: json!({
          "type":"content_block_start",
          "index": idx,
          "content_block": {"type":"tool_use","id": tool_id,"name": tool_name,"input": {}},
        }),
      });
      idx
    };

    if let Some(args) = tc
      .get("function")
      .and_then(|f| f.get("arguments"))
      .and_then(Value::as_str)
    {
      if !args.is_empty() {
        events.push(EmittedEvent {
          event: "content_block_delta".into(),
          data: json!({
            "type":"content_block_delta",
            "index": block_idx,
            "delta": {"type":"input_json_delta","partial_json": args},
          }),
        });
      }
    }
  }

  fn close_current(&mut self, events: &mut Vec<EmittedEvent>) {
    if let Some((idx, _)) = self.current_block.take() {
      events.push(EmittedEvent {
        event: "content_block_stop".into(),
        data: json!({
          "type":"content_block_stop",
          "index": idx,
        }),
      });
    }
  }

  pub(crate) fn flush(&mut self) -> Vec<EmittedEvent> {
    let mut events: Vec<EmittedEvent> = Vec::new();
    if self.finished {
      return events;
    }
    self.close_current(&mut events);
    if self.emitted_message_start {
      events.push(EmittedEvent {
        event: "message_delta".into(),
        data: json!({
          "type":"message_delta",
          "delta": {"stop_reason": "end_turn", "stop_sequence": Value::Null},
          "usage": {"output_tokens": self.output_tokens},
        }),
      });
      events.push(EmittedEvent {
        event: "message_stop".into(),
        data: json!({"type":"message_stop"}),
      });
    }
    self.finished = true;
    events
  }
}

fn synthesize_sse_from_openai_json(
  openai: Value,
  model: String,
) -> impl Stream<Item = Result<Event, Infallible>> + Send + 'static {
  let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<Result<Event, Infallible>>();

  let chunks = openai_json_to_chunks(&openai);

  tokio::spawn(async move {
    let mut translator = SseTranslator::new(model);
    for chunk in chunks {
      for ev in translator.handle_chunk(&chunk) {
        let _ = tx.send(Ok(ev.to_sse()));
      }
    }
    for ev in translator.flush() {
      let _ = tx.send(Ok(ev.to_sse()));
    }
  });

  futures_util::stream::unfold(rx, |mut rx| async move {
    rx.recv().await.map(|item| (item, rx))
  })
}

fn openai_json_to_chunks(openai: &Value) -> Vec<Value> {
  let mut chunks: Vec<Value> = Vec::new();
  let choice = openai
    .get("choices")
    .and_then(Value::as_array)
    .and_then(|a| a.first());
  let message = choice.and_then(|c| c.get("message"));

  if let Some(text) = message
    .and_then(|m| m.get("content"))
    .and_then(Value::as_str)
  {
    if !text.is_empty() {
      chunks.push(json!({"choices":[{"delta":{"content": text}}]}));
    }
  }

  if let Some(tool_calls) = message
    .and_then(|m| m.get("tool_calls"))
    .and_then(Value::as_array)
  {
    for (i, tc) in tool_calls.iter().enumerate() {
      let id = tc.get("id").and_then(Value::as_str).unwrap_or("");
      let name = tc
        .get("function")
        .and_then(|f| f.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("");
      let args = tc
        .get("function")
        .and_then(|f| f.get("arguments"))
        .and_then(Value::as_str)
        .unwrap_or("");
      chunks.push(json!({
        "choices":[{"delta":{"tool_calls":[{
          "index": i,
          "id": id,
          "type": "function",
          "function": {"name": name, "arguments": args},
        }]}}]
      }));
    }
  }

  let finish = choice
    .and_then(|c| c.get("finish_reason"))
    .and_then(Value::as_str)
    .unwrap_or("stop")
    .to_string();
  let mut final_chunk = json!({"choices":[{"delta":{},"finish_reason": finish}]});
  if let Some(usage) = openai.get("usage") {
    final_chunk["usage"] = usage.clone();
  }
  chunks.push(final_chunk);

  chunks
}

fn translate_openai_sse_stream(
  response: reqwest::Response,
  model: String,
) -> impl Stream<Item = Result<Event, Infallible>> + Send + 'static {
  let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<Result<Event, Infallible>>();

  tokio::spawn(async move {
    let mut translator = SseTranslator::new(model);
    let mut buf: Vec<u8> = Vec::new();
    let mut stream = response.bytes_stream();

    let mut done = false;
    while !done {
      let Some(chunk_result) = stream.next().await else {
        break;
      };
      let Ok(chunk) = chunk_result else {
        log::warn!("[anthropic-proxy] SSE stream read error, flushing");
        break;
      };
      buf.extend_from_slice(&chunk);

      while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
        let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
        let end = line_bytes
          .len()
          .saturating_sub(if line_bytes.last() == Some(&b'\n') { 1 } else { 0 });
        let raw = String::from_utf8_lossy(&line_bytes[..end])
          .trim_end_matches('\r')
          .to_string();
        let line = raw.trim();
        // Skip empty lines, SSE comments (lines starting with ':'),
        // and event-type lines ("event: ...").
        if line.is_empty() || line.starts_with(':') || line.starts_with("event:") {
          continue;
        }
        if !line.starts_with("data:") {
          continue;
        }
        let payload = line.trim_start_matches("data:").trim();
        if payload.is_empty() {
          continue;
        }
        if payload == "[DONE]" {
          for ev in translator.flush() {
            let _ = tx.send(Ok(ev.to_sse()));
          }
          done = true;
          break;
        }
        let Ok(value) = serde_json::from_str::<Value>(payload) else {
          log::debug!("[anthropic-proxy] skipping unparseable SSE payload: {payload}");
          continue;
        };
        for ev in translator.handle_chunk(&value) {
          let _ = tx.send(Ok(ev.to_sse()));
        }
      }
    }

    // Try to parse any remaining buffered data (handles the case where
    // the stream ends without a trailing newline).
    if !done {
      let trailing = String::from_utf8_lossy(&buf).trim().to_string();
      if !trailing.is_empty() {
        for line in trailing.lines() {
          let line = line.trim();
          if line.starts_with("data:") {
            let payload = line.trim_start_matches("data:").trim();
            if payload == "[DONE]" {
              break;
            }
            if let Ok(value) = serde_json::from_str::<Value>(payload) {
              for ev in translator.handle_chunk(&value) {
                let _ = tx.send(Ok(ev.to_sse()));
              }
            }
          }
        }
      }
      for ev in translator.flush() {
        let _ = tx.send(Ok(ev.to_sse()));
      }
    }
  });

  futures_util::stream::unfold(rx, |mut rx| async move {
    rx.recv().await.map(|item| (item, rx))
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn flatten_system_joins_text_parts() {
    let v = json!([
      {"type":"text","text":"one"},
      {"type":"text","text":"two","cache_control":{"type":"ephemeral"}},
    ]);
    assert_eq!(flatten_system(&v).as_deref(), Some("one\n\ntwo"));
  }

  #[test]
  fn translate_request_overrides_model_and_inlines_system() {
    let req = json!({
      "model":"claude-3",
      "system":[{"type":"text","text":"sys"}],
      "messages":[{"role":"user","content":"hi"}],
      "max_tokens": 128,
      "stream": true,
    });
    let out = translate_request(&req, "deepseek-chat");
    assert_eq!(out["model"], json!("deepseek-chat"));
    let msgs = out["messages"].as_array().unwrap();
    assert_eq!(msgs[0]["role"], json!("system"));
    assert_eq!(msgs[0]["content"], json!("sys"));
    assert_eq!(msgs[1]["role"], json!("user"));
    assert_eq!(msgs[1]["content"], json!("hi"));
    assert_eq!(out["max_tokens"], json!(128));
    assert_eq!(out["stream"], json!(true));
  }

  #[test]
  fn translate_request_emits_tool_message_after_tool_result() {
    let req = json!({
      "messages":[
        {"role":"assistant","content":[{"type":"tool_use","id":"t1","name":"f","input":{"x":1}}]},
        {"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"done"}]},
      ],
    });
    let out = translate_request(&req, "m");
    let msgs = out["messages"].as_array().unwrap();
    assert_eq!(msgs[0]["role"], json!("assistant"));
    assert_eq!(msgs[0]["tool_calls"][0]["id"], json!("t1"));
    assert_eq!(msgs[0]["tool_calls"][0]["function"]["name"], json!("f"));
    assert_eq!(
      msgs[0]["tool_calls"][0]["function"]["arguments"]
        .as_str()
        .unwrap(),
      "{\"x\":1}"
    );
    assert_eq!(msgs[1]["role"], json!("tool"));
    assert_eq!(msgs[1]["tool_call_id"], json!("t1"));
    assert_eq!(msgs[1]["content"], json!("done"));
  }

  #[test]
  fn translate_request_rewrites_tool_choice_any_to_required() {
    let req = json!({"messages":[],"tool_choice":{"type":"any"}});
    let out = translate_request(&req, "m");
    assert_eq!(out["tool_choice"], json!("required"));
  }

  #[test]
  fn translate_request_rewrites_named_tool_choice() {
    let req = json!({"messages":[],"tool_choice":{"type":"tool","name":"foo"}});
    let out = translate_request(&req, "m");
    assert_eq!(out["tool_choice"]["type"], json!("function"));
    assert_eq!(out["tool_choice"]["function"]["name"], json!("foo"));
  }

  #[test]
  fn translate_request_maps_stop_sequences() {
    let req = json!({"messages":[],"stop_sequences":["\n\n"]});
    let out = translate_request(&req, "m");
    assert_eq!(out["stop"], json!(["\n\n"]));
  }

  #[test]
  fn translate_tools_maps_input_schema_to_parameters() {
    let req = json!({
      "messages":[],
      "tools":[{"name":"foo","description":"d","input_schema":{"type":"object","properties":{"a":{"type":"string"}}}}],
    });
    let out = translate_request(&req, "m");
    let tool = &out["tools"][0];
    assert_eq!(tool["type"], json!("function"));
    assert_eq!(tool["function"]["name"], json!("foo"));
    assert_eq!(tool["function"]["parameters"]["type"], json!("object"));
  }

  #[test]
  fn translate_response_converts_tool_calls_to_tool_use_blocks() {
    let resp = json!({
      "choices":[{
        "message":{
          "content": Value::Null,
          "tool_calls":[{"id":"t1","type":"function","function":{"name":"foo","arguments":"{\"a\":1}"}}],
        },
        "finish_reason":"tool_calls",
      }],
      "usage":{"prompt_tokens":10,"completion_tokens":5},
    });
    let out = translate_response_json(&resp, "m");
    assert_eq!(out["stop_reason"], json!("tool_use"));
    assert_eq!(out["content"][0]["type"], json!("tool_use"));
    assert_eq!(out["content"][0]["id"], json!("t1"));
    assert_eq!(out["content"][0]["name"], json!("foo"));
    assert_eq!(out["content"][0]["input"]["a"], json!(1));
    assert_eq!(out["usage"]["input_tokens"], json!(10));
    assert_eq!(out["usage"]["output_tokens"], json!(5));
  }

  #[test]
  fn translate_response_plain_text_wraps_in_text_block() {
    let resp = json!({
      "choices":[{"message":{"content":"hi"},"finish_reason":"stop"}],
    });
    let out = translate_response_json(&resp, "m");
    assert_eq!(out["stop_reason"], json!("end_turn"));
    assert_eq!(out["content"][0]["type"], json!("text"));
    assert_eq!(out["content"][0]["text"], json!("hi"));
  }

  #[test]
  fn sse_translator_emits_message_start_only_once() {
    let mut t = SseTranslator::new("m".into());
    let e1 = t.handle_chunk(&json!({"choices":[{"delta":{"content":"a"}}]}));
    let e2 = t.handle_chunk(&json!({"choices":[{"delta":{"content":"b"}}]}));
    assert_eq!(
      e1.iter()
        .filter(|e| e.event == "message_start")
        .count(),
      1
    );
    assert_eq!(
      e2.iter()
        .filter(|e| e.event == "message_start")
        .count(),
      0
    );
  }

  #[test]
  fn sse_translator_closes_text_block_when_tool_call_arrives() {
    let mut t = SseTranslator::new("m".into());
    t.handle_chunk(&json!({"choices":[{"delta":{"content":"hi"}}]}));
    let events = t.handle_chunk(&json!({
      "choices":[{"delta":{"tool_calls":[
        {"index":0,"id":"t","type":"function","function":{"name":"f","arguments":""}}
      ]}}]
    }));
    let names: Vec<&str> = events.iter().map(|e| e.event.as_str()).collect();
    let stop_pos = names.iter().position(|n| *n == "content_block_stop");
    let start_pos = names.iter().position(|n| *n == "content_block_start");
    assert!(stop_pos.is_some());
    assert!(start_pos.is_some());
    assert!(stop_pos.unwrap() < start_pos.unwrap());
    let tool_start = events
      .iter()
      .find(|e| e.event == "content_block_start")
      .unwrap();
    assert_eq!(tool_start.data["content_block"]["type"], json!("tool_use"));
    assert_eq!(tool_start.data["content_block"]["name"], json!("f"));
  }

  #[test]
  fn sse_translator_forwards_arguments_as_input_json_delta() {
    let mut t = SseTranslator::new("m".into());
    t.handle_chunk(&json!({
      "choices":[{"delta":{"tool_calls":[
        {"index":0,"id":"t","type":"function","function":{"name":"f","arguments":"{\"a\":"}}
      ]}}]
    }));
    let events = t.handle_chunk(&json!({
      "choices":[{"delta":{"tool_calls":[
        {"index":0,"function":{"arguments":"1}"}}
      ]}}]
    }));
    let delta = events
      .iter()
      .find(|e| e.event == "content_block_delta")
      .expect("expected delta");
    assert_eq!(delta.data["delta"]["type"], json!("input_json_delta"));
    assert_eq!(delta.data["delta"]["partial_json"], json!("1}"));
  }

  #[test]
  fn sse_translator_finishes_with_message_stop() {
    let mut t = SseTranslator::new("m".into());
    t.handle_chunk(&json!({"choices":[{"delta":{"content":"hi"}}]}));
    let events = t.handle_chunk(&json!({
      "choices":[{"delta":{},"finish_reason":"stop"}],
      "usage":{"prompt_tokens":3,"completion_tokens":2}
    }));
    let names: Vec<&str> = events.iter().map(|e| e.event.as_str()).collect();
    assert!(names.contains(&"content_block_stop"));
    assert!(names.contains(&"message_delta"));
    assert_eq!(names.last().copied(), Some("message_stop"));
    let delta = events.iter().find(|e| e.event == "message_delta").unwrap();
    assert_eq!(delta.data["delta"]["stop_reason"], json!("end_turn"));
    assert_eq!(delta.data["usage"]["output_tokens"], json!(2));
  }

  #[test]
  fn sse_translator_flush_synthesizes_stop_when_missing() {
    let mut t = SseTranslator::new("m".into());
    t.handle_chunk(&json!({"choices":[{"delta":{"content":"hi"}}]}));
    let events = t.flush();
    let names: Vec<&str> = events.iter().map(|e| e.event.as_str()).collect();
    assert!(names.contains(&"content_block_stop"));
    assert!(names.contains(&"message_stop"));
  }

  #[test]
  fn map_finish_reason_translates_known_values() {
    assert_eq!(map_finish_reason("stop"), "end_turn");
    assert_eq!(map_finish_reason("length"), "max_tokens");
    assert_eq!(map_finish_reason("tool_calls"), "tool_use");
    assert_eq!(map_finish_reason("content_filter"), "stop_sequence");
    assert_eq!(map_finish_reason("anything_else"), "end_turn");
  }

  #[test]
  fn openai_json_to_chunks_emits_content_and_finish() {
    let openai = json!({
      "choices":[{"message":{"content":"hi"},"finish_reason":"stop"}],
      "usage":{"prompt_tokens":1,"completion_tokens":2}
    });
    let chunks = openai_json_to_chunks(&openai);
    assert_eq!(chunks.len(), 2);
    assert_eq!(chunks[0]["choices"][0]["delta"]["content"], json!("hi"));
    assert_eq!(chunks[1]["choices"][0]["finish_reason"], json!("stop"));
    assert_eq!(chunks[1]["usage"]["prompt_tokens"], json!(1));
  }

  #[test]
  fn openai_json_to_chunks_emits_tool_call_arguments() {
    let openai = json!({
      "choices":[{
        "message":{
          "content": Value::Null,
          "tool_calls":[{"id":"t1","type":"function","function":{"name":"f","arguments":"{\"a\":1}"}}],
        },
        "finish_reason":"tool_calls",
      }],
    });
    let chunks = openai_json_to_chunks(&openai);
    let tc = &chunks[0]["choices"][0]["delta"]["tool_calls"][0];
    assert_eq!(tc["id"], json!("t1"));
    assert_eq!(tc["function"]["name"], json!("f"));
    assert_eq!(tc["function"]["arguments"], json!("{\"a\":1}"));
    let last = chunks.last().unwrap();
    assert_eq!(last["choices"][0]["finish_reason"], json!("tool_calls"));
  }

  #[test]
  fn map_error_type_covers_common_statuses() {
    assert_eq!(
      map_error_type(reqwest::StatusCode::UNAUTHORIZED),
      "authentication_error"
    );
    assert_eq!(
      map_error_type(reqwest::StatusCode::TOO_MANY_REQUESTS),
      "rate_limit_error"
    );
    assert_eq!(
      map_error_type(reqwest::StatusCode::BAD_REQUEST),
      "invalid_request_error"
    );
    assert_eq!(
      map_error_type(reqwest::StatusCode::INTERNAL_SERVER_ERROR),
      "api_error"
    );
  }
}
