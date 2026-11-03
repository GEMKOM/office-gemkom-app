import { Anchor, Button, Group } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  activeTimersQueryOptions,
  cncTaskQueryOptions,
  type CncTask,
  type CncTaskPart,
  type Timer,
} from '@/api/manufacturing/timers';
import { machinesQueryOptions, type Machine } from '@/api/reference/machines';
import { AppLink } from '@/shell/AppLink';
import {
  DataTable,
  DetailModal,
  FaIcon,
  notify,
  PageHeader,
  StatCards,
  type DataTableColumn,
  type DetailSection,
} from '@/ui';
import { formatHours, hoursWithRunning, startMs } from '../../dashboard-shared/clock';
import {
  DASHBOARD_REFRESH_MS,
  DashboardGrid,
  LiveDuration,
  machineNameColumn,
  machineStatusColumn,
  TaskCell,
  UserCell,
  useStopTimer,
} from '../../dashboard-shared/parts';

const EMPTY_TIMERS: Timer[] = [];
const EMPTY_MACHINES: Machine[] = [];

const machineColumns: DataTableColumn<Machine>[] = [
  machineNameColumn,
  {
    key: 'type',
    header: 'Tip',
    render: (m) => m.machine_type_label || m.machine_type || 'Bilinmeyen Tip',
  },
  machineStatusColumn,
];

const partColumns: DataTableColumn<CncTaskPart>[] = [
  { key: 'job_no', header: 'İş No', width: '25%' },
  { key: 'image_no', header: 'Resim No', width: '25%' },
  { key: 'position_no', header: 'Pozisyon No', width: '25%' },
  {
    key: 'weight_kg',
    header: 'Ağırlık (kg)',
    width: '25%',
    accessor: (p) => Number(p.weight_kg) || 0,
    render: (p) => (p.weight_kg ? `${p.weight_kg} kg` : '-'),
  },
];

const fileName = (path: string | null | undefined) => path?.split('/').pop() || 'Dosya';

function taskSections(task: CncTask, runningSince: number | null): DetailSection[] {
  const files = task.files ?? [];
  return [
    {
      title: 'Temel Bilgiler',
      icon: 'fas fa-info-circle',
      fields: [
        { label: 'Kesim No', value: task.key, span: 3 },
        { label: 'Kesim Adı', value: task.name, span: 3 },
        { label: 'Nesting ID', value: task.nesting_id, span: 3 },
        { label: 'Malzeme', value: task.material, span: 3 },
        { label: 'Kalınlık', value: task.thickness_mm ? `${task.thickness_mm} mm` : '-', span: 3 },
        { label: 'Boyutlar', value: task.dimensions, span: 3 },
        {
          label: 'Tahmini Saat',
          value: task.estimated_hours ? `${task.estimated_hours} saat` : '-',
          span: 3,
        },
        {
          label: 'Harcanan Saat',
          value: formatHours(hoursWithRunning(task.total_hours_spent, runningSince, Date.now())),
          span: 3,
        },
        { label: 'Makine', value: task.machine_name, span: 3 },
      ],
    },
    {
      // Legacy opened these in its FileViewer; there is no React viewer yet, so
      // each file opens in a new tab, where the browser previews or downloads it.
      title: 'Ekler',
      icon: 'fas fa-paperclip',
      hidden: files.length === 0,
      content: (
        <Group gap="md">
          {files.map((file, index) => (
            <Anchor
              key={file.id ?? index}
              href={file.file_url}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              <FaIcon icon="fas fa-file" style={{ marginRight: 6 }} />
              {fileName(file.file_name)}
            </Anchor>
          ))}
        </Group>
      ),
    },
    {
      title: 'Parça Listesi',
      icon: 'fas fa-puzzle-piece',
      content: (
        <DataTable
          data={task.parts ?? []}
          columns={partColumns}
          getRowId={(p, i) => String(p.id ?? i)}
          sortable
          striped
          verticalSpacing="xs"
          emptyMessage="Parça bulunamadı"
        />
      ),
    },
  ];
}

function CutModal({
  taskKey,
  timers,
  onClose,
}: {
  taskKey: string;
  timers: Timer[];
  onClose: () => void;
}) {
  const task = useQuery(cncTaskQueryOptions(taskKey));

  useEffect(() => {
    if (!task.isError || task.isFetching) return;
    notify.error('Kesim detayları yüklenirken hata oluştu');
    onClose();
  }, [task.isError, task.isFetching, onClose]);

  const data = task.data;
  const running = data ? timers.find((t) => t.issue_key === data.key) : undefined;
  return (
    <DetailModal
      opened
      onClose={onClose}
      title="Kesim Detayları"
      subtitle={data?.key ?? taskKey}
      icon="fas fa-info-circle"
      size="xl"
      loading={task.isPending}
      sections={data ? taskSections(data, startMs(running?.start_time)) : []}
      footerActions={
        data ? (
          <Button
            component={AppLink}
            to={`/planning/cnc-cutting/cuts/?filter=${encodeURIComponent(data.key)}`}
            leftSection={<FaIcon icon="fas fa-scissors" />}
          >
            Kesimler Sayfasında Aç
          </Button>
        ) : null
      }
    />
  );
}

/** Port of manufacturing/cnc-cutting/dashboard (dashboard.js). */
export function CncDashboardPage() {
  const timersQuery = useQuery({
    ...activeTimersQueryOptions('cnc_cutting'),
    refetchInterval: DASHBOARD_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
  const machinesQuery = useQuery({
    ...machinesQueryOptions({ used_in: 'cutting' }),
    refetchInterval: DASHBOARD_REFRESH_MS,
  });
  const timers = timersQuery.data ?? EMPTY_TIMERS;
  const machines = machinesQuery.data?.results ?? EMPTY_MACHINES;

  useEffect(() => {
    if (timersQuery.isError) notify.error('Aktif zamanlayıcılar yüklenirken hata oluştu');
  }, [timersQuery.isError, timersQuery.errorUpdatedAt]);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const { stopAction, stopping } = useStopTimer('cnc_cutting');

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
        render: (t) => (
          <TaskCell
            code={t.nesting_id || '-'}
            hint={t.thickness_mm ? `${t.thickness_mm} mm` : '-'}
            onOpen={t.issue_key ? () => setOpenKey(t.issue_key!) : undefined}
          />
        ),
      },
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
        title="CNC Kesim Dashboard"
        subtitle="Gerçek zamanlı üretim takibi ve analizi"
        backTo="/planning/cnc-cutting/"
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
        <CutModal taskKey={openKey} timers={timers} onClose={() => setOpenKey(null)} />
      ) : null}
    </>
  );
}
