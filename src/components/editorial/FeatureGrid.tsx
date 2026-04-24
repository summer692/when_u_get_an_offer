export interface Feature {
  icon?: React.ReactNode;
  title: string;
  body: string;
}

interface Props {
  heading: React.ReactNode;
  subheading?: string;
  features: Feature[];
  columns?: 2 | 3 | 4;
}

export function FeatureGrid({ heading, subheading, features, columns = 4 }: Props) {
  const gridCols =
    columns === 2
      ? "md:grid-cols-2"
      : columns === 3
      ? "md:grid-cols-3"
      : "md:grid-cols-2 lg:grid-cols-4";

  return (
    <section className="bg-paper dark:bg-paper-dark">
      <div className="max-w-[1100px] mx-auto px-6 py-24 md:py-32">
        <header className="max-w-2xl mb-16">
          <h2 className="font-display font-medium text-3xl md:text-5xl leading-tight tracking-tight text-ink-900 dark:text-ink-100">
            {heading}
          </h2>
          {subheading && (
            <p className="mt-4 text-lg text-ink-500 leading-relaxed">
              {subheading}
            </p>
          )}
        </header>

        <div className={`grid grid-cols-1 ${gridCols} gap-10 md:gap-8`}>
          {features.map((f, i) => (
            <div key={i} className="flex flex-col">
              {f.icon && (
                <div className="w-8 h-8 mb-5 text-accent">{f.icon}</div>
              )}
              <h3 className="text-base font-semibold text-ink-900 dark:text-ink-100">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-ink-500 leading-relaxed">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
