import { forwardRef } from "react";
import type { Money, MustDo, Offer } from "../lib/schema";
import { formatDate, formatMoney } from "../lib/format";

interface Props {
  offer: Offer;
  agencyName?: string;
  agencyLogo?: string;
}

const W = 720;
const PAD_X = 56;

const INK = "#0A0A0A";
const SUB = "#525252";
const MUTE = "#A3A3A3";
const RULE = "#E5E5E5";
const RULE_STRONG = "#0A0A0A";

export const ShareCard = forwardRef<HTMLDivElement, Props>(function ShareCard(
  { offer, agencyName, agencyLogo },
  ref,
) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(
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
        padding: `48px ${PAD_X}px 40px`,
        boxSizing: "border-box",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* Top hairline */}
      <div style={{ height: 1, background: RULE_STRONG, marginBottom: 28 }} />

      {/* Brand strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 56,
          minHeight: 28,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: INK,
            fontWeight: 500,
          }}
        >
          {(countryZh || "Offer").toString()} · Offer
        </div>
        {agencyLogo ? (
          <img
            src={agencyLogo}
            alt={agencyName || "agency"}
            style={{
              height: 28,
              width: "auto",
              objectFit: "contain",
              filter: "grayscale(1)",
            }}
            crossOrigin="anonymous"
          />
        ) : agencyName ? (
          <div
            style={{
              fontSize: 11,
              color: INK,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            {agencyName}
          </div>
        ) : null}
      </div>

      {/* Greeting */}
      <div
        style={{
          fontSize: 18,
          color: SUB,
          fontWeight: 500,
          marginBottom: 6,
          letterSpacing: "-0.005em",
        }}
      >
        {offer.applicant_name ? `${offer.applicant_name}，` : ""}恭喜你获得录取。
      </div>
      <div style={{ fontSize: 13, color: MUTE, marginBottom: 56 }}>
        以下是录取的详细信息
      </div>

      {/* Hero school name */}
      <h1
        style={{
          fontSize: 64,
          lineHeight: 0.95,
          letterSpacing: "-0.04em",
          fontWeight: 500,
          margin: 0,
          marginBottom: 16,
          color: INK,
          wordBreak: "break-word",
        }}
      >
        {schoolZh}
      </h1>
      {schoolZh !== offer.school && (
        <div style={{ fontSize: 13, color: MUTE, letterSpacing: "0.02em" }}>
          {offer.school}
        </div>
      )}

      <div style={{ height: 1, background: RULE, margin: "44px 0 28px" }} />

      {/* Facts list */}
      <SectionLabel>基本信息</SectionLabel>
      <div style={{ marginBottom: 44 }}>
        <FactRow
          label="录取专业"
          value={programZh || offer.program}
          secondary={programZh ? offer.program : undefined}
        />
        {facultyZh && <FactRow label="学院" value={facultyZh} />}
        {offer.student_category && (
          <FactRow label="学生类别" value={offer.student_category} />
        )}
        {termStartDisplay && (
          <FactRow label="入学时间" value={termStartDisplay} />
        )}
        {offer.duration && <FactRow label="学习时长" value={offer.duration} />}
        {offer.fees?.tuition && (
          <FactRow
            label={feeLabel("学费", offer.fees.tuition)}
            value={feeValue(offer.fees.tuition)}
            secondary={offer.fees.tuition.note}
          />
        )}
        {offer.fees?.deposit && (
          <FactRow
            label="留位费"
            value={feeValue(offer.fees.deposit)}
            secondary={offer.fees.deposit.note}
          />
        )}
        {offer.fees?.scholarship && (
          <FactRow
            label="奖学金"
            value={feeValue(offer.fees.scholarship)}
            secondary={offer.fees.scholarship.note}
            isLast
          />
        )}
      </div>

      {/* info_gaps intentionally omitted from the share image — agency-only. */}

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
                  fontSize: 14,
                  color: SUB,
                  lineHeight: 1.6,
                  paddingLeft: 18,
                  position: "relative",
                  marginTop: i === 0 ? 0 : 10,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 10,
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

      {/* Bottom double rule */}
      <div style={{ height: 1, background: RULE, marginTop: 48 }} />
      <div style={{ height: 4 }} />
      <div style={{ height: 1, background: RULE_STRONG }} />

      {/* Footer */}
      <div
        style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          color: MUTE,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        <span>{agencyName ? `Curated by ${agencyName}` : "OfferLens"}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{todayStr}</span>
      </div>
    </div>
  );
});

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 11,
        letterSpacing: "0.24em",
        textTransform: "uppercase",
        color: INK,
        fontWeight: 500,
        marginTop: 0,
        marginBottom: 18,
      }}
    >
      {children}
    </h2>
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
    <section style={{ marginBottom: 44 }}>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

function FactRow({
  label,
  value,
  secondary,
  isLast,
}: {
  label: string;
  value: string;
  secondary?: string;
  isLast?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 24,
        padding: "16px 0",
        borderBottom: isLast ? "none" : `1px solid ${RULE}`,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: MUTE,
          width: 92,
          flex: "0 0 92px",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 17,
            color: INK,
            lineHeight: 1.4,
            fontVariantNumeric: "tabular-nums",
            wordBreak: "break-word",
          }}
        >
          {value}
        </div>
        {secondary && (
          <div
            style={{
              fontSize: 12,
              color: MUTE,
              marginTop: 5,
              lineHeight: 1.55,
            }}
          >
            {secondary}
          </div>
        )}
      </div>
    </div>
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
        gap: 16,
        padding: "16px 0",
        borderBottom: isLast ? "none" : `1px solid ${RULE}`,
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: MUTE,
          width: 26,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.04em",
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
              lineHeight: 1.6,
              whiteSpace: "pre-line",
            }}
          >
            {details}
          </div>
        )}
        {deadline && (
          <div
            style={{
              fontSize: 12,
              color: MUTE,
              marginTop: 8,
              letterSpacing: "0.04em",
            }}
          >
            截止 {formatDate(deadline)}
          </div>
        )}
      </div>
    </li>
  );
}

function feeLabel(base: string, m: Money): string {
  if (m.manually_edited) return base;
  if (m.is_partial) return `${base}（首期）`;
  if (m.is_estimate) return `${base}（估算）`;
  return base;
}

function feeValue(m: Money): string {
  const f = formatMoney(m);
  if (!m.manually_edited && m.is_estimate && f !== "—") return `≈ ${f}`;
  return f;
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
