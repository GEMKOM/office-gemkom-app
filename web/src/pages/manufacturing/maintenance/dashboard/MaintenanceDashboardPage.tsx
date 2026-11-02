import { Grid, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { faultTimersQueryOptions, machineFaultsQueryOptions } from '@/api/maintenance/faults';
import { formatDateTime } from '@/lib/format';
import { DataTable, PageHeader, StatCards, type DataTableColumn } from '@/ui';
import { localDay } from '../shared';
import {
  clock,
  toResolvedRow,
  toTimerRow,
  userName,
  machineName,
  type ResolvedRow,
  type TimerRow,
} from './dashboardRows';

/** Legacy startAutoRefresh: every 2 minutes (TanStack pauses it while the tab is hidden). */
const REFRESH_MS = 120_000;

/** Ticks once a second, like legacy startTimerUpdates. */
function LiveDuration({ startMs }: { startMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <Text
      span
      fw={600}
      c="red.7"
      bg="red.0"
      px={8}
      py={2}
      style={{ borderRadius: 6, display: 'inline-block', minWidth: 90, textAlign: 'center' }}
    >
      {clock(now - startMs)}
    </Text>
  );
}

const name = (value: string) => (
  <Text span size="sm" fw={600}>
    {value}
  </Text>
);

const faultCell = (value: string) => <span title={value}>{value}</span>;

const timerColumns: DataTableColumn<TimerRow>[] = [
  { key: 'user', header: 'Kullanıcı', render: (row) => name(row.user) },
  { key: 'machine', header: 'Ekipman' },
  { key: 'fault', header: 'Arıza', render: (row) => faultCell(row.fault) },
  {
    key: 'started_at',
    header: 'Başlangıç',
    render: (row) => (
      <Text span size="sm" c="dimmed">
        {formatDateTime(row.started_at)}
      </Text>
    ),
  },
  {
    key: 'duration',
    header: 'Süre',
    render: (row) => (row.start_ms ? <LiveDuration startMs={row.start_ms} /> : '-'),
  },
];

const resolvedColumns: DataTableColumn<ResolvedRow>[] = [
  { key: 'user', header: 'Kullanıcı', render: (row) => name(row.user) },
  { key: 'machine', header: 'Ekipman' },
  { key: 'fault', header: 'Arıza', render: (row) => faultCell(row.fault) },
  {
    key: 'resolved_at',
    header: 'Çözüm',
    render: (row) => (
      <Text span size="sm" fw={600} c="green.8">
        {formatDateTime(row.resolved_at)}
      </Text>
    ),
  },
];

/** Port of manufacturing/maintenance/dashboard (dashboard.js). */
export function MaintenanceDashboardPage() {
  const timers = useQuery({ ...faultTimersQueryOptions(true), refetchInterval: REFRESH_MS });
  // The day is read on each render, so a dashboard left open past midnight moves on.
  const today = localDay();
  const resolved = useQuery({
    ...machineFaultsQueryOptions({ resolved_date: today, page_size: 100 }),
    refetchInterval: REFRESH_MS,
  });

  const timerRows = useMemo(() => (timers.data ?? []).map(toTimerRow), [timers.data]);
  const resolvedRows = useMemo(
    () => (resolved.data?.results ?? []).map(toResolvedRow),
    [resolved.data],
  );

  const stats = useMemo(() => {
    const raw = timers.data ?? [];
    return {
      timers: raw.length,
      machines: new Set(raw.map(machineName)).size,
      users: new Set(raw.map(userName)).size,
    };
  }, [timers.data]);

  // Either table's Yenile reloads both, as legacy loadData did.
  const refresh = () => {
    void timers.refetch();
    void resolved.refetch();
  };

  return (
    <>
      <PageHeader
        title="Bakım Dashboard"
        subtitle="Aktif arıza zamanlayıcıları takibi"
        icon="wrench"
        backTo="/manufacturing/maintenance/"
      />

      <StatCards
        cols={3}
        loading={timers.isPending}
        cards={[
          {
            id: 'active-fault-timers',
            title: 'Aktif Arıza Timer',
            value: stats.timers,
            icon: 'fas fa-stopwatch',
            color: 'danger',
          },
          {
            id: 'active-fault-machines',
            title: 'Ekipman',
            value: stats.machines,
            icon: 'fas fa-cogs',
            color: 'primary',
          },
          {
            id: 'active-fault-users',
            title: 'Aktif Kullanıcı',
            value: stats.users,
            icon: 'fas fa-users',
            color: 'info',
          },
        ]}
      />

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <DataTable
            title="Aktif Arıza Zamanlayıcıları"
            icon="fas fa-stopwatch"
            data={timerRows}
            columns={timerColumns}
            getRowId={(row) => row.key}
            loading={timers.isFetching}
            skeletonRows={6}
            emptyMessage="Aktif arıza zamanlayıcısı yok"
            onRefresh={refresh}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <DataTable
            title="Bugün Çözülen Arızalar"
            icon="fas fa-check-circle"
            data={resolvedRows}
            columns={resolvedColumns}
            getRowId={(row) => row.key}
            loading={resolved.isFetching}
            skeletonRows={6}
            emptyMessage="Bugün çözülen arıza yok"
            onRefresh={refresh}
          />
        </Grid.Col>
      </Grid>
    </>
  );
}
