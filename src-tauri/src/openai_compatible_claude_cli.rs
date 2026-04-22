use crate::anthropic_proxy::{start_proxy, ProxyConfig};
use crate::claude_cli::{
  chat_with_claude_cli_overridden, title_with_claude_cli_overridden, ProxyOverride,
};
use crate::models::{Message, ProviderConfig};
use log::info;

/// Placeholder Claude-family model name handed to the official `claude` CLI so its
/// local `--model` validation passes. The proxy rewrites the forwarded request's
/// `model` field to the user-configured upstream model before calling the
/// OpenAI-compatible backend, so this name only has to survive the CLI's own checks.
const CLI_PLACEHOLDER_MODEL: &str = "claude-3-5-sonnet-latest";

fn format_progress_line(prefix: &str, detail: &str) -> String {
  let trimmed = detail.trim();
  if trimmed.is_empty() {
    String::new()
  } else {
    format!("\n[{prefix}] {trimmed}\n")
  }
}

fn emit_progress_chunk(
  progress: &mut Option<&mut (dyn FnMut(String) + Send)>,
  chunk: impl Into<String>,
) {
  if let Some(progress) = progress.as_mut() {
    (*progress)(chunk.into());
  }
}

fn redact_secret(value: &str) -> String {
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return "<empty>".to_string();
  }

  let chars: Vec<char> = trimmed.chars().collect();
  if chars.len() <= 8 {
    return format!("{}***", chars.iter().take(3).collect::<String>());
  }

  let head: String = chars.iter().take(4).collect();
  let tail: String = chars.iter().rev().take(4).copied().collect::<Vec<char>>().into_iter().rev().collect();
  format!("{head}***{tail}")
}

fn log_bridge_config(provider: &ProviderConfig, config: &ProxyConfig, stage: &str) {
  info!(
    "[Claude Bridge] {stage}; provider_id={}; provider_name={}; base_url_source=provider.base_url; base_url={}; api_key_source=provider.api_key; api_key={}; target_model={}; cli_placeholder_model={}",
    provider.id,
    provider.name,
    config.upstream_base_url,
    redact_secret(&config.upstream_api_key),
    config.forced_model,
    CLI_PLACEHOLDER_MODEL,
  );
}

fn upstream_chat_completions_url(base_url: &str) -> String {
  format!("{}/chat/completions", base_url.trim_end_matches('/'))
}

fn emit_bridge_progress(
  progress: &mut Option<&mut (dyn FnMut(String) + Send)>,
  provider: &ProviderConfig,
  config: &ProxyConfig,
) {
  let config_line = format_progress_line(
    "Claude Bridge",
    &format!(
      "baseUrl source=provider.base_url; provider={}; baseUrl={}",
      provider.id, config.upstream_base_url
    ),
  );
  if !config_line.is_empty() {
    emit_progress_chunk(progress, config_line);
  }

  let target_line = format_progress_line(
    "Claude Bridge",
    &format!(
      "resolved upstream_url={}; apiKey source=provider.api_key; target_model={}",
      upstream_chat_completions_url(&config.upstream_base_url),
      config.forced_model
    ),
  );
  if !target_line.is_empty() {
    emit_progress_chunk(progress, target_line);
  }
}

fn proxy_config_from_provider(provider: &ProviderConfig, model: &str) -> Result<ProxyConfig, String> {
  let base_url = provider
    .base_url
    .as_deref()
    .map(str::trim)
    .filter(|v| !v.is_empty())
    .ok_or_else(|| "请先为 OpenAI-compatible provider 配置 Base URL".to_string())?;

  let api_key = provider.api_key.trim();
  if api_key.is_empty() {
    return Err(format!("请先在设置中配置 {} 的 API Key", provider.name));
  }

  let forced_model = model.trim();
  if forced_model.is_empty() {
    return Err("未选择目标模型，无法启动 Claude CLI 翻译代理。".to_string());
  }

  Ok(ProxyConfig {
    upstream_base_url: base_url.trim_end_matches('/').to_string(),
    upstream_api_key: api_key.to_string(),
    forced_model: forced_model.to_string(),
  })
}

pub async fn chat_with_openai_compatible_claude_cli(
  provider: &ProviderConfig,
  model: &str,
  messages: &[Message],
  workspace: Option<&str>,
  mut progress: Option<&mut (dyn FnMut(String) + Send)>,
) -> Result<String, String> {
  let config = proxy_config_from_provider(provider, model)?;
  log_bridge_config(provider, &config, "resolved upstream config from client settings");
  emit_bridge_progress(&mut progress, provider, &config);
  let proxy = start_proxy(config).await?;
  info!(
    "[Claude Bridge] local proxy ready; provider_id={}; local_base_url={}; auth_token={}",
    provider.id,
    proxy.base_url,
    redact_secret(&proxy.auth_token),
  );
  let local_proxy_line = format_progress_line(
    "Claude Bridge",
    &format!("local proxy ready; local_base_url={}", proxy.base_url),
  );
  if !local_proxy_line.is_empty() {
    emit_progress_chunk(&mut progress, local_proxy_line);
  }
  let override_env = ProxyOverride {
    base_url: proxy.base_url.clone(),
    auth_token: proxy.auth_token.clone(),
  };
  let result = chat_with_claude_cli_overridden(
    provider,
    CLI_PLACEHOLDER_MODEL,
    messages,
    workspace,
    Some(&override_env),
    progress,
  )
  .await;
  proxy.shutdown().await;
  result
}

pub async fn title_with_openai_compatible_claude_cli(
  provider: &ProviderConfig,
  model: &str,
  prompt: &str,
) -> Result<String, String> {
  let config = proxy_config_from_provider(provider, model)?;
  log_bridge_config(provider, &config, "resolved title upstream config from client settings");
  let proxy = start_proxy(config).await?;
  info!(
    "[Claude Bridge] local proxy ready for title; provider_id={}; local_base_url={}; auth_token={}",
    provider.id,
    proxy.base_url,
    redact_secret(&proxy.auth_token),
  );
  let override_env = ProxyOverride {
    base_url: proxy.base_url.clone(),
    auth_token: proxy.auth_token.clone(),
  };
  let result = title_with_claude_cli_overridden(
    provider,
    CLI_PLACEHOLDER_MODEL,
    prompt,
    Some(&override_env),
  )
  .await;
  proxy.shutdown().await;
  result
}

#[cfg(test)]
mod tests {
  use super::*;

  fn base_provider() -> ProviderConfig {
    ProviderConfig {
      id: "custom".into(),
      name: "Custom".into(),
      api_key: "sk-test".into(),
      project_id: String::new(),
      auth_token: String::new(),
      base_url: Some("https://api.example.com/v1".into()),
      wire_api: Some("claude_cli".into()),
      enabled: true,
      models: vec!["x".into()],
    }
  }

  #[test]
  fn proxy_config_requires_base_url() {
    let mut p = base_provider();
    p.base_url = None;
    assert!(proxy_config_from_provider(&p, "m").is_err());
  }

  #[test]
  fn proxy_config_requires_api_key() {
    let mut p = base_provider();
    p.api_key = "  ".into();
    assert!(proxy_config_from_provider(&p, "m").is_err());
  }

  #[test]
  fn proxy_config_requires_model() {
    let p = base_provider();
    assert!(proxy_config_from_provider(&p, "   ").is_err());
  }

  #[test]
  fn proxy_config_trims_trailing_slash_on_base_url() {
    let mut p = base_provider();
    p.base_url = Some("https://api.example.com/v1/".into());
    let cfg = proxy_config_from_provider(&p, "m").unwrap();
    assert_eq!(cfg.upstream_base_url, "https://api.example.com/v1");
    assert_eq!(cfg.forced_model, "m");
  }
}
