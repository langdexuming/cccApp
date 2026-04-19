mod app_state;
mod chat;
mod claude_cli;
mod git;
mod local_config;
mod models;

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
      git::git_sync
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
