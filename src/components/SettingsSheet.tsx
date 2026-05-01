import { useEffect, useState } from "react";
import { getSettings, setSetting } from "../lib/db";
import { DEFAULT_PROVIDER, PROVIDERS } from "../lib/llm";
import type { Provider } from "../lib/schema";

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
    keyHint: "免费层每日有限额，超额请切到 Flash-Lite 或明天再试。仅存储在你的浏览器中。",
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

  useEffect(() => {
    if (!open) return;
    getSettings().then((s) => {
      const p = s.provider ?? DEFAULT_PROVIDER;
      setProvider(p);
      setApiKey(s.apiKey ?? "");
      setModel(s.model ?? PROVIDERS[p].defaultModel);
    });
  }, [open]);

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
        className="w-full md:max-w-lg bg-white dark:bg-black rounded-t-2xl md:rounded-card border border-ink-100 dark:border-ink-700 p-8 md:p-10 fade-up max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-display font-medium tracking-tight">
            设置
          </h2>
          <button
            onClick={onClose}
            className="text-ink-500 hover:text-ink-900 dark:hover:text-white text-2xl leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="space-y-8">
          <Field label="服务商">
            <Segmented
              options={(Object.keys(PROVIDERS) as Provider[]).map((p) => ({
                id: p,
                label: PROVIDER_META[p].label,
              }))}
              value={provider}
              onChange={(v) => changeProvider(v as Provider)}
            />
          </Field>

          <Field label={`${meta.label} API Key`} hint={meta.keyHint}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={meta.placeholder}
              className="w-full px-4 py-3 bg-ink-100 dark:bg-ink-900 border border-transparent focus:border-ink-900 dark:focus:border-white focus:outline-none transition-colors"
            />
            <a
              href={meta.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline underline-offset-4 mt-3 inline-block"
            >
              获取 {meta.label} key →
            </a>
          </Field>

          <Field label="模型">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-3 bg-ink-100 dark:bg-ink-900 border border-transparent focus:border-ink-900 dark:focus:border-white focus:outline-none transition-colors"
            >
              {config.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.note ? ` · ${m.note}` : ""}
                </option>
              ))}
            </select>
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

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex border border-ink-100 dark:border-ink-700">
      {options.map((o, i) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-5 py-2 text-sm transition-colors ${
            i > 0 ? "border-l border-ink-100 dark:border-ink-700" : ""
          } ${
            value === o.id
              ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900"
              : "text-ink-700 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-900"
          }`}
        >
          {o.label}
        </button>
      ))}
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
      <label className="section-label block mb-3">{label}</label>
      {children}
      {hint && (
        <div className="text-xs text-ink-500 mt-3 leading-relaxed">{hint}</div>
      )}
    </div>
  );
}
