import { useState } from "react";
import type { ApiKeyRecord } from "../types";
import { effectiveEnvName } from "../types";
import { maskKey } from "../utils";
import { t, useLang } from "../i18n";
import { CopyIcon, EyeIcon, EyeOffIcon } from "./icons";

/**
 * 单条密钥的导出弹窗：提供 API Key（默认打码）/ Base URL / 环境变量名 的复制。
 * API Key 的复制走父组件的 30 秒自动清除逻辑，其余字段非敏感，普通复制。
 */
export default function KeyExportModal({
  record,
  baseUrl,
  onClose,
  onCopyKey,
  notify,
}: {
  record: ApiKeyRecord;
  baseUrl: string;
  onClose: () => void;
  onCopyKey: (record: ApiKeyRecord) => void;
  notify: (msg: string, type?: string) => void;
}) {
  useLang();
  const [revealed, setRevealed] = useState(false);
  const envName = effectiveEnvName(record);

  const copyPlain = async (text: string, okMsg: string) => {
    try {
      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
      await writeText(text);
      notify(okMsg);
    } catch (e) {
      notify(t("复制失败：{e}", { e: String(e) }), "error");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {t("导出")} · {record.name}
        </div>

        <div className="kv-row">
          <span className="kv-label">API Key</span>
          <span className="kv-value">
            {revealed ? record.apiKey : maskKey(record.apiKey)}
          </span>
          <button
            className="icon-btn"
            title={revealed ? t("隐藏") : t("显示")}
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
          </button>
          <button
            className="icon-btn"
            title={t("复制（30 秒后自动清除）")}
            onClick={() => onCopyKey(record)}
          >
            <CopyIcon size={14} />
          </button>
        </div>

        <div className="kv-row">
          <span className="kv-label">Base URL</span>
          <span className="kv-value">{baseUrl || "—"}</span>
          <button
            className="icon-btn"
            title={t("复制")}
            disabled={!baseUrl}
            onClick={() =>
              copyPlain(baseUrl, t("已复制 {url}", { url: baseUrl }))
            }
          >
            <CopyIcon size={14} />
          </button>
        </div>

        <div className="kv-row">
          <span className="kv-label">{t("环境变量名")}</span>
          <span className="kv-value">{envName}</span>
          <button
            className="icon-btn"
            title={t("复制")}
            onClick={() =>
              copyPlain(envName, t("已复制 {url}", { url: envName }))
            }
          >
            <CopyIcon size={14} />
          </button>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            {t("关闭")}
          </button>
        </div>
      </div>
    </div>
  );
}
