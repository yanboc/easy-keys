import { useRef, useState } from "react";
import * as api from "../api";
import type { ApiKeyRecord } from "../types";
import { effectiveEnvName } from "../types";

type Tab = "export" | "import";

export default function ExportPage({
  records,
  password,
  onImported,
}: {
  records: ApiKeyRecord[];
  password: string;
  onImported: () => void;
}) {
  const [tab, setTab] = useState<Tab>("export");

  // 导出
  const [exportFormat, setExportFormat] = useState<"plain" | "encrypted">(
    "encrypted"
  );
  const [exportPassword, setExportPassword] = useState("");
  const [exportConfirm, setExportConfirm] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  // 导入
  const [importFormat, setImportFormat] = useState<"plain" | "encrypted">(
    "encrypted"
  );
  const [importPassword, setImportPassword] = useState("");
  const [pendingImport, setPendingImport] = useState<ApiKeyRecord[] | null>(
    null
  );
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = (msg: string, type: "success" | "error" = "success") => {
    // 用 alert 简单提示，保持零依赖
    if (type === "error") {
      window.alert(`操作失败：${msg}`);
    } else {
      window.alert(msg);
    }
  };

  const doExport = async () => {
    if (records.length === 0) {
      notify("没有可导出的密钥", "error");
      return;
    }
    if (exportFormat === "encrypted") {
      if (exportPassword.length < 6) {
        notify("导出口令至少需要 6 位", "error");
        return;
      }
      if (exportPassword !== exportConfirm) {
        notify("两次输入的导出口令不一致", "error");
        return;
      }
    }
    if (exportFormat === "plain") {
      const ok = window.confirm(
        "⚠️ 明文导出将把全部 API Key 以未加密的 JSON 写入文件。\n\n任何能读取该文件的人都能看到你的密钥。确定继续吗？"
      );
      if (!ok) return;
    }

    setExportBusy(true);
    try {
      let content: string;
      let fileName: string;
      if (exportFormat === "encrypted") {
        content = await api.exportEncrypted(records, exportPassword);
        fileName = `easy-keys-${new Date().toISOString().slice(0, 10)}.ekey`;
      } else {
        content = await api.exportPlainJson(records);
        fileName = `easy-keys-${new Date().toISOString().slice(0, 10)}.json`;
      }
      const saved = await api.saveTextFile(fileName, content);
      if (saved) {
        notify(
          exportFormat === "encrypted"
            ? `已导出加密文件：${saved}\n\n请牢记导出口令，导入时需要。`
            : `已导出明文文件：${saved}\n\n请妥善保管并注意安全！`
        );
      }
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setExportBusy(false);
    }
  };

  const doImport = async () => {
    if (!fileInputRef.current?.files?.length) {
      notify("请先选择要导入的文件", "error");
      return;
    }
    const file = fileInputRef.current.files[0];
    setImportBusy(true);
    try {
      const content = await file.text();
      let parsed: ApiKeyRecord[];
      if (importFormat === "encrypted") {
        if (!importPassword) {
          notify("请填写导出口令", "error");
          setImportBusy(false);
          return;
        }
        parsed = await api.importEncrypted(content, importPassword);
      } else {
        parsed = await api.importPlainJson(content);
      }
      if (parsed.length === 0) {
        notify("文件中没有可导入的密钥", "error");
        setImportBusy(false);
        return;
      }
      setPendingImport(parsed);
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setImportBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    setImportBusy(true);
    try {
      const count = await api.importSave(password, pendingImport);
      notify(`成功导入 ${count} 条密钥`);
      setPendingImport(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onImported();
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div>
      <div className="page-title">导出 / 导入</div>
      <div className="page-desc">
        密钥可明文导出、加密导出（可迁移到其他机器），或从备份文件中导入。
      </div>

      <div className="tab-row">
        <button
          className={`tab ${tab === "export" ? "active" : ""}`}
          onClick={() => setTab("export")}
        >
          导出
        </button>
        <button
          className={`tab ${tab === "import" ? "active" : ""}`}
          onClick={() => setTab("import")}
        >
          导入
        </button>
      </div>

      {tab === "export" && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="field">
            <label className="field-label">导出格式</label>
            <div className="seg">
              <button
                className={exportFormat === "encrypted" ? "active" : ""}
                onClick={() => setExportFormat("encrypted")}
              >
                🔒 加密 .ekey（推荐）
              </button>
              <button
                className={exportFormat === "plain" ? "active" : ""}
                onClick={() => setExportFormat("plain")}
              >
                📄 明文 JSON
              </button>
            </div>
            <div className="field-hint">
              {exportFormat === "encrypted"
                ? "使用独立导出口令加密，可在另一台机器上导入，密钥不落地"
                : "未加密的 JSON，任何读到文件的人都能看到全部密钥，请谨慎"}
            </div>
          </div>

          {exportFormat === "encrypted" && (
            <>
              <div className="field">
                <label className="field-label">导出口令（至少 6 位）</label>
                <input
                  className="input"
                  type="password"
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label">确认导出口令</label>
                <input
                  className="input"
                  type="password"
                  value={exportConfirm}
                  onChange={(e) => setExportConfirm(e.target.value)}
                />
              </div>
            </>
          )}

          <div
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--text-dim)",
              marginBottom: 16,
            }}
          >
            将导出 {records.length} 条密钥：{records.map((r) => r.name).join("、") || "（无）"}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="btn btn-primary"
              onClick={doExport}
              disabled={exportBusy || records.length === 0}
            >
              {exportBusy ? "导出中…" : "选择保存位置并导出"}
            </button>
          </div>
        </div>
      )}

      {tab === "import" && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="field">
            <label className="field-label">导入格式</label>
            <div className="seg">
              <button
                className={importFormat === "encrypted" ? "active" : ""}
                onClick={() => setImportFormat("encrypted")}
              >
                🔒 加密 .ekey
              </button>
              <button
                className={importFormat === "plain" ? "active" : ""}
                onClick={() => setImportFormat("plain")}
              >
                📄 明文 JSON
              </button>
            </div>
          </div>

          {importFormat === "encrypted" && (
            <div className="field">
              <label className="field-label">导出口令</label>
              <input
                className="input"
                type="password"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label className="field-label">选择文件</label>
            <input
              ref={fileInputRef}
              type="file"
              accept={importFormat === "encrypted" ? ".ekey,.json,.txt" : ".json,.txt"}
            />
            <div className="field-hint">
              导入的密钥会追加到当前保险库（不会覆盖现有数据）
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="btn btn-primary"
              onClick={doImport}
              disabled={importBusy}
            >
              {importBusy ? "解析中…" : "读取并预览"}
            </button>
          </div>

          {pendingImport && (
            <div
              style={{
                marginTop: 16,
                borderTop: "1px solid var(--border)",
                paddingTop: 14,
              }}
            >
              <div className="field-label" style={{ marginBottom: 8 }}>
                待导入 {pendingImport.length} 条：
              </div>
              {pendingImport.slice(0, 8).map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    padding: "4px 0",
                    color: "var(--text-dim)",
                  }}
                >
                  <span>{r.name}</span>
                  <span style={{ fontFamily: "var(--mono)" }}>
                    {effectiveEnvName(r)}
                  </span>
                </div>
              ))}
              {pendingImport.length > 8 && (
                <div style={{ fontSize: 11, color: "var(--text-faint)", padding: "4px 0" }}>
                  …共 {pendingImport.length} 条
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button className="btn" onClick={() => setPendingImport(null)}>
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  onClick={confirmImport}
                  disabled={importBusy}
                >
                  确认导入
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
