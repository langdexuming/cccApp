use reqwest::{Client, Response};
use serde_json::{json, Value};

use crate::models::{AppSettings, ChatCompletionPayload, ProviderConfig, TitlePayload};

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

fn openai_chat_url(provider_id: &str, provider: &ProviderConfig) -> Result<String, String> {
  let base = provider.base_url.as_deref().map(str::trim).filter(|value| !value.is_empty());
  let raw = match (provider_id, base) {
    (_, Some(base)) => base.to_string(),
    ("openai", None) => "https://api.openai.com/v1".to_string(),
    _ => return Err("请先配置 OpenAI 兼容接口的 Base URL".to_string()),
  };

  let trimmed = raw.trim_end_matches('/');
  if trimmed.ends_with("/chat/completions") {
    Ok(trimmed.to_string())
  } else {
    Ok(format!("{trimmed}/chat/completions"))
  }
}

fn claude_messages_url(provider: &ProviderConfig) -> String {
  let raw = provider
    .base_url
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or("https://api.anthropic.com/v1/messages");
  let trimmed = raw.trim_end_matches('/');
  if trimmed.ends_with("/messages") {
    trimmed.to_string()
  } else if trimmed.ends_with("/v1") {
    format!("{trimmed}/messages")
  } else {
    format!("{trimmed}/v1/messages")
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
      String::new()
    }
    _ => String::new(),
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
  let response = client
    .post(claude_messages_url(provider))
    .header("content-type", "application/json")
    .header("x-api-key", api_key)
    .header("anthropic-version", "2023-06-01")
    .json(&json!({
      "model": model,
      "max_tokens": max_tokens,
      "messages": messages,
    }))
    .send()
    .await
    .map_err(|err| format!("Claude request failed: {err}"))?;

  if !response.status().is_success() {
    return Err(api_error(response).await);
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
  let mut body = json!({
    "model": model,
    "messages": messages,
    "stream": false,
  });

  if let Some(effort) = effort.filter(|value| !value.trim().is_empty()) {
    body["reasoning_effort"] = Value::String(effort.to_string());
  }

  let response = client
    .post(openai_chat_url(provider_id, provider)?)
    .header("content-type", "application/json")
    .header("authorization", format!("Bearer {api_key}"))
    .json(&body)
    .send()
    .await
    .map_err(|err| format!("OpenAI-compatible request failed: {err}"))?;

  if !response.status().is_success() {
    return Err(api_error(response).await);
  }

  let value = response
    .json::<Value>()
    .await
    .map_err(|err| format!("failed to parse OpenAI-compatible response: {err}"))?;
  let text = value["choices"]
    .as_array()
    .and_then(|items| items.first())
    .and_then(|choice| choice.get("message"))
    .and_then(|message| message.get("content"))
    .map(extract_text_from_value)
    .unwrap_or_default();

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
      let messages = Value::Array(
        payload
          .messages
          .iter()
          .map(|message| {
            json!({
              "role": message.role,
              "content": message.content,
            })
          })
          .collect(),
      );
      chat_with_claude(&client, &provider, &api_key, &payload.active_model, messages, 4096).await
    }
    "openai" | "custom" => {
      let messages = Value::Array(
        payload
          .messages
          .iter()
          .map(|message| {
            json!({
              "role": message.role,
              "content": message.content,
            })
          })
          .collect(),
      );
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
      chat_with_openai_compatible(
        &client,
        &provider_id,
        &provider,
        &api_key,
        &model,
        Value::Array(vec![json!({
          "role": "user",
          "content": prompt,
        })]),
        None,
      )
      .await?
    }
    _ => "New Chat".to_string(),
  };

  Ok(sanitize_title(&title))
}
