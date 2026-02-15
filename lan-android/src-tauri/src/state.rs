use std::collections::HashMap;
use std::path::PathBuf;

use crate::api::ApiClient;
use crate::mdns::MdnsDiscovery;
use crate::models::{DeviceInfo, SavedDevice, AuthResult, CommandResult, DeviceStatus, ConnectResult};

/// 获取应用数据目录
fn app_data_dir() -> PathBuf {
    // 尝试使用 Tauri 的标准路径
    #[cfg(target_os = "android")]
    {
        // Android: 使用应用私有目录
        // 通过环境变量或标准路径获取
        if let Ok(files_dir) = std::env::var("ANDROID_APP_DATA_DIR") {
            return PathBuf::from(files_dir);
        }
        
        // 回退到标准 Android 路径
        PathBuf::from("/data/data/io.github.maxwellnie.lan.device.android/files")
    }
    
    #[cfg(not(target_os = "android"))]
    {
        // 桌面平台使用配置目录
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("LanDeviceManager")
    }
}

pub struct AppState {
    mdns_discovery: Option<MdnsDiscovery>,
    connected_devices: HashMap<String, ApiClient>,
    saved_devices: Vec<SavedDevice>,
    device_passwords: HashMap<String, String>, // 存储设备密码
    device_tokens: HashMap<String, String>,    // 存储设备token
}

impl AppState {
    pub fn new() -> Self {
        let saved_devices = Self::load_saved_devices();
        
        Self {
            mdns_discovery: None,
            connected_devices: HashMap::new(),
            saved_devices,
            device_passwords: HashMap::new(),
            device_tokens: HashMap::new(),
        }
    }
    
    /// 获取设备存储文件路径
    fn devices_file_path() -> PathBuf {
        app_data_dir().join("devices.json")
    }
    
    /// 保存设备列表到文件
    fn persist_saved_devices(&self) {
        let file_path = Self::devices_file_path();
        log::info!("Saving devices to: {:?}", file_path);
        
        // 确保目录存在
        if let Some(parent) = file_path.parent() {
            log::info!("Creating directory: {:?}", parent);
            match std::fs::create_dir_all(parent) {
                Ok(_) => log::info!("Directory created or already exists"),
                Err(e) => log::error!("Failed to create directory: {}", e),
            }
        }
        
        match serde_json::to_string_pretty(&self.saved_devices) {
            Ok(json) => {
                log::info!("Serialized {} devices, JSON size: {} bytes", self.saved_devices.len(), json.len());
                match std::fs::write(&file_path, json) {
                    Ok(_) => log::info!("Successfully saved devices to {:?}", file_path),
                    Err(e) => log::error!("Failed to save devices to file: {}", e),
                }
            }
            Err(e) => {
                log::error!("Failed to serialize devices: {}", e);
            }
        }
    }
    
    /// 从文件加载设备列表
    fn load_saved_devices() -> Vec<SavedDevice> {
        let file_path = Self::devices_file_path();
        log::info!("Loading devices from: {:?}", file_path);
        
        if !file_path.exists() {
            log::info!("No saved devices file found at {:?}", file_path);
            return Vec::new();
        }
        
        log::info!("Devices file exists, size: {:?} bytes", std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0));
        
        match std::fs::read_to_string(&file_path) {
            Ok(json) => {
                log::info!("Read devices file content: {}", json);
                match serde_json::from_str::<Vec<SavedDevice>>(&json) {
                    Ok(devices) => {
                        log::info!("Successfully loaded {} devices", devices.len());
                        devices
                    }
                    Err(e) => {
                        log::error!("Failed to parse devices file: {}", e);
                        Vec::new()
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to read devices file: {}", e);
                Vec::new()
            }
        }
    }

    /// 开始设备发现
    pub async fn start_discovery(&mut self) -> Result<String, String> {
        if self.mdns_discovery.is_some() {
            return Err("Discovery already running".to_string());
        }

        let mut discovery = MdnsDiscovery::new()
            .map_err(|e| format!("Failed to create discovery: {}", e))?;
        
        discovery.start()
            .map_err(|e| format!("Failed to start discovery: {}", e))?;
        
        self.mdns_discovery = Some(discovery);
        Ok("Discovery started".to_string())
    }

    /// 停止设备发现
    pub async fn stop_discovery(&mut self) -> Result<String, String> {
        if let Some(mut discovery) = self.mdns_discovery.take() {
            discovery.stop()
                .map_err(|e| format!("Failed to stop discovery: {}", e))?;
        }
        Ok("Discovery stopped".to_string())
    }

    /// 重启设备发现（用于网络变化后重新订阅多播组）
    pub async fn restart_discovery(&mut self) -> Result<String, String> {
        log::info!("Restarting mDNS discovery due to network change");
        
        // 停止现有发现
        if let Some(mut discovery) = self.mdns_discovery.take() {
            let _ = discovery.stop();
        }
        
        // 短暂延迟确保资源释放
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        
        // 重新启动发现
        let mut discovery = MdnsDiscovery::new()
            .map_err(|e| format!("Failed to create discovery: {}", e))?;
        
        discovery.start()
            .map_err(|e| format!("Failed to start discovery: {}", e))?;
        
        self.mdns_discovery = Some(discovery);
        log::info!("mDNS discovery restarted successfully");
        Ok("Discovery restarted".to_string())
    }

    /// 获取已发现的设备，并同步更新已保存设备的信息
    pub async fn get_discovered_devices(&mut self) -> Vec<DeviceInfo> {
        if let Some(discovery) = &self.mdns_discovery {
            let discovered = discovery.get_devices().await;
            let mut updated = false;
            
            // 同步更新已保存设备的信息（支持端口号/IP变化后自动更新）
            for device in &discovered {
                if let Some(saved) = self.saved_devices.iter_mut().find(|d| d.uuid == device.uuid) {
                    if saved.ip_address != device.ip_address || saved.port != device.port {
                        log::info!(
                            "Updating saved device {} - IP: {} -> {}, Port: {} -> {}",
                            saved.name, saved.ip_address, device.ip_address, saved.port, device.port
                        );
                        saved.ip_address = device.ip_address.clone();
                        saved.port = device.port;
                        saved.id = device.id.clone();
                        updated = true;
                    }
                }
            }
            
            // 如果有更新，持久化到文件
            if updated {
                self.persist_saved_devices();
            }
            
            discovered
        } else {
            Vec::new()
        }
    }

    /// 检查设备是否需要认证
    pub async fn check_device_auth_required(&self, ip: &str, port: u16) -> Result<bool, String> {
        let client = ApiClient::new(ip, port);
        client.check_auth_required().await
    }

    /// 连接到设备
    pub async fn connect_to_device(&mut self, device: SavedDevice, password: Option<String>) -> Result<ConnectResult, String> {
        // 创建 API 客户端
        let mut client = ApiClient::new(&device.ip_address, device.port);
        
        // 测试连接
        match client.health_check().await {
            Ok(true) => {
                // 检查是否需要认证
                let requires_auth = match client.check_auth_required().await {
                    Ok(required) => required,
                    Err(_) => false, // 如果检查失败，假设不需要认证
                };

                if requires_auth {
                    // 如果需要认证，检查是否提供了密码
                    if let Some(pwd) = password {
                        // 尝试认证
                        match client.authenticate(&pwd).await {
                            Ok(auth_result) => {
                                if auth_result.success {
                                    // 认证成功，保存设备和密码
                                    self.save_device_internal(device.clone());
                                    self.device_passwords.insert(device.id.clone(), pwd);
                                    if let Some(ref token) = auth_result.token {
                                        self.device_tokens.insert(device.id.clone(), token.clone());
                                    }
                                    self.connected_devices.insert(device.id.clone(), client);
                                    
                                    Ok(ConnectResult {
                                        success: true,
                                        requires_auth: true,
                                        error: None,
                                    })
                                } else {
                                    Ok(ConnectResult {
                                        success: false,
                                        requires_auth: true,
                                        error: auth_result.error.or_else(|| Some("Authentication failed".to_string())),
                                    })
                                }
                            }
                            Err(e) => {
                                Ok(ConnectResult {
                                    success: false,
                                    requires_auth: true,
                                    error: Some(format!("Authentication error: {}", e)),
                                })
                            }
                        }
                    } else {
                        // 需要密码但没有提供
                        Ok(ConnectResult {
                            success: false,
                            requires_auth: true,
                            error: Some("Password required".to_string()),
                        })
                    }
                } else {
                    // 不需要认证，直接保存
                    self.save_device_internal(device.clone());
                    self.connected_devices.insert(device.id.clone(), client);
                    
                    Ok(ConnectResult {
                        success: true,
                        requires_auth: false,
                        error: None,
                    })
                }
            }
            Ok(false) => Ok(ConnectResult {
                success: false,
                requires_auth: false,
                error: Some("Device not responding".to_string()),
            }),
            Err(e) => Ok(ConnectResult {
                success: false,
                requires_auth: false,
                error: Some(format!("Connection failed: {}", e)),
            }),
        }
    }

    /// 断开设备连接
    pub async fn disconnect_device(&mut self, device_id: &str) -> Result<bool, String> {
        self.connected_devices.remove(device_id);
        Ok(true)
    }

    /// 认证设备
    pub async fn authenticate_device(
        &mut self,
        device_id: &str,
        password: &str,
    ) -> Result<AuthResult, String> {
        let client = self.connected_devices.get_mut(device_id)
            .ok_or_else(|| "Device not connected".to_string())?;

        let result = client.authenticate(password).await?;
        
        if result.success {
            // 保存密码和token
            self.device_passwords.insert(device_id.to_string(), password.to_string());
            if let Some(ref token) = result.token {
                self.device_tokens.insert(device_id.to_string(), token.clone());
            }
        }
        
        Ok(result)
    }

    /// 执行命令
    pub async fn execute_command(
        &mut self,
        device_id: &str,
        command: &str,
        args: Option<Vec<String>>,
    ) -> Result<CommandResult, String> {
        let client = self.connected_devices.get(device_id)
            .ok_or_else(|| "Device not connected".to_string())?;

        let result = match command {
            "shutdown" => client.shutdown(args.as_ref().and_then(|a| a.first()).and_then(|s| s.parse().ok())).await,
            "restart" => client.restart(args.as_ref().and_then(|a| a.first()).and_then(|s| s.parse().ok())).await,
            "sleep" => client.sleep().await,
            "lock" => client.lock().await,
            _ => client.execute_command(command, args).await,
        };

        // 检查是否是认证错误
        if let Err(ref e) = result {
            let error_str = e.to_string();
            if error_str.contains("Invalid") || error_str.contains("expired") || error_str.contains("token") {
                log::warn!("Token expired for device {}, authentication required", device_id);
                // 清除本地认证状态
                self.device_tokens.remove(device_id);
                return Err("Authentication expired. Please reconnect and enter password again.".to_string());
            }
        }

        result
    }

    /// 获取设备状态
    pub async fn get_device_status(&mut self, device_id: &str) -> Result<DeviceStatus, String> {
        // 尝试使用现有连接获取状态
        if let Some(client) = self.connected_devices.get(device_id) {
            match client.get_system_info().await {
                Ok(info) => {
                    return Ok(DeviceStatus {
                        online: true,
                        cpu_usage: info.cpu_usage,
                        memory_usage: info.memory_used,
                        uptime: info.uptime_seconds,
                        os_type: info.os_type,
                        os_version: info.os_version,
                    });
                }
                Err(e) => {
                    // 检查是否是认证错误
                    let error_str = e.to_string();
                    if error_str.contains("Invalid") || error_str.contains("expired") || error_str.contains("token") {
                        log::warn!("Token expired for device {}, authentication required", device_id);
                        // Token 失效，清除本地认证状态，要求用户重新输入密码
                        self.device_tokens.remove(device_id);
                        return Err("Authentication expired. Please reconnect and enter password again.".to_string());
                    } else {
                        return Err(e);
                    }
                }
            }
        }
        
        Err("Device not connected".to_string())
    }

    /// 获取保存的设备
    pub fn get_saved_devices(&self) -> Vec<SavedDevice> {
        self.saved_devices.clone()
    }

    /// 内部保存设备（不触发异步）
    fn save_device_internal(&mut self, device: SavedDevice) {
        let uuid = device.uuid.clone();
        let id = device.id.clone();

        // 使用 UUID 匹配已存在的设备（支持端口号变化后识别同一设备）
        if let Some(existing) = self.saved_devices.iter_mut().find(|d| d.uuid == uuid) {
            // 更新设备信息（ID、IP、端口可能变化，但UUID相同）
            existing.id = device.id;
            existing.ip_address = device.ip_address;
            existing.port = device.port;
            existing.name = device.name;
            existing.last_connected = device.last_connected;
            log::info!("Updated existing device with UUID: {}, new ID: {}, new IP: {}, new Port: {}",
                uuid, existing.id, existing.ip_address, existing.port);
        } else {
            self.saved_devices.push(device);
            log::info!("Added new device with UUID: {}, ID: {}", uuid, id);
        }
        
        // 持久化到文件
        self.persist_saved_devices();
    }

    /// 保存设备
    pub async fn save_device(&mut self, device: SavedDevice, password: Option<String>) -> Result<bool, String> {
        self.save_device_internal(device.clone());
        
        // 如果有密码，保存密码
        if let Some(pwd) = password {
            self.device_passwords.insert(device.id, pwd);
        }
        
        Ok(true)
    }

    /// 删除设备（支持通过 ID 或 UUID 删除）
    pub async fn delete_device(&mut self, device_id: &str) -> Result<bool, String> {
        // 先查找设备获取 UUID 和 ID
        let device_info = self.saved_devices.iter()
            .find(|d| d.id == device_id || d.uuid == device_id)
            .map(|d| (d.uuid.clone(), d.id.clone()));

        if let Some((ref uuid, ref id)) = device_info {
            self.saved_devices.retain(|d| d.uuid != *uuid);
            // 使用 device id 作为键删除密码和token（与 connect_to_device 中插入时使用的键一致）
            self.device_passwords.remove(id);
            self.device_tokens.remove(id);
            // 持久化保存设备列表
            self.persist_saved_devices();
            log::info!("Device deleted and persisted: {}", device_id);
        }
        self.connected_devices.remove(device_id);
        Ok(true)
    }

    /// 更新设备名称（支持通过 ID 或 UUID 查找）
    pub async fn update_device_name(&mut self, device_id: &str, name: &str) -> Result<bool, String> {
        if let Some(device) = self.saved_devices.iter_mut().find(|d| d.id == device_id || d.uuid == device_id) {
            device.custom_name = Some(name.to_string());
            Ok(true)
        } else {
            Err("Device not found".to_string())
        }
    }

    /// 获取设备密码
    pub fn get_device_password(&self, device_id: &str) -> Option<String> {
        self.device_passwords.get(device_id).cloned()
    }

    /// 清除设备密码
    pub async fn clear_device_password(&mut self, device_id: &str) -> Result<(), String> {
        self.device_passwords.remove(device_id);
        self.device_tokens.remove(device_id);
        log::info!("Cleared password and token for device: {}", device_id);
        Ok(())
    }

    /// 获取设备token
    pub fn get_device_token(&self, device_id: &str) -> Option<String> {
        self.device_tokens.get(device_id).cloned()
    }

    /// 使用保存的密码重新连接设备
    pub async fn reconnect_with_saved_password(&mut self, device_id: &str) -> Result<bool, String> {
        // 获取设备信息
        let device = self.saved_devices.iter()
            .find(|d| d.id == device_id)
            .cloned()
            .ok_or_else(|| "Device not found".to_string())?;

        // 获取保存的密码
        let password = self.device_passwords.get(device_id).cloned();

        // 尝试连接
        let result = self.connect_to_device(device, password).await?;
        
        if result.success {
            Ok(true)
        } else {
            Err(result.error.unwrap_or_else(|| "Reconnection failed".to_string()))
        }
    }
}
