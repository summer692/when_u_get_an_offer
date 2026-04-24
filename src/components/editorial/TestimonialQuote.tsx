interface Props {
  quote: string;
  author: string;
  role?: string;
  rating?: number;
}

export function TestimonialQuote({ quote, author, role, rating = 5 }: Props) {
  return (
    <section className="bg-paper dark:bg-paper-dark">
      <div className="max-w-[640px] mx-auto px-6 py-20 md:py-28 text-center">
        <div className="flex justify-center gap-1 mb-6 text-amber-400">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} filled={i < rating} />
          ))}
        </div>
        <blockquote className="font-display text-2xl md:text-3xl leading-snug text-ink-900 dark:text-ink-100 font-medium">
          "{quote}"
        </blockquote>
        <div className="mt-6 text-sm text-ink-500">
          <span className="font-medium text-ink-700 dark:text-ink-300">{author}</span>
          {role && <span className="ml-2">· {role}</span>}
        </div>
      </div>
    </section>
  );
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      className="inline-block"
    >
      <path d="M12 2l2.5 6.5L21 9.5l-5 4.5 1.5 7L12 17.5 6.5 21 8 14 3 9.5l6.5-1L12 2z" />
    </svg>
  );
}
