// 界面语言：仅简体中文与英文。字典以中文原文为 key（zh 分支直接返回 key），
// 新增文案时把 en 译文登记进 DICT；未登记的 key 在英文模式下回退显示中文原文。
// 插值用 {name} 占位符：t("共 {n} 条密钥", { n: 3 })。
import { useSyncExternalStore } from "react";

export type Lang = "zh" | "en";

const STORAGE_KEY = "tokey-lang";
const listeners = new Set<() => void>();

/** 中文原文 → 英文译文 */
const DICT: Record<string, string> = {
  // ---- 锁屏 / 解锁 ----
  "主密码（至少 8 位）": "Master password (min 8 chars)",
  "主密码至少需要 8 位": "Master password must be at least 8 characters",
  "两次输入的密码不一致": "Passwords do not match",
  "验证中…": "Verifying…",
  "使用 {label} 解锁": "Unlock with {label}",
  "登录密码": "login password",
  "主密码": "Master password",
  "确认主密码": "Confirm master password",
  "生物识别未完成，可使用主密码解锁":
    "Biometric authentication not completed; you can unlock with your master password",
  "解锁失败：{e}": "Unlock failed: {e}",
  "读取失败：{e}": "Failed to read: {e}",

  // ---- 导航 ----
  "密钥管理": "Keys",
  "连通性测速": "Speed Test",
  "导出 / 导入": "Export / Import",
  "环境变量": "Env Variables",
  "设置": "Settings",

  // ---- 侧栏底部 ----
  "切换为深色模式": "Switch to dark mode",
  "切换为浅色模式": "Switch to light mode",
  "界面语言": "Language",
  "锁定应用": "Lock App",

  // ---- 密钥列表 ----
  "共 {n} 条密钥 · 全部加密存储在本地，绝不外传":
    "{n} keys · all encrypted and stored locally, never sent anywhere",
  "新增密钥": "Add Key",
  "还没有任何密钥": "No keys yet",
  "点击「新增密钥」开始管理你的第一个 API Key":
    "Click \"Add Key\" to manage your first API key",
  "名称": "Name",
  "提供商/URL": "Provider/URL",
  "密钥": "Key",
  "操作": "Actions",
  "隐藏": "Hide",
  "显示": "Show",
  "复制（30 秒后自动清除）": "Copy (auto-cleared after 30s)",
  "编辑": "Edit",
  "删除": "Delete",
  "已复制到剪贴板，将在 30 秒后由系统自动清除":
    "Copied to clipboard; the system will clear it after 30s",
  "复制失败：{e}": "Copy failed: {e}",
  "确定删除「{name}」吗？此操作不可撤销。":
    "Delete \"{name}\"? This cannot be undone.",
  "已删除": "Deleted",
  "删除失败：{e}": "Delete failed: {e}",
  "已保存": "Saved",
  "已添加": "Added",
  "保存失败：{e}": "Save failed: {e}",
  "已复制 {url}": "Copied {url}",
  "点击复制 {url}": "Click to copy {url}",
  "「{label}」没有可复制的 BASE URL": "\"{label}\" has no BASE URL to copy",

  // ---- 密钥表单弹窗 ----
  "请填写名称": "Please enter a name",
  "请填写 API Key": "Please enter the API key",
  "请填写 Base URL": "Please enter the Base URL",
  "编辑密钥": "Edit Key",
  "如：我的 OpenAI 主号": "e.g. My OpenAI primary",
  "按 Tab 填入：{name}": "Press Tab to fill: {name}",
  "服务商模板": "Provider template",
  "测速时会访问 {url}/models 等端点":
    "Speed test accesses endpoints like {url}/models",
  "（当前模板无需认证，可留空）": "(this provider requires no auth; optional)",
  "环境变量名": "Env variable name",
  "留空将自动使用：{name}": "Leave empty to auto-use: {name}",
  "模型列表（可选，逗号分隔）": "Models (optional, comma-separated)",
  "测速并获取模型": "Test & Fetch Models",
  "连通 · {ms}ms": "Connected · {ms}ms",
  "获取失败：{e}": "Fetch failed: {e}",
  "备注（可选）": "Notes (optional)",
  "记录用途、配额、到期时间等": "Purpose, quota, expiry, etc.",
  "取消": "Cancel",
  "保存": "Save",

  // ---- 连通性测速 ----
  "请先在「密钥管理」中添加密钥": "Add a key in \"Keys\" first",
  "测试中…": "Testing…",
  "测速失败：{e}": "Speed test failed: {e}",
  "向各密钥配置的端点发起轻量请求，测量连通性与延迟。测速是唯一的联网操作，仅在你点击「开始测速」时发生。":
    "Sends lightweight requests to each key's endpoint to measure connectivity and latency. This is the only network operation, and it only happens when you click \"Start Test\".",
  "超时(ms)": "Timeout (ms)",
  "测速中…": "Testing…",
  "开始测速": "Start Test",
  "尚未测速": "Not tested yet",
  "点击「开始测速」对全部 {n} 条密钥进行并发检测":
    "Click \"Start Test\" to check all {n} keys concurrently",
  "结果：成功": "Results:",
  "条": "succeeded",
  "状态": "Status",
  "延迟": "Latency",
  "状态码": "Code",
  "信息": "Message",
  "检测中…": "Testing…",
  "连通": "Connected",
  "失败": "Failed",
  "安全说明：测速请求由 Rust 后端直连你配置的端点发出，已禁用自动重定向（防止密钥被转发到第三方）；应用自身不含任何遥测、更新检查或第三方连接。":
    "Security note: speed test requests are sent directly by the Rust backend to your configured endpoints with redirects disabled (so keys can't be forwarded to third parties). The app itself contains no telemetry, update checks, or third-party connections.",

  // ---- 导出 / 导入 ----
  "操作失败：{msg}": "Operation failed: {msg}",
  "没有可导出的密钥": "No keys to export",
  "导出口令至少需要 6 位": "Export passphrase must be at least 6 characters",
  "两次输入的导出口令不一致": "Export passphrases do not match",
  "明文导出将把全部 API Key 以未加密的 JSON 写入文件。\n\n任何能读取该文件的人都能看到你的密钥。确定继续吗？":
    "Plain export writes all API keys to an unencrypted JSON file.\n\nAnyone who can read the file can see your keys. Continue?",
  "已导出加密文件：{path}\n\n请牢记导出口令，导入时需要。":
    "Encrypted file exported: {path}\n\nRemember the export passphrase — you'll need it to import.",
  "已导出明文文件：{path}\n\n请妥善保管并注意安全！":
    "Plain file exported: {path}\n\nKeep it safe!",
  "请先选择要导入的文件": "Choose a file to import first",
  "请填写导出口令": "Please enter the export passphrase",
  "文件中没有可导入的密钥": "No keys found in the file",
  "成功导入 {n} 条密钥": "Imported {n} keys",
  "密钥可明文导出、加密导出（可迁移到其他机器），或从备份文件中导入。":
    "Keys can be exported as plain JSON, exported encrypted (migratable to another machine), or imported from a backup file.",
  "导出": "Export",
  "导入": "Import",
  "导出格式": "Export format",
  "加密 .ekey（推荐）": "Encrypted .ekey (recommended)",
  "明文 JSON": "Plain JSON",
  "使用独立导出口令加密，可在另一台机器上导入，密钥不落地":
    "Encrypted with a separate export passphrase; importable on another machine; keys never touch disk unencrypted",
  "未加密的 JSON，任何读到文件的人都能看到全部密钥，请谨慎":
    "Unencrypted JSON — anyone who reads the file can see all keys. Be careful.",
  "导出口令（至少 6 位）": "Export passphrase (min 6 chars)",
  "确认导出口令": "Confirm export passphrase",
  "将导出 {n} 条密钥：{names}": "Will export {n} keys: {names}",
  "（无）": "(none)",
  "导出中…": "Exporting…",
  "选择保存位置并导出": "Choose Location & Export",
  "导入格式": "Import format",
  "加密 .ekey": "Encrypted .ekey",
  "导出口令": "Export passphrase",
  "选择文件": "Choose file",
  "导入的密钥会追加到当前保险库（不会覆盖现有数据）":
    "Imported keys are appended to the current vault (existing data is not overwritten)",
  "解析中…": "Parsing…",
  "读取并预览": "Read & Preview",
  "待导入 {n} 条：": "Pending import: {n} keys",
  "…共 {n} 条": "…{n} total",
  "确认导入": "Confirm Import",

  // ---- 环境变量 ----
  "请至少选择一条密钥": "Select at least one key",
  "已保存到 {path}\n\n在项目中使用 dotenv 加载，或直接 source 该文件。":
    "Saved to {path}\n\nLoad it with dotenv in your project, or source the file directly.",
  "写入失败：{e}": "Write failed: {e}",
  "一键把选中的 API Key 写入环境变量。当前检测到 shell 配置：":
    "Write selected API keys to environment variables in one click. Detected shell config:",
  "未知": "unknown",
  "写入方式": "Write mode",
  "持久化（重启生效）": "Persistent (after restart)",
  "仅当前会话": "Current session only",
  ".env 文件": ".env file",
  "写入 shell 配置（~/.zshrc 等）或 Windows 用户环境变量，新终端自动生效":
    "Writes to shell config (~/.zshrc etc.) or Windows user env vars; takes effect in new terminals",
  "生成可 source 的脚本，仅当前终端会话生效，关闭终端即失效":
    "Generates a sourceable script for the current terminal session only; gone when the terminal closes",
  "生成标准 .env 文件，由你自己的工具链加载":
    "Generates a standard .env file for your own toolchain to load",
  "目标 Shell": "Target shell",
  "选择密钥（已选 {a}/{b}）": "Select keys ({a}/{b} selected)",
  "全选": "All",
  "清空": "None",
  "暂无密钥，请先在「密钥管理」中添加。": "No keys yet — add some in \"Keys\" first.",
  "写入中…": "Writing…",
  "写入 shell 配置": "Write to shell config",
  "生成会话脚本": "Generate session script",
  "导出 .env 文件": "Export .env file",
  "写入结果": "Result",
  "文件：{path}": "File: {path}",
  "安全说明：持久化写入会把密钥以明文形式追加到 shell 配置文件（这些文件权限通常仅当前用户可读）。如果你更在意静态存储安全，推荐使用「仅当前会话」模式或 .env 文件并在使用后删除。":
    "Security note: persistent writes append keys in plain text to your shell config (usually readable only by you). If at-rest security matters more, use \"Current session only\" or a .env file and delete it after use.",

  // ---- 设置 ----
  "修改主密码、生物识别解锁与查看应用信息。":
    "Change master password, biometric unlock, and view app info.",
  "修改主密码": "Change Master Password",
  "当前主密码": "Current master password",
  "新主密码（至少 8 位）": "New master password (min 8 chars)",
  "确认新主密码": "Confirm new master password",
  "更新主密码": "Update Password",
  "修改中…": "Updating…",
  "当前主密码不正确": "Current master password is incorrect",
  "新主密码至少需要 8 位": "New master password must be at least 8 characters",
  "两次输入的新密码不一致": "New passwords do not match",
  "主密码已更新": "Master password updated",
  "修改失败：{e}": "Change failed: {e}",
  "关闭失败：{e}": "Disable failed: {e}",
  "启用失败：{e}": "Enable failed: {e}",
  "请输入主密码": "Please enter your master password",
  "生物识别解锁": "Biometric Unlock",
  "使用 {label} 快速解锁保险库；主密码托管于系统钥匙串，仅本应用可读取。":
    "Unlock the vault quickly with {label}; the master password is stored in the system keychain, readable only by this app.",
  "关闭 {label}": "Disable {label}",
  "启用 {label}": "Enable {label}",
  "输入主密码以确认启用": "Enter master password to confirm enabling",
  "确认启用": "Confirm",
  "启用中…": "Enabling…",
  "关于": "About",
  "完全本地运行的 AI API Key 管理工具":
    "A fully-local AI API key manager",
  "· 密钥经 Argon2id + AES-256-GCM 加密存储在本机":
    "· Keys encrypted with Argon2id + AES-256-GCM, stored on this device",
  "· 支持 Touch ID / Windows Hello 生物识别解锁":
    "· Touch ID / Windows Hello biometric unlock",
  "· 应用自身零联网：无遥测、无更新检查、无第三方请求":
    "· Zero networking: no telemetry, no update checks, no third-party requests",
  "· 仅当你主动点击「测速」时才直连你配置的 API 端点":
    "· Connects to your configured API endpoints only when you click \"Speed Test\"",
  "请务必备份加密导出文件，主密码丢失后数据无法恢复。":
    "Back up your encrypted export file — data cannot be recovered if the master password is lost.",
};

function load(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* localStorage 不可用时跟随系统语言 */
  }
  try {
    return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "zh";
  }
}

let current: Lang = load();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* 忽略持久化失败 */
  }
  listeners.forEach((f) => f());
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    getLang
  );
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** 翻译：zh 模式返回中文原文（即 key），en 模式查 DICT，未登记回退原文 */
export function t(s: string, vars?: Record<string, string | number>): string {
  const out = current === "zh" ? s : (DICT[s] ?? s);
  return interpolate(out, vars);
}
