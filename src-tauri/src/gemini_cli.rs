use std::env;
use std::path::PathBuf;
use std::process::Stdio;

use serde_json::Value;
use tokio::io::BufReader;
use tokio::process::Command;

use crate::cli_session_store;
use crate::models::{Message, ProviderConfig};
use crate::text_decode::{collect_decoded_output, read_decoded_line};

const PROVIDER_ID: &str = "gemini";

fn gemini_binary() -> String {
  if let Ok(path) = env::var("GEMINI_CLI_PATH") {
    let trimmed = path.trim();
    if !trimmed.is_empty() {
      return trimmed.to_string();
    }
  }

  which_gemini()
    .map(|path| path.to_string_lossy().to_string())
    .unwrap_or_else(|| "gemini".to_string())
}

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn build_command(bin: &str) -> Command {
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

fn which_gemini() -> Option<PathBuf> {
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
        entry.join("gemini")
      } else {
        entry.join(format!("gemini{ext}"))
      };
      if candidate.is_file() {
        return Some(candidate);
      }
    }
  }
  None
}

fn base_session_seed(messages: &[Message]) -> String {
  messages
    .first()
    .map(|message| message.id.as_str())
    .filter(|id| !id.trim().is_empty())
    .unwrap_or("cccapp-gemini-cli")
    .to_string()
}

fn last_user_message(messages: &[Message]) -> Option<&str> {
  messages
    .iter()
    .rev()
    .find(|message| message.role == "user")
    .map(|message| message.content.as_str())
}

fn is_first_turn(messages: &[Message]) -> bool {
  !messages.iter().any(|message| message.role == "assistant")
}

fn transcript_prompt(messages: &[Message]) -> String {
  let mut lines = vec![
    "Continue the conversation below and answer the final user message naturally.".to_string(),
    "Only answer as the assistant; do not repeat the transcript unless useful.".to_string(),
    String::new(),
    "Transcript:".to_string(),
  ];

  for message in messages {
    let role = message.role.to_ascii_uppercase();
    lines.push(format!("{role}: {}", message.content.trim()));
  }

  lines.join("\n")
}

fn should_retry_without_resume(message: &str) -> bool {
  let lowered = message.to_ascii_lowercase();
  lowered.contains("resume")
    && (lowered.contains("not found")
      || lowered.contains("no sessions found")
      || lowered.contains("invalid session")
      || lowered.contains("missing"))
}

fn apply_provider_env(cmd: &mut Command, provider: &ProviderConfig) -> Result<(), String> {
  let home = cli_session_store::managed_home_dir("gemini-cli-home")?;
  let home_str = home.to_string_lossy().to_string();
  cmd.env("HOME", &home_str);
  cmd.env("USERPROFILE", &home_str);

  let gemini_dir = home.join(".gemini");
  std::fs::create_dir_all(&gemini_dir)
    .map_err(|err| format!("failed to prepare Gemini CLI home: {err}"))?;

  let api_key = provider.api_key.trim();
  if !api_key.is_empty() {
    cmd.env("GEMINI_API_KEY", api_key);
    cmd.env("GOOGLE_API_KEY", api_key);
  }

  if let Some(base_url) = provider
    .base_url
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
  {
    cmd.env("GOOGLE_GEMINI_BASE_URL", base_url);
  }

  Ok(())
}

async fn invoke_gemini_cli(
  provider: &ProviderConfig,
  model: &str,
  prompt: &str,
  session_id: Option<&str>,
  workspace: Option<&str>,
) -> Result<(String, Option<String>), String> {
  if prompt.trim().is_empty() {
    return Err("Gemini CLI message content is empty.".to_string());
  }

  let bin = gemini_binary();
  let mut cmd = build_command(&bin);
  cmd.arg("--prompt");
  cmd.arg(prompt);
  cmd.arg("--output-format");
  cmd.arg("stream-json");
  cmd.arg("--approval-mode");
  cmd.arg("plan");
  cmd.arg("--model");
  cmd.arg(model.trim());

  if let Some(session_id) = session_id.filter(|value| !value.trim().is_empty()) {
    cmd.arg("--resume");
    cmd.arg(session_id);
  }

  cmd.stdin(Stdio::null());
  cmd.stdout(Stdio::piped());
  cmd.stderr(Stdio::piped());
  if let Some(workspace) = workspace.map(str::trim).filter(|value| !value.is_empty()) {
    cmd.current_dir(workspace);
  }
  apply_provider_env(&mut cmd, provider)?;

  let mut child = cmd
    .spawn()
    .map_err(|err| format!("failed to start Gemini CLI: {err} (binary: {bin})"))?;

  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| "Gemini CLI did not expose stdout.".to_string())?;
  let stderr = child
    .stderr
    .take()
    .ok_or_else(|| "Gemini CLI did not expose stderr.".to_string())?;

  let stderr_task = tokio::spawn(async move { collect_decoded_output(stderr, 8192).await });

  let mut reader = BufReader::new(stdout);
  let mut line_buf = Vec::new();
  let mut text = String::new();
  let mut session = None;
  let mut last_error = None;
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
      "init" => {
        if session.is_none() {
          session = event
            .get("session_id")
            .and_then(Value::as_str)
            .map(str::to_string);
        }
      }
      "message" => {
        let is_assistant = event.get("role").and_then(Value::as_str) == Some("assistant");
        let is_delta = event.get("delta").and_then(Value::as_bool).unwrap_or(false);
        if is_assistant && is_delta {
          if let Some(content) = event.get("content").and_then(Value::as_str) {
            text.push_str(content);
          }
        }
      }
      "error" => {
        last_error = event
          .get("message")
          .and_then(Value::as_str)
          .map(str::to_string)
          .or(last_error);
      }
      _ => {}
    }
  }

  let status = child
    .wait()
    .await
    .map_err(|err| format!("failed while waiting for Gemini CLI: {err}"))?;
  let stderr_text = stderr_task.await.unwrap_or_default();

  if !status.success() {
    return Err(
      last_error
        .or_else(|| {
          let stdout_text = non_json_stdout.trim();
          if !stdout_text.is_empty() {
            Some(stdout_text.to_string())
          } else {
            None
          }
        })
        .or_else(|| {
          let stderr_text = stderr_text.trim();
          if !stderr_text.is_empty() {
            Some(stderr_text.to_string())
          } else {
            None
          }
        })
        .unwrap_or_else(|| format!("Gemini CLI exited with {status}")),
    );
  }

  if text.trim().is_empty() {
    if let Some(err) = last_error {
      return Err(err);
    }
    if !stderr_text.trim().is_empty() {
      return Err(stderr_text.trim().to_string());
    }
    if !non_json_stdout.trim().is_empty() {
      return Err(non_json_stdout.trim().to_string());
    }
    return Err("Gemini CLI returned empty content.".to_string());
  }

  Ok((text, session))
}

pub async fn chat_with_gemini_cli(
  provider: &ProviderConfig,
  model: &str,
  messages: &[Message],
  workspace: Option<&str>,
) -> Result<String, String> {
  let seed = cli_session_store::session_seed(&base_session_seed(messages), workspace);
  let first_turn = is_first_turn(messages);
  if first_turn {
    let _ = cli_session_store::clear_session(PROVIDER_ID, &seed);
  }

  let prompt = if first_turn {
    last_user_message(messages)
      .ok_or_else(|| "No user message was found for Gemini CLI.".to_string())?
      .to_string()
  } else {
    transcript_prompt(messages)
  };

  let stored_session = if first_turn {
    None
  } else {
    cli_session_store::load_session(PROVIDER_ID, &seed)
  };

  match invoke_gemini_cli(provider, model, &prompt, stored_session.as_deref(), workspace).await {
    Ok((text, session)) => {
      if let Some(session) = session {
        let _ = cli_session_store::save_session(PROVIDER_ID, &seed, &session);
      }
      Ok(text)
    }
    Err(err) if stored_session.is_some() && should_retry_without_resume(&err) => {
      let _ = cli_session_store::clear_session(PROVIDER_ID, &seed);
      let (text, session) = invoke_gemini_cli(provider, model, &prompt, None, workspace).await?;
      if let Some(session) = session {
        let _ = cli_session_store::save_session(PROVIDER_ID, &seed, &session);
      }
      Ok(text)
    }
    Err(err) => Err(err),
  }
}

pub async fn title_with_gemini_cli(
  provider: &ProviderConfig,
  model: &str,
  prompt: &str,
) -> Result<String, String> {
  invoke_gemini_cli(provider, model, prompt, None, None)
    .await
    .map(|(text, _)| text)
}
