import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults } from '../types';

/**
 * A row of GET /approvals/inbox/: an approval stage waiting on the signed-in
 * user right now, across every approval type. The subject itself only comes
 * as the snapshot taken when it was submitted.
 */
export interface InboxItem {
  workflow_id: number;
  /** "app_label.model", e.g. "procurement.paymentlist". */
  subject_type: string;
  subject_id: number;
  policy_name?: string | null;
  current_stage?: number | null;
  stage_name?: string | null;
  required_approvals?: number | null;
  approved_count?: number | null;
  /** When the workflow started. */
  created_at?: string | null;
  /** Shape differs per subject type; read defensively. */
  snapshot?: Record<string, unknown> | null;
}

/** A minute is fresh enough for the home page; the lists load their own. */
export const INBOX_STALE_TIME = 60_000;

/**
 * Not paginated: a plain array, oldest workflow first. The backend does not
 * leave out stages the user already voted on (quorum above one) nor subjects
 * cancelled outside the workflow, so treat the counts as an upper bound.
 */
export function approvalsInboxQueryOptions() {
  return queryOptions({
    queryKey: ['approvals', 'inbox'] as const,
    queryFn: async ({ signal }) =>
      extractResults<InboxItem>(await apiFetch<unknown>('/approvals/inbox/', { signal })),
    staleTime: INBOX_STALE_TIME,
  });
}
