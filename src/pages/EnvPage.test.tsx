import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import EnvPage from "./EnvPage";
import { makeRecord } from "../test/fixtures";

// mock Tauri 边界
vi.mock("../api", () => ({
  envDetectRc: vi.fn().mockResolvedValue("/Users/test/.zshrc"),
  envWritePersistent: vi.fn(),
  envSessionScript: vi.fn(),
  envDotenv: vi.fn(),
  saveTextFile: vi.fn(),
}));

import * as api from "../api";

const records = [
  makeRecord(),
  makeRecord({ id: "r2", name: "DeepSeek 备用", provider: "deepseek" }),
];

describe("EnvPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(api.envDetectRc).mockResolvedValue("/Users/test/.zshrc");
  });

  it("渲染页面并默认全选密钥，展示检测到的 shell 配置", async () => {
    render(<EnvPage records={records} />);

    expect(screen.getByText("环境变量")).toBeInTheDocument();
    expect(
      await screen.findByText("/Users/test/.zshrc")
    ).toBeInTheDocument();
    expect(screen.getByText(/已选 2\/2/)).toBeInTheDocument();
    expect(screen.getByText("OPENAI_API_KEY")).toBeInTheDocument();
    expect(screen.getByText("DEEPSEEK_API_KEY")).toBeInTheDocument();
  });

  it("持久化模式：点击写入后调用接口并展示结果", async () => {
    vi.mocked(api.envWritePersistent).mockResolvedValue({
      written: ["OPENAI_API_KEY", "DEEPSEEK_API_KEY"],
      skipped: [],
      targetFile: "/Users/test/.zshrc",
      instructions: null,
    });
    render(<EnvPage records={records} />);

    fireEvent.click(
      screen.getByRole("button", { name: "写入 shell 配置" })
    );

    expect(api.envWritePersistent).toHaveBeenCalledWith(records);
    // 先等待结果卡片渲染完成
    expect(
      await screen.findByText(/文件：\/Users\/test\/\.zshrc/)
    ).toBeInTheDocument();
    // 结果区以图标 + 语义色呈现成功，密钥名会同时出现在勾选列表与结果中
    expect(screen.getAllByText("OPENAI_API_KEY").length).toBeGreaterThanOrEqual(
      2
    );
    expect(
      screen.getAllByText("DEEPSEEK_API_KEY").length
    ).toBeGreaterThanOrEqual(2);
  });

  it("切换到仅当前会话模式后生成会话脚本", async () => {
    vi.mocked(api.envSessionScript).mockResolvedValue({
      written: ["OPENAI_API_KEY"],
      skipped: [],
      targetFile: null,
      instructions: "source /tmp/tokey.sh",
    });
    render(<EnvPage records={records} />);

    fireEvent.click(screen.getByRole("button", { name: /仅当前会话/ }));
    // 会话模式才显示目标 Shell 选择
    expect(screen.getByRole("combobox")).toBeInTheDocument();

    // 取消选择第二条，仅写入第一条
    fireEvent.click(screen.getByText("DeepSeek 备用"));
    fireEvent.click(screen.getByRole("button", { name: "生成会话脚本" }));

    expect(api.envSessionScript).toHaveBeenCalledWith([records[0]], "sh");
    expect(
      await screen.findByText("source /tmp/tokey.sh")
    ).toBeInTheDocument();
  });
});
