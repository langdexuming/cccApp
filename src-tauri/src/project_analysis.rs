use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use std::fmt::Write as _;

use crate::models::{ChatCompletionPayload, Message, ProjectAnalysisPayload};

fn now_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0)
}

fn skip_dir(name: &str) -> bool {
  matches!(
    name,
    "node_modules"
      | ".git"
      | "target"
      | "dist"
      | "build"
      | ".next"
      | "__pycache__"
      | ".venv"
      | "venv"
      | "Pods"
      | ".idea"
      | ".turbo"
      | "coverage"
      | ".cache"
      | "out"
      | ".cargo-target"
  ) || name.starts_with("__MACOSX")
}

fn interesting_file(name: &str) -> bool {
  let lower = name.to_ascii_lowercase();
  lower == "package.json"
    || lower == "cargo.toml"
    || lower == "pyproject.toml"
    || lower == "go.mod"
    || lower == "tsconfig.json"
    || lower == "readme.md"
    || lower == "readme.rst"
    || lower.ends_with(".sln")
}

fn read_snippet(path: &Path, max_bytes: usize) -> Option<String> {
  let bytes = fs::read(path).ok()?;
  let slice = if bytes.len() > max_bytes {
    &bytes[..max_bytes]
  } else {
    bytes.as_slice()
  };
  let text = String::from_utf8_lossy(slice).to_string();
  Some(text)
}

/// 生成有限深度的目录树与关键文件片段，供模型做项目分析。
fn collect_project_outline(root: &Path, max_chars: usize) -> Result<String, String> {
  let root = fs::canonicalize(root).map_err(|e| format!("无法解析项目路径: {e}"))?;
  let mut out = String::new();
  let mut seen_files = 0usize;
  let max_depth = 5usize;
  let max_files = 160usize;

  #[derive(Clone)]
  struct Job {
    path: PathBuf,
    depth: usize,
  }

  let mut stack: Vec<Job> = vec![Job {
    path: root.clone(),
    depth: 0,
  }];
  let mut visited_dirs: HashSet<PathBuf> = HashSet::new();

  while let Some(job) = stack.pop() {
    if out.len() >= max_chars || seen_files >= max_files {
      break;
    }
    if job.depth > max_depth {
      continue;
    }
    if !visited_dirs.insert(job.path.clone()) {
      continue;
    }

    let rel = job
      .path
      .strip_prefix(&root)
      .map(|p| p.display().to_string())
      .unwrap_or_else(|_| ".".to_string());

    let meta = match fs::metadata(&job.path) {
      Ok(m) => m,
      Err(_) => continue,
    };

    if meta.is_file() {
      seen_files += 1;
      let size = meta.len();
      let _ = writeln!(&mut out, "[file] {} ({} bytes)", rel, size);
      if interesting_file(job.path.file_name().and_then(|s| s.to_str()).unwrap_or("")) && out.len() < max_chars.saturating_sub(2048) {
        if let Some(snippet) = read_snippet(&job.path, 1800) {
          let _ = writeln!(&mut out, "----- 片段: {} -----\n{}\n-----", rel, snippet.trim());
        }
      }
      continue;
    }

    if !meta.is_dir() {
      continue;
    }

    let _ = writeln!(&mut out, "[dir] {}/", rel);
    let read_dir = match fs::read_dir(&job.path) {
      Ok(rd) => rd,
      Err(_) => continue,
    };

    let mut children: Vec<PathBuf> = Vec::new();
    for entry in read_dir.flatten() {
      let name = entry.file_name().to_string_lossy().to_string();
      if entry.path().is_dir() && skip_dir(&name) {
        continue;
      }
      children.push(entry.path());
    }
    children.sort();
    for path in children.into_iter().rev() {
      let name = path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
      if path.is_dir() && skip_dir(&name) {
        continue;
      }
      stack.push(Job {
        path,
        depth: job.depth + 1,
      });
    }
  }

  if out.trim().is_empty() {
    return Err("未扫描到可读文件，请检查路径与权限".to_string());
  }

  Ok(out)
}

/// 对本地目录做「结构扫描 + LLM 解读」的项目分析（依赖当前设置中的模型与密钥）。
#[tauri::command]
pub async fn analyze_project(payload: ProjectAnalysisPayload) -> Result<String, String> {
  let root = PathBuf::from(payload.root_path.trim());
  if root.as_os_str().is_empty() {
    return Err("请填写项目根目录路径".to_string());
  }

  let outline = collect_project_outline(&root, 14_000)?;
  let root_display = fs::canonicalize(&root)
    .map(|p| p.display().to_string())
    .unwrap_or_else(|_| payload.root_path.trim().to_string());

  let body = format!(
    "你是资深软件架构与代码审查顾问。下面是一份「本地项目目录」的自动扫描摘要（可能不完整）。\n\
请用 **中文 Markdown** 输出结构化分析，至少包含：\n\
1. 项目类型与技术栈推断\n\
2. 目录与模块职责概述\n\
3. 可维护性 / 风险点（依赖、构建产物、敏感信息等）\n\
4. 建议的下一步阅读或重构切入点\n\n\
项目根路径：`{root_display}`\n\n\
----- 扫描摘要开始 -----\n\
{outline}\n\
----- 扫描摘要结束 -----",
  );

  let completion = ChatCompletionPayload {
    messages: vec![Message {
      id: "project-analysis".to_string(),
      role: "user".to_string(),
      content: body,
      timestamp: now_ms(),
    }],
    settings: payload.settings,
    active_model: payload.active_model.trim().to_string(),
    effort: None,
  };

  crate::chat::chat_completion(completion).await
}
