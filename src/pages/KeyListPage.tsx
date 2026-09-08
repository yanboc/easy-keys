import { useCallback, useEffect, useState } from "react";
import * as api from "../api";
import type { ApiKeyRecord, ProviderTemplate } from "../types";
import { newEmptyRecord } from "../types";
import { maskKey } from "../utils";
import { t, useLang } from "../i18n";
import KeyFormModal from "../components/KeyFormModal";
import KeyExportModal from "../components/KeyExportModal";
import {
  CopyIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  PlusIcon,
  ShareIcon,
  TrashIcon,
} from "../components/icons";

export default function KeyListPage({
  records,
  password,
  onRecordsChange,
}: {
  records: ApiKeyRecord[];
  password: string;
  onRecordsChange: (next?: ApiKeyRecord[]) => void;
}) {
  useLang();
  const [providers, setProviders] = useState<ProviderTemplate[]>([]);
  const [editing, setEditing] = useState<ApiKeyRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState<ApiKeyRecord | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

  useEffect(() => {
    api.getDefaultProviders().then(setProviders).catch(() => {});
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = (msg: string, type = "success") => setToast({ msg, type });

  const providerLabel = useCallback(
    (id: string) => {
      const found = providers.find((p) => p.id === id);
      if (found) return found.label;
      return id;
    },
    [providers]
  );

  /** 该密钥生效的 BASE URL：优先记录自身的，回退到提供商模板默认值 */
  const providerUrl = useCallback(
    (r: ApiKeyRecord) => {
      if (r.baseUrl.trim()) return r.baseUrl.trim();
      return (
        providers.find((p) => p.id === r.provider)?.defaultBaseUrl ?? ""
      );
    },
    [providers]
  );

  /** 提供商列的显示名：已知提供商用小写 id（如 deepseek），自定义用 URL 主机名 */
  const providerName = useCallback(
    (r: ApiKeyRecord) => {
      if (r.provider !== "custom") return r.provider.toLowerCase();
      const url = providerUrl(r);
      if (url) {
        try {
          return new URL(url).hostname;
        } catch {
          /* 非标准 URL 时退回 id */
        }
      }
      return r.provider;
    },
    [providerUrl]
  );

  /** 点击提供商名 → 复制 BASE URL（非敏感信息，不做 30 秒自动清除） */
  const handleCopyUrl = async (record: ApiKeyRecord) => {
    const url = providerUrl(record);
    if (!url) {
      notify(
        t("「{label}」没有可复制的 BASE URL", {
          label: providerLabel(record.provider),
        }),
        "error"
      );
      return;
    }
    try {
      const { writeText } = await import(
        "@tauri-apps/plugin-clipboard-manager"
      );
      await writeText(url);
      notify(t("已复制 {url}", { url }));
    } catch (e) {
      notify(t("复制失败：{e}", { e: String(e) }), "error");
    }
  };

  const handleCopy = async (record: ApiKeyRecord) => {
    try {
      const { writeText } = await import(
        "@tauri-apps/plugin-clipboard-manager"
      );
      await writeText(record.apiKey);
      notify(t("已复制到剪贴板，将在 30 秒后由系统自动清除"));
      setTimeout(async () => {
        try {
          const { readText } = await import(
            "@tauri-apps/plugin-clipboard-manager"
          );
          const current = await readText();
          if (current === record.apiKey) {
            await writeText("");
          }
        } catch {
          /* 忽略清除失败 */
        }
      }, 30_000);
    } catch (e) {
      notify(t("复制失败：{e}", { e: String(e) }), "error");
    }
  };

  const handleDelete = async (record: ApiKeyRecord) => {
    if (
      !window.confirm(
        t("确定删除「{name}」吗？此操作不可撤销。", { name: record.name })
      )
    )
      return;
    try {
      await api.vaultDelete(password, record.id);
      notify(t("已删除"));
      onRecordsChange(records.filter((r) => r.id !== record.id));
    } catch (e) {
      notify(t("删除失败：{e}", { e: String(e) }), "error");
    }
  };

  const handleSave = async (record: ApiKeyRecord) => {
    try {
      if (record.id) {
        const updated = await api.vaultUpdate(password, record);
        onRecordsChange(records.map((r) => (r.id === updated.id ? updated : r)));
        notify(t("已保存"));
      } else {
        const created = await api.vaultAdd(password, record);
        onRecordsChange([...records, created]);
        notify(t("已添加"));
      }
      setEditing(null);
      setCreating(false);
    } catch (e) {
      notify(t("保存失败：{e}", { e: String(e) }), "error");
    }
  };

  return (
    <div>
      <div className="page-title">{t("密钥管理")}</div>
      <div className="page-desc">
        {t("共 {n} 条密钥 · 全部加密存储在本地，绝不外传", {
          n: records.length,
        })}
      </div>

      {/* 内容列宽与导出/设置页一致（560），表格内容变少后不再铺满 */}
      <div style={{ maxWidth: 560 }}>
        <div className="toolbar">
          <div />
          <div className="toolbar-right">
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <PlusIcon size={14} /> {t("新增密钥")}
            </button>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="big-icon">
                <KeyIcon size={40} />
              </div>
              <div>{t("还没有任何密钥")}</div>
              <div style={{ color: "var(--text-faint)", marginTop: 6 }}>
                {t("点击「新增密钥」开始管理你的第一个 API Key")}
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "22%" }}>{t("名称")}</th>
                <th style={{ width: "16%" }}>{t("提供商/URL")}</th>
                <th style={{ width: "34%" }}>{t("密钥")}</th>
                <th style={{ width: "28%" }}>{t("操作")}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="cell-name" title={r.name}>
                      {r.name}
                    </div>
                    {r.notes && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-faint)",
                          maxWidth: 160,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.notes}
                      </div>
                    )}
                  </td>
                  <td>
                    {(() => {
                      const url = providerUrl(r);
                      return url ? (
                        <button
                          className="link-cell"
                          title={t("点击复制 {url}", { url })}
                          onClick={() => handleCopyUrl(r)}
                        >
                          {providerName(r)}
                        </button>
                      ) : (
                        <span className="badge badge-provider">
                          {providerName(r)}
                        </span>
                      );
                    })()}
                  </td>
                  <td>
                    <div className="key-cell">
                      <span className="key-mask">
                        {revealed[r.id] ? r.apiKey : maskKey(r.apiKey)}
                      </span>
                      <button
                        className="icon-btn"
                        title={revealed[r.id] ? t("隐藏") : t("显示")}
                        onClick={() =>
                          setRevealed((prev) => ({
                            ...prev,
                            [r.id]: !prev[r.id],
                          }))
                        }
                      >
                        {revealed[r.id] ? (
                          <EyeOffIcon size={15} />
                        ) : (
                          <EyeIcon size={15} />
                        )}
                      </button>
                      <button
                        className="icon-btn"
                        title={t("复制（30 秒后自动清除）")}
                        onClick={() => handleCopy(r)}
                      >
                        <CopyIcon size={15} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      title={t("导出")}
                      onClick={() => setExporting(r)}
                    >
                      <ShareIcon size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      title={t("编辑")}
                      onClick={() => setEditing(r)}
                    >
                      <EditIcon size={15} />
                    </button>
                    <button
                      className="icon-btn danger"
                      title={t("删除")}
                      onClick={() => handleDelete(r)}
                    >
                      <TrashIcon size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <KeyFormModal
          initial={creating ? newEmptyRecord() : editing!}
          providers={providers}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}

      {exporting && (
        <KeyExportModal
          record={exporting}
          baseUrl={providerUrl(exporting)}
          onClose={() => setExporting(null)}
          onCopyKey={handleCopy}
          notify={notify}
        />
      )}

      {toast && (
        <div className="toast-wrap">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
