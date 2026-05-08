import { useEffect, useState } from "react";

/**
 * Bottom-banner prompt that nudges first-time mobile visitors to add
 * YesLetter to their home screen. Shown only when:
 *   - User is on mobile (iOS Safari or Android browser)
 *   - The page isn't already running in PWA standalone mode
 *   - User hasn't dismissed the prompt within the last 7 days
 *
 * Dismissal is persisted in localStorage so a user who said "no" once
 * doesn't get nagged on every visit.
 *
 * The instructions copy is platform-specific because iOS Safari's
 * "Add to Home Screen" lives behind the share sheet, while Android
 * Chrome surfaces it via the menu.
 */

const DISMISS_KEY = "yesletter_install_dismissed_at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SHOW_DELAY_MS = 4000;

type Platform = "ios" | "android" | null;

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iOS Safari, NOT Chrome / Firefox / others on iOS — those can't
  // 'add to home screen' the same way.
  const isIOSSafari =
    /iPad|iPhone|iPod/.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) &&
    /Safari/.test(ua);
  if (isIOSSafari) return "ios";
  if (/Android/.test(ua)) return "android";
  return null;
}

function isStandalone(): boolean {
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari uses a non-standard navigator.standalone flag.
  return !!(navigator as Navigator & { standalone?: boolean }).standalone;
}

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (!ts) return false;
    return Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<Platform>(null);

  useEffect(() => {
    if (isStandalone()) return; // already installed
    if (recentlyDismissed()) return;
    const p = detectPlatform();
    if (!p) return; // desktop / unsupported — skip silently
    setPlatform(p);
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* localStorage disabled / private mode — no-op */
    }
  }

  if (!visible || !platform) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-black border-t border-ink-200 dark:border-ink-700 shadow-lg fade-up">
      <div className="max-w-2xl mx-auto px-4 py-4 flex items-start gap-3">
        <img
          src="/icon-192.png"
          alt=""
          className="w-12 h-12 rounded-xl shrink-0 border border-ink-100 dark:border-ink-700"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-900 dark:text-white">
            把 YesLetter 加到主屏幕
          </p>
          <p className="text-xs text-ink-500 mt-1 leading-relaxed">
            {platform === "ios" ? (
              <>
                点击 Safari 底部 <span className="inline-block">⬆︎</span> 分享按钮 →
                选「添加到主屏幕」，下次直接像 App 一样打开
              </>
            ) : (
              <>
                浏览器菜单 → 选「添加到主屏幕」/「安装应用」，下次直接像 App 一样打开
              </>
            )}
          </p>
        </div>
        <button
          onClick={dismiss}
          className="text-ink-500 hover:text-ink-900 dark:hover:text-white text-2xl leading-none -mt-1 -mr-1 px-2"
          aria-label="关闭"
        >
          ×
        </button>
      </div>
    </div>
  );
}
