use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tokio::sync::Mutex;

pub mod api;
pub mod auth;
pub mod command;
pub mod config;
pub mod device_id;
pub mod logger;
pub mod mdns;
pub mod models;
pub mod state;
pub mod websocket;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    env_logger::init();

    let state = Arc::new(Mutex::new(AppState::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            start_server,
            stop_server,
            get_server_status,
            get_system_info,
            execute_command,
            get_logs,
            clear_logs,
            get_config,
            save_config,
            set_config_password,
            verify_config_password,
            has_config_password,
            clear_config_password,
            get_log_file_info,
            reload_config,
            open_path,
        ])
        .setup(|app| {
            log::info!("LanDevice Manager setup...");

            // 创建托盘菜单
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let start_server_i =
                MenuItem::with_id(app, "start_server", "Start Server", true, None::<&str>)?;
            let stop_server_i =
                MenuItem::with_id(app, "stop_server", "Stop Server", true, None::<&str>)?;
            let separator2 = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &show_i,
                    &hide_i,
                    &separator,
                    &start_server_i,
                    &stop_server_i,
                    &separator2,
                    &quit_i,
                ],
            )?;

            // 创建托盘图标
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                show_notification("LanDevice Manager", "Window shown");
                            }
                        }
                        "hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                                show_notification("LanDevice Manager", "Window hidden to tray");
                            }
                        }
                        "start_server" => {
                            // 通过事件通知前端启动服务
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("tray-start-server", ());
                                show_notification("LanDevice Manager", "Starting API server...");
                            }
                        }
                        "stop_server" => {
                            // 通过事件通知前端停止服务
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("tray-stop-server", ());
                                show_notification("LanDevice Manager", "Stopping API server...");
                            }
                        }
                        "quit" => {
                            show_notification("LanDevice Manager", "Application closed");
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn start_server(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    port: u16,
) -> Result<String, String> {
    let mut state = state.lock().await;
    state.start_server(port).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_server(state: tauri::State<'_, Arc<Mutex<AppState>>>) -> Result<String, String> {
    let mut state = state.lock().await;
    state.stop_server().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_server_status(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<models::ServerStatus, String> {
    let state = state.lock().await;
    Ok(state.get_status())
}

#[tauri::command]
async fn get_system_info() -> Result<models::SystemInfo, String> {
    command::get_system_info().map_err(|e| e.to_string())
}

#[tauri::command]
async fn execute_command(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    command_type: String,
    args: Option<Vec<String>>,
) -> Result<models::CommandResult, String> {
    let state = state.lock().await;
    state
        .command_executor
        .execute(&command_type, args.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_logs(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    limit: Option<usize>,
) -> Result<Vec<models::LogEntry>, String> {
    let state = state.lock().await;
    let mut logs = state.logger.get_logs(limit.unwrap_or(100));
    // 合并 API 日志
    let api_logs = api::get_api_logs(limit.unwrap_or(100));
    logs.extend(api_logs);
    // 按时间排序
    logs.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    // 限制数量
    if logs.len() > limit.unwrap_or(100) {
        logs.truncate(limit.unwrap_or(100));
    }
    Ok(logs)
}

#[tauri::command]
async fn clear_logs(state: tauri::State<'_, Arc<Mutex<AppState>>>) -> Result<bool, String> {
    let mut state = state.lock().await;
    state.logger.clear_logs();
    api::clear_api_logs();
    Ok(true)
}

// 配置相关命令
#[tauri::command]
async fn get_config() -> Result<config::AppConfig, String> {
    Ok(config::get_config())
}

#[tauri::command]
async fn save_config(new_config: config::AppConfig, _app: tauri::AppHandle) -> Result<(), String> {
    // 注意：开机自启动现在由前端通过 @tauri-apps/plugin-autostart 插件直接处理
    // 这里只保存配置到文件
    
    log::info!("Saving config - command_whitelist: {:?}, custom_commands: {:?}, ip_blacklist: {:?}, enable_ip_blacklist: {}", 
        new_config.command_whitelist, new_config.custom_commands, new_config.ip_blacklist, new_config.enable_ip_blacklist);

    config::update_config(|cfg| {
        cfg.api_port = new_config.api_port;
        cfg.log_buffer_size = new_config.log_buffer_size;
        cfg.enable_log_file = new_config.enable_log_file;
        cfg.log_file_max_size = new_config.log_file_max_size;
        cfg.auto_start_api = new_config.auto_start_api;
        cfg.auto_start_on_boot = new_config.auto_start_on_boot;
        cfg.command_whitelist = new_config.command_whitelist;
        cfg.custom_commands = new_config.custom_commands;
        cfg.theme = new_config.theme;
        cfg.ip_blacklist = new_config.ip_blacklist;
        cfg.enable_ip_blacklist = new_config.enable_ip_blacklist;
        // 注意：password_hash 不在这里更新，它通过专门的 set_config_password/clear_config_password 命令管理
        if let Some(ref path) = new_config.log_file_path {
            cfg.log_file_path = Some(path.clone());
        }
    })
    .map_err(|e| e.to_string())
}



/// 显示系统通知
fn show_notification(title: &str, message: &str) {
    use notify_rust::Notification;

    let _ = Notification::new()
        .summary(title)
        .body(message)
        .icon("LanDeviceManager")
        .timeout(notify_rust::Timeout::Milliseconds(3000))
        .show();
}

#[tauri::command]
async fn set_config_password(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    password: String,
) -> Result<(), String> {
    // 更新配置文件
    config::update_config(|cfg| {
        let _ = cfg.set_password(&password);
    })
    .map_err(|e| e.to_string())?;
    
    // 更新 AuthManager 的密码（用于运行时验证）
    let mut state = state.lock().await;
    state.auth_manager.set_password(&password)
        .map_err(|e| format!("Failed to update auth manager password: {}", e))?;
    
    // 吊销所有现有会话，强制所有客户端重新认证
    state.auth_manager.revoke_all_sessions();
    state.logger.system("Auth", "Password updated, all sessions revoked");
    
    Ok(())
}

#[tauri::command]
async fn verify_config_password(password: String) -> Result<bool, String> {
    let cfg = config::get_config();
    Ok(cfg.verify_password(&password))
}

#[tauri::command]
async fn has_config_password() -> Result<bool, String> {
    let cfg = config::get_config();
    Ok(cfg.has_password())
}

#[tauri::command]
async fn clear_config_password(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<(), String> {
    // 更新配置文件
    config::update_config(|cfg| {
        cfg.clear_password();
    })
    .map_err(|e| e.to_string())?;
    
    // 清除 AuthManager 的密码
    let mut state = state.lock().await;
    state.auth_manager.clear_password();
    
    // 吊销所有现有会话
    state.auth_manager.revoke_all_sessions();
    state.logger.system("Auth", "Password cleared, all sessions revoked");
    
    Ok(())
}

#[tauri::command]
async fn get_log_file_info() -> Result<Option<(String, Option<u64>)>, String> {
    Ok(logger::get_log_file_info().map(|(path, size)| (path.to_string_lossy().to_string(), size)))
}

#[tauri::command]
async fn reload_config(state: tauri::State<'_, Arc<Mutex<AppState>>>) -> Result<(), String> {
    config::reload_config();
    logger::reload_logger_config();
    
    // 同步 AuthManager 的密码状态
    let state = state.lock().await;
    state.auth_manager.reload_password();
    
    Ok(())
}

#[tauri::command]
async fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("explorer")
            .args(["/select,", &path])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
