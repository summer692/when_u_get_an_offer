import { useEffect, useState } from "react";
import { getSettings, setSetting } from "../lib/db";
import { DEFAULT_PROVIDER, PROVIDERS } from "../lib/llm";
import type { Provider } from "../lib/schema";
import { useTheme, type ThemeMode } from "../hooks/useTheme";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PROVIDER_META: Record<
  Provider,
  { label: string; keyHint: string; keyUrl: string; placeholder: string }
> = {
  google: {
    label: "Google AI Studio",
    keyHint: "免费层每天可用 1500 次 · 仅存储在你的浏览器中",
    keyUrl: "https://aistudio.google.com/apikey",
    placeholder: "AIza...",
  },
  openrouter: {
    label: "OpenRouter",
    keyHint: "一把 key 通多个模型 · 仅存储在你的浏览器中",
    keyUrl: "https://openrouter.ai/keys",
    placeholder: "sk-or-...",
  },
};

export function SettingsSheet({ open, onClose }: Props) {
  const [provider, setProvider] = useState<Provider>(DEFAULT_PROVIDER);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(PROVIDERS[DEFAULT_PROVIDER].defaultModel);
  const [agencyName, setAgencyName] = useState("");
  const [agencyLogo, setAgencyLogo] = useState<string | undefined>(undefined);
  const [logoError, setLogoError] = useState<string | null>(null);
  const { mode, setMode } = useTheme();

  useEffect(() => {
    if (!open) return;
    getSettings().then((s) => {
      const p = s.provider ?? DEFAULT_PROVIDER;
      setProvider(p);
      setApiKey(s.apiKey ?? "");
      setModel(s.model ?? PROVIDERS[p].defaultModel);
      setAgencyName(s.agencyName ?? "");
      setAgencyLogo(s.agencyLogo);
      setLogoError(null);
    });
  }, [open]);

  async function onLogoFile(file: File | undefined) {
    setLogoError(null);
    if (!file) return;
    if (file.size > 256 * 1024) {
      setLogoError("logo 太大了，请选 256 KB 以内的图片");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    setAgencyLogo(dataUrl);
  }

  function changeProvider(p: Provider) {
    setProvider(p);
    if (!PROVIDERS[p].models.find((m) => m.id === model)) {
      setModel(PROVIDERS[p].defaultModel);
    }
  }

  async function save() {
    await setSetting("provider", provider);
    await setSetting("apiKey", apiKey.trim() || undefined);
    await setSetting("model", model.trim() || PROVIDERS[provider].defaultModel);
    await setSetting("agencyName", agencyName.trim() || undefined);
    await setSetting("agencyLogo", agencyLogo || undefined);
    onClose();
  }

  if (!open) return null;

  const meta = PROVIDER_META[provider];
  const config = PROVIDERS[provider];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-lg bg-white dark:bg-ink-900 rounded-t-3xl md:rounded-card p-8 md:p-10 fade-up max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-display font-semibold">设置</h2>
          <button
            onClick={onClose}
            className="text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 text-2xl leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="space-y-8">
          <Field label="服务商">
            <div className="flex gap-1 p-1 rounded-full bg-ink-100 dark:bg-black w-fit">
              {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => changeProvider(p)}
                  className={`px-5 py-2 rounded-full text-sm transition-all ${
                    provider === p
                      ? "bg-white dark:bg-ink-700 shadow-sm"
                      : "text-ink-500"
                  }`}
                >
                  {PROVIDER_META[p].label}
                </button>
              ))}
            </div>
          </Field>

          <Field label={`${meta.label} API Key`} hint={meta.keyHint}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={meta.placeholder}
              className="w-full px-4 py-3 rounded-xl bg-ink-100 dark:bg-black border border-transparent focus:border-accent focus:outline-none transition-colors"
            />
            <a
              href={meta.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-accent hover:underline mt-2 inline-block"
            >
              获取 {meta.label} key →
            </a>
          </Field>

          <Field label="模型">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-ink-100 dark:bg-black border border-transparent focus:border-accent focus:outline-none transition-colors"
            >
              {config.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.note ? ` · ${m.note}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="分享图品牌"
            hint="设置后，导出的 offer 分享图右上角会带上你的公司名 / logo，页脚也会标注「由 XX 整理」"
          >
            <input
              type="text"
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              placeholder="例如：星辰留学"
              className="w-full px-4 py-3 rounded-xl bg-ink-100 dark:bg-black border border-transparent focus:border-accent focus:outline-none transition-colors"
            />
            <div className="flex items-center gap-3 mt-3">
              {agencyLogo && (
                <div className="w-12 h-12 rounded-lg bg-white dark:bg-ink-700 border border-ink-100 dark:border-ink-700 flex items-center justify-center overflow-hidden">
                  <img
                    src={agencyLogo}
                    alt="logo"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}
              <label className="btn-ghost text-sm cursor-pointer">
                {agencyLogo ? "更换 logo" : "上传 logo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => onLogoFile(e.target.files?.[0])}
                />
              </label>
              {agencyLogo && (
                <button
                  onClick={() => setAgencyLogo(undefined)}
                  className="text-xs text-ink-500 hover:text-red-500 transition-colors"
                >
                  移除
                </button>
              )}
            </div>
            {logoError && (
              <div className="text-xs text-red-500 mt-2">{logoError}</div>
            )}
          </Field>

          <Field label="外观">
            <div className="flex gap-1 p-1 rounded-full bg-ink-100 dark:bg-black w-fit">
              {(["system", "light", "dark"] as ThemeMode[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setMode(t)}
                  className={`px-5 py-2 rounded-full text-sm transition-all ${
                    mode === t
                      ? "bg-white dark:bg-ink-700 shadow-sm"
                      : "text-ink-500"
                  }`}
                >
                  {t === "system" ? "跟随系统" : t === "light" ? "浅色" : "深色"}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-10 flex justify-end">
          <button onClick={save} className="btn-primary">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      {children}
      {hint && <div className="text-xs text-ink-500 mt-2">{hint}</div>}
    </div>
  );
}
