use crate::error::{AppError, AppResult};
use crate::models::{ApiKeyRecord, EnvWriteResult};
use std::fs;
use std::path::PathBuf;

/// 写入 rc 文件的标记区块
pub const BLOCK_START: &str = "# >>> easy-keys start <<<";
pub const BLOCK_END: &str = "# >>> easy-keys end <<<";

/// 探测 shell rc 文件：
/// - 优先 $SHELL，其次常见路径
pub fn detect_shell_rc() -> AppResult<Option<PathBuf>> {
    let home = dirs::home_dir().ok_or_else(|| AppError::new("无法确定用户主目录"))?;

    if let Some(shell) = std::env::var_os("SHELL") {
        let shell = shell.to_string_lossy().to_string();
        if shell.contains("zsh") {
            let p = home.join(".zshrc");
            if p.exists() {
                return Ok(Some(p));
            }
            return Ok(Some(p)); // 不存在也写入（首次创建）
        }
        if shell.contains("bash") {
            return Ok(Some(home.join(".bashrc")));
        }
        if shell.contains("fish") {
            return Ok(Some(home.join(".config/fish/config.fish")));
        }
    }

    // 回退探测
    for candidate in [".zshrc", ".bashrc", ".profile"] {
        let p = home.join(candidate);
        if p.exists() {
            return Ok(Some(p));
        }
    }
    Ok(Some(home.join(".zshrc")))
}

/// 从 rc 文件内容中替换 easy-keys 区块（幂等），返回新内容
/// pub 供集成测试使用
pub fn replace_block(content: &str, new_block: &str) -> String {
    let start_pos = content.find(BLOCK_START);
    let end_pos = content.find(BLOCK_END);

    if let (Some(s), Some(e)) = (start_pos, end_pos) {
        if e > s {
            // 替换旧区块
            let mut new = String::with_capacity(content.len() + new_block.len());
            new.push_str(&content[..s]);
            new.push_str(new_block);
            new.push_str(&content[e + BLOCK_END.len()..]);
            return new;
        }
    }
    // 没有旧区块：追加
    let mut new = content.trim_end().to_string();
    if !new.is_empty() {
        new.push('\n');
    }
    new.push_str(new_block);
    new.push('\n');
    new
}

/// 生成 export 语句块（pub 供集成测试使用）
pub fn build_block(records: &[ApiKeyRecord], export_syntax: bool) -> String {
    let mut lines = String::new();
    lines.push_str(BLOCK_START);
    lines.push('\n');
    lines.push_str("# 由 easy-keys 自动生成，请勿手动修改");
    lines.push('\n');
    for r in records {
        let env_name = r.effective_env_name();
        // 单引号包裹，转义内部单引号
        let val = r.api_key.replace('\'', "'\\''");
        if export_syntax {
            lines.push_str(&format!("export {env_name}='{val}'\n"));
        } else {
            lines.push_str(&format!("{env_name}='{val}'\n"));
        }
    }
    lines.push_str(BLOCK_END);
    lines.push('\n');
    lines
}

/// 写入持久化 shell 配置（macOS / Linux）
pub fn write_persistent_unix(records: &[ApiKeyRecord]) -> AppResult<EnvWriteResult> {
    let rc = detect_shell_rc()?;
    let rc = rc.ok_or_else(|| AppError::new("无法探测 shell 配置文件"))?;

    let block = build_block(records, true);
    let existing = if rc.exists() {
        fs::read_to_string(&rc)?
    } else {
        String::new()
    };
    let new_content = replace_block(&existing, &block);

    // 原子写入
    let tmp = rc.with_extension("easykeys.tmp");
    fs::write(&tmp, &new_content)?;
    fs::rename(&tmp, &rc)?;

    let written: Vec<String> = records
        .iter()
        .map(|r| r.effective_env_name())
        .collect();
    Ok(EnvWriteResult {
        written,
        skipped: vec![],
        target_file: Some(rc.display().to_string()),
        instructions: Some(format!("已写入 {}\n请在当前终端执行: source {}", rc.display(), rc.display())),
    })
}

/// 写入持久化 Windows 用户环境变量（setx）
#[cfg(target_os = "windows")]
pub fn write_persistent_windows(records: &[ApiKeyRecord]) -> AppResult<EnvWriteResult> {
    let mut written = Vec::new();
    let mut skipped = Vec::new();
    for r in records {
        let env_name = r.effective_env_name();
        // setx 值包含引号时需要处理；setx 长度限制 1024
        if r.api_key.len() > 900 {
            skipped.push(format!("{env_name}（值超过 setx 1024 字符限制，请手动设置）"));
            continue;
        }
        let output = std::process::Command::new("setx")
            .arg(&env_name)
            .arg(&r.api_key)
            .output();
        match output {
            Ok(o) if o.status.success() => written.push(env_name),
            Ok(o) => skipped.push(format!(
                "{env_name}（{}）",
                String::from_utf8_lossy(&o.stderr).trim()
            )),
            Err(e) => skipped.push(format!("{env_name}（{e}）")),
        }
    }
    Ok(EnvWriteResult {
        written,
        skipped,
        target_file: None,
        instructions: Some("setx 写入的是用户级环境变量，新开的终端/应用才会生效；当前会话需手动设置或重启终端。".into()),
    })
}

/// 生成会话脚本内容（source 后仅当前会话生效）
pub fn session_script_content(records: &[ApiKeyRecord], shell: &str) -> String {
    match shell {
        "fish" => {
            let mut lines = String::new();
            for r in records {
                let val = r.api_key.replace('\'', "\\'");
                lines.push_str(&format!("set -gx {} '{}'\n", r.effective_env_name(), val));
            }
            lines
        }
        "powershell" | "ps1" => {
            let mut lines = String::new();
            for r in records {
                let val = r.api_key.replace('\'', "''");
                lines.push_str(&format!(
                    "$env:{} = '{}'\n",
                    r.effective_env_name(),
                    val
                ));
            }
            lines
        }
        "cmd" | "bat" => {
            let mut lines = String::new();
            for r in records {
                lines.push_str(&format!(
                    "set {}={}\n",
                    r.effective_env_name(),
                    r.api_key
                ));
            }
            lines
        }
        // 默认 sh/zsh/bash
        _ => {
            let mut lines = String::new();
            for r in records {
                let val = r.api_key.replace('\'', "'\\''");
                lines.push_str(&format!(
                    "export {}='{}'\n",
                    r.effective_env_name(),
                    val
                ));
            }
            lines
        }
    }
}

/// 生成 .env 文件内容（无 export 前缀）
pub fn dotenv_content(records: &[ApiKeyRecord]) -> String {
    let mut lines = String::new();
    for r in records {
        let val = r.api_key.replace('"', "\\\"");
        lines.push_str(&format!("{}={}\n", r.effective_env_name(), val));
    }
    lines
}

/// 跨平台持久化入口
pub fn write_persistent(records: &[ApiKeyRecord]) -> AppResult<EnvWriteResult> {
    #[cfg(target_os = "windows")]
    {
        write_persistent_windows(records)
    }
    #[cfg(not(target_os = "windows"))]
    {
        write_persistent_unix(records)
    }
}

/// 会话脚本保存路径
pub fn session_script_path(shell: &str) -> AppResult<PathBuf> {
    let dir = crate::vault::app_data_dir()?;
    let name = match shell {
        "fish" => "env.fish",
        "powershell" | "ps1" => "env.ps1",
        "cmd" | "bat" => "env.bat",
        _ => "env.sh",
    };
    Ok(dir.join(name))
}
