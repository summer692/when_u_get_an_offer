import type { Offer } from "../lib/schema";
import { daysUntil, formatDaysLeft } from "../lib/countdown";
import { formatMoney } from "../lib/format";

interface Props {
  offer: Offer;
  onClick?: () => void;
  onDelete?: () => void;
}

export function OfferCard({ offer, onClick, onDelete }: Props) {
  const next = nextDeadline(offer);
  const days = next ? formatDaysLeft(daysUntil(next.date)) : null;
  const schoolZh = offer.school_zh || offer.school;
  const programZh = offer.program_zh || offer.program;
  const countryZh = offer.country_zh || offer.country;

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onDelete) return;
    if (window.confirm(`确认删除「${schoolZh}」这份 offer？`)) {
      onDelete();
    }
  }

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick?.();
      }}
      className="group relative p-7 bg-white dark:bg-black hover:bg-ink-50 dark:hover:bg-ink-900 transition-colors cursor-pointer"
    >
      {onDelete && (
        <button
          onClick={handleDelete}
          aria-label="删除"
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-ink-300 hover:text-red-500 dark:text-ink-700 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}

      <div className="section-label">{countryZh || "—"}</div>
      <div className="mt-3 text-2xl font-display font-medium tracking-tight truncate">
        {schoolZh}
      </div>
      <div className="mt-1.5 text-sm text-ink-500 truncate">{programZh}</div>

      <div className="mt-8 grid grid-cols-2 gap-6">
        <div>
          <div className="section-label">下一个 deadline</div>
          <div className="mt-2">
            {days ? (
              <>
                <span className="tabular text-2xl font-display font-medium">
                  {days.value}
                </span>
                <span className="ml-1 text-sm text-ink-500">{days.unit}</span>
              </>
            ) : (
              <span className="text-ink-500">—</span>
            )}
          </div>
          {next && (
            <div className="mt-1.5 text-xs text-ink-500 truncate tracking-wide">
              {next.label}
            </div>
          )}
        </div>
        <div>
          <div className="section-label">学费</div>
          <div className="mt-2 text-2xl font-display font-medium tabular tracking-tight">
            {formatMoney(offer.fees?.tuition)}
          </div>
        </div>
      </div>
    </div>
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
