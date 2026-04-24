interface Badge {
  label: string;
  icon?: React.ReactNode;
}

interface Props {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  primaryCta?: { label: string; onClick?: () => void };
  secondaryCta?: { label: string; onClick?: () => void };
  badges?: Badge[];
}

export function EditorialHero({
  eyebrow,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
  badges,
}: Props) {
  return (
    <section className="bg-paper dark:bg-paper-dark">
      <div className="max-w-[760px] mx-auto px-6 pt-24 md:pt-32 pb-20 text-center fade-up">
        {eyebrow && (
          <div className="mb-8 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/60 dark:bg-black/30 border border-ink-100 dark:border-ink-700 text-xs tracking-wider uppercase text-ink-700 dark:text-ink-300">
            {eyebrow}
          </div>
        )}

        <h1 className="font-display font-medium text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.08] tracking-tight text-ink-900 dark:text-ink-100">
          {title}
        </h1>

        {subtitle && (
          <p className="mt-6 text-lg md:text-xl text-ink-500 leading-relaxed max-w-xl mx-auto">
            {subtitle}
          </p>
        )}

        {(primaryCta || secondaryCta) && (
          <div className="mt-10 flex flex-wrap gap-3 justify-center">
            {primaryCta && (
              <button onClick={primaryCta.onClick} className="btn-primary">
                {primaryCta.label}
              </button>
            )}
            {secondaryCta && (
              <button onClick={secondaryCta.onClick} className="btn-ghost">
                {secondaryCta.label} →
              </button>
            )}
          </div>
        )}

        {badges && badges.length > 0 && (
          <div className="mt-12 flex flex-wrap gap-x-6 gap-y-3 justify-center text-sm text-ink-500">
            {badges.map((b, i) => (
              <span key={i} className="inline-flex items-center gap-2">
                {b.icon && <span className="w-4 h-4 text-accent">{b.icon}</span>}
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
