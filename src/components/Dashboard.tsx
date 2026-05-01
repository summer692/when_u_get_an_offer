import type { Offer } from "../lib/schema";
import { OfferCard } from "./OfferCard";
import { UploadZone } from "./UploadZone";

interface Props {
  offers: Offer[];
  busy: boolean;
  onOpen: (id: string) => void;
  onFile: (file: File) => void;
  onText: (text: string) => void;
  onDelete: (id: string) => void;
}

export function Dashboard({
  offers,
  busy,
  onOpen,
  onFile,
  onText,
  onDelete,
}: Props) {
  return (
    <div className="max-w-6xl mx-auto px-6 pb-24 fade-up">
      <section className="mt-12 mb-20">
        <h1 className="font-display font-medium text-3xl md:text-4xl tracking-tight mb-2">
          上传一份 offer
        </h1>
        <p className="text-sm text-ink-500 mb-8">
          PDF / 图片 / DOCX / 直接粘贴文字均可
        </p>
        <UploadZone onFile={onFile} onText={onText} disabled={busy} />
      </section>

      {offers.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="section-label">历史记录</h2>
            <span className="section-label">{offers.length} 份</span>
          </div>
          <div className="rule mb-4" />
          <div className="grid md:grid-cols-2 gap-px bg-ink-100 dark:bg-ink-700">
            {offers.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                onClick={() => onOpen(o.id)}
                onDelete={() => onDelete(o.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
