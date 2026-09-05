import { useEffect, useMemo, useState } from "react";
import type { ApiKeyRecord, ProviderTemplate } from "../types";
import { applyProviderDefaults, computeAutoEnvName } from "../utils";

export default function KeyFormModal({
  initial,
  providers,
  onCancel,
  onSave,
}: {
  initial: ApiKeyRecord;
  providers: ProviderTemplate[];
  onCancel: () => void;
  onSave: (record: ApiKeyRecord) => void;
}) {
  const [form, setForm] = useState<ApiKeyRecord>({ ...initial });
  const [showKey, setShowKey] = useState(false);

  // 选择 provider 时自动填充默认值
  const applyProvider = (id: string) => {
    setForm((prev) => applyProviderDefaults(prev, providers, id));
  };

  // 首次打开编辑已有记录时，把 provider 匹配到模板
  useEffect(() => {
    if (initial.id) {
      const tpl = providers.find((p) => p.id === initial.provider);
      if (tpl) {
        // 如果 baseUrl 与模板默认一致，则无需额外处理
        if (!initial.baseUrl) {
          setForm((prev) => ({ ...prev, baseUrl: tpl.defaultBaseUrl }));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoEnvName = useMemo(
    () => computeAutoEnvName(form.envName, form.provider),
    [form.envName, form.provider]
  );

  const set = <K extends keyof ApiKeyRecord>(key: K, value: ApiKeyRecord[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    if (!form.name.trim()) {
      alert("请填写名称");
      return;
    }
    if (!form.apiKey.trim() && form.authType !== "none") {
      alert("请填写 API Key");
      return;
    }
    if (!form.baseUrl.trim()) {
      alert("请填写 Base URL");
      return;
    }
    onSave({
      ...form,
      name: form.name.trim(),
      envName: autoEnvName,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {form.id ? "编辑密钥" : "新增密钥"}
        </div>

        <div className="field">
          <label className="field-label">名称</label>
          <input
            className="input"
            placeholder="如：我的 OpenAI 主号"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus
          />
        </div>

        <div className="field">
          <label className="field-label">服务商模板</label>
          <select
            className="select"
            value={form.provider}
            onChange={(e) => applyProvider(e.target.value)}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label">Base URL</label>
          <input
            className="input"
            placeholder="https://api.openai.com/v1"
            value={form.baseUrl}
            onChange={(e) => set("baseUrl", e.target.value)}
          />
          <div className="field-hint">测速时会访问 {form.baseUrl}/models 等端点</div>
        </div>

        <div className="field">
          <label className="field-label">
            API Key {form.authType === "none" && "（当前模板无需认证，可留空）"}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              type={showKey ? "text" : "password"}
              placeholder="sk-..."
              value={form.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
              style={{ fontFamily: "var(--mono)" }}
            />
            <button
              className="icon-btn"
              title={showKey ? "隐藏" : "显示"}
              style={{ border: "1px solid var(--border)" }}
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? "🙈" : "👁"}
            </button>
          </div>
        </div>

        <div className="field">
          <label className="field-label">环境变量名</label>
          <input
            className="input"
            placeholder={autoEnvName}
            value={form.envName}
            onChange={(e) => set("envName", e.target.value)}
            style={{ fontFamily: "var(--mono)" }}
          />
          <div className="field-hint">
            留空将自动使用：{autoEnvName}
          </div>
        </div>

        <div className="field">
          <label className="field-label">模型列表（可选，逗号分隔）</label>
          <input
            className="input"
            placeholder="gpt-4o, gpt-4o-mini"
            value={form.models.join(", ")}
            onChange={(e) =>
              set(
                "models",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
          />
        </div>

        <div className="field">
          <label className="field-label">备注（可选）</label>
          <textarea
            className="textarea"
            placeholder="记录用途、配额、到期时间等"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-primary" onClick={submit}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
