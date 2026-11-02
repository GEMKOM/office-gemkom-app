import { Button, Group, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  activeTimersQueryOptions,
  operationQueryOptions,
  type MachiningOperation,
  type Timer,
} from '@/api/manufacturing/timers';
import { machinesQueryOptions, type Machine } from '@/api/reference/machines';
import { formatDate, formatDateTime } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import {
  DataTable,
  DetailModal,
  FaIcon,
  notify,
  PageHeader,
  StatCards,
  StatusBadge,
  type DataTableColumn,
  type DetailSection,
} from '@/ui';
import { formatHours, formatWeeks, hoursWithRunning, startMs } from '../../dashboard-shared/clock';
import {
  DASHBOARD_REFRESH_MS,
  DashboardGrid,
  LiveDuration,
  LiveEfficiency,
  machineNameColumn,
  machineStatusColumn,
  TaskCell,
  UserCell,
  useStopTimer,
} from '../../dashboard-shared/parts';

const EMPTY_TIMERS: Timer[] = [];
const EMPTY_MACHINES: Machine[] = [];

const isDowntime = (timer: Timer) => Boolean(timer.timer_type && timer.timer_type !== 'productive');

const machineColumns: DataTableColumn<Machine>[] = [
  machineNameColumn,
  {
    key: 'type',
    header: 'Tip',
    render: (m) => m.machine_type_label || m.machine_type || 'Bilinmeyen Tip',
  },
  machineStatusColumn,
  { key: 'weeks', header: 'Hafta', render: (m) => formatWeeks(m.total_estimated_hours) },
];

// "2026-09-30" -> "30.09.2026" without going through Date (no timezone drift).
function isoDay(value: string | null | undefined): string {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function DueDate({ operation }: { operation: MachiningOperation }) {
  const due = isoDay(operation.due_date);
  if (!due) return <>-</>;
  const source =
    operation.due_source === 'part'
      ? ' (parça)'
      : operation.due_source === 'job_order'
        ? ' (iş emri)'
        : '';
  return (
    <Group gap={6} wrap="nowrap">
      <span>
        {due}
        {source}
      </span>
      {operation.projected_late ? (
        <span title="Tahmini bitiş termini aşıyor">
          <StatusBadge color="red">Geç</StatusBadge>
        </span>
      ) : null}
    </Group>
  );
}

function PlanWindow({ operation }: { operation: MachiningOperation }) {
  const start = operation.planned_start_ms ? formatDateTime(operation.planned_start_ms) : '';
  const end = operation.planned_end_ms ? formatDateTime(operation.planned_end_ms) : '';
  if (!start && !end) return <>-</>;
  return (
    <span>
      {start || '?'} → {end || '?'}
      {operation.plan_locked ? (
        <span title="Sıra kilitli">
          <FaIcon icon="fas fa-lock" style={{ marginLeft: 6, opacity: 0.6 }} />
        </span>
      ) : null}
    </span>
  );
}

const withSeconds = { second: '2-digit' } as const;

function operationSections(
  operation: MachiningOperation,
  runningSince: number | null,
): DetailSection[] {
  const now = Date.now();
  const estimated = Number.parseFloat(String(operation.estimated_hours ?? '')) || 0;
  const spent = hoursWithRunning(operation.total_hours_spent, runningSince, now);
  const tools = (operation.operation_tools ?? [])
    .map((tool) => `${tool.tool_name || tool.tool_code || 'Tool'} (${tool.quantity || 1}x)`)
    .join(', ');
  return [
    {
      title: 'Operasyon Bilgileri',
      icon: 'fas fa-info-circle',
      fields: [
        { label: 'Operasyon Kodu', value: operation.key },
        { label: 'Operasyon Adı', value: operation.name },
        { label: 'Sıra', value: operation.order || '-' },
        { label: 'Makine', value: operation.machine_name },
        { label: 'Açıklama', value: operation.description, span: 12 },
      ],
    },
    {
      title: 'Parça Bilgileri',
      icon: 'fas fa-cube',
      fields: [
        { label: 'Parça Kodu', value: operation.part_key },
        { label: 'Parça Adı', value: operation.part_name },
        { label: 'İş Emri No', value: operation.part_job_no },
        { label: 'Görev Kodu', value: operation.part_task_key },
        { label: 'Resim No', value: operation.part_image_no },
        { label: 'Pozisyon No', value: operation.part_position_no },
        { label: 'Miktar', value: operation.part_quantity || 0 },
        {
          label: 'Tamamlanma Tarihi',
          value: operation.part_completion_date ? formatDate(operation.part_completion_date) : '-',
        },
      ],
    },
    {
      title: 'Zaman Bilgileri',
      icon: 'fas fa-clock',
      fields: [
        { label: 'Tahmini Süre', value: `${operation.estimated_hours || 0} saat` },
        { label: 'Harcanan Süre', value: formatHours(spent) },
        { label: 'Kalan Süre', value: formatHours(Math.max(0, estimated - spent)) },
        {
          label: 'Durum',
          render: operation.has_active_timer ? (
            <StatusBadge color="green">Aktif Timer</StatusBadge>
          ) : operation.completion_date ? (
            <StatusBadge color="blue">Tamamlandı</StatusBadge>
          ) : (
            <StatusBadge color="yellow">Beklemede</StatusBadge>
          ),
        },
        { label: 'Termin', render: <DueDate operation={operation} /> },
        { label: 'Plan', render: <PlanWindow operation={operation} /> },
      ],
    },
    {
      title: 'Planlama Bilgileri',
      icon: 'fas fa-calendar-alt',
      hidden: !operation.in_plan,
      fields: [
        { label: 'Plan Sırası', value: operation.plan_order || '-' },
        {
          label: 'Planlanan Başlangıç',
          value: operation.planned_start_ms
            ? formatDateTime(operation.planned_start_ms, withSeconds)
            : '-',
        },
        {
          label: 'Planlanan Bitiş',
          value: operation.planned_end_ms
            ? formatDateTime(operation.planned_end_ms, withSeconds)
            : '-',
        },
        {
          label: 'Plan Kilitli',
          render: operation.plan_locked ? (
            <StatusBadge color="red">Evet</StatusBadge>
          ) : (
            <StatusBadge color="grey">Hayır</StatusBadge>
          ),
        },
      ],
    },
    {
      title: 'Takımlar',
      icon: 'fas fa-wrench',
      hidden: !tools,
      fields: [{ label: 'Kullanılan Takımlar', value: tools, span: 12 }],
    },
    {
      title: 'Oluşturma Bilgileri',
      icon: 'fas fa-user',
      fields: [
        { label: 'Oluşturan', value: operation.created_by_username },
        {
          label: 'Oluşturulma Tarihi',
          value: operation.created_at ? formatDateTime(operation.created_at, withSeconds) : '-',
        },
        { label: 'Tamamlayan', value: operation.completed_by_username },
        {
          label: 'Tamamlanma Tarihi',
          value: operation.completion_date
            ? formatDateTime(operation.completion_date, withSeconds)
            : '-',
        },
      ],
    },
  ];
}

function OperationModal({
  operationKey,
  timers,
  onClose,
}: {
  operationKey: string;
  timers: Timer[];
  onClose: () => void;
}) {
  const operation = useQuery(operationQueryOptions(operationKey));

  useEffect(() => {
    if (!operation.isError) return;
    notify.error(operation.error, { fallback: 'Görev detayları yüklenirken hata oluştu' });
    onClose();
  }, [operation.isError, operation.error, onClose]);

  const data = operation.data;
  const running = data ? timers.find((t) => t.issue_key === data.key) : undefined;
  return (
    <DetailModal
      opened
      onClose={onClose}
      title={data ? data.name || data.key : operationKey}
      icon="fas fa-tasks"
      size="lg"
      loading={operation.isPending}
      sections={data ? operationSections(data, startMs(running?.start_time)) : []}
      footerActions={
        data ? (
          <Button
            component={AppLink}
            to={`/manufacturing/machining/tasks/list/?filter=${encodeURIComponent(data.part_key || data.key)}`}
            leftSection={<FaIcon icon="fas fa-tasks" />}
          >
            Görevler Sayfasında Aç
          </Button>
        ) : null
      }
    />
  );
}

/** Port of manufacturing/machining/dashboard (dashboard.js). */
export function MachiningDashboardPage() {
  const timersQuery = useQuery({
    ...activeTimersQueryOptions('machining'),
    refetchInterval: DASHBOARD_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
  const machinesQuery = useQuery({
    ...machinesQueryOptions({ used_in: 'machining' }),
    refetchInterval: DASHBOARD_REFRESH_MS,
  });
  const timers = timersQuery.data ?? EMPTY_TIMERS;
  const machines = machinesQuery.data?.results ?? EMPTY_MACHINES;

  useEffect(() => {
    if (timersQuery.isError) notify.error('Aktif zamanlayıcılar yüklenirken hata oluştu');
  }, [timersQuery.isError, timersQuery.errorUpdatedAt]);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const { stopAction, stopping } = useStopTimer('machining');

  const timerColumns = useMemo<DataTableColumn<Timer>[]>(
    () => [
      {
        key: 'user',
        header: 'Kullanıcı',
        render: (t) => <UserCell name={t.username || 'Bilinmeyen Kullanıcı'} />,
      },
      { key: 'machine', header: 'Makine', render: (t) => t.machine_name || 'Bilinmeyen Makine' },
      {
        key: 'task',
        header: 'Görev',
        render: (t) =>
          isDowntime(t) ? (
            <Text span fw={600} size="sm" c="dimmed">
              <FaIcon
                icon="fas fa-exclamation-triangle"
                style={{ color: 'var(--mantine-color-red-6)', marginRight: 6 }}
              />
              {t.downtime_reason_name || 'Bilinmeyen Neden'}
            </Text>
          ) : (
            <TaskCell
              code={t.issue_key || 'Bilinmeyen Görev'}
              hint={t.issue_name}
              onOpen={t.issue_key ? () => setOpenKey(t.issue_key!) : undefined}
            />
          ),
      },
      { key: 'efficiency', header: 'Verimlilik', render: (t) => <LiveEfficiency timer={t} /> },
      { key: 'duration', header: 'Süre', render: (t) => <LiveDuration start={t.start_time} /> },
    ],
    [],
  );

  const stats = useMemo(
    () => ({
      timers: timers.length,
      machines: new Set(timers.map((t) => t.machine_name)).size,
      users: new Set(timers.map((t) => t.username)).size,
    }),
    [timers],
  );

  return (
    <>
      <PageHeader
        title="Talaşlı İmalat Dashboard"
        subtitle="Gerçek zamanlı üretim takibi ve analizi"
        backTo="/manufacturing/machining/"
      />
      <StatCards
        loading={timersQuery.isPending}
        cards={[
          {
            id: 'active-timers-count',
            title: 'Aktif Zamanlayıcı',
            value: stats.timers,
            icon: 'fas fa-clock',
            color: 'primary',
          },
          {
            id: 'active-machines-count',
            title: 'Makine',
            value: stats.machines,
            icon: 'fas fa-cog',
            color: 'success',
          },
          {
            id: 'active-users-count',
            title: 'Aktif Kullanıcı',
            value: stats.users,
            icon: 'fas fa-users',
            color: 'info',
          },
          // Legacy counts the running timers' tasks here.
          {
            id: 'total-tasks-count',
            title: 'Toplam Görev',
            value: stats.timers,
            icon: 'fas fa-tasks',
            color: 'warning',
          },
        ]}
      />
      <DashboardGrid
        timers={
          <DataTable
            title="Aktif Zamanlayıcılar"
            icon="fas fa-clock"
            data={timers}
            columns={timerColumns}
            getRowId={(t) => String(t.id)}
            loading={timersQuery.isFetching}
            rowActions={(t) => [stopAction(t)]}
            extraData={stopping}
            rowStyle={(t) =>
              isDowntime(t)
                ? {
                    background: 'var(--mantine-color-red-0)',
                    boxShadow: 'inset 3px 0 0 var(--mantine-color-red-6)',
                  }
                : undefined
            }
            emptyMessage="Aktif Zamanlayıcı Yok"
            onRefresh={() => void timersQuery.refetch()}
          />
        }
        machines={
          <DataTable
            title="Makine Durumları"
            icon="fas fa-industry"
            data={machines}
            columns={machineColumns}
            getRowId={(m) => String(m.id)}
            loading={machinesQuery.isFetching}
            skeletonRows={3}
            emptyMessage="Makine Bulunamadı"
          />
        }
      />
      {openKey ? (
        <OperationModal operationKey={openKey} timers={timers} onClose={() => setOpenKey(null)} />
      ) : null}
    </>
  );
}
