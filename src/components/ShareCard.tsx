import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import type { Money, MustDo, Offer } from "../lib/schema";
import { formatDate, formatMoney } from "../lib/format";
import { isVisibleInShare } from "../lib/shareVisibility";

export type SectionId = "specs" | "fees" | "conditions" | "todos" | "notes";
export const ALL_SECTIONS: readonly SectionId[] = [
  "specs",
  "fees",
  "conditions",
  "todos",
  "notes",
];

interface Props {
  offer: Offer;
  agencyName?: string;
  agencyLogo?: string;
  /** Which flow sections to render on this page (in order). When omitted, all
   * sections are rendered (used by the measurement pass + the legacy single-
   * page path). */
  sections?: readonly SectionId[];
  /** True for page 1 — shows the big greeting + school + program hero.
   * False for continuation pages — shows a small school·program caption
   * instead so a standalone share is still self-contained. */
  isFirstPage?: boolean;
  /** For the "n / total" footer indicator. Hidden when totalPages == 1. */
  pageNum?: number;
  totalPages?: number;
  /** Measurement mode: render BOTH chrome variants and EVERY section, with
   * height: auto / overflow: visible, so OfferDetail can read each section's
   * natural height to compute page assignments. Visually unused (host renders
   * it offscreen). */
  measureMode?: boolean;
  /** Long-image mode: a single tall card with brand strip + hero at the top,
   * every section in display order, footer at the very bottom (no caption,
   * no page indicator, no auto-scale, no clipping). The exported PNG is
   * 1080×N where N grows with content. */
  longMode?: boolean;
}

const W = 720;
// Frame is always 9:16 — exports to exactly 1080×1920 with pixelRatio 1.5.
// Content that overflows the natural 1280 height is uniformly scaled down
// (font, padding, line-height all together) so the whole offer still fits
// without clipping, just at a tighter density.
const H = 1280;
const PAD_X = 40;
const PAD_T = 56;
const PAD_B = 48;
// Floor on auto-shrink. Below ~0.6 body text drops under 10pt and stops
// being legible at phone-screen viewing distance.
const MIN_SCALE = 0.6;

// Editorial monochrome: white page, near-black ink. The shareable image is
// meant to give the student a one-glance read of what their offer requires,
// so we now show every condition / todo / note in full rather than truncating.
const BG = "#FFFFFF";
const INK = "#0A0A0A";
const SUB = "#525252";
const MUTE = "#86868B";
const HAIRLINE = "#E5E5E7";
const HAIRLINE_STRONG = "#0A0A0A";
// Anything that's a calendar date (deadlines, term start) renders in red so
// the student's eye locks onto the time-sensitive numbers first.
const DATE_RED = "#D70015";

export const ShareCard = forwardRef<HTMLDivElement, Props>(function ShareCard(
  {
    offer,
    agencyName,
    agencyLogo,
    sections,
    isFirstPage = true,
    pageNum = 1,
    totalPages = 1,
    measureMode = false,
    longMode = false,
  },
  ref,
) {
  // Long mode behaves like a single endless P1: hero + all sections + footer,
  // no caption (no continuation page concept), no page indicator.
  const visibleSections = measureMode || longMode
    ? ALL_SECTIONS
    : sections ?? ALL_SECTIONS;
  const showHero = longMode || measureMode || isFirstPage;
  const showCaption = !longMode && (measureMode || !isFirstPage);
  const showSpecs = visibleSections.includes("specs");
  const showFees = visibleSections.includes("fees");
  const showConditions = visibleSections.includes("conditions");
  const showTodos = visibleSections.includes("todos");
  const showNotes = visibleSections.includes("notes");
  const isFreeFlow = measureMode || longMode;
  const today = new Date();
  const dateStamp = `${today.getFullYear()}.${pad(today.getMonth() + 1)}.${pad(
    today.getDate(),
  )}`;

  const fontStack =
    '"SF Pro Display", "Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';

  const schoolZh = offer.school_zh || offer.school;
  const programZh = offer.program_zh;
  const facultyZh = offer.faculty_zh || offer.faculty;
  const countryZh = offer.country_zh || offer.country;
  const termStartDate = offer.key_dates?.find((k) => k.type === "term_start")?.date;
  const termStartDisplay =
    termStartDate ? formatDate(termStartDate) : offer.term_start_text || null;
  const todos = sortedTodos(offer.must_do ?? []);

  // Per-field visibility for the share export. Empty fields default to
  // hidden so newcomers get a clean poster; explicit overrides win.
  const showFee = {
    tuition: isVisibleInShare(offer, "fees.tuition"),
    deposit: isVisibleInShare(offer, "fees.deposit"),
    scholarship: isVisibleInShare(offer, "fees.scholarship"),
  };
  const visibleFeeCount =
    Number(showFee.tuition) +
    Number(showFee.deposit) +
    Number(showFee.scholarship);
  const facultySlot: { label: string; value: string } | null = facultyZh
    ? { label: "学院", value: facultyZh }
    : offer.student_category
      ? { label: "类别", value: offer.student_category }
      : null;
  const showSpec = {
    duration: isVisibleInShare(offer, "duration"),
    term_start: isVisibleInShare(offer, "term_start"),
    faculty: isVisibleInShare(offer, "faculty") && facultySlot !== null,
  };
  const visibleSpecCount =
    Number(showSpec.duration) +
    Number(showSpec.term_start) +
    Number(showSpec.faculty);
  // List items that survived the per-item visibility filter. Index keys
  // refer back to the ORIGINAL position so toggling stays stable across
  // re-renders.
  const visibleConditions = (offer.conditions ?? [])
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => isVisibleInShare(offer, `conditions.${i}`));
  const visibleTodos = todos
    .map((m) => ({ m, i: (offer.must_do ?? []).indexOf(m) }))
    .filter(({ i }) => i < 0 || isVisibleInShare(offer, `must_do.${i}`));
  const visibleNotes = (offer.notes ?? [])
    .map((n, i) => ({ n, i }))
    .filter(({ i }) => isVisibleInShare(offer, `notes.${i}`));

  // Auto-fit: render inner at natural size, measure scrollHeight, scale the
  // whole inner uniformly when it overflows the 1280 frame. Layout box is
  // unchanged by transform, so scrollHeight stays stable across renders and
  // the loop converges in one pass.
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    // Measure / long modes never auto-scale — content flows freely.
    if (isFreeFlow || !innerRef.current) return;
    const naturalH = innerRef.current.scrollHeight;
    const next =
      naturalH <= H ? 1 : Math.max(MIN_SCALE, H / naturalH);
    setScale((prev) => (Math.abs(prev - next) > 0.005 ? next : prev));
  });

  return (
    <div
      ref={ref}
      style={{
        width: W,
        // Measure / long mode let the inner grow naturally. Page mode
        // hard-clips at H so html-to-image captures exactly 1080×1920.
        height: isFreeFlow ? "auto" : H,
        backgroundColor: BG,
        overflow: isFreeFlow ? "visible" : "hidden",
        position: "relative",
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: W,
          minHeight: isFreeFlow ? 0 : H,
          color: INK,
          fontFamily: fontStack,
          padding: `${PAD_T}px ${PAD_X}px ${PAD_B}px`,
          boxSizing: "border-box",
          WebkitFontSmoothing: "antialiased",
          letterSpacing: 0,
          display: "flex",
          flexDirection: "column",
          textAlign: "center",
          transform: isFreeFlow ? "none" : `scale(${scale})`,
          transformOrigin: "50% 0",
        }}
      >
      {/* Brand strip — country left, agency right, separated by hairline */}
      <div
        data-chrome="brand"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
          minHeight: 28,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: SUB,
            fontWeight: 500,
          }}
        >
          {(countryZh || "Overseas").toString()} · Offer
        </div>
        {agencyLogo ? (
          <img
            src={agencyLogo}
            alt={agencyName || "OfferLens"}
            style={{ height: 26, width: "auto", objectFit: "contain" }}
            crossOrigin="anonymous"
          />
        ) : (
          // Always render the brand text — falls back to "OfferLens" when
          // the user hasn't customized, so the header right-side never
          // looks empty.
          <div
            style={{
              fontSize: 11,
              color: SUB,
              fontWeight: 500,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
            }}
          >
            {agencyName || "OfferLens"}
          </div>
        )}
      </div>
      <div style={{ height: 1, background: HAIRLINE_STRONG }} />

      {/* Pages 2-3 caption: school + program in one line so a continuation
          page is still self-contained when shared standalone. */}
      {showCaption && (
        <div
          data-chrome="caption"
          style={{
            marginTop: 14,
            fontSize: 14,
            color: SUB,
            letterSpacing: "0.02em",
            lineHeight: 1.4,
            textAlign: "center",
          }}
        >
          <span style={{ color: INK, fontWeight: 600 }}>{schoolZh}</span>
          {programZh ? ` · ${programZh}` : offer.program ? ` · ${offer.program}` : ""}
        </div>
      )}

      {showHero && <div data-chrome="hero">
      {/* Greeting */}
      <div style={{ marginTop: 24, marginBottom: 14 }}>
        <div
          style={{
            fontSize: 22,
            color: INK,
            fontWeight: 500,
            letterSpacing: "-0.015em",
            lineHeight: 1.35,
          }}
        >
          🎉 {offer.applicant_name ? `${offer.applicant_name}，` : ""}恭喜你获得录取
        </div>
      </div>

      {/* Hero school name — keynote title. Font size and line break point
          chosen by pickHeroLayout so CJK compound words ("中文大学", "深圳",
          etc.) never get split mid-character by browser auto-wrap. */}
      {(() => {
        const layout = pickHeroLayout(schoolZh);
        return (
          <h1
            style={{
              fontSize: layout.fontSize,
              lineHeight: 1.05,
              letterSpacing: "-0.045em",
              fontWeight: 600,
              margin: 0,
              color: INK,
              // keep-all stops CJK words from being broken anywhere; spaces
              // in English names still wrap normally. break-word kicks in
              // only when an English token alone exceeds the line.
              wordBreak: "keep-all",
              overflowWrap: "break-word",
            }}
          >
            {layout.lines.map((line, i) => (
              <span key={i} style={{ display: "block" }}>
                {line}
              </span>
            ))}
          </h1>
        );
      })()}
      {schoolZh !== offer.school && (
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            color: MUTE,
            letterSpacing: "0.08em",
            fontWeight: 400,
            textTransform: "uppercase",
          }}
        >
          {offer.school}
        </div>
      )}

      {/* Programme as keynote subtitle */}
      <div style={{ marginTop: 16 }}>
        <div
          style={{
            fontSize: 24,
            color: INK,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.3,
          }}
        >
          {programZh || offer.program}
        </div>
        {programZh && (
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              color: MUTE,
              letterSpacing: "0.01em",
            }}
          >
            {offer.program}
          </div>
        )}
      </div>
      </div>}

      {/* Specs row — keynote spec sheet. Auto-adapts when some specs are
          hidden: 3-col → 2-col → 1-col centered. Whole row vanishes when
          all three are hidden. */}
      {showSpecs && visibleSpecCount > 0 && <div
        data-section="specs"
        style={{
          marginTop: 22,
          paddingTop: 13,
          paddingBottom: 13,
          borderTop: `1px solid ${HAIRLINE}`,
          borderBottom: `1px solid ${HAIRLINE}`,
          display: "grid",
          gridTemplateColumns: `repeat(${visibleSpecCount}, minmax(0, 1fr))`,
          gap: 24,
          justifyItems: visibleSpecCount === 1 ? "center" : "stretch",
        }}
      >
        {showSpec.duration && (
          <Spec
            label="学制"
            value={offer.duration ?? "—"}
            researched={offer.researched_fields?.includes("duration") ?? false}
          />
        )}
        {showSpec.term_start && (
          <Spec label="入学" value={termStartDisplay ?? "—"} tone="date" />
        )}
        {showSpec.faculty && facultySlot && (
          <Spec label={facultySlot.label} value={facultySlot.value} />
        )}
      </div>}

      {/* Fees — big numbers. Same auto-adapt as the spec row: grid columns
          collapse to the visible count, single fee centers itself, all-three-
          hidden vanishes the whole block. */}
      {showFees && visibleFeeCount > 0 && <div
        data-section="fees"
        style={{
          marginTop: 12,
          paddingBottom: 16,
          borderBottom: `1px solid ${HAIRLINE}`,
          display: "grid",
          gridTemplateColumns: `repeat(${visibleFeeCount}, minmax(0, 1fr))`,
          gap: 24,
          justifyItems: visibleFeeCount === 1 ? "center" : "stretch",
        }}
      >
        {showFee.tuition && (
          <Fee
            label="学费"
            money={offer.fees?.tuition}
            researched={offer.researched_fields?.includes("tuition") ?? false}
          />
        )}
        {showFee.deposit && (
          <Fee
            label="留位费"
            money={offer.fees?.deposit}
            researched={offer.researched_fields?.includes("deposit") ?? false}
          />
        )}
        {showFee.scholarship && (
          <Fee
            label="奖学金"
            money={offer.fees?.scholarship}
            researched={offer.researched_fields?.includes("scholarship") ?? false}
          />
        )}
      </div>}

      {showConditions && visibleConditions.length > 0 && (
        <Section title="录取条件" dataId="conditions">
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {visibleConditions.map(({ c, i }, displayIdx) => (
              <ListItem
                key={i}
                index={displayIdx + 1}
                isLast={displayIdx === visibleConditions.length - 1}
                main={c.item}
                details={c.details ?? undefined}
                deadline={c.deadline ?? undefined}
              />
            ))}
          </ol>
        </Section>
      )}

      {showTodos && visibleTodos.length > 0 && (
        <Section title="接下来你要做的" dataId="todos">
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {visibleTodos.map(({ m }, displayIdx) => (
              <ListItem
                key={displayIdx}
                index={displayIdx + 1}
                isLast={displayIdx === visibleTodos.length - 1}
                main={m.action}
                details={m.details ?? undefined}
                deadline={m.deadline ?? undefined}
              />
            ))}
          </ol>
        </Section>
      )}

      {showNotes && visibleNotes.length > 0 && (
        <Section title="重要备注" dataId="notes">
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {visibleNotes.map(({ n }, i) => (
              <li
                key={i}
                style={{
                  fontSize: 15,
                  color: INK,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  paddingLeft: 20,
                  position: "relative",
                  marginTop: i === 0 ? 0 : 7,
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 9,
                    width: 8,
                    height: 1,
                    background: SUB,
                  }}
                />
                {n}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Footer — pinned to the bottom on short offers via marginTop:auto;
          flows naturally at the end of content on long offers. */}
      <div
        data-chrome="footer"
        style={{
          marginTop: "auto",
          paddingTop: 18,
          borderTop: `1px solid ${HAIRLINE_STRONG}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          color: SUB,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        <span>
          {agencyName ? `Curated by ${agencyName}` : "Curated by OfferLens"}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {dateStamp}
          {totalPages > 1 && (
            <span style={{ marginLeft: 14, color: MUTE, fontWeight: 500 }}>
              {pageNum} / {totalPages}
            </span>
          )}
        </span>
      </div>
      </div>
    </div>
  );
});

function Spec({
  label,
  value,
  tone = "default",
  researched = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "date";
  /** True when value came from researchOffer rather than the offer text. */
  researched?: boolean;
}) {
  const isMissing = value === "—";
  const showResearched = researched && !isMissing;
  return (
    <div>
      <div
        style={{
          fontSize: 14,
          color: SUB,
          textTransform: "uppercase",
          letterSpacing: "0.22em",
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          color: showResearched
            ? SUB
            : tone === "date" && !isMissing
            ? DATE_RED
            : INK,
          fontWeight: tone === "date" && !isMissing ? 600 : 500,
          letterSpacing: "-0.01em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.3,
        }}
      >
        {showResearched ? `~ ${value}` : value}
      </div>
      {showResearched && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: MUTE,
            letterSpacing: "0.02em",
          }}
        >
          参考值 · 来自官网
        </div>
      )}
    </div>
  );
}

function Fee({
  label,
  money,
  researched = false,
}: {
  label: string;
  money?: Money | null;
  /** True when this number came from researchOffer (gemini + grounded
   * web search) rather than from the offer's text. */
  researched?: boolean;
}) {
  const value = formatMoney(money);
  const verified = money?.manually_edited;
  const isMissing = !money || money.amount === 0;
  const isEstimate = money?.is_estimate && !verified;
  const isPartial = money?.is_partial && !verified && !isEstimate;
  const level: 1 | 2 | 3 =
    verified ? 1 : isMissing ? 3 : researched || isEstimate ? 2 : 1;
  const valueColor =
    level === 3 ? MUTE : level === 2 ? SUB : INK;
  return (
    <div>
      <div
        style={{
          fontSize: 14,
          color: SUB,
          textTransform: "uppercase",
          letterSpacing: "0.22em",
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        {label}
        {isPartial && " · 首期"}
      </div>
      <div
        style={{
          fontSize: 30,
          color: valueColor,
          fontWeight: 500,
          letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.05,
        }}
      >
        {level === 3 ? "—" : level === 2 && value !== "—" ? `~ ${value}` : value}
      </div>
      {level === 2 && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: MUTE,
            letterSpacing: "0.02em",
          }}
        >
          参考值 · {researched ? "来自官网" : "系统估算"}
        </div>
      )}
      {level === 1 && money?.note && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: MUTE,
            lineHeight: 1.5,
          }}
        >
          {money.note}
        </div>
      )}
      {level === 3 && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: MUTE,
            letterSpacing: "0.02em",
          }}
        >
          offer 未提供
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  dataId,
}: {
  title: string;
  children: React.ReactNode;
  dataId?: string;
}) {
  return (
    <section data-section={dataId} style={{ marginTop: 22 }}>
      <h2
        style={{
          fontSize: 16,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: INK,
          fontWeight: 600,
          marginTop: 0,
          marginBottom: 11,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function ListItem({
  index,
  main,
  details,
  deadline,
  isLast,
}: {
  index: number;
  main: string;
  details?: string;
  deadline?: string;
  isLast?: boolean;
}) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 18,
        padding: "7px 0",
        borderBottom: isLast ? "none" : `1px solid ${HAIRLINE}`,
        textAlign: "left",
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: MUTE,
          width: 32,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.18em",
          fontWeight: 500,
        }}
      >
        {String(index).padStart(2, "0")}
      </span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 16,
            lineHeight: 1.4,
            color: INK,
            // Always semibold so every action item title reads as the
            // same weight; `emphasis` only controls color (red for
            // high-priority todos), not weight.
            fontWeight: 600,
            letterSpacing: "-0.005em",
          }}
        >
          {main}
        </div>
        {details && (
          <div
            style={{
              fontSize: 14,
              color: SUB,
              marginTop: 6,
              lineHeight: 1.45,
              whiteSpace: "pre-line",
            }}
          >
            {details}
          </div>
        )}
        {deadline && (
          <div
            style={{
              fontSize: 16,
              color: DATE_RED,
              marginTop: 6,
              lineHeight: 1.35,
              fontWeight: 600,
            }}
          >
            截止 · {formatDate(deadline)}
          </div>
        )}
      </div>
    </li>
  );
}

function sortedTodos(todos: MustDo[]): MustDo[] {
  const PRIORITY = { high: 0, medium: 1, low: 2 } as const;
  return [...todos].sort((a, b) => {
    if (a.deadline && b.deadline) {
      const da = new Date(a.deadline).getTime();
      const db = new Date(b.deadline).getTime();
      if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
    }
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
    return PRIORITY[a.priority] - PRIORITY[b.priority];
  });
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/**
 * Decide hero school-name typography: font size + manual line breaks at
 * a semantically meaningful point so the browser doesn't split a CJK
 * compound mid-word. Sample behavior:
 *
 *   "清华大学" (4)             → 80px / one line
 *   "上海纽约大学" (6)          → 70px / one line  (no clean split)
 *   "西交利物浦大学" (7)        → 70px / one line  (no clean split)
 *   "香港中文大学（深圳）" (10) → 70px / "香港中文大学" + "（深圳）"
 *   "纽约大学上海分校" (8)      → 70px / "纽约大学" + "上海分校"
 *   really-long English        → 60px / one line, wraps at spaces
 *
 * Break priority:
 *   1. Right before a Chinese full-width "（" — that's a localizer / region
 *      qualifier and reads naturally as a sub-title on the next line.
 *   2. Right after a "大学" that has more text following it (a mid-name
 *      occurrence, not the trailing word).
 *   3. Otherwise leave one line; CJK keep-all + word-wrap handles English.
 */
function pickHeroLayout(name: string): { fontSize: number; lines: string[] } {
  // Use the spread operator to count code points correctly for CJK.
  const charCount = [...name].length;
  const lines: string[] = (() => {
    const parenIdx = name.indexOf("（");
    if (parenIdx > 0) {
      return [name.slice(0, parenIdx), name.slice(parenIdx)];
    }
    const daxueIdx = name.indexOf("大学");
    // Only break after 大学 when there's still meaningful text after it
    // ("纽约大学上海分校" yes, "西交利物浦大学" no).
    if (daxueIdx > 0 && daxueIdx + 2 < name.length) {
      return [name.slice(0, daxueIdx + 2), name.slice(daxueIdx + 2)];
    }
    return [name];
  })();
  const fontSize = charCount <= 5 ? 80 : charCount <= 12 ? 70 : 60;
  return { fontSize, lines };
}
