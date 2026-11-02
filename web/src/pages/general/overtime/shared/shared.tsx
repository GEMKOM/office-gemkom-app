import { Group, Stack, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { pendingApprovalCountQueryOptions } from '@/api/general/approvals';
import {
  formatOvertimeDuration,
  overtimeKeys,
  type OvertimeRequest,
  type OvertimeStage,
} from '@/api/general/overtime';
import { formatDate, toDate } from '@/lib/format';
import { FaIcon, StatusBadge, type DataTableColumn, type StatusFamily } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

// Pieces the pending list, the registry and the details modal share (legacy
// pending.js and overtimeList.js each had a copy; the registry imported
// pending/modals.js for the modal).

const STATUS_FAMILY: Record<string, StatusFamily> = {
  approved: 'green',
  submitted: 'yellow',
  rejected: 'red',
  cancelled: 'red',
};

export function OvertimeStatusBadge({
  row,
}: {
  row: Pick<OvertimeRequest, 'status' | 'status_label'>;
}) {
  const family = STATUS_FAMILY[row.status ?? ''] ?? 'grey';
  return <StatusBadge color={family}>{row.status_label || row.status || 'Bilinmiyor'}</StatusBadge>;
}

const ENTRY_FAMILY: Record<string, StatusFamily> = {
  pending: 'yellow',
  approved: 'green',
  rejected: 'red',
};

export function EntryStatusBadge({ status, label }: { status?: string; label?: string }) {
  return (
    <StatusBadge color={ENTRY_FAMILY[status ?? ''] ?? 'grey'}>{label || status || '-'}</StatusBadge>
  );
}

export function RequestNo({ id }: { id: number | string | null | undefined }) {
  return <span className={uiClasses.code}>{id ?? '-'}</span>;
}

/** The legacy table's `type: 'date'` cell: "5 Kas 2026 14:00". */
const TABLE_DATE: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export function tableDate(value: string | null | undefined): string {
  return formatDate(value, TABLE_DATE);
}

/** The stage waiting for approvals: the first one neither complete nor rejected. */
export function currentStage(request: OvertimeRequest): OvertimeStage | undefined {
  return request.approval?.stage_instances?.find(
    (stage) => !stage.is_complete && !stage.is_rejected,
  );
}

/** Text of the "Onay Durumu" cell, for the export. */
export function approvalText(request: OvertimeRequest): string {
  if (!request.approval || request.status !== 'submitted') return '-';
  const stage = currentStage(request);
  if (!stage) return 'Tamamlandı';
  const remaining = (stage.required_approvals ?? 0) - (stage.approved_count ?? 0);
  if (remaining <= 0) return stage.name ?? '';
  return `${stage.name ?? ''} - ${remaining} onay bekleniyor`;
}

/** Port of getApprovalInfo: the current stage, how many approvals it still needs and from whom. */
export function ApprovalInfo({ request }: { request: OvertimeRequest }) {
  if (!request.approval || request.status !== 'submitted') {
    return (
      <Text size="sm" c="dimmed">
        -
      </Text>
    );
  }
  const stage = currentStage(request);
  if (!stage) {
    return (
      <Text size="sm" c="green.8">
        <FaIcon icon="fas fa-check-circle" /> Tamamlandı
      </Text>
    );
  }
  const approved = stage.approved_count ?? 0;
  const remaining = (stage.required_approvals ?? 0) - approved;
  if (remaining <= 0) {
    return (
      <Text size="sm" c="green.8">
        <FaIcon icon="fas fa-check-circle" /> {stage.name}
      </Text>
    );
  }
  const names = (stage.approvers ?? [])
    .slice(approved)
    .map((approver) => approver.full_name || approver.username)
    .filter(Boolean)
    .join(', ');
  return (
    <Stack gap={2} style={{ lineHeight: 1.3 }}>
      <Text size="sm" fw={600}>
        {stage.name}
      </Text>
      <Text size="xs" c="dimmed">
        <FaIcon icon="fas fa-users" /> {remaining} onay bekleniyor
      </Text>
      {names ? (
        <Text size="xs" c="dimmed" style={{ wordBreak: 'break-word' }}>
          <FaIcon icon="fas fa-user-clock" /> {names}
        </Text>
      ) : null}
    </Stack>
  );
}

/** Is the user an approver on any stage of the request? (legacy isApprover) */
export function isOvertimeApprover(
  request: OvertimeRequest,
  userId: number | null | undefined,
): boolean {
  if (!userId) return false;
  return (request.approval?.stage_instances ?? []).some((stage) =>
    (stage.approver_user_ids ?? []).includes(userId),
  );
}

/** Refetch the overtime lists and the hub's pending count after a decision. */
export function useInvalidateOvertime() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: overtimeKeys.all }),
        queryClient.invalidateQueries({
          queryKey: pendingApprovalCountQueryOptions('overtime').queryKey,
        }),
      ]).then(() => undefined),
    [queryClient],
  );
}

export interface RequestColumnOptions {
  /** Legacy pending falls back to entries.length for the participant count; the registry shows 0. */
  countEntries?: boolean;
  /** The registry and the "Onayladığım" table add Oluşturulma. */
  withCreatedAt?: boolean;
}

/** The request table columns shared by the pending tables and the registry. */
export function requestColumns({
  countEntries = false,
  withCreatedAt = false,
}: RequestColumnOptions = {}) {
  const participants = (row: OvertimeRequest) =>
    row.total_users || (countEntries ? (row.entries?.length ?? 0) : 0);
  const columns: DataTableColumn<OvertimeRequest>[] = [
    { key: 'id', header: 'Talep No', sortable: true, render: (row) => <RequestNo id={row.id} /> },
    {
      key: 'requester_username',
      header: 'Talep Eden',
      sortable: true,
      render: (row) => (
        <Group gap={6} wrap="nowrap">
          <FaIcon icon="fas fa-user-circle" style={{ color: 'var(--mantine-color-dimmed)' }} />
          <Text size="sm" fw={500}>
            {row.requester_username || 'Bilinmiyor'}
          </Text>
        </Group>
      ),
      exportValue: (row) => row.requester_username || 'Bilinmiyor',
    },
    {
      key: 'team_label',
      header: 'Departman',
      sortable: true,
      render: (row) => row.team_label || '-',
    },
    {
      key: 'start_at',
      header: 'Başlangıç',
      sortable: true,
      render: (row) => tableDate(row.start_at),
      exportValue: (row) => toDate(row.start_at),
    },
    {
      key: 'end_at',
      header: 'Bitiş',
      sortable: true,
      render: (row) => tableDate(row.end_at),
      exportValue: (row) => toDate(row.end_at),
    },
    {
      key: 'duration_hours',
      header: 'Süre',
      sortable: true,
      accessor: (row) => Number(row.duration_hours ?? 0),
      render: (row) => formatOvertimeDuration(row.duration_hours),
      exportValue: (row) => formatOvertimeDuration(row.duration_hours),
    },
    {
      key: 'total_users',
      header: 'Katılımcı',
      sortable: true,
      accessor: participants,
      render: (row) => `${participants(row)} kişi`,
      exportValue: participants,
    },
    {
      key: 'approval',
      header: 'Onay Durumu',
      sortable: false,
      render: (row) => <ApprovalInfo request={row} />,
      exportValue: approvalText,
    },
    {
      key: 'status',
      header: 'Durum',
      sortable: true,
      render: (row) => <OvertimeStatusBadge row={row} />,
      exportValue: (row) => row.status_label || row.status || '-',
    },
  ];
  if (withCreatedAt) {
    columns.push({
      key: 'created_at',
      header: 'Oluşturulma',
      sortable: true,
      render: (row) => tableDate(row.created_at),
      exportValue: (row) => toDate(row.created_at),
    });
  }
  return columns;
}

/** "5.11.2026 - 5.11.2026" + the rest of the approve confirm's record box. */
export function RequestSummary({ request }: { request: OvertimeRequest }) {
  return (
    <Group gap="lg" wrap="wrap">
      <Text size="sm">
        <b>Talep No:</b> #{request.id}
      </Text>
      <Text size="sm">
        <b>Talep Eden:</b> {request.requester_username || '-'}
      </Text>
      <Text size="sm">
        <b>Mesai Süresi:</b> {formatOvertimeDuration(request.duration_hours)}
      </Text>
      <Text size="sm">
        <b>Tarih:</b> {formatDate(request.start_at)} - {formatDate(request.end_at)}
      </Text>
    </Group>
  );
}

/** ApiError messages fall back to `HTTP <status>`; legacy showed its own text then. */
export function actionError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  return !message || message.startsWith('HTTP ') ? fallback : message;
}
