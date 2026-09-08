import { describe, expect, it, afterEach } from "vitest";
import { t, setLang } from "./i18n";

// setup.ts 已把 tokey-lang 钉为 zh；每个用例后恢复，避免污染其他测试文件
afterEach(() => {
  setLang("zh");
});

describe("i18n t()", () => {
  it("zh 模式原样返回中文 key", () => {
    expect(t("密钥管理")).toBe("密钥管理");
  });

  it("en 模式返回已登记的英文译文", () => {
    setLang("en");
    expect(t("密钥管理")).toBe("Keys");
    expect(t("新增密钥")).toBe("Add Key");
  });

  it("en 模式下未登记的 key 回退中文原文", () => {
    setLang("en");
    expect(t("某条没登记过的文案")).toBe("某条没登记过的文案");
  });

  it("插值在两种语言下都生效", () => {
    expect(t("成功导入 {n} 条密钥", { n: 3 })).toBe("成功导入 3 条密钥");
    setLang("en");
    expect(t("成功导入 {n} 条密钥", { n: 3 })).toBe("Imported 3 keys");
  });

  it("未提供的占位符保留原样", () => {
    expect(t("成功导入 {n} 条密钥")).toBe("成功导入 {n} 条密钥");
  });
});
