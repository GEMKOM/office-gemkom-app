import type { RevisionRequestTask } from '@/api/design/revisionRequests';
import { formatDateTime } from '@/lib/format';
import type { DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

/** "R-12 (Rev. 3)" as the legacy Çizim Yayını column showed it. */
export function releaseLabel(row: RevisionRequestTask): string {
  const request = row.pending_revision_request;
  if (!request?.revision_code) return '-';
  return `${request.revision_code} (Rev. ${request.revision_number || '-'})`;
}

function shortReason(reason: string | null | undefined): string {
  if (!reason) return '-';
  return reason.length > 100 ? `${reason.substring(0, 100)}...` : reason;
}

// Module scope so DataTable rows stay memoized. Legacy headers showed sort
// arrows that did nothing (no onSort); the columns are not sortable here.
export const revisionRequestColumns: DataTableColumn<RevisionRequestTask>[] = [
  {
    key: 'job_order',
    header: 'İş Emri',
    width: '10%',
    render: (row) => <span className={uiClasses.code}>{row.job_order || '-'}</span>,
  },
  { key: 'customer_name', header: 'Müşteri', width: '12%' },
  { key: 'title', header: 'Görev Başlığı', width: '18%' },
  { key: 'drawing_release', header: 'Çizim Yayını', width: '13%', accessor: releaseLabel },
  {
    key: 'revision_request',
    header: 'Revizyon Nedeni',
    width: '23%',
    accessor: (row) => shortReason(row.pending_revision_request?.reason),
  },
  {
    key: 'requested_by',
    header: 'Talep Eden',
    width: '12%',
    accessor: (row) => row.pending_revision_request?.requested_by || '-',
  },
  {
    key: 'requested_at',
    header: 'Talep Tarihi',
    width: '12%',
    accessor: (row) => row.pending_revision_request?.requested_at,
    render: (row) => formatDateTime(row.pending_revision_request?.requested_at),
  },
];
