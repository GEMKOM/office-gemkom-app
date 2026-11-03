import { apiFetch } from '@/api/client';
import { extractResults } from '@/api/types';
import type { RemoteOption } from '@/ui';

/** Legacy searchJobOrdersForDropdown: open job orders by number or title, 2+ characters. */
export async function searchJobOrders(term: string, signal?: AbortSignal): Promise<RemoteOption[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  const data = await apiFetch<unknown>('/projects/job-orders/', {
    params: {
      search: t,
      page_size: 20,
      ordering: '-created_at',
      status__in: 'active,draft,on_hold',
    },
    signal,
  });
  return extractResults<{ job_no: string; title?: string }>(data).map((j) => ({
    value: j.job_no,
    label: j.title ? `${j.job_no} — ${j.title}` : j.job_no,
  }));
}

/** The selected job order's option when a form opens on an existing record. */
export function jobOrderSeed(jobNo?: string | null, title?: string | null): RemoteOption[] {
  if (!jobNo) return [];
  return [{ value: jobNo, label: title ? `${jobNo} — ${title}` : jobNo }];
}
