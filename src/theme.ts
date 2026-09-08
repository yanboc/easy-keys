// 深浅色主题：localStorage 持久化，默认跟随系统；通过 document[data-theme] 切换 CSS 变量。
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "tokey-theme";
const listeners = new Set<() => void>();

function load(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* localStorage 不可用时跟随系统 */
  }
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

let current: Theme = load();

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(theme: Theme) {
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* 忽略持久化失败 */
  }
  apply(theme);
  listeners.forEach((f) => f());
}

export function toggleTheme() {
  setTheme(current === "dark" ? "light" : "dark");
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    getTheme
  );
}

// 模块加载即应用一次，避免首屏闪烁
apply(current);
