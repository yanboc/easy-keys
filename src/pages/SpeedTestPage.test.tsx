import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import SpeedTestPage from "./SpeedTestPage";
import { makeRecord } from "../test/fixtures";

// mock Tauri 边界
vi.mock("../api", () => ({
  speedtest: vi.fn(),
}));

import * as api from "../api";

const records = [
  makeRecord(),
  makeRecord({ id: "r2", name: "DeepSeek 备用" }),
];

describe("SpeedTestPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("初始渲染空状态与开始测速按钮", () => {
    render(<SpeedTestPage records={records} />);

    expect(screen.getByText("尚未测速")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /开始测速/ })
    ).toBeInTheDocument();
  });

  it("点击开始测速后展示结果", async () => {
    vi.mocked(api.speedtest).mockResolvedValue([
      {
        id: "r1",
        name: "我的 OpenAI",
        ok: true,
        latencyMs: 123,
        statusCode: 200,
        error: null,
      },
      {
        id: "r2",
        name: "DeepSeek 备用",
        ok: false,
        latencyMs: null,
        statusCode: null,
        error: "连接超时",
      },
    ]);
    render(<SpeedTestPage records={records} />);

    fireEvent.click(screen.getByRole("button", { name: /开始测速/ }));

    expect(api.speedtest).toHaveBeenCalledWith(records, 10000);
    // 成功 / 失败状态（图标圆点 + 语义色文字）与延迟展示
    expect(await screen.findByText("连通")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getByText("123 ms")).toBeInTheDocument();
    expect(screen.getByText("连接超时")).toBeInTheDocument();
    expect(screen.getByText(/成功/)).toBeInTheDocument();
  });

  it("无密钥时点击测速弹出提示", () => {
    render(<SpeedTestPage records={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /开始测速/ }));

    expect(window.alert).toHaveBeenCalledWith(
      "请先在「密钥管理」中添加密钥"
    );
    expect(api.speedtest).not.toHaveBeenCalled();
  });
});
