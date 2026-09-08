import { useEffect, useMemo, useState } from "react";
import * as api from "../api";
import type { ApiKeyRecord, EnvWriteResult } from "../types";
import { effectiveEnvName } from "../types";
import { t, useLang } from "../i18n";
import {
  BoltIcon,
  CheckCircleIcon,
  FileIcon,
  SaveIcon,
  WarningIcon,
} from "../components/icons";

type Mode = "persistent" | "session" | "dotenv";

export default function EnvPage({
  records,
  embedded = false,
}: {
  records: ApiKeyRecord[];
  /** 嵌入「导出 / 导入」页作为标签页时，隐藏自身的页头标题/描述 */
  embedded?: boolean;
}) {
  useLang();
  const [mode, setMode] = useState<Mode>("persistent");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [shell, setShell] = useState("sh");
  const [result, setResult] = useState<EnvWriteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [rcPath, setRcPath] = useState<string | null>(null);

  useEffect(() => {
    api
      .envDetectRc()
      .then(setRcPath)
      .catch(() => {});
    // 探测当前 shell（仅前端提示用）
    const ua = navigator.userAgent;
    if (ua.includes("Windows")) {
      setShell("powershell");
    }
  }, []);

  // 默认全选
  useEffect(() => {
    const all: Record<string, boolean> = {};
    for (const r of records) all[r.id] = true;
    setSelected(all);
  }, [records]);

  const selectedRecords = useMemo(
    () => records.filter((r) => selected[r.id]),
    [records, selected]
  );

  const toggle = (id: string) =>
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    for (const r of records) next[r.id] = checked;
    setSelected(next);
  };

  const run = async () => {
    if (selectedRecords.length === 0) {
      alert(t("请至少选择一条密钥"));
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      let res: EnvWriteResult;
      let dotenvText: string | null = null;
      if (mode === "persistent") {
        res = await api.envWritePersistent(selectedRecords);
      } else if (mode === "session") {
        res = await api.envSessionScript(selectedRecords, shell);
      } else {
        dotenvText = await api.envDotenv(selectedRecords);
        const saved = await api.saveTextFile(
          "tokey.env",
          dotenvText
        );
        if (saved) {
          res = {
            written: selectedRecords.map((r) => effectiveEnvName(r)),
            skipped: [],
            targetFile: saved,
            instructions: t(
              "已保存到 {path}\n\n在项目中使用 dotenv 加载，或直接 source 该文件。",
              { path: saved }
            ),
          };
        } else {
          setBusy(false);
          return;
        }
      }
      setResult(res);
    } catch (e) {
      alert(t("写入失败：{e}", { e: String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {!embedded && (
        <>
          <div className="page-title">{t("环境变量")}</div>
          <div className="page-desc">
            {t("一键把选中的 API Key 写入环境变量。当前检测到 shell 配置：")}
            <code style={{ fontFamily: "var(--mono)", marginLeft: 4 }}>
              {rcPath || t("未知")}
            </code>
          </div>
        </>
      )}

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="field">
          <label className="field-label">{t("写入方式")}</label>
          <div className="seg">
            <button
              className={mode === "persistent" ? "active" : ""}
              onClick={() => setMode("persistent")}
            >
              <SaveIcon size={14} /> {t("持久化（重启生效）")}
            </button>
            <button
              className={mode === "session" ? "active" : ""}
              onClick={() => setMode("session")}
            >
              <BoltIcon size={14} /> {t("仅当前会话")}
            </button>
            <button
              className={mode === "dotenv" ? "active" : ""}
              onClick={() => setMode("dotenv")}
            >
              <FileIcon size={14} /> {t(".env 文件")}
            </button>
          </div>
          <div className="field-hint">
            {mode === "persistent" &&
              t("写入 shell 配置（~/.zshrc 等）或 Windows 用户环境变量，新终端自动生效")}
            {mode === "session" &&
              t("生成可 source 的脚本，仅当前终端会话生效，关闭终端即失效")}
            {mode === "dotenv" && t("生成标准 .env 文件，由你自己的工具链加载")}
          </div>
        </div>

        {mode === "session" && (
          <div className="field">
            <label className="field-label">{t("目标 Shell")}</label>
            <select
              className="select"
              value={shell}
              onChange={(e) => setShell(e.target.value)}
              style={{ maxWidth: 240 }}
            >
              <option value="sh">sh / zsh / bash</option>
              <option value="fish">fish</option>
              <option value="powershell">PowerShell</option>
              <option value="cmd">CMD (Windows)</option>
            </select>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            margin: "6px 0 10px",
          }}
        >
          <span className="field-label">
            {t("选择密钥（已选 {a}/{b}）", {
              a: selectedRecords.length,
              b: records.length,
            })}
          </span>
          <span style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => toggleAll(true)}>
              {t("全选")}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => toggleAll(false)}>
              {t("清空")}
            </button>
          </span>
        </div>

        {records.length === 0 ? (
          <div style={{ color: "var(--text-faint)", fontSize: 13, padding: "12px 0" }}>
            {t("暂无密钥，请先在「密钥管理」中添加。")}
          </div>
        ) : (
          <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 8 }}>
            {records.map((r) => (
              <label
                key={r.id}
                className={`check-row ${selected[r.id] ? "checked" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={!!selected[r.id]}
                  onChange={() => toggle(r.id)}
                />
                <span style={{ flex: 1 }}>{r.name}</span>
                <code
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    color: "var(--accent)",
                  }}
                >
                  {effectiveEnvName(r)}
                </code>
              </label>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button
            className="btn btn-primary"
            onClick={run}
            disabled={busy || selectedRecords.length === 0}
          >
            {busy
              ? t("写入中…")
              : mode === "persistent"
              ? t("写入 shell 配置")
              : mode === "session"
              ? t("生成会话脚本")
              : t("导出 .env 文件")}
          </button>
        </div>
      </div>

      {result && (
        <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
          <div className="field-label" style={{ marginBottom: 8 }}>
            {t("写入结果")}
          </div>
          {result.written.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {result.written.map((name) => (
                <div
                  key={name}
                  className="env-result-row"
                  style={{ color: "var(--success)" }}
                >
                  <CheckCircleIcon size={14} />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          )}
          {result.skipped.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {result.skipped.map((s) => (
                <div
                  key={s}
                  className="env-result-row"
                  style={{ color: "var(--warning)" }}
                >
                  <WarningIcon size={14} />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}
          {result.targetFile && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-dim)",
                marginBottom: 6,
                wordBreak: "break-all",
              }}
            >
              {t("文件：{path}", { path: result.targetFile })}
            </div>
          )}
          {result.instructions && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-dim)",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 12px",
                marginTop: 8,
                wordBreak: "break-all",
              }}
            >
              {result.instructions}
            </div>
          )}
        </div>
      )}

      <div
        className="card"
        style={{
          maxWidth: 640,
          marginTop: 16,
          fontSize: 12,
          color: "var(--text-faint)",
          lineHeight: 1.8,
        }}
      >
        {t(
          "安全说明：持久化写入会把密钥以明文形式追加到 shell 配置文件（这些文件权限通常仅当前用户可读）。如果你更在意静态存储安全，推荐使用「仅当前会话」模式或 .env 文件并在使用后删除。"
        )}
      </div>
    </div>
  );
}
