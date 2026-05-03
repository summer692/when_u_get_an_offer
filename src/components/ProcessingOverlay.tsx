import { useEffect, useRef, useState } from "react";

interface Props {
  stage: string | null;
  error: string | null;
  onDismissError: () => void;
}

// Fake-timer constants chosen for "calm and predictable" feel:
// 60s linear ramp to 95%, then plateau until real data lands.
const FAKE_DURATION_MS = 60_000;
const FAKE_CEILING = 95;
const TICK_MS = 200;
// Hold the overlay for one tick after the bar hits 100% so the user
// sees the bar fill, not just the overlay vanishing.
const FINISH_FLASH_MS = 250;

/**
 * Replaces the spinner with a deterministic-feeling progress bar.
 *
 * The bar does NOT track real task progress — extraction has fast
 * and slow steps, and surfacing each step's true rate produces a
 * stuttery "0% → 60% jump → stuck → 100%" experience that's worse
 * than a spinner. Instead, fake a steady 0%→95% ramp over 60s and
 * snap to 100% only when the parent flips `stage` back to null.
 *
 * Sub-stage transitions (e.g. extracting → researching → saving)
 * are intentionally invisible to the bar: the timer keeps running
 * across them so progress never visibly resets mid-flight.
 */
export function ProcessingOverlay({ stage, error, onDismissError }: Props) {
  const [progress, setProgress] = useState(0);
  const [showing, setShowing] = useState(false);
  const [lastStage, setLastStage] = useState("");
  const intervalIdRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  // Stash the latest non-null stage so the 100% flash window still has
  // a label to render even after the parent has cleared `stage` to null.
  useEffect(() => {
    if (stage) setLastStage(stage);
  }, [stage]);

  useEffect(() => {
    if (stage) {
      // Start timer on first non-null stage. Subsequent sub-stage updates
      // hit this branch with a timer already running and short-circuit —
      // no progress reset, no double-interval.
      if (intervalIdRef.current === null) {
        startedAtRef.current = Date.now();
        setShowing(true);
        setProgress(0);
        intervalIdRef.current = window.setInterval(() => {
          const elapsed = Date.now() - startedAtRef.current;
          const pct = Math.min(
            FAKE_CEILING,
            (elapsed / FAKE_DURATION_MS) * FAKE_CEILING,
          );
          setProgress(pct);
        }, TICK_MS);
      }
      return;
    }
    // stage just transitioned non-null → null: real data has landed.
    if (intervalIdRef.current !== null) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
      setProgress(100);
      const t = window.setTimeout(() => setShowing(false), FINISH_FLASH_MS);
      return () => clearTimeout(t);
    }
  }, [stage]);

  // Defensive cleanup if the component unmounts mid-load.
  useEffect(() => {
    return () => {
      if (intervalIdRef.current !== null) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, []);

  if (error) {
    return (
      <div className="fixed inset-0 z-40 bg-white/70 dark:bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
        <div className="card p-10 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠</div>
          <div className="text-lg font-medium mb-2">出错了</div>
          <div className="text-sm text-ink-500 mb-6 break-words">{error}</div>
          <button onClick={onDismissError} className="btn-primary">
            知道了
          </button>
        </div>
      </div>
    );
  }

  if (!showing) return null;

  return (
    <div className="fixed inset-0 z-40 bg-white/70 dark:bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
      <div className="card p-10 max-w-md w-full">
        <div className="mb-6 text-base text-ink-700 dark:text-ink-300 text-center">
          {stage || lastStage}
        </div>
        <div className="w-full max-w-[360px] mx-auto h-[3px] rounded-[2px] bg-ink-100 dark:bg-ink-800 overflow-hidden">
          <div
            className="h-full rounded-[2px] bg-ink-900 dark:bg-white"
            style={{
              width: `${progress}%`,
              // Linear so the bar reads as a steady ramp, never elastic.
              // Duration matches TICK_MS so successive ticks chain
              // seamlessly into one continuous slide.
              transition: `width ${TICK_MS}ms linear`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
