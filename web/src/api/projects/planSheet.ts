import { backendBase } from '@/lib/backend';
import type { LinkOverrides, PlanSheet, PlanSheetLink, SharedPlanSheet } from '@/features/plan-sheet/types';
import { apiFetch } from '../client';

// The plan sheet ("Plan ve Sapmalar"), from apis/projects/jobOrders.js
// (getJobOrderPlanSheet) and apis/projects/planSheetPublic.js.

/** GET /projects/job-orders/{job_no}/plan-sheet/ (the office session). */
export function getJobOrderPlanSheet(jobNo: string, signal?: AbortSignal): Promise<PlanSheet> {
  return apiFetch<PlanSheet>(`/projects/job-orders/${encodeURIComponent(jobNo)}/plan-sheet/`, { signal });
}

// A share link is opened without the app session: plain fetch, never
// apiFetch, so the public page cannot bounce to the login screen.
const sharedUrl = (token: string) => `${backendBase}/projects/plan-sheet/shared/${encodeURIComponent(token)}/`;

/** GET /projects/plan-sheet/shared/{token}/ → { link, sheet }. `lang` picks
 *  the language of the "not found" message. */
export async function getSharedPlanSheet(
  token: string,
  { lang, signal }: { lang?: string | null; signal?: AbortSignal } = {},
): Promise<SharedPlanSheet> {
  const response = await fetch(sharedUrl(token), { headers: { Accept: 'application/json' }, signal });
  if (response.status === 404) {
    throw new Error(
      lang === 'en' ? 'This link was not found or has expired.' : 'Bu bağlantı bulunamadı ya da süresi dolmuş.',
    );
  }
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return (await response.json()) as SharedPlanSheet;
}

/** PATCH /projects/plan-sheet/shared/{token}/ { overrides } → link (editable
 *  links only: the sales team's adjustments, kept on the link). */
export async function saveSharedPlanSheetOverrides(token: string, overrides: LinkOverrides): Promise<PlanSheetLink> {
  const response = await fetch(sharedUrl(token), {
    method: 'PATCH',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides }),
  });
  if (!response.ok) {
    let message = `HTTP error! status: ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string } | null;
      if (body && body.detail) message = body.detail;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  return (await response.json()) as PlanSheetLink;
}
