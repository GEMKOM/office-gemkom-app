import {
  daysSince,
  getSeen,
  istanbulDate,
  seenValue,
  setSeen,
} from '@/neo/dailySummaryRender';
import { getDailySummary, getLatestDailySummary, type DailySummaryDetail } from '@/api/assistant';
import { getNeoState, setSummaryPrompt, setUnreadSummary, type UnreadSummary } from './neoStore';

// The morning check: when a user opens the app and today's company brief is
// still unread, a popup (first page of the visit) or a slim banner (any later
// load) offers it, and Neo's entry shows a dot. Same rules, same localStorage
// keys (`ds:*`) and the same server calls as the legacy
// components/daily-summary/daily-summary.js, so a visit that crosses between
// legacy and React pages is asked once, not twice.
//
//   - one GET per 30 minutes per tab (ds:check:<uid>);
//   - summaries older than 3 days are history, not news;
//   - only "Okudum" marks it read; every other way out snoozes: after one
//     snooze today the popup is gone, after two the banner is too, and only
//     the dot remains (ds:snooze:<uid>);
//   - opened from Neo's own list (a deliberate act), any close counts as read.

export const CHECK_TTL_MS = 30 * 60 * 1000;
export const MAX_AGE_DAYS = 3;
export const MODAL_MAX_SNOOZES = 1;
export const BANNER_MAX_SNOOZES = 2;
export const SHOWN_KEY = 'ds:shown';

interface CheckRecord {
  date: string;
  latestId: number | null;
  at: number;
  /** The candidate, so banner and dot survive the throttle without a second GET. */
  unread: UnreadSummary | null;
}

interface SnoozeRecord {
  id: number;
  date: string;
  count: number;
}

const checkKey = (uid: number) => `ds:check:${uid}`;
const snoozeKey = (uid: number) => `ds:snooze:${uid}`;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without storage we just check again next time; one GET is cheap.
  }
}

function snoozeCount(uid: number, id: number, today: string): number {
  const record = readJson<SnoozeRecord>(snoozeKey(uid));
  if (!record || String(record.id) !== String(id) || record.date !== today) return 0;
  const count = Number(record.count);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function wasShownThisSession(id: number): boolean {
  try {
    return sessionStorage.getItem(SHOWN_KEY) === String(id);
  } catch {
    return false;
  }
}

/** The popup for this summary has been up in this tab (legacy or React). */
export function rememberShown(id: number) {
  try {
    sessionStorage.setItem(SHOWN_KEY, String(id));
  } catch {
    // Not remembered.
  }
}

export function liteOf(summary: {
  id: number;
  summary_date?: string | null;
  generated_at?: string | null;
}): UnreadSummary {
  return {
    id: summary.id,
    summary_date: summary.summary_date ?? null,
    generated_at: summary.generated_at ?? null,
  };
}

/**
 * A snooze: "not now". Counts toward today's popup and banner limits and
 * leaves the dot up.
 */
export function snoozeSummary(uid: number, summary: UnreadSummary) {
  const today = istanbulDate();
  writeJson(snoozeKey(uid), {
    id: summary.id,
    date: today,
    count: snoozeCount(uid, summary.id, today) + 1,
  } satisfies SnoozeRecord);
  setSummaryPrompt(null);
  setUnreadSummary(summary);
}

/**
 * Local bookkeeping for a read (the server record is `markDailySummaryRead`).
 * Only the newest summary can be "seen"; reading an older one from the list
 * leaves the dot and tomorrow's popup guard alone.
 */
export function noteSummaryRead(
  uid: number,
  summary: { id: number; generated_at?: string | null },
  { latest }: { latest: boolean },
) {
  if (latest) setSeen(uid, seenValue(summary));
  const last = readJson<CheckRecord>(checkKey(uid));
  if (last?.unread && String(last.unread.id) === String(summary.id)) {
    writeJson(checkKey(uid), { ...last, unread: null });
  }
  setSummaryPrompt(null);
  const unread = getNeoState().unreadSummary;
  if (!unread || unread.id === summary.id) setUnreadSummary(null);
}

export interface CheckOptions {
  uid: number;
  /** A ?bildirim / ?ozet deep link already owns the screen: the dot only. */
  quiet: boolean;
  /** First page of the visit (after sign-in, or a fresh tab): the popup may open. */
  firstPage: boolean;
  /** Another dialog is up; never stack on it. */
  dialogOpen: () => boolean;
  /** The full summary, when the popup is about to open on it (so it needn't fetch it again). */
  onDetail?: (summary: DailySummaryDetail) => void;
  signal?: AbortSignal;
}

/**
 * Asks whether there is an unread, fresh summary and shows it the way the
 * rules above say: store state only (the dot, the prompt), no DOM. Never
 * throws; "nothing to show" is the normal outcome.
 */
export async function runDailySummaryCheck({
  uid,
  quiet,
  firstPage,
  dialogOpen,
  onDetail,
  signal,
}: CheckOptions): Promise<void> {
  try {
    const today = istanbulDate();
    const last = readJson<CheckRecord>(checkKey(uid));
    const cached = !!(last && last.date === today && Date.now() - Number(last.at || 0) < CHECK_TTL_MS);

    let summary: DailySummaryDetail | null = null; // the full row, only when fetched this time
    let lite: UnreadSummary | null;
    if (cached) {
      lite = last?.unread?.id ? last.unread : null;
      if (!lite) return; // nothing unread as of the last check
    } else {
      summary = await getLatestDailySummary(signal);
      lite = summary?.id ? liteOf(summary) : null;
    }
    if (signal?.aborted) return;

    // Written only once the guards below have decided, so a transient block
    // (another dialog) does not silence the next load for 30 minutes.
    const settle = (unread: UnreadSummary | null) =>
      writeJson(checkKey(uid), {
        date: today,
        latestId: summary ? summary.id : (last?.latestId ?? null),
        at: cached && last ? last.at : Date.now(),
        unread,
      } satisfies CheckRecord);

    if (!lite) {
      settle(null);
      return;
    }
    const seen = seenValue(lite);
    if (summary?.is_read) {
      setSeen(uid, seen);
      settle(null);
      return;
    }
    if (getSeen(uid) === seen || daysSince(lite.summary_date) > MAX_AGE_DAYS) {
      settle(null);
      return;
    }

    // Unread and fresh: the dot always, whatever else we decide.
    setUnreadSummary(lite);
    if (quiet) {
      settle(lite);
      return;
    }

    const snoozes = snoozeCount(uid, lite.id, today);
    if (firstPage && !wasShownThisSession(lite.id) && snoozes < MODAL_MAX_SNOOZES) {
      if (dialogOpen()) return; // leave ds:check unwritten so the next load tries again
      if (!summary) {
        summary = await getDailySummary(lite.id, signal);
        if (signal?.aborted) return;
        // Read on another device since the cached check.
        if (summary.is_read) {
          setSeen(uid, seen);
          settle(null);
          setUnreadSummary(null);
          return;
        }
      }
      settle(lite);
      onDetail?.(summary);
      setSummaryPrompt({ kind: 'modal', summary: lite });
      return;
    }
    settle(lite);
    if (snoozes < BANNER_MAX_SNOOZES && !dialogOpen()) {
      setSummaryPrompt({ kind: 'banner', summary: lite });
    }
  } catch (error) {
    if ((error as { name?: string } | null)?.name !== 'AbortError') {
      console.warn('Daily summary check failed:', error);
    }
  }
}
