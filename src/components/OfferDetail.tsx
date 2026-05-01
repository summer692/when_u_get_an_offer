import { useEffect, useRef, useState } from "react";
import type { Money, Offer, Settings } from "../lib/schema";
import { daysUntil, formatDaysLeft } from "../lib/countdown";
import { formatDate, formatMoney } from "../lib/format";
import { getSettings } from "../lib/db";
import { exportNodeToImage, safeFilename } from "../lib/exportImage";
import { ShareCard } from "./ShareCard";
import { MoneyEditor } from "./MoneyEditor";
import { pruneInfoGaps } from "../lib/llm";

type FeeKey = "tuition" | "deposit" | "scholarship";

interface Props {
  offer: Offer;
  onBack: () => void;
  onDelete: () => void;
  onUpdate: (offer: Offer) => Promise<void> | void;
}

export function OfferDetail({ offer, onBack, onDelete, onUpdate }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [agency, setAgency] = useState<
    Pick<Settings, "agencyName" | "agencyLogo">
  >({});
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editingFee, setEditingFee] = useState<FeeKey | null>(null);
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationDraft, setDurationDraft] = useState(offer.duration ?? "");

  useEffect(() => {
    getSettings().then((s) =>
      setAgency({ agencyName: s.agencyName, agencyLogo: s.agencyLogo }),
    );
  }, []);

  useEffect(() => {
    setDurationDraft(offer.duration ?? "");
  }, [offer.duration]);

  async function handleExport() {
    if (!cardRef.current || exporting) return;
    setExporting(true);
    try {
      const fresh = await getSettings();
      setAgency({ agencyName: fresh.agencyName, agencyLogo: fresh.agencyLogo });
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const filename = `${safeFilename(offer.school)}-offer.png`;
      const result = await exportNodeToImage(cardRef.current, filename);
      setToast(result.mode === "shared" ? "已分享" : "已保存图片");
    } catch (err) {
      console.error(err);
      setToast("导出失败，请重试");
    } finally {
      setExporting(false);
      setTimeout(() => setToast(null), 2400);
    }
  }

  async function saveFee(key: FeeKey, next: Money | null) {
    const fees = { ...(offer.fees ?? {}) };
    if (next) fees[key] = next;
    else delete fees[key];
    const updated: Offer = { ...offer, fees };
    updated.info_gaps = pruneInfoGaps(updated);
    await onUpdate(updated);
    setEditingFee(null);
    setToast("已保存");
    setTimeout(() => setToast(null), 1800);
  }

  async function saveDuration() {
    const next = durationDraft.trim() || undefined;
    if (next === (offer.duration ?? undefined)) {
      setEditingDuration(false);
      return;
    }
    const updated: Offer = { ...offer, duration: next };
    updated.info_gaps = pruneInfoGaps(updated);
    await onUpdate(updated);
    setEditingDuration(false);
    setToast("已保存");
    setTimeout(() => setToast(null), 1800);
  }

  return (
    <div className="fade-up max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-10">
        <button onClick={onBack} className="btn-ghost -ml-3">
          ← 返回
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="btn-primary disabled:opacity-60"
        >
          {exporting ? "生成中…" : "导出分享图"}
        </button>
      </div>

      <header className="mb-16">
        <div className="section-label">{offer.country || "—"}</div>
        <h1 className="mt-4 font-display font-semibold text-5xl md:text-6xl tracking-tight">
          {offer.school}
        </h1>
        <p className="mt-4 text-xl md:text-2xl text-ink-500 flex flex-wrap items-baseline gap-x-3">
          <span>{offer.program}</span>
          {offer.degree && <span>· {offer.degree}</span>}
          {editingDuration ? (
            <span className="inline-flex items-center gap-2">
              ·
              <input
                autoFocus
                value={durationDraft}
                onChange={(e) => setDurationDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveDuration();
                  if (e.key === "Escape") {
                    setEditingDuration(false);
                    setDurationDraft(offer.duration ?? "");
                  }
                }}
                placeholder="例如 1.5 年"
                className="px-3 py-1 rounded-lg bg-ink-100 dark:bg-black border border-transparent focus:border-accent focus:outline-none text-base w-32"
              />
              <button
                onClick={saveDuration}
                className="text-sm text-accent hover:underline"
              >
                保存
              </button>
              <button
                onClick={() => {
                  setEditingDuration(false);
                  setDurationDraft(offer.duration ?? "");
                }}
                className="text-sm text-ink-500 hover:text-ink-900 dark:hover:text-ink-100"
              >
                取消
              </button>
            </span>
          ) : offer.duration ? (
            <button
              onClick={() => setEditingDuration(true)}
              className="hover:text-ink-900 dark:hover:text-ink-100 transition-colors"
              title="点击修改"
            >
              · {offer.duration}
            </button>
          ) : (
            <button
              onClick={() => setEditingDuration(true)}
              className="text-sm text-accent hover:underline"
            >
              · 添加学制
            </button>
          )}
        </p>
      </header>

      {offer.info_gaps && offer.info_gaps.length > 0 && (
        <section className="mb-12 rounded-card border border-amber-300/70 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40 p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300 font-medium mb-3">
            需要核实
          </div>
          <ul className="space-y-2 text-amber-900 dark:text-amber-100">
            {offer.info_gaps.map((g, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span>{g}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-amber-700/80 dark:text-amber-300/80">
            点击下方任意费用卡片可手动修正。
          </p>
        </section>
      )}

      <Section label="关键日期">
        {offer.key_dates?.length ? (
          <div className="divide-y divide-ink-100 dark:divide-ink-700">
            {offer.key_dates.map((k, i) => {
              const d = formatDaysLeft(daysUntil(k.date));
              const overdue = daysUntil(k.date) < 0;
              return (
                <div
                  key={i}
                  className="py-5 flex items-baseline justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="text-lg font-medium truncate">
                      {k.label}
                    </div>
                    <div className="text-sm text-ink-500">
                      {formatDate(k.date)}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 tabular text-xl font-semibold ${
                      overdue ? "text-red-500" : "text-accent"
                    }`}
                  >
                    {d.value}
                    <span className="ml-1 text-sm font-normal text-ink-500">
                      {d.unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty />
        )}
      </Section>

      <Section label="费用">
        <div className="grid md:grid-cols-3 gap-6">
          <FeeBlock
            title="学费"
            money={offer.fees?.tuition}
            school={offer.school}
            program={offer.program}
            onEdit={() => setEditingFee("tuition")}
          />
          <FeeBlock
            title="留位费"
            money={offer.fees?.deposit}
            school={offer.school}
            program={offer.program}
            onEdit={() => setEditingFee("deposit")}
          />
          <FeeBlock
            title="奖学金"
            money={offer.fees?.scholarship}
            school={offer.school}
            program={offer.program}
            onEdit={() => setEditingFee("scholarship")}
          />
        </div>
      </Section>

      {offer.must_do && offer.must_do.length > 0 && (
        <Section label="必做事项">
          <ul className="space-y-3">
            {offer.must_do.map((m, i) => (
              <li key={i} className="card p-5 flex items-start gap-4">
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    m.priority === "high"
                      ? "bg-red-500"
                      : m.priority === "medium"
                      ? "bg-accent"
                      : "bg-ink-300"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{m.action}</div>
                  {m.deadline && (
                    <div className="text-sm text-ink-500 mt-1">
                      截止 {formatDate(m.deadline)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {offer.conditions && offer.conditions.length > 0 && (
        <Section label="录取条件">
          <ul className="space-y-2">
            {offer.conditions.map((c, i) => (
              <li key={i} className="flex items-start gap-3 py-2">
                <span className="text-ink-500 shrink-0">
                  {c.status === "met" ? "✓" : "○"}
                </span>
                <div className="flex-1">
                  <div>{c.item}</div>
                  {c.deadline && (
                    <div className="text-xs text-ink-500 mt-0.5">
                      截止 {formatDate(c.deadline)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {offer.raw_highlights && offer.raw_highlights.length > 0 && (
        <Section label="原文摘录">
          <div className="space-y-3">
            {offer.raw_highlights.map((h, i) => (
              <blockquote
                key={i}
                className="border-l-2 border-accent pl-5 py-1 text-ink-700 dark:text-ink-300 italic"
              >
                {h}
              </blockquote>
            ))}
          </div>
        </Section>
      )}

      <div className="mt-24 pt-8 border-t border-ink-100 dark:border-ink-700">
        <button
          onClick={onDelete}
          className="text-sm text-red-500 hover:text-red-600 transition-colors"
        >
          删除这个 offer
        </button>
      </div>

      <MoneyEditor
        open={editingFee !== null}
        title={
          editingFee === "tuition"
            ? "学费"
            : editingFee === "deposit"
            ? "留位费"
            : "奖学金"
        }
        initial={editingFee ? offer.fees?.[editingFee] ?? null : null}
        onClose={() => setEditingFee(null)}
        onSave={(next) => editingFee && saveFee(editingFee, next)}
      />

      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: -10000,
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        <ShareCard
          ref={cardRef}
          offer={offer}
          agencyName={agency.agencyName}
          agencyLogo={agency.agencyLogo}
        />
      </div>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-ink-900 dark:bg-white text-white dark:text-ink-900 px-5 py-3 rounded-full text-sm shadow-lg fade-up z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-16">
      <h2 className="section-label mb-6">{label}</h2>
      {children}
    </section>
  );
}

function FeeBlock({
  title,
  money,
  school,
  program,
  onEdit,
}: {
  title: string;
  money?: Money | null;
  school: string;
  program: string;
  onEdit: () => void;
}) {
  const value = formatMoney(money);
  const verified = money?.manually_edited;
  const partial = money?.is_partial && !verified;
  const estimate = money?.is_estimate && !verified && !partial;
  const showApprox = estimate;
  const verifyUrl = money?.source ?? buildVerifyUrl(school, program, title);

  return (
    <div
      onClick={onEdit}
      className="card p-6 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg transition-all group"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-ink-500">{title}</div>
        <div className="flex items-center gap-1.5">
          {verified && (
            <Badge tone="green">✓ 已校对</Badge>
          )}
          {partial && <Badge tone="amber">首期 / 不完整</Badge>}
          {estimate && <Badge tone="amber">估算</Badge>}
          <span className="text-ink-300 dark:text-ink-700 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
            点击编辑
          </span>
        </div>
      </div>
      <div className="mt-2 text-2xl font-display font-semibold tabular">
        {showApprox && value !== "—" ? `≈ ${value}` : value}
      </div>
      {money?.note && (
        <div className="mt-2 text-xs text-ink-500">{money.note}</div>
      )}
      {money && money.amount > 0 && (
        <a
          href={verifyUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          {money.source ? `via ${hostOf(money.source)}` : "去官网核对"} ↗
        </a>
      )}
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "amber" | "green";
}) {
  const cls =
    tone === "green"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${cls}`}
    >
      {children}
    </span>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function buildVerifyUrl(school: string, program: string, title: string): string {
  const q = `${school} ${program} ${title === "学费" ? "tuition fee" : title} site:edu OR site:edu.hk OR site:ac.uk`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function Empty() {
  return <div className="text-ink-500">—</div>;
}
