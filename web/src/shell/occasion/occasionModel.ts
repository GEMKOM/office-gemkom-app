import type { Occasion, OccasionKind, OccasionTheme, PersonKind } from '@/api/general/specialDays';
import { isoDate } from '@/lib/workdays';

/**
 * Direction C, "Tema günü": on a special day the band takes the day's colour
 * and motif on every page, and the first visit opens a full-screen welcome.
 * This file holds the rules; OccasionLayer applies them.
 */

/** The band colour per theme (white on each is 7:1 or more, national 5.9:1). */
export const THEME_TONE: Record<OccasionTheme, string> = {
  birthday: '#4a2366',
  anniversary: '#1f3a5f',
  national: '#c8102e',
  religious: '#0d5e58',
  company: '#8b0000',
  soft: '#8a2852',
};

/** Font Awesome icon per occasion, for the welcome and the lists. */
export function occasionIcon(kind: OccasionKind, theme: OccasionTheme): string {
  if (kind === 'birthday') return 'fas fa-cake-candles';
  if (kind === 'work_anniversary') return 'fas fa-award';
  if (theme === 'national') return 'fas fa-star-and-crescent';
  if (theme === 'religious') return 'fas fa-moon';
  return 'fas fa-star';
}

/** Short label for a person's day: "Doğum günü", "10. yıl". */
export function personDayLabel(kind: PersonKind, years: number | null | undefined): string {
  if (kind === 'birthday') return 'Doğum günü';
  return years ? `${years}. yıl` : 'İş yıl dönümü';
}

/**
 * The occasion that sets the look: the backend already orders them (own
 * birthday, own anniversary, public holiday, special day), so the first one.
 */
export function primaryOccasion(occasions: readonly Occasion[]): Occasion | null {
  return occasions[0] ?? null;
}

// ---- Today's theme, remembered for the next page load ----------------------

const THEME_KEY = 'gk.occasion.theme';
const THEMES = new Set<string>(Object.keys(THEME_TONE));

/** The theme stored earlier today in this browser, if any. */
export function cachedTheme(now: Date = new Date()): OccasionTheme | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(THEME_KEY) ?? 'null') as {
      day?: string;
      theme?: string;
    } | null;
    return parsed?.day === isoDate(now) && parsed.theme && THEMES.has(parsed.theme)
      ? (parsed.theme as OccasionTheme)
      : null;
  } catch {
    return null;
  }
}

export function cacheTheme(theme: OccasionTheme | null, now: Date = new Date()): void {
  try {
    if (theme) localStorage.setItem(THEME_KEY, JSON.stringify({ day: isoDate(now), theme }));
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // Storage blocked: the band waits for the API instead.
  }
}

// ---- Which welcomes were already shown --------------------------------------

const SEEN_KEY = 'gk.occasion.seen';

type SeenStore = Record<string, string[]>;

function readSeen(): SeenStore {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as SeenStore)
      : {};
  } catch {
    return {};
  }
}

/** Keys end in the year (`birthday:2026`); older years are dropped on write. */
function keyYear(key: string): number {
  const year = Number(key.split(':').pop());
  return Number.isFinite(year) ? year : 0;
}

export function hasSeen(uid: number, key: string): boolean {
  return (readSeen()[String(uid)] ?? []).includes(key);
}

export function markSeen(uid: number, key: string, now: Date = new Date()): void {
  try {
    const store = readSeen();
    const thisYear = now.getFullYear();
    const kept = (store[String(uid)] ?? []).filter((k) => k !== key && keyYear(k) >= thisYear - 1);
    store[String(uid)] = [...kept, key];
    localStorage.setItem(SEEN_KEY, JSON.stringify(store));
  } catch {
    // Storage blocked: the welcome may show again on the next visit.
  }
}

// A preview remembers its closed welcomes for the tab only (sessionStorage),
// so reloads and other pages don't reopen them; a new preview starts afresh.
const PREVIEW_SEEN_KEY = 'gk.occasion.previewSeen';

function readPreviewSeen(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(PREVIEW_SEEN_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export function hasSeenInPreview(day: string, key: string): boolean {
  return readPreviewSeen().includes(`${day}|${key}`);
}

export function markSeenInPreview(day: string, key: string): void {
  try {
    sessionStorage.setItem(
      PREVIEW_SEEN_KEY,
      JSON.stringify([...readPreviewSeen(), `${day}|${key}`]),
    );
  } catch {
    // Storage blocked: the welcome may show again on the next page load.
  }
}

/** Forget the welcomes closed while previewing `day`, so previewing it again welcomes again. */
export function resetPreviewSeen(day: string): void {
  try {
    const kept = readPreviewSeen().filter((k) => !k.startsWith(`${day}|`));
    sessionStorage.setItem(PREVIEW_SEEN_KEY, JSON.stringify(kept));
  } catch {
    // nothing stored
  }
}

/**
 * Occasions whose welcome is still due, in order. `closed` holds the ones
 * closed on this screen; during a preview (`preview` = the day) the tab's
 * preview list counts instead of the user's stored one.
 */
export function pendingWelcomes(
  uid: number,
  occasions: readonly Occasion[],
  closed: ReadonlySet<string> = new Set(),
  { preview = null }: { preview?: string | null } = {},
): Occasion[] {
  return occasions.filter(
    (o) =>
      o.show_popup &&
      !closed.has(o.key) &&
      (preview ? !hasSeenInPreview(preview, o.key) : !hasSeen(uid, o.key)),
  );
}
