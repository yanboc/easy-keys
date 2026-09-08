import { useState } from "react";
import * as api from "../api";
import type { ApiKeyRecord, SpeedTestResult } from "../types";
import { t, useLang } from "../i18n";
import { BoltIcon } from "../components/icons";

export default function SpeedTestPage({
  records,
}: {
  records: ApiKeyRecord[];
}) {
  useLang();
  const [results, setResults] = useState<SpeedTestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(10000);

  const run = async () => {
    if (records.length === 0) {
      alert(t("请先在「密钥管理」中添加密钥"));
      return;
    }
    setRunning(true);
    setResults(
      records.map((r) => ({
        id: r.id,
        name: r.name,
        ok: false,
        latencyMs: null,
        statusCode: null,
        error: t("测试中…"),
      }))
    );
    try {
      const res = await api.speedtest(records, timeoutMs);
      setResults(res);
    } catch (e) {
      alert(t("测速失败：{e}", { e: String(e) }));
    } finally {
      setRunning(false);
    }
  };

  const okCount = results.filter((r) => r.ok).length;

  return (
    <div>
      <div className="page-title">{t("连通性测速")}</div>
      <div className="page-desc">
        {t(
          "向各密钥配置的端点发起轻量请求，测量连通性与延迟。测速是唯一的联网操作，仅在你点击「开始测速」时发生。"
        )}
      </div>

      <div className="toolbar">
        <div className="toolbar-right" style={{ gap: 10, alignItems: "center" }}>
          <label className="field-hint" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {t("超时(ms)")}
            <input
              className="input"
              type="number"
              value={timeoutMs}
              min={1000}
              max={60000}
              step={1000}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
              style={{ width: 100, padding: "5px 8px" }}
            />
          </label>
          <button className="btn btn-primary" onClick={run} disabled={running}>
            {running ? (
              <>
                <span className="spinner" /> {t("测速中…")}
              </>
            ) : (
              <>
                <BoltIcon size={14} /> {t("开始测速")}
              </>
            )}
          </button>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="big-icon">
              <BoltIcon size={40} />
            </div>
            <div>{t("尚未测速")}</div>
            <div style={{ color: "var(--text-faint)", marginTop: 6 }}>
              {t("点击「开始测速」对全部 {n} 条密钥进行并发检测", {
                n: records.length,
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              fontSize: 12,
              color: "var(--text-dim)",
            }}
          >
            {t("结果：成功")} <span className="speed-ok">{okCount}</span> /{" "}
            {results.length} {t("条")}
          </div>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "8%" }}>{t("状态")}</th>
                <th style={{ width: "26%" }}>{t("名称")}</th>
                <th style={{ width: "16%" }}>{t("延迟")}</th>
                <th style={{ width: "12%" }}>{t("状态码")}</th>
                <th style={{ width: "38%" }}>{t("信息")}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>
                    {running && !r.statusCode && !r.error ? (
                      <span className="speed-running">{t("检测中…")}</span>
                    ) : (
                      <span
                        className={`status-with-dot ${
                          r.ok ? "speed-ok" : "speed-fail"
                        }`}
                      >
                        <span className="status-dot" />
                        {r.ok ? t("连通") : t("失败")}
                      </span>
                    )}
                  </td>
                  <td style={{ fontWeight: 500 }}>{r.name}</td>
                  <td>
                    {r.latencyMs != null ? (
                      <span
                        className={
                          r.latencyMs < 500
                            ? "speed-ok"
                            : r.latencyMs < 2000
                            ? "speed-running"
                            : "speed-fail"
                        }
                        style={{ fontFamily: "var(--mono)" }}
                      >
                        {r.latencyMs} ms
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {r.statusCode != null ? (
                      <span className="badge">{r.statusCode}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ color: "var(--text-dim)", fontSize: 12 }}>
                    {r.error || "OK"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div
        className="card"
        style={{
          marginTop: 16,
          fontSize: 12,
          color: "var(--text-faint)",
          lineHeight: 1.8,
        }}
      >
        {t(
          "安全说明：测速请求由 Rust 后端直连你配置的端点发出，已禁用自动重定向（防止密钥被转发到第三方）；应用自身不含任何遥测、更新检查或第三方连接。"
        )}
      </div>
    </div>
  );
}
