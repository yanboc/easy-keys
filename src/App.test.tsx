import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import App from "./App";
import { makeRecord } from "./test/fixtures";

const mocks = vi.hoisted(() => ({
  focusCb: undefined as undefined | ((focused: boolean) => void),
}));

// mock Tauri 边界（api 是唯一 invoke 封装层）
vi.mock("./api", () => ({
  vaultExists: vi.fn(),
  vaultCreate: vi.fn(),
  vaultUnlock: vi.fn(),
  // 默认无存活会话：恢复失败，回退锁屏
  vaultResume: vi.fn(() => Promise.reject(new Error("会话已过期"))),
  vaultLock: vi.fn(),
  biometricStatus: vi.fn(),
  biometricUnlock: vi.fn(),
  getDefaultProviders: vi.fn(),
  resizeWindow: vi.fn(() => Promise.resolve()),
  appHide: vi.fn(() => Promise.resolve()),
  onWindowFocus: vi.fn((cb: (focused: boolean) => void) => {
    mocks.focusCb = cb;
    return Promise.resolve(() => {});
  }),
}));

import * as api from "./api";

const BIO_ENABLED = { available: true, enabled: true, label: "Touch ID" };
const BIO_AVAILABLE_DISABLED = {
  available: true,
  enabled: false,
  label: "Touch ID",
};
const BIO_UNAVAILABLE = { available: false, enabled: false, label: "" };

describe("App 锁屏 / 生物识别解锁", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(api.vaultExists).mockResolvedValue(true);
    vi.mocked(api.getDefaultProviders).mockResolvedValue([]);
  });

  it("生物识别已启用时显示解锁按钮并自动触发一次", async () => {
    vi.mocked(api.biometricStatus).mockResolvedValue(BIO_ENABLED);
    // 先挂起，验证按钮存在；再放行，验证自动触发后进入主界面
    let resolveUnlock: (rs: ReturnType<typeof makeRecord>[]) => void = () => {};
    vi.mocked(api.biometricUnlock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUnlock = resolve;
        })
    );

    render(<App />);

    // 锁定态：窗口缩为锁屏小窗
    await waitFor(() => {
      expect(api.resizeWindow).toHaveBeenCalledWith(360, 250, 320, 220);
    });

    const btn = await screen.findByRole("button", {
      name: /验证中…|使用 Touch ID 解锁/,
    });
    expect(btn).toBeInTheDocument();
    // 生物识别已启用时锁屏只留一个按钮，不显示主密码框
    expect(screen.queryByPlaceholderText("主密码")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(api.biometricUnlock).toHaveBeenCalledTimes(1);
    });

    resolveUnlock([makeRecord()]);
    // 进入主界面（侧栏导航出现），窗口恢复主尺寸
    expect((await screen.findAllByText("密钥管理")).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(api.resizeWindow).toHaveBeenCalledWith(960, 590, 760, 520);
    });
    // 记录已载入（密钥列表页显示名称）
    expect(await screen.findByText("我的 OpenAI")).toBeInTheDocument();
  });

  it("焦点切回时自动重新触发生物识别（5 秒冷却防循环）", async () => {
    vi.mocked(api.biometricStatus).mockResolvedValue(BIO_ENABLED);
    vi.mocked(api.biometricUnlock).mockRejectedValue(new Error("已取消身份验证"));

    render(<App />);

    // 挂载自动触发一次（失败 → 按钮被替换为密码框）
    await waitFor(() => {
      expect(api.biometricUnlock).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByRole("button", { name: /使用 Touch ID 解锁/ })
    ).not.toBeInTheDocument();
    expect(await screen.findByPlaceholderText("主密码")).toBeInTheDocument();

    // 冷却期内焦点切回不重复触发
    mocks.focusCb?.(true);
    expect(api.biometricUnlock).toHaveBeenCalledTimes(1);

    // 冷却期后焦点切回重新触发（期间密码框保持可见，用户可随时改用密码）
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => realNow + 10_000);
    mocks.focusCb?.(true);
    await waitFor(() => {
      expect(api.biometricUnlock).toHaveBeenCalledTimes(2);
    });
    vi.mocked(Date.now).mockRestore();
  });

  it("验证在途时焦点事件不重复触发（按一次指纹即可）", async () => {
    vi.mocked(api.biometricStatus).mockResolvedValue(BIO_ENABLED);
    // 验证挂起不结束：模拟弹窗打开期间焦点来回切换
    let resolveUnlock: (rs: ReturnType<typeof makeRecord>[]) => void = () => {};
    vi.mocked(api.biometricUnlock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUnlock = resolve;
        })
    );

    render(<App />);

    await waitFor(() => {
      expect(api.biometricUnlock).toHaveBeenCalledTimes(1);
    });
    // 弹窗抢占焦点导致的失焦/聚焦循环不应产生新的验证
    mocks.focusCb?.(false);
    mocks.focusCb?.(true);
    mocks.focusCb?.(false);
    mocks.focusCb?.(true);
    expect(api.biometricUnlock).toHaveBeenCalledTimes(1);

    resolveUnlock([makeRecord()]);
    expect(await screen.findByText("我的 OpenAI")).toBeInTheDocument();
  });

  it("生物识别取消 / 失败时替换为主密码输入框，不弹窗", async () => {
    vi.mocked(api.biometricStatus).mockResolvedValue(BIO_ENABLED);
    vi.mocked(api.biometricUnlock).mockRejectedValue(new Error("已取消身份验证"));

    render(<App />);

    expect(
      await screen.findByText("生物识别未完成，可使用主密码解锁")
    ).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
    // 指纹按钮被替换为主密码框
    expect(
      screen.queryByRole("button", { name: /使用 Touch ID 解锁/ })
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("主密码")).toBeInTheDocument();
  });

  it("生物识别可用但未启用时不显示生物识别按钮", async () => {
    vi.mocked(api.biometricStatus).mockResolvedValue(BIO_AVAILABLE_DISABLED);

    render(<App />);

    await waitFor(() => {
      expect(api.biometricStatus).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("button", { name: /使用 Touch ID 解锁/ })
    ).not.toBeInTheDocument();
    expect(api.biometricUnlock).not.toHaveBeenCalled();
  });

  it("平台不支持（Linux）时不显示生物识别按钮", async () => {
    vi.mocked(api.biometricStatus).mockResolvedValue(BIO_UNAVAILABLE);

    render(<App />);

    await screen.findByPlaceholderText("主密码");
    expect(
      screen.queryByRole("button", { name: /使用 .* 解锁/ })
    ).not.toBeInTheDocument();
  });

  it("主密码解锁流程不受生物识别影响", async () => {
    vi.mocked(api.biometricStatus).mockResolvedValue(BIO_AVAILABLE_DISABLED);
    vi.mocked(api.vaultUnlock).mockResolvedValue([makeRecord()]);

    render(<App />);

    const input = await screen.findByPlaceholderText("主密码");
    fireEvent.change(input, { target: { value: "masterpassword" } });
    // 极简锁屏无提交按钮，回车提交表单
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(api.vaultUnlock).toHaveBeenCalledWith("masterpassword");
    });
    expect(await screen.findByText("我的 OpenAI")).toBeInTheDocument();
  });

  it("Rust 会话仍存活时启动直接恢复解锁（关窗重开不重新锁定）", async () => {
    vi.mocked(api.vaultResume).mockResolvedValue([makeRecord()]);

    render(<App />);

    // 不出现锁屏，直接进主界面
    expect(await screen.findByText("我的 OpenAI")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("主密码")).not.toBeInTheDocument();
    expect(api.biometricStatus).not.toHaveBeenCalled();
  });

  it("保险库不存在时进入创建模式，不查询生物识别", async () => {
    vi.mocked(api.vaultExists).mockResolvedValue(false);

    render(<App />);

    // 创建模式：密码框提示最少 8 位，并多一个确认框
    expect(
      await screen.findByPlaceholderText("主密码（至少 8 位）")
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("确认主密码")).toBeInTheDocument();
    expect(api.biometricStatus).not.toHaveBeenCalled();
  });
});
