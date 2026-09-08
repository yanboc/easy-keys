import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 测试固定使用中文界面：i18n 默认跟随 navigator.language（jsdom 为 en-US），
// 既有断言均为中文文案，这里在模块导入前钉住语言（setup 先于测试文件执行）。
localStorage.setItem("tokey-lang", "zh");
localStorage.setItem("tokey-theme", "light");

// vitest 未开启 globals，需手动在每个用例后卸载组件
afterEach(() => {
  cleanup();
});
