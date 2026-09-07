import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ExportPage from "./ExportPage";
import { makeRecord } from "../test/fixtures";

// mock Tauri 边界
vi.mock("../api", () => ({
  exportEncrypted: vi.fn(),
  exportPlainJson: vi.fn(),
  saveTextFile: vi.fn(),
  importEncrypted: vi.fn(),
  importPlainJson: vi.fn(),
  importSave: vi.fn(),
}));

import * as api from "../api";

const records = [makeRecord()];

function renderPage() {
  return render(
    <ExportPage records={records} password="pwd" onImported={() => {}} />
  );
}

describe("ExportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  it("渲染导出页并列出将导出的密钥", () => {
    renderPage();

    expect(screen.getByText("导出 / 导入")).toBeInTheDocument();
    expect(screen.getByText(/将导出 1 条密钥/)).toBeInTheDocument();
    expect(screen.getByText(/我的 OpenAI/)).toBeInTheDocument();
  });

  it("导出口令不足 6 位时提示且不调用接口", () => {
    renderPage();

    const pwdInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(pwdInputs[0], { target: { value: "12345" } });
    fireEvent.change(pwdInputs[1], { target: { value: "12345" } });
    fireEvent.click(
      screen.getByRole("button", { name: "选择保存位置并导出" })
    );

    expect(window.alert).toHaveBeenCalledWith("操作失败：导出口令至少需要 6 位");
    expect(api.exportEncrypted).not.toHaveBeenCalled();
  });

  it("加密导出主流程：导出并保存到文件", async () => {
    vi.mocked(api.exportEncrypted).mockResolvedValue("ENCRYPTED_CONTENT");
    vi.mocked(api.saveTextFile).mockResolvedValue("/tmp/easy-keys.ekey");
    renderPage();

    const pwdInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(pwdInputs[0], { target: { value: "secret1" } });
    fireEvent.change(pwdInputs[1], { target: { value: "secret1" } });
    fireEvent.click(
      screen.getByRole("button", { name: "选择保存位置并导出" })
    );

    await waitFor(() => {
      expect(api.exportEncrypted).toHaveBeenCalledWith(records, "secret1");
    });
    expect(api.saveTextFile).toHaveBeenCalledWith(
      expect.stringMatching(/^easy-keys-.*\.ekey$/),
      "ENCRYPTED_CONTENT"
    );
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining("已导出加密文件：/tmp/easy-keys.ekey")
      );
    });
  });
});
