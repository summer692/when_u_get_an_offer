import { useEffect, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { getSettings } from "../lib/db";
import { AgencyEditor } from "./AgencyEditor";

interface Props {
  onOpenSettings: () => void;
}

export function TopBar({ onOpenSettings }: Props) {
  const { mode, setMode } = useTheme();
  const [agencyOpen, setAgencyOpen] = useState(false);
  const [agencyName, setAgencyName] = useState<string | undefined>(undefined);
  const [agencyLogo, setAgencyLogo] = useState<string | undefined>(undefined);

  useEffect(() => {
    refreshAgency();
  }, []);

  async function refreshAgency() {
    const s = await getSettings();
    setAgencyName(s.agencyName);
    setAgencyLogo(s.agencyLogo);
  }

  function toggleTheme() {
    setMode(isDark() ? "light" : "dark");
  }

  function isDark(): boolean {
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  return (
    <>
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/80 dark:bg-black/70 border-b border-ink-100 dark:border-ink-700">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-medium text-base tracking-tight">
            <span>◉</span>
            <span>YesLetter</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAgencyOpen(true)}
              className="flex items-center gap-2 px-3 h-9 text-xs text-ink-700 dark:text-ink-300 hover:text-ink-900 dark:hover:text-white transition-colors"
              title="分享图品牌"
            >
              {agencyLogo ? (
                <img
                  src={agencyLogo}
                  alt="logo"
                  className="w-5 h-5 object-contain"
                />
              ) : (
                <BrandIcon />
              )}
              <span className="hidden sm:inline tracking-wide">
                {agencyName || "YesLetter"}
              </span>
            </button>
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center w-9 h-9 text-ink-700 dark:text-ink-300 hover:text-ink-900 dark:hover:text-white transition-colors"
              title={isDark() ? "切换到浅色" : "切换到深色"}
            >
              {isDark() ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              onClick={onOpenSettings}
              className="text-xs text-ink-700 dark:text-ink-300 hover:text-ink-900 dark:hover:text-white transition-colors px-3 h-9 tracking-wide"
            >
              设置
            </button>
          </div>
        </div>
      </header>

      <AgencyEditor
        open={agencyOpen}
        onClose={() => setAgencyOpen(false)}
        onSaved={refreshAgency}
      />
    </>
  );
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function BrandIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}
