import { useEffect, useRef, useState } from "react";
import type { Condition, Money, MustDo, Offer, Settings } from "../lib/schema";
import { daysUntil, formatDaysLeft } from "../lib/countdown";
import { formatDate, formatMoney } from "../lib/format";
import { getSettings } from "../lib/db";
import { exportNodeToImage, safeFilename } from "../lib/exportImage";
import { ShareCard, computeTotalPages } from "./ShareCard";
import { MoneyEditor } from "./MoneyEditor";
import { applyResearch, pruneInfoGaps, researchOffer } from "../lib/llm";

type FeeKey = "tuition" | "deposit" | "scholarship";
type EditKey = "conditions" | "must_do" | "notes";

interface DraftState {
  conditions?: Condition[];
  must_do?: MustDo[];
  notes?: string[];
}

interface Props {
  offer: Offer;
  onBack: () => void;
  onDelete: () => void;
  onUpdate: (offer: Offer) => Promise<void> | void;
}

export function OfferDetail({ offer, onBack, onDelete, onUpdate }: Props) {
  // One ref per export page — each ShareCard renders a fixed 720×1280 frame
  // (which html-to-image scales 1.5× to a 1080×1920 PNG). Multi-page mode
  // produces independent PNGs, not one tall image.
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const feesRef = useRef<HTMLDivElement>(null);
  const totalPages = computeTotalPages(offer);

  function scrollToFees() {
    feesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const [agency, setAgency] = useState<
    Pick<Settings, "agencyName" | "agencyLogo">
  >({});
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editingFee, setEditingFee] = useState<FeeKey | null>(null);
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationDraft, setDurationDraft] = useState(offer.duration ?? "");
  const [researching, setResearching] = useState(false);

  // Inline editing for the three list sections (录取条件 / 接下来要做的 /
  // 重要备注). Each section can be opened independently; pending edits live
  // in `draft` until the user clicks 确认修改 → confirmation dialog → save.
  const [editing, setEditing] = useState<EditKey | null>(null);
  const [draft, setDraft] = useState<DraftState>({});
  const [confirming, setConfirming] = useState<EditKey | null>(null);
  const dirtyKeys = (Object.keys(draft) as EditKey[]).filter(
    (k) => draft[k] !== undefined,
  );
  const isDirty = dirtyKeys.length > 0;

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
    if (exporting) return;
    if (isDirty) {
      flashToast("有未保存的修改，请先点「确认修改」再导出图片", 3500);
      return;
    }
    const pages = cardRefs.current.slice(0, totalPages).filter(Boolean) as HTMLDivElement[];
    if (pages.length === 0) return;
    setExporting(true);
    try {
      const fresh = await getSettings();
      setAgency({ agencyName: fresh.agencyName, agencyLogo: fresh.agencyLogo });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const stamp = timestampStamp();
      const base = `offer_${safeFilename(schoolZh)}_${stamp}`;
      let lastResultMode: "shared" | "downloaded" | null = null;
      for (let i = 0; i < pages.length; i++) {
        const filename =
          pages.length === 1 ? `${base}.png` : `${base}_p${i + 1}.png`;
        // Sequential — most browsers throttle multi-file shares / downloads
        // when fired in parallel, and the user-visible result is identical.
        const result = await exportNodeToImage(pages[i], filename);
        lastResultMode = result.mode;
      }
      setToast(
        pages.length === 1
          ? lastResultMode === "shared"
            ? "已分享"
            : "已保存图片"
          : `已保存 ${pages.length} 张图片（p1 是核心摘要主图）`,
      );
    } catch (err) {
      console.error(err);
      setToast("导出失败，请重试");
    } finally {
      setExporting(false);
      setTimeout(() => setToast(null), 3200);
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

  function startEdit(key: EditKey) {
    if (editing && editing !== key) {
      flashToast("请先保存或取消上一处修改", 2400);
      return;
    }
    const seed =
      key === "conditions"
        ? offer.conditions ?? []
        : key === "must_do"
        ? offer.must_do ?? []
        : offer.notes ?? [];
    // structuredClone so list edits don't mutate the saved offer object.
    setDraft((prev) => ({ ...prev, [key]: structuredClone(seed) }));
    setEditing(key);
  }

  function updateDraft(key: EditKey, next: DraftState[EditKey]) {
    setDraft((prev) => ({ ...prev, [key]: next }));
  }

  function cancelEdit() {
    if (!editing) return;
    setDraft((prev) => {
      const next = { ...prev };
      delete next[editing];
      return next;
    });
    setEditing(null);
  }

  function requestSave() {
    if (!editing) return;
    setConfirming(editing);
  }

  async function commitSave() {
    if (!confirming) return;
    const key = confirming;
    const value = draft[key];
    if (value === undefined) {
      setConfirming(null);
      return;
    }
    const updated: Offer = { ...offer, [key]: value };
    if (key === "conditions" || key === "must_do") {
      updated.info_gaps = pruneInfoGaps(updated);
    }
    await onUpdate(updated);
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setEditing(null);
    setConfirming(null);
    flashToast("修改已保存");
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

      {offer.summary && (
        <section className="mb-20">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="section-label">发给学生</h2>
            <button
              onClick={async () => {
                if (!offer.summary) return;
                try {
                  await navigator.clipboard.writeText(offer.summary);
                  flashToast("已复制，可粘贴发学生");
                } catch {
                  flashToast("复制失败，请手动选择文本", 2400);
                }
              }}
              className="text-xs px-3 py-1.5 rounded-full border border-ink-200 dark:border-ink-700 hover:border-ink-900 dark:hover:border-white transition-colors"
            >
              复制全文
            </button>
          </div>
          <div className="card p-7 md:p-9">
            <p className="text-[15px] md:text-base leading-[1.85] whitespace-pre-line">
              {offer.summary}
            </p>
          </div>
        </section>
      )}

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
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      {termStartDisplay}
                    </span>
                    <CountdownPill date={termStartDate} />
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {termStartDisplay}
                  </span>
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

      <div ref={feesRef} style={{ scrollMarginTop: 80 }}>
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
      </div>

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
            <button
              onClick={scrollToFees}
              className="text-xs text-amber-800 dark:text-amber-200 underline underline-offset-4 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
            >
              或 点击卡片手动修正
            </button>
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

      {(offer.conditions?.length || editing === "conditions") && (
        <EditableSection
          label="录取条件"
          isEditing={editing === "conditions"}
          onStartEdit={() => startEdit("conditions")}
          onCancel={cancelEdit}
          onRequestSave={requestSave}
        >
          {editing === "conditions" ? (
            <EditableConditionList
              items={draft.conditions ?? []}
              onChange={(next) => updateDraft("conditions", next)}
            />
          ) : (
            <ol className="space-y-5">
              {(offer.conditions ?? []).map((c, i) => (
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
                      <div className="text-sm mt-1.5 flex items-baseline gap-2">
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          截止 {formatDate(c.deadline)}
                        </span>
                        <CountdownPill date={c.deadline} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </EditableSection>
      )}

      {(todos.length > 0 || editing === "must_do") && (
        <EditableSection
          label="接下来你要做的"
          isEditing={editing === "must_do"}
          onStartEdit={() => startEdit("must_do")}
          onCancel={cancelEdit}
          onRequestSave={requestSave}
        >
          {editing === "must_do" ? (
            <EditableTodoList
              items={draft.must_do ?? []}
              onChange={(next) => updateDraft("must_do", next)}
            />
          ) : (
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
                      <div className="text-sm mt-1.5 flex items-baseline gap-2">
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          截止 {formatDate(m.deadline)}
                        </span>
                        <CountdownPill date={m.deadline} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </EditableSection>
      )}

      {((offer.notes && offer.notes.length > 0) || editing === "notes") && (
        <EditableSection
          label="重要备注"
          isEditing={editing === "notes"}
          onStartEdit={() => startEdit("notes")}
          onCancel={cancelEdit}
          onRequestSave={requestSave}
        >
          {editing === "notes" ? (
            <EditableNoteList
              items={draft.notes ?? []}
              onChange={(next) => updateDraft("notes", next)}
            />
          ) : (
            <ul className="space-y-3">
              {(offer.notes ?? []).map((n, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-ink-700 dark:text-ink-300 leading-relaxed"
                >
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-ink-500 shrink-0" />
                  <span className="flex-1">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </EditableSection>
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

      <ConfirmDialog
        open={confirming !== null}
        message={
          confirming === "conditions"
            ? "确认保存录取条件的修改吗？保存后会立即更新到这份 offer。"
            : confirming === "must_do"
            ? "确认保存「接下来你要做的」修改吗？保存后会立即更新到这份 offer。"
            : "确认保存重要备注的修改吗？保存后会立即更新到这份 offer。"
        }
        onConfirm={commitSave}
        onCancel={() => setConfirming(null)}
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
        {Array.from({ length: totalPages }).map((_, i) => (
          <ShareCard
            key={i}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            offer={offer}
            agencyName={agency.agencyName}
            agencyLogo={agency.agencyLogo}
            page={(i + 1) as 1 | 2 | 3}
            totalPages={totalPages}
          />
        ))}
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
      <div className="text-base font-medium text-ink-700 dark:text-ink-300 w-28 shrink-0 tracking-wide">
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

function timestampStamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
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

function EditableSection({
  label,
  isEditing,
  onStartEdit,
  onCancel,
  onRequestSave,
  children,
}: {
  label: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onRequestSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-20">
      <div className="flex items-baseline justify-between mb-8 gap-4">
        <h2 className="section-label">{label}</h2>
        {isEditing ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onCancel}
              className="text-xs px-3 py-1.5 rounded-full text-ink-500 hover:text-ink-900 dark:hover:text-white transition-colors"
            >
              取消
            </button>
            <button
              onClick={onRequestSave}
              className="text-xs px-4 py-1.5 rounded-full bg-ink-900 text-white dark:bg-white dark:text-ink-900 hover:opacity-90 transition-opacity"
            >
              确认修改
            </button>
          </div>
        ) : (
          <button
            onClick={onStartEdit}
            className="text-xs px-3 py-1.5 rounded-full border border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-300 hover:border-ink-900 hover:text-ink-900 dark:hover:border-white dark:hover:text-white transition-colors shrink-0"
          >
            编辑
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function EditRowShell({
  index,
  onDelete,
  children,
}: {
  index: number;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <li className="card p-4">
      <div className="flex items-start gap-3">
        <span className="text-ink-500 font-medium tabular shrink-0 w-6 mt-2">
          {index + 1}.
        </span>
        <div className="flex-1 min-w-0 space-y-2">{children}</div>
        <button
          type="button"
          onClick={onDelete}
          aria-label="删除这一项"
          className="text-ink-400 hover:text-red-500 transition-colors text-2xl leading-none w-7 h-7 flex items-center justify-center shrink-0"
        >
          ×
        </button>
      </div>
    </li>
  );
}

const EDITOR_INPUT =
  "w-full px-3 py-2 bg-ink-100 dark:bg-ink-900 border border-transparent focus:border-ink-900 dark:focus:border-white focus:outline-none transition-colors rounded text-sm";

function AddRowButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-sm text-ink-500 hover:text-ink-900 dark:hover:text-white border border-dashed border-ink-200 dark:border-ink-700 hover:border-ink-900 dark:hover:border-white py-3 rounded-card transition-colors"
      >
        + {label}
      </button>
    </li>
  );
}

function EditableConditionList({
  items,
  onChange,
}: {
  items: Condition[];
  onChange: (next: Condition[]) => void;
}) {
  function update(idx: number, patch: Partial<Condition>) {
    onChange(items.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  return (
    <ol className="space-y-3">
      {items.map((c, i) => (
        <EditRowShell
          key={i}
          index={i}
          onDelete={() => onChange(items.filter((_, j) => j !== i))}
        >
          <textarea
            value={c.item}
            onChange={(e) => update(i, { item: e.target.value })}
            rows={2}
            placeholder="条件主述"
            className={EDITOR_INPUT}
          />
          <textarea
            value={c.details ?? ""}
            onChange={(e) =>
              update(i, { details: e.target.value || undefined })
            }
            rows={2}
            placeholder="补充说明（可留空）"
            className={EDITOR_INPUT}
          />
          <input
            type="date"
            value={c.deadline ?? ""}
            onChange={(e) =>
              update(i, { deadline: e.target.value || null })
            }
            className={EDITOR_INPUT}
          />
        </EditRowShell>
      ))}
      <AddRowButton
        label="添加一条录取条件"
        onClick={() =>
          onChange([
            ...items,
            { item: "", status: "required", deadline: null },
          ])
        }
      />
    </ol>
  );
}

function EditableTodoList({
  items,
  onChange,
}: {
  items: MustDo[];
  onChange: (next: MustDo[]) => void;
}) {
  function update(idx: number, patch: Partial<MustDo>) {
    onChange(items.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }
  return (
    <ol className="space-y-3">
      {items.map((m, i) => (
        <EditRowShell
          key={i}
          index={i}
          onDelete={() => onChange(items.filter((_, j) => j !== i))}
        >
          <textarea
            value={m.action}
            onChange={(e) => update(i, { action: e.target.value })}
            rows={2}
            placeholder="要做的事"
            className={EDITOR_INPUT}
          />
          <textarea
            value={m.details ?? ""}
            onChange={(e) =>
              update(i, { details: e.target.value || undefined })
            }
            rows={2}
            placeholder="补充说明（可留空）"
            className={EDITOR_INPUT}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="date"
              value={m.deadline ?? ""}
              onChange={(e) =>
                update(i, { deadline: e.target.value || null })
              }
              className={EDITOR_INPUT + " flex-1 min-w-[140px]"}
            />
            <select
              value={m.priority}
              onChange={(e) =>
                update(i, { priority: e.target.value as MustDo["priority"] })
              }
              className={EDITOR_INPUT + " flex-1 min-w-[100px]"}
            >
              <option value="high">紧急</option>
              <option value="medium">普通</option>
              <option value="low">次要</option>
            </select>
          </div>
        </EditRowShell>
      ))}
      <AddRowButton
        label="添加一项要做的事"
        onClick={() =>
          onChange([
            ...items,
            { action: "", priority: "medium", deadline: null },
          ])
        }
      />
    </ol>
  );
}

function EditableNoteList({
  items,
  onChange,
}: {
  items: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <ol className="space-y-3">
      {items.map((n, i) => (
        <EditRowShell
          key={i}
          index={i}
          onDelete={() => onChange(items.filter((_, j) => j !== i))}
        >
          <textarea
            value={n}
            onChange={(e) =>
              onChange(items.map((x, j) => (j === i ? e.target.value : x)))
            }
            rows={2}
            placeholder="备注内容"
            className={EDITOR_INPUT}
          />
        </EditRowShell>
      ))}
      <AddRowButton
        label="添加一条备注"
        onClick={() => onChange([...items, ""])}
      />
    </ol>
  );
}

function ConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-black rounded-card border border-ink-100 dark:border-ink-700 p-7 md:p-8 max-w-md w-full fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base leading-relaxed mb-7">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="btn-ghost">
            取消
          </button>
          <button onClick={onConfirm} className="btn-primary">
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
