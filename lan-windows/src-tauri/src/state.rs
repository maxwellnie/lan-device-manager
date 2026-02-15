use crate::{
    api::ApiServer,
    auth::AuthManager,
    command::CommandExecutor,
    logger::write_log_to_file,
    mdns::MdnsService,
    models::{LogEntry, LogLevel, ServerStatus},
};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub auth_manager: AuthManager,
    pub command_executor: CommandExecutor,
    pub logger: Logger,
    pub mdns_service: Option<MdnsService>,
    pub api_server: Option<Arc<Mutex<ApiServer>>>,
    pub status: ServerStatus,
}

pub struct Logger {
    logs: Vec<LogEntry>,
    max_logs: usize,
}

impl Logger {
    pub fn new(max_logs: usize) -> Self {
        Self {
            logs: Vec::new(),
            max_logs,
        }
    }

    pub fn log(&mut self, level: LogLevel, category: &str, message: &str, source: Option<&str>) {
        let entry = LogEntry {
            timestamp: chrono::Local::now(),
            level,
            category: category.to_string(),
            message: message.to_string(),
            source: source.map(|s| s.to_string()),
        };

        // 写入到内存日志
        self.logs.push(entry.clone());

        if self.logs.len() > self.max_logs {
            self.logs.remove(0);
        }

        // 写入到文件日志
        write_log_to_file(&entry);
    }

    pub fn info(&mut self, category: &str, message: &str) {
        self.log(LogLevel::Info, category, message, None);
        log::info!("[{}] {}", category, message);
    }

    pub fn warn(&mut self, category: &str, message: &str) {
        self.log(LogLevel::Warn, category, message, None);
        log::warn!("[{}] {}", category, message);
    }

    pub fn error(&mut self, category: &str, message: &str) {
        self.log(LogLevel::Error, category, message, None);
        log::error!("[{}] {}", category, message);
    }

    pub fn success(&mut self, category: &str, message: &str) {
        self.log(LogLevel::Success, category, message, None);
        log::info!("[{}] ✓ {}", category, message);
    }

    pub fn system(&mut self, category: &str, message: &str) {
        self.log(LogLevel::System, category, message, None);
        log::info!("[{}] ⚙ {}", category, message);
    }

    pub fn get_logs(&self, limit: usize) -> Vec<LogEntry> {
        self.logs.iter().rev().take(limit).cloned().collect()
    }

    pub fn clear_logs(&mut self) {
        self.logs.clear();
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        let mut logger = Logger::new(500);
        logger.system("Init", "Application state initialized");

        Self {
            auth_manager: AuthManager::new(),
            command_executor: CommandExecutor::new(),
            logger,
            mdns_service: None,
            api_server: None,
            status: ServerStatus::default(),
        }
    }

    pub async fn start_server(&mut self, port: u16) -> Result<String, Box<dyn std::error::Error>> {
        if self.status.running {
            return Err("Server is already running".into());
        }

        self.logger
            .system("Server", &format!("Starting server on port {}", port));

        // Start API server
        let api_server = ApiServer::new(port, self.auth_manager.clone());
        let api_server = Arc::new(Mutex::new(api_server));

        {
            let server = api_server.clone();
            let mut server = server.lock().await;
            server.start().await?;
        }

        self.api_server = Some(api_server);

        // Start mDNS service
        let mut mdns = MdnsService::new(port)?;
        mdns.start()?;
        self.mdns_service = Some(mdns);

        // Update status
        self.status.running = true;
        self.status.port = Some(port);
        self.status.ip_address = get_local_ip();

        self.logger.success(
            "Server",
            &format!("Server started successfully on port {}", port),
        );

        Ok(format!("Server started on port {}", port))
    }

    pub async fn stop_server(&mut self) -> Result<String, Box<dyn std::error::Error>> {
        if !self.status.running {
            return Err("Server is not running".into());
        }

        self.logger
            .system("Server", "Stopping server immediately...");

        // 首先立即停止 API 服务器（最重要）
        if let Some(api_server) = &self.api_server {
            let mut server = api_server.lock().await;
            // 使用较短的超时时间，确保快速关闭
            let stop_result =
                tokio::time::timeout(std::time::Duration::from_secs(2), server.stop()).await;

            match stop_result {
                Ok(Ok(())) => {
                    self.logger.info("Server", "API server stopped");
                }
                Ok(Err(e)) => {
                    self.logger
                        .error("Server", &format!("API server stop error: {}", e));
                }
                Err(_) => {
                    self.logger.warn("Server", "API server stop timeout");
                }
            }
        }
        self.api_server = None;

        // 然后停止 mDNS 服务
        if let Some(mdns) = &self.mdns_service {
            let _ = mdns.stop();
        }
        self.mdns_service = None;

        // Update status
        self.status.running = false;
        self.status.port = None;

        self.logger.success("Server", "Server stopped successfully");

        Ok("Server stopped".to_string())
    }

    pub fn get_status(&self) -> ServerStatus {
        self.status.clone()
    }
}

fn get_local_ip() -> Option<String> {
    if let Ok(interfaces) = if_addrs::get_if_addrs() {
        for iface in interfaces {
            if let if_addrs::IfAddr::V4(ref v4_addr) = iface.addr {
                if !v4_addr.ip.is_loopback() {
                    return Some(v4_addr.ip.to_string());
                }
            }
        }
    }
    None
}
