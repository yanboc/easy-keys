import type { ApiKeyRecord, ProviderTemplate } from "../types";

// 组件测试共用的示例数据

export const sampleProviders: ProviderTemplate[] = [
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    speedtestPath: "/models",
    authType: "bearer",
    defaultEnvName: "OPENAI_API_KEY",
    hint: "",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    speedtestPath: "/models",
    authType: "bearer",
    defaultEnvName: "DEEPSEEK_API_KEY",
    hint: "",
  },
];

export function makeRecord(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: "r1",
    name: "我的 OpenAI",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    authType: "bearer",
    apiKey: "sk-test1234567890abcd",
    models: [],
    notes: "",
    envName: "",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}
