import type { QueryParams } from '../client';
import { listCountQueryOptions, listPageQueryOptions } from '../counts';
import type { PlanningItem } from '../planning/planningItems';
import type { PurchaseRequestRow } from './purchaseRequests';

// Counts and short lists for the procurement hubs, under each list's own key root.

/** Purchase requests matching the list filters (requestor, status, priority), counted. */
export function purchaseRequestCountQueryOptions(params: QueryParams) {
  return listCountQueryOptions(
    ['purchaseRequests', 'list'],
    '/procurement/purchase-requests/',
    params,
  );
}

/** A user's latest purchase requests. */
export function myPurchaseRequestsQueryOptions(userId: number, pageSize: number) {
  return listPageQueryOptions<PurchaseRequestRow & { needed_date?: string | null }>(
    ['purchaseRequests', 'list'],
    '/procurement/purchase-requests/',
    { requestor: userId, ordering: '-created_at', page_size: pageSize },
  );
}

/** Payment lists in one status (submitted = waiting for the general manager). */
export function paymentListCountQueryOptions(status: string) {
  return listCountQueryOptions(['paymentLists', 'list'], '/procurement/payment-lists/', { status });
}

/** Unpaid instalments due on or before a day (every basis, not only immediate). */
export function overdueInstalmentCountQueryOptions(dueBefore: string) {
  return listCountQueryOptions(['paymentPool', 'list'], '/procurement/payment-pool/', {
    basis: 'all',
    due_before: dueBefore,
  });
}

const CRITICAL = { is_critical: true, is_delivered: false, include_price: false };

/** Critical planning items not yet delivered, as the critical items page lists them. */
export function criticalItemsCountQueryOptions() {
  return listCountQueryOptions(['planningItems', 'list'], '/planning/items/', CRITICAL);
}

/** The latest critical items not yet delivered. */
export function criticalItemsQueryOptions(pageSize: number) {
  return listPageQueryOptions<PlanningItem>(['planningItems', 'list'], '/planning/items/', {
    ...CRITICAL,
    ordering: '-id',
    page_size: pageSize,
  });
}

/** Active suppliers, optionally in one status (approved / watch / blacklisted). */
export function supplierCountQueryOptions(supplierStatus?: string) {
  return listCountQueryOptions(
    ['suppliers', 'list'],
    '/procurement/suppliers/',
    { supplier_status: supplierStatus },
    5 * 60_000,
  );
}
