import { useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile widget. Loads Turnstile's JS once, mounts an
 * invisible-or-managed widget into the host div, and emits the token
 * via onToken when verification succeeds.
 *
 * Site key comes from VITE_TURNSTILE_SITE_KEY at build time. If unset,
 * the component renders nothing and never emits a token (used to keep
 * dev / BYOK builds working without Turnstile).
 *
 * Token lifetime is ~5 minutes per Cloudflare docs. We re-render the
 * widget when the previous token has been "used" by setting a
 * resetCounter prop from the parent; the new render generates a fresh
 * challenge.
 */
interface Props {
  resetCounter?: number;
  onToken: (token: string) => void;
}

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || "";
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          appearance?: "always" | "execute" | "interaction-only";
          theme?: "auto" | "light" | "dark";
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script load failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function TurnstileWidget({ resetCounter, onToken }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !hostRef.current || !window.turnstile) return;
        // Clean any previous mount before re-rendering.
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // ignore
          }
          widgetIdRef.current = null;
        }
        widgetIdRef.current = window.turnstile.render(hostRef.current, {
          sitekey: SITE_KEY,
          appearance: "interaction-only",
          theme: "auto",
          callback: (token) => onToken(token),
          "error-callback": () => setError("人机验证失败，请刷新页面重试"),
          "expired-callback": () => {
            // Token expired — silently re-execute.
            if (widgetIdRef.current && window.turnstile) {
              window.turnstile.reset(widgetIdRef.current);
            }
          },
        });
      })
      .catch((err) => {
        console.error("[Yesletter] Turnstile init failed", err);
        setError("人机验证组件加载失败，请检查网络后刷新页面");
      });
    return () => {
      cancelled = true;
    };
  }, [resetCounter, onToken]);

  if (!SITE_KEY) return null;

  return (
    <>
      <div ref={hostRef} />
      {error && (
        <div className="text-xs text-red-500 mt-2" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
