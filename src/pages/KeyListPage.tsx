import { useCallback, useEffect, useState } from "react";
import * as api from "../api";
import type { ApiKeyRecord, ProviderTemplate } from "../types";
import { effectiveEnvName, newEmptyRecord } from "../types";
import { maskKey } from "../utils";
import KeyFormModal from "../components/KeyFormModal";
import {
  CopyIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  PlusIcon,
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
  const [providers, setProviders] = useState<ProviderTemplate[]>([]);
  const [editing, setEditing] = useState<ApiKeyRecord | null>(null);
  const [creating, setCreating] = useState(false);
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

  const handleCopy = async (record: ApiKeyRecord) => {
    try {
      const { writeText } = await import(
        "@tauri-apps/plugin-clipboard-manager"
      );
      await writeText(record.apiKey);
      notify("已复制到剪贴板，将在 30 秒后由系统自动清除");
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
      notify(`复制失败：${e}`, "error");
    }
  };

  const handleDelete = async (record: ApiKeyRecord) => {
    if (!window.confirm(`确定删除「${record.name}」吗？此操作不可撤销。`)) return;
    try {
      await api.vaultDelete(password, record.id);
      notify("已删除");
      onRecordsChange(records.filter((r) => r.id !== record.id));
    } catch (e) {
      notify(`删除失败：${e}`, "error");
    }
  };

  const handleSave = async (record: ApiKeyRecord) => {
    try {
      if (record.id) {
        const updated = await api.vaultUpdate(password, record);
        onRecordsChange(records.map((r) => (r.id === updated.id ? updated : r)));
        notify("已保存");
      } else {
        const created = await api.vaultAdd(password, record);
        onRecordsChange([...records, created]);
        notify("已添加");
      }
      setEditing(null);
      setCreating(false);
    } catch (e) {
      notify(`保存失败：${e}`, "error");
    }
  };

  return (
    <div>
      <div className="page-title">密钥管理</div>
      <div className="page-desc">
        共 {records.length} 条密钥 · 全部加密存储在本地，绝不外传
      </div>

      <div className="toolbar">
        <div />
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <PlusIcon size={14} /> 新增密钥
          </button>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="big-icon">
              <KeyIcon size={40} />
            </div>
            <div>还没有任何密钥</div>
            <div style={{ color: "var(--text-faint)", marginTop: 6 }}>
              点击「新增密钥」开始管理你的第一个 API Key
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "24%" }}>名称</th>
                <th style={{ width: "14%" }}>服务商</th>
                <th style={{ width: "30%" }}>密钥</th>
                <th style={{ width: "12%" }}>环境变量</th>
                <th style={{ width: "20%" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
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
                    <span className="badge badge-provider">
                      {providerLabel(r.provider)}
                    </span>
                  </td>
                  <td>
                    <div className="key-cell">
                      <span className="key-mask">
                        {revealed[r.id] ? r.apiKey : maskKey(r.apiKey)}
                      </span>
                      <button
                        className="icon-btn"
                        title={revealed[r.id] ? "隐藏" : "显示"}
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
                        title="复制（30 秒后自动清除）"
                        onClick={() => handleCopy(r)}
                      >
                        <CopyIcon size={15} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <code
                      style={{
                        fontSize: 11,
                        color: "var(--text-dim)",
                        fontFamily: "var(--mono)",
                      }}
                    >
                      {effectiveEnvName(r) || "—"}
                    </code>
                  </td>
                  <td>
                    <button
                      className="icon-btn"
                      title="编辑"
                      onClick={() => setEditing(r)}
                    >
                      <EditIcon size={15} />
                    </button>
                    <button
                      className="icon-btn danger"
                      title="删除"
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

      {toast && (
        <div className="toast-wrap">
          <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
