import { useEffect, useState } from "react";
import { getSettings, setSetting } from "../lib/db";
import { DEFAULT_MODEL } from "../lib/llm";
import { useTheme, type ThemeMode } from "../hooks/useTheme";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsSheet({ open, onClose }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const { mode, setMode } = useTheme();

  useEffect(() => {
    if (!open) return;
    getSettings().then((s) => {
      setApiKey(s.apiKey ?? "");
      setModel(s.model ?? DEFAULT_MODEL);
    });
  }, [open]);

  async function save() {
    await setSetting("apiKey", apiKey.trim() || undefined);
    await setSetting("model", model.trim() || DEFAULT_MODEL);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-lg bg-white dark:bg-ink-900 rounded-t-3xl md:rounded-card p-8 md:p-10 fade-up"
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
          <Field label="OpenRouter API Key" hint="仅存储在你的浏览器中">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full px-4 py-3 rounded-xl bg-ink-100 dark:bg-black border border-transparent focus:border-accent focus:outline-none transition-colors"
            />
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-accent hover:underline mt-2 inline-block"
            >
              前往 openrouter.ai 获取 key →
            </a>
          </Field>

          <Field label="模型" hint="默认 Gemini 2.5 Flash（免费层）">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-ink-100 dark:bg-black border border-transparent focus:border-accent focus:outline-none transition-colors"
            >
              <option value="google/gemini-2.5-flash">
                Google · Gemini 2.5 Flash（免费层）
              </option>
              <option value="google/gemini-2.5-flash-lite">
                Google · Gemini 2.5 Flash-Lite
              </option>
              <option value="anthropic/claude-haiku-4.5">
                Anthropic · Claude Haiku 4.5
              </option>
              <option value="anthropic/claude-sonnet-4.5">
                Anthropic · Claude Sonnet 4.5
              </option>
              <option value="openai/gpt-4o-mini">OpenAI · GPT-4o mini</option>
            </select>
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
