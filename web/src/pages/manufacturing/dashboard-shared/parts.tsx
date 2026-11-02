import { Grid, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { stopTimer, timerKeys, type Timer, type TimerModule } from '@/api/manufacturing/timers';
import type { Machine } from '@/api/reference/machines';
import { formatNumber } from '@/lib/format';
import {
  FaIcon,
  notify,
  StatusBadge,
  type DataTableColumn,
  type RowAction,
  type StatusFamily,
} from '@/ui';
import { formatDuration, startMs, useNow } from './clock';

// Pieces the three shop-floor dashboards share (machining, CNC and linear
// cutting): the ticking cells, the task cell, machine status and stop.

/** Running time since `start`, ticking every second. */
export function LiveDuration({ start }: { start: Timer['start_time'] }) {
  const now = useNow();
  const since = startMs(start);
  return (
    <Text span ff="monospace" fw={600} c="green.8" style={{ fontVariantNumeric: 'tabular-nums' }}>
      {since === null ? '-' : formatDuration(now - since)}
    </Text>
  );
}

/** estimated / (booked + running) hours, as legacy coloured it. */
export function efficiencyPercent(timer: Timer, now: number): number | null {
  const estimated = Number.parseFloat(String(timer.estimated_hours ?? '')) || 0;
  const booked = Number.parseFloat(String(timer.task_total_hours ?? '')) || 0;
  const since = startMs(timer.start_time);
  if (!estimated || since === null) return null;
  const spent = booked + (now - since) / (60 * 60 * 1000);
  return spent > 0 ? (estimated / spent) * 100 : null;
}

function efficiencyFamily(value: number): StatusFamily {
  if (value >= 100) return 'green';
  if (value >= 80) return 'yellow';
  return 'red';
}

/** Machining "Verimlilik": recomputed every second like the duration. */
export function LiveEfficiency({ timer }: { timer: Timer }) {
  const value = efficiencyPercent(timer, useNow());
  if (value === null)
    return (
      <Text span c="dimmed">
        -
      </Text>
    );
  return <StatusBadge color={efficiencyFamily(value)}>{formatNumber(value, 3)}%</StatusBadge>;
}

export function UserCell({ name }: { name: ReactNode }) {
  return (
    <Group gap={8} wrap="nowrap">
      <FaIcon icon="fas fa-user" style={{ fontSize: 13, opacity: 0.6 }} />
      <Text span fw={600} size="sm">
        {name}
      </Text>
    </Group>
  );
}

/** A task reference that opens its details: code on top, a hint below. */
export function TaskCell({
  code,
  hint,
  onOpen,
}: {
  code: ReactNode;
  hint?: ReactNode;
  onOpen?: () => void;
}) {
  const body = (
    <Stack gap={2}>
      <Text span fw={700} size="sm" c={onOpen ? 'gemkom.7' : undefined}>
        <FaIcon icon="fas fa-external-link-alt" style={{ fontSize: 11, marginRight: 6 }} />
        {code}
      </Text>
      {hint ? (
        <Text span size="xs" c="dimmed">
          {hint}
        </Text>
      ) : null}
    </Stack>
  );
  if (!onOpen) return body;
  return (
    <UnstyledButton onClick={onOpen} title="Detayları göster">
      {body}
    </UnstyledButton>
  );
}

export function MachineStatus({ machine }: { machine: Machine }) {
  if (machine.is_under_maintenance) return <StatusBadge color="grey">Bakımda</StatusBadge>;
  if (machine.is_active) {
    return machine.has_active_timer ? (
      <StatusBadge color="green">Aktif</StatusBadge>
    ) : (
      <StatusBadge color="red">Boşta</StatusBadge>
    );
  }
  return <StatusBadge color="red">Çevrimdışı</StatusBadge>;
}

export const machineNameColumn: DataTableColumn<Machine> = {
  key: 'name',
  header: 'Makine',
  render: (m) => m.name || 'Bilinmeyen Makine',
};

export const machineStatusColumn: DataTableColumn<Machine> = {
  key: 'status',
  header: 'Durum',
  render: (m) => <MachineStatus machine={m} />,
};

/** Stops a timer at the current time and refreshes the running list. */
export function useStopTimer(module: TimerModule) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (timerId: number) => stopTimer(module, timerId, Date.now()),
    onSuccess: async () => {
      notify.success('Zamanlayıcı durduruldu');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: timerKeys.all(module) }),
        // The manufacturing hubs count running timers under their own key.
        queryClient.invalidateQueries({ queryKey: [`timers:${module}`] }),
      ]);
    },
    onError: (error) => notify.error(error, { fallback: 'Zamanlayıcı durdurulamadı' }),
  });
  const stopping = mutation.isPending ? mutation.variables : null;
  const stopAction = (row: Timer): RowAction<Timer> => ({
    key: 'stop',
    label: 'Durdur',
    icon: 'fas fa-stop',
    color: 'danger',
    disabled: stopping === row.id,
    onClick: (r) => mutation.mutate(r.id),
  });
  return { stopAction, stopping };
}

/** Running timers on the left (8/12), machines on the right (4/12), as legacy. */
export function DashboardGrid({ timers, machines }: { timers: ReactNode; machines: ReactNode }) {
  return (
    <Grid gap="md">
      <Grid.Col span={{ base: 12, lg: 8 }}>{timers}</Grid.Col>
      <Grid.Col span={{ base: 12, lg: 4 }}>{machines}</Grid.Col>
    </Grid>
  );
}

/** Legacy refreshed the dashboards every 5 minutes. Hidden tabs don't poll (refetchIntervalInBackground is off). */
export const DASHBOARD_REFRESH_MS = 5 * 60_000;
