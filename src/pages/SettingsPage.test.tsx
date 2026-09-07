import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import SettingsPage from "./SettingsPage";

// mock Tauri 边界
vi.mock("../api", () => ({
  vaultChangePassword: vi.fn(),
}));

import * as api from "../api";

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
});
