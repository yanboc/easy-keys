import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import KeyFormModal from "./KeyFormModal";
import { newEmptyRecord } from "../types";
import { sampleProviders } from "../test/fixtures";

describe("KeyFormModal", () => {
  beforeEach(() => {
    // jsdom 未实现 alert，统一打桩
    vi.spyOn(window, "alert").mockImplementation(() => {});
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
});
