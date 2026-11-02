import { queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams } from './client';
import { toPaginated } from './types';

// Read side of apis/qualityControl.js, as much as the quality control hub
// needs. The review and NCR pages themselves are still legacy.

export type QCReviewStatus = 'pending' | 'approved' | 'rejected';
export type NCRStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'closed';

/** Every NCR status but closed: the reports someone still has to act on. */
export const OPEN_NCR_STATUSES: NCRStatus[] = ['draft', 'submitted', 'approved', 'rejected'];

export const QUALITY_STALE_TIME = 60_000;

const QC_BASE = '/quality-control';

function countQueryOptions(resource: 'qc-reviews' | 'ncrs', filter: Record<string, string>) {
  const params = { ...filter, page_size: 1 };
  return queryOptions({
    queryKey: ['qualityControl', resource, 'list', cleanParams(params)] as const,
    queryFn: async ({ signal }) =>
      toPaginated<unknown>(await apiFetch<unknown>(`${QC_BASE}/${resource}/`, { params, signal })),
    staleTime: QUALITY_STALE_TIME,
    select: (page) => page.count,
  });
}

/** How many QC reviews match (listQCReviews), from a one-row page. */
export function qcReviewCountQueryOptions(filter: { status?: QCReviewStatus; status__in?: string }) {
  return countQueryOptions('qc-reviews', filter);
}

/** How many NCRs match (listNCRs), from a one-row page. */
export function ncrCountQueryOptions(filter: { status?: NCRStatus; status__in?: string }) {
  return countQueryOptions('ncrs', filter);
}
