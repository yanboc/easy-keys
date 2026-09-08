import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import KeyListPage from "./KeyListPage";
import { maskKey } from "../utils";
import { makeRecord, sampleProviders } from "../test/fixtures";

// mock Tauri 边界：invoke 封装与剪贴板插件
vi.mock("../api", () => ({
  getDefaultProviders: vi.fn().mockResolvedValue([]),
  vaultAdd: vi.fn(),
  vaultUpdate: vi.fn(),
  vaultDelete: vi.fn(),
}));

const writeText = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeText(...args),
  readText: vi.fn().mockResolvedValue(""),
}));

import * as api from "../api";

const records = [
  makeRecord(),
  makeRecord({
    id: "r2",
    name: "DeepSeek 备用",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "sk-deepseek00001111",
  }),
];

function renderPage() {
  return render(
    <KeyListPage records={records} password="pwd" onRecordsChange={() => {}} />
  );
}

describe("KeyListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDefaultProviders).mockResolvedValue(sampleProviders);
  });

  it("渲染密钥列表，密钥默认遮蔽显示", async () => {
    renderPage();

    expect(screen.getByText("我的 OpenAI")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek 备用")).toBeInTheDocument();
    // 默认遮蔽，不出现完整密钥
    expect(screen.getByText(maskKey(records[0].apiKey))).toBeInTheDocument();
    expect(screen.queryByText(records[0].apiKey)).not.toBeInTheDocument();
    // 提供商列显示小写 id（可点击复制 BASE URL）
    expect(await screen.findByText("openai")).toBeInTheDocument();
    expect(await screen.findByText("deepseek")).toBeInTheDocument();
  });

  it("点击提供商名复制 BASE URL", async () => {
    renderPage();

    // 等按钮形态出现（providers 异步加载前会短暂渲染为纯文本 badge）
    fireEvent.click(await screen.findByRole("button", { name: "deepseek" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://api.deepseek.com/v1");
    });
    expect(
      await screen.findByText(/已复制 https:\/\/api\.deepseek\.com\/v1/)
    ).toBeInTheDocument();
  });

  it("记录自身 baseUrl 为空时回退到提供商模板默认 URL", async () => {
    render(
      <KeyListPage
        records={[makeRecord({ baseUrl: "" })]}
        password="pwd"
        onRecordsChange={() => {}}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "openai" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://api.openai.com/v1");
    });
  });

  it("点击眼睛图标切换显示 / 隐藏完整密钥", () => {
    renderPage();

    const toggleButtons = screen.getAllByTitle("显示");
    fireEvent.click(toggleButtons[0]);

    // 第一条记录显示完整密钥，第二条仍遮蔽
    expect(screen.getByText(records[0].apiKey)).toBeInTheDocument();
    expect(screen.queryByText(records[1].apiKey)).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle("隐藏")[0]);
    expect(screen.queryByText(records[0].apiKey)).not.toBeInTheDocument();
  });

  it("点击复制按钮调用剪贴板写入并提示", async () => {
    renderPage();

    fireEvent.click(screen.getAllByTitle("复制（30 秒后自动清除）")[0]);

    // 复制经过动态 import，是异步的
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(records[0].apiKey);
    });
    expect(
      await screen.findByText(/已复制到剪贴板/)
    ).toBeInTheDocument();
  });

  it("无密钥时展示空状态", () => {
    render(
      <KeyListPage records={[]} password="pwd" onRecordsChange={() => {}} />
    );
    expect(screen.getByText("还没有任何密钥")).toBeInTheDocument();
  });
});
