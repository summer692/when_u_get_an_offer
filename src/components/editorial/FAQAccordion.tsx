import { useState } from "react";

export interface FAQItem {
  question: string;
  answer: React.ReactNode;
}

interface Props {
  heading?: string;
  items: FAQItem[];
}

export function FAQAccordion({ heading = "常见问题", items }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="bg-paper dark:bg-paper-dark">
      <div className="max-w-[720px] mx-auto px-6 py-24 md:py-32">
        <h2 className="font-display font-medium text-3xl md:text-4xl tracking-tight text-ink-900 dark:text-ink-100 mb-12">
          {heading}
        </h2>
        <ul className="divide-y divide-ink-300/60 dark:divide-ink-700 border-y border-ink-300/60 dark:border-ink-700">
          {items.map((item, i) => {
            const open = openIdx === i;
            return (
              <li key={i}>
                <button
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="w-full flex items-start justify-between gap-6 py-6 text-left group"
                  aria-expanded={open}
                >
                  <span className="text-lg font-medium text-ink-900 dark:text-ink-100 leading-snug">
                    {item.question}
                  </span>
                  <span
                    className={`shrink-0 mt-1 w-6 h-6 rounded-full border border-ink-300 dark:border-ink-700 flex items-center justify-center text-ink-700 dark:text-ink-300 transition-transform duration-300 ease-apple ${
                      open ? "rotate-45" : ""
                    }`}
                    aria-hidden
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10">
                      <path
                        d="M5 1v8M1 5h8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </button>
                <div
                  className={`grid transition-all duration-400 ease-apple ${
                    open
                      ? "grid-rows-[1fr] opacity-100 pb-6"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden text-ink-500 leading-relaxed">
                    {item.answer}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
