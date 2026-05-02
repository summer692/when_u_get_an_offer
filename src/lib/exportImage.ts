import { toPng } from "html-to-image";

export interface ExportResult {
  mode: "shared" | "downloaded";
}

/** Render the DOM node to a PNG data URL without downloading it. Used by the
 * preview modal — capture once, show, then optionally download via
 * downloadDataUrl(). */
export async function captureNodeAsDataUrl(node: HTMLElement): Promise<string> {
  return toPng(node, {
    // Internal card is 720×1280 (9:16). 1.5× pixel ratio yields a clean
    // 1080×1920 PNG — the standard mobile-portrait poster size.
    pixelRatio: 1.5,
    cacheBust: true,
    backgroundColor: "#FFFFFF",
  });
}

/** Trigger a browser download / native share of an already-captured PNG. */
export async function downloadDataUrl(
  dataUrl: string,
  filename: string,
): Promise<ExportResult> {
  // Use Web Share API only on touch devices where the share sheet is the
  // expected affordance. On desktop (mouse/trackpad) the share sheet has no
  // "save to file" option, so always trigger a real download.
  const isTouch =
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: coarse)").matches;

  if (isTouch) {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: "image/png" });
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({ files: [file], title: filename });
        return { mode: "shared" };
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") {
          return { mode: "shared" };
        }
      }
    }
  }

  triggerDownload(dataUrl, filename);
  return { mode: "downloaded" };
}

/** Capture-and-download in one shot. Kept for legacy callers; new code
 * should prefer captureNodeAsDataUrl + downloadDataUrl so it can preview. */
export async function exportNodeToImage(
  node: HTMLElement,
  filename: string,
): Promise<ExportResult> {
  const dataUrl = await captureNodeAsDataUrl(node);
  return downloadDataUrl(dataUrl, filename);
}

/** Approximate the byte size of a base64-encoded data URL. Used to show
 * "预计 X MB" in the preview modal. The math is:
 *   base64 chars × 3/4 - padding bytes ≈ binary length
 */
export function estimateDataUrlSize(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(",");
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const padding = (b64.match(/=+$/) || [""])[0].length;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_").trim() || "offer";
}
