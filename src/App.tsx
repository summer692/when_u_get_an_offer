import { useCallback, useEffect, useState } from "react";
import { TopBar } from "./components/TopBar";
import { Hero } from "./components/Hero";
import { Dashboard } from "./components/Dashboard";
import { OfferDetail } from "./components/OfferDetail";
import { SettingsSheet } from "./components/SettingsSheet";
import { ProcessingOverlay } from "./components/ProcessingOverlay";
import { useOffers } from "./hooks/useOffers";
import { useTheme } from "./hooks/useTheme";
import { parseFile, parseText, type ParsedInput } from "./lib/parsers";
import { applyResearch, extractOffer, researchOffer } from "./lib/llm";
import { getSettings } from "./lib/db";
import { uuid } from "./lib/format";
import type { ExtractedOffer, Offer } from "./lib/schema";

export default function App() {
  useTheme();
  const { offers, loading, add, remove, update } = useOffers();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = offers.find((o) => o.id === activeId) ?? null;

  const ensureKey = useCallback(async () => {
    const s = await getSettings();
    if (!s.apiKey) {
      setSettingsOpen(true);
      throw new Error("请先在设置中填入 API Key");
    }
    return { apiKey: s.apiKey, provider: s.provider, model: s.model };
  }, []);

  const runExtraction = useCallback(
    async (input: ParsedInput) => {
      try {
        setError(null);
        const { apiKey, provider, model } = await ensureKey();
        setStage("OfferLens 阅读中，请站在此地不要动......");
        let extracted: ExtractedOffer = await extractOffer(input, {
          apiKey,
          provider,
          model,
          // Surface only cache hits to the user (it's a near-instant result,
          // worth telling them); silently swallow fallback / retry chatter
          // so the spinner copy stays calm and consistent.
          onProgress: (msg) => {
            if (msg.startsWith("命中")) setStage(msg);
          },
        });

        const needsResearch =
          (extracted.info_gaps?.length ?? 0) > 0 ||
          extracted.fees?.tuition?.is_partial === true ||
          extracted.fees?.tuition?.is_estimate === true ||
          !extracted.fees?.tuition;

        if (needsResearch && provider === "google") {
          setStage("OfferLens 正在查官网补全......");
          try {
            const research = await researchOffer(extracted, { apiKey });
            if (research) extracted = applyResearch(extracted, research);
          } catch (err) {
            console.warn("research step failed, keeping initial extraction", err);
          }
        }

        setStage("快好了，保存中......");
        const now = Date.now();
        const offer: Offer = {
          ...extracted,
          id: uuid(),
          created_at: now,
          updated_at: now,
          source_kind: input.kind,
          source_name: input.sourceName,
        };
        await add(offer);
        setActiveId(offer.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setStage(null);
      }
    },
    [add, ensureKey]
  );

  const handleFile = useCallback(
    async (file: File) => {
      try {
        setError(null);
        setStage("解析文件…");
        const parsed = await parseFile(file);
        await runExtraction(parsed);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStage(null);
      }
    },
    [runExtraction]
  );

  const handleText = useCallback(
    async (text: string) => {
      await runExtraction(parseText(text));
    },
    [runExtraction]
  );

  useEffect(() => {
    if (activeId && !active && !loading) setActiveId(null);
  }, [activeId, active, loading]);

  return (
    <div className="min-h-screen">
      <TopBar onOpenSettings={() => setSettingsOpen(true)} />

      {active ? (
        <OfferDetail
          offer={active}
          onBack={() => setActiveId(null)}
          onUpdate={update}
          onDelete={async () => {
            await remove(active.id);
            setActiveId(null);
          }}
        />
      ) : offers.length === 0 ? (
        <Hero onFile={handleFile} onText={handleText} busy={!!stage} />
      ) : (
        <Dashboard
          offers={offers}
          busy={!!stage}
          onOpen={setActiveId}
          onFile={handleFile}
          onText={handleText}
          onDelete={remove}
        />
      )}

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ProcessingOverlay
        stage={stage}
        error={error}
        onDismissError={() => setError(null)}
      />
    </div>
  );
}
