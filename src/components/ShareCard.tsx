import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import type { Money, MustDo, Offer } from "../lib/schema";
import { formatDate, formatMoney } from "../lib/format";

interface Props {
  offer: Offer;
  agencyName?: string;
  agencyLogo?: string;
}

const W = 720;
// Frame is always 9:16 — exports to exactly 1080×1920 with pixelRatio 1.5.
// Content that overflows the natural 1280 height is uniformly scaled down
// (font, padding, line-height all together) so the whole offer still fits
// without clipping, just at a tighter density.
const H = 1280;
const PAD_X = 64;
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
  { offer, agencyName, agencyLogo },
  ref,
) {
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

  // Auto-fit: render inner at natural size, measure scrollHeight, scale the
  // whole inner uniformly when it overflows the 1280 frame. Layout box is
  // unchanged by transform, so scrollHeight stays stable across renders and
  // the loop converges in one pass.
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!innerRef.current) return;
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
        height: H,
        backgroundColor: BG,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: W,
          minHeight: H,
          color: INK,
          fontFamily: fontStack,
          padding: `${PAD_T}px ${PAD_X}px ${PAD_B}px`,
          boxSizing: "border-box",
          WebkitFontSmoothing: "antialiased",
          letterSpacing: 0,
          display: "flex",
          flexDirection: "column",
          // Center the typography itself — without this the safe-margin
          // padding pushes the natural-width text to the left edge of the
          // 720 inner, and the export reads as "left-leaning" even at
          // scale = 1. Lists override back to text-align:left per item
          // because numbered rows look broken when centered.
          textAlign: "center",
          transform: `scale(${scale})`,
          // Anchor the scale to top-center so an overflowing offer shrinks
          // symmetrically into the frame instead of clinging to the left edge.
          transformOrigin: "50% 0",
        }}
      >
      {/* Brand strip — country left, agency right, separated by hairline */}
      <div
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
            alt={agencyName || "agency"}
            style={{ height: 26, width: "auto", objectFit: "contain" }}
            crossOrigin="anonymous"
          />
        ) : agencyName ? (
          <div
            style={{
              fontSize: 11,
              color: SUB,
              fontWeight: 500,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
            }}
          >
            {agencyName}
          </div>
        ) : null}
      </div>
      <div style={{ height: 1, background: HAIRLINE_STRONG }} />

      {/* Greeting */}
      <div style={{ marginTop: 36, marginBottom: 22 }}>
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

      {/* Hero school name — keynote title */}
      <h1
        style={{
          fontSize: 76,
          lineHeight: 0.95,
          letterSpacing: "-0.045em",
          fontWeight: 600,
          margin: 0,
          color: INK,
          wordBreak: "break-word",
        }}
      >
        {schoolZh}
      </h1>
      {schoolZh !== offer.school && (
        <div
          style={{
            marginTop: 12,
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
      <div style={{ marginTop: 24 }}>
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

      {/* Specs row — keynote spec sheet */}
      <div
        style={{
          marginTop: 32,
          paddingTop: 18,
          paddingBottom: 18,
          borderTop: `1px solid ${HAIRLINE}`,
          borderBottom: `1px solid ${HAIRLINE}`,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 24,
        }}
      >
        <Spec label="学制" value={offer.duration ?? "—"} />
        <Spec label="入学" value={termStartDisplay ?? "—"} tone="date" />
        <Spec
          label="学院"
          value={facultyZh ?? offer.student_category ?? "—"}
        />
      </div>

      {/* Fees — big numbers */}
      <div
        style={{
          marginTop: 18,
          paddingBottom: 22,
          borderBottom: `1px solid ${HAIRLINE}`,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 24,
        }}
      >
        <Fee label="学费" money={offer.fees?.tuition} />
        <Fee label="留位费" money={offer.fees?.deposit} />
        <Fee label="奖学金" money={offer.fees?.scholarship} />
      </div>

      {offer.conditions && offer.conditions.length > 0 && (
        <Section title="录取条件">
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {offer.conditions.map((c, i) => (
              <ListItem
                key={i}
                index={i + 1}
                isLast={i === offer.conditions!.length - 1}
                main={c.item}
                details={c.details ?? undefined}
                deadline={c.deadline ?? undefined}
              />
            ))}
          </ol>
        </Section>
      )}

      {todos.length > 0 && (
        <Section title="接下来你要做的">
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {todos.map((m, i) => (
              <ListItem
                key={i}
                index={i + 1}
                isLast={i === todos.length - 1}
                main={m.action}
                details={m.details ?? undefined}
                deadline={m.deadline ?? undefined}
                emphasis={m.priority === "high"}
              />
            ))}
          </ol>
        </Section>
      )}

      {offer.notes && offer.notes.length > 0 && (
        <Section title="重要备注">
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {offer.notes.map((n, i) => (
              <li
                key={i}
                style={{
                  fontSize: 15,
                  color: INK,
                  lineHeight: 1.6,
                  paddingLeft: 20,
                  position: "relative",
                  marginTop: i === 0 ? 0 : 10,
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
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{dateStamp}</span>
      </div>
      </div>
    </div>
  );
});

function Spec({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "date";
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: SUB,
          textTransform: "uppercase",
          letterSpacing: "0.24em",
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          color: tone === "date" && value !== "—" ? DATE_RED : INK,
          fontWeight: tone === "date" && value !== "—" ? 600 : 500,
          letterSpacing: "-0.01em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.3,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Fee({ label, money }: { label: string; money?: Money | null }) {
  const value = formatMoney(money);
  const showApprox =
    money && money.is_estimate && !money.manually_edited && value !== "—";
  const isEmpty = value === "—";
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: SUB,
          textTransform: "uppercase",
          letterSpacing: "0.24em",
          fontWeight: 600,
          marginBottom: 12,
        }}
      >
        {label}
        {money?.is_partial && !money.manually_edited && " · 首期"}
      </div>
      <div
        style={{
          fontSize: 30,
          color: isEmpty ? MUTE : INK,
          fontWeight: 500,
          letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.05,
        }}
      >
        {showApprox ? `≈ ${value}` : value}
      </div>
      {money?.note && (
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
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2
        style={{
          fontSize: 14,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: INK,
          fontWeight: 600,
          marginTop: 0,
          marginBottom: 16,
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
  emphasis,
}: {
  index: number;
  main: string;
  details?: string;
  deadline?: string;
  isLast?: boolean;
  emphasis?: boolean;
}) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 18,
        padding: "10px 0",
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
            lineHeight: 1.5,
            color: INK,
            fontWeight: emphasis ? 600 : 400,
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
              marginTop: 8,
              lineHeight: 1.65,
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
              marginTop: 8,
              lineHeight: 1.5,
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
