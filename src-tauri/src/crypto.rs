use crate::error::{AppError, AppResult};
use crate::models::{KdfParams, RecordsFile, VaultFile};
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use rand::RngCore;
use zeroize::Zeroizing;

/// Argon2id 推荐参数（OWASP）
const M_COST: u32 = 19_456; // 19 MiB
const T_COST: u32 = 2;
const P_COST: u32 = 1;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

/// 用主密码派生 AES-256 密钥（Argon2id）
fn derive_key(password: &str, salt: &[u8]) -> AppResult<Zeroizing<[u8; KEY_LEN]>> {
    let params = Params::new(M_COST, T_COST, P_COST, Some(KEY_LEN))
        .map_err(|e| AppError::new(format!("Argon2 参数错误: {e}")))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let salt_string = SaltString::encode_b64(salt)
        .map_err(|e| AppError::new(format!("salt 编码错误: {e}")))?;
    let hash = argon2
        .hash_password(password.as_bytes(), &salt_string)
        .map_err(AppError::from)?;
    let binding = hash.hash.unwrap();
    let raw = binding.as_bytes();
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    key.copy_from_slice(raw);
    Ok(key)
}

/// 加密保险库载荷（records JSON -> VaultFile）
pub fn encrypt_vault(password: &str, records: &RecordsFile) -> AppResult<VaultFile> {
    let plaintext = serde_json::to_vec(records)?;

    // 随机 salt + nonce
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);

    let key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(key.as_slice())
        .map_err(|e| AppError::new(format!("AES 初始化错误: {e}")))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, Payload { msg: &plaintext, aad: b"tokey-vault-v1" })
        .map_err(AppError::from)?;

    Ok(VaultFile {
        version: 1,
        kdf: KdfParams {
            algo: "argon2id".into(),
            m_cost: M_COST,
            t_cost: T_COST,
            p_cost: P_COST,
            salt: B64.encode(salt),
        },
        nonce: B64.encode(nonce_bytes),
        ciphertext: B64.encode(ciphertext),
    })
}

/// 解密保险库（VaultFile -> records），密码错误返回明确错误
pub fn decrypt_vault(password: &str, vault: &VaultFile) -> AppResult<RecordsFile> {
    let salt = B64
        .decode(&vault.kdf.salt)
        .map_err(|_| AppError::new("保险库 salt 损坏"))?;
    let nonce_bytes = B64
        .decode(&vault.nonce)
        .map_err(|_| AppError::new("保险库 nonce 损坏"))?;
    let ciphertext = B64
        .decode(&vault.ciphertext)
        .map_err(|_| AppError::new("保险库密文损坏"))?;

    let key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(key.as_slice())
        .map_err(|e| AppError::new(format!("AES 初始化错误: {e}")))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = cipher
        .decrypt(
            nonce,
            Payload {
                msg: &ciphertext,
                aad: b"tokey-vault-v1",
            },
        )
        .map_err(|_| AppError::new("主密码错误或保险库已损坏"))?;

    let records: RecordsFile = serde_json::from_slice(&plaintext)?;
    Ok(records)
}

/// 生成随机密钥（用于 .ekey 导出文件）
pub fn generate_random_bytes(len: usize) -> Vec<u8> {
    let mut buf = vec![0u8; len];
    OsRng.fill_bytes(&mut buf);
    buf
}
