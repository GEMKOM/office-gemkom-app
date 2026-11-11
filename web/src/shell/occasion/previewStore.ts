import { useSyncExternalStore } from 'react';
import { hasPerm, isAdmin } from '@/auth/authService';
import { resetPreviewSeen } from './occasionModel';

/**
 * Özel gün önizlemesi: HR picks a day on İnsan Kaynakları > Özel Günler and
 * the app behaves as if it were that day (band theme, welcome, the home
 * panel), like impersonation does for a user. It lasts for the tab
 * (sessionStorage), survives reloads, and a banner on every page ends it.
 *
 * The backend honours the date only for HR (is_staff, superuser, manage_hr);
 * for anyone else a stored date is ignored here as well.
 */

const KEY = 'gk.occasion.preview';
const EVENT = 'gk-occasion-preview';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Bumped on every start and end, so starting the same day again is a new
// preview (its welcome shows again) even though the date did not change.
let generation = 0;

/** Whether the signed-in user may preview days (mirrors the backend's is_hr). */
export function canPreviewOccasions(): boolean {
  return isAdmin() || hasPerm('manage_hr');
}

function read(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return value && ISO_DATE.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** The previewed day, or null outside a preview (or for non-HR users). */
export function getOccasionPreview(): string | null {
  const date = read();
  return date && canPreviewOccasions() ? date : null;
}

export function startOccasionPreview(date: string): void {
  if (!ISO_DATE.test(date)) return;
  try {
    sessionStorage.setItem(KEY, date);
  } catch {
    return;
  }
  // Each preview opens with the day's welcome, even a day seen before.
  resetPreviewSeen(date);
  generation += 1;
  window.dispatchEvent(new Event(EVENT));
}

export function endOccasionPreview(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing stored
  }
  generation += 1;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function useOccasionPreview(): string | null {
  return useSyncExternalStore(subscribe, getOccasionPreview, () => null);
}

/**
 * Which preview this is: null outside one, else the day plus a counter that
 * changes on every start, so a restart of the same day is a fresh preview.
 */
export function useOccasionPreviewScope(): string | null {
  const preview = useOccasionPreview();
  const current = useSyncExternalStore(
    subscribe,
    () => generation,
    () => 0,
  );
  return preview ? `${preview}#${current}` : null;
}
