import { Loader } from '@mantine/core';
import { queryOptions } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiFetch, isApiError } from '@/api/client';
import { jobOrderKeys, JOB_ORDERS_STALE_TIME, type JobOrder } from '@/api/projects/jobOrders';
import { FaIcon, StatusBadge, type StatusFamily } from '@/ui';
import css from './JobOrderDetail.module.css';

// Shared bits of the job order detail modal: section frames, the loading /
// error / empty lines every legacy loader drew, badge colours and the one
// read the lead's API module does not cover (the grouped file list).

/** A block with a heading inside a tab (legacy section() / .jo-section). */
export function Section({
  title,
  icon,
  action,
  children,
}: {
  title: ReactNode;
  icon: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={css.section}>
      <h3 className={css.sectionTitle}>
        <span>
          <FaIcon icon={icon} />
          {title}
        </span>
        {action}
      </h3>
      {children}
    </section>
  );
}

/** A titled block of label / value rows (the legacy field-list sections). */
export function FieldSection({
  title,
  icon,
  action,
  muted,
  children,
}: {
  title: ReactNode;
  icon: string;
  action?: ReactNode;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={css.fieldSection}>
      <h4 className={css.fieldSectionTitle} data-muted={muted || undefined}>
        <span>
          <FaIcon icon={icon} /> {title}
        </span>
        {action}
      </h4>
      <dl className={css.fieldList}>{children}</dl>
    </section>
  );
}

export function FieldRow({
  label,
  icon,
  children,
  multiline,
}: {
  label: ReactNode;
  icon: string;
  children: ReactNode;
  multiline?: boolean;
}) {
  return (
    <div className={css.fieldRow} data-multiline={multiline || undefined}>
      <dt>
        <FaIcon icon={icon} /> {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className={css.state}>
      <Loader size="sm" color="gray" />
      <p>Yükleniyor...</p>
    </div>
  );
}

export function ErrorState({ children }: { children: ReactNode }) {
  return (
    <div className={`${css.state} ${css.errorState}`} role="alert">
      <FaIcon icon="fas fa-exclamation-triangle" /> {children}
    </div>
  );
}

export function EmptyState({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <div className={css.state}>
      {icon ? <FaIcon icon={icon} /> : null}
      <div>{children}</div>
    </div>
  );
}

/** Legacy getStatusBadgeClass for job orders. */
export function jobStatusColor(status: string | null | undefined): StatusFamily {
  switch (status) {
    case 'active':
      return 'blue';
    case 'on_hold':
      return 'yellow';
    case 'completed':
      return 'green';
    case 'cancelled':
      return 'red';
    default:
      return 'grey';
  }
}

/** Status cell of the child and phase tables: "Revizyonda" while on hold for a revision. */
export function JobStatusBadge({ row }: { row: Pick<JobOrder, 'status' | 'status_display' | 'hold_kind'> }) {
  const label = row.status_display;
  if (!label || label === '-') return <>-</>;
  if (row.status === 'on_hold' && row.hold_kind === 'revision') {
    return <StatusBadge color="orange">Revizyonda</StatusBadge>;
  }
  return <StatusBadge color={jobStatusColor(row.status)}>{label}</StatusBadge>;
}

/** "41.5%", "0%" when empty (legacy child / phase tables). */
export function percentText(value: unknown): string {
  return value ? `${Number.parseFloat(String(value))}%` : '0%';
}

/** Topic priority colour (legacy getPriorityBadgeClass). */
export function priorityColor(priority: string | null | undefined): StatusFamily {
  switch (priority) {
    case 'urgent':
      return 'red';
    case 'high':
      return 'yellow';
    case 'normal':
      return 'blue';
    default:
      return 'grey';
  }
}

/**
 * Legacy error toasts flattened a DRF error body to "msg, msg"; anything else
 * got the fallback.
 */
export function fieldErrors(error: unknown, fallback: string): string {
  if (isApiError(error) && error.data && typeof error.data === 'object') {
    const values = Array.isArray(error.data) ? error.data : Object.values(error.data);
    const parts = values.flat().filter((v): v is string => typeof v === 'string' && v !== '');
    if (parts.length) return parts.join(', ');
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Files: `/files/` answers `{ job_order_files, offer_files }`, which the lead's
// jobOrderFilesQueryOptions flattens to the first list. The modal shows both.
// ---------------------------------------------------------------------------

export interface JobOrderFileRow {
  id?: number;
  file_url?: string | null;
  url?: string | null;
  file?: string | null;
  /** The real file name, with its extension. */
  filename?: string | null;
  file_name?: string | null;
  /** A category label (e.g. "Talep Dokümanları"), no extension. */
  name?: string | null;
  file_type?: string | null;
  file_type_display?: string | null;
  file_size?: number | null;
  uploaded_at?: string | null;
  uploaded_by_name?: string | null;
  uploaded_by?: string | number | null;
  [key: string]: unknown;
}

export interface JobOrderFileGroups {
  jobOrderFiles: JobOrderFileRow[];
  offerFiles: JobOrderFileRow[];
}

/** Legacy renderFilesTab's reading of the payload; a bare array is job order files. */
export function toFileGroups(data: unknown): JobOrderFileGroups {
  if (Array.isArray(data)) return { jobOrderFiles: data as JobOrderFileRow[], offerFiles: [] };
  if (data && typeof data === 'object') {
    const body = data as Record<string, unknown>;
    return {
      jobOrderFiles: Array.isArray(body.job_order_files)
        ? (body.job_order_files as JobOrderFileRow[])
        : [],
      offerFiles: Array.isArray(body.offer_files) ? (body.offer_files as JobOrderFileRow[]) : [],
    };
  }
  return { jobOrderFiles: [], offerFiles: [] };
}

/** Port of getJobOrderFiles, both groups. Invalidated with jobOrderKeys.files(jobNo). */
export function jobOrderFileGroupsQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: [...jobOrderKeys.files(jobNo), 'groups'] as const,
    queryFn: async ({ signal }) =>
      toFileGroups(
        await apiFetch<unknown>(`/projects/job-orders/${encodeURIComponent(jobNo)}/files/`, {
          signal,
        }),
      ),
    staleTime: JOB_ORDERS_STALE_TIME,
  });
}
