import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Condition, Money, MustDo, Offer, Settings } from "../lib/schema";
import { daysUntil, formatDaysLeft } from "../lib/countdown";
import { formatDate, formatMoney } from "../lib/format";
import { getSettings } from "../lib/db";
import { captureNodeAsDataUrl, downloadDataUrl, safeFilename } from "../lib/exportImage";
import { ALL_SECTIONS, ShareCard, type SectionId } from "./ShareCard";
import { ConfirmDialog } from "./ConfirmDialog";
import { MoneyEditor } from "./MoneyEditor";
import { ExportPreview, type PreviewItem } from "./ExportPreview";
import { applyResearch, pruneInfoGaps, researchOffer } from "../lib/llm";
import {
  defaultShareVisible,
  hideAllEmptyFields,
  isVisibleInShare,
  setShareVisibility,
} from "../lib/shareVisibility";

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
  const measureRef = useRef<HTMLDivElement>(null);
  const feesRef = useRef<HTMLDivElement>(null);
  // Page assignments are computed by measuring section heights against the
  // available content area of a 1080×1920 frame. Default to "everything on
  // page 1" so the export still works on first paint before measurement.
  const [pageAssignments, setPageAssignments] = useState<SectionId[][]>([
    [...ALL_SECTIONS],
  ]);
  const [longMode, setLongMode] = useState(false);
  const longCardRef = useRef<HTMLDivElement | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Export preview flow: 点"生成图片" → 抓 PNG → 弹预览 → 用户确认 → 下载。
  // previewItems undefined = preview modal in 生成中 loading state.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItems, setPreviewItems] = useState<PreviewItem[] | undefined>(
    undefined,
  );
  const [downloadingPreview, setDownloadingPreview] = useState(false);

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

  // Page packer — "fit P1 first, push from bottom" strategy:
  // 1. Try fitting every visible section on P1 (specs / fees / 录取条件 /
  //    接下来你要做的 / 重要备注).
  // 2. If P1 overflows, evict sections from the bottom in priority order
  //    (notes → todos → conditions). 基本信息 (specs + fees) is locked.
  // 3. Pulled sections form P2's contents in their original display order.
  //    If P2 alone overflows, greedy-fit them into P3+ at section level.
  //    (Per-page auto-scale stays as the safety net for pathologically big
  //    single sections.)
  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    function getBoxHeight(selector: string): number {
      const el = node!.querySelector<HTMLElement>(selector);
      if (!el) return 0;
      const cs = window.getComputedStyle(el);
      return (
        el.offsetHeight +
        parseFloat(cs.marginTop || "0") +
        parseFloat(cs.marginBottom || "0")
      );
    }

    const brandH = getBoxHeight('[data-chrome="brand"]');
    const heroH = getBoxHeight('[data-chrome="hero"]');
    const captionH = getBoxHeight('[data-chrome="caption"]');
    const footerH = getBoxHeight('[data-chrome="footer"]');

    const heights: Partial<Record<SectionId, number>> = {};
    for (const id of ALL_SECTIONS) {
      heights[id] = getBoxHeight(`[data-section="${id}"]`);
    }

    const FRAME_INTERIOR = 1280 - 56 - 48; // PAD_T + PAD_B
    const HAIRLINE = 1;
    const PAGE1_AVAIL = FRAME_INTERIOR - brandH - HAIRLINE - heroH - footerH;
    const PAGEN_AVAIL = FRAME_INTERIOR - brandH - HAIRLINE - captionH - footerH;
    const toOut = (n: number) => Math.round(n * 1.5);

    const visible = ALL_SECTIONS.filter((id) => (heights[id] ?? 0) > 0);
    if (visible.length === 0) {
      setPageAssignments([[]]);
      return;
    }

    const sumH = (ids: SectionId[]) =>
      ids.reduce((s, id) => s + (heights[id] ?? 0), 0);

    console.log(
      `📄 拆页测量｜brand ${toOut(brandH)} · hero ${toOut(heroH)} · caption ${toOut(captionH)} · footer ${toOut(footerH)} → p1 可用 ${toOut(PAGE1_AVAIL)}px / p2+ 可用 ${toOut(PAGEN_AVAIL)}px`,
    );
    console.log(
      `📄 各 section 高度｜${visible.map((id) => `${id} ${toOut(heights[id] ?? 0)}px`).join(" · ")}`,
    );

    // Step 1: try all on P1
    const lockedToP1: SectionId[] = ["specs", "fees"];
    const pullable: SectionId[] = ["conditions", "todos", "notes"];

    let p1Sections = visible.slice();
    const pulled: SectionId[] = [];

    if (sumH(p1Sections) <= PAGE1_AVAIL) {
      console.log(
        `p1 全部内容总高 ${toOut(sumH(p1Sections))}px ≤ 可用 ${toOut(PAGE1_AVAIL)}px → 一页装下`,
      );
    } else {
      console.log(
        `p1 全部内容总高 ${toOut(sumH(p1Sections))}px > 可用 ${toOut(PAGE1_AVAIL)}px → 开始从底部弹出`,
      );
      // Step 2: evict from bottom by priority (notes → todos → conditions)
      for (const id of [...pullable].reverse()) {
        if (sumH(p1Sections) <= PAGE1_AVAIL) break;
        if (!p1Sections.includes(id)) continue;
        if (lockedToP1.includes(id)) continue;
        p1Sections = p1Sections.filter((x) => x !== id);
        pulled.unshift(id); // keep display order
        console.log(
          `→ 弹出 ${id}，p1 剩余高 ${toOut(sumH(p1Sections))}px / 可用 ${toOut(PAGE1_AVAIL)}px`,
        );
      }
    }

    // Step 3: pack pulled sections onto P2+
    const pages: SectionId[][] = [p1Sections];
    if (pulled.length > 0) {
      let pageIdx = 1;
      pages.push([]);
      let used = 0;
      for (const id of pulled) {
        const h = heights[id] ?? 0;
        const fits = used + h <= PAGEN_AVAIL;
        const verdict = fits
          ? "是"
          : pages[pageIdx].length > 0
          ? "否，p" + (pageIdx + 2) + "新页"
          : "否（页面起点，强制放入；超大段落由 auto-scale 兜底）";
        console.log(
          `p${pageIdx + 1} 累计 ${toOut(used)}px / 可用 ${toOut(PAGEN_AVAIL)}px → 还能塞下"${id}"(${toOut(h)}px)? ${verdict}`,
        );
        if (!fits && pages[pageIdx].length > 0) {
          pageIdx++;
          pages.push([]);
          used = 0;
        }
        pages[pageIdx].push(id);
        used += h;
      }
    }

    console.log(
      `📄 拆页结果：${pages.length} 页 — ${pages
        .map((p, i) => `p${i + 1}=[${p.join(", ")}]`)
        .join(" | ")}`,
    );

    setPageAssignments((prev) => {
      // Avoid re-rendering when assignments are equal (prevents loop on
      // measurement re-runs caused by the resulting render).
      if (
        prev.length === pages.length &&
        prev.every(
          (p, i) =>
            p.length === pages[i].length && p.every((s, j) => s === pages[i][j]),
        )
      ) {
        return prev;
      }
      return pages;
    });
  }, [offer]);

  /** Step 1: 用户点"生成图片" → 抓所有页的 PNG dataURL，弹预览模态框。 */
  async function handleExport() {
    if (exporting) return;
    if (isDirty) {
      flashToast("有未保存的修改，请先点「确认修改」再导出图片", 3500);
      return;
    }
    // Open the preview modal in loading state immediately so the user gets
    // visual feedback while we capture.
    setPreviewItems(undefined);
    setPreviewOpen(true);
    setExporting(true);
    try {
      const fresh = await getSettings();
      setAgency({ agencyName: fresh.agencyName, agencyLogo: fresh.agencyLogo });
      // Wait one frame so the agency-logo prop change actually paints into
      // the offscreen ShareCards before we capture them.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const stamp = timestampStamp();
      const base = `offer_${safeFilename(schoolZh)}_${stamp}`;

      const items: PreviewItem[] = [];
      if (longMode) {
        if (!longCardRef.current) return;
        const dataUrl = await captureNodeAsDataUrl(longCardRef.current);
        items.push({ dataUrl, filename: `${base}_long.png` });
      } else {
        const pages = cardRefs.current
          .slice(0, pageAssignments.length)
          .filter(Boolean) as HTMLDivElement[];
        if (pages.length === 0) {
          setPreviewOpen(false);
          return;
        }
        for (let i = 0; i < pages.length; i++) {
          const filename =
            pages.length === 1 ? `${base}.png` : `${base}_p${i + 1}.png`;
          const dataUrl = await captureNodeAsDataUrl(pages[i]);
          items.push({ dataUrl, filename });
        }
      }
      setPreviewItems(items);
    } catch (err) {
      console.error(err);
      setPreviewOpen(false);
      setToast("生成失败，请重试");
      setTimeout(() => setToast(null), 3200);
    } finally {
      setExporting(false);
    }
  }

  /** Step 2: 用户在预览里点"下载全部" → 真正写文件 / 调起 share sheet。 */
  async function handlePreviewDownload() {
    if (!previewItems || previewItems.length === 0 || downloadingPreview)
      return;
    setDownloadingPreview(true);
    try {
      let lastMode: "shared" | "downloaded" | null = null;
      for (const it of previewItems) {
        const result = await downloadDataUrl(it.dataUrl, it.filename);
        lastMode = result.mode;
      }
      setPreviewOpen(false);
      setPreviewItems(undefined);
      setToast(
        previewItems.length === 1
          ? lastMode === "shared"
            ? "已分享"
            : "已保存图片"
          : `已保存 ${previewItems.length} 张图片`,
      );
    } catch (err) {
      console.error(err);
      setToast("下载失败，请重试");
    } finally {
      setDownloadingPreview(false);
      setTimeout(() => setToast(null), 3200);
    }
  }

  function handlePreviewClose() {
    if (downloadingPreview) return;
    setPreviewOpen(false);
    setPreviewItems(undefined);
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

  /** Flip a single field's "show in share image" override and persist
   * immediately. No confirm dialog — visibility is reversible and low-stakes. */
  async function toggleShare(key: string) {
    const next = setShareVisibility(offer, key, !isVisibleInShare(offer, key));
    await onUpdate(next);
  }

  /** "一键隐藏所有空字段": records explicit false overrides for every fee /
   * spec field whose default visibility is false (no data). Idempotent. */
  async function bulkHideEmpty() {
    const next = hideAllEmptyFields(offer);
    await onUpdate(next);
    flashToast("已隐藏所有空字段");
  }

  /** Count of fields whose default visibility is false (i.e. empty). Used
   * to gate the bulk-hide button — we don't show it when there's nothing to
   * hide. */
  const emptyFieldCount = (
    [
      "fees.tuition",
      "fees.deposit",
      "fees.scholarship",
      "duration",
      "faculty",
      "term_start",
    ] as const
  ).filter((k) => !defaultShareVisible(offer, k)).length;

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
    // Edits may insert / delete / reorder items, which would leave the
    // old visibility map mis-aligned. Drop overrides for this section so
    // the resulting share card defaults to visible — user can re-hide.
    if (updated.share_visibility) {
      const sv = { ...updated.share_visibility };
      const prefix = `${key}.`;
      for (const k of Object.keys(sv)) if (k.startsWith(prefix)) delete sv[k];
      updated.share_visibility = sv;
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
      <div className="flex items-center justify-between mb-16 gap-4 flex-wrap">
        <button onClick={onBack} className="btn-ghost -ml-3">
          ← 返回
        </button>
        <div className="flex items-center gap-4 flex-wrap">
          {emptyFieldCount > 0 && (
            <button
              onClick={bulkHideEmpty}
              className="text-xs px-3 py-1.5 rounded-full border border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-300 hover:border-ink-900 hover:text-ink-900 dark:hover:border-white dark:hover:text-white transition-colors"
              title="把所有'—'空字段从分享图里隐藏"
            >
              一键隐藏所有空字段
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900 dark:hover:text-white cursor-pointer select-none">
            <input
              type="checkbox"
              checked={longMode}
              onChange={(e) => setLongMode(e.target.checked)}
              className="accent-ink-900 dark:accent-white"
            />
            合并为一张长图下载
          </label>
          <button
            onClick={handleExport}
            disabled={exporting || previewOpen}
            className="btn-primary disabled:opacity-60"
          >
            {exporting ? "生成中…" : "生成图片"}
          </button>
        </div>
      </div>

      {pageAssignments.length > 1 && !longMode && (
        <div className="mb-12 rounded-card border border-amber-300/70 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40 px-5 py-4 text-sm text-amber-900 dark:text-amber-100">
          内容较多，已拆为 <b>{pageAssignments.length}</b> 张图片。可点击编辑删减信息。
        </div>
      )}

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
            <h2 className="section-label">offer 主要信息</h2>
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
            value={
              <span className="inline-flex items-baseline gap-2 flex-wrap">
                <span>{programZh ? programZh : offer.program}</span>
                {offer.researched_fields?.includes("program") && (
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    参考值 · 来自官网
                  </span>
                )}
              </span>
            }
            secondary={programZh && offer.program ? offer.program : undefined}
          />
          {facultyZh && (
            <Fact
              label="学院"
              value={facultyZh}
              secondary={
                facultyZh !== offer.faculty ? offer.faculty : undefined
              }
              trailing={
                <ShareToggle
                  visible={isVisibleInShare(offer, "faculty")}
                  onToggle={() => toggleShare("faculty")}
                />
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
              trailing={
                <ShareToggle
                  visible={isVisibleInShare(offer, "term_start")}
                  onToggle={() => toggleShare("term_start")}
                />
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
                <span className="inline-flex items-baseline gap-2">
                  <button
                    onClick={() => setEditingDuration(true)}
                    className={`hover:underline underline-offset-4 ${
                      offer.researched_fields?.includes("duration")
                        ? "text-ink-500"
                        : ""
                    }`}
                    title="点击修改"
                  >
                    {offer.researched_fields?.includes("duration")
                      ? `~ ${offer.duration}`
                      : offer.duration}
                  </button>
                  {offer.researched_fields?.includes("duration") && (
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      参考值 · 来自官网
                    </span>
                  )}
                </span>
              ) : (
                <button
                  onClick={() => setEditingDuration(true)}
                  className="underline underline-offset-4 text-base"
                >
                  + 添加
                </button>
              )
            }
            trailing={
              offer.duration ? (
                <ShareToggle
                  visible={isVisibleInShare(offer, "duration")}
                  onToggle={() => toggleShare("duration")}
                />
              ) : undefined
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
              researched={offer.researched_fields?.includes("tuition")}
              shareVisible={isVisibleInShare(offer, "fees.tuition")}
              onToggleShare={() => toggleShare("fees.tuition")}
            />
            <FeeBlock
              title="留位费"
              money={offer.fees?.deposit}
              school={schoolZh}
              program={offer.program}
              onEdit={() => setEditingFee("deposit")}
              researched={offer.researched_fields?.includes("deposit")}
              shareVisible={isVisibleInShare(offer, "fees.deposit")}
              onToggleShare={() => toggleShare("fees.deposit")}
            />
            <FeeBlock
              title="奖学金"
              money={offer.fees?.scholarship}
              school={schoolZh}
              program={offer.program}
              onEdit={() => setEditingFee("scholarship")}
              researched={offer.researched_fields?.includes("scholarship")}
              shareVisible={isVisibleInShare(offer, "fees.scholarship")}
              onToggleShare={() => toggleShare("fees.scholarship")}
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
                      <span className="font-semibold">{c.item}</span>
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
                  <div className="shrink-0">
                    <ShareToggle
                      visible={isVisibleInShare(offer, `conditions.${i}`)}
                      onToggle={() => toggleShare(`conditions.${i}`)}
                    />
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
              {todos.map((m, i) => {
                // The share-visibility map is keyed by the ORIGINAL position
                // in offer.must_do (sortedTodos may reshuffle for display).
                const origIdx = (offer.must_do ?? []).indexOf(m);
                return (
                  <li key={i} className="card p-5 flex items-start gap-4">
                    <span className="text-ink-500 font-medium tabular shrink-0 w-6">
                      {i + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span
                          className={`font-semibold ${
                            m.priority === "high"
                              ? "text-red-600 dark:text-red-400"
                              : ""
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
                    {origIdx >= 0 && (
                      <div className="shrink-0">
                        <ShareToggle
                          visible={isVisibleInShare(offer, `must_do.${origIdx}`)}
                          onToggle={() => toggleShare(`must_do.${origIdx}`)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
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
                  <span className="flex-1 font-semibold">{n}</span>
                  <div className="shrink-0">
                    <ShareToggle
                      visible={isVisibleInShare(offer, `notes.${i}`)}
                      onToggle={() => toggleShare(`notes.${i}`)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </EditableSection>
      )}

      <div className="mt-24 pt-8 border-t border-ink-100 dark:border-ink-700">
        <button
          onClick={() => setConfirmingDelete(true)}
          className="inline-flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition-colors"
        >
          <span aria-hidden>🗑️</span>
          <span>删除这个 offer</span>
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

      <ConfirmDialog
        open={confirmingDelete}
        tone="danger"
        confirmLabel="确认删除"
        message={"确认删除这份 offer？\n删除后无法恢复。"}
        onConfirm={() => {
          setConfirmingDelete(false);
          onDelete();
        }}
        onCancel={() => setConfirmingDelete(false)}
      />

      <ExportPreview
        open={previewOpen}
        items={previewItems}
        downloading={downloadingPreview}
        onDownload={handlePreviewDownload}
        onClose={handlePreviewClose}
      />

      {/* Measurement card: every section rendered in one tall column at
          natural height. The page packer reads each section's offsetHeight
          via data-* attributes to decide where to break pages. */}
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
          ref={measureRef}
          offer={offer}
          agencyName={agency.agencyName}
          agencyLogo={agency.agencyLogo}
          measureMode
        />
      </div>

      {/* Export cards — one per page assignment. Each is a real 720×1280
          frame ready for html-to-image to capture at 1.5× → 1080×1920. */}
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
        {pageAssignments.map((sections, i) => (
          <ShareCard
            key={i}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            offer={offer}
            agencyName={agency.agencyName}
            agencyLogo={agency.agencyLogo}
            sections={sections}
            isFirstPage={i === 0}
            pageNum={i + 1}
            totalPages={pageAssignments.length}
          />
        ))}
      </div>

      {/* Long-image card: a single tall 720-wide frame with hero + every
          section + footer (no caption, no page indicator, no clipping).
          Captured by html-to-image at 1.5× to produce a 1080×N PNG. */}
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
          ref={longCardRef}
          offer={offer}
          agencyName={agency.agencyName}
          agencyLogo={agency.agencyLogo}
          longMode
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
  trailing,
}: {
  label: string;
  value: React.ReactNode;
  secondary?: string;
  /** Optional element rendered at the right edge — used to attach a
   * ShareToggle without breaking the value's baseline alignment. */
  trailing?: React.ReactNode;
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
      {trailing && <div className="shrink-0">{trailing}</div>}
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
  researched,
  shareVisible,
  onToggleShare,
}: {
  title: string;
  money?: Money | null;
  school: string;
  program: string;
  onEdit: () => void;
  /** True when this field's value was filled in by researchOffer (Gemini
   * + grounded web search) rather than read directly off the offer. */
  researched?: boolean;
  /** Whether this field will appear in the exported share image. */
  shareVisible: boolean;
  onToggleShare: () => void;
}) {
  const value = formatMoney(money);
  const verified = money?.manually_edited;
  const isMissing = !money || money.amount === 0;
  const isEstimate = money?.is_estimate && !verified;
  const isPartial = money?.is_partial && !verified && !isEstimate;
  const isDeposit = title === "留位费";
  // Trust level (see schema doc on researched_fields):
  //   1 — read off the offer (or user-verified). Display as authoritative.
  //   2 — system-supplied (researched from school site OR LLM-estimated
  //       from per-credit math). Display with "~", muted color, warning.
  //   3 — missing entirely. Display "—" + a red prompt to look it up.
  const level: 1 | 2 | 3 =
    verified
      ? 1
      : isMissing
      ? 3
      : researched || isEstimate
      ? 2
      : 1;

  const valueClass =
    level === 3
      ? "text-ink-300 dark:text-ink-700"
      : level === 2
      ? "text-ink-500 dark:text-ink-400"
      : "";

  const sourceLinkClass =
    level === 2
      ? "text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
      : "text-ink-500 hover:text-ink-900 dark:hover:text-white";

  return (
    <div
      onClick={onEdit}
      className="group p-6 border border-ink-100 dark:border-ink-700 hover:border-ink-900 dark:hover:border-white transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="section-label">{title}</div>
        <div className="flex items-center gap-1.5">
          {verified && <Badge tone="green">已校对</Badge>}
          {level === 2 && (
            <Badge tone="amber">
              {researched
                ? "参考值 · 来自官网"
                : isPartial
                ? "首期 / 不完整"
                : "参考值 · 系统估算"}
            </Badge>
          )}
          <ShareToggle visible={shareVisible} onToggle={onToggleShare} />
          <span className="text-ink-300 dark:text-ink-700 text-[10px] uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
            编辑
          </span>
        </div>
      </div>
      <div className={`mt-4 text-3xl font-display font-medium tabular tracking-tight ${valueClass}`}>
        {level === 3 ? "—" : level === 2 && value !== "—" ? `~ ${value}` : value}
      </div>

      {level === 2 && researched && (
        <div className="mt-3 text-xs text-ink-500 leading-relaxed">
          <span className="text-amber-600 dark:text-amber-400">⚠️</span>{" "}
          offer 原文未提供，以上为系统从 {school} 官网查询的{title}。建议交费前去官网核对。
        </div>
      )}
      {level === 2 && !researched && money?.note && (
        <div className="mt-3 text-xs text-ink-500 leading-relaxed">
          {money.note}
        </div>
      )}
      {level === 1 && money?.note && (
        <div className="mt-3 text-xs text-ink-500 leading-relaxed">
          {money.note}
        </div>
      )}
      {level === 3 && (
        <div className="mt-3 text-xs text-red-600 dark:text-red-400 leading-relaxed">
          offer 未提供明确金额，建议手动查询学校官网
        </div>
      )}

      {money && money.amount > 0 && (
        money.source ? (
          <a
            href={money.source}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`mt-4 inline-flex items-center gap-1 text-xs underline underline-offset-4 ${sourceLinkClass}`}
          >
            {level === 2 ? "去官网核对" : `via ${hostOf(money.source)}`} ↗
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
            className={`mt-4 inline-flex items-center gap-1 text-xs underline underline-offset-4 ${sourceLinkClass}`}
          >
            去官网核对 ↗
          </a>
        )
      )}
    </div>
  );
}

function ShareToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={visible}
      onClick={(e) => {
        // Don't bubble into the parent card's onClick (which opens edit).
        e.stopPropagation();
        onToggle();
      }}
      title={
        visible
          ? "在分享图中显示（点击隐藏）"
          : "分享图中已隐藏（点击显示）"
      }
      className={`text-[10px] tracking-wider px-2 py-0.5 rounded-full border transition-colors ${
        visible
          ? "border-emerald-300 text-emerald-700 dark:border-emerald-700/60 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20"
          : "border-ink-200 dark:border-ink-700 text-ink-400"
      }`}
    >
      {visible ? "✓ 分享图" : "○ 已隐藏"}
    </button>
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

