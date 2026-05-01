import { forwardRef } from "react";
import type { Money, MustDo, Offer } from "../lib/schema";
import { formatDate, formatMoney } from "../lib/format";

interface Props {
  offer: Offer;
  agencyName?: string;
  agencyLogo?: string;
}

const W = 720;

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
        background: "#F5F1EA",
        color: "#1D1D1F",
        fontFamily: fontStack,
        padding: "60px 56px 44px",
        boxSizing: "border-box",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* Brand strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 36,
          minHeight: 32,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#86868B",
            fontWeight: 500,
          }}
        >
          OFFER · {(countryZh || "OVERSEAS").toString()}
        </div>
        {agencyLogo ? (
          <img
            src={agencyLogo}
            alt={agencyName || "agency"}
            style={{ height: 32, width: "auto", objectFit: "contain" }}
            crossOrigin="anonymous"
          />
        ) : agencyName ? (
          <div
            style={{
              fontSize: 12,
              color: "#3A3A3C",
              fontWeight: 500,
              letterSpacing: "0.04em",
            }}
          >
            {agencyName}
          </div>
        ) : null}
      </div>

      {/* Greeting */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          🎉 恭喜你获得录取！
        </div>
        <div style={{ marginTop: 8, fontSize: 15, color: "#86868B" }}>
          以下是录取的详细信息。
        </div>
      </div>

      {/* School name */}
      <h1
        style={{
          fontSize: 56,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          fontWeight: 600,
          margin: 0,
          marginBottom: 8,
          wordBreak: "break-word",
        }}
      >
        {schoolZh}
      </h1>
      {schoolZh !== offer.school && (
        <div
          style={{ fontSize: 14, color: "#86868B", marginBottom: 36 }}
        >
          {offer.school}
        </div>
      )}
      {schoolZh === offer.school && <div style={{ marginBottom: 36 }} />}

      {/* Facts list */}
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: "8px 24px",
          marginBottom: 36,
          boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.04)",
        }}
      >
        <FactRow label="录取专业" value={programZh || offer.program} secondary={programZh ? offer.program : undefined} />
        {termStartDisplay && <FactRow label="入学时间" value={termStartDisplay} />}
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

      {/* info_gaps intentionally omitted from the share image — that's the
          agency's internal checklist, not something to show the client. */}

      {offer.conditions && offer.conditions.length > 0 && (
        <Section title="录取条件">
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {offer.conditions.map((c, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 14,
                  padding: "10px 0",
                  borderBottom:
                    i === offer.conditions!.length - 1
                      ? "none"
                      : "1px solid #E8E2D5",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    color: "#86868B",
                    width: 22,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {i + 1}.
                </span>
                <div style={{ flex: 1, fontSize: 16, lineHeight: 1.5 }}>
                  {c.item}
                  {c.deadline && (
                    <div
                      style={{ fontSize: 13, color: "#86868B", marginTop: 4 }}
                    >
                      截止 {formatDate(c.deadline)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {todos.length > 0 && (
        <Section title="接下来你要做的">
          <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {todos.map((m, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 14,
                  padding: "12px 0",
                  borderBottom:
                    i === todos.length - 1 ? "none" : "1px solid #E8E2D5",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    color: "#86868B",
                    width: 22,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {i + 1}.
                </span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 17,
                      lineHeight: 1.45,
                      color: m.priority === "high" ? "#B91C1C" : "#1D1D1F",
                      fontWeight: m.priority === "high" ? 500 : 400,
                    }}
                  >
                    {m.action}
                  </div>
                  {m.deadline && (
                    <div
                      style={{ fontSize: 13, color: "#86868B", marginTop: 4 }}
                    >
                      截止 {formatDate(m.deadline)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 40,
          paddingTop: 22,
          borderTop: "1px solid #E8E2D5",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          color: "#86868B",
          letterSpacing: "0.02em",
        }}
      >
        <span>{agencyName ? `由 ${agencyName} 整理` : "OfferLens"}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{todayStr}</span>
      </div>
    </div>
  );
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#86868B",
          fontWeight: 500,
          marginBottom: 12,
        }}
      >
        {title}
      </h2>
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
        gap: 16,
        padding: "14px 0",
        borderBottom: isLast ? "none" : "1px solid #F0EAE0",
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: "#86868B",
          width: 90,
          flex: "0 0 90px",
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 17,
            color: "#1D1D1F",
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
              color: "#86868B",
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {secondary}
          </div>
        )}
      </div>
    </div>
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
