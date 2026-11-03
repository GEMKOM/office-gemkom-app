import type { LegacyUser } from '@legacy/authService.js';
import type {
  PurchaseRequestListParams,
  PurchaseRequestRow,
  StatusChoice,
} from '@/api/procurement/purchaseRequests';
import type { UserOption } from '@/api/reference/users';
import type { FilterOption } from '@/ui';

export const PROCUREMENT_TEAM_GROUP = 'satn-alma';

export type RegistryFilters = {
  request_number: string;
  requestor: string;
  status: string;
  priority: string;
  created_at__gte: string;
  page: string;
  page_size: string;
};

/** getStatusChoices failed: the legacy fallback list. */
export const FALLBACK_STATUSES: StatusChoice[] = [
  { value: 'draft', label: 'Taslak' },
  { value: 'submitted', label: 'Gönderildi' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal Edildi' },
];

/** Filter values → list params (legacy loadRequests; empty values dropped). */
export function registryParams(values: RegistryFilters): PurchaseRequestListParams {
  const params: PurchaseRequestListParams = {};
  if (values.requestor) params.requestor = values.requestor;
  if (values.status) params.status = values.status;
  if (values.priority) params.priority = values.priority;
  if (values.created_at__gte) params.created_at__gte = values.created_at__gte;
  if (values.request_number.trim()) params.request_number = values.request_number.trim();
  return params;
}

function userName(u: {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}): string {
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username || `Kullanıcı #${u.id}`;
}

/** The procurement team, with the current user first when not a member. */
export function requestorOptions(
  users: readonly UserOption[],
  current: LegacyUser | null | undefined,
): FilterOption[] {
  const options = users.map((u) => ({ value: String(u.id), label: userName(u) }));
  if (current && !options.some((o) => o.value === String(current.id))) {
    options.unshift({ value: String(current.id), label: userName(current) });
  }
  return options;
}

/**
 * The header counts, from the current page's rows as legacy did. Legacy
 * mapped them to the cards by position (Bekleyen showed drafts); each card
 * shows its own status here.
 */
export function registryCounts(rows: readonly PurchaseRequestRow[]) {
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  return {
    all: rows.length,
    submitted: count('submitted'),
    completed: count('completed'),
    cancelled: count('cancelled'),
  };
}
