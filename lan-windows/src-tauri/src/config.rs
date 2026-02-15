use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// 主题类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
    Glass,
}

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// API 服务器端口
    pub api_port: u16,
    /// 密码哈希（Argon2id）
    pub password_hash: Option<String>,
    /// 日志缓冲区大小（条数）
    pub log_buffer_size: usize,
    /// 日志文件路径
    pub log_file_path: Option<String>,
    /// 是否启用日志文件持久化
    pub enable_log_file: bool,
    /// 日志文件最大大小（MB）
    pub log_file_max_size: u64,
    /// 是否自动启动 API 服务器（应用启动时）
    pub auto_start_api: bool,
    /// 是否开机自启动
    pub auto_start_on_boot: bool,
    /// 命令白名单（内置命令）
    pub command_whitelist: Vec<String>,
    /// 自定义命令列表（用户可以执行的额外命令）
    pub custom_commands: Vec<String>,
    /// 界面主题
    pub theme: Theme,
    /// IP黑名单列表
    pub ip_blacklist: Vec<String>,
    /// 是否启用IP黑名单
    pub enable_ip_blacklist: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            api_port: 8080,
            password_hash: None,
            log_buffer_size: 100,
            log_file_path: None,
            enable_log_file: true,
            log_file_max_size: 10,
            auto_start_api: false,
            auto_start_on_boot: false,
            command_whitelist: vec![
                "shutdown".to_string(),
                "restart".to_string(),
                "sleep".to_string(),
                "lock".to_string(),
                "systeminfo".to_string(),
                "tasklist".to_string(),
                "wmic".to_string(),
            ],
            custom_commands: vec![],
            theme: Theme::default(),
            ip_blacklist: vec![],
            enable_ip_blacklist: false,
        }
    }
}

impl AppConfig {
    /// 获取默认日志文件路径（AppData目录）
    pub fn default_log_path() -> PathBuf {
        // 使用 AppData/Roaming 目录
        let app_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("LanDeviceManager");
        app_dir.join("logs").join("app.log")
    }

    /// 获取配置文件路径
    pub fn config_path() -> PathBuf {
        let app_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("LanDeviceManager");
        app_dir.join("config.json")
    }

    /// 确保配置目录存在
    pub fn ensure_config_dir() -> std::io::Result<PathBuf> {
        let config_dir = Self::config_path().parent().unwrap().to_path_buf();
        std::fs::create_dir_all(&config_dir)?;
        Ok(config_dir)
    }

    /// 从文件加载配置
    pub fn load() -> Self {
        let config_path = Self::config_path();

        if config_path.exists() {
            match std::fs::read_to_string(&config_path) {
                Ok(content) => match serde_json::from_str::<AppConfig>(&content) {
                    Ok(config) => {
                        log::info!("Config loaded - command_whitelist: {:?}, custom_commands: {:?}", 
                            config.command_whitelist, config.custom_commands);
                        config
                    }
                    Err(e) => {
                        log::error!("Failed to parse config: {}, using default", e);
                        Self::default()
                    }
                },
                Err(e) => {
                    log::error!("Failed to read config file: {}, using default", e);
                    Self::default()
                }
            }
        } else {
            log::info!("Config file not found, using default config");
            let config = Self::default();
            // 保存默认配置
            let _ = config.save();
            config
        }
    }

    /// 保存配置到文件
    pub fn save(&self) -> std::io::Result<()> {
        Self::ensure_config_dir()?;

        let config_path = Self::config_path();
        let content = serde_json::to_string_pretty(self)
            .map_err(std::io::Error::other)?;

        std::fs::write(&config_path, content)?;
        log::info!("Config saved to {:?}", config_path);
        Ok(())
    }

    /// 设置密码
    pub fn set_password(&mut self, password: &str) -> Result<(), String> {
        use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
        use rand::rngs::OsRng;

        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| format!("Failed to hash password: {}", e))?;

        self.password_hash = Some(password_hash.to_string());
        Ok(())
    }

    /// 验证密码
    pub fn verify_password(&self, password: &str) -> bool {
        if let Some(ref hash) = self.password_hash {
            use argon2::{Argon2, PasswordHash, PasswordVerifier};

            let parsed_hash = match PasswordHash::new(hash) {
                Ok(h) => h,
                Err(_) => return false,
            };

            let argon2 = Argon2::default();
            argon2
                .verify_password(password.as_bytes(), &parsed_hash)
                .is_ok()
        } else {
            // 如果没有设置密码，任何密码都通过（或者可以返回 false）
            false
        }
    }

    /// 检查是否设置了密码
    pub fn has_password(&self) -> bool {
        self.password_hash.is_some()
    }

    /// 清除密码
    pub fn clear_password(&mut self) {
        self.password_hash = None;
    }
}

// 全局配置实例
pub static GLOBAL_CONFIG: Lazy<Arc<Mutex<AppConfig>>> =
    Lazy::new(|| Arc::new(Mutex::new(AppConfig::load())));

/// 获取全局配置的克隆
pub fn get_config() -> AppConfig {
    match GLOBAL_CONFIG.lock() {
        Ok(config) => config.clone(),
        Err(poisoned) => {
            log::warn!("Config mutex poisoned, recovering...");
            poisoned.into_inner().clone()
        }
    }
}

/// 更新全局配置
pub fn update_config<F>(f: F) -> std::io::Result<()>
where
    F: FnOnce(&mut AppConfig),
{
    let mut config = GLOBAL_CONFIG.lock().unwrap();
    f(&mut config);
    config.save()
}

/// 重新加载配置
pub fn reload_config() {
    let new_config = AppConfig::load();
    let mut config = GLOBAL_CONFIG.lock().unwrap();
    *config = new_config;
}
