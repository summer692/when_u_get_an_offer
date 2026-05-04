import { UploadZone } from "./UploadZone";

interface Props {
  onFile: (file: File) => void;
  onText: (text: string) => void;
  busy?: boolean;
}

export function Hero({ onFile, onText, busy }: Props) {
  return (
    <section className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center px-6 text-center fade-up">
      <h1 className="font-display font-medium text-hero max-w-none whitespace-nowrap tracking-[-0.04em] leading-[0.95]">
        你的 offer，一眼看清。
      </h1>
      <p className="mt-10 text-base md:text-lg text-ink-500 max-w-xl leading-relaxed">
        免登录，上传录取通知书，自动整理截止日期、留位费、待办事项。
      </p>

      <div className="mt-16 w-full max-w-3xl">
        <UploadZone onFile={onFile} onText={onText} disabled={busy} />
      </div>

      <div className="mt-6 text-xs text-ink-500 tracking-wide">
        文件不会离开你的设备 · 只有你能看到
      </div>
    </section>
  );
}
