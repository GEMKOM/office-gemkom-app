import { Anchor, Text } from '@mantine/core';
import type { MouseEvent } from 'react';
import type { QCReview } from '@/api/quality-control/qcReviews';
import { formatDate, toDate } from '@/lib/format';
import { FaIcon, StatusBadge, type DataTableColumn, type StatusFamily } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

const STATUS_BADGES: Record<string, { color: StatusFamily; label: string }> = {
  pending: { color: 'yellow', label: 'İnceleme Bekliyor' },
  approved: { color: 'green', label: 'Onaylandı' },
  rejected: { color: 'red', label: 'Reddedildi' },
};

export function reviewStatusLabel(value: string | null | undefined): string {
  return (value && STATUS_BADGES[value]?.label) || value || '-';
}

export function ReviewStatusBadge({ status }: { status: string | null | undefined }) {
  const badge = (status && STATUS_BADGES[status]) || {
    color: 'grey' as const,
    label: status || '-',
  };
  return <StatusBadge color={badge.color}>{badge.label}</StatusBadge>;
}

export function isPendingReview(review: Pick<QCReview, 'status'> | null | undefined): boolean {
  return (review?.status || '').toLowerCase() === 'pending';
}

const stop = (event: MouseEvent) => event.stopPropagation();

/** Legacy formatNcrNumberLink: opens the NCR page in a new tab. */
export function NcrLink({ ncrNumber }: { ncrNumber: string | null | undefined }) {
  if (!ncrNumber) return <>-</>;
  return (
    <Anchor
      href={`/quality-control/ncrs/?ncr=${encodeURIComponent(ncrNumber)}`}
      target="_blank"
      size="sm"
      className={uiClasses.code}
      style={{ whiteSpace: 'nowrap' }}
      onClick={stop}
    >
      <FaIcon icon="fas fa-exclamation-triangle" style={{ marginRight: 4 }} />
      {ncrNumber}
    </Anchor>
  );
}

/** Legacy formatOpenNcrCount: grey up to 2, yellow 3–5, red above 5; '-' for none. */
export function OpenNcrCount({ count }: { count: QCReview['open_ncr_count'] }) {
  const n = Number.parseInt(String(count ?? ''), 10) || 0;
  if (n <= 0) return <>-</>;
  return <StatusBadge color={n > 5 ? 'red' : n >= 3 ? 'yellow' : 'grey'}>{n}</StatusBadge>;
}

const DATETIME: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

function person(value: string | null | undefined) {
  return !value || value === '-' ? '-' : <StatusBadge color="grey">{value}</StatusBadge>;
}

export const reviewColumns: DataTableColumn<QCReview>[] = [
  {
    key: 'id',
    header: 'ID',
    sortable: true,
    width: 100,
    render: (row) => (
      <Anchor
        href={`/quality-control/qc-reviews/?review=${row.id}`}
        target="_blank"
        size="sm"
        fw={700}
        className={uiClasses.code}
        onClick={stop}
      >
        #{row.id}
      </Anchor>
    ),
  },
  {
    key: 'job_order',
    header: 'İş Emri',
    sortable: true,
    width: 140,
    render: (row) =>
      row.job_order ? <span className={uiClasses.code}>{row.job_order}</span> : '-',
  },
  {
    key: 'task_title',
    header: 'Görev',
    width: 300,
    render: (row) =>
      row.task_title ? (
        <Text size="sm" fw={600} style={{ overflowWrap: 'break-word' }}>
          {row.task_title}
        </Text>
      ) : (
        '-'
      ),
  },
  {
    key: 'submitted_by_name',
    header: 'Gönderen',
    width: 150,
    render: (row) => person(row.submitted_by_name),
    exportValue: (row) => row.submitted_by_name || '',
  },
  {
    key: 'submitted_at',
    header: 'Gönderilme Tarihi',
    sortable: true,
    width: 180,
    render: (row) => formatDate(row.submitted_at, DATETIME),
    exportValue: (row) => toDate(row.submitted_at),
  },
  {
    key: 'status',
    header: 'Durum',
    sortable: true,
    width: 150,
    render: (row) => <ReviewStatusBadge status={row.status} />,
    exportValue: (row) => reviewStatusLabel(row.status),
  },
  {
    key: 'ncr_number',
    header: 'NCR No',
    width: 160,
    render: (row) => <NcrLink ncrNumber={row.ncr_number} />,
    exportValue: (row) => row.ncr_number || '',
  },
  {
    key: 'open_ncr_count',
    header: 'Açık NCR',
    width: 100,
    render: (row) => <OpenNcrCount count={row.open_ncr_count} />,
  },
  {
    key: 'reviewed_by_name',
    header: 'İnceleyen',
    width: 150,
    render: (row) => person(row.reviewed_by_name),
    exportValue: (row) => row.reviewed_by_name || '',
  },
  {
    key: 'reviewed_at',
    header: 'İnceleme Tarihi',
    width: 180,
    render: (row) => formatDate(row.reviewed_at, DATETIME),
    exportValue: (row) => toDate(row.reviewed_at),
  },
];
