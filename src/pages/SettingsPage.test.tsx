import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import SettingsPage from "./SettingsPage";

// mock Tauri 边界
vi.mock("../api", () => ({
  vaultChangePassword: vi.fn(),
  biometricStatus: vi.fn(),
  biometricEnable: vi.fn(),
  biometricDisable: vi.fn(),
}));

import * as api from "../api";

const BIO_UNAVAILABLE = { available: false, enabled: false, label: "" };
const BIO_TOUCH_ID = { available: true, enabled: false, label: "Touch ID" };

function renderPage(overrides: Partial<Parameters<typeof SettingsPage>[0]> = {}) {
  const props = {
    password: "oldpassword",
    onPasswordChanged: vi.fn(),
    onLock: vi.fn(),
    ...overrides,
  };
  render(<SettingsPage {...props} />);
  return props;
}

function fillPasswords(oldPwd: string, newPwd: string, confirmPwd: string) {
  const inputs = document.querySelectorAll('input[type="password"]');
  fireEvent.change(inputs[0], { target: { value: oldPwd } });
  fireEvent.change(inputs[1], { target: { value: newPwd } });
  fireEvent.change(inputs[2], { target: { value: confirmPwd } });
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    // 默认：平台不支持生物识别（卡片隐藏），不影响既有用例
    vi.mocked(api.biometricStatus).mockResolvedValue(BIO_UNAVAILABLE);
  });

  it("当前主密码错误时提示且不调用接口", () => {
    renderPage();

    fillPasswords("wrongpassword", "newpassword1", "newpassword1");
    fireEvent.click(screen.getByRole("button", { name: "更新主密码" }));

    expect(window.alert).toHaveBeenCalledWith("当前主密码不正确");
    expect(api.vaultChangePassword).not.toHaveBeenCalled();
  });

  it("新密码不足 8 位时提示", () => {
    renderPage();

    fillPasswords("oldpassword", "short", "short");
    fireEvent.click(screen.getByRole("button", { name: "更新主密码" }));

    expect(window.alert).toHaveBeenCalledWith("新主密码至少需要 8 位");
    expect(api.vaultChangePassword).not.toHaveBeenCalled();
  });

  it("修改密码主流程：调用接口并回调新密码", async () => {
    vi.mocked(api.vaultChangePassword).mockResolvedValue(undefined);
    const props = renderPage();

    fillPasswords("oldpassword", "newpassword1", "newpassword1");
    fireEvent.click(screen.getByRole("button", { name: "更新主密码" }));

    await waitFor(() => {
      expect(api.vaultChangePassword).toHaveBeenCalledWith(
        "oldpassword",
        "newpassword1"
      );
    });
    expect(props.onPasswordChanged).toHaveBeenCalledWith("newpassword1");
    expect(window.alert).toHaveBeenCalledWith("主密码已更新");
  });

  it("点击锁定应用触发 onLock", () => {
    const props = renderPage();

    fireEvent.click(screen.getByRole("button", { name: /锁定应用/ }));

    expect(props.onLock).toHaveBeenCalledTimes(1);
  });

  it("平台不支持生物识别时不展示生物识别区块", async () => {
    renderPage();

    await waitFor(() => {
      expect(api.biometricStatus).toHaveBeenCalled();
    });
    expect(screen.queryByText("生物识别解锁")).not.toBeInTheDocument();
  });

  it("生物识别可用时显示区块，点击启用后主密码确认输入出现", async () => {
    vi.mocked(api.biometricStatus).mockResolvedValue(BIO_TOUCH_ID);
    renderPage();

    const enableBtn = await screen.findByRole("button", { name: /启用 Touch ID/ });
    fireEvent.click(enableBtn);

    expect(
      await screen.findByText("输入主密码以确认启用")
    ).toBeInTheDocument();
  });

  it("确认启用：调用 biometricEnable 并刷新为已启用", async () => {
    vi.mocked(api.biometricStatus).mockResolvedValue(BIO_TOUCH_ID);
    vi.mocked(api.biometricEnable).mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: /启用 Touch ID/ })
    );
    const pwdInput = (await screen.findByText(
      "输入主密码以确认启用"
    )) as HTMLLabelElement;
    const input = pwdInput.parentElement!.querySelector("input")!;
    fireEvent.change(input, { target: { value: "masterpassword" } });
    fireEvent.click(screen.getByRole("button", { name: "确认启用" }));

    await waitFor(() => {
      expect(api.biometricEnable).toHaveBeenCalledWith("masterpassword");
    });
    expect(
      await screen.findByRole("button", { name: /关闭 Touch ID/ })
    ).toBeInTheDocument();
  });

  it("已启用时可关闭：调用 biometricDisable", async () => {
    vi.mocked(api.biometricStatus).mockResolvedValue({
      ...BIO_TOUCH_ID,
      enabled: true,
    });
    vi.mocked(api.biometricDisable).mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: /关闭 Touch ID/ })
    );

    await waitFor(() => {
      expect(api.biometricDisable).toHaveBeenCalled();
    });
    expect(
      await screen.findByRole("button", { name: /启用 Touch ID/ })
    ).toBeInTheDocument();
  });

  it("启用失败时提示且不切换状态", async () => {
    vi.mocked(api.biometricStatus).mockResolvedValue(BIO_TOUCH_ID);
    vi.mocked(api.biometricEnable).mockRejectedValue(new Error("主密码错误"));
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: /启用 Touch ID/ })
    );
    const pwdLabel = await screen.findByText("输入主密码以确认启用");
    const input = pwdLabel.parentElement!.querySelector("input")!;
    fireEvent.change(input, { target: { value: "wrongpassword" } });
    fireEvent.click(screen.getByRole("button", { name: "确认启用" }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining("启用失败")
      );
    });
    // 仍是未启用状态
    expect(
      screen.getByRole("button", { name: /启用 Touch ID/ })
    ).toBeInTheDocument();
  });
});
