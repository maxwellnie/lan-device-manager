use argon2::password_hash::{rand_core::OsRng, SaltString};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

use crate::models::{AuthChallenge, AuthResponse};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone)]
pub struct Session {
    pub created_at: DateTime<Utc>,
    pub last_access: DateTime<Utc>,
    pub device_id: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AuthManager {
    password_hash: Arc<Mutex<Option<String>>>,
    jwt_secret: String,
    sessions: Arc<Mutex<HashMap<String, Session>>>,
    challenges: Arc<Mutex<HashMap<String, AuthChallenge>>>,
    max_sessions: usize,
}

impl AuthManager {
    pub fn new() -> Self {
        // 从配置文件加载密码
        let config = crate::config::AppConfig::load();
        
        let password_hash = if let Some(hash) = config.password_hash {
            log::info!("Loaded password hash from config");
            Some(hash)
        } else {
            // 如果没有设置密码，返回 None（表示不需要认证）
            log::info!("No password in config, authentication is disabled");
            None
        };

        Self {
            password_hash: Arc::new(Mutex::new(password_hash)),
            jwt_secret: Uuid::new_v4().to_string(),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            challenges: Arc::new(Mutex::new(HashMap::new())),
            max_sessions: 10,
        }
    }

    /// 设置密码（首次设置）
    pub fn set_password(&mut self, password: &str) -> Result<bool, Box<dyn std::error::Error>> {
        if password.len() < 8 {
            return Err("Password must be at least 8 characters long".into());
        }

        let argon2 = Argon2::default();
        let salt = SaltString::generate(&mut OsRng);
        let password_hash = match argon2.hash_password(password.as_bytes(), &salt) {
            Ok(hash) => hash.to_string(),
            Err(e) => return Err(format!("Failed to hash password: {}", e).into()),
        };

        // 更新内存中的密码
        {
            let mut hash = self.password_hash.lock().unwrap();
            *hash = Some(password_hash.clone());
        }

        // 保存到配置文件
        let mut config = crate::config::AppConfig::load();
        config.password_hash = Some(password_hash);
        if let Err(e) = config.save() {
            log::error!("Failed to save password to config: {}", e);
            return Err(format!("Failed to save password: {}", e).into());
        }

        log::info!("Password has been set and saved to config");
        Ok(true)
    }

    /// 验证密码是否正确
    pub fn verify_password(&self, password: &str) -> bool {
        let hash = self.password_hash.lock().unwrap();

        if let Some(ref stored_hash) = *hash {
            if let Ok(parsed_hash) = PasswordHash::new(stored_hash) {
                return Argon2::default()
                    .verify_password(password.as_bytes(), &parsed_hash)
                    .is_ok();
            }
        }

        false
    }

    /// 修改密码
    pub fn change_password(
        &mut self,
        old_password: &str,
        new_password: &str,
    ) -> Result<bool, Box<dyn std::error::Error>> {
        if !self.verify_password(old_password) {
            return Err("Current password is incorrect".into());
        }

        if new_password.len() < 8 {
            return Err("New password must be at least 8 characters long".into());
        }

        self.set_password(new_password)
    }

    /// 检查是否已设置密码
    pub fn is_password_set(&self) -> bool {
        let hash = self.password_hash.lock().unwrap();
        hash.is_some()
    }

    /// 清除密码
    pub fn clear_password(&mut self) {
        let mut hash = self.password_hash.lock().unwrap();
        *hash = None;
        log::info!("Password cleared");
    }

    /// 生成认证挑战
    pub fn generate_challenge(&self) -> String {
        let challenge = Uuid::new_v4().to_string();
        let expires_at = Utc::now() + Duration::minutes(5);

        let auth_challenge = AuthChallenge {
            challenge: challenge.clone(),
            expires_at,
        };

        let mut challenges = self.challenges.lock().unwrap();
        challenges.insert(challenge.clone(), auth_challenge);

        // 清理过期挑战
        challenges.retain(|_, v| v.expires_at > Utc::now());

        challenge
    }

    /// 验证挑战响应并生成令牌
    pub fn authenticate(
        &self,
        challenge: &str,
        response: &str,
        password: &str,
    ) -> Result<AuthResponse, Box<dyn std::error::Error>> {
        // 验证挑战是否有效
        {
            let challenges = self.challenges.lock().unwrap();
            if let Some(auth_challenge) = challenges.get(challenge) {
                if auth_challenge.expires_at < Utc::now() {
                    return Err("Challenge has expired".into());
                }
            } else {
                return Err("Invalid challenge".into());
            }
        }

        // 验证密码
        if !self.verify_password(password) {
            return Err("Invalid password".into());
        }

        // 验证HMAC响应
        let expected_response = self.calculate_hmac(challenge, password);
        if expected_response != response {
            return Err("Invalid response".into());
        }

        // 删除已使用的挑战
        {
            let mut challenges = self.challenges.lock().unwrap();
            challenges.remove(challenge);
        }

        // 生成令牌
        let token = self.generate_token();

        // 保存会话
        {
            let mut sessions = self.sessions.lock().unwrap();

            // 如果会话数超过限制，删除最旧的
            if sessions.len() >= self.max_sessions {
                let oldest = sessions
                    .iter()
                    .min_by_key(|(_, s)| s.created_at)
                    .map(|(k, _)| k.clone());
                if let Some(k) = oldest {
                    sessions.remove(&k);
                }
            }

            sessions.insert(
                token.clone(),
                Session {
                    created_at: Utc::now(),
                    last_access: Utc::now(),
                    device_id: None,
                },
            );
        }

        log::info!("New session created");

        Ok(AuthResponse {
            token,
            expires_in: 3600, // 1小时
        })
    }

    /// 验证令牌
    pub fn verify_token(&self, token: &str) -> bool {
        let mut sessions = self.sessions.lock().unwrap();

        if let Some(session) = sessions.get_mut(token) {
            // 检查会话是否过期（1小时）
            if Utc::now() - session.created_at > Duration::hours(1) {
                sessions.remove(token);
                return false;
            }

            // 更新最后访问时间
            session.last_access = Utc::now();
            return true;
        }

        false
    }

    /// 吊销令牌
    pub fn revoke_token(&self, token: &str) -> bool {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.remove(token).is_some()
    }

    /// 吊销所有会话
    pub fn revoke_all_sessions(&self) {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.clear();
        log::info!("All sessions revoked");
    }

    /// 计算HMAC响应
    fn calculate_hmac(&self, challenge: &str, password: &str) -> String {
        let mut mac =
            HmacSha256::new_from_slice(password.as_bytes()).expect("HMAC can take key of any size");
        mac.update(challenge.as_bytes());
        let result = mac.finalize();
        let bytes = result.into_bytes();
        hex::encode(bytes)
    }

    /// 生成JWT令牌（简化版）
    fn generate_token(&self) -> String {
        Uuid::new_v4().to_string()
    }

    /// 获取活跃会话数
    pub fn get_session_count(&self) -> usize {
        let sessions = self.sessions.lock().unwrap();
        sessions.len()
    }

    /// 重新加载密码（配置热重载时调用）
    pub fn reload_password(&self) {
        let config = crate::config::AppConfig::load();
        let mut hash = self.password_hash.lock().unwrap();
        *hash = config.password_hash;
        log::info!("Password reloaded from config");
    }
}

impl Default for AuthManager {
    fn default() -> Self {
        Self::new()
    }
}
