import type { QueryParams } from '../client';
import { listCountQueryOptions, listPageQueryOptions } from '../counts';
import type { PlanningItem } from '../planning/planningItems';
import type { PoolRow } from './paymentLists';
import type { ProcurementPlanningItem, PurchaseRequestRow } from './purchaseRequests';

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

/**
 * The first requests awaiting the user's approval, newest first; the page's
 * count is the Bekleyen Talepler figure. Under pendingApproval, so approving
 * on the pending page refreshes it.
 */
export function pendingApprovalPageQueryOptions(pageSize: number) {
  return listPageQueryOptions<PurchaseRequestRow & { needed_date?: string | null }>(
    ['purchaseRequests', 'pendingApproval'],
    '/procurement/purchase-requests/pending_approval/',
    { page_size: pageSize },
  );
}

/**
 * Planning items not yet in an active purchase request (what the create
 * page's planning list offers), newest first.
 */
export function requestablePlanningItemsQueryOptions(pageSize: number) {
  return listPageQueryOptions<ProcurementPlanningItem & { quantity_in_active_prs?: string | number | null }>(
    ['planningItems', 'list'],
    '/planning/items/',
    { available_for_procurement: true, ordering: '-id', page_size: pageSize },
  );
}

/** Unpaid instalments due on or before a day (overdue ones too), soonest first. */
export function paymentsDueQueryOptions(dueBefore: string, pageSize: number) {
  return listPageQueryOptions<PoolRow>(['paymentPool', 'list'], '/procurement/payment-pool/', {
    basis: 'all',
    due_before: dueBefore,
    ordering: 'due_date',
    page_size: pageSize,
  });
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
