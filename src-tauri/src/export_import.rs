use crate::crypto;
use crate::error::{AppError, AppResult};
use crate::models::{ApiKeyRecord, RecordsFile};
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

/// .ekey 可迁移文件格式头
pub const EKEY_MAGIC: &str = "EASYKEYS-EKEY";
pub const EKEY_VERSION: u32 = 1;

/// 加密导出文件结构
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EkeyFile {
    pub magic: String,
    pub version: u32,
    pub created_at: String,
    pub kdf_salt: String,
    pub nonce: String,
    pub ciphertext: String,
}

fn derive_export_key(password: &str, salt: &[u8]) -> AppResult<Zeroizing<[u8; 32]>> {
    let params = Params::new(19_456, 2, 1, Some(32))
        .map_err(|e| AppError::new(format!("Argon2 参数错误: {e}")))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let salt_string = SaltString::encode_b64(salt)
        .map_err(|e| AppError::new(format!("salt 编码错误: {e}")))?;
    let hash = argon2
        .hash_password(password.as_bytes(), &salt_string)
        .map_err(AppError::from)?;
    let binding = hash.hash.unwrap();
    let raw = binding.as_bytes();
    let mut key = Zeroizing::new([0u8; 32]);
    key.copy_from_slice(raw);
    Ok(key)
}

/// 生成明文导出 JSON（含密钥，需二次确认）
pub fn plain_json_export(records: &[ApiKeyRecord]) -> AppResult<String> {
    let payload = RecordsFile {
        version: 1,
        records: records.to_vec(),
    };
    let json = serde_json::to_string_pretty(&payload)?;
    Ok(json)
}

/// 生成加密 .ekey 可迁移文件
pub fn encrypted_export(records: &[ApiKeyRecord], password: &str) -> AppResult<String> {
    if password.len() < 6 {
        return Err(AppError::new("导出口令至少需要 6 位"));
    }
    let payload = serde_json::to_vec(&RecordsFile {
        version: 1,
        records: records.to_vec(),
    })?;

    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);

    let key = derive_export_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(key.as_slice())
        .map_err(|e| AppError::new(format!("AES 初始化错误: {e}")))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: &payload,
                aad: EKEY_MAGIC.as_bytes(),
            },
        )
        .map_err(AppError::from)?;

    let ekey = EkeyFile {
        magic: EKEY_MAGIC.into(),
        version: EKEY_VERSION,
        created_at: chrono::Utc::now().to_rfc3339(),
        kdf_salt: B64.encode(salt),
        nonce: B64.encode(nonce_bytes),
        ciphertext: B64.encode(ciphertext),
    };
    Ok(serde_json::to_string_pretty(&ekey)?)
}

/// 解密 .ekey 文件
pub fn encrypted_import(content: &str, password: &str) -> AppResult<Vec<ApiKeyRecord>> {
    let ekey: EkeyFile = serde_json::from_str(content)?;
    if ekey.magic != EKEY_MAGIC {
        return Err(AppError::new("不是有效的 easy-keys 加密导出文件"));
    }
    let salt = B64.decode(&ekey.kdf_salt).map_err(|_| AppError::new("文件 salt 损坏"))?;
    let nonce_bytes = B64.decode(&ekey.nonce).map_err(|_| AppError::new("文件 nonce 损坏"))?;
    let ciphertext = B64
        .decode(&ekey.ciphertext)
        .map_err(|_| AppError::new("文件密文损坏"))?;

    let key = derive_export_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(key.as_slice())
        .map_err(|e| AppError::new(format!("AES 初始化错误: {e}")))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, Payload { msg: &ciphertext, aad: EKEY_MAGIC.as_bytes() })
        .map_err(|_| AppError::new("导出口令错误或文件已损坏"))?;

    let records: RecordsFile = serde_json::from_slice(&plaintext)?;
    Ok(records.records)
}

/// 解析明文 JSON 导入（校验格式）
pub fn plain_json_import(content: &str) -> AppResult<Vec<ApiKeyRecord>> {
    let records: RecordsFile = serde_json::from_str(content)?;
    if records.version > 1 {
        return Err(AppError::new("不支持的导入文件版本"));
    }
    Ok(records.records)
}

/// 导出工具：生成随机密钥（供未来扩展使用）
#[allow(dead_code)]
pub fn random_export_key() -> Vec<u8> {
    crypto::generate_random_bytes(32)
}
