import type { Offer } from "../lib/schema";
import { daysUntil, formatDaysLeft } from "../lib/countdown";
import { formatMoney } from "../lib/format";

interface Props {
  offer: Offer;
  onClick?: () => void;
}

export function OfferCard({ offer, onClick }: Props) {
  const next = nextDeadline(offer);
  const days = next ? formatDaysLeft(daysUntil(next.date)) : null;

  return (
    <button
      onClick={onClick}
      className="card card-hover p-8 text-left w-full group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="section-label">{offer.country || "—"}</div>
          <div className="mt-2 text-2xl font-display font-semibold truncate">
            {offer.school}
          </div>
          <div className="mt-1 text-base text-ink-500 truncate">
            {offer.program}
          </div>
        </div>
        {offer.degree && (
          <span className="shrink-0 text-xs px-3 py-1 rounded-full bg-ink-100 dark:bg-ink-700 text-ink-700 dark:text-ink-300">
            {offer.degree}
          </span>
        )}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6">
        <div>
          <div className="section-label">下一个 deadline</div>
          <div className="mt-2">
            {days ? (
              <>
                <span className="tabular text-2xl font-semibold">
                  {days.value}
                </span>
                <span className="ml-1 text-ink-500">{days.unit}</span>
              </>
            ) : (
              <span className="text-ink-500">—</span>
            )}
          </div>
          {next && (
            <div className="mt-1 text-xs text-ink-500 truncate">
              {next.label}
            </div>
          )}
        </div>
        <div>
          <div className="section-label">学费</div>
          <div className="mt-2 text-2xl font-semibold tabular">
            {formatMoney(offer.fees?.tuition)}
          </div>
        </div>
      </div>
    </button>
  );
}

function nextDeadline(offer: Offer) {
  const candidates = (offer.key_dates ?? [])
    .filter((d) => d.date)
    .map((d) => ({ ...d, days: daysUntil(d.date) }))
    .filter((d) => Number.isFinite(d.days) && d.days >= -30)
    .sort((a, b) => a.days - b.days);
  return candidates[0];
}
