import { useCallback, useState } from 'react';

// Pages the user pinned as shortcuts, per user on this browser (like the visit
// counts). Storage can be missing or throw; the pins then last for the session.

/** Enough for one tidy row or two. */
export const MAX_PINS = 12;

const storageKey = (userId: number) => `gk.pinnedPages.${userId}`;

export function readPinned(userId: number): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((route): route is string => typeof route === 'string') : [];
  } catch {
    return [];
  }
}

function writePinned(userId: number, routes: string[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(routes));
  } catch {
    // Not remembered beyond this session.
  }
}

/** The pinned routes, oldest pin first, and a toggle that pins or unpins one. */
export function usePinnedPages(userId: number) {
  const [pinned, setPinned] = useState(() => readPinned(userId));
  const toggle = useCallback(
    (route: string) => {
      setPinned((current) => {
        const next = current.includes(route) ? current.filter((r) => r !== route) : [...current, route].slice(-MAX_PINS);
        writePinned(userId, next);
        return next;
      });
    },
    [userId],
  );
  return { pinned, toggle };
}
