//! Coding agent 一键导入：把 Coding Plan 密钥写入各 agent 的配置文件。
//!
//! 安全红线：写入目标硬编码白名单——shell rc（复用 env 探测）、
//! `~/.codex/config.toml`、`~/.kimi-code/config.toml`；不接受前端传入的任何路径。
//! 所有写入均为「标记段幂等替换 + 原子写入」，首次改动某文件前留 `.tokey.bak` 备份。

use crate::env;
use crate::error::{AppError, AppResult};
use crate::models::ApiKeyRecord;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentImportResult {
    pub agent: String,
    /// 实际写入的文件列表
    pub files_written: Vec<String>,
    /// 用户可见的后续指引
    pub instructions: String,
}

/// 支持的 agent 标识
pub const AGENTS: [&str; 3] = ["claude-code", "codex", "kimi-code"];

fn section_markers(agent: &str) -> (String, String) {
    (
        format!("# >>> tokey {agent} start <<<"),
        format!("# >>> tokey {agent} end <<<"),
    )
}

/// 幂等替换标记段（纯函数）：有旧段则原位替换，无则追加到末尾
pub fn replace_section(content: &str, start: &str, end: &str, section: &str) -> String {
    let sp = content.find(start);
    let ep = content.find(end);
    if let (Some(s), Some(e)) = (sp, ep) {
        if e > s {
            let mut out = String::with_capacity(content.len() + section.len());
            out.push_str(&content[..s]);
            out.push_str(section);
            out.push_str(&content[e + end.len()..]);
            return out;
        }
    }
    let mut out = content.trim_end().to_string();
    if !out.is_empty() {
        out.push('\n');
    }
    out.push_str(section);
    out.push('\n');
    out
}

/// 原子写入（tmp + rename），首次改动前留 .tokey.bak 备份
fn atomic_write_with_backup(path: &Path, content: &str) -> AppResult<()> {
    if path.exists() {
        let bak = path.with_extension("tokey.bak");
        if !bak.exists() {
            fs::copy(path, &bak)?;
        }
    }
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("tokey.tmp");
    fs::write(&tmp, content)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

fn home() -> AppResult<PathBuf> {
    dirs::home_dir().ok_or_else(|| AppError::new("无法确定用户主目录"))
}

/// 密钥里挑一个写进配置的模型：取列表第一个
fn pick_model(record: &ApiKeyRecord) -> Option<&str> {
    record.models.first().map(|s| s.as_str())
}

// ---- Claude Code：shell rc 环境变量 ----

fn claude_code_section(record: &ApiKeyRecord) -> String {
    let (start, end) = section_markers("claude-code");
    let key = record.api_key.replace('\'', "'\\''");
    format!(
        "{start}\n# 由 tokey 自动生成，请勿手动修改\nexport ANTHROPIC_BASE_URL='{}'\nexport ANTHROPIC_AUTH_TOKEN='{key}'\n{end}",
        record.base_url.trim_end_matches('/')
    )
}

// ---- Codex CLI：~/.codex/config.toml + rc 环境变量 ----

fn codex_section(record: &ApiKeyRecord) -> String {
    let (start, end) = section_markers("codex");
    let mut s = format!("{start}\n# 由 tokey 自动生成，请勿手动修改\n[model_providers.tokey]\nname = \"Tokey\"\nbase_url = \"{}\"\nenv_key = \"TOKEY_CODEX_API_KEY\"\nwire_api = \"responses\"\n", record.base_url.trim_end_matches('/'));
    s.push_str(&end);
    s
}

fn codex_rc_section(record: &ApiKeyRecord) -> String {
    let (start, end) = section_markers("codex-env");
    let key = record.api_key.replace('\'', "'\\''");
    format!("{start}\n# 由 tokey 自动生成，请勿手动修改\nexport TOKEY_CODEX_API_KEY='{key}'\n{end}")
}

// ---- Kimi Code：~/.kimi-code/config.toml（api_key 直接写入） ----

fn kimi_code_section(record: &ApiKeyRecord) -> String {
    let (start, end) = section_markers("kimi-code");
    let model = pick_model(record).unwrap_or("kimi-for-coding");
    format!(
        "{start}\n# 由 tokey 自动生成，请勿手动修改\n[providers.\"tokey\"]\nbase_url = \"{}\"\napi_key = \"{}\"\n\n[models.\"tokey/{model}\"]\nprovider = \"tokey\"\nmodel = \"{model}\"\n{end}",
        record.base_url.trim_end_matches('/'),
        record.api_key
    )
}

/// 主入口：把 Coding Plan 密钥写入指定 agent 配置。
/// home_override 仅供测试注入；None 走真实主目录。
pub fn write_agent_config(
    agent: &str,
    record: &ApiKeyRecord,
    home_override: Option<&Path>,
) -> AppResult<AgentImportResult> {
    if !AGENTS.contains(&agent) {
        return Err(AppError::new(format!("不支持的 agent：{agent}")));
    }
    let home = match home_override {
        Some(h) => h.to_path_buf(),
        None => home()?,
    };
    let mut files = Vec::new();

    match agent {
        "claude-code" => {
            let rc = match home_override {
                Some(h) => h.join(".zshrc"),
                None => env::detect_shell_rc()?
                    .ok_or_else(|| AppError::new("无法探测 shell 配置文件"))?,
            };
            let existing = if rc.exists() { fs::read_to_string(&rc)? } else { String::new() };
            let (start, end) = section_markers("claude-code");
            let new = replace_section(&existing, &start, &end, &claude_code_section(record));
            atomic_write_with_backup(&rc, &new)?;
            files.push(rc.display().to_string());
            Ok(AgentImportResult {
                agent: agent.into(),
                files_written: files,
                instructions: format!("已写入 {}。新开终端或执行 source 后，直接运行 claude 即可。", rc.display()),
            })
        }
        "codex" => {
            let cfg = home.join(".codex").join("config.toml");
            let existing = if cfg.exists() { fs::read_to_string(&cfg)? } else { String::new() };
            let (start, end) = section_markers("codex");
            let mut new = replace_section(&existing, &start, &end, &codex_section(record));
            // 新文件：补全顶层 model_provider / model，让 codex 开箱即用
            if existing.is_empty() {
                let model = pick_model(record).unwrap_or("gpt-5");
                new = format!("model_provider = \"tokey\"\nmodel = \"{model}\"\n\n{new}");
            }
            atomic_write_with_backup(&cfg, &new)?;
            files.push(cfg.display().to_string());

            let rc = match home_override {
                Some(h) => h.join(".zshrc"),
                None => env::detect_shell_rc()?
                    .ok_or_else(|| AppError::new("无法探测 shell 配置文件"))?,
            };
            let existing = if rc.exists() { fs::read_to_string(&rc)? } else { String::new() };
            let (rs, re) = section_markers("codex-env");
            let new_rc = replace_section(&existing, &rs, &re, &codex_rc_section(record));
            atomic_write_with_backup(&rc, &new_rc)?;
            files.push(rc.display().to_string());

            Ok(AgentImportResult {
                agent: agent.into(),
                files_written: files,
                instructions: format!("已写入 {} 与 {}。新开终端或 source 后运行 codex 即可。", cfg.display(), rc.display()),
            })
        }
        "kimi-code" => {
            let cfg = home.join(".kimi-code").join("config.toml");
            let existing = if cfg.exists() { fs::read_to_string(&cfg)? } else { String::new() };
            let (start, end) = section_markers("kimi-code");
            let new = replace_section(&existing, &start, &end, &kimi_code_section(record));
            atomic_write_with_backup(&cfg, &new)?;
            files.push(cfg.display().to_string());
            Ok(AgentImportResult {
                agent: agent.into(),
                files_written: files,
                instructions: format!("已写入 {}。在 kimi 中用 /model 选择 tokey 下的模型即可。", cfg.display()),
            })
        }
        _ => unreachable!(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec() -> ApiKeyRecord {
        ApiKeyRecord {
            id: "1".into(),
            name: "t".into(),
            provider: "openai".into(),
            base_url: "https://api.example.com/v1".into(),
            auth_type: "bearer".into(),
            api_key: "sk-test".into(),
            models: vec!["gpt-5".into()],
            billing: "plan".into(),
            notes: String::new(),
            env_name: String::new(),
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn replace_section_appends_then_replaces() {
        let (s, e) = section_markers("codex");
        let sec = |body: &str| format!("{s}\n{body}\n{e}");
        let first = replace_section("existing = 1\n", &s, &e, &sec("SEC1"));
        assert!(first.contains("existing = 1"));
        assert!(first.contains("SEC1"));
        let second = replace_section(&first, &s, &e, &sec("SEC2"));
        assert!(!second.contains("SEC1"));
        assert!(second.contains("SEC2"));
        assert!(second.contains("existing = 1"));
    }

    #[test]
    fn codex_writes_config_and_rc_idempotently() {
        let dir = std::env::temp_dir().join(format!("tokey-agents-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let r = rec();
        let res1 = write_agent_config("codex", &r, Some(&dir)).unwrap();
        assert_eq!(res1.files_written.len(), 2);
        let cfg1 = fs::read_to_string(dir.join(".codex/config.toml")).unwrap();
        assert!(cfg1.contains("model_provider = \"tokey\""));
        assert!(cfg1.contains("base_url = \"https://api.example.com/v1\""));
        let rc1 = fs::read_to_string(dir.join(".zshrc")).unwrap();
        assert!(rc1.contains("export TOKEY_CODEX_API_KEY='sk-test'"));

        // 二次导入幂等：不重复堆段
        let mut r2 = rec();
        r2.api_key = "sk-test2".into();
        write_agent_config("codex", &r2, Some(&dir)).unwrap();
        let rc2 = fs::read_to_string(dir.join(".zshrc")).unwrap();
        assert_eq!(rc2.matches("export TOKEY_CODEX_API_KEY").count(), 1);
        assert!(rc2.contains("sk-test2"));
        // 首次备份存在
        assert!(dir.join(".codex/config.tokey.bak").exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn kimi_code_section_contains_provider_and_model() {
        let sec = kimi_code_section(&rec());
        assert!(sec.contains("[providers.\"tokey\"]"));
        assert!(sec.contains("api_key = \"sk-test\""));
        assert!(sec.contains("[models.\"tokey/gpt-5\"]"));
    }

    #[test]
    fn rejects_unknown_agent() {
        assert!(write_agent_config("cursor", &rec(), None).is_err());
    }
}
