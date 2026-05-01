import { forwardRef } from "react";
import type { Offer } from "../lib/schema";
import { daysUntil, formatDaysLeft } from "../lib/countdown";
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
  const upcoming = pickHeroDate(offer);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(
    today.getDate(),
  )}`;

  const fontStack =
    '"SF Pro Display", "Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';

  return (
    <div
      ref={ref}
      style={{
        width: W,
        background: "#F5F1EA",
        color: "#1D1D1F",
        fontFamily: fontStack,
        padding: "64px 56px 48px",
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
          marginBottom: 56,
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
          OFFER · {offer.country?.toUpperCase() || "OVERSEAS"}
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

      {/* Title */}
      <div style={{ marginBottom: 56 }}>
        <h1
          style={{
            fontSize: 64,
            lineHeight: 1.05,
            letterSpacing: "-0.025em",
            fontWeight: 600,
            margin: 0,
            wordBreak: "break-word",
          }}
        >
          {offer.school}
        </h1>
        <p
          style={{
            marginTop: 18,
            fontSize: 22,
            lineHeight: 1.35,
            color: "#3A3A3C",
            fontWeight: 400,
          }}
        >
          {offer.program}
          {offer.degree ? `  ·  ${offer.degree}` : ""}
          {offer.duration ? `  ·  ${offer.duration}` : ""}
        </p>
      </div>

      {/* Hero countdown */}
      {upcoming && (
        <div
          style={{
            background: "#fff",
            borderRadius: 20,
            padding: "32px 36px",
            marginBottom: 40,
            boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.05)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "#86868B",
              marginBottom: 8,
              letterSpacing: "0.02em",
            }}
          >
            距离「{upcoming.label}」还有
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span
              style={{
                fontSize: 96,
                lineHeight: 1,
                fontWeight: 600,
                letterSpacing: "-0.04em",
                color: upcoming.daysLeft < 0 ? "#D11A2A" : "#0A84FF",
              }}
            >
              {Math.abs(upcoming.daysLeft)}
            </span>
            <span style={{ fontSize: 22, color: "#3A3A3C" }}>
              {upcoming.daysLeft < 0 ? "天前已过" : "天"}
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: "#86868B" }}>
            {formatDate(upcoming.date)}
          </div>
        </div>
      )}

      {/* Key dates */}
      {offer.key_dates && offer.key_dates.length > 0 && (
        <Section title="关键日期">
          <div>
            {offer.key_dates.map((kd, i) => {
              const left = formatDaysLeft(daysUntil(kd.date));
              return (
                <Row
                  key={i}
                  label={kd.label}
                  value={formatDate(kd.date)}
                  trailing={`${left.value}${left.unit ? " " + left.unit : ""}`}
                  isLast={i === offer.key_dates.length - 1}
                />
              );
            })}
          </div>
        </Section>
      )}

      {/* Fees */}
      {hasAnyFee(offer) && (
        <Section title="费用">
          {offer.fees?.tuition && (
            <Row
              label={feeLabel("学费", offer.fees.tuition)}
              value={feeValue(offer.fees.tuition)}
              trailing={offer.fees.tuition.note}
              isLast={!offer.fees?.deposit && !offer.fees?.scholarship}
            />
          )}
          {offer.fees?.deposit && (
            <Row
              label={feeLabel("留位费", offer.fees.deposit)}
              value={feeValue(offer.fees.deposit)}
              trailing={offer.fees.deposit.note}
              isLast={!offer.fees?.scholarship}
            />
          )}
          {offer.fees?.scholarship && (
            <Row
              label={feeLabel("奖学金", offer.fees.scholarship)}
              value={feeValue(offer.fees.scholarship)}
              trailing={offer.fees.scholarship.note}
              isLast
            />
          )}
        </Section>
      )}

      {offer.info_gaps && offer.info_gaps.length > 0 && (
        <div
          style={{
            background: "#FEF3C7",
            border: "1px solid #FCD34D",
            borderRadius: 14,
            padding: "16px 20px",
            marginBottom: 36,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#92400E",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            需要核实
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {offer.info_gaps.map((g, i) => (
              <li
                key={i}
                style={{
                  fontSize: 14,
                  color: "#78350F",
                  lineHeight: 1.5,
                  paddingLeft: 14,
                  position: "relative",
                  marginTop: i === 0 ? 0 : 6,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 8,
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "#D97706",
                  }}
                />
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Must do (top 4) */}
      {offer.must_do && offer.must_do.length > 0 && (
        <Section title="必做事项">
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              counterReset: "todo",
            }}
          >
            {offer.must_do.slice(0, 4).map((m, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 14,
                  padding: "12px 0",
                  borderBottom:
                    i === Math.min(offer.must_do!.length, 4) - 1
                      ? "none"
                      : "1px solid #E8E2D5",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    color: "#86868B",
                    width: 18,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, lineHeight: 1.45 }}>
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
          marginTop: 48,
          paddingTop: 24,
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
    <section style={{ marginBottom: 36 }}>
      <h2
        style={{
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#86868B",
          fontWeight: 500,
          marginBottom: 14,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  trailing,
  isLast,
}: {
  label: string;
  value: string;
  trailing?: string;
  isLast?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 0",
        borderBottom: isLast ? "none" : "1px solid #E8E2D5",
      }}
    >
      <div style={{ fontSize: 16, color: "#1D1D1F", flex: "0 0 auto" }}>
        {label}
      </div>
      <div
        style={{
          flex: 1,
          textAlign: "right",
          fontSize: 16,
          color: "#3A3A3C",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        {trailing && (
          <span style={{ marginLeft: 10, color: "#86868B", fontSize: 13 }}>
            {trailing}
          </span>
        )}
      </div>
    </div>
  );
}

function feeLabel(base: string, m: import("../lib/schema").Money): string {
  if (m.manually_edited) return base;
  if (m.is_partial) return `${base}（首期）`;
  if (m.is_estimate) return `${base}（估算）`;
  return base;
}

function feeValue(m: import("../lib/schema").Money): string {
  const f = formatMoney(m);
  if (!m.manually_edited && m.is_estimate && f !== "—") return `≈ ${f}`;
  return f;
}

function pickHeroDate(offer: Offer) {
  const dates = (offer.key_dates ?? [])
    .filter((k) => k.date)
    .map((k) => ({ ...k, daysLeft: daysUntil(k.date) }))
    .filter((k) => Number.isFinite(k.daysLeft));
  if (!dates.length) return null;
  const future = dates.filter((d) => d.daysLeft >= 0);
  if (future.length) {
    future.sort((a, b) => a.daysLeft - b.daysLeft);
    return future[0];
  }
  dates.sort((a, b) => b.daysLeft - a.daysLeft);
  return dates[0];
}

function hasAnyFee(offer: Offer): boolean {
  const f = offer.fees;
  return Boolean(f?.tuition || f?.deposit || f?.scholarship);
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
