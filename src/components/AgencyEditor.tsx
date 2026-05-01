import { useEffect, useRef, useState } from "react";
import type { Settings } from "../lib/schema";
import { getSettings, setSetting } from "../lib/db";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function AgencyEditor({ open, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    getSettings().then((s: Settings) => {
      setName(s.agencyName ?? "");
      setLogo(s.agencyLogo);
      setError(null);
    });
  }, [open]);

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > 256 * 1024) {
      setError("logo 太大了，请选 256 KB 以内的图片");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    setLogo(dataUrl);
  }

  async function save() {
    await setSetting("agencyName", name.trim() || undefined);
    await setSetting("agencyLogo", logo || undefined);
    onSaved?.();
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-md bg-white dark:bg-black rounded-t-2xl md:rounded-card border border-ink-100 dark:border-ink-700 p-8 fade-up max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-display font-medium tracking-tight">
            分享图品牌
          </h2>
          <button
            onClick={onClose}
            className="text-ink-500 hover:text-ink-900 dark:hover:text-white text-2xl leading-none"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-ink-500 mb-6 leading-relaxed">
          设置后，导出分享图右上角会带上你的公司名/logo，页脚标注「Curated by XX」。
        </p>

        <div className="space-y-6">
          <div>
            <label className="section-label block mb-2">公司名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：星辰留学"
              className="w-full px-4 py-3 bg-ink-100 dark:bg-ink-900 border border-transparent focus:border-ink-900 dark:focus:border-white focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="section-label block mb-2">Logo</label>
            <div className="flex items-center gap-4">
              {logo ? (
                <div className="w-16 h-16 border border-ink-100 dark:border-ink-700 flex items-center justify-center overflow-hidden bg-white dark:bg-black">
                  <img
                    src={logo}
                    alt="logo"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 border border-dashed border-ink-300 dark:border-ink-700 flex items-center justify-center text-ink-300 text-xs">
                  无
                </div>
              )}
              <button
                onClick={() => fileInput.current?.click()}
                className="text-sm underline underline-offset-4"
              >
                {logo ? "更换" : "上传"}
              </button>
              {logo && (
                <button
                  onClick={() => setLogo(undefined)}
                  className="text-sm text-ink-500 hover:text-red-500 transition-colors"
                >
                  移除
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>
            {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
          </div>
        </div>

        <div className="mt-10 flex justify-end gap-3">
          <button onClick={onClose} className="btn-ghost">
            取消
          </button>
          <button onClick={save} className="btn-primary">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
