import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import * as api from "./api";
import type { ApiKeyRecord, BiometricStatus } from "./types";
import {
  AppIcon,
  BoltIcon,
  BoxIcon,
  FingerprintIcon,
  GearIcon,
  GitHubIcon,
  GlobeIcon,
  KeyIcon,
  LeafIcon,
  MoonIcon,
  SunIcon,
  type IconProps,
} from "./components/icons";
import { t, useLang, setLang, type Lang } from "./i18n";
import { useTheme, toggleTheme } from "./theme";
import KeyListPage from "./pages/KeyListPage";
import SpeedTestPage from "./pages/SpeedTestPage";
import ExportPage from "./pages/ExportPage";
import EnvPage from "./pages/EnvPage";
import SettingsPage from "./pages/SettingsPage";

type Page = "keys" | "speedtest" | "export" | "env" | "settings";

type VaultState = "checking" | "need-create" | "locked" | "unlocked";

const GITHUB_URL = "https://github.com/yanboc/easy-keys";

// label 为 i18n 字典 key（中文原文），渲染时经 t() 翻译
const NAV_ITEMS: { id: Page; label: string; icon: ComponentType<IconProps> }[] = [
  { id: "keys", label: "密钥管理", icon: KeyIcon },
  { id: "speedtest", label: "连通性测速", icon: BoltIcon },
  { id: "export", label: "导出 / 导入", icon: BoxIcon },
  { id: "env", label: "环境变量", icon: LeafIcon },
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
  const autoTriggered = useRef(false);

  const biometricReady = !!(biometric?.available && biometric?.enabled);

  const runBiometricUnlock = useCallback(async () => {
    setError("");
    setBioBusy(true);
    try {
      const records = await api.biometricUnlock();
      onBiometricUnlock(records);
    } catch {
      // 取消 / 失败不弹窗轰炸，仅提示可回退主密码输入
      setError(t("生物识别未完成，可使用主密码解锁"));
    } finally {
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
        // 已启用时进入锁屏自动触发一次系统验证（体验更顺；仅挂载后一次）
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
      <div className="lock-logo"><KeyIcon size={34} /></div>
      <div>
        <div className="lock-title" style={{ textAlign: "center" }}>
          {mode === "create" ? t("创建加密保险库") : t("解锁保险库")}
        </div>
        <div className="lock-sub" style={{ textAlign: "center", marginTop: 6 }}>
          {mode === "create"
            ? t("所有 API Key 将使用主密码加密，仅存储在本机")
            : t("输入主密码以解锁本地保险库")}
        </div>
      </div>
      <form
        className="lock-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {biometricReady && (
          <button
            className="btn btn-primary btn-lg"
            type="button"
            disabled={bioBusy}
            onClick={runBiometricUnlock}
          >
            <FingerprintIcon size={16} />{" "}
            {bioBusy
              ? t("验证中…")
              : t("使用 {label} 解锁", { label: biometric!.label })}
          </button>
        )}
        {biometricReady && (
          <div className="lock-sub" style={{ textAlign: "center" }}>
            {t("或使用主密码")}
          </div>
        )}
        <input
          className="input"
          type="password"
          placeholder={t("主密码")}
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === "create" && (
          <input
            className="input"
            type="password"
            placeholder={t("确认主密码")}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
        <div className="lock-error">{error}</div>
        <button
          className={`btn btn-lg ${biometricReady ? "" : "btn-primary"}`}
          type="submit"
          disabled={busy}
        >
          {busy
            ? t("处理中…")
            : mode === "create"
              ? t("创建并进入")
              : t("解锁")}
        </button>
        <div className="lock-sub" style={{ textAlign: "center" }}>
          {biometricReady
            ? t("主密码由系统安全存储托管；忘记主密码将无法找回数据")
            : t("主密码不会存储在任何地方，忘记将无法找回数据")}
        </div>
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
    api
      .vaultExists()
      .then((exists) => setVaultState(exists ? "locked" : "need-create"))
      .catch(() => setVaultState("need-create"));
  }, []);

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
        <div className="sidebar-brand">
          <AppIcon size={30} />
          <span>tokey</span>
        </div>
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
            className="link-btn"
            title={GITHUB_URL}
            onClick={() => api.openUrl(GITHUB_URL).catch(() => {})}
          >
            <GitHubIcon size={12} /> GitHub
          </button>
          <span style={{ flex: 1 }} />
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
        {page === "env" && (
          <EnvPage records={records} />
        )}
        {page === "settings" && (
          <SettingsPage
            password={password}
            onPasswordChanged={(newPwd) =>
              // 生物识别会话下主密码不进入前端内存，保持为空
              setPassword((prev) => (prev === "" ? prev : newPwd))
            }
            onLock={() => {
              // 通知 Rust 侧清除会话主密码（fire-and-forget）
              api.vaultLock().catch(() => {});
              setPassword("");
              setRecords([]);
              setVaultState("locked");
            }}
          />
        )}
      </main>
    </div>
  );
}
