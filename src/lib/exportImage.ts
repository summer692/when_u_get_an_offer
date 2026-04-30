import { toPng } from "html-to-image";

export interface ExportResult {
  mode: "shared" | "downloaded";
}

export async function exportNodeToImage(
  node: HTMLElement,
  filename: string,
): Promise<ExportResult> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#F5F1EA",
  });

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
