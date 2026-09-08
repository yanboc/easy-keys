//! 环境变量模块集成测试（独立 tests/ 目录）
//!
//! 覆盖：幂等区块替换、会话脚本生成（sh/fish/ps1/bat）、.env 转义。

use tokey_lib::env;
use tokey_lib::models::ApiKeyRecord;

fn rec(env_name: &str, key: &str) -> ApiKeyRecord {
    ApiKeyRecord {
        id: String::new(),
        name: String::new(),
        provider: "openai".into(),
        base_url: "https://api.openai.com/v1".into(),
        auth_type: "bearer".into(),
        api_key: key.into(),
        models: vec![],
        notes: String::new(),
        env_name: env_name.into(),
        created_at: 0,
        updated_at: 0,
    }
}

#[test]
fn test_build_block_export() {
    let records = vec![rec("OPENAI_API_KEY", "sk-abc'def")];
    let block = env::build_block(&records, true);
    assert!(block.contains("export OPENAI_API_KEY='sk-abc'\\''def'"), "block: {block}");
    assert!(block.contains(env::BLOCK_START));
    assert!(block.contains(env::BLOCK_END));
}

#[test]
fn test_replace_block_idempotent() {
    let records = vec![rec("OPENAI_API_KEY", "sk-123")];
    let block1 = env::build_block(&records, true);

    // 空文件追加一次
    let once = env::replace_block("", &block1);
    assert_eq!(once.matches(env::BLOCK_START).count(), 1);

    // 再写一次不应堆积
    let twice = env::replace_block(&once, &block1);
    assert_eq!(twice.matches(env::BLOCK_START).count(), 1);
    assert_eq!(twice.matches("sk-123").count(), 1);
}

#[test]
fn test_replace_block_updates_in_place() {
    // 内容变化时，旧值应被替换而非追加
    let old_block = env::build_block(&[rec("OPENAI_API_KEY", "sk-OLD")], true);
    let new_block = env::build_block(&[rec("OPENAI_API_KEY", "sk-NEW")], true);

    let with_old = env::replace_block("", &old_block);
    let updated = env::replace_block(&with_old, &new_block);

    assert_eq!(updated.matches(env::BLOCK_START).count(), 1);
    assert!(updated.contains("sk-NEW"));
    assert!(!updated.contains("sk-OLD"));
}

#[test]
fn test_session_script_sh() {
    let records = vec![rec("OPENAI_API_KEY", "sk-123")];
    assert_eq!(env::session_script_content(&records, "sh"), "export OPENAI_API_KEY='sk-123'\n");
    assert_eq!(env::session_script_content(&records, "zsh"), "export OPENAI_API_KEY='sk-123'\n");
    assert_eq!(env::session_script_content(&records, "bash"), "export OPENAI_API_KEY='sk-123'\n");
}

#[test]
fn test_session_script_fish() {
    let records = vec![rec("OPENAI_API_KEY", "sk-123")];
    assert_eq!(env::session_script_content(&records, "fish"), "set -gx OPENAI_API_KEY 'sk-123'\n");
}

#[test]
fn test_session_script_powershell() {
    let records = vec![rec("OPENAI_API_KEY", "sk-123")];
    assert_eq!(env::session_script_content(&records, "powershell"), "$env:OPENAI_API_KEY = 'sk-123'\n");
}

#[test]
fn test_session_script_cmd() {
    let records = vec![rec("OPENAI_API_KEY", "sk-123")];
    assert_eq!(env::session_script_content(&records, "cmd"), "set OPENAI_API_KEY=sk-123\n");
}

#[test]
fn test_dotenv_escaping() {
    let records = vec![rec("OPENAI_API_KEY", "sk-a\"b")];
    assert_eq!(env::dotenv_content(&records), "OPENAI_API_KEY=sk-a\\\"b\n");
}

#[test]
fn test_dotenv_multiple() {
    let records = vec![
        rec("OPENAI_API_KEY", "sk-1"),
        rec("DEEPSEEK_API_KEY", "sk-2"),
    ];
    let out = env::dotenv_content(&records);
    assert!(out.contains("OPENAI_API_KEY=sk-1\n"));
    assert!(out.contains("DEEPSEEK_API_KEY=sk-2\n"));
}

// ============ 边界与异常路径 ============

#[test]
fn test_replace_block_into_empty_file() {
    // 目标 rc 文件不存在时按空内容处理，写入后即一个完整区块
    let block = env::build_block(&[rec("OPENAI_API_KEY", "sk-123")], true);
    let out = env::replace_block("", &block);
    assert!(out.starts_with(env::BLOCK_START));
    assert!(out.contains("export OPENAI_API_KEY='sk-123'"));
    assert!(out.trim_end().ends_with(env::BLOCK_END), "out: {out}");
}

#[test]
fn test_replace_block_preserves_existing_content() {
    // 文件中已有其它内容：只替换本应用管理的块，连续写两次不堆积
    let existing = "# 我的自定义配置\nexport PATH=\"$HOME/bin:$PATH\"\nalias ll='ls -la'\n";
    let block = env::build_block(&[rec("OPENAI_API_KEY", "sk-123")], true);

    let once = env::replace_block(existing, &block);
    assert!(once.contains("# 我的自定义配置"));
    assert!(once.contains("export PATH=\"$HOME/bin:$PATH\""));
    assert!(once.contains("alias ll='ls -la'"));
    assert_eq!(once.matches(env::BLOCK_START).count(), 1);

    let twice = env::replace_block(&once, &block);
    assert_eq!(twice.matches(env::BLOCK_START).count(), 1);
    assert_eq!(twice.matches(env::BLOCK_END).count(), 1);
    assert_eq!(twice.matches("sk-123").count(), 1);
    assert!(twice.contains("alias ll='ls -la'"));
}

#[test]
fn test_replace_block_crlf_file() {
    // CRLF 行尾的 rc 文件：原有内容（含 CRLF）保留，区块幂等
    let existing = "export PATH=\"$HOME/bin:$PATH\"\r\nalias ll='ls -la'\r\n";
    let block = env::build_block(&[rec("OPENAI_API_KEY", "sk-123")], true);

    let once = env::replace_block(existing, &block);
    assert!(once.contains("export PATH=\"$HOME/bin:$PATH\"\r\n"));
    assert_eq!(once.matches(env::BLOCK_START).count(), 1);

    let twice = env::replace_block(&once, &block);
    assert_eq!(twice.matches(env::BLOCK_START).count(), 1);
    assert_eq!(twice.matches("sk-123").count(), 1);
    assert!(twice.contains("export PATH=\"$HOME/bin:$PATH\"\r\n"));
}
