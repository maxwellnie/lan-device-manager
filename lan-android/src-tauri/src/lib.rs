use std::sync::Arc;
use tokio::sync::Mutex;

pub mod mdns;
pub mod api;
pub mod models;
pub mod state;
pub mod crypto;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(Arc::new(Mutex::new(AppState::new())))
        .invoke_handler(tauri::generate_handler![
            start_discovery,
            stop_discovery,
            restart_discovery,
            get_discovered_devices,
            check_device_auth_required,
            connect_to_device,
            disconnect_device,
            authenticate_device,
            execute_command,
            get_device_status,
            get_saved_devices,
            save_device,
            delete_device,
            update_device_name,
            get_device_password,
            clear_device_password,
        ])
        .setup(|_app| {
            log::info!("LanDevice Manager Android client starting...");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// 开始设备发现
#[tauri::command]
async fn start_discovery(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<String, String> {
    let mut state = state.lock().await;
    state.start_discovery().await.map_err(|e| e.to_string())
}

// 停止设备发现
#[tauri::command]
async fn stop_discovery(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<String, String> {
    let mut state = state.lock().await;
    state.stop_discovery().await.map_err(|e| e.to_string())
}

// 重启设备发现（用于网络变化后）
#[tauri::command]
async fn restart_discovery(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<String, String> {
    let mut state = state.lock().await;
    state.restart_discovery().await.map_err(|e| e.to_string())
}

// 获取已发现的设备
#[tauri::command]
async fn get_discovered_devices(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<models::DeviceInfo>, String> {
    let mut state = state.lock().await;
    Ok(state.get_discovered_devices().await)
}

// 检查设备是否需要认证
#[tauri::command]
async fn check_device_auth_required(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    ip: String,
    port: u16,
) -> Result<bool, String> {
    let state = state.lock().await;
    state.check_device_auth_required(&ip, port).await.map_err(|e| e.to_string())
}

// 连接到设备
#[tauri::command]
async fn connect_to_device(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    device: models::SavedDevice,
    password: Option<String>,
) -> Result<models::ConnectResult, String> {
    let mut state = state.lock().await;
    state.connect_to_device(device, password).await.map_err(|e| e.to_string())
}

// 断开设备连接
#[tauri::command]
async fn disconnect_device(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    device_id: String,
) -> Result<bool, String> {
    let mut state = state.lock().await;
    state.disconnect_device(&device_id).await.map_err(|e| e.to_string())
}

// 认证设备
#[tauri::command]
async fn authenticate_device(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    device_id: String,
    password: String,
) -> Result<models::AuthResult, String> {
    let mut state = state.lock().await;
    state.authenticate_device(&device_id, &password).await.map_err(|e| e.to_string())
}

// 执行命令
#[tauri::command]
async fn execute_command(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    device_id: String,
    command: String,
    args: Option<Vec<String>>,
) -> Result<models::CommandResult, String> {
    let mut state = state.lock().await;
    state.execute_command(&device_id, &command, args).await.map_err(|e| e.to_string())
}

// 获取设备状态
#[tauri::command]
async fn get_device_status(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    device_id: String,
) -> Result<models::DeviceStatus, String> {
    let mut state = state.lock().await;
    state.get_device_status(&device_id).await.map_err(|e| e.to_string())
}

// 获取保存的设备
#[tauri::command]
async fn get_saved_devices(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<models::SavedDevice>, String> {
    let state = state.lock().await;
    Ok(state.get_saved_devices())
}

// 保存设备
#[tauri::command]
async fn save_device(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    device: models::SavedDevice,
    password: Option<String>,
) -> Result<bool, String> {
    let mut state = state.lock().await;
    state.save_device(device, password).await.map_err(|e| e.to_string())
}

// 删除设备
#[tauri::command]
async fn delete_device(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    device_id: String,
) -> Result<bool, String> {
    let mut state = state.lock().await;
    state.delete_device(&device_id).await.map_err(|e| e.to_string())
}

// 更新设备名称
#[tauri::command]
async fn update_device_name(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    device_id: String,
    name: String,
) -> Result<bool, String> {
    let mut state = state.lock().await;
    state.update_device_name(&device_id, &name).await.map_err(|e| e.to_string())
}

// 获取设备密码
#[tauri::command]
async fn get_device_password(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    device_id: String,
) -> Result<Option<String>, String> {
    let state = state.lock().await;
    Ok(state.get_device_password(&device_id))
}

// 清除设备密码
#[tauri::command]
async fn clear_device_password(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    device_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.clear_device_password(&device_id).await.map_err(|e| e.to_string())
}
