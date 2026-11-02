import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import type { DrawingRelease } from '@/api/projects/design';
import { formatDateTime } from '@/lib/format';
import { FaIcon, notify, StatusBadge, type DataTableColumn, type StatusFamily } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

export const COMPLETED_STATUS_CHOICES = [
  { value: 'released', label: 'Yayınlandı' },
  { value: 'rejected', label: 'İnceleme Reddedildi' },
  { value: 'superseded', label: 'Güncelliğini Kaybetti' },
];

const STATUS_FAMILY: Record<string, StatusFamily> = {
  released: 'green',
  rejected: 'red',
  superseded: 'grey',
  pending_approval: 'yellow',
};

export function ReleaseStatusBadge({ release }: { release: DrawingRelease }) {
  return (
    <StatusBadge color={STATUS_FAMILY[release.status ?? ''] ?? 'grey'}>
      {release.status_display || release.status || '-'}
    </StatusBadge>
  );
}

export function revisionLabel(release: DrawingRelease): string {
  return release.revision_code || `Rev.${release.revision_number ?? ''}`;
}

export function approvalProgress(release: DrawingRelease): string {
  const state = release.approval_state;
  return `${state?.approval_count || 0}/${state?.required_count || 2}`;
}

export async function copyFolderPath(path: string | null | undefined) {
  if (!path) {
    notify.error('Kopyalanacak klasör yolu yok');
    return;
  }
  try {
    await navigator.clipboard.writeText(path);
    notify.success('Klasör yolu kopyalandı');
  } catch {
    notify.error('Klasör yolu kopyalanamadı');
  }
}

/** The network folder, cut at 80 characters, with a copy button. */
export function FolderPath({ path }: { path?: string | null }) {
  if (!path) return <Text c="dimmed">-</Text>;
  return (
    <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
      <Text size="sm" truncate title={path} style={{ minWidth: 0, flex: 1 }}>
        {path.length > 80 ? `${path.slice(0, 80)}...` : path}
      </Text>
      <Tooltip label="Klasör yolunu kopyala" withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          aria-label="Klasör yolunu kopyala"
          onClick={(event) => {
            event.stopPropagation();
            void copyFolderPath(path);
          }}
        >
          <FaIcon icon="fas fa-copy" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

const jobColumn: DataTableColumn<DrawingRelease> = {
  key: 'job_order_no',
  header: 'İş Emri',
  sortable: true,
  sortKey: 'job_order__job_no',
  width: 110,
  accessor: 'job_order_no',
  render: (row) => <span className={uiClasses.code}>{row.job_order_no || '-'}</span>,
};

const revisionColumn: DataTableColumn<DrawingRelease> = {
  key: 'revision_code',
  header: 'Revizyon',
  width: 90,
  render: (row) => revisionLabel(row),
};

const releasedByColumn: DataTableColumn<DrawingRelease> = {
  key: 'released_by_name',
  header: 'Oluşturan',
  width: 140,
  render: (row) => row.released_by_name || '-',
};

const folderColumn: DataTableColumn<DrawingRelease> = {
  key: 'folder_path',
  header: 'Klasör Yolu',
  width: 260,
  render: (row) => <FolderPath path={row.folder_path} />,
};

/** "İnceleme Bekleyen Yayınlar" (legacy initializePendingTable); sorted on the client. */
export const pendingColumns: DataTableColumn<DrawingRelease>[] = [
  { ...jobColumn, sortKey: undefined },
  revisionColumn,
  releasedByColumn,
  folderColumn,
  {
    key: 'changelog',
    header: 'Değişiklikler',
    render: (row) =>
      row.changelog
        ? row.changelog.length > 120
          ? `${row.changelog.slice(0, 120)}...`
          : row.changelog
        : '-',
  },
  {
    key: 'approval_state',
    header: 'Değerlendirme',
    width: 110,
    render: (row) => approvalProgress(row),
  },
  {
    key: 'released_at',
    header: 'Tarih',
    sortable: true,
    width: 140,
    accessor: 'released_at',
    render: (row) => (row.released_at ? formatDateTime(row.released_at) : '-'),
  },
];

/** "Tamamlanan İncelemeler" (legacy initializeCompletedTable); sorted on the server. */
export const completedColumns: DataTableColumn<DrawingRelease>[] = [
  jobColumn,
  revisionColumn,
  releasedByColumn,
  {
    key: 'status_display',
    header: 'Sonuç',
    width: 150,
    render: (row) => <ReleaseStatusBadge release={row} />,
  },
  {
    key: 'reviewers_summary',
    header: 'İnceleyenler',
    render: (row) =>
      row.reviewers_summary
        ? row.reviewers_summary.length > 80
          ? `${row.reviewers_summary.slice(0, 80)}...`
          : row.reviewers_summary
        : '-',
  },
  folderColumn,
  {
    key: 'review_completed_at',
    header: 'Tamamlanma',
    sortable: true,
    width: 140,
    render: (row) => (row.review_completed_at ? formatDateTime(row.review_completed_at) : '-'),
  },
];
