import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** "centered" — true viewport-center on all breakpoints (default for
   * confirms). "sheet" — bottom-aligned on mobile, centered on md+ (used by
   * the larger editors so they read as native sheets on phones). */
  variant?: "centered" | "sheet";
  /** When false, backdrop click and ESC do nothing — used for non-dismissable
   * states (e.g. an unfinished export). Default: true. */
  dismissable?: boolean;
  /** Optional max-width tailwind class; defaults vary by variant. */
  widthClass?: string;
}

/**
 * Viewport-anchored modal primitive that fixes the three usability bugs
 * the bespoke modals had:
 *
 *   1. Always centers in the *viewport*, not the document — the content
 *      grid uses min-h-full + flex-center so a deep-scrolled page still
 *      shows the dialog right under the user's eyes. Tall dialogs can
 *      scroll within the overlay instead of overflowing off-screen.
 *
 *   2. Locks <body> scroll while open and restores the previous overflow
 *      value on close. The viewport position is preserved automatically
 *      (no jump back to top).
 *
 *   3. Backdrop click and ESC both fire onClose, so users can dismiss
 *      from anywhere without hunting for the × icon.
 */
export function Modal({
  open,
  onClose,
  children,
  variant = "centered",
  dismissable = true,
  widthClass,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !dismissable) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, dismissable]);

  if (!open) return null;

  const alignClass =
    variant === "sheet"
      ? "items-end md:items-center justify-center p-0 md:p-6"
      : "items-center justify-center p-6";
  const containerWidth =
    widthClass ??
    (variant === "sheet"
      ? "w-full md:max-w-lg"
      : "w-full max-w-md");
  const containerRound =
    variant === "sheet"
      ? "rounded-t-3xl md:rounded-card"
      : "rounded-card";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto"
      onClick={dismissable ? onClose : undefined}
    >
      <div className={`min-h-full flex ${alignClass}`}>
        <div
          className={`${containerWidth} ${containerRound} bg-white dark:bg-black border border-ink-100 dark:border-ink-700 shadow-xl fade-up max-h-[calc(100vh-3rem)] overflow-y-auto`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
