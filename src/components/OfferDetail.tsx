import type { Offer } from "../lib/schema";
import { daysUntil, formatDaysLeft } from "../lib/countdown";
import { formatDate, formatMoney } from "../lib/format";

interface Props {
  offer: Offer;
  onBack: () => void;
  onDelete: () => void;
}

export function OfferDetail({ offer, onBack, onDelete }: Props) {
  return (
    <div className="fade-up max-w-4xl mx-auto px-6 py-12">
      <button onClick={onBack} className="btn-ghost mb-10 -ml-3">
        ← 返回
      </button>

      <header className="mb-16">
        <div className="section-label">{offer.country || "—"}</div>
        <h1 className="mt-4 font-display font-semibold text-5xl md:text-6xl tracking-tight">
          {offer.school}
        </h1>
        <p className="mt-4 text-xl md:text-2xl text-ink-500">
          {offer.program}
          {offer.degree && <span className="ml-3">· {offer.degree}</span>}
        </p>
      </header>

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
          <FeeBlock title="学费" value={formatMoney(offer.fees?.tuition)} />
          <FeeBlock title="留位费" value={formatMoney(offer.fees?.deposit)} />
          <FeeBlock
            title="奖学金"
            value={formatMoney(offer.fees?.scholarship)}
            note={offer.fees?.scholarship?.note}
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
  value,
  note,
}: {
  title: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="card p-6">
      <div className="text-sm text-ink-500">{title}</div>
      <div className="mt-2 text-2xl font-display font-semibold tabular">
        {value}
      </div>
      {note && <div className="mt-2 text-xs text-ink-500">{note}</div>}
    </div>
  );
}

function Empty() {
  return <div className="text-ink-500">—</div>;
}
