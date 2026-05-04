import { useEffect, useState } from "react";
import { clearAllCaches, getSettings, setSetting } from "../lib/db";
import { DEFAULT_PROVIDER, PROVIDERS } from "../lib/llm";
import type { Provider } from "../lib/schema";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PROVIDER_META: Record<
  Provider,
  { label: string; keyHint: string; keyUrl: string; placeholder: string }
> = {
  zhipu: {
    label: "智谱 BigModel",
    keyHint:
      "国内可直连（无需 VPN）。新用户注册即送 2000 万 token，GLM-4V-Flash 完全免费。仅存储在你的浏览器中。",
    keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    placeholder: "xxxxxxxx.xxxxxxxx",
  },
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

/** Regions that match a mainland-China-/HK-/Macau-leaning IANA time zone.
 * Used as a smart default for first-time users — they see the 智谱 option
 * pre-selected with a "国内推荐" badge so they don't have to know they need
 * a domestic-friendly provider. */
const CHINA_TIMEZONES = new Set([
  "Asia/Shanghai",
  "Asia/Chongqing",
  "Asia/Urumqi",
  "Asia/Harbin",
  "Asia/Hong_Kong",
  "Asia/Macau",
  "Asia/Macao",
  "Asia/Kashgar",
]);

function detectDefaultProvider(): Provider {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && CHINA_TIMEZONES.has(tz)) return "zhipu";
  } catch {
    /* fall through */
  }
  return DEFAULT_PROVIDER;
}

export function SettingsSheet({ open, onClose }: Props) {
  const [provider, setProvider] = useState<Provider>(DEFAULT_PROVIDER);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(PROVIDERS[DEFAULT_PROVIDER].defaultModel);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearStatus, setClearStatus] = useState<"idle" | "done">("idle");

  async function handleClearCache() {
    await clearAllCaches();
    setConfirmingClear(false);
    setClearStatus("done");
    setTimeout(() => setClearStatus("idle"), 2400);
  }

  useEffect(() => {
    if (!open) return;
    getSettings().then((s) => {
      // First-time users: pick the provider best suited to their region.
      // Returning users: respect whatever they previously saved.
      const p = s.provider ?? detectDefaultProvider();
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

  const meta = PROVIDER_META[provider];
  const config = PROVIDERS[provider];

  return (
    <Modal open={open} onClose={onClose} variant="sheet">
      <div className="p-8 md:p-10">
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

        <div className="mt-10 pt-8 border-t border-ink-100 dark:border-ink-700">
          <div className="section-label mb-3">本地缓存</div>
          <div className="text-xs text-ink-500 leading-relaxed mb-4">
            为了节省 token、加快重复上传，OfferLens 会在本地保留已经处理过的
            offer 数据（最多 100 条 / 类型，30 天后自动失效）。完全保存在你
            的浏览器里，不会上传。
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setConfirmingClear(true)}
              className="text-xs px-4 py-2 rounded-full border border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-300 hover:border-ink-900 hover:text-ink-900 dark:hover:border-white dark:hover:text-white transition-colors"
            >
              清空缓存
            </button>
            {clearStatus === "done" && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                ✓ 已清空
              </span>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button onClick={save} className="btn-primary">
            保存
          </button>
        </div>

        <ConfirmDialog
          open={confirmingClear}
          tone="danger"
          confirmLabel="确认清空"
          message={
            "清空后重新解析旧 offer 会重新消耗 token，确认清空？\n（已保存的 offer 列表不会受影响）"
          }
          onConfirm={handleClearCache}
          onCancel={() => setConfirmingClear(false)}
        />
      </div>
    </Modal>
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
