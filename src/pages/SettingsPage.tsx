import { useEffect, useState } from "react";
import * as api from "../api";
import type { BiometricStatus } from "../types";
import { FingerprintIcon, LockIcon } from "../components/icons";

export default function SettingsPage({
  password,
  onPasswordChanged,
  onLock,
}: {
  password: string;
  onPasswordChanged: (newPwd: string) => void;
  onLock: () => void;
}) {
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [bio, setBio] = useState<BiometricStatus | null>(null);
  const [bioPwd, setBioPwd] = useState("");
  const [bioEnabling, setBioEnabling] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    api
      .biometricStatus()
      .then(setBio)
      .catch(() => {});
  }, []);

  const changePassword = async () => {
    // 生物识别会话下前端不持有主密码，跳过本地比对，由后端验证
    if (password && oldPwd !== password) {
      alert("当前主密码不正确");
      return;
    }
    if (newPwd.length < 8) {
      alert("新主密码至少需要 8 位");
      return;
    }
    if (newPwd !== confirmPwd) {
      alert("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    try {
      await api.vaultChangePassword(oldPwd, newPwd);
      onPasswordChanged(newPwd);
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
      alert("主密码已更新");
    } catch (e) {
      alert(`修改失败：${e}`);
    } finally {
      setBusy(false);
    }
  };

  // 开启：先输入主密码确认（后端会真实解锁一次验证）；关闭：直接删除托管项
  const toggleBiometric = async () => {
    if (!bio) return;
    if (!bio.enabled) {
      setBioEnabling(true);
      return;
    }
    setBioBusy(true);
    try {
      await api.biometricDisable();
      setBio({ ...bio, enabled: false });
    } catch (e) {
      alert(`关闭失败：${e}`);
    } finally {
      setBioBusy(false);
    }
  };

  const confirmBiometricEnable = async () => {
    if (!bio) return;
    if (!bioPwd) {
      alert("请输入主密码");
      return;
    }
    setBioBusy(true);
    try {
      await api.biometricEnable(bioPwd);
      setBioPwd("");
      setBioEnabling(false);
      setBio({ ...bio, enabled: true });
    } catch (e) {
      alert(`启用失败：${e}`);
    } finally {
      setBioBusy(false);
    }
  };

  return (
    <div>
      <div className="page-title">设置</div>
      <div className="page-desc">修改主密码、锁定应用与查看安全信息。</div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="field-label" style={{ fontSize: 14, marginBottom: 14 }}>
          修改主密码
        </div>
        <div className="field">
          <label className="field-label">当前主密码</label>
          <input
            className="input"
            type="password"
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label">新主密码（至少 8 位）</label>
          <input
            className="input"
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label">确认新主密码</label>
          <input
            className="input"
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            className="btn btn-primary"
            onClick={changePassword}
            disabled={busy}
          >
            {busy ? "修改中…" : "更新主密码"}
          </button>
        </div>
      </div>

      {bio?.available && (
        <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
          <div className="field-label" style={{ fontSize: 14, marginBottom: 10 }}>
            生物识别解锁
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.8 }}>
              使用 {bio.label} 快速解锁保险库；主密码由系统安全存储托管，
              读取时由系统强制验证身份。
            </div>
            <button
              className="btn"
              onClick={toggleBiometric}
              disabled={bioBusy}
            >
              <FingerprintIcon size={14} />{" "}
              {bio.enabled ? `关闭 ${bio.label}` : `启用 ${bio.label}`}
            </button>
          </div>
          {bioEnabling && !bio.enabled && (
            <div className="field" style={{ marginTop: 12 }}>
              <label className="field-label">输入主密码以确认启用</label>
              <input
                className="input"
                type="password"
                value={bioPwd}
                onChange={(e) => setBioPwd(e.target.value)}
              />
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  justifyContent: "flex-end",
                  marginTop: 10,
                }}
              >
                <button
                  className="btn"
                  onClick={() => {
                    setBioEnabling(false);
                    setBioPwd("");
                  }}
                >
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  onClick={confirmBiometricEnable}
                  disabled={bioBusy}
                >
                  {bioBusy ? "启用中…" : "确认启用"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="field-label" style={{ fontSize: 14, marginBottom: 10 }}>
          安全
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-danger" onClick={onLock}>
            <LockIcon size={14} /> 锁定应用
          </button>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-faint)",
            marginTop: 12,
            lineHeight: 1.8,
          }}
        >
          锁定后需要重新输入主密码才能查看密钥。
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="field-label" style={{ fontSize: 14, marginBottom: 10 }}>
          关于
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.9 }}>
          <div>easy-keys v0.1.0</div>
          <div>完全本地运行的 AI API Key 管理工具</div>
          <div style={{ marginTop: 4 }}>
            · 密钥经 Argon2id + AES-256-GCM 加密存储在本机
          </div>
          <div>· 应用自身零联网：无遥测、无更新检查、无第三方请求</div>
          <div>· 仅当你主动点击「测速」时才直连你配置的 API 端点</div>
          <div style={{ marginTop: 4, color: "var(--text-faint)" }}>
            请务必备份加密导出文件，主密码丢失后数据无法恢复。
          </div>
        </div>
      </div>
    </div>
  );
}
