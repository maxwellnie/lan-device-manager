use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures::{sink::SinkExt, stream::StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::api::{is_ip_blacklisted, AppState};
use crate::auth::AuthManager;
use axum::extract::ConnectInfo;
use std::net::SocketAddr;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum WsMessage {
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "pong")]
    Pong,
    #[serde(rename = "auth")]
    Auth { token: String },
    #[serde(rename = "auth_success")]
    AuthSuccess,
    #[serde(rename = "auth_error")]
    AuthError { message: String },
    #[serde(rename = "status_update")]
    StatusUpdate {
        online: bool,
        cpu_usage: f32,
        memory_usage: u64,
    },
    #[serde(rename = "log")]
    Log {
        timestamp: String,
        level: String,
        message: String,
    },
    #[serde(rename = "command_request")]
    CommandRequest {
        id: String,
        command: String,
        args: Option<Vec<String>>,
    },
    #[serde(rename = "command_response")]
    CommandResponse {
        id: String,
        success: bool,
        output: String,
    },
    #[serde(rename = "error")]
    Error { message: String },
}

#[derive(Clone)]
pub struct WebSocketManager {
    auth_manager: AuthManager,
    tx: broadcast::Sender<WsMessage>,
}

impl WebSocketManager {
    pub fn new(auth_manager: AuthManager) -> Self {
        let (tx, _rx) = broadcast::channel(50);
        Self { auth_manager, tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<WsMessage> {
        self.tx.subscribe()
    }

    pub fn broadcast(&self, message: WsMessage) {
        let _ = self.tx.send(message);
    }

    pub async fn handle_socket(&self, socket: WebSocket, auth_manager: AuthManager, client_ip: String) {
        let (mut sender, mut receiver) = socket.split();
        let _rx = self.subscribe();
        let mut authenticated = false;
        let client_id = Uuid::new_v4().to_string();

        log::info!("WebSocket client connected: {} from IP: {}", client_id, client_ip);

        // 发送欢迎消息
        let welcome = WsMessage::Pong;
        let _ = sender
            .send(Message::Text(serde_json::to_string(&welcome).unwrap()))
            .await;

        // 处理接收到的消息
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    match serde_json::from_str::<WsMessage>(&text) {
                        Ok(ws_msg) => {
                            match ws_msg {
                                WsMessage::Ping => {
                                    let pong = WsMessage::Pong;
                                    let _ = sender
                                        .send(Message::Text(serde_json::to_string(&pong).unwrap()))
                                        .await;
                                }
                                WsMessage::Auth { token } => {
                                    if auth_manager.verify_token(&token) {
                                        authenticated = true;
                                        let success = WsMessage::AuthSuccess;
                                        let _ = sender
                                            .send(Message::Text(
                                                serde_json::to_string(&success).unwrap(),
                                            ))
                                            .await;
                                        log::info!("WebSocket client authenticated: {}", client_id);
                                    } else {
                                        let error = WsMessage::AuthError {
                                            message: "Invalid or expired token".to_string(),
                                        };
                                        let _ = sender
                                            .send(Message::Text(
                                                serde_json::to_string(&error).unwrap(),
                                            ))
                                            .await;
                                    }
                                }
                                WsMessage::CommandRequest { id, command, args } => {
                                    if !authenticated {
                                        let error = WsMessage::Error {
                                            message: "Not authenticated".to_string(),
                                        };
                                        let _ = sender
                                            .send(Message::Text(
                                                serde_json::to_string(&error).unwrap(),
                                            ))
                                            .await;
                                        continue;
                                    }

                                    // 检查白名单
                                    let executor = crate::command::CommandExecutor::new();
                                    match executor.execute(&command, args.as_deref()) {
                                        Ok(result) => {
                                            let response = WsMessage::CommandResponse {
                                                id,
                                                success: result.success,
                                                output: if result.success {
                                                    result.stdout
                                                } else {
                                                    result.stderr
                                                },
                                            };
                                            let _ = sender
                                                .send(Message::Text(
                                                    serde_json::to_string(&response).unwrap(),
                                                ))
                                                .await;
                                        }
                                        Err(_) => {
                                            let error = WsMessage::CommandResponse {
                                                id,
                                                success: false,
                                                output: "Command execution failed".to_string(),
                                            };
                                            let _ = sender
                                                .send(Message::Text(
                                                    serde_json::to_string(&error).unwrap(),
                                                ))
                                                .await;
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                        Err(e) => {
                            log::warn!("Failed to parse WebSocket message: {}", e);
                            let error = WsMessage::Error {
                                message: "Invalid message format".to_string(),
                            };
                            let _ = sender
                                .send(Message::Text(serde_json::to_string(&error).unwrap()))
                                .await;
                        }
                    }
                }
                Message::Close(_) => {
                    log::info!("WebSocket client disconnected: {}", client_id);
                    break;
                }
                _ => {}
            }
        }
    }
}

// WebSocket 升级处理函数
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> Response {
    let client_ip = addr.to_string();
    
    // 检查IP黑名单
    if is_ip_blacklisted(&client_ip) {
        log::warn!("[Security] WebSocket connection from blacklisted IP blocked: {}", client_ip);
        return axum::response::Response::builder()
            .status(axum::http::StatusCode::FORBIDDEN)
            .body(axum::body::Body::from("Access denied: IP is blacklisted"))
            .unwrap();
    }
    
    let manager = state.ws_manager.lock().await.clone();
    let auth_manager = state.auth_manager.clone();

    ws.on_upgrade(move |socket| async move {
        manager.handle_socket(socket, auth_manager, client_ip).await;
    })
}
