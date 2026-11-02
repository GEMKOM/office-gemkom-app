import { ActionIcon, Badge, Box, Group, Text, Tooltip } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  attendanceRecordsQueryOptions,
  useDeleteAttendanceSession,
  type AttendanceHrRecord,
  type AttendanceHrSession,
} from '@/api/human_resources/attendanceAdmin';
import { usePositions } from '@/api/human_resources/organization';
import {
  confirm,
  DataTable,
  errorMessage,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type DataTableColumn,
  type DataTableGrouping,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { RecordEditModal, SessionModal, type SessionTarget } from './RecordModals';
import {
  AttendanceStatusBadge,
  firstSession,
  fmtDate,
  fmtTime,
  lastSession,
  minutesText,
  RECORD_STATUS_OPTIONS,
  todayIso,
} from './recordsFormat';

// Legacy built a tree by hand: a record row with a toggle, its sessions and an
// "add session" row under it. Here each record is a collapsed group (its
// header holds the record's cells) and the sessions plus the add row are the
// group's rows.

type SessionRow = {
  kind: 'session';
  recordId: number;
  recordDate: string | null | undefined;
  session: AttendanceHrSession;
};
type AddRow = { kind: 'add'; recordId: number };
type Row = SessionRow | AddRow;

const blankOnAdd =
  (render: (row: SessionRow) => ReactNode) =>
  (row: Row): ReactNode =>
    row.kind === 'add' ? '' : render(row);

const columns: DataTableColumn<Row>[] = [
  {
    key: 'user_display',
    header: 'Kullanıcı',
    render: (row) => {
      if (row.kind === 'add') {
        return (
          <Text size="sm" c="dimmed" fs="italic">
            Yeni oturum ekle
          </Text>
        );
      }
      const { session } = row;
      return (
        <Box pl="md">
          <strong>↳ Oturum #{session.id}</strong>
          <Text size="xs" c="dimmed">
            {session.method_display || session.method || '-'}
          </Text>
          {session.client_ip ? (
            <Text size="xs" c="dimmed">
              IP: {session.client_ip}
            </Text>
          ) : null}
        </Box>
      );
    },
  },
  {
    key: 'date',
    header: 'Tarih',
    render: blankOnAdd((row) => fmtDate(row.session.check_in_time || row.recordDate)),
  },
  {
    key: 'check_in_at',
    header: 'Giriş',
    render: blankOnAdd((row) => fmtTime(row.session.check_in_time)),
  },
  {
    key: 'check_out_at',
    header: 'Çıkış',
    render: blankOnAdd((row) => fmtTime(row.session.check_out_time)),
  },
  {
    key: 'status',
    header: 'Durum',
    render: blankOnAdd((row) => (
      <AttendanceStatusBadge status={row.session.status} display={row.session.status_display} />
    )),
  },
  {
    key: 'override_reason',
    header: 'Açıklama',
    render: blankOnAdd((row) => {
      const reason = row.session.override_reason || '';
      return reason ? <span title={reason}>{reason}</span> : '-';
    }),
  },
  {
    key: 'overtime_hours',
    header: 'Fazla Mesai (dk)',
    // Legacy shows a session's duration in this column.
    render: blankOnAdd((row) => minutesText(row.session.duration_minutes)),
  },
  { key: 'total_present_minutes', header: 'Ofiste (dk)', render: () => '' },
];

/** The record's own cells, lined up with the columns, for its group header. */
function recordCells(
  record: AttendanceHrRecord,
  expanded: boolean,
  onEdit: (record: AttendanceHrRecord) => void,
) {
  const count = record.sessions?.length ?? 0;
  const reasons = (record.sessions ?? [])
    .map((s) => s.override_reason)
    .filter(Boolean)
    .join(' | ');
  return {
    cells: {
      user_display: (
        <Group gap={8} wrap="nowrap" component="span">
          <Badge
            size="sm"
            variant="light"
            color="blue"
            title={expanded ? 'Oturumları gizle' : 'Oturumları göster / ekle'}
          >
            {count > 0 ? count : '+'}
          </Badge>
          <strong>{record.user_display || '-'}</strong>
        </Group>
      ),
      date: fmtDate(record.date || record.first_check_in || firstSession(record)?.check_in_time),
      check_in_at: fmtTime(record.first_check_in || firstSession(record)?.check_in_time),
      check_out_at: fmtTime(record.last_check_out || lastSession(record)?.check_out_time),
      status: <AttendanceStatusBadge status={record.status} display={record.status_display} />,
      override_reason: reasons ? <span title={reasons}>{reasons}</span> : '-',
      overtime_hours: minutesText(record.overtime_minutes),
      total_present_minutes: minutesText(record.total_present_minutes),
      _actions: (
        <Tooltip label="Kaydı Düzenle" withinPortal>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Kaydı Düzenle"
            onClick={(event) => {
              // The header row toggles the group; the button must not.
              event.stopPropagation();
              onEdit(record);
            }}
          >
            <FaIcon icon="fas fa-edit" />
          </ActionIcon>
        </Tooltip>
      ),
    },
  };
}

type FilterKeys =
  'name' | 'date' | 'date_from' | 'date_to' | 'user_id' | 'username' | 'group_id' | 'status';
type FilterState = Record<FilterKeys, string>;

const EMPTY_RECORDS: AttendanceHrRecord[] = [];

/** Port of human_resources/attendance/records (records.js). */
export function AttendanceRecordsPage() {
  // Tarih defaults to today; Temizle drops every filter, the date too (legacy).
  const [today] = useState(todayIso);
  const { values, apply } = useUrlFilters<FilterState>({
    name: '',
    date: today,
    date_from: '',
    date_to: '',
    user_id: '',
    username: '',
    group_id: '',
    status: '',
  });

  const positions = usePositions();
  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      { type: 'text', key: 'name', label: 'Ad/Soyad', placeholder: 'Ad/Soyad (örn: Ahmet)' },
      { type: 'date', key: 'date', label: 'Tarih' },
      { type: 'date', key: 'date_from', label: 'Başlangıç' },
      { type: 'date', key: 'date_to', label: 'Bitiş' },
      {
        type: 'text',
        key: 'user_id',
        label: 'Kullanıcı ID',
        placeholder: 'Örn: 5',
        inputType: 'number',
      },
      { type: 'text', key: 'username', label: 'Kullanıcı adı', placeholder: 'Örn: john' },
      {
        type: 'select',
        key: 'group_id',
        label: 'Grup',
        placeholder: 'Tümü',
        searchable: true,
        // The active positions, as legacy loadGroups filled it.
        options: (positions.data ?? [])
          .filter((p) => p.is_active !== false)
          .map((p) => ({ value: String(p.id), label: p.title || String(p.id) })),
      },
      {
        type: 'select',
        key: 'status',
        label: 'Durum',
        placeholder: 'Tümü',
        searchable: false,
        options: RECORD_STATUS_OPTIONS,
      },
    ],
    [positions.data],
  );

  const list = useQuery({
    ...attendanceRecordsQueryOptions(values),
    placeholderData: keepPreviousData,
  });
  const records = list.data ?? EMPTY_RECORDS;

  useEffect(() => {
    if (list.isError) notify.error(`Kayıtlar yüklenemedi: ${errorMessage(list.error)}`);
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const recordsById = useMemo(() => new Map(records.map((r) => [r.id, r])), [records]);
  const rows = useMemo<Row[]>(
    () =>
      records.flatMap((record): Row[] => [
        ...(record.sessions ?? []).map((session): Row => ({
          kind: 'session',
          recordId: record.id,
          recordDate: record.date,
          session,
        })),
        // Every record gets the add row, so an empty record still has a group.
        { kind: 'add', recordId: record.id },
      ]),
    [records],
  );

  const [editingRecord, setEditingRecord] = useState<AttendanceHrRecord | null>(null);
  const [sessionTarget, setSessionTarget] = useState<SessionTarget | null>(null);

  const grouping = useMemo<DataTableGrouping<Row>>(
    () => ({
      by: (row) => row.recordId,
      sort: false,
      defaultExpanded: false,
      header: (group) => {
        const record = recordsById.get(group.value as number);
        return record ? recordCells(record, group.expanded, setEditingRecord) : null;
      },
    }),
    [recordsById],
  );

  const remove = useDeleteAttendanceSession();
  const deleteSession = async (session: AttendanceHrSession) => {
    const ok = await confirm({
      title: 'Oturumu Sil',
      message: `Oturum #${session.id} silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(session.id);
      notify.success('Oturum silindi');
    } catch (error) {
      notify.error(`Silme başarısız: ${errorMessage(error)}`);
    }
  };

  const rowActions = (row: Row): RowAction<Row>[] =>
    row.kind === 'add'
      ? [
          {
            key: 'add-session',
            label: 'Oturum Ekle',
            icon: 'fas fa-plus',
            color: 'success',
            onClick: () => setSessionTarget({ type: 'add', recordId: row.recordId }),
          },
        ]
      : [
          {
            key: 'edit-session',
            label: 'Düzenle',
            icon: 'fas fa-pen',
            color: 'secondary',
            onClick: () => setSessionTarget({ type: 'edit', session: row.session }),
          },
          {
            key: 'delete-session',
            label: 'Sil',
            icon: 'fas fa-trash',
            color: 'danger',
            onClick: () => void deleteSession(row.session),
          },
        ];

  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));
  const sessionCount = records.reduce((sum, r) => sum + (r.sessions?.length ?? 0), 0);
  const pendingCount = records.filter(
    (r) => r.status === 'pending_override' || r.status === 'pending_checkout_override',
  ).length;

  return (
    <>
      <PageHeader
        title="PDKS Kayıtları"
        subtitle="Kayıtları filtreleyin ve inceleyin"
        icon="fas fa-clipboard-list"
        backTo="/human_resources"
        stats={[
          { id: 'records-count', label: 'Kayıt', value: figure(records.length) },
          { id: 'sessions-count', label: 'Oturum', value: figure(sessionCount) },
          { id: 'pending-count', label: 'HR Onayı Bekleyen', value: figure(pendingCount) },
        ]}
      />

      <DataTable
        // New filters start with every record collapsed again (legacy cleared expandedRecordIds).
        key={JSON.stringify(values)}
        title="PDKS Kayıtları"
        icon="fas fa-clipboard-list"
        filters={<FilterBar inline filters={filterConfig} values={values} onApply={apply} />}
        data={rows}
        columns={columns}
        getRowId={(row) =>
          row.kind === 'add' ? `add-${row.recordId}` : `session-${row.session.id}`
        }
        grouping={grouping}
        loading={list.isFetching}
        rowActions={rowActions}
        rowStyle={(row) => ({
          background: row.kind === 'add' ? 'var(--gk-surface-subtle)' : undefined,
        })}
        emptyMessage="Kayıt bulunamadı"
        onRefresh={() => void list.refetch()}
      />

      {editingRecord ? (
        <RecordEditModal
          key={editingRecord.id}
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
        />
      ) : null}

      {sessionTarget ? (
        <SessionModal target={sessionTarget} onClose={() => setSessionTarget(null)} />
      ) : null}
    </>
  );
}
