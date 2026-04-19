use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedAppState {
  #[serde(default)]
  pub chats: Vec<Chat>,
  pub settings: AppSettings,
  pub active_chat_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
  #[serde(default)]
  pub providers: HashMap<String, ProviderConfig>,
  pub active_provider: String,
  #[serde(default)]
  pub collaboration: CollaborationSettings,
  #[serde(default)]
  pub git: GitSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationSettings {
  #[serde(default)]
  pub enabled: bool,
  #[serde(default)]
  pub agents: Vec<AgentConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
  pub id: String,
  pub name: String,
  pub role: String,
  pub provider: String,
  pub model: String,
  pub system_prompt: String,
  #[serde(default = "default_true")]
  pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSettings {
  #[serde(default)]
  pub enabled: bool,
  #[serde(default)]
  pub repo_url: String,
  #[serde(default = "default_main_branch")]
  pub branch: String,
  pub last_sync: Option<i64>,
}

impl Default for GitSettings {
  fn default() -> Self {
    Self {
      enabled: false,
      repo_url: String::new(),
      branch: default_main_branch(),
      last_sync: None,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
  pub id: String,
  pub name: String,
  #[serde(default)]
  pub api_key: String,
  #[serde(default)]
  pub auth_token: String,
  pub base_url: Option<String>,
  pub wire_api: Option<String>,
  #[serde(default = "default_true")]
  pub enabled: bool,
  #[serde(default)]
  pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
  pub id: String,
  pub title: String,
  #[serde(default)]
  pub messages: Vec<Message>,
  pub updated_at: i64,
  pub model: Option<String>,
  pub provider: Option<String>,
  pub effort: Option<String>,
  #[serde(default)]
  pub workspace: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Message {
  pub id: String,
  pub role: String,
  pub content: String,
  pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatCompletionPayload {
  #[serde(default)]
  pub messages: Vec<Message>,
  pub settings: AppSettings,
  pub active_model: String,
  pub effort: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TitlePayload {
  pub first_message: String,
  pub settings: AppSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FetchProviderModelsPayload {
  pub provider_id: String,
  pub settings: AppSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FetchProviderModelsResponse {
  #[serde(default)]
  pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAnalysisPayload {
  pub root_path: String,
  pub settings: AppSettings,
  #[serde(default)]
  pub active_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncPayload {
  #[serde(default)]
  pub git: GitSettings,
  pub operation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncResponse {
  #[serde(default)]
  pub stdout: String,
  #[serde(default)]
  pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LocalToolConfigSource {
  pub path: String,
  #[serde(default)]
  pub keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LocalToolProviderPatch {
  pub api_key: Option<String>,
  pub auth_token: Option<String>,
  pub base_url: Option<String>,
  pub wire_api: Option<String>,
  #[serde(default)]
  pub models: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LocalToolConfigResponse {
  pub ok: bool,
  pub home_dir: Option<String>,
  pub error: Option<String>,
  #[serde(default)]
  pub providers: HashMap<String, LocalToolProviderPatch>,
  #[serde(default)]
  pub sources: Vec<LocalToolConfigSource>,
}

impl LocalToolConfigResponse {
  pub fn error(message: impl Into<String>) -> Self {
    Self {
      ok: false,
      error: Some(message.into()),
      ..Self::default()
    }
  }
}

fn default_true() -> bool {
  true
}

fn default_main_branch() -> String {
  "main".to_string()
}
