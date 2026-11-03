import { listCountQueryOptions } from '../counts';

// Counts for the planning hubs, from one-row pages under each list's own key root.

/** Approved department requests waiting for planning to pass them on (approved_requests). */
export function departmentRequestsToTransferCountQueryOptions() {
  return listCountQueryOptions(
    ['departmentRequests', 'approved'],
    '/planning/department-requests/approved_requests/',
  );
}

/** Planning requests in one status (pending_inventory, pending_erp_entry, ready, ...). */
export function planningRequestCountQueryOptions(status: string) {
  return listCountQueryOptions(['planningRequests', 'list'], '/planning/requests/', { status });
}

/** Job orders with an active procurement task and no material cost line yet. */
export function procurementLinesPendingCountQueryOptions() {
  return listCountQueryOptions(
    ['procurementLines', 'pending'],
    '/projects/job-orders/procurement_pending/',
  );
}

/** Stock cards (procurement items of type stock). */
export function stockCardCountQueryOptions() {
  return listCountQueryOptions(
    ['procurementItems', 'list'],
    '/procurement/items/',
    { item_type: 'stock' },
    5 * 60_000,
  );
}

/** Active equipment items. */
export function equipmentCountQueryOptions() {
  return listCountQueryOptions(
    ['equipmentItems', 'list'],
    '/equipment/items/',
    { is_active: true },
    5 * 60_000,
  );
}
