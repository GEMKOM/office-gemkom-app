import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  autosavePurchaseRequestDraft,
  type CurrencyRates,
} from '@/api/procurement/purchaseRequests';
import { buildDraftPayload, hasAutosaveContent, STORAGE_KEY, toStorage, type PrState } from './model';

/** dataManager.autoSave debounce. */
export const AUTOSAVE_DELAY = 2000;
/** How long "Otomatik kaydedildi" stays. */
const INDICATOR_MS = 3000;

function safeSetItem(value: string) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage full or blocked: the server autosave still runs.
  }
}

/**
 * The two autosaves of the legacy page: 2 s after the last change the state
 * goes to localStorage (`purchaseRequestDraft`, restored on reload for 24 h)
 * and to the user's single rolling "Oto" server draft (PUT autosave/, skipped
 * when the payload did not change or the page is empty; one request at a
 * time, the next one queued).
 */
export function useAutosave(state: PrState, rates: CurrencyRates | null) {
  const latest = useRef(state);
  const ratesRef = useRef(rates);
  useLayoutEffect(() => {
    latest.current = state;
    ratesRef.current = rates;
  });
  const inFlight = useRef<Promise<void> | null>(null);
  const queued = useRef(false);
  const lastSnapshot = useRef<string | null>(null);
  /** Set by loads and clears: that state change is not an edit. */
  const skipNext = useRef(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const push = useCallback(async (override?: PrState): Promise<void> => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    let current: PrState | undefined = override ?? latest.current;
    // One request at a time; changes made meanwhile go out right after.
    while (current) {
      if (!hasAutosaveContent(current)) return;
      const built = buildDraftPayload(current, ratesRef.current, { strict: false });
      if ('error' in built) return;
      const payload = {
        ...built.payload,
        data: { ...built.payload.data, source_draft: current.savedDraft || null },
      };
      const snapshot = JSON.stringify(payload);
      if (snapshot === lastSnapshot.current) return;
      const run = autosavePurchaseRequestDraft(payload).then(
        () => {
          lastSnapshot.current = snapshot;
        },
        (error: unknown) => console.warn('Server autosave failed:', error),
      );
      inFlight.current = run;
      await run;
      inFlight.current = null;
      current = queued.current ? latest.current : undefined;
      queued.current = false;
    }
  }, []);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      safeSetItem(toStorage(latest.current));
      setSavedAt(Date.now());
      void push();
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [state, push]);

  useEffect(() => {
    if (savedAt === null) return;
    const timer = window.setTimeout(() => setSavedAt(null), INDICATOR_MS);
    return () => window.clearTimeout(timer);
  }, [savedAt]);

  /** flushAutosave: wait for a running push, then push once more now. */
  const flush = useCallback(
    async (override?: PrState) => {
      if (inFlight.current) await inFlight.current;
      queued.current = false;
      await push(override);
    },
    [push],
  );

  /** The next state change comes from a load or clear: store it without a push. */
  const markExternal = useCallback(() => {
    skipNext.current = true;
  }, []);

  const forgetSnapshot = useCallback(() => {
    lastSnapshot.current = null;
  }, []);

  return { flush, markExternal, forgetSnapshot, showIndicator: savedAt !== null };
}
