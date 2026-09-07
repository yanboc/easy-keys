import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import * as api from "./api";
import type { ApiKeyRecord, BiometricStatus } from "./types";
import {
  BoltIcon,
  BoxIcon,
  FingerprintIcon,
  GearIcon,
  KeyIcon,
  LeafIcon,
  type IconProps,
} from "./components/icons";
import KeyListPage from "./pages/KeyListPage";
import SpeedTestPage from "./pages/SpeedTestPage";
import ExportPage from "./pages/ExportPage";
import EnvPage from "./pages/EnvPage";
import SettingsPage from "./pages/SettingsPage";

type Page = "keys" | "speedtest" | "export" | "env" | "settings";

type VaultState = "checking" | "need-create" | "locked" | "unlocked";

const NAV_ITEMS: { id: Page; label: string; icon: ComponentType<IconProps> }[] = [
  { id: "keys", label: "密钥管理", icon: KeyIcon },
  { id: "speedtest", label: "连通性测速", icon: BoltIcon },
  { id: "export", label: "导出 / 导入", icon: BoxIcon },
  { id: "env", label: "环境变量", icon: LeafIcon },
  { id: "settings", label: "设置", icon: GearIcon },
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
      setError("生物识别未完成，可使用主密码解锁");
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
      setError("主密码至少需要 8 位");
      return;
    }
    if (mode === "create" && password !== confirm) {
      setError("两次输入的密码不一致");
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
          {mode === "create" ? "创建加密保险库" : "解锁保险库"}
        </div>
        <div className="lock-sub" style={{ textAlign: "center", marginTop: 6 }}>
          {mode === "create"
            ? "所有 API Key 将使用主密码加密，仅存储在本机"
            : "输入主密码以解锁本地保险库"}
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
            {bioBusy ? "验证中…" : `使用 ${biometric!.label} 解锁`}
          </button>
        )}
        {biometricReady && (
          <div className="lock-sub" style={{ textAlign: "center" }}>
            或使用主密码
          </div>
        )}
        <input
          className="input"
          type="password"
          placeholder="主密码"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === "create" && (
          <input
            className="input"
            type="password"
            placeholder="确认主密码"
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
          {busy ? "处理中…" : mode === "create" ? "创建并进入" : "解锁"}
        </button>
        <div className="lock-sub" style={{ textAlign: "center" }}>
          {biometricReady
            ? "主密码由系统安全存储托管；忘记主密码将无法找回数据"
            : "主密码不会存储在任何地方，忘记将无法找回数据"}
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const [vaultState, setVaultState] = useState<VaultState>("checking");
  const [records, setRecords] = useState<ApiKeyRecord[]>([]);
  const [password, setPassword] = useState("");
  const [page, setPage] = useState<Page>("keys");

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
        alert(`解锁失败：${e}`);
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
          .catch((e) => alert(`读取失败：${e}`));
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
          <span className="logo"><KeyIcon size={17} /></span>
          <span>easy-keys</span>
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
              <span>{item.label}</span>
            </div>
          );
        })}
        <div className="sidebar-footer">
          完全本地运行 · 零联网<br />
          数据加密存储于本机
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
