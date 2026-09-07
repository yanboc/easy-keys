import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// vitest 未开启 globals，需手动在每个用例后卸载组件
afterEach(() => {
  cleanup();
});
