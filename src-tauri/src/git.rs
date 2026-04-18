use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use crate::models::{GitSyncPayload, GitSyncResponse};

fn find_git_root(start: &Path) -> Option<PathBuf> {
  for candidate in start.ancestors() {
    if candidate.join(".git").exists() {
      return Some(candidate.to_path_buf());
    }
  }
  None
}

fn discover_repo_root() -> Result<PathBuf, String> {
  let mut candidates = Vec::new();
  if let Ok(current_dir) = std::env::current_dir() {
    candidates.push(current_dir);
  }
  if let Ok(current_exe) = std::env::current_exe() {
    if let Some(parent) = current_exe.parent() {
      candidates.push(parent.to_path_buf());
    }
  }

  for candidate in candidates {
    if let Some(root) = find_git_root(&candidate) {
      return Ok(root);
    }
  }

  Err("未找到本地 Git 仓库，请在仓库目录中启动桌面版。".to_string())
}

fn run_git(repo_root: &Path, args: &[&str]) -> Result<Output, String> {
  Command::new("git")
    .args(args)
    .current_dir(repo_root)
    .output()
    .map_err(|err| format!("执行 git 命令失败: {err}"))
}

fn ensure_origin(repo_root: &Path, repo_url: &str) -> Result<(), String> {
  let repo_url = repo_url.trim();
  if repo_url.is_empty() {
    return Ok(());
  }

  match run_git(repo_root, &["remote", "get-url", "origin"]) {
    Ok(output) if output.status.success() => {
      let current_url = String::from_utf8_lossy(&output.stdout).trim().to_string();
      if current_url != repo_url {
        let output = run_git(repo_root, &["remote", "set-url", "origin", repo_url])?;
        if !output.status.success() {
          let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
          return Err(if stderr.is_empty() {
            "更新 origin 地址失败".to_string()
          } else {
            stderr
          });
        }
      }
      Ok(())
    }
    _ => {
      let output = run_git(repo_root, &["remote", "add", "origin", repo_url])?;
      if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
          "添加 origin 地址失败".to_string()
        } else {
          stderr
        });
      }
      Ok(())
    }
  }
}

#[tauri::command]
pub fn git_sync(payload: GitSyncPayload) -> Result<GitSyncResponse, String> {
  let repo_root = discover_repo_root()?;
  ensure_origin(&repo_root, &payload.git.repo_url)?;

  let branch = if payload.git.branch.trim().is_empty() {
    "main"
  } else {
    payload.git.branch.trim()
  };

  let args: Vec<&str> = match payload.operation.as_str() {
    "pull" => vec!["pull", "origin", branch],
    "push" => vec!["push", "-u", "origin", branch],
    other => return Err(format!("不支持的 Git 操作: {other}")),
  };

  let output = run_git(&repo_root, &args)?;
  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

  if !output.status.success() {
    let combined = match (stdout.is_empty(), stderr.is_empty()) {
      (false, false) => format!("{stderr}\n{stdout}"),
      (false, true) => stdout.clone(),
      (true, false) => stderr.clone(),
      (true, true) => format!("git {} 执行失败", payload.operation),
    };
    return Err(combined);
  }

  Ok(GitSyncResponse {stdout, stderr})
}
