import { useCallback, useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  onText: (text: string) => void;
  disabled?: boolean;
}

export function UploadZone({ onFile, onText, disabled }: Props) {
  const [hover, setHover] = useState(false);
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setHover(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile, disabled]
  );

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex justify-center gap-1 mb-6 p-1 rounded-full bg-ink-100 dark:bg-ink-900 w-fit mx-auto">
        <button
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 ease-apple ${
            mode === "file"
              ? "bg-white dark:bg-black text-ink-900 dark:text-ink-100 shadow-sm"
              : "text-ink-500"
          }`}
          onClick={() => setMode("file")}
          disabled={disabled}
        >
          上传文件
        </button>
        <button
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 ease-apple ${
            mode === "text"
              ? "bg-white dark:bg-black text-ink-900 dark:text-ink-100 shadow-sm"
              : "text-ink-500"
          }`}
          onClick={() => setMode("text")}
          disabled={disabled}
        >
          粘贴文字
        </button>
      </div>

      {mode === "file" ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setHover(true);
          }}
          onDragLeave={() => setHover(false)}
          onDrop={onDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`cursor-pointer rounded-card border-2 border-dashed
            px-8 py-16 text-center transition-all duration-300 ease-apple
            ${
              hover
                ? "border-accent bg-accent/5 scale-[1.01]"
                : "border-ink-300 dark:border-ink-700 hover:border-accent/60"
            }
            ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.txt,.md,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <div className="text-4xl mb-4 text-ink-500">＋</div>
          <div className="text-xl font-display font-medium mb-2">
            拖放 offer 到这里，或点击选择
          </div>
          <div className="text-sm text-ink-500">
            支持 PDF · 图片 · DOCX · 文本
          </div>
        </div>
      ) : (
        <div className="rounded-card border border-ink-300 dark:border-ink-700 overflow-hidden">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="把 offer 邮件或文字粘贴到这里…"
            rows={10}
            disabled={disabled}
            className="w-full p-6 bg-transparent resize-none outline-none text-base
                       placeholder:text-ink-500"
          />
          <div className="flex justify-end p-3 border-t border-ink-100 dark:border-ink-700">
            <button
              className="btn-primary disabled:opacity-50"
              disabled={disabled || !text.trim()}
              onClick={() => onText(text)}
            >
              分析
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
