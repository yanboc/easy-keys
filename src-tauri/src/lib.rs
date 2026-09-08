pub mod biometric;
pub mod crypto;
pub mod env;
pub mod error;
pub mod export_import;
pub mod models;
pub mod speedtest;
pub mod vault;

use crate::biometric::BiometricStatus;
use crate::error::{AppError, AppResult};
use crate::models::*;
use zeroize::Zeroizing;

/// 解析主密码：前端显式传入优先；为空时回退到生物识别解锁建立的会话密码。
fn resolve_password(pwd: String) -> AppResult<Zeroizing<String>> {
    if !pwd.is_empty() {
        return Ok(Zeroizing::new(pwd));
    }
    vault::session_password().ok_or_else(|| AppError::new("会话已过期，请重新解锁"))
}

// ============ 保险库 ============

#[tauri::command]
fn vault_exists_cmd() -> AppResult<bool> {
    vault::vault_exists()
}

#[tauri::command]
fn vault_create_cmd(password: String, confirm: String) -> AppResult<()> {
    vault::create_vault(&password, &confirm)
}

#[tauri::command]
fn vault_unlock_cmd(password: String) -> AppResult<Vec<ApiKeyRecord>> {
    let pwd = Zeroizing::new(password);
    let records = vault::unlock_vault(&pwd)?;
    // 建立会话：供后续写操作回退使用；仅进程退出时清除
    vault::set_session_password(pwd);
    Ok(records.records)
}

#[tauri::command]
fn vault_add_cmd(password: String, record: ApiKeyRecord) -> AppResult<ApiKeyRecord> {
    let pwd = resolve_password(password)?;
    vault::add_record(&pwd, record)
}

#[tauri::command]
fn vault_update_cmd(password: String, record: ApiKeyRecord) -> AppResult<ApiKeyRecord> {
    let pwd = resolve_password(password)?;
    vault::update_record(&pwd, record)
}

#[tauri::command]
fn vault_delete_cmd(password: String, id: String) -> AppResult<()> {
    let pwd = resolve_password(password)?;
    vault::delete_record(&pwd, &id)
}

#[tauri::command]
fn vault_change_password_cmd(old_password: String, new_password: String) -> AppResult<()> {
    let old = resolve_password(old_password)?;
    vault::change_password(&old, &new_password)?;
    // 主密码变更后同步系统托管项与内存会话，避免生物识别解锁失效
    if biometric::is_enabled() {
        biometric::enable(&new_password)?;
    }
    vault::update_session_password(&new_password);
    Ok(())
}

#[tauri::command]
fn get_default_providers_cmd() -> Vec<ProviderTemplate> {
    default_providers()
}

// ============ 测速 ============

#[tauri::command]
async fn speedtest_cmd(
    records: Vec<ApiKeyRecord>,
    timeout_ms: Option<u64>,
) -> Vec<SpeedTestResult> {
    let timeout = timeout_ms.unwrap_or(speedtest::DEFAULT_TIMEOUT_MS).clamp(1000, 60_000);
    speedtest::test_many(&records, timeout).await
}

#[tauri::command]
async fn fetch_models_cmd(
    base_url: String,
    auth_type: String,
    api_key: String,
    timeout_ms: Option<u64>,
) -> AppResult<FetchModelsResult> {
    let timeout = timeout_ms.unwrap_or(speedtest::DEFAULT_TIMEOUT_MS).clamp(1000, 60_000);
    speedtest::fetch_models(&base_url, &auth_type, &api_key, timeout).await
}

// ============ 导出 / 导入 ============

#[tauri::command]
fn export_plain_json_cmd(records: Vec<ApiKeyRecord>) -> AppResult<String> {
    export_import::plain_json_export(&records)
}

#[tauri::command]
fn export_encrypted_cmd(records: Vec<ApiKeyRecord>, password: String) -> AppResult<String> {
    let pwd = resolve_password(password)?;
    export_import::encrypted_export(&records, &pwd)
}

#[tauri::command]
fn import_plain_json_cmd(content: String) -> AppResult<Vec<ApiKeyRecord>> {
    export_import::plain_json_import(&content)
}

#[tauri::command]
fn import_encrypted_cmd(content: String, password: String) -> AppResult<Vec<ApiKeyRecord>> {
    let pwd = resolve_password(password)?;
    export_import::encrypted_import(&content, &pwd)
}

#[tauri::command]
fn import_save_cmd(password: String, records: Vec<ApiKeyRecord>) -> AppResult<usize> {
    let pwd = resolve_password(password)?;
    vault::import_records(&pwd, records)
}

// ============ 生物识别解锁 ============

#[tauri::command]
fn biometric_status_cmd() -> BiometricStatus {
    // E2E 构建强制不可用：Keychain 是全局的（不受 EASY_KEYS_DATA_DIR 隔离），
    // 真实用户一旦启用过生物识别，E2E 锁屏就会弹系统验证框，测试不可控
    if cfg!(feature = "e2e") {
        return BiometricStatus {
            available: false,
            enabled: false,
            label: String::new(),
        };
    }
    biometric::status()
}

/// 启用前先用该密码真实解锁一次保险库验证正确性，失败则不启用。
#[tauri::command]
fn biometric_enable_cmd(password: String) -> AppResult<()> {
    let pwd = Zeroizing::new(password);
    vault::unlock_vault(&pwd)?;
    biometric::enable(&pwd)
}

#[tauri::command]
fn biometric_disable_cmd() -> AppResult<()> {
    biometric::disable()
}

/// 弹出系统生物识别 → 读托管主密码 → 解锁并建立会话；密码不出 Rust 层。
#[tauri::command]
fn biometric_unlock_cmd() -> AppResult<Vec<ApiKeyRecord>> {
    let pwd = Zeroizing::new(biometric::read_password()?);
    let records = vault::unlock_vault(&pwd)?;
    vault::set_session_password(pwd);
    Ok(records.records)
}

// ============ 环境变量 ============

#[tauri::command]
fn env_write_persistent_cmd(records: Vec<ApiKeyRecord>) -> AppResult<EnvWriteResult> {
    env::write_persistent(&records)
}

#[tauri::command]
fn env_detect_rc_cmd() -> AppResult<Option<String>> {
    Ok(env::detect_shell_rc()?.map(|p| p.display().to_string()))
}

#[tauri::command]
fn env_session_script_cmd(records: Vec<ApiKeyRecord>, shell: String) -> AppResult<EnvWriteResult> {
    let dir = vault::app_data_dir()?;
    let path = env::session_script_path(&shell)?;
    let content = env::session_script_content(&records, &shell);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(&path, content)?;

    let source_cmd = match shell.as_str() {
        "fish" => format!("source {}", path.display()),
        "powershell" | "ps1" => format!("& {}", path.display()),
        "cmd" | "bat" => format!("call {}", path.display()),
        _ => format!("source {}", path.display()),
    };

    Ok(EnvWriteResult {
        written: records.iter().map(|r| r.effective_env_name()).collect(),
        skipped: vec![],
        target_file: Some(path.display().to_string()),
        instructions: Some(source_cmd),
    })
}

#[tauri::command]
fn env_dotenv_cmd(records: Vec<ApiKeyRecord>) -> AppResult<String> {
    Ok(env::dotenv_content(&records))
}

// ============ 文件对话框辅助 ============

// ============ 外部链接 ============

/// 用系统默认浏览器打开 http(s) 链接（如 GitHub 项目页）。
/// 只允许 http/https scheme，拒绝一切其他输入；零新增依赖。
#[tauri::command]
fn open_url_cmd(url: String) -> AppResult<()> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(AppError::new("仅支持 http/https 链接"));
    }
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(&url);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", &url]);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(&url);
        c
    };
    cmd.spawn()
        .map_err(|e| AppError::new(format!("无法打开浏览器: {e}")))?;
    Ok(())
}

#[tauri::command]
async fn save_text_file_cmd(
    app: tauri::AppHandle,
    default_path: String,
    content: String,
) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .set_file_name(&default_path)
        .blocking_save_file();
    match path {
        Some(p) => {
            let path_str = p.into_path().map_err(|e| AppError::new(e.to_string()))?;
            std::fs::write(&path_str, content)?;
            Ok(Some(path_str.display().to_string()))
        }
        None => Ok(None),
    }
}

#[tauri::command]
async fn open_text_file_cmd(app: tauri::AppHandle) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let path = app.dialog().file().blocking_pick_file();
    match path {
        Some(p) => {
            let path_str = p.into_path().map_err(|e| AppError::new(e.to_string()))?;
            let content = std::fs::read_to_string(&path_str)?;
            Ok(Some(content))
        }
        None => Ok(None),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init());
    // 仅 e2e feature（真机 E2E 测试）下内嵌 WebDriver server；release 构建不包含
    #[cfg(feature = "e2e")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());
    let app = builder
        .invoke_handler(tauri::generate_handler![
            vault_exists_cmd,
            vault_create_cmd,
            vault_unlock_cmd,
            vault_add_cmd,
            vault_update_cmd,
            vault_delete_cmd,
            vault_change_password_cmd,
            biometric_status_cmd,
            biometric_enable_cmd,
            biometric_disable_cmd,
            biometric_unlock_cmd,
            get_default_providers_cmd,
            speedtest_cmd,
            fetch_models_cmd,
            export_plain_json_cmd,
            export_encrypted_cmd,
            import_plain_json_cmd,
            import_encrypted_cmd,
            import_save_cmd,
            env_write_persistent_cmd,
            env_detect_rc_cmd,
            env_session_script_cmd,
            env_dotenv_cmd,
            save_text_file_cmd,
            open_text_file_cmd,
            open_url_cmd,
        ])
        .setup(|app| {
            // 关窗即退出应用：进程终止、内存中的会话密码随之清除，
            // 下次打开必须重新输入主密码或完成生物识别
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(w) = app.get_webview_window("main") {
                    let w2 = w.clone();
                    w.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { .. } = event {
                            w2.app_handle().exit(0);
                        }
                    });
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_, _| {});
}
