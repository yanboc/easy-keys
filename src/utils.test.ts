// utils.ts 纯逻辑单元测试
import { describe, expect, it } from "vitest";
import {
  applyProviderDefaults,
  computeAutoEnvName,
  maskKey,
  suggestNameFromBaseUrl,
} from "./utils";
import { newEmptyRecord, type ProviderTemplate } from "./types";

const providers: ProviderTemplate[] = [
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
    defaultBaseUrl: "https://api.deepseek.com",
    speedtestPath: "/models",
    authType: "bearer",
    defaultEnvName: "DEEPSEEK_API_KEY",
    hint: "",
  },
];

describe("maskKey", () => {
  it("短密钥（<=8）全部遮蔽", () => {
    expect(maskKey("sk-1234")).toBe("•••••••");
    expect(maskKey("abcdefgh")).toBe("••••••••");
  });

  it("长密钥保留头尾 4 位", () => {
    const masked = maskKey("sk-1234567890abcdef");
    // 头 4 位 sk-1 + 中间 min(19-8,16)=11 个点 + 尾 4 位 cdef
    expect(masked).toBe("sk-1•••••••••••cdef");
    // 不泄露中间
    expect(masked).not.toContain("2345");
  });

  it("密钥不会出现在遮蔽结果中", () => {
    const key = "sk-9876543210zyxwv";
    const masked = maskKey(key);
    expect(masked).not.toContain(key);
    // 头尾保留、中间被替换为点
    expect(masked).not.toContain("9876543210");
  });
});

describe("applyProviderDefaults", () => {
  it("切换 provider 填充 authType/baseUrl/envName", () => {
    const form = newEmptyRecord();
    const next = applyProviderDefaults(form, providers, "deepseek");
    expect(next.provider).toBe("deepseek");
    expect(next.authType).toBe("bearer");
    expect(next.baseUrl).toBe("https://api.deepseek.com");
    expect(next.envName).toBe("DEEPSEEK_API_KEY");
  });

  it("已填写的 envName 不被覆盖", () => {
    const form = { ...newEmptyRecord(), envName: "CUSTOM_VAR" };
    const next = applyProviderDefaults(form, providers, "deepseek");
    expect(next.envName).toBe("CUSTOM_VAR");
  });

  it("已填写的 baseUrl 不被覆盖", () => {
    const form = { ...newEmptyRecord(), baseUrl: "https://my-proxy.example.com" };
    const next = applyProviderDefaults(form, providers, "openai");
    expect(next.baseUrl).toBe("https://my-proxy.example.com");
  });

  it("未知 provider 保留原值", () => {
    const form = { ...newEmptyRecord(), provider: "custom" };
    const next = applyProviderDefaults(form, providers, "custom");
    expect(next.provider).toBe("custom");
    expect(next.authType).toBe("bearer");
  });
});

describe("computeAutoEnvName", () => {
  it("有自定义名时清洗后返回", () => {
    expect(computeAutoEnvName("MY VAR", "openai")).toBe("MY_VAR");
  });

  it("无自定义名时按 provider 生成", () => {
    expect(computeAutoEnvName("", "openai")).toBe("OPENAI_API_KEY");
    expect(computeAutoEnvName("  ", "anthropic")).toBe("ANTHROPIC_API_KEY");
  });
});

describe("suggestNameFromBaseUrl", () => {
  it("已知服务商域名映射为固定名称", () => {
    expect(suggestNameFromBaseUrl("https://api.openai.com/v1")).toBe("openai");
    expect(suggestNameFromBaseUrl("https://api.deepseek.com")).toBe("deepseek");
    expect(suggestNameFromBaseUrl("https://api.anthropic.com")).toBe(
      "anthropic"
    );
    expect(suggestNameFromBaseUrl("https://open.bigmodel.cn/api/paas/v4")).toBe(
      "bigmodel"
    );
    expect(suggestNameFromBaseUrl("https://api.moonshot.cn/v1")).toBe(
      "moonshot"
    );
    expect(
      suggestNameFromBaseUrl("https://dashscope.aliyuncs.com/compatible-mode/v1")
    ).toBe("dashscope");
    expect(suggestNameFromBaseUrl("https://api.mistral.ai/v1")).toBe("mistral");
    expect(suggestNameFromBaseUrl("https://api.x.ai/v1")).toBe("xai");
    expect(suggestNameFromBaseUrl("https://api.groq.com/openai/v1")).toBe(
      "groq"
    );
  });

  it("域名大小写不敏感", () => {
    expect(suggestNameFromBaseUrl("HTTPS://API.OPENAI.COM/v1")).toBe("openai");
  });

  it("未知域名回退为二级域名小写", () => {
    expect(suggestNameFromBaseUrl("https://api.foo-bar.com/v1")).toBe(
      "foo-bar"
    );
    expect(suggestNameFromBaseUrl("https://example.com")).toBe("example");
    expect(suggestNameFromBaseUrl("https://AI.Foo-Bar.COM:8443/v1")).toBe(
      "foo-bar"
    );
  });

  it("非法 URL 与空值不建议", () => {
    expect(suggestNameFromBaseUrl("")).toBeNull();
    expect(suggestNameFromBaseUrl("   ")).toBeNull();
    expect(suggestNameFromBaseUrl("not a url")).toBeNull();
    expect(suggestNameFromBaseUrl("/relative/path")).toBeNull();
  });

  it("无二级域名（localhost / IP）不建议", () => {
    expect(suggestNameFromBaseUrl("http://localhost:11434")).toBeNull();
    expect(suggestNameFromBaseUrl("http://127.0.0.1:8080/v1")).toBeNull();
  });
});
