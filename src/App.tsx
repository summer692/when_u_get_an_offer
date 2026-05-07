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
  DEFAULT_PROVIDER,
  PROVIDERS,
  applyResearch,
  extractOffer,
  extractionCacheKey,
  isEmbeddedMode,
  programIsComplete,
  researchOffer,
} from "./lib/llm";
import { TurnstileWidget } from "./components/TurnstileWidget";
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
import type { ExtractedOffer, Offer, Provider } from "./lib/schema";

const FAST_PATH_DELAY_MS = 1500;

export default function App() {
  useTheme();
  const { offers, loading, add, remove, update } = useOffers();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [quickMode, setQuickMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cloudflare Turnstile token, valid ~5 min. The widget refreshes
  // automatically on expiry; this state holds the latest one.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetCounter, setTurnstileResetCounter] = useState(0);

  const active = offers.find((o) => o.id === activeId) ?? null;

  const ensureKey = useCallback(async () => {
    // Embedded mode: server holds the key. Just need a Turnstile token.
    if (isEmbeddedMode()) {
      if (!turnstileToken) {
        throw new Error(
          "人机验证还没准备好，请等几秒再试（如果一直没好，刷新页面）",
        );
      }
      return {
        apiKey: "",
        provider: "google" as Provider,
        model: undefined,
        turnstileToken,
      };
    }
    // BYOK mode (legacy / dev): user provides key via settings.
    const s = await getSettings();
    const provider = s.provider ?? DEFAULT_PROVIDER;
    const apiKey = s.apiKeys?.[provider] ?? s.apiKey;
    if (!apiKey) {
      setSettingsOpen(true);
      const label =
        provider === "google"
          ? "Google AI Studio"
          : provider === "zhipu"
            ? "智谱 BigModel"
            : "OpenRouter";
      throw new Error(`当前服务商是 ${label}，请在设置中填入它的 API Key`);
    }
    return { apiKey, provider, model: s.model, turnstileToken: undefined };
  }, [turnstileToken]);

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
   * "Yesletter 正在为你快速调取..." instead of an instantaneous flash,
   * then commit the cached extraction as a fresh Offer. */
  const runFromCache = useCallback(
    async (extracted: ExtractedOffer, input: ParsedInput) => {
      setQuickMode(true);
      setStage("Yesletter 正在为你快速调取……");
      await new Promise((r) => setTimeout(r, FAST_PATH_DELAY_MS));
      await persistAndOpen(extracted, input);
    },
    [persistAndOpen],
  );

  /** Normal path: extract via LLM, optionally run research, save. Caller
   * resolves provider/model first so the same trio drives both the cache
   * lookup and the actual API call — picking a different provider must
   * mean a fresh extraction, not a stale cached result. */
  const runFullExtraction = useCallback(
    async (
      input: ParsedInput,
      fileHash: string,
      apiKey: string,
      provider: Provider,
      model: string,
      turnstileToken: string | undefined,
    ) => {
      setQuickMode(false);
      setStage("Yesletter 阅读中，请站在此地不要动......");
      let extracted: ExtractedOffer = await extractOffer(input, {
        apiKey,
        provider,
        model,
        turnstileToken,
        onProgress: () => {
          // Internal fallback / retry messages are intentionally swallowed
          // so the loading copy stays calm and consistent.
        },
      });
      // Embedded mode tokens are one-shot — re-render widget for next use.
      if (isEmbeddedMode()) {
        setTurnstileToken(null);
        setTurnstileResetCounter((n) => n + 1);
      }

      const cacheKey = extractionCacheKey(fileHash, provider, model);
      saveCachedExtraction(cacheKey, extracted).catch((err) =>
        console.warn("L2 cache write failed", err),
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
          setStage("Yesletter 正在查询官网补全信息......");
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
              saveCachedExtraction(cacheKey, extracted).catch((err) =>
                console.warn("L2 refresh failed", err),
              );
            }
          } catch (err) {
            console.warn("research step failed, keeping initial extraction", err);
          }
        }
      }

      await persistAndOpen(extracted, input);
    },
    [persistAndOpen],
  );

  const handleFile = useCallback(
    async (file: File) => {
      try {
        setError(null);
        setQuickMode(false);
        setStage("Yesletter 阅读中，请站在此地不要动......");

        // Resolve provider+model first so we can include them in the
        // cache key. Different (provider, model) trios produce different
        // extractions — they must NOT share cache entries.
        const { apiKey, provider, model, turnstileToken: tt } =
          await ensureKey();
        const resolvedProvider = provider ?? DEFAULT_PROVIDER;
        const resolvedModel = model ?? PROVIDERS[resolvedProvider].defaultModel;

        const fileHash = await hashFileBytes(file);
        const cacheKey = extractionCacheKey(
          fileHash,
          resolvedProvider,
          resolvedModel,
        );

        // L2: a cached extraction means we skip OCR and the LLM call.
        const cachedExtraction = await getCachedExtraction(cacheKey);
        if (cachedExtraction) {
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

        await runFullExtraction(
          parsed,
          fileHash,
          apiKey,
          resolvedProvider,
          resolvedModel,
          tt,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setStage(null);
      }
    },
    [ensureKey, runFromCache, runFullExtraction],
  );

  const handleText = useCallback(
    async (text: string) => {
      try {
        setError(null);
        setQuickMode(false);
        setStage("Yesletter 阅读中,请站在此地不要动......");

        const { apiKey, provider, model, turnstileToken: tt } =
          await ensureKey();
        const resolvedProvider = provider ?? DEFAULT_PROVIDER;
        const resolvedModel = model ?? PROVIDERS[resolvedProvider].defaultModel;

        const textHash = await hashString(text);
        const cacheKey = extractionCacheKey(
          textHash,
          resolvedProvider,
          resolvedModel,
        );

        const cachedExtraction = await getCachedExtraction(cacheKey);
        if (cachedExtraction) {
          await runFromCache(cachedExtraction, parseText(text));
          return;
        }
        await runFullExtraction(
          parseText(text),
          textHash,
          apiKey,
          resolvedProvider,
          resolvedModel,
          tt,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setStage(null);
      }
    },
    [ensureKey, runFromCache, runFullExtraction],
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

      {/* Turnstile widget. In embedded mode, this prepares a token before
          the user uploads. interaction-only appearance keeps the widget
          tucked away unless Cloudflare decides a challenge is needed. */}
      {isEmbeddedMode() && (
        <div className="fixed bottom-4 right-4 z-30 pointer-events-auto">
          <TurnstileWidget
            resetCounter={turnstileResetCounter}
            onToken={setTurnstileToken}
          />
        </div>
      )}
    </div>
  );
}
