import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  linearActiveTimersQueryOptions,
  linearTaskCountQueryOptions,
  type Timer,
} from '@/api/manufacturing/timers';
import { machinesQueryOptions, type Machine } from '@/api/reference/machines';
import { DataTable, notify, PageHeader, StatCards, type DataTableColumn } from '@/ui';
import {
  DashboardGrid,
  LiveDuration,
  machineNameColumn,
  machineStatusColumn,
  TaskCell,
  UserCell,
  useStopTimer,
} from '../../dashboard-shared/parts';

/** Legacy refreshed this dashboard every 30 seconds (hidden tabs don't poll). */
const REFRESH_MS = 30_000;

const EMPTY_TIMERS: Timer[] = [];
const EMPTY_MACHINES: Machine[] = [];

const machineColumns: DataTableColumn<Machine>[] = [
  machineNameColumn,
  { key: 'machine_type', header: 'Tip', render: (m) => m.machine_type || '-' },
  machineStatusColumn,
];

// The task cell opens the tasks list in a new tab (legacy had no detail modal here).
const openTasks = () => window.open('/manufacturing/linear-cutting/tasks/', '_blank', 'noopener');

const timerColumns: DataTableColumn<Timer>[] = [
  {
    key: 'username',
    header: 'Kullanıcı',
    render: (t) => <UserCell name={t.username || 'Bilinmeyen'} />,
  },
  { key: 'machine_name', header: 'Makine', render: (t) => t.machine_name || '-' },
  {
    key: 'issue_name',
    header: 'Görev',
    render: (t) => (
      <TaskCell
        code={t.issue_key || '-'}
        hint={t.issue_name || t.issue_key || '-'}
        onOpen={t.issue_key ? openTasks : undefined}
      />
    ),
  },
  { key: 'duration', header: 'Süre', render: (t) => <LiveDuration start={t.start_time} /> },
];

/** Port of manufacturing/linear-cutting/dashboard (dashboard.js). */
export function LinearCuttingDashboardPage() {
  const timersQuery = useQuery({
    ...linearActiveTimersQueryOptions(),
    refetchInterval: REFRESH_MS,
    placeholderData: keepPreviousData,
  });
  const machinesQuery = useQuery({
    ...machinesQueryOptions({ page_size: 200, used_in: 'linear_cutting', compact: true }),
    refetchInterval: REFRESH_MS,
  });
  const taskCount = useQuery({ ...linearTaskCountQueryOptions(), refetchInterval: REFRESH_MS });
  const timers = timersQuery.data ?? EMPTY_TIMERS;
  const rawMachines = machinesQuery.data?.results ?? EMPTY_MACHINES;

  useEffect(() => {
    if (timersQuery.isError) notify.error('Zamanlayıcılar yüklenemedi');
  }, [timersQuery.isError, timersQuery.errorUpdatedAt]);

  const { stopAction, stopping } = useStopTimer('linear_cutting');

  // A machine is busy when one of the running timers is on it (legacy decorates the list).
  const machines = useMemo(() => {
    const busy = new Set(timers.map((t) => t.machine_fk).filter(Boolean));
    return rawMachines.map((m) => ({ ...m, has_active_timer: busy.has(m.id) }));
  }, [timers, rawMachines]);

  const stats = useMemo(
    () => ({
      timers: timers.length,
      activeMachines: rawMachines.filter((m) => m.is_active).length,
      users: new Set(timers.map((t) => t.username).filter(Boolean)).size,
    }),
    [timers, rawMachines],
  );

  return (
    <>
      <PageHeader
        title="Lineer Kesim Dashboard"
        subtitle="Gerçek zamanlı zamanlayıcı ve makine takibi"
        backTo="/manufacturing/linear-cutting/"
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
            value: stats.activeMachines,
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
          {
            id: 'total-tasks-count',
            title: 'Toplam Görev',
            // Legacy shows 0 when the count fails.
            value: taskCount.data ?? 0,
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
            skeletonRows={6}
            emptyMessage="Makine bulunamadı"
          />
        }
      />
    </>
  );
}
