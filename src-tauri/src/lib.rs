mod app_state;
mod chat;
mod claude_cli;
mod cli_session_store;
mod codex_cli;
mod gemini_cli;
mod git;
mod local_config;
mod models;
mod project_analysis;
mod text_decode;
mod workspace;
mod workspace_history;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      app_state::load_app_state,
      app_state::save_app_state,
      local_config::read_local_tool_configs,
      chat::chat_completion,
      chat::generate_chat_title,
      chat::fetch_provider_models,
      git::git_sync,
      project_analysis::analyze_project,
      project_analysis::read_project_context,
      project_analysis::generate_project_text,
      project_analysis::apply_project_fix,
      project_analysis::get_kairos_logs,
      workspace::normalize_workspace_path,
      workspace::pick_workspace_path,
      workspace::open_workspace_path,
      workspace_history::get_workspace_external_conversations
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
