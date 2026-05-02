import { useEffect } from "react";
import { Modal } from "./Modal";
import { estimateDataUrlSize, formatBytes } from "../lib/exportImage";

export interface PreviewItem {
  /** PNG data URL */
  dataUrl: string;
  /** Filename used for the actual download. */
  filename: string;
}

interface Props {
  open: boolean;
  /** When undefined, the modal shows a loading state ("生成中…"). When the
   * caller has finished capturing all pages it sets the array to flip the
   * modal into preview state. */
  items?: PreviewItem[];
  downloading?: boolean;
  onDownload: () => void;
  onClose: () => void;
}

/**
 * Wraps the export flow with a confirmation step: render the PNGs, show
 * them at scale inside a modal, let the user back out or commit to a
 * download. Uses the shared Modal primitive so it inherits viewport
 * centering, body scroll lock, ESC and backdrop dismiss for free.
 */
export function ExportPreview({
  open,
  items,
  downloading = false,
  onDownload,
  onClose,
}: Props) {
  // Belt-and-suspenders: revoke any object URLs the parent may pass in by
  // mistake (we currently use data URLs which don't need revoking, but if
  // the implementation switches to blob URLs later this is the right hook).
  useEffect(() => {
    if (!open) return;
    return () => {
      /* no-op for data URLs */
    };
  }, [open]);

  const totalBytes = (items ?? []).reduce(
    (sum, it) => sum + estimateDataUrlSize(it.dataUrl),
    0,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      // Wider than a confirm dialog — the preview wants room for an actual
      // 9:16 image at a reasonable size.
      widthClass="w-[60vw] min-w-[min(400px,calc(100vw-2rem))] max-w-[800px]"
    >
      <div className="flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-ink-100 dark:border-ink-700">
          <h2 className="text-lg font-display font-medium tracking-tight">
            预览分享图
          </h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="text-ink-500 hover:text-ink-900 dark:hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-ink-100 dark:bg-ink-900 p-6">
          {!items ? (
            <div className="h-[400px] flex items-center justify-center text-ink-500 text-sm">
              生成中…
            </div>
          ) : items.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center text-ink-500 text-sm">
              没有可预览的图片
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((it, i) => (
                <div key={i} className="relative">
                  <img
                    src={it.dataUrl}
                    alt={`预览 ${i + 1}`}
                    className="w-full h-auto rounded-md shadow-sm border border-ink-200 dark:border-ink-700"
                  />
                  {items.length > 1 && (
                    <div className="absolute top-3 right-3 text-[11px] tabular px-2 py-1 rounded-full bg-black/60 text-white tracking-wider">
                      {i + 1} / {items.length}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 px-7 py-5 border-t border-ink-100 dark:border-ink-700">
          <div className="text-xs text-ink-500 tabular">
            {!items
              ? " "
              : items.length === 1
              ? `1 张图片，约 ${formatBytes(totalBytes)}`
              : `共 ${items.length} 张图片，约 ${formatBytes(totalBytes)}`}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={downloading}
              className="text-sm px-5 py-2 rounded-full border border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-300 hover:border-ink-900 hover:text-ink-900 dark:hover:border-white dark:hover:text-white transition-colors disabled:opacity-60"
            >
              返回编辑
            </button>
            <button
              onClick={onDownload}
              disabled={!items || items.length === 0 || downloading}
              className="btn-primary disabled:opacity-60"
            >
              {downloading
                ? "下载中…"
                : items && items.length > 1
                ? "下载全部"
                : "下载"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
