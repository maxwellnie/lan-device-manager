use chrono::Local;
use once_cell::sync::Lazy;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::config::get_config;
use crate::models::{LogEntry, LogLevel};

/// 日志管理器
pub struct Logger {
    log_file: Option<fs::File>,
    log_file_path: PathBuf,
    max_file_size: u64, // MB
}

impl Default for Logger {
    fn default() -> Self {
        Self::new()
    }
}

impl Logger {
    /// 创建新的日志管理器
    pub fn new() -> Self {
        let config = get_config();
        let log_path = config
            .log_file_path
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(crate::config::AppConfig::default_log_path);

        let max_file_size = config.log_file_max_size;

        let log_file = if config.enable_log_file {
            Self::open_log_file(&log_path).ok()
        } else {
            None
        };

        Self {
            log_file,
            log_file_path: log_path,
            max_file_size: max_file_size * 1024 * 1024, // 转换为字节
        }
    }

    /// 打开日志文件（如果不存在则创建）
    fn open_log_file(path: &PathBuf) -> std::io::Result<fs::File> {
        // 确保日志目录存在
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        OpenOptions::new().create(true).append(true).open(path)
    }

    /// 检查并轮转日志文件
    fn check_rotation(&mut self) {
        if let Some(ref file) = self.log_file {
            // 获取当前文件大小
            if let Ok(metadata) = file.metadata() {
                let file_size = metadata.len();

                if file_size >= self.max_file_size {
                    // 轮转日志文件
                    self.rotate_log_file();
                }
            }
        }
    }

    /// 轮转日志文件
    fn rotate_log_file(&mut self) {
        // 关闭当前文件
        self.log_file = None;

        // 生成备份文件名
        let timestamp = Local::now().format("%Y%m%d_%H%M%S");
        let backup_path = self
            .log_file_path
            .with_extension(format!("log.{}", timestamp));

        // 重命名当前日志文件
        let _ = fs::rename(&self.log_file_path, &backup_path);

        // 重新打开新的日志文件
        self.log_file = Self::open_log_file(&self.log_file_path).ok();

        log::info!(
            "Log file rotated: {:?} -> {:?}",
            self.log_file_path,
            backup_path
        );
    }

    /// 写入日志条目
    pub fn write_log(&mut self, entry: &LogEntry) {
        // 检查是否需要轮转
        self.check_rotation();

        if let Some(ref mut file) = self.log_file {
            // 格式化日志条目为 JSON Lines 格式
            let log_line = format!(
                "{{\"timestamp\":\"{}\",\"level\":\"{}\",\"category\":\"{}\",\"message\":\"{}\"}}\n",
                entry.timestamp.format("%Y-%m-%d %H:%M:%S%.3f"),
                level_to_string(&entry.level),
                entry.category,
                escape_json(&entry.message)
            );

            if let Err(e) = file.write_all(log_line.as_bytes()) {
                log::error!("Failed to write to log file: {}", e);
            }

            // 刷新到磁盘
            let _ = file.flush();
        }
    }

    /// 重新加载配置
    pub fn reload_config(&mut self) {
        let config = get_config();

        self.log_file_path = config
            .log_file_path
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(crate::config::AppConfig::default_log_path);

        self.max_file_size = config.log_file_max_size * 1024 * 1024;

        // 如果启用了日志文件，重新打开
        if config.enable_log_file {
            if self.log_file.is_none() {
                self.log_file = Self::open_log_file(&self.log_file_path).ok();
            }
        } else {
            self.log_file = None;
        }
    }

    /// 获取日志文件路径
    pub fn get_log_path(&self) -> &PathBuf {
        &self.log_file_path
    }

    /// 获取当前日志文件大小（字节）
    pub fn get_current_file_size(&self) -> Option<u64> {
        self.log_file
            .as_ref()
            .and_then(|f| f.metadata().ok())
            .map(|m| m.len())
    }
}

/// 将日志级别转换为字符串
fn level_to_string(level: &LogLevel) -> &'static str {
    match level {
        LogLevel::Error => "ERROR",
        LogLevel::Warn => "WARN",
        LogLevel::Info => "INFO",
        LogLevel::Success => "SUCCESS",
        LogLevel::System => "SYSTEM",
    }
}

/// 转义 JSON 字符串中的特殊字符
fn escape_json(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

// 全局日志管理器
pub static GLOBAL_LOGGER: Lazy<Arc<Mutex<Logger>>> =
    Lazy::new(|| Arc::new(Mutex::new(Logger::new())));

/// 写入日志到文件
pub fn write_log_to_file(entry: &LogEntry) {
    if let Ok(mut logger) = GLOBAL_LOGGER.lock() {
        logger.write_log(entry);
    }
}

/// 重新加载日志配置
pub fn reload_logger_config() {
    if let Ok(mut logger) = GLOBAL_LOGGER.lock() {
        logger.reload_config();
    }
}

/// 获取日志文件信息
pub fn get_log_file_info() -> Option<(PathBuf, Option<u64>)> {
    if let Ok(logger) = GLOBAL_LOGGER.lock() {
        let path = logger.get_log_path().clone();
        let size = logger.get_current_file_size();
        Some((path, size))
    } else {
        None
    }
}
