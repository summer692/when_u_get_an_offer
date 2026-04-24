import { useMemo } from "react";
import type { Offer } from "../lib/schema";
import { collectUpcoming } from "../lib/countdown";
import { CountdownHero } from "./CountdownHero";
import { OfferCard } from "./OfferCard";
import { UploadZone } from "./UploadZone";

interface Props {
  offers: Offer[];
  busy: boolean;
  onOpen: (id: string) => void;
  onFile: (file: File) => void;
  onText: (text: string) => void;
}

export function Dashboard({ offers, busy, onOpen, onFile, onText }: Props) {
  const upcoming = useMemo(() => collectUpcoming(offers, 3), [offers]);

  return (
    <div className="max-w-6xl mx-auto px-6 pb-24 fade-up">
      <CountdownHero items={upcoming} onSelect={onOpen} />

      <section className="mt-8">
        <div className="flex items-baseline justify-between mb-8">
          <h2 className="text-3xl md:text-4xl font-display font-semibold">
            你的 offer
          </h2>
          <div className="text-sm text-ink-500">{offers.length} 份</div>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {offers.map((o) => (
            <OfferCard key={o.id} offer={o} onClick={() => onOpen(o.id)} />
          ))}
        </div>
      </section>

      <section className="mt-24">
        <h2 className="section-label mb-6">添加新的 offer</h2>
        <UploadZone onFile={onFile} onText={onText} disabled={busy} />
      </section>
    </div>
  );
}
