import { useCallback, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';

// Whether the desktop rail shows labels, remembered per user on this browser.
// Storage can be missing or throw (private windows, blocked site data); the
// rail then simply starts collapsed.

const storageKey = (userId: number) => `gk.railExpanded.${userId}`;

function readExpanded(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeExpanded(key: string, expanded: boolean) {
  try {
    localStorage.setItem(key, expanded ? '1' : '0');
  } catch {
    // Not remembered; the toggle still works for this page.
  }
}

export function useRailExpanded() {
  const { user } = useAuth();
  const key = storageKey(user.id);
  const [state, setState] = useState(() => ({ key, expanded: readExpanded(key) }));
  // Another user signed in without a reload: read their choice.
  const expanded = state.key === key ? state.expanded : readExpanded(key);

  const toggle = useCallback(() => {
    const next = !expanded;
    writeExpanded(key, next);
    setState({ key, expanded: next });
  }, [expanded, key]);

  return { expanded, toggle };
}
