import type { QueryParams } from '../client';
import { listCountQueryOptions, listPageQueryOptions } from '../counts';
import type { PurchaseOrder } from '../procurement/purchaseOrders';

// Counts and short lists for the finance, accounting and logistics hubs.

/** Purchase orders in one status; awaiting_payment come earliest-due first. */
export function purchaseOrderCountQueryOptions(status: string) {
  return listCountQueryOptions(['purchaseOrders', 'list'], '/procurement/purchase-orders/', {
    status,
  });
}

/** The orders with the earliest unpaid instalments (the backend's default order). */
export function duePurchaseOrdersQueryOptions(pageSize: number) {
  return listPageQueryOptions<PurchaseOrder>(
    ['purchaseOrders', 'list'],
    '/procurement/purchase-orders/',
    {
      status: 'awaiting_payment',
      page_size: pageSize,
    },
  );
}

/** Unpaid instalments due in a window (every basis; undated ones never match). */
export function instalmentCountQueryOptions(window: { due_after?: string; due_before?: string }) {
  return listCountQueryOptions(['paymentPool', 'list'], '/procurement/payment-pool/', {
    basis: 'all',
    ...window,
  });
}

/** Subcontractor statements for a month in one status. */
export function statementCountQueryOptions(params: {
  year: number;
  month: number;
  status: string;
}) {
  return listCountQueryOptions(
    ['subcontractingStatements', 'list'],
    '/subcontracting/statements/',
    params as QueryParams,
  );
}

/** Job orders with an active logistics task and no shipping cost line yet. */
export function shippingPendingCountQueryOptions() {
  return listCountQueryOptions(
    ['shippingCosts', 'pending'],
    '/projects/job-orders/shipping_pending/',
  );
}
