import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  findPurchaseRequestByNumber,
  type PurchaseRequestRow,
} from '@/api/procurement/purchaseRequests';
import { notify } from '@/ui';

/**
 * `?talep=<request_number>`: notification e-mails, the daily summary, the
 * purchase orders page and the department task pages link here. Opening a
 * row writes it (a history entry, like legacy pushState) and closing drops it,
 * so Back and Forward open and close the modal.
 *
 * A clicked row's id is known; a deep link is looked up by number with an
 * exact match (legacy pending took the first result of the filter).
 */
export function useTalepDeepLink(noMatchMessage: (talep: string, hadResults: boolean) => string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const talep = searchParams.get('talep');
  const [known, setKnown] = useState<Record<string, number>>({});
  const knownId = talep ? known[talep] : undefined;

  const lookup = useQuery({
    queryKey: ['purchaseRequests', 'byNumber', talep] as const,
    queryFn: ({ signal }) => findPurchaseRequestByNumber(talep!, {}, signal),
    enabled: !!talep && knownId === undefined,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (!talep || knownId !== undefined) return;
    if (lookup.isError) notify.error(`Talep ${talep} bulunamadı`);
    else if (lookup.data && !lookup.data.match) {
      notify.error(noMatchMessage(talep, lookup.data.results.length > 0));
    }
    // Once per lookup result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talep, lookup.data, lookup.isError]);

  const openId = knownId ?? lookup.data?.match?.id ?? null;

  const open = useCallback(
    (row: Pick<PurchaseRequestRow, 'id' | 'request_number'>) => {
      setKnown((prev) => ({ ...prev, [row.request_number]: row.id }));
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('talep', row.request_number);
        return next;
      });
    },
    [setSearchParams],
  );

  const close = useCallback(
    () =>
      setSearchParams((prev) => {
        if (!prev.has('talep')) return prev;
        const next = new URLSearchParams(prev);
        next.delete('talep');
        return next;
      }),
    [setSearchParams],
  );

  return { talep, openId: talep ? openId : null, open, close };
}
