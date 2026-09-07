// 与 src-tauri/src/models.rs 保持一致的类型定义

export interface ApiKeyRecord {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  authType: string;
  apiKey: string;
  models: string[];
  notes: string;
  envName: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderTemplate {
  id: string;
  label: string;
  defaultBaseUrl: string;
  speedtestPath: string;
  authType: string;
  defaultEnvName: string;
  hint: string;
}

export interface SpeedTestResult {
  id: string;
  name: string;
  ok: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
}

export interface FetchModelsResult {
  models: string[];
  latencyMs: number;
}

export interface EnvWriteResult {
  written: string[];
  skipped: string[];
  targetFile: string | null;
  instructions: string | null;
}

export interface BiometricStatus {
  available: boolean;
  enabled: boolean;
  label: string;
}

export function newEmptyRecord(): ApiKeyRecord {
  const now = Date.now();
  return {
    id: "",
    name: "",
    provider: "openai",
    baseUrl: "",
    authType: "bearer",
    apiKey: "",
    models: [],
    notes: "",
    envName: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeEnvName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

export function effectiveEnvName(record: ApiKeyRecord): string {
  const trimmed = record.envName.trim();
  if (trimmed) return sanitizeEnvName(trimmed);
  const base = sanitizeEnvName(record.provider.toUpperCase());
  return `${base}_API_KEY`;
}
