import { useEffect, useRef, useState } from "react";
import type { Money, MustDo, Offer, Settings } from "../lib/schema";
import { daysUntil, formatDaysLeft } from "../lib/countdown";
import { formatDate, formatMoney } from "../lib/format";
import { getSettings } from "../lib/db";
import { exportNodeToImage, safeFilename } from "../lib/exportImage";
import { ShareCard } from "./ShareCard";
import { MoneyEditor } from "./MoneyEditor";
import { applyResearch, pruneInfoGaps, researchOffer } from "../lib/llm";

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
  const [researching, setResearching] = useState(false);

  const schoolZh = offer.school_zh || offer.school;
  const programZh = offer.program_zh;
  const facultyZh = offer.faculty_zh || offer.faculty;
  const termStartDate = offer.key_dates?.find((k) => k.type === "term_start")?.date;
  const termStartDisplay =
    termStartDate ? formatDate(termStartDate) : offer.term_start_text || null;
  const todos = sortedTodos(offer.must_do ?? []);

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
      const filename = `${safeFilename(schoolZh)}-offer.png`;
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
    flashToast("已保存");
  }

  async function rerunResearch() {
    if (researching) return;
    setResearching(true);
    try {
      const settings = await getSettings();
      if (!settings.apiKey) {
        flashToast("请先在设置中填入 API Key", 3000);
        return;
      }
      if ((settings.provider ?? "google") !== "google") {
        flashToast("仅 Google AI Studio 支持官网查询", 3000);
        return;
      }
      flashToast(`正在查 ${schoolZh} 官网…`, 60000);
      const research = await researchOffer(offer, { apiKey: settings.apiKey });
      if (!research) {
        flashToast("没有从官网查到新内容", 3000);
        return;
      }
      const merged = applyResearch(offer, research);
      await onUpdate(merged);
      const got = [
        research.tuition && "学费",
        research.duration && "学制",
        research.scholarship && "奖学金",
      ]
        .filter(Boolean)
        .join("、");
      flashToast(got ? `已从官网补全：${got}` : "没有从官网查到新内容", 3000);
    } catch (err) {
      console.error(err);
      flashToast("查询失败，请稍后再试", 3000);
    } finally {
      setResearching(false);
    }
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
    flashToast("已保存");
  }

  function flashToast(message: string, ms = 1800) {
    setToast(message);
    setTimeout(() => setToast(null), ms);
  }

  return (
    <div className="fade-up max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-16">
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

      <header className="mb-20">
        <div className="section-label mb-10">
          {offer.country_zh || offer.country || "Offer"}
        </div>

        <p className="text-lg md:text-xl text-ink-700 dark:text-ink-300 font-display font-medium tracking-tight mb-2">
          {offer.applicant_name ? `${offer.applicant_name}，` : ""}恭喜你获得录取。
        </p>
        <p className="text-sm text-ink-500 mb-14">以下是录取的详细信息</p>

        <h1 className="font-display font-medium text-[44px] sm:text-6xl md:text-7xl lg:text-8xl tracking-[-0.04em] leading-[0.95] mb-6">
          {schoolZh}
        </h1>
        {schoolZh !== offer.school && (
          <p className="text-base text-ink-500 tracking-wide">
            {offer.school}
          </p>
        )}
      </header>

      <div className="rule mb-12" />

      <Section label="基本信息">
        <div className="border-y border-ink-100 dark:border-ink-700 divide-y divide-ink-100 dark:divide-ink-700">
          <Fact
            label="录取专业"
            value={programZh ? programZh : offer.program}
            secondary={programZh && offer.program ? offer.program : undefined}
          />
          {facultyZh && (
            <Fact
              label="学院"
              value={facultyZh}
              secondary={
                facultyZh !== offer.faculty ? offer.faculty : undefined
              }
            />
          )}
          {offer.student_category && (
            <Fact label="学生类别" value={offer.student_category} />
          )}
          {termStartDisplay && (
            <Fact
              label="入学时间"
              value={
                termStartDate ? (
                  <span className="inline-flex items-baseline gap-2">
                    <span>{termStartDisplay}</span>
                    <CountdownPill date={termStartDate} />
                  </span>
                ) : (
                  termStartDisplay
                )
              }
            />
          )}
          <Fact
            label="学习时长"
            value={
              editingDuration ? (
                <span className="inline-flex items-center gap-2">
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
                    className="px-3 py-1 bg-ink-100 dark:bg-ink-900 border border-transparent focus:border-ink-900 dark:focus:border-white focus:outline-none text-base w-32"
                  />
                  <button
                    onClick={saveDuration}
                    className="text-sm underline underline-offset-4"
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
                  className="hover:underline underline-offset-4"
                  title="点击修改"
                >
                  {offer.duration}
                </button>
              ) : (
                <button
                  onClick={() => setEditingDuration(true)}
                  className="underline underline-offset-4 text-base"
                >
                  + 添加
                </button>
              )
            }
          />
        </div>
      </Section>

      <Section label="费用">
        <div className="grid md:grid-cols-3 gap-6">
          <FeeBlock
            title="学费"
            money={offer.fees?.tuition}
            school={schoolZh}
            program={offer.program}
            onEdit={() => setEditingFee("tuition")}
          />
          <FeeBlock
            title="留位费"
            money={offer.fees?.deposit}
            school={schoolZh}
            program={offer.program}
            onEdit={() => setEditingFee("deposit")}
          />
          <FeeBlock
            title="奖学金"
            money={offer.fees?.scholarship}
            school={schoolZh}
            program={offer.program}
            onEdit={() => setEditingFee("scholarship")}
          />
        </div>
      </Section>

      {offer.info_gaps && offer.info_gaps.length > 0 && (
        <section className="mb-16 rounded-card border border-amber-300/70 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40 p-6">
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
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={rerunResearch}
              disabled={researching}
              className="text-xs px-3 py-1.5 rounded-full bg-amber-200/70 dark:bg-amber-800/40 text-amber-900 dark:text-amber-100 hover:bg-amber-300/70 dark:hover:bg-amber-800/60 transition-colors disabled:opacity-60"
            >
              {researching ? "查询中…" : `重新查 ${schoolZh} 官网`}
            </button>
            <span className="text-xs text-amber-700/80 dark:text-amber-300/80">
              或点击费用卡片手动修正
            </span>
          </div>
        </section>
      )}

      {(offer.fees?.tuition?.is_estimate || offer.fees?.tuition?.is_partial) &&
        !offer.info_gaps?.length && (
          <div className="mb-12 -mt-4">
            <button
              onClick={rerunResearch}
              disabled={researching}
              className="text-xs px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors disabled:opacity-60"
            >
              {researching ? "查询中…" : `重新查 ${schoolZh} 官网补全学费`}
            </button>
          </div>
        )}

      {offer.conditions && offer.conditions.length > 0 && (
        <Section label="录取条件">
          <ol className="space-y-5">
            {offer.conditions.map((c, i) => (
              <li key={i} className="flex items-start gap-4">
                <span className="text-ink-500 font-medium tabular shrink-0 w-6">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span>{c.item}</span>
                    {c.status === "met" && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">
                        ✓ 已满足
                      </span>
                    )}
                    {c.status === "optional" && (
                      <span className="text-xs text-ink-500">（选做）</span>
                    )}
                  </div>
                  {c.details && (
                    <div className="text-sm text-ink-500 mt-1.5 leading-relaxed whitespace-pre-line">
                      {c.details}
                    </div>
                  )}
                  {c.deadline && (
                    <div className="text-xs text-ink-500 mt-1.5 flex items-baseline gap-2">
                      <span>截止 {formatDate(c.deadline)}</span>
                      <CountdownPill date={c.deadline} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {todos.length > 0 && (
        <Section label="接下来你要做的">
          <ol className="space-y-4">
            {todos.map((m, i) => (
              <li key={i} className="card p-5 flex items-start gap-4">
                <span className="text-ink-500 font-medium tabular shrink-0 w-6">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={`font-medium ${
                        m.priority === "high" ? "text-red-600 dark:text-red-400" : ""
                      }`}
                    >
                      {m.action}
                    </span>
                    {m.priority === "high" && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        紧急
                      </span>
                    )}
                  </div>
                  {m.details && (
                    <div className="text-sm text-ink-500 mt-1.5 leading-relaxed whitespace-pre-line">
                      {m.details}
                    </div>
                  )}
                  {m.deadline && (
                    <div className="text-sm text-ink-500 mt-1.5 flex items-baseline gap-2">
                      <span>截止 {formatDate(m.deadline)}</span>
                      <CountdownPill date={m.deadline} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {offer.notes && offer.notes.length > 0 && (
        <Section label="重要备注">
          <ul className="space-y-3">
            {offer.notes.map((n, i) => (
              <li key={i} className="flex items-start gap-3 text-ink-700 dark:text-ink-300 leading-relaxed">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-ink-500 shrink-0" />
                <span className="flex-1">{n}</span>
              </li>
            ))}
          </ul>
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
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-ink-900 dark:bg-white text-white dark:text-ink-900 px-5 py-3 text-sm fade-up z-50 tracking-wide">
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
    <section className="mb-20">
      <h2 className="section-label mb-8">{label}</h2>
      {children}
    </section>
  );
}

function Fact({
  label,
  value,
  secondary,
}: {
  label: string;
  value: React.ReactNode;
  secondary?: string;
}) {
  return (
    <div className="py-5 flex items-baseline gap-8">
      <div className="text-sm text-ink-500 w-24 shrink-0 tracking-wide">
        {label}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base leading-snug">{value}</div>
        {secondary && (
          <div className="text-xs text-ink-500 mt-1.5 tracking-wide">
            {secondary}
          </div>
        )}
      </div>
    </div>
  );
}

function CountdownPill({ date }: { date: string }) {
  const days = daysUntil(date);
  const d = formatDaysLeft(days);
  if (d.value === "—") return null;
  const overdue = days < 0;
  return (
    <span
      className={`text-xs tabular ${
        overdue
          ? "text-red-500"
          : days <= 14
          ? "text-amber-600 dark:text-amber-400"
          : "text-ink-500"
      }`}
    >
      {overdue ? "已过 " : "还剩 "}
      {d.value}
      {d.unit && ` ${d.unit}`}
    </span>
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
  const isDeposit = title === "留位费";

  return (
    <div
      onClick={onEdit}
      className="group p-6 border border-ink-100 dark:border-ink-700 hover:border-ink-900 dark:hover:border-white transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="section-label">{title}</div>
        <div className="flex items-center gap-1.5">
          {verified && <Badge tone="green">已校对</Badge>}
          {partial && <Badge tone="amber">首期 / 不完整</Badge>}
          {estimate && <Badge tone="amber">估算</Badge>}
          <span className="text-ink-300 dark:text-ink-700 text-[10px] uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
            编辑
          </span>
        </div>
      </div>
      <div className="mt-4 text-3xl font-display font-medium tabular tracking-tight">
        {showApprox && value !== "—" ? `≈ ${value}` : value}
      </div>
      {money?.note && (
        <div className="mt-3 text-xs text-ink-500 leading-relaxed">
          {money.note}
        </div>
      )}
      {money && money.amount > 0 && (
        money.source ? (
          <a
            href={money.source}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-4 inline-flex items-center gap-1 text-xs underline underline-offset-4 text-ink-500 hover:text-ink-900 dark:hover:text-white"
          >
            via {hostOf(money.source)} ↗
          </a>
        ) : isDeposit ? (
          <div className="mt-4 text-xs text-ink-500">
            请在 offer 中再次核对
          </div>
        ) : (
          <a
            href={buildVerifyUrl(school, program, title)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-4 inline-flex items-center gap-1 text-xs underline underline-offset-4 text-ink-500 hover:text-ink-900 dark:hover:text-white"
          >
            去官网核对 ↗
          </a>
        )
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

function sortedTodos(todos: MustDo[]): MustDo[] {
  const PRIORITY = { high: 0, medium: 1, low: 2 } as const;
  return [...todos].sort((a, b) => {
    if (a.deadline && b.deadline) {
      const da = daysUntil(a.deadline);
      const db = daysUntil(b.deadline);
      if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
    }
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
    return PRIORITY[a.priority] - PRIORITY[b.priority];
  });
}
