// 前端纯逻辑工具函数（独立于 React/Tauri，便于单元测试）
import type { ApiKeyRecord, ProviderTemplate } from "./types";

/**
 * 遮蔽 API Key 显示。
 * - 长度 <= 8：全部遮蔽
 * - 否则保留前 4 位和后 4 位，中间固定 4 个占位符（••••）
 */
export function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
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

/** 已知服务商域名 → 名称建议（与 models.rs 的 provider 模板对应） */
const KNOWN_HOST_NAMES: Record<string, string> = {
  "api.openai.com": "openai",
  "api.anthropic.com": "anthropic",
  "generativelanguage.googleapis.com": "gemini",
  "api.deepseek.com": "deepseek",
  "api.moonshot.cn": "moonshot",
  "api.groq.com": "groq",
  "open.bigmodel.cn": "bigmodel",
  "dashscope.aliyuncs.com": "dashscope",
  "api.mistral.ai": "mistral",
  "api.x.ai": "xai",
};

/**
 * 按 Base URL 推导密钥名称建议：
 * - 已知服务商域名 → 固定名称（如 api.deepseek.com → deepseek）
 * - 未知域名 → 二级域名小写（https://api.foo-bar.com/v1 → foo-bar）
 * - 无法解析 / 无二级域名 / IP 地址 → null（不建议）
 */
export function suggestNameFromBaseUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let host: string;
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  const known = KNOWN_HOST_NAMES[host];
  if (known) return known;
  const parts = host.split(".");
  if (parts.length < 2) return null;
  const secondLevel = parts[parts.length - 2];
  // IP 地址（如 127.0.0.1）没有有意义的二级域名
  if (!secondLevel || /^\d+$/.test(secondLevel)) return null;
  return secondLevel;
}
