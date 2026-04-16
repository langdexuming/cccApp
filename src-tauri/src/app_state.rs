use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

use crate::models::PersistedAppState;

fn state_file_path(app: &AppHandle) -> Result<PathBuf, String> {
  let mut dir = app
    .path()
    .app_data_dir()
    .map_err(|err| format!("failed to resolve app data directory: {err}"))?;
  fs::create_dir_all(&dir).map_err(|err| format!("failed to create app data directory: {err}"))?;
  dir.push("state.json");
  Ok(dir)
}

#[tauri::command]
pub fn load_app_state(app: AppHandle) -> Result<Option<PersistedAppState>, String> {
  let file_path = state_file_path(&app)?;
  if !file_path.exists() {
    return Ok(None);
  }

  let raw = fs::read_to_string(&file_path)
    .map_err(|err| format!("failed to read state file {}: {err}", file_path.display()))?;
  let state = serde_json::from_str::<PersistedAppState>(&raw)
    .map_err(|err| format!("failed to parse state file {}: {err}", file_path.display()))?;
  Ok(Some(state))
}

#[tauri::command]
pub fn save_app_state(app: AppHandle, state: PersistedAppState) -> Result<(), String> {
  let file_path = state_file_path(&app)?;
  let raw = serde_json::to_string_pretty(&state)
    .map_err(|err| format!("failed to serialize app state: {err}"))?;
  fs::write(&file_path, raw)
    .map_err(|err| format!("failed to write state file {}: {err}", file_path.display()))?;
  Ok(())
}
