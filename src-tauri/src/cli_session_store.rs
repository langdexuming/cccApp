use std::{
  collections::HashMap,
  env, fs,
  path::PathBuf,
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Serialize, Deserialize)]
struct SessionStore {
  #[serde(default)]
  entries: HashMap<String, String>,
}

fn session_store_dir() -> PathBuf {
  dirs::data_local_dir()
    .or_else(dirs::config_local_dir)
    .unwrap_or_else(env::temp_dir)
    .join("ccc-app")
}

fn session_store_path() -> PathBuf {
  session_store_dir().join("cli_sessions.json")
}

fn session_key(provider_id: &str, seed: &str) -> String {
  format!("{provider_id}:{seed}")
}

pub fn session_seed(base_seed: &str, workspace: Option<&str>) -> String {
  let base = base_seed.trim();
  let workspace = workspace
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or("(no-workspace)");
  format!("{workspace}::{base}")
}

fn load_store() -> SessionStore {
  let path = session_store_path();
  let Ok(raw) = fs::read_to_string(path) else {
    return SessionStore::default();
  };

  serde_json::from_str::<SessionStore>(&raw).unwrap_or_default()
}

fn save_store(store: &SessionStore) -> Result<(), String> {
  let path = session_store_path();
  let dir = path
    .parent()
    .ok_or_else(|| "failed to resolve CLI session store directory".to_string())?;
  fs::create_dir_all(dir).map_err(|err| format!("failed to create CLI session store: {err}"))?;
  let payload = serde_json::to_string_pretty(store)
    .map_err(|err| format!("failed to serialize CLI session store: {err}"))?;
  fs::write(&path, payload).map_err(|err| format!("failed to write CLI session store: {err}"))
}

pub fn load_session(provider_id: &str, seed: &str) -> Option<String> {
  load_store().entries.get(&session_key(provider_id, seed)).cloned()
}

pub fn save_session(provider_id: &str, seed: &str, session_id: &str) -> Result<(), String> {
  let mut store = load_store();
  store
    .entries
    .insert(session_key(provider_id, seed), session_id.trim().to_string());
  save_store(&store)
}

pub fn clear_session(provider_id: &str, seed: &str) -> Result<(), String> {
  let mut store = load_store();
  store.entries.remove(&session_key(provider_id, seed));
  save_store(&store)
}

pub fn managed_home_dir(name: &str) -> Result<PathBuf, String> {
  let dir = session_store_dir().join(name);
  fs::create_dir_all(&dir).map_err(|err| format!("failed to create managed CLI home: {err}"))?;
  Ok(dir)
}
