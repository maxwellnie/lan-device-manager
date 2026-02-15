use axum::extract::ConnectInfo;
use axum::{
    extract::{Json, Query, State},
    http::StatusCode,
    response::Json as AxumJson,
    routing::{get, post},
    Router,
};
use http::Request;
use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::{Duration, Instant};
use tokio::net::TcpListener;
use tokio::sync::Notify;
use tokio::sync::{Mutex, RwLock};
use tower::{Layer, Service};
use tower_http::cors::{Any, CorsLayer};

// 线程本地存储，用于在中间件和handler之间共享客户端IP
thread_local! {
    static CURRENT_CLIENT_IP: RefCell<String> = RefCell::new(String::from("unknown"));
}

/// 设置当前线程的客户端IP
pub fn set_client_ip(ip: &str) {
    CURRENT_CLIENT_IP.with(|ip_cell| {
        *ip_cell.borrow_mut() = ip.to_string();
    });
}

/// 获取当前线程的客户端IP
pub fn get_client_ip() -> String {
    CURRENT_CLIENT_IP.with(|ip_cell| ip_cell.borrow().clone())
}

/// 检查IP是否在黑名单中
pub fn is_ip_blacklisted(ip: &str) -> bool {
    let config = get_config();
    
    // 如果黑名单功能未启用，直接返回false
    if !config.enable_ip_blacklist {
        return false;
    }
    
    // 提取IP地址部分（去掉端口号）
    let ip_part = ip.split(':').next().unwrap_or(ip);
    
    // 检查IP是否在黑名单中
    config.ip_blacklist.iter().any(|blocked_ip| {
        let blocked = blocked_ip.trim();
        // 支持精确匹配和通配符匹配
        if blocked.contains('*') {
            // 通配符匹配，如 192.168.1.*
            let pattern = blocked.replace('*', ".*");
            regex::Regex::new(&format!("^{}$", pattern))
                .map(|re| re.is_match(ip_part))
                .unwrap_or(false)
        } else {
            // 精确匹配
            ip_part == blocked
        }
    })
}

use crate::auth::AuthManager;
use crate::config::get_config;
use crate::models::{AuthResponse, CommandResult, SystemInfo};
use crate::websocket::{ws_handler, WebSocketManager};

pub struct ApiServer {
    port: u16,
    auth_manager: AuthManager,
    ws_manager: Option<Arc<Mutex<WebSocketManager>>>,
    shutdown_notify: Option<Arc<Notify>>,
    server_handle: Option<tokio::task::JoinHandle<()>>,
    is_running: Arc<RwLock<bool>>,
}

impl Clone for ApiServer {
    fn clone(&self) -> Self {
        Self {
            port: self.port,
            auth_manager: self.auth_manager.clone(),
            ws_manager: self.ws_manager.clone(),
            shutdown_notify: None,
            server_handle: None,
            is_running: self.is_running.clone(),
        }
    }
}

// 全局日志存储，用于从 API 层发送日志到 UI
use crate::models::{LogEntry, LogLevel};
use chrono::Local;
use once_cell::sync::Lazy;
use std::sync::Mutex as StdMutex;

pub static API_LOGS: Lazy<StdMutex<Vec<LogEntry>>> = Lazy::new(|| StdMutex::new(Vec::new()));

pub fn log_to_ui(level: &str, message: &str) {
    let log_level = match level {
        "error" => LogLevel::Error,
        "warn" => LogLevel::Warn,
        "success" => LogLevel::Success,
        _ => LogLevel::Info,
    };

    let entry = LogEntry {
        timestamp: Local::now(),
        level: log_level,
        category: "API".to_string(),
        message: message.to_string(),
        source: None,
    };

    if let Ok(mut logs) = API_LOGS.lock() {
        logs.push(entry.clone());
        // 限制日志数量
        if logs.len() > 50 {
            logs.remove(0);
        }
    }

    // 同时写入日志文件
    crate::logger::write_log_to_file(&entry);
}

pub fn get_api_logs(limit: usize) -> Vec<LogEntry> {
    if let Ok(logs) = API_LOGS.lock() {
        logs.iter().rev().take(limit).cloned().collect()
    } else {
        Vec::new()
    }
}

pub fn clear_api_logs() {
    if let Ok(mut logs) = API_LOGS.lock() {
        logs.clear();
    }
}

#[derive(Debug, Deserialize)]
struct ChallengeRequest {
    device_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct ChallengeResponse {
    challenge: String,
}

#[derive(Debug, Deserialize)]
struct LoginRequest {
    challenge: String,
    response: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct CommandRequest {
    token: String,
    command: String,
    args: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct TokenQuery {
    token: Option<String>,
}

#[derive(Debug, Serialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

// 应用状态结构体
#[derive(Clone)]
pub struct AppState {
    pub auth_manager: AuthManager,
    pub ws_manager: Arc<Mutex<WebSocketManager>>,
    pub system_info_cache: Arc<Mutex<Option<(SystemInfo, Instant)>>>, // 缓存系统信息
}

// 客户端IP中间件 - 用于在请求扩展中存储客户端IP
#[derive(Clone, Debug)]
pub struct ClientIp(pub String);

// 客户端IP中间件
#[derive(Clone)]
pub struct ClientIpLayer;

impl<S> Layer<S> for ClientIpLayer {
    type Service = ClientIpMiddleware<S>;

    fn layer(&self, inner: S) -> Self::Service {
        ClientIpMiddleware { inner }
    }
}

#[derive(Clone)]
pub struct ClientIpMiddleware<S> {
    inner: S,
}

impl<S, B> Service<Request<B>> for ClientIpMiddleware<S>
where
    S: Service<Request<B>, Response = axum::response::Response, Error = Infallible>
        + Clone
        + Send
        + 'static,
    S::Future: Send + 'static,
    B: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = futures::future::BoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    #[allow(clippy::redundant_async_block)]
    fn call(&mut self, mut req: Request<B>) -> Self::Future {
        // 尝试从扩展中获取客户端地址
        let client_ip = req
            .extensions()
            .get::<ConnectInfo<SocketAddr>>()
            .map(|addr| addr.0.to_string())
            .unwrap_or_else(|| "unknown".to_string());

        // 检查IP黑名单
        if is_ip_blacklisted(&client_ip) {
            log::warn!("[Security] Request from blacklisted IP blocked: {}", client_ip);
            log_to_ui("warn", &format!("[Security] Blocked request from blacklisted IP: {}", client_ip));
            
            // 返回403禁止访问响应
            let response = axum::response::Response::builder()
                .status(StatusCode::FORBIDDEN)
                .body(axum::body::Body::from("Access denied: IP is blacklisted"))
                .unwrap();
            
            return Box::pin(async move { Ok(response) });
        }

        // 记录请求日志
        let method = req.method().to_string();
        let path = req.uri().path().to_string();
        log_to_ui("info", &format!("[{}] {} {}", client_ip, method, path));

        // 将客户端IP存入请求扩展，供后续handler使用
        req.extensions_mut().insert(ClientIp(client_ip.clone()));

        // 设置线程本地存储的客户端IP
        set_client_ip(&client_ip);

        let future = self.inner.call(req);
        Box::pin(async move { future.await })
    }
}

impl ApiServer {
    pub fn new(port: u16, auth_manager: AuthManager) -> Self {
        let ws_manager = Arc::new(Mutex::new(WebSocketManager::new(auth_manager.clone())));
        Self {
            port,
            auth_manager: auth_manager.clone(),
            ws_manager: Some(ws_manager),
            shutdown_notify: None,
            server_handle: None,
            is_running: Arc::new(RwLock::new(false)),
        }
    }

    pub async fn start(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        // 检查是否已经在运行
        {
            let running = self.is_running.read().await;
            if *running {
                return Err("Server is already running".into());
            }
        }

        let shutdown_notify = Arc::new(Notify::new());
        self.shutdown_notify = Some(shutdown_notify.clone());

        let app_state = AppState {
            auth_manager: self.auth_manager.clone(),
            ws_manager: self.ws_manager.clone().unwrap(),
            system_info_cache: Arc::new(Mutex::new(None)),
        };

        // 创建CORS层
        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);

        // 创建路由
        let app = Router::new()
            .route("/api/health", get(health_check))
            .route("/api/auth/challenge", post(get_challenge))
            .route("/api/auth/login", post(login))
            .route("/api/auth/check", get(check_auth_required))
            .route("/api/system/info", get(get_system_info_handler))
            .route("/api/system/shutdown", post(shutdown_handler))
            .route("/api/system/restart", post(restart_handler))
            .route("/api/system/sleep", post(sleep_handler))
            .route("/api/system/lock", post(lock_handler))
            .route("/api/command/execute", post(execute_command_handler))
            .route("/ws", get(ws_handler))
            .layer(cors)
            .layer(ClientIpLayer)
            .with_state(app_state);

        let addr = SocketAddr::from(([0, 0, 0, 0], self.port));
        let listener = match TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                log::error!("Failed to bind to port {}: {}", self.port, e);
                return Err(format!("Port {} is already in use or cannot be bound", self.port).into());
            }
        };
        let actual_port = listener.local_addr()?.port();

        log::info!("API server listening on port {}", actual_port);

        // 设置运行状态
        {
            let mut running = self.is_running.write().await;
            *running = true;
        }

        let is_running = self.is_running.clone();

        // 启动服务器并保存 handle (启用 ConnectInfo)
        let handle = tokio::spawn(async move {
            let server = axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            );

            // 使用 graceful shutdown
            let graceful = server.with_graceful_shutdown(async move {
                // 等待关闭通知
                shutdown_notify.notified().await;
                log::info!("API server graceful shutdown triggered");
            });

            if let Err(e) = graceful.await {
                log::error!("API server error: {}", e);
            }

            // 设置停止状态
            let mut running = is_running.write().await;
            *running = false;
            log::info!("API server stopped");
        });

        self.server_handle = Some(handle);

        Ok(())
    }

    pub async fn stop(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Stopping API server...");

        // 触发关闭通知
        if let Some(notify) = self.shutdown_notify.take() {
            notify.notify_one();
        }

        // 等待服务器任务完成（带超时）
        if let Some(handle) = self.server_handle.take() {
            match tokio::time::timeout(Duration::from_secs(3), handle).await {
                Ok(_) => {
                    log::info!("API server stopped successfully");
                }
                Err(_) => {
                    log::warn!("API server stop timeout, aborting task");
                    // 任务会在超时后继续运行，但我们不再等待
                }
            }
        }

        // 确保状态设置为停止
        {
            let mut running = self.is_running.write().await;
            *running = false;
        }

        Ok(())
    }

    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }
}

// 健康检查 - 不需要认证
async fn health_check() -> AxumJson<ApiResponse<serde_json::Value>> {
    AxumJson(ApiResponse {
        success: true,
        data: Some(serde_json::json!({
            "status": "healthy",
            "version": env!("CARGO_PKG_VERSION"),
            "service": "lan-device-manager"
        })),
        error: None,
    })
}

// 检查是否需要认证
async fn check_auth_required(
    State(state): State<AppState>,
) -> AxumJson<ApiResponse<serde_json::Value>> {
    let ip = get_client_ip();

    // 检查是否设置了密码
    let is_auth_required = state.auth_manager.is_password_set();

    log::info!(
        "[Auth] [{}] Auth check: requires_auth={}",
        ip,
        is_auth_required
    );
    log_to_ui(
        "info",
        &format!("[{}] Auth check: requires_auth={}", ip, is_auth_required),
    );

    AxumJson(ApiResponse {
        success: true,
        data: Some(serde_json::json!({
            "requires_auth": is_auth_required,
            "message": if is_auth_required { "Password authentication required" } else { "No authentication required" }
        })),
        error: None,
    })
}

// 获取认证挑战
async fn get_challenge(
    State(state): State<AppState>,
    Json(_req): Json<ChallengeRequest>,
) -> Result<AxumJson<ApiResponse<ChallengeResponse>>, StatusCode> {
    let ip = get_client_ip();

    let challenge = state.auth_manager.generate_challenge();

    log::info!("[Auth] [{}] Challenge requested", ip);
    log_to_ui("info", &format!("[{}] Challenge requested", ip));

    Ok(AxumJson(ApiResponse {
        success: true,
        data: Some(ChallengeResponse { challenge }),
        error: None,
    }))
}

// 登录
async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<AxumJson<ApiResponse<AuthResponse>>, StatusCode> {
    let ip = get_client_ip();

    match state
        .auth_manager
        .authenticate(&req.challenge, &req.response, &req.password)
    {
        Ok(response) => {
            log::info!("[Auth] [{}] Login SUCCESS", ip);
            log_to_ui("success", &format!("[{}] Login SUCCESS", ip));
            Ok(AxumJson(ApiResponse {
                success: true,
                data: Some(response),
                error: None,
            }))
        }
        Err(e) => {
            log::warn!("[Auth] [{}] Login FAILED: {}", ip, e);
            log_to_ui("warn", &format!("[{}] Login FAILED: {}", ip, e));
            Ok(AxumJson(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }))
        }
    }
}

// 获取系统信息 - 需要认证
async fn get_system_info_handler(
    State(state): State<AppState>,
    Query(query): Query<TokenQuery>,
) -> Result<AxumJson<ApiResponse<SystemInfo>>, StatusCode> {
    let ip = get_client_ip();

    // 检查是否设置了密码
    if state.auth_manager.is_password_set() {
        // 如果设置了密码，需要验证token
        let token = match &query.token {
            Some(t) => t,
            None => {
                log::warn!(
                    "[Access] [{}] System info request denied: Token missing",
                    ip
                );
                log_to_ui(
                    "warn",
                    &format!("[{}] System info request denied: Token missing", ip),
                );
                return Ok(AxumJson(ApiResponse {
                    success: false,
                    data: None,
                    error: Some("Authentication required. Token missing.".to_string()),
                }));
            }
        };

        if !state.auth_manager.verify_token(token) {
            log::warn!(
                "[Access] [{}] System info request denied: Invalid token",
                ip
            );
            log_to_ui(
                "warn",
                &format!("[{}] System info request denied: Invalid token", ip),
            );
            return Ok(AxumJson(ApiResponse {
                success: false,
                data: None,
                error: Some("Invalid or expired token".to_string()),
            }));
        }
    }

    log::info!("[Access] [{}] System info requested", ip);
    log_to_ui("info", &format!("[{}] System info requested", ip));

    // 检查缓存（缓存5分钟）
    let cache_duration = Duration::from_secs(300);
    {
        let cache = state.system_info_cache.lock().await;
        if let Some((ref info, ref timestamp)) = *cache {
            if timestamp.elapsed() < cache_duration {
                // 缓存有效，直接返回
                log::info!("[Access] [{}] System info served from cache", ip);
                log_to_ui("info", &format!("[{}] System info served from cache", ip));
                return Ok(AxumJson(ApiResponse {
                    success: true,
                    data: Some(info.clone()),
                    error: None,
                }));
            }
        }
    }

    // 缓存无效或过期，重新获取
    match crate::command::get_system_info() {
        Ok(info) => {
            // 更新缓存
            let mut cache = state.system_info_cache.lock().await;
            *cache = Some((info.clone(), Instant::now()));

            log::info!("[Access] [{}] System info retrieved and served", ip);
            log_to_ui(
                "info",
                &format!("[{}] System info retrieved and served", ip),
            );

            Ok(AxumJson(ApiResponse {
                success: true,
                data: Some(info),
                error: None,
            }))
        }
        Err(e) => {
            log::error!("[Access] [{}] Failed to get system info: {}", ip, e);
            log_to_ui(
                "error",
                &format!("[{}] Failed to get system info: {}", ip, e),
            );
            Ok(AxumJson(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }))
        }
    }
}

// 关机
async fn shutdown_handler(
    State(state): State<AppState>,
    Json(req): Json<CommandRequest>,
) -> Result<AxumJson<ApiResponse<CommandResult>>, StatusCode> {
    let ip = get_client_ip();

    if !state.auth_manager.verify_token(&req.token) {
        log::warn!("[Command] [{}] Shutdown REJECTED: Invalid token", ip);
        log_to_ui(
            "warn",
            &format!("[{}] Shutdown REJECTED: Invalid token", ip),
        );
        return Ok(AxumJson(ApiResponse {
            success: false,
            data: None,
            error: Some("Invalid or expired token".to_string()),
        }));
    }

    // 先记录调用（在命令执行前）
    log::info!("[Command] [{}] Shutdown REQUEST", ip);
    log_to_ui("info", &format!("[{}] Shutdown REQUEST", ip));

    let executor = crate::command::CommandExecutor::new();
    match executor.execute("shutdown", req.args.as_deref()) {
        Ok(result) => {
            if result.success {
                // 关机成功前先记录，因为系统可能立即关闭
                log::info!("[Command] [{}] Shutdown SUCCESS", ip);
                log_to_ui("success", &format!("[{}] Shutdown SUCCESS", ip));
            } else {
                log::error!("[Command] [{}] Shutdown FAILED: {}", ip, result.stderr);
                log_to_ui(
                    "error",
                    &format!("[{}] Shutdown FAILED: {}", ip, result.stderr),
                );
            }
            let error_msg = if result.success {
                None
            } else {
                Some(result.stderr.clone())
            };
            Ok(AxumJson(ApiResponse {
                success: result.success,
                data: Some(result),
                error: error_msg,
            }))
        }
        Err(e) => {
            log::error!("[Command] [{}] Shutdown ERROR: {}", ip, e);
            log_to_ui("error", &format!("[{}] Shutdown ERROR: {}", ip, e));
            Ok(AxumJson(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }))
        }
    }
}

// 重启
async fn restart_handler(
    State(state): State<AppState>,
    Json(req): Json<CommandRequest>,
) -> Result<AxumJson<ApiResponse<CommandResult>>, StatusCode> {
    let ip = get_client_ip();

    if !state.auth_manager.verify_token(&req.token) {
        log::warn!("[Command] [{}] Restart REJECTED: Invalid token", ip);
        log_to_ui("warn", &format!("[{}] Restart REJECTED: Invalid token", ip));
        return Ok(AxumJson(ApiResponse {
            success: false,
            data: None,
            error: Some("Invalid or expired token".to_string()),
        }));
    }

    log::info!("[Command] [{}] Restart REQUEST", ip);
    log_to_ui("info", &format!("[{}] Restart REQUEST", ip));

    let executor = crate::command::CommandExecutor::new();
    match executor.execute("restart", req.args.as_deref()) {
        Ok(result) => {
            if result.success {
                log::info!("[Command] [{}] Restart SUCCESS", ip);
                log_to_ui("success", &format!("[{}] Restart SUCCESS", ip));
            } else {
                log::error!("[Command] [{}] Restart FAILED: {}", ip, result.stderr);
                log_to_ui(
                    "error",
                    &format!("[{}] Restart FAILED: {}", ip, result.stderr),
                );
            }
            let error_msg = if result.success {
                None
            } else {
                Some(result.stderr.clone())
            };
            Ok(AxumJson(ApiResponse {
                success: result.success,
                data: Some(result),
                error: error_msg,
            }))
        }
        Err(e) => {
            log::error!("[Command] [{}] Restart ERROR: {}", ip, e);
            log_to_ui("error", &format!("[{}] Restart ERROR: {}", ip, e));
            Ok(AxumJson(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }))
        }
    }
}

// 睡眠
async fn sleep_handler(
    State(state): State<AppState>,
    Json(req): Json<CommandRequest>,
) -> Result<AxumJson<ApiResponse<CommandResult>>, StatusCode> {
    let ip = get_client_ip();

    if !state.auth_manager.verify_token(&req.token) {
        log::warn!("[Command] [{}] Sleep REJECTED: Invalid token", ip);
        log_to_ui("warn", &format!("[{}] Sleep REJECTED: Invalid token", ip));
        return Ok(AxumJson(ApiResponse {
            success: false,
            data: None,
            error: Some("Invalid or expired token".to_string()),
        }));
    }

    log::info!("[Command] [{}] Sleep REQUEST", ip);
    log_to_ui("info", &format!("[{}] Sleep REQUEST", ip));

    let executor = crate::command::CommandExecutor::new();
    match executor.execute("sleep", None) {
        Ok(result) => {
            if result.success {
                log::info!("[Command] [{}] Sleep SUCCESS", ip);
                log_to_ui("success", &format!("[{}] Sleep SUCCESS", ip));
            } else {
                log::error!("[Command] [{}] Sleep FAILED: {}", ip, result.stderr);
                log_to_ui(
                    "error",
                    &format!("[{}] Sleep FAILED: {}", ip, result.stderr),
                );
            }
            let error_msg = if result.success {
                None
            } else {
                Some(result.stderr.clone())
            };
            Ok(AxumJson(ApiResponse {
                success: result.success,
                data: Some(result),
                error: error_msg,
            }))
        }
        Err(e) => {
            log::error!("[Command] [{}] Sleep ERROR: {}", ip, e);
            log_to_ui("error", &format!("[{}] Sleep ERROR: {}", ip, e));
            Ok(AxumJson(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }))
        }
    }
}

// 锁屏
async fn lock_handler(
    State(state): State<AppState>,
    Json(req): Json<CommandRequest>,
) -> Result<AxumJson<ApiResponse<CommandResult>>, StatusCode> {
    let ip = get_client_ip();

    if !state.auth_manager.verify_token(&req.token) {
        log::warn!("[Command] [{}] Lock REJECTED: Invalid token", ip);
        log_to_ui("warn", &format!("[{}] Lock REJECTED: Invalid token", ip));
        return Ok(AxumJson(ApiResponse {
            success: false,
            data: None,
            error: Some("Invalid or expired token".to_string()),
        }));
    }

    log::info!("[Command] [{}] Lock REQUEST", ip);
    log_to_ui("info", &format!("[{}] Lock REQUEST", ip));

    let executor = crate::command::CommandExecutor::new();
    match executor.execute("lock", None) {
        Ok(result) => {
            if result.success {
                log::info!("[Command] [{}] Lock SUCCESS", ip);
                log_to_ui("success", &format!("[{}] Lock SUCCESS", ip));
            } else {
                log::error!("[Command] [{}] Lock FAILED: {}", ip, result.stderr);
                log_to_ui("error", &format!("[{}] Lock FAILED: {}", ip, result.stderr));
            }
            let error_msg = if result.success {
                None
            } else {
                Some(result.stderr.clone())
            };
            Ok(AxumJson(ApiResponse {
                success: result.success,
                data: Some(result),
                error: error_msg,
            }))
        }
        Err(e) => {
            log::error!("[Command] [{}] Lock ERROR: {}", ip, e);
            log_to_ui("error", &format!("[{}] Lock ERROR: {}", ip, e));
            Ok(AxumJson(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }))
        }
    }
}

// 执行命令
async fn execute_command_handler(
    State(state): State<AppState>,
    Json(req): Json<CommandRequest>,
) -> Result<AxumJson<ApiResponse<CommandResult>>, StatusCode> {
    let ip = get_client_ip();

    if !state.auth_manager.verify_token(&req.token) {
        log::warn!("[Command] [{}] Execute REJECTED: Invalid token", ip);
        log_to_ui("warn", &format!("[{}] Execute REJECTED: Invalid token", ip));
        return Ok(AxumJson(ApiResponse {
            success: false,
            data: None,
            error: Some("Invalid or expired token".to_string()),
        }));
    }

    // 处理 custom 命令类型：将实际的命令名称从 args 中提取出来
    // 同时处理命令名包含空格的情况（如 "ping 127.0.0.1"）
    let (actual_command, actual_args) = if req.command == "custom" {
        if let Some(args) = &req.args {
            if let Some(first_arg) = args.first() {
                // 第一个参数可能包含完整命令（如 "ping 127.0.0.1"）
                // 需要分割成命令名和参数
                let parts: Vec<&str> = first_arg.split_whitespace().collect();
                if let Some((first, rest)) = parts.split_first() {
                    let cmd = first.to_string();
                    let mut all_args: Vec<String> = rest.iter().map(|s| s.to_string()).collect();
                    // 合并原有的其他 args（从第二个元素开始）
                    let remaining_args: Vec<String> = args.iter().skip(1).cloned().collect();
                    all_args.extend(remaining_args);
                    (cmd, if all_args.is_empty() { None } else { Some(all_args) })
                } else {
                    (first_arg.clone(), None)
                }
            } else {
                ("custom".to_string(), None)
            }
        } else {
            ("custom".to_string(), None)
        }
    } else if req.command.contains(' ') {
        // 如果命令名包含空格，分割成命令名和参数
        let parts: Vec<&str> = req.command.split_whitespace().collect();
        if let Some((first, rest)) = parts.split_first() {
            let cmd = first.to_string();
            let mut all_args: Vec<String> = rest.iter().map(|s| s.to_string()).collect();
            // 合并原有的 args
            if let Some(existing_args) = &req.args {
                all_args.extend(existing_args.clone());
            }
            (cmd, if all_args.is_empty() { None } else { Some(all_args) })
        } else {
            (req.command.clone(), req.args.clone())
        }
    } else {
        (req.command.clone(), req.args.clone())
    };

    log::info!("[Command] [{}] Execute '{}' REQUEST", ip, actual_command);
    log_to_ui(
        "info",
        &format!("[{}] Execute '{}' REQUEST", ip, actual_command),
    );

    let executor = crate::command::CommandExecutor::new();
    match executor.execute(&actual_command, actual_args.as_deref()) {
        Ok(result) => {
            if result.success {
                log::info!("[Command] [{}] Execute '{}' SUCCESS", ip, actual_command);
                log_to_ui(
                    "success",
                    &format!("[{}] Execute '{}' SUCCESS", ip, actual_command),
                );
            } else {
                log::error!(
                    "[Command] [{}] Execute '{}' FAILED: {}",
                    ip,
                    actual_command,
                    result.stderr
                );
                log_to_ui(
                    "error",
                    &format!(
                        "[{}] Execute '{}' FAILED: {}",
                        ip, actual_command, result.stderr
                    ),
                );
            }
            let error_msg = if result.success {
                None
            } else {
                Some(result.stderr.clone())
            };
            Ok(AxumJson(ApiResponse {
                success: result.success,
                data: Some(result),
                error: error_msg,
            }))
        }
        Err(e) => {
            log::error!("[Command] [{}] Execute '{}' ERROR: {}", ip, actual_command, e);
            log_to_ui(
                "error",
                &format!("[{}] Execute '{}' ERROR: {}", ip, actual_command, e),
            );
            Ok(AxumJson(ApiResponse {
                success: false,
                data: None,
                error: Some(e.to_string()),
            }))
        }
    }
}
