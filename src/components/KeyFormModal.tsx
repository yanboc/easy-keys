import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiKeyRecord, ProviderTemplate } from "../types";
import {
  applyProviderDefaults,
  computeAutoEnvName,
  suggestNameFromBaseUrl,
} from "../utils";
import { fetchModels } from "../api";
import { BoltIcon, EyeIcon, EyeOffIcon } from "./icons";

/** Tauri 命令抛出的错误序列化为 { message }，提取可读文案 */
function errText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

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

  // ---- 按 Base URL 自动建议名称 ----
  const nameSuggestion = useMemo(
    () => suggestNameFromBaseUrl(form.baseUrl),
    [form.baseUrl]
  );
  // 最近一次通过 Tab 自动填入的值：名称仍等于它说明用户没手动改过，
  // Base URL 变化后可继续跟随新建议
  const autoFilledName = useRef<string | null>(null);
  const showNameHint =
    nameSuggestion !== null &&
    form.name !== nameSuggestion &&
    (form.name.trim() === "" || form.name === autoFilledName.current);

  const acceptNameSuggestion = () => {
    if (nameSuggestion) {
      autoFilledName.current = nameSuggestion;
      set("name", nameSuggestion);
    }
  };

  // ---- 测速并获取模型 ----
  const [fetching, setFetching] = useState(false);
  const [fetchLatency, setFetchLatency] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);

  const canFetch =
    form.baseUrl.trim() !== "" &&
    (form.authType === "none" || form.apiKey.trim() !== "");

  const resetFetch = () => {
    setFetchLatency(null);
    setFetchError(null);
    setFetchedModels([]);
  };

  const runFetchModels = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const result = await fetchModels(
        form.baseUrl.trim(),
        form.authType,
        form.apiKey
      );
      setFetchLatency(result.latencyMs);
      setFetchedModels(result.models);
    } catch (e) {
      resetFetch();
      setFetchError(errText(e));
    } finally {
      setFetching(false);
    }
  };

  // 勾选状态即 form.models 成员关系，保存时无需额外同步
  const toggleModel = (model: string) => {
    set(
      "models",
      form.models.includes(model)
        ? form.models.filter((m) => m !== model)
        : [...form.models, model]
    );
  };

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
            onKeyDown={(e) => {
              if (e.key === "Tab" && showNameHint) {
                e.preventDefault();
                acceptNameSuggestion();
              }
            }}
            autoFocus
          />
          {showNameHint && nameSuggestion && (
            <div className="field-hint">按 Tab 填入：{nameSuggestion}</div>
          )}
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
            onChange={(e) => {
              set("baseUrl", e.target.value);
              resetFetch();
            }}
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
              {showKey ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
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
          {canFetch && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 6,
              }}
            >
              <button
                className="btn btn-sm"
                onClick={runFetchModels}
                disabled={fetching}
              >
                {fetching ? <span className="spinner" /> : <BoltIcon size={13} />}
                测速并获取模型
              </button>
              {fetchLatency !== null && !fetching && (
                <span
                  className="status-with-dot speed-ok"
                  style={{ fontSize: 12 }}
                >
                  <span className="status-dot" />
                  连通 · {fetchLatency}ms
                </span>
              )}
            </div>
          )}
          {fetchError && (
            <div className="field-hint speed-fail">获取失败：{fetchError}</div>
          )}
          {fetchedModels.length > 0 && (
            <div style={{ marginTop: 6, maxHeight: 180, overflowY: "auto" }}>
              {fetchedModels.map((m) => (
                <label
                  key={m}
                  className={`check-row${form.models.includes(m) ? " checked" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={form.models.includes(m)}
                    onChange={() => toggleModel(m)}
                  />
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                    {m}
                  </span>
                </label>
              ))}
            </div>
          )}
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
