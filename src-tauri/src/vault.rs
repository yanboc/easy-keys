use crate::crypto;
use crate::error::{AppError, AppResult};
use crate::models::{ApiKeyRecord, RecordsFile, VaultFile};
use chrono::Utc;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use uuid::Uuid;
use zeroize::Zeroize;
use zeroize::Zeroizing;

/// 应用数据目录下保险库文件名
const VAULT_FILE_NAME: &str = "vault.json";

/// 应用数据目录（跨平台）：
/// macOS: ~/Library/Application Support/easy-keys
/// Linux: ~/.local/share/easy-keys
/// Windows: %APPDATA%\easy-keys
pub fn app_data_dir() -> AppResult<PathBuf> {
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|p| p.join("easy-keys"))
        .ok_or_else(|| AppError::new("无法确定应用数据目录"))
}

pub fn vault_path() -> AppResult<PathBuf> {
    Ok(app_data_dir()?.join(VAULT_FILE_NAME))
}

/// 保险库是否存在
pub fn vault_exists() -> AppResult<bool> {
    Ok(vault_path()?.exists())
}

/// 读取原始保险库文件（不解密）
pub fn read_vault_file() -> AppResult<VaultFile> {
    let path = vault_path()?;
    if !path.exists() {
        return Err(AppError::new("保险库不存在，请先创建"));
    }
    let content = fs::read_to_string(&path)?;
    let vault: VaultFile = serde_json::from_str(&content)?;
    Ok(vault)
}

/// 原子写入保险库（临时文件 + rename，权限 0600）
pub fn write_vault_file(vault: &VaultFile) -> AppResult<()> {
    let dir = app_data_dir()?;
    fs::create_dir_all(&dir)?;
    let path = vault_path()?;

    let json = serde_json::to_vec_pretty(vault)?;
    let tmp = dir.join(format!(".vault.tmp.{}.json", Uuid::new_v4()));

    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(&json)?;
        f.sync_all()?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600))?;
    }

    fs::rename(&tmp, &path)?;
    Ok(())
}

/// 创建新保险库（设置主密码），返回是否成功
pub fn create_vault(password: &str, confirm: &str) -> AppResult<()> {
    if vault_exists()? {
        return Err(AppError::new("保险库已存在"));
    }
    if password.len() < 8 {
        return Err(AppError::new("主密码至少需要 8 位"));
    }
    if password != confirm {
        return Err(AppError::new("两次输入的主密码不一致"));
    }

    let records = RecordsFile {
        version: 1,
        records: vec![],
    };
    let vault = crypto::encrypt_vault(password, &records)?;
    write_vault_file(&vault)?;
    Ok(())
}

/// 解锁：验证主密码并返回明文记录
pub fn unlock_vault(password: &str) -> AppResult<RecordsFile> {
    let vault = read_vault_file()?;
    crypto::decrypt_vault(password, &vault)
}

/// 用主密码重写整个记录集（内部工具）
fn save_records(password: &str, records: &RecordsFile) -> AppResult<()> {
    let vault = crypto::encrypt_vault(password, records)?;
    write_vault_file(&vault)
}

fn now_ts() -> i64 {
    Utc::now().timestamp_millis()
}

/// 新增记录
pub fn add_record(password: &str, mut record: ApiKeyRecord) -> AppResult<ApiKeyRecord> {
    let mut records = unlock_vault(password)?;
    record.id = Uuid::new_v4().to_string();
    let now = now_ts();
    record.created_at = now;
    record.updated_at = now;
    records.records.push(record.clone());
    save_records(password, &records)?;
    Ok(record)
}

/// 更新记录
pub fn update_record(password: &str, record: ApiKeyRecord) -> AppResult<ApiKeyRecord> {
    let mut records = unlock_vault(password)?;
    let mut updated = record.clone();
    updated.updated_at = now_ts();

    let found = records
        .records
        .iter_mut()
        .find(|r| r.id == updated.id)
        .ok_or_else(|| AppError::new("记录不存在"))?;
    // 保留创建时间
    updated.created_at = found.created_at;
    *found = updated.clone();

    save_records(password, &records)?;
    Ok(updated)
}

/// 删除记录
pub fn delete_record(password: &str, id: &str) -> AppResult<()> {
    let mut records = unlock_vault(password)?;
    let before = records.records.len();
    records.records.retain(|r| r.id != id);
    if records.records.len() == before {
        return Err(AppError::new("记录不存在"));
    }
    save_records(password, &records)
}

/// 批量导入记录（迁移导入）
pub fn import_records(password: &str, records: Vec<ApiKeyRecord>) -> AppResult<usize> {
    let mut existing = unlock_vault(password)?;
    let mut count = 0usize;
    for mut r in records {
        r.id = Uuid::new_v4().to_string();
        let now = now_ts();
        r.created_at = now;
        r.updated_at = now;
        existing.records.push(r);
        count += 1;
    }
    save_records(password, &existing)?;
    Ok(count)
}

/// 修改主密码：用旧密码解锁，用新密码重新加密
pub fn change_password(old_password: &str, new_password: &str) -> AppResult<()> {
    if new_password.len() < 8 {
        return Err(AppError::new("主密码至少需要 8 位"));
    }
    let records = unlock_vault(old_password)?;
    save_records(new_password, &records)
}

/// 复制密钥时对内存中的明文做保护（无操作占位，防优化）
#[allow(dead_code)]
pub fn burn_secret(secret: Zeroizing<String>) {
    let mut s = secret;
    s.zeroize();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto;

    fn sample_record() -> ApiKeyRecord {
        ApiKeyRecord {
            id: String::new(),
            name: "测试密钥".into(),
            provider: "openai".into(),
            base_url: "https://api.openai.com/v1".into(),
            auth_type: "bearer".into(),
            api_key: "sk-test-1234567890".into(),
            models: vec!["gpt-4o".into()],
            notes: "测试".into(),
            env_name: "".into(),
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let records = RecordsFile {
            version: 1,
            records: vec![sample_record()],
        };
        let vault = crypto::encrypt_vault("correct-horse-123", &records).unwrap();
        // 密文不应包含明文密钥
        let json = serde_json::to_string(&vault).unwrap();
        assert!(!json.contains("sk-test-1234567890"));

        let decrypted = crypto::decrypt_vault("correct-horse-123", &vault).unwrap();
        assert_eq!(decrypted.records.len(), 1);
        assert_eq!(decrypted.records[0].api_key, "sk-test-1234567890");
    }

    #[test]
    fn test_decrypt_wrong_password_fails() {
        let records = RecordsFile {
            version: 1,
            records: vec![],
        };
        let vault = crypto::encrypt_vault("correct-horse-123", &records).unwrap();
        let err = crypto::decrypt_vault("wrong-password", &vault).unwrap_err();
        assert!(err.message.contains("密码错误"));
    }

    #[test]
    fn test_same_password_different_ciphertext() {
        // 相同明文 + 相同密码，两次加密结果必须不同（随机 salt/nonce）
        let records = RecordsFile {
            version: 1,
            records: vec![sample_record()],
        };
        let v1 = crypto::encrypt_vault("pwd-12345678", &records).unwrap();
        let v2 = crypto::encrypt_vault("pwd-12345678", &records).unwrap();
        assert_ne!(v1.ciphertext, v2.ciphertext);
        assert_ne!(v1.kdf.salt, v2.kdf.salt);
        assert_ne!(v1.nonce, v2.nonce);
    }

    #[test]
    fn test_effective_env_name() {
        let mut r = sample_record();
        r.env_name = "".into();
        r.provider = "deepseek".into();
        assert_eq!(r.effective_env_name(), "DEEPSEEK_API_KEY");

        r.env_name = "MY CUSTOM NAME".into();
        assert_eq!(r.effective_env_name(), "MY_CUSTOM_NAME");
    }
}
