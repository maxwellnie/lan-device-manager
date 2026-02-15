use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

/// 设备唯一标识符管理
pub struct DeviceId {
    uuid: String,
}

impl DeviceId {
    /// 获取或创建设备UUID
    /// 
    /// 首次调用时：
    /// 1. 尝试从配置文件读取已有UUID
    /// 2. 如果不存在，生成新的UUID v4并保存
    /// 
    /// 后续调用时：
    /// - 直接返回已保存的UUID
    pub fn get_or_create() -> Result<String, Box<dyn std::error::Error>> {
        let config_path = Self::get_config_path()?;
        
        // 尝试读取已有UUID
        if config_path.exists() {
            match fs::read_to_string(&config_path) {
                Ok(uuid) => {
                    let uuid = uuid.trim().to_string();
                    if Self::is_valid_uuid(&uuid) {
                        log::info!("Loaded existing device UUID: {}", uuid);
                        return Ok(uuid);
                    } else {
                        log::warn!("Invalid UUID in config file, generating new one");
                    }
                }
                Err(e) => {
                    log::warn!("Failed to read UUID config file: {}, generating new one", e);
                }
            }
        }
        
        // 生成新的UUID
        let new_uuid = Uuid::new_v4().to_string();
        log::info!("Generated new device UUID: {}", new_uuid);
        
        // 保存到配置文件
        Self::save_uuid(&config_path, &new_uuid)?;
        
        Ok(new_uuid)
    }
    
    /// 获取配置文件路径
    /// 
    /// Windows: %APPDATA%\LanDeviceManager\device.uuid
    fn get_config_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
        let app_data = dirs::data_dir()
            .ok_or("Failed to get app data directory")?;
        
        let config_dir = app_data.join("LanDeviceManager");
        
        // 确保目录存在
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)?;
        }
        
        Ok(config_dir.join("device.uuid"))
    }
    
    /// 保存UUID到配置文件
    fn save_uuid(path: &PathBuf, uuid: &str) -> Result<(), Box<dyn std::error::Error>> {
        fs::write(path, uuid)?;
        log::info!("Saved device UUID to: {:?}", path);
        Ok(())
    }
    
    /// 验证UUID格式是否有效
    fn is_valid_uuid(uuid: &str) -> bool {
        Uuid::parse_str(uuid).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_uuid_generation() {
        let uuid1 = Uuid::new_v4().to_string();
        let uuid2 = Uuid::new_v4().to_string();
        
        // 两个UUID应该不同
        assert_ne!(uuid1, uuid2);
        
        // 验证格式
        assert!(DeviceId::is_valid_uuid(&uuid1));
        assert!(DeviceId::is_valid_uuid(&uuid2));
    }
}
