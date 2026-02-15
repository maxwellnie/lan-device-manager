use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use log::{info, error};
use uuid::Uuid;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::business::command::CommandExecutor;

#[derive(Debug, Deserialize)]
pub struct Request {
    r#type: String,
    request_id: String,
    timestamp: Option<u64>,
    data: Value,
}

#[derive(Debug, Serialize)]
pub struct Response {
    r#type: String,
    request_id: String,
    timestamp: u64,
    success: bool,
    message: String,
    data: Value,
}

pub struct TcpServer {
    port: u16,
}

impl TcpServer {
    pub fn new(port: u16) -> Self {
        Self {
            port,
        }
    }
    
    pub async fn start(&self) -> Result<u16, Box<dyn std::error::Error>> {
        let listener = TcpListener::bind(format!("0.0.0.0:{}", self.port)).await?;
        let actual_port = listener.local_addr()?.port();
        info!("TCP server started on port {}", actual_port);
        
        // Start handling connections in a separate task
        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((socket, addr)) => {
                        info!("New connection from {}", addr);
                        
                        tokio::spawn(async move {
                            if let Err(e) = Self::handle_connection(socket).await {
                                error!("Error handling connection: {:?}", e);
                            }
                        });
                    }
                    Err(e) => {
                        error!("Failed to accept connection: {:?}", e);
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    }
                }
            }
        });
        
        Ok(actual_port)
    }
    
    async fn handle_connection(mut socket: TcpStream) -> Result<(), Box<dyn std::error::Error>> {
        let mut buffer = vec![0; 1024];
        
        loop {
            let n = socket.read(&mut buffer).await?;
            if n == 0 {
                break;
            }
            
            let request_str = String::from_utf8_lossy(&buffer[..n]);
            info!("Received request: {}", request_str);
            
            let request: Request = serde_json::from_str(&request_str)?;
            let response = Self::process_request(request).await?;
            
            let response_str = serde_json::to_string(&response)?;
            socket.write_all(response_str.as_bytes()).await?;
        }
        
        Ok(())
    }
    
    async fn process_request(request: Request) -> Result<Response, Box<dyn std::error::Error>> {
       // unimplemented!()
    }
}