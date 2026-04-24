export interface Benefit {
  discColor: string; // tailwind bg-* class, e.g. "bg-emerald-400"
  title: string;
  body: string;
}

interface Props {
  heading: React.ReactNode;
  subheading?: string;
  benefits: Benefit[];
}

export function BenefitCards({ heading, subheading, benefits }: Props) {
  return (
    <section className="bg-paper dark:bg-paper-dark">
      <div className="max-w-[1100px] mx-auto px-6 py-24 md:py-32">
        <header className="max-w-2xl mb-14">
          <h2 className="font-display font-medium text-3xl md:text-5xl leading-tight tracking-tight text-ink-900 dark:text-ink-100">
            {heading}
          </h2>
          {subheading && (
            <p className="mt-4 text-lg text-ink-500 leading-relaxed">
              {subheading}
            </p>
          )}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {benefits.map((b, i) => (
            <div
              key={i}
              className="rounded-card bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 p-8 transition-all duration-300 ease-apple hover:-translate-y-0.5"
            >
              <div
                className={`w-9 h-9 rounded-full ${b.discColor} mb-8`}
                aria-hidden
              />
              <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-100">
                {b.title}
              </h3>
              <p className="mt-2 text-sm text-ink-500 leading-relaxed">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
