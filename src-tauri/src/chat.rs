use reqwest::{Client, Response};
use serde_json::{json, Value};

use crate::models::{
  AppSettings, ChatCompletionPayload, FetchProviderModelsPayload, FetchProviderModelsResponse,
  ProviderConfig, TitlePayload,
};

fn active_provider(settings: &AppSettings) -> Result<(String, ProviderConfig), String> {
  let provider_id = settings.active_provider.clone();
  let provider = settings
    .providers
    .get(&provider_id)
    .cloned()
    .ok_or_else(|| format!("unknown provider: {}", settings.active_provider))?;
  Ok((provider_id, provider))
}

fn require_api_key(provider: &ProviderConfig) -> Result<String, String> {
  let api_key = provider.api_key.trim();
  if api_key.is_empty() {
    Err(format!("请先在设置中配置 {} 的 API Key", provider.name))
  } else {
    Ok(api_key.to_string())
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
  model.trim().ends_with("[1m]")
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

async fn api_error(response: Response) -> String {
  let status = response.status();
  let fallback = format!("request failed with status {status}");
  let Ok(body) = response.text().await else {
    return fallback;
  };

  if let Ok(json) = serde_json::from_str::<Value>(&body) {
    let candidates = [
      json.pointer("/error/message").and_then(Value::as_str),
      json.pointer("/message").and_then(Value::as_str),
      json.pointer("/error/status").and_then(Value::as_str),
    ];
    for candidate in candidates.into_iter().flatten() {
      if !candidate.trim().is_empty() {
        return candidate.trim().to_string();
      }
    }
  }

  if body.trim().is_empty() {
    fallback
  } else {
    body
  }
}

fn clarify_claude_error(message: String) -> String {
  let trimmed = message.trim();
  if trimmed.is_empty() {
    return "Claude request failed".to_string();
  }
  trimmed.to_string()
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
  api_key: &str,
) -> Result<Vec<String>, String> {
  let url = claude_models_url(provider);

  let mut response = client
    .get(&url)
    .header("authorization", format!("Bearer {api_key}"))
    .send()
    .await
    .map_err(|err| format!("Claude model list request failed: {err}"))?;

  if !response.status().is_success() {
    response = client
      .get(&url)
      .header("x-api-key", api_key)
      .header("anthropic-version", "2023-06-01")
      .send()
      .await
      .map_err(|err| format!("Claude model list request failed: {err}"))?;
  }

  if !response.status().is_success() {
    return Err(clarify_claude_error(api_error(response).await));
  }

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
  Ok(models)
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

async fn chat_with_claude(
  client: &Client,
  provider: &ProviderConfig,
  api_key: &str,
  model: &str,
  messages: Value,
  max_tokens: u32,
) -> Result<String, String> {
  let uses_1m_context = claude_uses_1m_context(model);

  if uses_claude_chat_completions_api(provider) {
    let mut request = client
      .post(claude_chat_completions_url(provider))
      .header("content-type", "application/json")
      .header("authorization", format!("Bearer {api_key}"));
    if uses_1m_context {
      request = request.header("anthropic-beta", "context-1m-2025-08-07");
    }
    let response = request
      .json(&json!({
        "model": model.trim(),
        "messages": messages,
        "stream": false,
      }))
      .send()
      .await
      .map_err(|err| format!("Claude request failed: {err}"))?;

    if !response.status().is_success() {
      return Err(clarify_claude_error(api_error(response).await));
    }

    let value = response
      .json::<Value>()
      .await
      .map_err(|err| format!("failed to parse Claude response: {err}"))?;
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

  let mut request = client
    .post(claude_messages_url(provider))
    .header("content-type", "application/json")
    .header("x-api-key", api_key)
    .header("anthropic-version", "2023-06-01");
  if uses_1m_context {
    request = request.header("anthropic-beta", "context-1m-2025-08-07");
  }
  let response = request
    .json(&json!({
      "model": model.trim(),
      "max_tokens": max_tokens,
      "messages": messages,
    }))
    .send()
    .await
    .map_err(|err| format!("Claude request failed: {err}"))?;

  if !response.status().is_success() {
    return Err(clarify_claude_error(api_error(response).await));
  }

  let value = response
    .json::<Value>()
    .await
    .map_err(|err| format!("failed to parse Claude response: {err}"))?;
  let text = value["content"]
    .as_array()
    .map(|items| {
      items
        .iter()
        .filter(|item| item.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|item| item.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("")
    })
    .unwrap_or_default();

  if text.trim().is_empty() {
    Err("Claude 返回了空内容".to_string())
  } else {
    Ok(text)
  }
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
  let api_key = require_api_key(&provider)?;
  let client = Client::new();

  match provider_id.as_str() {
    "gemini" => request_gemini(
      &client,
      &provider,
      &api_key,
      &payload.active_model,
      gemini_messages(&payload.messages),
    )
    .await,
    "claude" => {
      let messages = openai_messages(&payload.messages);
      chat_with_claude(&client, &provider, &api_key, &payload.active_model, messages, 4096).await
    }
    "openai" | "custom" => {
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
  if provider.api_key.trim().is_empty() {
    return Ok("New Chat".to_string());
  }

  let api_key = provider.api_key.trim().to_string();
  let client = Client::new();
  let prompt = text_prompt_for_title(&payload.first_message);
  let title = match provider_id.as_str() {
    "gemini" => {
      let model = model_or_default(&provider, "gemini-1.5-flash");
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
    "claude" => {
      let model = model_or_default(&provider, "claude-3-5-sonnet-latest");
      chat_with_claude(
        &client,
        &provider,
        &api_key,
        &model,
        Value::Array(vec![json!({
          "role": "user",
          "content": prompt,
        })]),
        64,
      )
      .await?
    }
    "openai" | "custom" => {
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
  let provider = payload
    .settings
    .providers
    .get(&payload.provider_id)
    .cloned()
    .ok_or_else(|| format!("unknown provider: {}", payload.provider_id))?;
  let api_key = require_api_key(&provider)?;
  let client = Client::new();

  let models = match payload.provider_id.as_str() {
    "claude" => fetch_claude_models(&client, &provider, &api_key).await?,
    "openai" | "custom" => {
      fetch_openai_compatible_models(&client, &payload.provider_id, &provider, &api_key).await?
    }
    _ => return Err("当前提供商暂不支持远程模型探测".to_string()),
  };

  Ok(FetchProviderModelsResponse { models })
}

#[cfg(test)]
mod tests {
  use super::{extract_model_ids, extract_text_from_responses_sse};
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
}
