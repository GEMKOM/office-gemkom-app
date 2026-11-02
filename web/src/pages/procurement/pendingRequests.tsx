import { useQuery } from '@tanstack/react-query';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { pendingApprovalCountQueryOptions } from '@/api/procurement/purchaseRequests';
import { formatNumber } from '@/lib/format';
import { PendingValue, type PageFigure } from '@/ui';

export const PENDING_REQUESTS_LINK = '/procurement/purchase-requests/pending';

/**
 * Purchase requests awaiting the user's approval, for the procurement hubs.
 * Fetched only when the user may open the pending list; `value` is undefined
 * while it loads and '-' if it failed.
 */
export function usePendingRequests() {
  const canPending = hasRouteAccess(PENDING_REQUESTS_LINK);
  const count = useQuery({ ...pendingApprovalCountQueryOptions(), enabled: canPending });
  const value = count.isError
    ? '-'
    : count.data === undefined
      ? undefined
      : formatNumber(count.data);

  const stats: PageFigure[] = canPending
    ? [
        {
          id: 'pending-requests',
          label: 'Onayınızı Bekleyen',
          value: value ?? <PendingValue />,
          icon: 'fas fa-clock',
          link: PENDING_REQUESTS_LINK,
        },
      ]
    : [];

  return {
    stats,
    /** The card figure, or undefined when the user cannot open the list. */
    stat: canPending ? { value, label: 'talep onayınızı bekliyor' } : undefined,
  };
}
