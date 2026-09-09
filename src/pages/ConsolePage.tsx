import * as api from "../api";
import { CONSOLE_LINKS } from "../data/console-links";
import { t, useLang } from "../i18n";

/** 控制台：各家提供商的按量付费 / Coding Plan 购买与管理入口（外链，系统浏览器打开） */
export default function ConsolePage() {
  useLang();
  const open = (url: string) => api.openUrl(url).catch(() => {});

  return (
    <div>
      <div className="page-title">{t("控制台")}</div>
      <div className="page-desc">
        {t("各家提供商的后台入口：左侧按量付费（充值/用量/密钥管理），右侧 Coding / Token Plan 订阅。")}
      </div>

      <div className="card" style={{ maxWidth: 560, padding: 0, overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "30%" }}>{t("提供商 / 项目")}</th>
              <th style={{ width: "35%" }}>{t("按量付费")}</th>
              <th style={{ width: "35%" }}>Coding / Token Plan</th>
            </tr>
          </thead>
          <tbody>
            {CONSOLE_LINKS.map((p) => (
              <tr key={p.name}>
                <td>
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  {p.note && (
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                      {p.note}
                    </div>
                  )}
                </td>
                <td>
                  <button className="link-cell" onClick={() => open(p.meteredUrl)}>
                    {t("购买 / 管理")}
                  </button>
                </td>
                <td>
                  {p.planUrl ? (
                    <button className="link-cell" onClick={() => open(p.planUrl!)}>
                      {t("购买 / 管理")}
                    </button>
                  ) : (
                    <span style={{ color: "var(--text-faint)" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
