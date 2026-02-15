use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// 计算 HMAC-SHA256
pub fn calculate_hmac(challenge: &str, password: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(password.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(challenge.as_bytes());
    let result = mac.finalize();
    let bytes = result.into_bytes();
    hex::encode(bytes)
}

/// 生成随机设备ID
pub fn generate_device_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
