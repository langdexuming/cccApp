use crate::anthropic_proxy::{start_proxy, ProxyConfig};
use crate::claude_cli::{
  chat_with_claude_cli_overridden, title_with_claude_cli_overridden, ProxyOverride,
};
use crate::models::{Message, ProviderConfig};

/// Placeholder Claude-family model name handed to the official `claude` CLI so its
/// local `--model` validation passes. The proxy rewrites the forwarded request's
/// `model` field to the user-configured upstream model before calling the
/// OpenAI-compatible backend, so this name only has to survive the CLI's own checks.
const CLI_PLACEHOLDER_MODEL: &str = "claude-3-5-sonnet-latest";

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
) -> Result<String, String> {
  let config = proxy_config_from_provider(provider, model)?;
  let proxy = start_proxy(config).await?;
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
  let proxy = start_proxy(config).await?;
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
