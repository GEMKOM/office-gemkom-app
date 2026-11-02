import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { PoolRow } from '@/api/procurement/paymentLists';
import { DetailView } from './DetailView';
import { ListsView } from './ListsView';
import { usePaymentModals } from './modals';
import { PoolView } from './PoolView';
import { readRoute, usePaymentNavigate } from './ViewSwitcher';

/**
 * Ödeme Listeleri — weekly supplier payment planning (port of
 * procurement/payment-lists/payment-lists.js).
 *
 *   /procurement/payment-lists/              lists overview
 *   /procurement/payment-lists/?view=pool    Ödeme Havuzu (unpaid instalments, cleanup tools)
 *   /procurement/payment-lists/?list=<id>    one list (items, approval, finance handoff)
 */
export function PaymentListsPage() {
  const [search] = useSearchParams();
  const route = readRoute(search);
  const go = usePaymentNavigate();
  const [modal, openModal] = usePaymentModals();
  // The pool selection outlives a trip to another view (legacy ctx.state.pool.selection).
  const [poolSelection, setPoolSelection] = useState<Map<string, PoolRow>>(() => new Map());

  const openList = (listId: number) => go({ view: 'detail', listId });

  let view;
  if (route.view === 'detail') {
    view = <DetailView key={route.listId} listId={route.listId} openModal={openModal} />;
  } else if (route.view === 'pool') {
    view = <PoolView openModal={openModal} selection={poolSelection} onSelectionChange={setPoolSelection} />;
  } else {
    view = <ListsView openModal={openModal} openList={openList} />;
  }

  return (
    <>
      {view}
      {modal}
    </>
  );
}
