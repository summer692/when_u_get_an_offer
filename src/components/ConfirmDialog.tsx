import { Modal } from "./Modal";

interface Props {
  open: boolean;
  message: string;
  /** Primary action label. Default "确认". */
  confirmLabel?: string;
  /** Cancel action label. Default "取消". */
  cancelLabel?: string;
  /** "danger" paints the primary button red so destructive actions don't
   * look like routine confirmations. Default "default". */
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  tone = "default",
  onConfirm,
  onCancel,
}: Props) {
  const confirmClass =
    tone === "danger"
      ? "inline-flex items-center justify-center gap-2 rounded-full bg-red-600 hover:bg-red-700 px-6 py-3 text-white text-sm font-medium tracking-wide transition-colors duration-200 ease-apple active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-red-500/40"
      : "btn-primary";
  return (
    <Modal open={open} onClose={onCancel}>
      <div className="p-7 md:p-8">
        <p className="text-base leading-relaxed mb-7 whitespace-pre-line">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="btn-ghost">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className={confirmClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
