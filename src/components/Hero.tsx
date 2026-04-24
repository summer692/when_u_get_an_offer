import { UploadZone } from "./UploadZone";

interface Props {
  onFile: (file: File) => void;
  onText: (text: string) => void;
  busy?: boolean;
}

export function Hero({ onFile, onText, busy }: Props) {
  return (
    <section className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-6 text-center fade-up">
      <h1 className="font-display font-semibold text-hero max-w-4xl tracking-tight">
        你的 offer，
        <br />
        <span className="bg-gradient-to-r from-accent to-[#5E5CE6] bg-clip-text text-transparent">
          一眼看清。
        </span>
      </h1>
      <p className="mt-8 text-lg md:text-xl text-ink-500 max-w-xl leading-relaxed">
        上传录取通知，我们替你盯着截止日期、押金和必做事项。
      </p>

      <div className="mt-16 w-full">
        <UploadZone onFile={onFile} onText={onText} disabled={busy} />
      </div>

      <div className="mt-10 text-sm text-ink-500">
        文件不会离开你的设备 · 只有你能看到
      </div>
    </section>
  );
}
