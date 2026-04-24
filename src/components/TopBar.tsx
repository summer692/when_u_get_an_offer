interface Props {
  onOpenSettings: () => void;
}

export function TopBar({ onOpenSettings }: Props) {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/70 dark:bg-black/60 border-b border-ink-100/60 dark:border-ink-700/50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 font-display font-semibold text-lg tracking-tight">
          <span className="text-accent">◉</span>
          <span>OfferLens</span>
        </div>
        <button onClick={onOpenSettings} className="btn-ghost text-sm">
          设置
        </button>
      </div>
    </header>
  );
}
