//! tokey 核心逻辑集成测试（独立 tests/ 目录）
//!
//! 覆盖：加密保险库往返、错误密码、CRUD、改密码、批量导入、边界情况。
//!
//! 隔离策略：所有需要文件系统的测试通过全局 Mutex 串行执行，
//! 每个测试在锁内设置独立的 TOKEY_DATA_DIR 临时目录，互不干扰。

use tokey_lib::crypto;
use tokey_lib::models::{ApiKeyRecord, RecordsFile, VaultFile};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

/// 全局串行锁：cargo 集成测试并行运行，文件系统测试需要互斥
static FS_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
fn fs_lock() -> &'static Mutex<()> {
    FS_LOCK.get_or_init(|| Mutex::new(()))
}

/// 生成独立临时目录（带 tag 保证唯一）
fn make_temp_dir(tag: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "tokey-test-{tag}-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn sample_record(name: &str, key: &str) -> ApiKeyRecord {
    ApiKeyRecord {
        id: String::new(),
        name: name.into(),
        provider: "openai".into(),
        base_url: "https://api.openai.com/v1".into(),
        auth_type: "bearer".into(),
        api_key: key.into(),
        models: vec!["gpt-4o".into()],
        billing: "metered".into(),
        notes: String::new(),
        env_name: String::new(),
        created_at: 0,
        updated_at: 0,
    }
}

// ============ 加密核心（纯内存，无需文件系统，可并行） ============

#[test]
fn test_encrypt_decrypt_roundtrip() {
    let records = RecordsFile {
        version: 1,
        records: vec![sample_record("测试", "sk-secret-abc")],
    };
    let vault = crypto::encrypt_vault("correct-horse-123", &records).unwrap();
    let json = serde_json::to_string(&vault).unwrap();
    // 密文绝不能包含明文密钥
    assert!(!json.contains("sk-secret-abc"));

    let decrypted = crypto::decrypt_vault("correct-horse-123", &vault).unwrap();
    assert_eq!(decrypted.records.len(), 1);
    assert_eq!(decrypted.records[0].api_key, "sk-secret-abc");
}

#[test]
fn test_decrypt_wrong_password_fails() {
    let records = RecordsFile {
        version: 1,
        records: vec![],
    };
    let vault = crypto::encrypt_vault("correct-horse-123", &records).unwrap();
    let err = crypto::decrypt_vault("wrong-password", &vault).unwrap_err();
    assert!(err.message.contains("密码错误"), "错误信息: {}", err.message);
}

#[test]
fn test_same_input_different_ciphertext() {
    // 相同明文 + 相同密码，两次加密结果必须不同（随机 salt/nonce 保证）
    let records = RecordsFile {
        version: 1,
        records: vec![sample_record("a", "sk-1")],
    };
    let v1 = crypto::encrypt_vault("pwd-12345678", &records).unwrap();
    let v2 = crypto::encrypt_vault("pwd-12345678", &records).unwrap();
    assert_ne!(v1.ciphertext, v2.ciphertext);
    assert_ne!(v1.kdf.salt, v2.kdf.salt);
    assert_ne!(v1.nonce, v2.nonce);
}

#[test]
fn test_vault_file_structure_valid() {
    let records = RecordsFile {
        version: 1,
        records: vec![sample_record("a", "sk-1")],
    };
    let vault = crypto::encrypt_vault("pwd-12345678", &records).unwrap();
    // 落盘 JSON 可反序列化
    let json = serde_json::to_string(&vault).unwrap();
    let parsed: VaultFile = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed.version, 1);
    assert_eq!(parsed.kdf.algo, "argon2id");
    assert!(!parsed.ciphertext.is_empty());
}

#[test]
fn test_env_name_generation() {
    let mut r = sample_record("x", "sk-1");
    r.provider = "deepseek".into();
    r.env_name = String::new();
    assert_eq!(r.effective_env_name(), "DEEPSEEK_API_KEY");

    r.env_name = "MY CUSTOM NAME".into();
    assert_eq!(r.effective_env_name(), "MY_CUSTOM_NAME");
}

// ============ 保险库 CRUD（文件系统，串行 + 独立目录） ============

fn with_vault(tag: &str, body: impl FnOnce(&str) -> ()) {
    // Poisoned 锁在测试 panic 后出现，这里恢复以继续跑后续测试
    let guard = fs_lock().lock().unwrap_or_else(|e| e.into_inner());
    let _guard = guard;
    let dir = make_temp_dir(tag);
    tokey_lib::vault::set_data_dir_for_tests(dir);
    body("password-123");
}

#[test]
fn test_vault_crud_full_cycle() {
    with_vault("crud", |pwd| {
        // 创建
        tokey_lib::vault::create_vault(pwd, pwd).unwrap();
        assert!(tokey_lib::vault::vault_exists().unwrap());

        // 添加
        let rec = tokey_lib::vault::add_record(pwd, sample_record("我的 OpenAI", "sk-123")).unwrap();
        assert!(!rec.id.is_empty());
        let rec2 = tokey_lib::vault::add_record(pwd, sample_record("DeepSeek", "sk-456")).unwrap();

        // 解锁验证
        let records = tokey_lib::vault::unlock_vault(pwd).unwrap();
        assert_eq!(records.records.len(), 2);

        // 更新
        let mut updated = rec.clone();
        updated.name = "我的 OpenAI 主号".into();
        let saved = tokey_lib::vault::update_record(pwd, updated).unwrap();
        assert_eq!(saved.name, "我的 OpenAI 主号");
        // 创建时间应保留
        assert_eq!(saved.created_at, rec.created_at);
        assert!(saved.updated_at >= rec.updated_at);

        // 删除
        tokey_lib::vault::delete_record(pwd, &rec.id).unwrap();
        let after = tokey_lib::vault::unlock_vault(pwd).unwrap();
        assert_eq!(after.records.len(), 1);
        assert_eq!(after.records[0].id, rec2.id);
    });
}

#[test]
fn test_vault_create_validation() {
    with_vault("create-validate", |pwd| {
        // 短密码拒绝
        let err = tokey_lib::vault::create_vault("short", "short").unwrap_err();
        assert!(err.message.contains("8 位"));

        // 两次不一致拒绝
        let err = tokey_lib::vault::create_vault("password-123", "password-456").unwrap_err();
        assert!(err.message.contains("不一致"));

        // 重复创建拒绝
        tokey_lib::vault::create_vault(pwd, pwd).unwrap();
        let err = tokey_lib::vault::create_vault(pwd, pwd).unwrap_err();
        assert!(err.message.contains("已存在"));
    });
}

#[test]
fn test_update_nonexistent_fails() {
    with_vault("update-nonexist", |pwd| {
        tokey_lib::vault::create_vault(pwd, pwd).unwrap();
        let mut rec = sample_record("幽灵", "sk-x");
        rec.id = "no-such-id".into();
        let err = tokey_lib::vault::update_record(pwd, rec).unwrap_err();
        assert!(err.message.contains("不存在"));
    });
}

#[test]
fn test_delete_nonexistent_fails() {
    with_vault("delete-nonexist", |pwd| {
        tokey_lib::vault::create_vault(pwd, pwd).unwrap();
        let err = tokey_lib::vault::delete_record(pwd, "no-such-id").unwrap_err();
        assert!(err.message.contains("不存在"));
    });
}

#[test]
fn test_wrong_password_on_ops_fails() {
    with_vault("wrong-pwd-ops", |pwd| {
        tokey_lib::vault::create_vault(pwd, pwd).unwrap();
        // 用错密码添加应失败（解锁失败）
        let err = tokey_lib::vault::add_record("wrong-password", sample_record("x", "sk-1")).unwrap_err();
        assert!(err.message.contains("密码错误"), "错误信息: {}", err.message);
    });
}

#[test]
fn test_change_password() {
    with_vault("change-pwd", |pwd| {
        tokey_lib::vault::create_vault(pwd, pwd).unwrap();
        tokey_lib::vault::add_record(pwd, sample_record("A", "sk-A")).unwrap();

        tokey_lib::vault::change_password(pwd, "new-password-1").unwrap();

        // 旧密码应失效
        let err = tokey_lib::vault::unlock_vault(pwd).unwrap_err();
        assert!(err.message.contains("密码错误"));
        // 新密码可解锁，数据完好
        let records = tokey_lib::vault::unlock_vault("new-password-1").unwrap();
        assert_eq!(records.records.len(), 1);
        assert_eq!(records.records[0].api_key, "sk-A");
    });
}

#[test]
fn test_import_records_appends() {
    with_vault("import", |pwd| {
        tokey_lib::vault::create_vault(pwd, pwd).unwrap();
        tokey_lib::vault::add_record(pwd, sample_record("已有", "sk-1")).unwrap();

        let incoming = vec![
            sample_record("迁移1", "sk-2"),
            sample_record("迁移2", "sk-3"),
        ];
        let count = tokey_lib::vault::import_records(pwd, incoming).unwrap();
        assert_eq!(count, 2);

        let records = tokey_lib::vault::unlock_vault(pwd).unwrap();
        assert_eq!(records.records.len(), 3);
    });
}

// ============ 边界与异常路径 ============

#[test]
fn test_decrypt_tampered_ciphertext_fails() {
    // 密文被篡改（改一个 base64 字符，仍合法可解码）→ GCM 校验必须失败
    let records = RecordsFile {
        version: 1,
        records: vec![sample_record("a", "sk-1")],
    };
    let mut vault = crypto::encrypt_vault("pwd-12345678", &records).unwrap();
    let mut chars: Vec<char> = vault.ciphertext.chars().collect();
    chars[0] = if chars[0] == 'A' { 'B' } else { 'A' };
    vault.ciphertext = chars.into_iter().collect();

    let err = crypto::decrypt_vault("pwd-12345678", &vault).unwrap_err();
    assert!(
        err.message.contains("密码错误") || err.message.contains("损坏"),
        "错误信息: {}",
        err.message
    );
}

#[test]
fn test_unlock_corrupt_vault_json() {
    with_vault("corrupt-json", |pwd| {
        tokey_lib::vault::create_vault(pwd, pwd).unwrap();
        // 直接把 vault.json 写成非法 JSON
        let path = tokey_lib::vault::vault_path().unwrap();
        fs::write(&path, "{ this is not valid json !!!").unwrap();

        let err = tokey_lib::vault::unlock_vault(pwd).unwrap_err();
        assert!(err.message.contains("JSON"), "错误信息: {}", err.message);
    });
}

#[test]
fn test_create_vault_empty_password_rejected() {
    with_vault("empty-pwd", |_pwd| {
        let err = tokey_lib::vault::create_vault("", "").unwrap_err();
        assert!(err.message.contains("8 位"), "错误信息: {}", err.message);
        // 失败后不应留下保险库文件
        assert!(!tokey_lib::vault::vault_exists().unwrap());
    });
}

#[test]
fn test_unlock_wrong_password_fails() {
    with_vault("unlock-wrong-pwd", |pwd| {
        tokey_lib::vault::create_vault(pwd, pwd).unwrap();
        tokey_lib::vault::add_record(pwd, sample_record("A", "sk-A")).unwrap();

        let err = tokey_lib::vault::unlock_vault("wrong-password").unwrap_err();
        assert!(err.message.contains("密码错误"), "错误信息: {}", err.message);
    });
}

#[test]
fn test_large_api_key_roundtrip() {
    with_vault("large-key", |pwd| {
        tokey_lib::vault::create_vault(pwd, pwd).unwrap();
        let big_key = format!("sk-{}", "x".repeat(10 * 1024));

        let rec = tokey_lib::vault::add_record(pwd, sample_record("大 key", &big_key)).unwrap();
        let records = tokey_lib::vault::unlock_vault(pwd).unwrap();
        assert_eq!(records.records.len(), 1);
        assert_eq!(records.records[0].id, rec.id);
        assert_eq!(records.records[0].api_key, big_key);
    });
}
