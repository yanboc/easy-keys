// 前端纯逻辑工具函数（独立于 React/Tauri，便于单元测试）
import type { ApiKeyRecord, ProviderTemplate } from "./types";

/**
 * 遮蔽 API Key 显示。
 * - 长度 <= 8：全部遮蔽
 * - 否则保留前 4 位和后 4 位，中间遮蔽（最多 16 个 •）
 */
export function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 16))}${key.slice(-4)}`;
}

/**
 * 选择 provider 模板时自动填充默认值（authType / baseUrl / envName）。
 * 仅当用户尚未填写时用模板默认值，用户已填写的字段保持不动。
 */
export function applyProviderDefaults(
  form: ApiKeyRecord,
  providers: ProviderTemplate[],
  providerId: string
): ApiKeyRecord {
  const tpl = providers.find((p) => p.id === providerId);
  return {
    ...form,
    provider: providerId,
    authType: form.authType || tpl?.authType || form.authType,
    baseUrl: form.baseUrl || tpl?.defaultBaseUrl || form.baseUrl,
    envName: form.envName || tpl?.defaultEnvName || form.envName,
  };
}

/** 计算自动生成的 env 名（未填自定义时按 provider 生成） */
export function computeAutoEnvName(envName: string, provider: string): string {
  const trimmed = envName.trim();
  if (trimmed) return sanitizeEnvNameLocal(trimmed);
  const base = sanitizeEnvNameLocal(provider.toUpperCase());
  return `${base}_API_KEY`;
}

function sanitizeEnvNameLocal(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}
