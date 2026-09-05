pub mod crypto;
pub mod env;
pub mod error;
pub mod export_import;
pub mod models;
pub mod speedtest;
pub mod vault;

use crate::error::{AppError, AppResult};
use crate::models::*;
use zeroize::Zeroizing;

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
    let records = vault::unlock_vault(&password)?;
    Ok(records.records)
}

#[tauri::command]
fn vault_add_cmd(password: String, record: ApiKeyRecord) -> AppResult<ApiKeyRecord> {
    let pwd = Zeroizing::new(password);
    vault::add_record(&pwd, record)
}

#[tauri::command]
fn vault_update_cmd(password: String, record: ApiKeyRecord) -> AppResult<ApiKeyRecord> {
    let pwd = Zeroizing::new(password);
    vault::update_record(&pwd, record)
}

#[tauri::command]
fn vault_delete_cmd(password: String, id: String) -> AppResult<()> {
    let pwd = Zeroizing::new(password);
    vault::delete_record(&pwd, &id)
}

#[tauri::command]
fn vault_change_password_cmd(old_password: String, new_password: String) -> AppResult<()> {
    let old = Zeroizing::new(old_password);
    vault::change_password(&old, &new_password)
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

// ============ 导出 / 导入 ============

#[tauri::command]
fn export_plain_json_cmd(records: Vec<ApiKeyRecord>) -> AppResult<String> {
    export_import::plain_json_export(&records)
}

#[tauri::command]
fn export_encrypted_cmd(records: Vec<ApiKeyRecord>, password: String) -> AppResult<String> {
    let pwd = Zeroizing::new(password);
    export_import::encrypted_export(&records, &pwd)
}

#[tauri::command]
fn import_plain_json_cmd(content: String) -> AppResult<Vec<ApiKeyRecord>> {
    export_import::plain_json_import(&content)
}

#[tauri::command]
fn import_encrypted_cmd(content: String, password: String) -> AppResult<Vec<ApiKeyRecord>> {
    let pwd = Zeroizing::new(password);
    export_import::encrypted_import(&content, &pwd)
}

#[tauri::command]
fn import_save_cmd(password: String, records: Vec<ApiKeyRecord>) -> AppResult<usize> {
    let pwd = Zeroizing::new(password);
    vault::import_records(&pwd, records)
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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            vault_exists_cmd,
            vault_create_cmd,
            vault_unlock_cmd,
            vault_add_cmd,
            vault_update_cmd,
            vault_delete_cmd,
            vault_change_password_cmd,
            get_default_providers_cmd,
            speedtest_cmd,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
