use std::env;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde_json::{json, Value};
use tokio::io::{AsyncWriteExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

use crate::cli_session_store;
use crate::models::ProviderConfig;
use crate::text_decode::{collect_decoded_output, read_decoded_line};

const SESSION_NAMESPACE: Uuid = Uuid::from_bytes([
  0x19, 0x9d, 0xc5, 0x66, 0x80, 0x0f, 0x4d, 0xa9, 0x98, 0x13, 0xf7, 0x61, 0x18, 0x43, 0x9d, 0x2f,
]);

#[derive(Debug)]
struct CliArgs {
  args: Vec<String>,
  via_stdin: bool,
}

fn derive_session_id(chat_id: &str) -> String {
  Uuid::new_v5(&SESSION_NAMESPACE, chat_id.as_bytes()).to_string()
}

fn openclaude_binary() -> String {
  if let Ok(path) = env::var("OPENCLAUDE_CLI_PATH") {
    let trimmed = path.trim();
    if !trimmed.is_empty() {
      return trimmed.to_string();
    }
  }

  which_openclaude()
    .map(|path| path.to_string_lossy().to_string())
    .unwrap_or_else(|| "openclaude".to_string())
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn build_openclaude_command(bin: &str) -> Command {
  #[cfg(windows)]
  {
    let lower = bin.to_ascii_lowercase();
    if lower.ends_with(".cmd") || lower.ends_with(".bat") {
      let mut cmd = Command::new("cmd");
      cmd.creation_flags(CREATE_NO_WINDOW);
      cmd.arg("/c");
      cmd.arg(bin);
      return cmd;
    }
    let mut cmd = Command::new(bin);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
  }
  #[cfg(not(windows))]
  {
    Command::new(bin)
  }
}

fn which_openclaude() -> Option<PathBuf> {
  let raw = env::var_os("PATH")?;
  let ext_list: Vec<String> = if cfg!(windows) {
    env::var("PATHEXT")
      .unwrap_or_else(|_| ".EXE;.CMD;.BAT".to_string())
      .split(';')
      .map(|item| item.trim().to_string())
      .filter(|item| !item.is_empty())
      .collect()
  } else {
    vec![String::new()]
  };

  for entry in env::split_paths(&raw) {
    for ext in &ext_list {
      let candidate = if ext.is_empty() {
        entry.join("openclaude")
      } else {
        entry.join(format!("openclaude{ext}"))
      };
      if candidate.is_file() {
        return Some(candidate);
      }
    }
  }

  None
}

fn build_args(
  model: &str,
  session_id: &str,
  is_first_turn: bool,
  user_message: &str,
  use_stdin: bool,
) -> CliArgs {
  let mut args: Vec<String> = Vec::new();
  args.push("-p".to_string());

  if use_stdin {
    args.push(String::new());
    args.push("--input-format".to_string());
    args.push("stream-json".to_string());
  } else {
    args.push(user_message.to_string());
  }

  args.push("--output-format".to_string());
  args.push("stream-json".to_string());
  args.push("--verbose".to_string());
  args.push("--permission-mode".to_string());
  args.push("default".to_string());
  args.push("--provider".to_string());
  args.push("openai".to_string());
  args.push("--model".to_string());
  args.push(model.to_string());

  if is_first_turn {
    args.push("--session-id".to_string());
    args.push(session_id.to_string());
  } else {
    args.push("--resume".to_string());
    args.push(session_id.to_string());
  }

  CliArgs {
    args,
    via_stdin: use_stdin,
  }
}

fn should_use_stdin(user_message: &str) -> bool {
  user_message.contains('\n') || user_message.contains('\r')
}

fn stdin_payload(user_message: &str) -> String {
  let payload = json!({
    "type": "user",
    "message": {
      "role": "user",
      "content": [{ "type": "text", "text": user_message }],
    }
  });
  format!("{payload}\n")
}

fn extract_assistant_delta(event: &Value) -> Option<String> {
  let message = event.get("message")?;
  let content = message.get("content")?.as_array()?;
  let mut out = String::new();
  for block in content {
    if block.get("type").and_then(Value::as_str) == Some("text") {
      if let Some(text) = block.get("text").and_then(Value::as_str) {
        out.push_str(text);
      }
    }
  }
  if out.is_empty() {
    None
  } else {
    Some(out)
  }
}

fn extract_result_fallback(event: &Value) -> Option<String> {
  if let Some(text) = event.get("result").and_then(Value::as_str) {
    if !text.trim().is_empty() {
      return Some(text.to_string());
    }
  }
  if let Some(arr) = event
    .get("result")
    .and_then(|result| result.get("content"))
    .and_then(Value::as_array)
  {
    let mut out = String::new();
    for block in arr {
      if let Some(text) = block.get("text").and_then(Value::as_str) {
        out.push_str(text);
      }
    }
    if !out.is_empty() {
      return Some(out);
    }
  }
  if let Some(text) = event.get("content").and_then(Value::as_str) {
    if !text.trim().is_empty() {
      return Some(text.to_string());
    }
  }
  None
}

fn extract_result_error(event: &Value) -> Option<String> {
  event
    .get("error")
    .and_then(Value::as_str)
    .map(str::to_string)
    .or_else(|| event.get("message").and_then(Value::as_str).map(str::to_string))
    .filter(|value| !value.trim().is_empty())
}

fn apply_provider_env(cmd: &mut Command, provider: &ProviderConfig, model: &str) {
  let base_url = provider
    .base_url
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or_default();

  cmd.env("CLAUDE_CODE_USE_OPENAI", "1");
  cmd.env("OPENAI_BASE_URL", base_url);
  cmd.env("OPENAI_MODEL", model.trim());

  let api_key = provider.api_key.trim();
  if api_key.is_empty() {
    cmd.env_remove("OPENAI_API_KEY");
  } else {
    cmd.env("OPENAI_API_KEY", api_key);
  }

  cmd.env_remove("ANTHROPIC_BASE_URL");
  cmd.env_remove("ANTHROPIC_API_KEY");
  cmd.env_remove("ANTHROPIC_AUTH_TOKEN");
  cmd.env_remove("CLAUDE_CODE_USE_GITHUB");
  cmd.env_remove("CLAUDE_CODE_USE_GEMINI");
  cmd.env_remove("CLAUDE_CODE_USE_MISTRAL");
  cmd.env_remove("CLAUDE_CODE_USE_BEDROCK");
  cmd.env_remove("CLAUDE_CODE_USE_VERTEX");
  cmd.env_remove("CLAUDE_CODE_USE_FOUNDRY");

  cmd.env("DISABLE_TELEMETRY", "1");
  cmd.env("DISABLE_ERROR_REPORTING", "1");
  cmd.env("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1");

  #[cfg(windows)]
  apply_windows_git_bash_env(cmd);
}

#[cfg(windows)]
fn apply_windows_git_bash_env(cmd: &mut Command) {
  if let Ok(existing) = env::var("CLAUDE_CODE_GIT_BASH_PATH") {
    if !existing.trim().is_empty() {
      return;
    }
  }
  let candidates = [
    r"D:\Program Files\Git\bin\bash.exe",
    r"C:\Program Files\Git\bin\bash.exe",
    r"C:\Program Files (x86)\Git\bin\bash.exe",
    r"D:\Program Files (x86)\Git\bin\bash.exe",
  ];
  for candidate in candidates {
    if Path::new(candidate).is_file() {
      cmd.env("CLAUDE_CODE_GIT_BASH_PATH", candidate);
      return;
    }
  }
  if let Some(path_os) = env::var_os("PATH") {
    for entry in env::split_paths(&path_os) {
      let candidate = entry.join("bash.exe");
      if candidate.is_file() {
        let as_str = candidate.to_string_lossy().to_string();
        let lowered = as_str.to_ascii_lowercase();
        if lowered.contains("\\git\\") || lowered.contains("/git/") {
          cmd.env("CLAUDE_CODE_GIT_BASH_PATH", &as_str);
          return;
        }
      }
    }
  }
}

pub async fn chat_with_openai_compatible_claude_bridge(
  provider: &ProviderConfig,
  model: &str,
  messages: &[crate::models::Message],
  workspace: Option<&str>,
) -> Result<String, String> {
  let user_message = last_user_message(messages)
    .ok_or_else(|| "对话中没有待发送的用户消息。".to_string())?;
  let base_seed = messages
    .first()
    .map(|message| message.id.as_str())
    .filter(|id| !id.is_empty())
    .unwrap_or("cccapp-openclaude-bridge");
  let seed = cli_session_store::session_seed(base_seed, workspace);
  let session_id = derive_session_id(&seed);
  let first_turn = is_first_turn(messages);

  match invoke_openclaude_bridge(provider, model, &session_id, first_turn, user_message, workspace)
    .await
  {
    Ok(text) => Ok(text),
    Err(err) if first_turn && err.contains("already in use") => {
      invoke_openclaude_bridge(provider, model, &session_id, false, user_message, workspace).await
    }
    Err(err) if !first_turn && looks_like_missing_session(&err) => {
      invoke_openclaude_bridge(provider, model, &session_id, true, user_message, workspace).await
    }
    Err(err) => Err(err),
  }
}

pub async fn title_with_openai_compatible_claude_bridge(
  provider: &ProviderConfig,
  model: &str,
  prompt: &str,
) -> Result<String, String> {
  let session_id = Uuid::new_v4().to_string();
  invoke_openclaude_bridge(provider, model, &session_id, true, prompt, None).await
}

fn looks_like_missing_session(err: &str) -> bool {
  let lowered = err.to_ascii_lowercase();
  lowered.contains("no such session")
    || lowered.contains("session not found")
    || lowered.contains("could not find session")
    || lowered.contains("does not exist")
}

async fn invoke_openclaude_bridge(
  provider: &ProviderConfig,
  model: &str,
  session_id: &str,
  is_first_turn: bool,
  user_message: &str,
  workspace: Option<&str>,
) -> Result<String, String> {
  if user_message.trim().is_empty() {
    return Err("消息内容为空，无法发送到 Claude bridge。".to_string());
  }

  let base_url = provider
    .base_url
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .ok_or_else(|| "请先为 OpenAI-compatible provider 配置 Base URL".to_string())?;

  let use_stdin = should_use_stdin(user_message);
  let built = build_args(model, session_id, is_first_turn, user_message, use_stdin);

  let bin = openclaude_binary();
  let mut cmd = build_openclaude_command(&bin);
  cmd.args(&built.args);
  if let Some(workspace) = workspace.map(str::trim).filter(|value| !value.is_empty()) {
    cmd.current_dir(workspace);
  }
  cmd.stdout(Stdio::piped());
  cmd.stderr(Stdio::piped());
  if built.via_stdin {
    cmd.stdin(Stdio::piped());
  } else {
    cmd.stdin(Stdio::null());
  }
  apply_provider_env(&mut cmd, provider, model);

  let mut child = cmd.spawn().map_err(|err| {
    format!(
      "启动 OpenClaude bridge 失败: {err} (binary: {bin}). 请确认已安装 `openclaude`，或用 OPENCLAUDE_CLI_PATH 指向可执行文件。"
    )
  })?;

  if built.via_stdin {
    if let Some(mut stdin) = child.stdin.take() {
      let payload = stdin_payload(user_message);
      if let Err(err) = stdin.write_all(payload.as_bytes()).await {
        let _ = child.kill().await;
        return Err(format!("写入 OpenClaude bridge stdin 失败: {err}"));
      }
      drop(stdin);
    }
  }

  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| "OpenClaude bridge 未提供 stdout，无法读取响应。".to_string())?;
  let stderr = child
    .stderr
    .take()
    .ok_or_else(|| "OpenClaude bridge 未提供 stderr。".to_string())?;

  let stderr_task = tokio::spawn(async move { collect_decoded_output(stderr, 8192).await });

  let mut reader = BufReader::new(stdout);
  let mut line_buf = Vec::new();
  let mut accumulated = String::new();
  let mut fallback: Option<String> = None;
  let mut result_error: Option<String> = None;
  let mut non_json_stdout = String::new();

  while let Ok(Some(raw_line)) = read_decoded_line(&mut reader, &mut line_buf).await {
    let trimmed = raw_line.trim();
    if trimmed.is_empty() {
      continue;
    }

    let event: Value = match serde_json::from_str(trimmed) {
      Ok(value) => value,
      Err(_) => {
        if non_json_stdout.len() < 4096 {
          non_json_stdout.push_str(trimmed);
          non_json_stdout.push('\n');
        }
        continue;
      }
    };

    match event.get("type").and_then(Value::as_str).unwrap_or("") {
      "assistant" => {
        if let Some(delta) = extract_assistant_delta(&event) {
          accumulated.push_str(&delta);
        }
      }
      "result" => {
        let subtype = event.get("subtype").and_then(Value::as_str).unwrap_or("");
        let is_success_subtype = subtype.eq_ignore_ascii_case("success");
        let is_error_flag = event.get("is_error").and_then(Value::as_bool).unwrap_or(false);
        let has_error_string = extract_result_error(&event).is_some();

        let fallback_text = extract_result_fallback(&event);

        if is_success_subtype && !is_error_flag {
          if let Some(text) = fallback_text.clone() {
            if !text.trim().is_empty() {
              fallback = Some(text);
            }
          }
          result_error = None;
        } else if is_error_flag || subtype.contains("error") || has_error_string {
          if fallback.is_none() {
            fallback = fallback_text;
          }
          result_error = Some(extract_result_error(&event).unwrap_or_else(|| {
            if subtype.is_empty() {
              "OpenClaude bridge 上游返回错误".to_string()
            } else {
              format!("OpenClaude bridge 上游返回错误 (subtype={subtype})")
            }
          }));
        } else if fallback.is_none() {
          fallback = fallback_text;
        }
      }
      _ => {}
    }
  }

  let status = child
    .wait()
    .await
    .map_err(|err| format!("等待 OpenClaude bridge 结束失败: {err}"))?;
  let stderr_text = stderr_task.await.unwrap_or_default();

  let text = if !accumulated.trim().is_empty() {
    accumulated
  } else if let Some(text) = fallback {
    text
  } else {
    String::new()
  };

  if !status.success() {
    let stdout_err = non_json_stdout.trim();
    let stderr_err = stderr_text.trim();
    let combined = result_error
      .clone()
      .or_else(|| {
        if !stdout_err.is_empty() {
          Some(stdout_err.to_string())
        } else if !stderr_err.is_empty() {
          Some(stderr_err.to_string())
        } else {
          None
        }
      })
      .unwrap_or_else(|| format!("OpenClaude bridge exited with status {status}"));
    return Err(format!(
      "OpenAI-compatible Claude bridge 调用失败: {combined}\nBase URL: {base_url}"
    ));
  }

  if let Some(err) = result_error {
    if text.trim().is_empty() {
      return Err(format!("OpenAI-compatible Claude bridge 返回错误: {err}"));
    }
  }

  if text.trim().is_empty() {
    let stderr_err = stderr_text.trim();
    let stdout_err = non_json_stdout.trim();
    if !stdout_err.is_empty() {
      return Err(format!("OpenClaude bridge 未返回内容: {stdout_err}"));
    }
    if !stderr_err.is_empty() {
      return Err(format!("OpenClaude bridge 未返回内容: {stderr_err}"));
    }
    return Err("OpenClaude bridge 返回了空内容。".to_string());
  }

  Ok(text)
}

fn is_first_turn(messages: &[crate::models::Message]) -> bool {
  !messages.iter().any(|message| message.role == "assistant")
}

fn last_user_message(messages: &[crate::models::Message]) -> Option<&str> {
  messages
    .iter()
    .rev()
    .find(|message| message.role == "user")
    .map(|message| message.content.as_str())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn derives_stable_bridge_session_id_from_chat_id() {
    let a = derive_session_id("chat-abc");
    let b = derive_session_id("chat-abc");
    let c = derive_session_id("chat-xyz");
    assert_eq!(a, b);
    assert_ne!(a, c);
    assert!(Uuid::parse_str(&a).is_ok());
  }

  #[test]
  fn build_args_use_openai_provider_and_session_id() {
    let built = build_args("gpt-4.1", "sess-1", true, "hi", false);
    let joined = built.args.join(" ");
    assert!(joined.contains("--provider openai"));
    assert!(joined.contains("--session-id sess-1"));
    assert!(joined.contains("--model gpt-4.1"));
    assert!(joined.contains("--output-format stream-json"));
    assert!(!built.via_stdin);
  }

  #[test]
  fn build_args_resume_uses_resume_flag() {
    let built = build_args("gpt-4.1", "sess-1", false, "hi", false);
    let joined = built.args.join(" ");
    assert!(joined.contains("--resume sess-1"));
    assert!(!joined.contains("--session-id"));
  }

  #[test]
  fn stdin_payload_has_stream_json_user_shape() {
    let payload = stdin_payload("hello");
    let value: Value = serde_json::from_str(payload.trim()).unwrap();
    assert_eq!(value["type"], json!("user"));
    assert_eq!(value["message"]["role"], json!("user"));
    assert_eq!(value["message"]["content"][0]["type"], json!("text"));
    assert_eq!(value["message"]["content"][0]["text"], json!("hello"));
  }
}
