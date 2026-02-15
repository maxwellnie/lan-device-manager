use reqwest::Client;
use std::time::Duration;

use crate::models::{
    ApiResponse, AuthChallenge, AuthRequest, AuthResponse, AuthResult,
    CommandResult, SystemInfo,
};
use crate::crypto::calculate_hmac;

pub struct ApiClient {
    client: Client,
    base_url: String,
    token: Option<String>,
}

impl ApiClient {
    pub fn new(ip: &str, port: u16) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(12)) // 局域网内12秒超时
            .build()
            .expect("Failed to create HTTP client");
        
        Self {
            client,
            base_url: format!("http://{}:{}", ip, port),
            token: None,
        }
    }
    
    /// 健康检查
    pub async fn health_check(&self) -> Result<bool, String> {
        let url = format!("{}/api/health", self.base_url);
        match self.client.get(&url).send().await {
            Ok(response) => Ok(response.status().is_success()),
            Err(e) => Err(format!("Request failed: {}", e)),
        }
    }
    
    /// 检查是否需要认证
    pub async fn check_auth_required(&self) -> Result<bool, String> {
        let url = format!("{}/api/auth/check", self.base_url);
        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        let api_response: ApiResponse<serde_json::Value> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        if api_response.success {
            // 解析 requires_auth 字段
            if let Some(data) = api_response.data {
                if let Some(requires_auth) = data.get("requires_auth").and_then(|v| v.as_bool()) {
                    return Ok(requires_auth);
                }
            }
            Ok(false)
        } else {
            // 如果请求失败，假设需要认证（安全起见）
            Ok(true)
        }
    }
    
    /// 获取认证挑战
    pub async fn get_challenge(&self) -> Result<String, String> {
        let url = format!("{}/api/auth/challenge", self.base_url);
        let response = self.client
            .post(&url)
            .json(&serde_json::json!({}))
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        let api_response: ApiResponse<AuthChallenge> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        if api_response.success {
            Ok(api_response.data.unwrap().challenge)
        } else {
            Err(api_response.error.unwrap_or_else(|| "Unknown error".to_string()))
        }
    }
    
    /// 认证
    pub async fn authenticate(&mut self, password: &str) -> Result<AuthResult, String> {
        // 获取挑战
        let challenge = self.get_challenge().await?;
        
        // 计算响应
        let response = calculate_hmac(&challenge, password);
        
        // 发送认证请求
        let url = format!("{}/api/auth/login", self.base_url);
        let auth_request = AuthRequest {
            challenge,
            response,
            password: password.to_string(),
        };
        
        let api_response = self.client
            .post(&url)
            .json(&auth_request)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        let auth_response: ApiResponse<AuthResponse> = api_response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        if auth_response.success {
            let data = auth_response.data.unwrap();
            self.token = Some(data.token.clone());
            Ok(AuthResult {
                success: true,
                token: Some(data.token),
                expires_in: Some(data.expires_in),
                error: None,
            })
        } else {
            Ok(AuthResult {
                success: false,
                token: None,
                expires_in: None,
                error: auth_response.error,
            })
        }
    }
    
    /// 获取系统信息
    pub async fn get_system_info(&self) -> Result<SystemInfo, String> {
        let url = format!("{}/api/system/info", self.base_url);
        
        // 构建请求，如果有token则添加
        let mut request = self.client.get(&url);
        if let Some(ref token) = self.token {
            request = request.query(&[("token", token)]);
        }
        
        let response = request
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        let api_response: ApiResponse<SystemInfo> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        if api_response.success {
            Ok(api_response.data.unwrap())
        } else {
            Err(api_response.error.unwrap_or_else(|| "Unknown error".to_string()))
        }
    }
    
    /// 执行命令
    pub async fn execute_command(
        &self,
        command: &str,
        args: Option<Vec<String>>,
    ) -> Result<CommandResult, String> {
        let token = self.token.as_ref()
            .ok_or_else(|| "Not authenticated".to_string())?;
        
        let url = format!("{}/api/command/execute", self.base_url);
        let body = serde_json::json!({
            "token": token,
            "command": command,
            "args": args,
        });
        
        let response = self.client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        let api_response: ApiResponse<CommandResult> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        if api_response.success {
            Ok(api_response.data.unwrap())
        } else {
            Err(api_response.error.unwrap_or_else(|| "Unknown error".to_string()))
        }
    }
    
    /// 关机
    pub async fn shutdown(&self, delay: Option<u32>) -> Result<CommandResult, String> {
        let token = self.token.as_ref()
            .ok_or_else(|| "Not authenticated".to_string())?;
        
        let url = format!("{}/api/system/shutdown", self.base_url);
        let args = delay.map(|d| vec![d.to_string()]);
        let body = serde_json::json!({
            "token": token,
            "command": "shutdown",
            "args": args,
        });
        
        let response = self.client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        let api_response: ApiResponse<CommandResult> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        if api_response.success {
            Ok(api_response.data.unwrap())
        } else {
            Err(api_response.error.unwrap_or_else(|| "Unknown error".to_string()))
        }
    }
    
    /// 重启
    pub async fn restart(&self, delay: Option<u32>) -> Result<CommandResult, String> {
        let token = self.token.as_ref()
            .ok_or_else(|| "Not authenticated".to_string())?;
        
        let url = format!("{}/api/system/restart", self.base_url);
        let args = delay.map(|d| vec![d.to_string()]);
        let body = serde_json::json!({
            "token": token,
            "command": "restart",
            "args": args,
        });
        
        let response = self.client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        let api_response: ApiResponse<CommandResult> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        if api_response.success {
            Ok(api_response.data.unwrap())
        } else {
            Err(api_response.error.unwrap_or_else(|| "Unknown error".to_string()))
        }
    }
    
    /// 睡眠
    pub async fn sleep(&self) -> Result<CommandResult, String> {
        let token = self.token.as_ref()
            .ok_or_else(|| "Not authenticated".to_string())?;
        
        let url = format!("{}/api/system/sleep", self.base_url);
        let body = serde_json::json!({
            "token": token,
            "command": "sleep",
            "args": null,
        });
        
        let response = self.client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        let api_response: ApiResponse<CommandResult> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        if api_response.success {
            Ok(api_response.data.unwrap())
        } else {
            Err(api_response.error.unwrap_or_else(|| "Unknown error".to_string()))
        }
    }
    
    /// 锁屏
    pub async fn lock(&self) -> Result<CommandResult, String> {
        let token = self.token.as_ref()
            .ok_or_else(|| "Not authenticated".to_string())?;
        
        let url = format!("{}/api/system/lock", self.base_url);
        let body = serde_json::json!({
            "token": token,
            "command": "lock",
            "args": null,
        });
        
        let response = self.client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        let api_response: ApiResponse<CommandResult> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        if api_response.success {
            Ok(api_response.data.unwrap())
        } else {
            Err(api_response.error.unwrap_or_else(|| "Unknown error".to_string()))
        }
    }
    
    pub fn set_token(&mut self, token: String) {
        self.token = Some(token);
    }
    
    pub fn clear_token(&mut self) {
        self.token = None;
    }
    
    pub fn get_token(&self) -> Option<&String> {
        self.token.as_ref()
    }
}
