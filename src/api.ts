import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import type {
  ApiKeyRecord,
  BiometricStatus,
  EnvWriteResult,
  FetchModelsResult,
  ProviderTemplate,
  SpeedTestResult,
} from "./types";

// ============ 窗口（锁屏小窗 ↔ 主界面） ============

/** 调整最小尺寸 → 设定尺寸 → 居中（顺序保证双向切换都不被 minSize 钳制） */
export async function resizeWindow(
  width: number,
  height: number,
  minWidth: number,
  minHeight: number
): Promise<void> {
  const win = getCurrentWindow();
  await win.setMinSize(new LogicalSize(minWidth, minHeight));
  await win.setSize(new LogicalSize(width, height));
  await win.center();
}

/** 监听窗口焦点变化，resolve 出取消监听函数 */
export function onWindowFocus(
  cb: (focused: boolean) => void
): Promise<() => void> {
  return getCurrentWindow().onFocusChanged(({ payload }) => cb(payload));
}

// ============ 保险库 ============

export function vaultExists(): Promise<boolean> {
  return invoke<boolean>("vault_exists_cmd");
}

export function vaultCreate(password: string, confirm: string): Promise<void> {
  return invoke("vault_create_cmd", { password, confirm });
}

export function vaultUnlock(password: string): Promise<ApiKeyRecord[]> {
  return invoke<ApiKeyRecord[]>("vault_unlock_cmd", { password });
}

export function vaultAdd(
  password: string,
  record: ApiKeyRecord
): Promise<ApiKeyRecord> {
  return invoke("vault_add_cmd", { password, record });
}

export function vaultUpdate(
  password: string,
  record: ApiKeyRecord
): Promise<ApiKeyRecord> {
  return invoke("vault_update_cmd", { password, record });
}

export function vaultDelete(password: string, id: string): Promise<void> {
  return invoke("vault_delete_cmd", { password, id });
}

export function vaultChangePassword(
  oldPassword: string,
  newPassword: string
): Promise<void> {
  return invoke("vault_change_password_cmd", { oldPassword, newPassword });
}

export function getDefaultProviders(): Promise<ProviderTemplate[]> {
  return invoke<ProviderTemplate[]>("get_default_providers_cmd");
}

export function vaultLock(): Promise<void> {
  return invoke("vault_lock_cmd");
}

// ============ 外部链接 ============

/** 用系统默认浏览器打开 http(s) 链接 */
export function openUrl(url: string): Promise<void> {
  return invoke("open_url_cmd", { url });
}

// ============ 生物识别解锁 ============

export function biometricStatus(): Promise<BiometricStatus> {
  return invoke<BiometricStatus>("biometric_status_cmd");
}

export function biometricEnable(password: string): Promise<void> {
  return invoke("biometric_enable_cmd", { password });
}

export function biometricDisable(): Promise<void> {
  return invoke("biometric_disable_cmd");
}

export function biometricUnlock(): Promise<ApiKeyRecord[]> {
  return invoke<ApiKeyRecord[]>("biometric_unlock_cmd");
}

// ============ 测速 ============

export function speedtest(
  records: ApiKeyRecord[],
  timeoutMs?: number
): Promise<SpeedTestResult[]> {
  return invoke<SpeedTestResult[]>("speedtest_cmd", { records, timeoutMs });
}

export function fetchModels(
  baseUrl: string,
  authType: string,
  apiKey: string,
  timeoutMs?: number
): Promise<FetchModelsResult> {
  return invoke<FetchModelsResult>("fetch_models_cmd", {
    baseUrl,
    authType,
    apiKey,
    timeoutMs,
  });
}

// ============ 导出 / 导入 ============

export function exportPlainJson(records: ApiKeyRecord[]): Promise<string> {
  return invoke<string>("export_plain_json_cmd", { records });
}

export function exportEncrypted(
  records: ApiKeyRecord[],
  password: string
): Promise<string> {
  return invoke<string>("export_encrypted_cmd", { records, password });
}

export function importPlainJson(content: string): Promise<ApiKeyRecord[]> {
  return invoke<ApiKeyRecord[]>("import_plain_json_cmd", { content });
}

export function importEncrypted(
  content: string,
  password: string
): Promise<ApiKeyRecord[]> {
  return invoke<ApiKeyRecord[]>("import_encrypted_cmd", { content, password });
}

export function importSave(
  password: string,
  records: ApiKeyRecord[]
): Promise<number> {
  return invoke<number>("import_save_cmd", { password, records });
}

// ============ 环境变量 ============

export function envWritePersistent(
  records: ApiKeyRecord[]
): Promise<EnvWriteResult> {
  return invoke<EnvWriteResult>("env_write_persistent_cmd", { records });
}

export function envDetectRc(): Promise<string | null> {
  return invoke<string | null>("env_detect_rc_cmd");
}

export function envSessionScript(
  records: ApiKeyRecord[],
  shell: string
): Promise<EnvWriteResult> {
  return invoke<EnvWriteResult>("env_session_script_cmd", { records, shell });
}

export function envDotenv(records: ApiKeyRecord[]): Promise<string> {
  return invoke<string>("env_dotenv_cmd", { records });
}

// ============ 文件对话框 ============

export function saveTextFile(
  defaultPath: string,
  content: string
): Promise<string | null> {
  return invoke<string | null>("save_text_file_cmd", {
    defaultPath,
    content,
  });
}

export function openTextFile(): Promise<string | null> {
  return invoke<string | null>("open_text_file_cmd");
}
