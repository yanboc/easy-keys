//! 导出/导入模块集成测试（独立 tests/ 目录）
//!
//! 覆盖：加密 .ekey 往返、错误口令、明文 JSON 往返、非法输入、多记录。

use tokey_lib::export_import;
use tokey_lib::models::ApiKeyRecord;

fn sample(name: &str, key: &str) -> ApiKeyRecord {
    ApiKeyRecord {
        id: "x".into(),
        name: name.into(),
        provider: "openai".into(),
        base_url: "https://api.openai.com/v1".into(),
        auth_type: "bearer".into(),
        api_key: key.into(),
        models: vec![],
        notes: "".into(),
        env_name: "".into(),
        created_at: 0,
        updated_at: 0,
    }
}

#[test]
fn test_encrypted_export_import_roundtrip() {
    let records = vec![sample("A", "sk-secret-1"), sample("B", "sk-secret-2")];
    let out = export_import::encrypted_export(&records, "export-pass-123").unwrap();
    assert!(out.contains("EASYKEYS-EKEY"));
    // 密文绝不能包含明文密钥
    assert!(!out.contains("sk-secret-1"));
    assert!(!out.contains("sk-secret-2"));

    let back = export_import::encrypted_import(&out, "export-pass-123").unwrap();
    assert_eq!(back.len(), 2);
    assert_eq!(back[0].api_key, "sk-secret-1");
    assert_eq!(back[1].api_key, "sk-secret-2");
}

#[test]
fn test_encrypted_import_wrong_password() {
    let records = vec![sample("A", "sk-1")];
    let out = export_import::encrypted_export(&records, "export-pass-123").unwrap();
    let err = export_import::encrypted_import(&out, "wrong-pass").unwrap_err();
    assert!(err.message.contains("口令错误"), "错误信息: {}", err.message);
}

#[test]
fn test_encrypted_export_short_password() {
    let records = vec![sample("A", "sk-1")];
    let err = export_import::encrypted_export(&records, "123").unwrap_err();
    assert!(err.message.contains("6 位"), "错误信息: {}", err.message);
}

#[test]
fn test_encrypted_import_invalid_magic() {
    // 构造结构完整但 magic 错误的 .ekey（缺 version 会在 JSON 解析层报错，先给全字段）
    let fake = r#"{
        "magic": "NOPE",
        "version": 1,
        "createdAt": "2026-01-01T00:00:00Z",
        "kdfSalt": "AAAA",
        "nonce": "AAAA",
        "ciphertext": "AAAA"
    }"#;
    let err = export_import::encrypted_import(fake, "pass-123").unwrap_err();
    assert!(err.message.contains("不是有效"), "错误信息: {}", err.message);
}

#[test]
fn test_encrypted_import_corrupt_json() {
    let err = export_import::encrypted_import("not json at all", "pass-123").unwrap_err();
    // 应报 JSON 或 magic 错误（都算合理失败）
    assert!(!err.message.is_empty());
}

#[test]
fn test_plain_json_roundtrip() {
    let records = vec![sample("A", "sk-1"), sample("B", "sk-2")];
    let json = export_import::plain_json_export(&records).unwrap();
    let back = export_import::plain_json_import(&json).unwrap();
    assert_eq!(back.len(), 2);
    assert_eq!(back[0].name, "A");
    assert_eq!(back[1].api_key, "sk-2");
}

#[test]
fn test_plain_json_invalid() {
    let err = export_import::plain_json_import("not json at all").unwrap_err();
    assert!(err.message.contains("JSON"), "错误信息: {}", err.message);
}

#[test]
fn test_plain_json_unsupported_version() {
    let records = vec![sample("A", "sk-1")];
    let json = export_import::plain_json_export(&records).unwrap();
    // 用 serde_json 精确篡改版本号为高版本，应被拒绝
    let mut v: serde_json::Value = serde_json::from_str(&json).unwrap();
    v["version"] = serde_json::json!(99);
    let tampered = serde_json::to_string(&v).unwrap();
    let err = export_import::plain_json_import(&tampered).unwrap_err();
    assert!(err.message.contains("版本"), "错误信息: {}", err.message);
}

// ============ 边界与异常路径 ============

#[test]
fn test_encrypted_import_truncated_file() {
    // .ekey 内容被截断 → JSON 解析层失败
    let records = vec![sample("A", "sk-1")];
    let out = export_import::encrypted_export(&records, "export-pass-123").unwrap();
    let truncated = &out[..out.len() / 2];
    let err = export_import::encrypted_import(truncated, "export-pass-123").unwrap_err();
    assert!(err.message.contains("JSON"), "错误信息: {}", err.message);
}

#[test]
fn test_encrypted_import_tampered_ciphertext() {
    // .ekey 密文被改一个 base64 字符（仍合法）→ GCM 校验必须失败
    let records = vec![sample("A", "sk-1")];
    let out = export_import::encrypted_export(&records, "export-pass-123").unwrap();

    let mut v: serde_json::Value = serde_json::from_str(&out).unwrap();
    let ct = v["ciphertext"].as_str().unwrap();
    let mut chars: Vec<char> = ct.chars().collect();
    chars[0] = if chars[0] == 'A' { 'B' } else { 'A' };
    v["ciphertext"] = serde_json::json!(chars.into_iter().collect::<String>());
    let tampered = serde_json::to_string(&v).unwrap();

    let err = export_import::encrypted_import(&tampered, "export-pass-123").unwrap_err();
    assert!(
        err.message.contains("口令错误") || err.message.contains("损坏"),
        "错误信息: {}",
        err.message
    );
}

#[test]
fn test_encrypted_roundtrip_empty_records() {
    // 空密钥列表导出/导入应正常往返
    let records: Vec<ApiKeyRecord> = vec![];
    let out = export_import::encrypted_export(&records, "export-pass-123").unwrap();
    assert!(out.contains("EASYKEYS-EKEY"));
    let back = export_import::encrypted_import(&out, "export-pass-123").unwrap();
    assert!(back.is_empty());
}

#[test]
fn test_plain_json_wrong_schema() {
    // 合法 JSON 但结构不符：缺 records 字段
    let err = export_import::plain_json_import(r#"{"version":1}"#).unwrap_err();
    assert!(err.message.contains("JSON"), "错误信息: {}", err.message);

    // records 不是数组
    let err = export_import::plain_json_import(r#"{"version":1,"records":{}}"#).unwrap_err();
    assert!(err.message.contains("JSON"), "错误信息: {}", err.message);
}
