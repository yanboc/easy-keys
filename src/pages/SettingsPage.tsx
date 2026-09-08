import { useEffect, useState } from "react";
import * as api from "../api";
import type { BiometricStatus } from "../types";
import { ChevronDownIcon, FingerprintIcon } from "../components/icons";
import { t, useLang } from "../i18n";
import { version as APP_VERSION } from "../../package.json";
import appIconUrl from "../assets/app-icon.png";

export default function SettingsPage({
  password,
  onPasswordChanged,
}: {
  password: string;
  onPasswordChanged: (newPwd: string) => void;
}) {
  useLang();
  const [pwdOpen, setPwdOpen] = useState(false);
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
      alert(t("当前主密码不正确"));
      return;
    }
    if (newPwd.length < 8) {
      alert(t("新主密码至少需要 8 位"));
      return;
    }
    if (newPwd !== confirmPwd) {
      alert(t("两次输入的新密码不一致"));
      return;
    }
    setBusy(true);
    try {
      await api.vaultChangePassword(oldPwd, newPwd);
      onPasswordChanged(newPwd);
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
      alert(t("主密码已更新"));
    } catch (e) {
      alert(t("修改失败：{e}", { e: String(e) }));
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
      alert(t("关闭失败：{e}", { e: String(e) }));
    } finally {
      setBioBusy(false);
    }
  };

  const confirmBiometricEnable = async () => {
    if (!bio) return;
    if (!bioPwd) {
      alert(t("请输入主密码"));
      return;
    }
    setBioBusy(true);
    try {
      await api.biometricEnable(bioPwd);
      setBioPwd("");
      setBioEnabling(false);
      setBio({ ...bio, enabled: true });
    } catch (e) {
      alert(t("启用失败：{e}", { e: String(e) }));
    } finally {
      setBioBusy(false);
    }
  };

  return (
    <div>
      <div className="page-title">{t("设置")}</div>
      <div className="page-desc">
        {t("修改主密码、生物识别解锁与查看应用信息。")}
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <button
          className={`collapse-header ${pwdOpen ? "open" : ""}`}
          onClick={() => setPwdOpen((v) => !v)}
          aria-expanded={pwdOpen}
        >
          <span className="field-label" style={{ fontSize: 14 }}>
            {t("修改主密码")}
          </span>
          <span className="chevron">
            <ChevronDownIcon size={14} />
          </span>
        </button>
        {pwdOpen && (
          <div style={{ marginTop: 14 }}>
            <div className="field">
              <label className="field-label">{t("当前主密码")}</label>
              <input
                className="input"
                type="password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">{t("新主密码（至少 8 位）")}</label>
              <input
                className="input"
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">{t("确认新主密码")}</label>
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
                {busy ? t("修改中…") : t("更新主密码")}
              </button>
            </div>
          </div>
        )}
      </div>

      {bio?.available && (
        <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
          <div className="field-label" style={{ fontSize: 14, marginBottom: 10 }}>
            {t("生物识别解锁")}
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
              {t(
                "使用 {label} 快速解锁保险库；主密码托管于系统钥匙串，仅本应用可读取。",
                { label: t(bio.label) }
              )}
            </div>
            <button
              className="btn"
              onClick={toggleBiometric}
              disabled={bioBusy}
            >
              <FingerprintIcon size={14} />{" "}
              {bio.enabled
                ? t("关闭 {label}", { label: t(bio.label) })
                : t("启用 {label}", { label: t(bio.label) })}
            </button>
          </div>
          {bioEnabling && !bio.enabled && (
            <div className="field" style={{ marginTop: 12 }}>
              <label className="field-label">{t("输入主密码以确认启用")}</label>
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
                  {t("取消")}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={confirmBiometricEnable}
                  disabled={bioBusy}
                >
                  {bioBusy ? t("启用中…") : t("确认启用")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="field-label" style={{ fontSize: 14, marginBottom: 10 }}>
          {t("关于")}
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}
        >
          <img
            src={appIconUrl}
            alt="Tokey"
            width={36}
            height={36}
            draggable={false}
          />
          <div style={{ fontWeight: 600 }}>Tokey v{APP_VERSION}</div>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.9 }}>
          <div>{t("完全本地运行的 AI API Key 管理工具")}</div>
          <div style={{ marginTop: 4 }}>
            {t("· 密钥经 Argon2id + AES-256-GCM 加密存储在本机")}
          </div>
          <div>{t("· 支持 Touch ID / Windows Hello 生物识别解锁")}</div>
          <div>{t("· 应用自身零联网：无遥测、无更新检查、无第三方请求")}</div>
          <div>{t("· 仅当你主动点击「测速」时才直连你配置的 API 端点")}</div>
          <div style={{ marginTop: 4, color: "var(--text-faint)" }}>
            {t("请务必备份加密导出文件，主密码丢失后数据无法恢复。")}
          </div>
        </div>
      </div>
    </div>
  );
}
