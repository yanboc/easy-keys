// types.ts 工具函数单元测试
import { describe, expect, it } from "vitest";
import {
  effectiveEnvName,
  newEmptyRecord,
  sanitizeEnvName,
  type ApiKeyRecord,
} from "./types";

function rec(partial: Partial<ApiKeyRecord>): ApiKeyRecord {
  return { ...newEmptyRecord(), ...partial };
}

describe("newEmptyRecord", () => {
  it("生成默认值正确的空记录", () => {
    const r = newEmptyRecord();
    expect(r.id).toBe("");
    expect(r.provider).toBe("openai");
    expect(r.authType).toBe("bearer");
    expect(r.apiKey).toBe("");
    expect(r.models).toEqual([]);
    expect(r.createdAt).toBeGreaterThan(0);
    expect(r.updatedAt).toBeGreaterThan(0);
  });
});

describe("sanitizeEnvName", () => {
  it("替换非法字符为下划线", () => {
    expect(sanitizeEnvName("MY CUSTOM NAME")).toBe("MY_CUSTOM_NAME");
    expect(sanitizeEnvName("A-B.C/xyz")).toBe("A_B_C_xyz");
  });

  it("保留合法字符", () => {
    expect(sanitizeEnvName("OPENAI_API_KEY_1")).toBe("OPENAI_API_KEY_1");
  });
});

describe("effectiveEnvName", () => {
  it("有自定义 env 名时使用它", () => {
    const r = rec({ envName: "  MY_VAR  " });
    expect(effectiveEnvName(r)).toBe("MY_VAR");
  });

  it("自定义名含非法字符时清洗", () => {
    const r = rec({ envName: "MY VAR-2" });
    expect(effectiveEnvName(r)).toBe("MY_VAR_2");
  });

  it("无自定义时按 provider 生成", () => {
    expect(effectiveEnvName(rec({ provider: "deepseek" }))).toBe("DEEPSEEK_API_KEY");
    expect(effectiveEnvName(rec({ provider: "openai" }))).toBe("OPENAI_API_KEY");
  });

  it("自定义名为空白时回退到 provider", () => {
    expect(effectiveEnvName(rec({ provider: "anthropic", envName: "   " }))).toBe(
      "ANTHROPIC_API_KEY"
    );
  });
});
