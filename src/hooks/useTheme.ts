import { useEffect, useState } from "react";
import { getSettings, setSetting } from "../lib/db";

export type ThemeMode = "system" | "light" | "dark";

function applyTheme(mode: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    getSettings().then((s) => {
      const m = (s.theme ?? "system") as ThemeMode;
      setMode(m);
      applyTheme(m);
    });
  }, []);

  useEffect(() => {
    applyTheme(mode);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (mode === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const update = (m: ThemeMode) => {
    setMode(m);
    setSetting("theme", m);
  };

  return { mode, setMode: update };
}
