import { useEffect, useRef, useState } from "react";
import type { Money } from "../lib/schema";
import { Modal } from "./Modal";

const CURRENCIES = ["HKD", "USD", "GBP", "EUR", "CNY", "SGD", "AUD", "CAD", "JPY", "KRW"];

interface Props {
  open: boolean;
  title: string;
  initial?: Money | null;
  onClose: () => void;
  onSave: (next: Money | null) => void;
}

export function MoneyEditor({ open, title, initial, onClose, onSave }: Props) {
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("HKD");
  const [period, setPeriod] = useState<"" | "year" | "term" | "total">("");
  const [note, setNote] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(initial?.amount != null ? String(initial.amount) : "");
    setCurrency((initial?.currency as string) || "HKD");
    setPeriod((initial?.period as "year" | "term" | "total" | undefined) || "");
    setNote(initial?.note ?? "");
    setSource(initial?.source ?? "");
    setTimeout(() => firstFieldRef.current?.focus(), 50);
  }, [open, initial]);

  function handleSave() {
    const trimmed = amount.trim();
    if (!trimmed) {
      onSave(null);
      return;
    }
    const num = Number(trimmed.replace(/,/g, ""));
    if (!Number.isFinite(num)) return;
    const next: Money = {
      amount: num,
      currency: currency.trim().toUpperCase() || "HKD",
      ...(period ? { period } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(source.trim() ? { source: source.trim() } : {}),
      manually_edited: true,
      is_partial: false,
      is_estimate: false,
    };
    onSave(next);
  }

  return (
    <Modal open={open} onClose={onClose} variant="sheet" widthClass="w-full md:max-w-md">
      <div className="p-8 md:p-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-semibold">编辑{title}</h2>
          <button
            onClick={onClose}
            className="text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 text-2xl leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-ink-500 mb-1.5">金额</label>
              <input
                ref={firstFieldRef}
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="留空可清除"
                className="w-full px-4 py-3 rounded-xl bg-ink-100 dark:bg-black border border-transparent focus:border-accent focus:outline-none transition-colors tabular"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-500 mb-1.5">币种</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-3 rounded-xl bg-ink-100 dark:bg-black border border-transparent focus:border-accent focus:outline-none transition-colors"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-500 mb-1.5">计费周期</label>
            <div className="flex gap-1 p-1 rounded-full bg-ink-100 dark:bg-black w-fit">
              {[
                { id: "", label: "未指定" },
                { id: "total", label: "总额" },
                { id: "year", label: "年" },
                { id: "term", label: "学期" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id as typeof period)}
                  className={`px-4 py-1.5 rounded-full text-sm transition-all ${
                    period === p.id
                      ? "bg-white dark:bg-ink-700 shadow-sm"
                      : "text-ink-500"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-500 mb-1.5">备注</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：30 学分 × HK$8,500（论文学分免学费）"
              className="w-full px-4 py-3 rounded-xl bg-ink-100 dark:bg-black border border-transparent focus:border-accent focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-500 mb-1.5">
              来源链接（可选）
            </label>
            <input
              type="url"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="https://www.polyu.edu.hk/..."
              className="w-full px-4 py-3 rounded-xl bg-ink-100 dark:bg-black border border-transparent focus:border-accent focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-between gap-3">
          {initial && (
            <button
              onClick={() => onSave(null)}
              className="text-sm text-red-500 hover:text-red-600 transition-colors"
            >
              清除此项
            </button>
          )}
          <div className="ml-auto flex gap-3">
            <button onClick={onClose} className="btn-ghost">取消</button>
            <button onClick={handleSave} className="btn-primary">保存</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
