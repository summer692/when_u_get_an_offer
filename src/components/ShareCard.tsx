import { forwardRef } from "react";
import type { Money, MustDo, Offer } from "../lib/schema";
import { formatDate, formatMoney } from "../lib/format";

interface Props {
  offer: Offer;
  agencyName?: string;
  agencyLogo?: string;
}

const W = 720;
const PAD_X = 64;

const INK = "#0A0A0A";
const SUB = "#525252";
const MUTE = "#9A9A9A";
const RULE = "#ECECEC";
const RULE_STRONG = "#0A0A0A";

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

  return (
    <div
      ref={ref}
      style={{
        width: W,
        background: "#FFFFFF",
        color: INK,
        fontFamily: fontStack,
        padding: `64px ${PAD_X}px 56px`,
        boxSizing: "border-box",
        WebkitFontSmoothing: "antialiased",
        letterSpacing: 0,
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
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: INK,
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
              color: INK,
              fontWeight: 500,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
            }}
          >
            {agencyName}
          </div>
        ) : null}
      </div>
      <div style={{ height: 1, background: RULE_STRONG }} />

      {/* Greeting */}
      <div style={{ marginTop: 56, marginBottom: 56 }}>
        <div
          style={{
            fontSize: 17,
            color: INK,
            fontWeight: 500,
            letterSpacing: "-0.005em",
            lineHeight: 1.4,
          }}
        >
          {offer.applicant_name ? `${offer.applicant_name}，` : ""}恭喜你获得录取。
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: MUTE }}>
          以下是录取的详细信息
        </div>
      </div>

      {/* Hero school name — keynote-large */}
      <h1
        style={{
          fontSize: 76,
          lineHeight: 0.95,
          letterSpacing: "-0.045em",
          fontWeight: 500,
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
            marginTop: 14,
            fontSize: 14,
            color: MUTE,
            letterSpacing: "0.01em",
          }}
        >
          {offer.school}
        </div>
      )}

      {/* Programme as tagline */}
      <div style={{ marginTop: 40 }}>
        <div
          style={{
            fontSize: 22,
            color: INK,
            fontWeight: 500,
            letterSpacing: "-0.015em",
            lineHeight: 1.3,
          }}
        >
          {programZh || offer.program}
        </div>
        {programZh && (
          <div
            style={{
              marginTop: 6,
              fontSize: 13,
              color: MUTE,
              letterSpacing: "0.01em",
            }}
          >
            {offer.program}
          </div>
        )}
      </div>

      {/* Specs grid — keynote spec sheet feel */}
      <div
        style={{
          marginTop: 56,
          paddingTop: 28,
          paddingBottom: 28,
          borderTop: `1px solid ${RULE}`,
          borderBottom: `1px solid ${RULE}`,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 24,
        }}
      >
        <Spec label="学制" value={offer.duration ?? "—"} />
        <Spec label="入学" value={termStartDisplay ?? "—"} />
        <Spec
          label="学院"
          value={facultyZh ?? offer.student_category ?? "—"}
        />
      </div>

      {/* Fees — big numbers */}
      <div
        style={{
          marginTop: 24,
          paddingBottom: 32,
          borderBottom: `1px solid ${RULE}`,
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
                  fontSize: 13,
                  color: SUB,
                  lineHeight: 1.65,
                  paddingLeft: 18,
                  position: "relative",
                  marginTop: i === 0 ? 0 : 10,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 9,
                    width: 8,
                    height: 1,
                    background: INK,
                  }}
                />
                {n}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 64,
          paddingTop: 18,
          borderTop: `1px solid ${RULE_STRONG}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          color: INK,
          letterSpacing: "0.24em",
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
  );
});

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: MUTE,
          textTransform: "uppercase",
          letterSpacing: "0.24em",
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          color: INK,
          fontWeight: 500,
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
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: MUTE,
          textTransform: "uppercase",
          letterSpacing: "0.24em",
          fontWeight: 500,
          marginBottom: 10,
        }}
      >
        {label}
        {money?.is_partial && !money.manually_edited && " · 首期"}
      </div>
      <div
        style={{
          fontSize: 28,
          color: INK,
          fontWeight: 500,
          letterSpacing: "-0.025em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {showApprox ? `≈ ${value}` : value}
      </div>
      {money?.note && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
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
    <section style={{ marginTop: 56 }}>
      <h2
        style={{
          fontSize: 11,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color: INK,
          fontWeight: 500,
          marginTop: 0,
          marginBottom: 20,
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
        padding: "16px 0",
        borderBottom: isLast ? "none" : `1px solid ${RULE}`,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: MUTE,
          width: 28,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.24em",
          textTransform: "uppercase",
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
              fontSize: 13,
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
              fontSize: 11,
              color: MUTE,
              marginTop: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 500,
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
