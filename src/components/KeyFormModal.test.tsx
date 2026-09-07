import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import KeyFormModal from "./KeyFormModal";
import { newEmptyRecord } from "../types";
import { sampleProviders } from "../test/fixtures";
import { fetchModels } from "../api";

vi.mock("../api", () => ({
  fetchModels: vi.fn(),
}));

const mockFetchModels = vi.mocked(fetchModels);

describe("KeyFormModal", () => {
  beforeEach(() => {
    // jsdom 未实现 alert，统一打桩
    vi.spyOn(window, "alert").mockImplementation(() => {});
    mockFetchModels.mockReset();
  });

  it("名称为空时阻止保存并提示", () => {
    const onSave = vi.fn();
    render(
      <KeyFormModal
        initial={newEmptyRecord()}
        providers={sampleProviders}
        onCancel={() => {}}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(window.alert).toHaveBeenCalledWith("请填写名称");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("填写名称但未填 API Key 时提示", () => {
    const onSave = vi.fn();
    render(
      <KeyFormModal
        initial={newEmptyRecord()}
        providers={sampleProviders}
        onCancel={() => {}}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("如：我的 OpenAI 主号"), {
      target: { value: "测试密钥" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(window.alert).toHaveBeenCalledWith("请填写 API Key");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("选择服务商模板后自动填充默认 Base URL 与环境变量名", async () => {
    const user = userEvent.setup();
    render(
      <KeyFormModal
        initial={newEmptyRecord()}
        providers={sampleProviders}
        onCancel={() => {}}
        onSave={() => {}}
      />
    );

    await user.selectOptions(screen.getByRole("combobox"), "deepseek");

    expect(screen.getByPlaceholderText("https://api.openai.com/v1")).toHaveValue(
      "https://api.deepseek.com/v1"
    );
    // 环境变量名输入框的 placeholder 展示自动推导值
    expect(screen.getByPlaceholderText("DEEPSEEK_API_KEY")).toBeInTheDocument();
  });

  it("完整填写后保存，envName 自动按 provider 生成", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <KeyFormModal
        initial={newEmptyRecord()}
        providers={sampleProviders}
        onCancel={() => {}}
        onSave={onSave}
      />
    );

    await user.type(
      screen.getByPlaceholderText("如：我的 OpenAI 主号"),
      "  我的密钥  "
    );
    await user.type(
      screen.getByPlaceholderText("https://api.openai.com/v1"),
      "https://api.openai.com/v1"
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-abc123456789");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.name).toBe("我的密钥"); // 名称会被 trim
    expect(saved.envName).toBe("OPENAI_API_KEY");
    expect(saved.apiKey).toBe("sk-abc123456789");
  });

  it("填写 Base URL 后显示名称建议", async () => {
    const user = userEvent.setup();
    render(
      <KeyFormModal
        initial={newEmptyRecord()}
        providers={sampleProviders}
        onCancel={() => {}}
        onSave={() => {}}
      />
    );

    await user.type(
      screen.getByPlaceholderText("https://api.openai.com/v1"),
      "https://api.deepseek.com"
    );

    expect(screen.getByText("按 Tab 填入：deepseek")).toBeInTheDocument();
  });

  it("按 Tab 接受建议填入名称", async () => {
    const user = userEvent.setup();
    render(
      <KeyFormModal
        initial={newEmptyRecord()}
        providers={sampleProviders}
        onCancel={() => {}}
        onSave={() => {}}
      />
    );

    await user.type(
      screen.getByPlaceholderText("https://api.openai.com/v1"),
      "https://api.deepseek.com"
    );
    const nameInput = screen.getByPlaceholderText("如：我的 OpenAI 主号");
    fireEvent.keyDown(nameInput, { key: "Tab" });

    expect(nameInput).toHaveValue("deepseek");
    // 已填入后提示消失
    expect(screen.queryByText(/按 Tab 填入/)).not.toBeInTheDocument();
  });

  it("接受建议后再改 Base URL，建议跟随更新", async () => {
    const user = userEvent.setup();
    render(
      <KeyFormModal
        initial={newEmptyRecord()}
        providers={sampleProviders}
        onCancel={() => {}}
        onSave={() => {}}
      />
    );

    const baseUrlInput = screen.getByPlaceholderText(
      "https://api.openai.com/v1"
    );
    const nameInput = screen.getByPlaceholderText("如：我的 OpenAI 主号");
    await user.type(baseUrlInput, "https://api.deepseek.com");
    fireEvent.keyDown(nameInput, { key: "Tab" });
    expect(nameInput).toHaveValue("deepseek");

    // 名称仍等于上一条建议（用户没手动改过），换 URL 后出现新建议
    await user.clear(baseUrlInput);
    await user.type(baseUrlInput, "https://api.openai.com/v1");
    expect(screen.getByText("按 Tab 填入：openai")).toBeInTheDocument();
  });

  it("手动输入名称后不被建议覆盖", async () => {
    const user = userEvent.setup();
    render(
      <KeyFormModal
        initial={newEmptyRecord()}
        providers={sampleProviders}
        onCancel={() => {}}
        onSave={() => {}}
      />
    );

    const baseUrlInput = screen.getByPlaceholderText(
      "https://api.openai.com/v1"
    );
    const nameInput = screen.getByPlaceholderText("如：我的 OpenAI 主号");
    await user.type(baseUrlInput, "https://api.deepseek.com");
    await user.type(nameInput, "我的密钥");
    expect(screen.queryByText(/按 Tab 填入/)).not.toBeInTheDocument();

    // 换 Base URL 也不应再出现建议、不改名称
    await user.clear(baseUrlInput);
    await user.type(baseUrlInput, "https://api.openai.com/v1");
    expect(screen.queryByText(/按 Tab 填入/)).not.toBeInTheDocument();
    expect(nameInput).toHaveValue("我的密钥");
  });

  it("点击「测速并获取模型」后渲染模型勾选列表（默认全不选）", async () => {
    mockFetchModels.mockResolvedValue({
      models: ["gpt-4o", "gpt-4o-mini"],
      latencyMs: 235,
    });
    const user = userEvent.setup();
    render(
      <KeyFormModal
        initial={newEmptyRecord()}
        providers={sampleProviders}
        onCancel={() => {}}
        onSave={() => {}}
      />
    );

    await user.type(
      screen.getByPlaceholderText("https://api.openai.com/v1"),
      "https://api.openai.com/v1"
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-abc123456789");
    await user.click(
      screen.getByRole("button", { name: "测速并获取模型" })
    );

    expect(await screen.findByText("连通 · 235ms")).toBeInTheDocument();
    const checkbox = await screen.findByRole("checkbox", { name: "gpt-4o" });
    expect(screen.getByRole("checkbox", { name: "gpt-4o-mini" })).toBeInTheDocument();
    // 默认全不选：避免把几十个模型一次性写入记录
    expect(checkbox).not.toBeChecked();

    // 勾选即写入 form.models，与逗号分隔文本框保持一致
    await user.click(checkbox);
    expect(screen.getByPlaceholderText("gpt-4o, gpt-4o-mini")).toHaveValue(
      "gpt-4o"
    );
  });

  it("获取模型失败时显示错误信息", async () => {
    mockFetchModels.mockRejectedValue({ message: "HTTP 401" });
    const user = userEvent.setup();
    render(
      <KeyFormModal
        initial={newEmptyRecord()}
        providers={sampleProviders}
        onCancel={() => {}}
        onSave={() => {}}
      />
    );

    await user.type(
      screen.getByPlaceholderText("https://api.openai.com/v1"),
      "https://api.openai.com/v1"
    );
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-bad");
    await user.click(
      screen.getByRole("button", { name: "测速并获取模型" })
    );

    expect(await screen.findByText("获取失败：HTTP 401")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("Base URL 与 API Key 未填时不显示「测速并获取模型」按钮", () => {
    render(
      <KeyFormModal
        initial={newEmptyRecord()}
        providers={sampleProviders}
        onCancel={() => {}}
        onSave={() => {}}
      />
    );

    expect(
      screen.queryByRole("button", { name: "测速并获取模型" })
    ).not.toBeInTheDocument();
  });
});
