import type { UpcomingItem } from "../lib/countdown";
import { formatDaysLeft } from "../lib/countdown";
import { formatDate } from "../lib/format";

interface Props {
  items: UpcomingItem[];
  onSelect?: (offerId: string) => void;
}

export function CountdownHero({ items, onSelect }: Props) {
  if (items.length === 0) {
    return (
      <section className="py-24 text-center">
        <div className="section-label">全部就绪</div>
        <div className="mt-4 text-3xl md:text-4xl font-display font-medium">
          暂无临近的 deadline
        </div>
      </section>
    );
  }

  const hero = items[0];
  const { value, unit } = formatDaysLeft(hero.daysLeft);
  const overdue = hero.daysLeft < 0;
  const urgent = hero.daysLeft >= 0 && hero.daysLeft <= 7;

  return (
    <section className="py-20 md:py-28">
      <button
        onClick={() => onSelect?.(hero.offerId)}
        className="w-full text-left group focus:outline-none"
      >
        <div className="section-label">下一个 deadline</div>
        <div className="mt-6 flex items-baseline gap-4 flex-wrap">
          <div
            className={`tabular font-display font-semibold text-mega leading-none ${
              overdue
                ? "text-red-500"
                : urgent
                ? "text-accent"
                : "text-ink-900 dark:text-ink-100"
            }`}
          >
            {value}
          </div>
          {unit && (
            <div className="text-3xl md:text-4xl font-display font-light text-ink-500">
              {unit}
            </div>
          )}
        </div>
        <div className="mt-6 text-xl md:text-2xl font-display text-ink-700 dark:text-ink-300">
          {hero.label}
          <span className="text-ink-500"> · </span>
          <span className="text-ink-500">{hero.school}</span>
        </div>
        <div className="mt-1 text-sm text-ink-500">{formatDate(hero.date)}</div>
      </button>

      {items.length > 1 && (
        <div className="mt-12 grid md:grid-cols-2 gap-4">
          {items.slice(1).map((item, i) => {
            const f = formatDaysLeft(item.daysLeft);
            return (
              <button
                key={`${item.offerId}-${i}`}
                onClick={() => onSelect?.(item.offerId)}
                className="card card-hover p-6 text-left"
              >
                <div className="section-label">
                  {item.daysLeft < 0 ? "已过期" : "即将到来"}
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="tabular font-display font-semibold text-3xl">
                    {f.value}
                  </span>
                  <span className="text-ink-500">{f.unit}</span>
                </div>
                <div className="mt-2 text-base font-medium truncate">
                  {item.label}
                </div>
                <div className="text-sm text-ink-500 truncate">{item.school}</div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
