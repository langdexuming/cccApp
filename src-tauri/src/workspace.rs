use std::{env, fs, path::PathBuf, process::Command};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn display_workspace_path(path: &std::path::Path) -> String {
  let text = path.to_string_lossy().to_string();

  #[cfg(windows)]
  {
    if let Some(stripped) = text.strip_prefix(r"\\?\UNC\") {
      return format!(r"\\{stripped}");
    }
    if let Some(stripped) = text.strip_prefix(r"\\?\") {
      return stripped.to_string();
    }
  }

  text
}

fn resolve_workspace_path(raw: &str) -> Result<PathBuf, String> {
  let trimmed = raw.trim().trim_matches('"').trim_matches('\'');
  if trimmed.is_empty() {
    return Err("workspace path is empty".to_string());
  }

  let path = PathBuf::from(trimmed);
  let absolute = if path.is_absolute() {
    path
  } else {
    env::current_dir()
      .map_err(|err| format!("failed to resolve current directory: {err}"))?
      .join(path)
  };

  Ok(absolute)
}

#[tauri::command]
pub fn normalize_workspace_path(path: String) -> Result<String, String> {
  let absolute = resolve_workspace_path(&path)?;
  if absolute.exists() {
    let canonical = fs::canonicalize(&absolute)
      .map_err(|err| format!("failed to canonicalize workspace path: {err}"))?;
    if !canonical.is_dir() {
      return Err(format!(
        "workspace is not a directory: {}",
        display_workspace_path(&canonical)
      ));
    }
    return Ok(display_workspace_path(&canonical));
  }

  Ok(display_workspace_path(&absolute))
}

#[tauri::command]
pub fn pick_workspace_path() -> Result<Option<String>, String> {
  let selected = rfd::FileDialog::new().pick_folder();
  Ok(selected.map(|path| path.display().to_string()))
}

#[tauri::command]
pub fn open_workspace_path(path: String) -> Result<(), String> {
  let absolute = resolve_workspace_path(&path)?;
  if !absolute.exists() {
    return Err(format!(
      "workspace path does not exist: {}",
      display_workspace_path(&absolute)
    ));
  }
  if !absolute.is_dir() {
    return Err(format!(
      "workspace is not a directory: {}",
      display_workspace_path(&absolute)
    ));
  }

  #[cfg(windows)]
  {
    let mut command = Command::new("explorer");
    command.creation_flags(CREATE_NO_WINDOW);
    command.arg(absolute);
    command
      .spawn()
      .map_err(|err| format!("failed to open workspace in Explorer: {err}"))?;
  }

  #[cfg(target_os = "macos")]
  {
    Command::new("open")
      .arg(absolute)
      .spawn()
      .map_err(|err| format!("failed to open workspace in Finder: {err}"))?;
  }

  #[cfg(all(unix, not(target_os = "macos")))]
  {
    Command::new("xdg-open")
      .arg(absolute)
      .spawn()
      .map_err(|err| format!("failed to open workspace directory: {err}"))?;
  }

  Ok(())
}
