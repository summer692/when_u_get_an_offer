import { useEffect } from "react";
import { createPortal } from "react-dom";

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
 * Viewport-anchored modal primitive.
 *
 * Rendered through a React Portal into <body> on purpose: OfferDetail's
 * `.fade-up` wrapper has `transform: translate3d(0,0,0)` after its mount
 * animation, and per CSS spec any non-none transform turns the element
 * into the *containing block* for any `position: fixed` descendants. If
 * the modal lived inline, `fixed inset-0` would clip to the wrapper, not
 * the viewport — exactly the "dialog appears at the top of the page"
 * (and worse, "dialog is invisible because we scroll-locked the body
 * before centering inside an offscreen ancestor") bug we hit. Portal
 * escapes the transformed subtree and pins the overlay to the actual
 * viewport.
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

  return createPortal(
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
    </div>,
    document.body,
  );
}
