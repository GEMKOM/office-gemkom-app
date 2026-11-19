import type { NavItem } from '@/shell/navigationStructure';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { useApprovals, userDepartment } from '@/pages/home/approvals';
import { useUnreadCount } from './notifications';

// Attention badges on the menu: the approvals waiting on the user, on the
// entry of each queue and on the sections that hold it (the unread
// notifications have the bell). The counts are the home page's own queries,
// so they are asked for once and shared; nothing polls on top of the bell.

/** Counts older than this are asked for again when the user moves or something new arrives. */
const REFRESH_AFTER_MS = 15_000;

export const isApprovalQuery = (key: readonly unknown[]) =>
  (key[0] === 'home' && key[1] === 'approvals') || (key[0] === 'approvals' && key[1] === 'inbox');

/** Waiting approvals under a menu entry: its own queue plus those of everything below it. */
export function badgeCount(
  path: string,
  item: NavItem,
  waiting: ReadonlyMap<string, number>,
): number {
  let sum = waiting.get(path) ?? 0;
  for (const [childPath, child] of Object.entries(item.children ?? {}))
    sum += badgeCount(childPath, child, waiting);
  return sum;
}

type CountFor = (path: string, item: NavItem) => number;

const NavBadgesContext = createContext<CountFor>(() => 0);

/** Every approval waiting on the user, for the avatar and the Onaylar entry. */
export interface WaitingSummary {
  /** The counts that are in so far, summed. */
  total: number;
  /** Whether the user sits on any queue they can open (the Onaylar page has a tab). */
  anyQueue: boolean;
}

const WaitingContext = createContext<WaitingSummary>({ total: 0, anyQueue: false });

/** Mounted once in the shell; the rail and the drawer read from it. */
export function NavBadgesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const { pathname } = useLocation();
  const unread = useUnreadCount();
  const approvals = useApprovals({ departmentCode: userDepartment(user) });

  // A decision made on a list page is seen once the user moves on, and a new
  // notification (the bell's poll) usually means a new request.
  useEffect(() => {
    void client.refetchQueries({
      predicate: (query) =>
        isApprovalQuery(query.queryKey) &&
        Date.now() - query.state.dataUpdatedAt > REFRESH_AFTER_MS,
    });
  }, [client, pathname, unread.data]);

  const waiting = useMemo(
    () =>
      new Map(
        approvals.items.filter((i) => i.count.data).map((i) => [i.link, i.count.data as number]),
      ),
    [approvals.items],
  );
  const countFor = useMemo<CountFor>(
    () => (path, item) => badgeCount(path, item, waiting),
    [waiting],
  );
  const summary = useMemo<WaitingSummary>(
    () => ({
      total: approvals.items.reduce((sum, i) => sum + (i.count.data ?? 0), 0),
      anyQueue: !approvals.none,
    }),
    [approvals.items, approvals.none],
  );
  return (
    <NavBadgesContext.Provider value={countFor}>
      <WaitingContext.Provider value={summary}>{children}</WaitingContext.Provider>
    </NavBadgesContext.Provider>
  );
}

/** (path, item) -> how many approvals wait under that menu entry; 0 outside the provider. */
export const useNavBadgeCount = () => useContext(NavBadgesContext);

/** Everything waiting on the user across the queues; nothing outside the provider. */
export const useWaitingSummary = () => useContext(WaitingContext);
