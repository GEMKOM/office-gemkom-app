import type { DepartmentRequest } from '../general/departmentRequests';
import type { LinearCuttingTask } from '../manufacturing/linearCutting';
import { SHOP_FLOOR_STALE_TIME } from '../manufacturing/counts';
import type { JobOrder } from '../projects/jobOrders';
import { listCountQueryOptions, listPageQueryOptions } from '../counts';

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

// ---- the Planlama hub's lead block and lanes ----

/** The first approved department requests waiting to be passed on, as the list shows them (-id). */
export function approvedDepartmentRequestsPageQueryOptions(pageSize: number) {
  return listPageQueryOptions<DepartmentRequest>(
    ['departmentRequests', 'approved'],
    '/planning/department-requests/approved_requests/',
    { ordering: '-id', page_size: pageSize },
  );
}

/** Planning items no purchase request covers yet (the procurement create page's list). */
export function requestablePlanningItemCountQueryOptions() {
  return listCountQueryOptions(['planningItems', 'list'], '/planning/items/', {
    available_for_procurement: true,
  });
}

/** Open CNC cuts not yet in a machine's plan. */
export function unplannedCncCutCountQueryOptions() {
  return listCountQueryOptions(
    ['cncTasks'],
    '/cnc_cutting/tasks/',
    { completion_date__isnull: true, in_plan: false },
    SHOP_FLOOR_STALE_TIME,
  );
}

/** Open linear cutting bars, oldest first: count, plan state and hours come from one page. */
export function openLinearTasksPageQueryOptions(pageSize: number) {
  return listPageQueryOptions<LinearCuttingTask>(
    ['linearCuttingTasks'],
    '/linear_cutting/tasks/',
    { completed: false, ordering: 'created_at', page_size: pageSize },
    SHOP_FLOOR_STALE_TIME,
  );
}

/** Remnant plates with plates left (the remnants page's default list); `unassigned` = never used. */
export function remnantCountQueryOptions(unassigned?: boolean) {
  return listCountQueryOptions(['remnantPlates'], '/cnc_cutting/remnants/', { unassigned });
}

/** Open (active or on hold) top-level job orders, optionally by termin. */
export function openJobOrderCountQueryOptions(termin: { after?: string; before?: string } = {}) {
  return listCountQueryOptions(['jobOrders', 'list'], '/projects/job-orders/', {
    root_only: true,
    status__in: 'active,on_hold',
    target_completion_date__gte: termin.after,
    target_completion_date__lte: termin.before,
  });
}

/** The open job orders by termin, the earliest first. */
export function jobOrdersByTerminQueryOptions(pageSize: number) {
  return listPageQueryOptions<JobOrder>(['jobOrders', 'list'], '/projects/job-orders/', {
    root_only: true,
    status__in: 'active,on_hold',
    ordering: 'target_completion_date',
    page_size: pageSize,
  });
}
