import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import * as api from "./api";
import type { ApiKeyRecord, BiometricStatus } from "./types";
import {
  BoltIcon,
  BoxIcon,
  CompassIcon,
  FingerprintIcon,
  GearIcon,
  GitHubIcon,
  GlobeIcon,
  KeyIcon,
  MoonIcon,
  SunIcon,
  type IconProps,
} from "./components/icons";
import { t, useLang, setLang, type Lang } from "./i18n";
import { useTheme, toggleTheme } from "./theme";
import KeyListPage from "./pages/KeyListPage";
import SpeedTestPage from "./pages/SpeedTestPage";
import ExportPage from "./pages/ExportPage";
import ConsolePage from "./pages/ConsolePage";
import SettingsPage from "./pages/SettingsPage";

type Page = "keys" | "speedtest" | "export" | "console" | "settings";

type VaultState = "checking" | "need-create" | "locked" | "unlocked";

const GITHUB_URL = "https://github.com/yanboc/tokey";

// 解锁页用小窗：刚好包裹一个输入控件；解锁后恢复主界面尺寸
const LOCK_WIN = { w: 360, h: 250, minW: 320, minH: 220 };
const MAIN_WIN = { w: 800, h: 560, minW: 784, minH: 520 };

// label 为 i18n 字典 key（中文原文），渲染时经 t() 翻译
const NAV_ITEMS: { id: Page; label: string; icon: ComponentType<IconProps> }[] = [
  { id: "keys", label: "密钥管理", icon: KeyIcon },
  { id: "speedtest", label: "连通性测速", icon: BoltIcon },
  { id: "export", label: "导出 / 导入", icon: BoxIcon },
  { id: "console", label: "控制台", icon: CompassIcon },
  { id: "settings", label: "设置", icon: GearIcon },
];

const LANG_OPTIONS: { id: Lang; label: string }[] = [
  { id: "zh", label: "简体中文" },
  { id: "en", label: "English" },
];

function LockScreen({
  mode,
  onUnlock,
  onBiometricUnlock,
}: {
  mode: "create" | "unlock";
  onUnlock: (password: string) => void;
  onBiometricUnlock: (records: ApiKeyRecord[]) => void;
}) {
  useLang();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  // 生物识别失败/取消后，把生物识别按钮替换为主密码输入框
  const [bioFailed, setBioFailed] = useState(false);
  const autoTriggered = useRef(false);
  // 在途守卫：同一时刻只允许一次系统验证
  const bioInFlight = useRef(false);

  const biometricReady = !!(biometric?.available && biometric?.enabled) && !bioFailed;

  const runBiometricUnlock = useCallback(async () => {
    if (bioInFlight.current) return;
    bioInFlight.current = true;
    setError("");
    setBioBusy(true);
    try {
      const records = await api.biometricUnlock();
      onBiometricUnlock(records);
    } catch {
      // 取消 / 失败后降级为主密码输入（按钮被替换掉）
      setError(t("生物识别未完成，可使用主密码解锁"));
      setBioFailed(true);
    } finally {
      bioInFlight.current = false;
      setBioBusy(false);
    }
  }, [onBiometricUnlock]);

  useEffect(() => {
    if (mode !== "unlock") return;
    let cancelled = false;
    api
      .biometricStatus()
      .then((s) => {
        if (cancelled) return;
        setBiometric(s);
        // 进入解锁页自动触发一次系统验证（仅挂载后一次）
        if (s.available && s.enabled && !autoTriggered.current) {
          autoTriggered.current = true;
          runBiometricUnlock();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode, runBiometricUnlock]);

  const submit = async () => {
    setError("");
    if (mode === "create" && password.length < 8) {
      setError(t("主密码至少需要 8 位"));
      return;
    }
    if (mode === "create" && password !== confirm) {
      setError(t("两次输入的密码不一致"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        await api.vaultCreate(password, confirm);
      }
      onUnlock(password);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock-screen">
      <form
        className="lock-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {biometricReady && (
          <button
            className="btn btn-primary"
            type="button"
            disabled={bioBusy}
            onClick={runBiometricUnlock}
          >
            <FingerprintIcon size={16} />{" "}
            {bioBusy
              ? t("验证中…")
              : t("使用 {label} 解锁", { label: t(biometric!.label) })}
          </button>
        )}
        {/* 生物识别可用时只留一个按钮；失败/不可用则替换为密码框 */}
        {!biometricReady && (
          <>
            <input
              className="input"
              type="password"
              placeholder={
                mode === "create" ? t("主密码（至少 8 位）") : t("主密码")
              }
              value={password}
              autoFocus
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                // 显式处理回车：WKWebView / WebDriver 合成事件不一定触发表单隐式提交
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {mode === "create" && (
              <input
                className="input"
                type="password"
                placeholder={t("确认主密码")}
                value={confirm}
                disabled={busy}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            )}
          </>
        )}
        <div className="lock-error">{error}</div>
        {/* 隐藏的提交按钮：让回车触发表单隐式提交（多输入框时浏览器需要 submit 按钮） */}
        <button type="submit" disabled={busy} style={{ display: "none" }} aria-hidden="true" />
      </form>
    </div>
  );
}

export default function App() {
  const lang = useLang();
  const theme = useTheme();
  const [vaultState, setVaultState] = useState<VaultState>("checking");
  const [records, setRecords] = useState<ApiKeyRecord[]>([]);
  const [password, setPassword] = useState("");
  const [page, setPage] = useState<Page>("keys");
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  useEffect(() => {
    (async () => {
      let exists = false;
      try {
        exists = await api.vaultExists();
      } catch {
        setVaultState("need-create");
        return;
      }
      // 关窗即退出进程，不存在可恢复的会话：每次启动都必须重新解锁
      setVaultState(exists ? "locked" : "need-create");
    })();
  }, []);

  // 窗口尺寸随锁定状态联动（tauri.conf 初始尺寸即锁屏小窗，避免启动闪烁）
  useEffect(() => {
    if (vaultState === "checking") return;
    const target =
      vaultState === "unlocked" ? MAIN_WIN : LOCK_WIN;
    api
      .resizeWindow(target.w, target.h, target.minW, target.minH)
      .catch(() => {});
  }, [vaultState]);

  const handleUnlock = useCallback((pwd: string) => {
    api
      .vaultUnlock(pwd)
      .then((rs) => {
        setPassword(pwd);
        setRecords(rs);
        setVaultState("unlocked");
      })
      .catch((e) => {
        alert(t("解锁失败：{e}", { e: String(e) }));
      });
  }, []);

  // 生物识别解锁：主密码留在 Rust 侧会话，不进入前端内存
  const handleBiometricUnlock = useCallback((rs: ApiKeyRecord[]) => {
    setPassword("");
    setRecords(rs);
    setVaultState("unlocked");
  }, []);

  const refreshRecords = useCallback(
    (next?: ApiKeyRecord[]) => {
      if (next) {
        setRecords(next);
        return;
      }
      if (password) {
        api
          .vaultUnlock(password)
          .then(setRecords)
          .catch((e) => alert(t("读取失败：{e}", { e: String(e) })));
      }
    },
    [password]
  );

  if (vaultState === "checking") {
    return (
      <div className="lock-screen">
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  if (vaultState === "need-create" || vaultState === "locked") {
    return (
      <LockScreen
        mode={vaultState === "need-create" ? "create" : "unlock"}
        onUnlock={handleUnlock}
        onBiometricUnlock={handleBiometricUnlock}
      />
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        {NAV_ITEMS.map((item) => {
          const NavIcon = item.icon;
          return (
            <div
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">
                <NavIcon size={16} />
              </span>
              <span>{t(item.label)}</span>
            </div>
          );
        })}
        <div className="sidebar-footer">
          <button
            className="footer-btn"
            title={GITHUB_URL}
            onClick={() => api.openUrl(GITHUB_URL).catch(() => {})}
          >
            <GitHubIcon size={14} />
          </button>
          <button
            className="footer-btn"
            title={theme === "dark" ? t("切换为浅色模式") : t("切换为深色模式")}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <SunIcon size={14} /> : <MoonIcon size={14} />}
          </button>
          <div className="footer-menu-wrap">
            <button
              className="footer-btn"
              title={t("界面语言")}
              onClick={() => setLangMenuOpen((v) => !v)}
            >
              <GlobeIcon size={14} />
            </button>
            {langMenuOpen && (
              <>
                {/* 透明遮罩：点击菜单外任意处关闭 */}
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 49 }}
                  onClick={() => setLangMenuOpen(false)}
                />
                <div className="footer-menu">
                  {LANG_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      className={lang === opt.id ? "active" : ""}
                      onClick={() => {
                        setLang(opt.id);
                        setLangMenuOpen(false);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
      <main className="main">
        {page === "keys" && (
          <KeyListPage
            records={records}
            password={password}
            onRecordsChange={refreshRecords}
          />
        )}
        {page === "speedtest" && <SpeedTestPage records={records} />}
        {page === "export" && (
          <ExportPage
            records={records}
            password={password}
            onImported={() => refreshRecords()}
          />
        )}
        {page === "console" && <ConsolePage />}
        {page === "settings" && (
          <SettingsPage
            password={password}
            onPasswordChanged={(newPwd) =>
              // 生物识别会话下主密码不进入前端内存，保持为空
              setPassword((prev) => (prev === "" ? prev : newPwd))
            }
          />
        )}
      </main>
    </div>
  );
}
