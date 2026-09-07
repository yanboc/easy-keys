use crate::crypto;
use crate::error::{AppError, AppResult};
use crate::models::{ApiKeyRecord, RecordsFile, VaultFile};
use chrono::Utc;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;
use zeroize::Zeroize;
use zeroize::Zeroizing;

/// 生物识别解锁后的会话主密码：仅存于 Rust 内存（Zeroizing），
/// 锁定时清除，进程退出即消失；不出 Rust 层、不落盘。
static SESSION_PASSWORD: Mutex<Option<Zeroizing<String>>> = Mutex::new(None);

/// 建立会话（生物识别解锁成功后调用）
pub fn set_session_password(password: Zeroizing<String>) {
    if let Ok(mut guard) = SESSION_PASSWORD.lock() {
        *guard = Some(password);
    }
}

/// 取会话主密码（无会话时 None）
pub fn session_password() -> Option<Zeroizing<String>> {
    SESSION_PASSWORD.lock().ok().and_then(|g| g.clone())
}

/// 锁定：清除会话主密码
pub fn clear_session_password() {
    if let Ok(mut guard) = SESSION_PASSWORD.lock() {
        *guard = None;
    }
}

/// 主密码变更后同步会话（仅当会话存在）
pub fn update_session_password(new_password: &str) {
    if let Ok(mut guard) = SESSION_PASSWORD.lock() {
        if guard.is_some() {
            *guard = Some(Zeroizing::new(new_password.to_string()));
        }
    }
}

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

/// 供测试注入的数据目录。
/// 通过 env var EASY_KEYS_DATA_DIR 覆盖（首次调用后锁定，保证测试进程内一致）。
/// 数据目录解析：优先 EASY_KEYS_DATA_DIR（测试注入），否则真实用户目录。
/// 每次实时读取，便于测试在 Mutex 保护下切换目录。
fn data_dir() -> PathBuf {
    std::env::var_os("EASY_KEYS_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| app_data_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

/// 测试辅助：设置数据目录（仅测试进程调用）
pub fn set_data_dir_for_tests(dir: PathBuf) {
    std::env::set_var("EASY_KEYS_DATA_DIR", dir);
}

pub fn vault_path() -> AppResult<PathBuf> {
    Ok(data_dir().join(VAULT_FILE_NAME))
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
    let dir = data_dir();
    fs::create_dir_all(&dir)?;
    let path = dir.join(VAULT_FILE_NAME);

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
