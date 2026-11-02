import { Group } from '@mantine/core';
import type { MaterialPullRequest } from '@/api/materialTracking/pullRequests';
import { formatDateTime } from '@/lib/format';
import type { DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { DestinationCell, PullRequestStatusBadge } from '../pullRequestShared';

function NoteCell({ note }: { note: string | undefined }) {
  if (!note) return <>-</>;
  const short = note.length > 40 ? `${note.slice(0, 40)}…` : note;
  return <span title={note}>{short}</span>;
}

function JobNos({ jobNos }: { jobNos: string[] | undefined }) {
  if (!Array.isArray(jobNos) || jobNos.length === 0) return <>-</>;
  return (
    <Group gap={8}>
      {jobNos.map((jobNo) => (
        <span key={jobNo} className={uiClasses.code}>
          {jobNo}
        </span>
      ))}
    </Group>
  );
}

// Module scope so DataTable rows stay memoized. Sortable set = legacy table.
export const pullRequestColumns: DataTableColumn<MaterialPullRequest>[] = [
  {
    key: 'number',
    header: 'Talep No',
    sortable: true,
    render: (row) => <span className={uiClasses.code}>{row.number || '-'}</span>,
  },
  {
    key: 'status',
    header: 'Durum',
    sortable: true,
    render: (row) => <PullRequestStatusBadge status={row.status} label={row.status_label} />,
    exportValue: (row) => row.status_label || row.status,
  },
  {
    key: 'destination_name',
    header: 'Hedef',
    render: (row) => <DestinationCell request={row} />,
  },
  { key: 'item_count', header: 'Kalem', align: 'right' },
  {
    key: 'job_nos',
    header: 'İş Emirleri',
    render: (row) => <JobNos jobNos={row.job_nos} />,
  },
  {
    key: 'requested_by_name',
    header: 'Talep Eden',
    accessor: (row) => row.requested_by_name || row.requested_by_username,
  },
  {
    key: 'requested_at',
    header: 'Talep Tarihi',
    sortable: true,
    render: (row) => formatDateTime(row.requested_at),
    // The sheet keeps the time, as the legacy formatter text did.
    exportValue: (row) => (row.requested_at ? formatDateTime(row.requested_at) : ''),
  },
  {
    key: 'confirmed_by_name',
    header: 'Teslim Eden',
    accessor: (row) => row.confirmed_by_name || row.confirmed_by_username,
  },
  {
    key: 'confirmed_at',
    header: 'Teslim Tarihi',
    sortable: true,
    render: (row) => formatDateTime(row.confirmed_at),
    exportValue: (row) => (row.confirmed_at ? formatDateTime(row.confirmed_at) : ''),
  },
  { key: 'note', header: 'Not', render: (row) => <NoteCell note={row.note} /> },
];
