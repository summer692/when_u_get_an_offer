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
import {
  applyResearch,
  extractOffer,
  extractionCacheKey,
  programIsComplete,
  researchOffer,
} from "./lib/llm";
import {
  getCachedExtraction,
  getCachedOcr,
  getCachedResearch,
  getSettings,
  saveCachedExtraction,
  saveCachedOcr,
  saveCachedResearch,
} from "./lib/db";
import { hashFileBytes, hashString, researchCacheKey, uuid } from "./lib/format";
import type { ExtractedOffer, Offer } from "./lib/schema";

const FAST_PATH_DELAY_MS = 1500;

export default function App() {
  useTheme();
  const { offers, loading, add, remove, update } = useOffers();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [quickMode, setQuickMode] = useState(false);
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

  /** Common tail: build the Offer record from a finished ExtractedOffer
   * and save it. Shared between the cache-hit fast path and the normal
   * extraction path so the offer-construction logic stays in one place. */
  const persistAndOpen = useCallback(
    async (extracted: ExtractedOffer, input: ParsedInput) => {
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
    },
    [add],
  );

  /** Cache-hit fast path: run a 1.5s timer so the user perceives
   * "OfferLens 正在为你快速调取..." instead of an instantaneous flash,
   * then commit the cached extraction as a fresh Offer. */
  const runFromCache = useCallback(
    async (extracted: ExtractedOffer, input: ParsedInput) => {
      setQuickMode(true);
      setStage("OfferLens 正在为你快速调取……");
      await new Promise((r) => setTimeout(r, FAST_PATH_DELAY_MS));
      await persistAndOpen(extracted, input);
    },
    [persistAndOpen],
  );

  /** Normal path: extract via LLM, optionally run research, save. Caller
   * is responsible for L1 (OCR) and L2 (extraction) cache lookups before
   * deciding to come here; we still do L3 (research) in here because it
   * runs after extraction and is keyed off the extracted school+program. */
  const runFullExtraction = useCallback(
    async (input: ParsedInput, fileHash: string) => {
      const { apiKey, provider, model } = await ensureKey();
      setQuickMode(false);
      setStage("OfferLens 阅读中，请站在此地不要动......");
      let extracted: ExtractedOffer = await extractOffer(input, {
        apiKey,
        provider,
        model,
        onProgress: () => {
          // Internal fallback / retry messages are intentionally swallowed
          // so the loading copy stays calm and consistent.
        },
      });

      // Write through to L2 immediately so a subsequent re-upload skips
      // the LLM entirely. Failure is non-fatal.
      saveCachedExtraction(extractionCacheKey(fileHash), extracted).catch(
        (err) => console.warn("L2 cache write failed", err),
      );

      const needsResearch =
        (extracted.info_gaps?.length ?? 0) > 0 ||
        extracted.fees?.tuition?.is_partial === true ||
        extracted.fees?.tuition?.is_estimate === true ||
        !extracted.fees?.tuition ||
        !programIsComplete(extracted);

      if (needsResearch && provider === "google") {
        const rkey = researchCacheKey(extracted.school, extracted.program);
        const cachedResearch = await getCachedResearch(rkey);
        if (cachedResearch) {
          // L3 hit — apply silently, no separate stage label needed.
          extracted = applyResearch(extracted, cachedResearch);
        } else {
          setStage("OfferLens 正在查询官网补全信息......");
          try {
            const research = await researchOffer(extracted, { apiKey });
            if (research) {
              extracted = applyResearch(extracted, research);
              saveCachedResearch(rkey, research).catch((err) =>
                console.warn("L3 cache write failed", err),
              );
              // Refresh L2 with the post-research extraction so the next
              // re-upload of the same file pays neither the extraction
              // nor the research cost.
              saveCachedExtraction(
                extractionCacheKey(fileHash),
                extracted,
              ).catch((err) => console.warn("L2 refresh failed", err));
            }
          } catch (err) {
            console.warn("research step failed, keeping initial extraction", err);
          }
        }
      }

      await persistAndOpen(extracted, input);
    },
    [ensureKey, persistAndOpen],
  );

  const handleFile = useCallback(
    async (file: File) => {
      try {
        setError(null);
        setQuickMode(false);
        setStage("OfferLens 阅读中，请站在此地不要动......");

        // Hash the raw file bytes — stable across renders, exact, and
        // available before any expensive work (parseFile / LLM).
        const fileHash = await hashFileBytes(file);

        // L2 first: a cached extraction means we never need to OCR or
        // call the LLM at all.
        const cachedExtraction = await getCachedExtraction(
          extractionCacheKey(fileHash),
        );
        if (cachedExtraction) {
          // Synthesize a minimal ParsedInput so persistAndOpen can stamp
          // the source_kind / source_name fields. We don't need the
          // actual text — the extraction is already done.
          const placeholder: ParsedInput = {
            kind: "pdf",
            text: "",
            images: [],
            sourceName: file.name,
          };
          await runFromCache(cachedExtraction, placeholder);
          return;
        }

        // L1: skip parseFile if we've already OCR'd this file before.
        let parsed = await getCachedOcr(fileHash);
        if (!parsed) {
          parsed = await parseFile(file);
          saveCachedOcr(fileHash, parsed).catch((err) =>
            console.warn("L1 cache write failed", err),
          );
        }

        await runFullExtraction(parsed, fileHash);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setStage(null);
      }
    },
    [runFromCache, runFullExtraction],
  );

  const handleText = useCallback(
    async (text: string) => {
      try {
        setError(null);
        setQuickMode(false);
        setStage("OfferLens 阅读中,请站在此地不要动......");

        // Pasted text has no File object — hash the string itself.
        const textHash = await hashString(text);
        const cachedExtraction = await getCachedExtraction(
          extractionCacheKey(textHash),
        );
        if (cachedExtraction) {
          await runFromCache(cachedExtraction, parseText(text));
          return;
        }
        await runFullExtraction(parseText(text), textHash);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setStage(null);
      }
    },
    [runFromCache, runFullExtraction],
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
        quickMode={quickMode}
        onDismissError={() => setError(null)}
      />
    </div>
  );
}
