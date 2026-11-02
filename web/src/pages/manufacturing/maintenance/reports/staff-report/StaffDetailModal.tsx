import { Badge, Group, Tabs, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  staffActivityDetailQueryOptions,
  type StaffPeriod,
  type StaffResolvedFault,
  type StaffTimer,
} from '@/api/maintenance/reports';
import { formatDateTime } from '@/lib/format';
import { DataTable, DetailModal, FaIcon, StatusBadge, type DataTableColumn } from '@/ui';
import { faultTypeLabel, FaultTypeBadge, formatDuration, periodLabel } from '../../shared';

const idCell = (id: number) => (
  <Text span size="sm" fw={700} c="gemkom.7">
    #{id}
  </Text>
);
const nowrap = (value: string) => <span style={{ whiteSpace: 'nowrap' }}>{value}</span>;

const faultColumns: DataTableColumn<StaffResolvedFault>[] = [
  { key: 'id', header: '#ID', render: (row) => idCell(row.id) },
  {
    key: 'machine_name',
    header: 'Ekipman',
    render: (row) => (
      <Text span size="sm" fw={600}>
        {row.machine_name || '-'}
      </Text>
    ),
  },
  {
    key: 'description',
    header: 'Açıklama',
    render: (row) => (
      <Text
        span
        size="sm"
        title={row.description || ''}
        truncate="end"
        maw={180}
        display="inline-block"
      >
        {row.description || '-'}
      </Text>
    ),
  },
  {
    key: 'type',
    header: 'Tür',
    render: (row) => <FaultTypeBadge fault={row} />,
    exportValue: faultTypeLabel,
  },
  {
    key: 'reported_at',
    header: 'Bildirilme',
    render: (row) => nowrap(formatDateTime(row.reported_at)),
  },
  { key: 'resolved_at', header: 'Çözüm', render: (row) => nowrap(formatDateTime(row.resolved_at)) },
  {
    key: 'resolution_duration_seconds',
    header: 'Süre',
    render: (row) =>
      nowrap(
        row.resolution_duration_seconds != null
          ? formatDuration(row.resolution_duration_seconds)
          : '-',
      ),
  },
];

const timerColumns: DataTableColumn<StaffTimer>[] = [
  { key: 'id', header: '#ID', render: (row) => idCell(row.id) },
  {
    key: 'fault_id',
    header: 'Arıza',
    render: (row) =>
      row.fault_id ? (
        <Text span size="sm" c="dimmed">
          Arıza #{row.fault_id}
        </Text>
      ) : (
        '-'
      ),
  },
  { key: 'fault_machine', header: 'Ekipman', render: (row) => row.fault_machine || '-' },
  {
    key: 'start_time_ms',
    header: 'Başlangıç',
    render: (row) => nowrap(row.start_time_ms != null ? formatDateTime(row.start_time_ms) : '-'),
  },
  {
    key: 'finish_time_ms',
    header: 'Bitiş',
    render: (row) =>
      row.finish_time_ms ? (
        nowrap(formatDateTime(row.finish_time_ms))
      ) : (
        <Text span size="sm" fw={600} c="green.8">
          Devam Ediyor
        </Text>
      ),
  },
  {
    key: 'duration_seconds',
    header: 'Süre',
    render: (row) =>
      nowrap(row.duration_seconds != null ? formatDuration(row.duration_seconds) : '-'),
  },
  {
    key: 'is_active',
    header: 'Durum',
    render: (row) =>
      row.is_active ? (
        <StatusBadge color="green">Aktif</StatusBadge>
      ) : (
        <StatusBadge color="grey">Tamamlandı</StatusBadge>
      ),
  },
];

function Pill({ icon, color, children }: { icon: string; color: string; children: ReactNode }) {
  return (
    <Badge
      variant="light"
      color={color}
      size="lg"
      radius="xl"
      tt="none"
      leftSection={<FaIcon icon={icon} />}
    >
      {children}
    </Badge>
  );
}

export interface StaffDetailModalProps {
  userId: number;
  period: StaffPeriod;
  onClose: () => void;
}

/** Port of window.openStaffDetail / buildDetailHtml in staffReport.js. */
export function StaffDetailModal({ userId, period, onClose }: StaffDetailModalProps) {
  const detail = useQuery(staffActivityDetailQueryOptions(userId, period));
  const data = detail.data;
  const label = period.year ? periodLabel(`${period.year}-${period.month}`) : 'Tüm Zamanlar';

  let content: ReactNode = null;
  if (detail.isError) {
    content = (
      <Text c="red.7" ta="center" py="lg">
        <FaIcon icon="fas fa-exclamation-circle" /> Veri yüklenemedi.
      </Text>
    );
  } else if (data) {
    const completed = data.timers.filter((t) => !t.is_active && t.duration_seconds != null);
    const totalSeconds = completed.reduce((s, t) => s + (t.duration_seconds ?? 0), 0);
    const active = data.timers.filter((t) => t.is_active).length;
    content = (
      <>
        <Group gap="xs" mb="md">
          <Pill icon="fas fa-calendar-alt" color="blue">
            {label}
          </Pill>
          <Pill icon="fas fa-check-circle" color="green">
            {data.resolved_faults.length} arıza çözüldü
          </Pill>
          <Pill icon="fas fa-stopwatch" color="blue">
            {data.timers.length} zamanlayıcı
          </Pill>
          <Pill icon="fas fa-clock" color="orange">
            {formatDuration(totalSeconds)}
          </Pill>
          {active > 0 ? (
            <Pill icon="fas fa-circle" color="red">
              {active} aktif
            </Pill>
          ) : null}
        </Group>
        <Tabs defaultValue="faults">
          <Tabs.List>
            <Tabs.Tab value="faults" leftSection={<FaIcon icon="fas fa-exclamation-triangle" />}>
              Çözülen Arızalar{' '}
              <Badge size="sm" color="gray" variant="light">
                {data.resolved_faults.length}
              </Badge>
            </Tabs.Tab>
            <Tabs.Tab value="timers" leftSection={<FaIcon icon="fas fa-stopwatch" />}>
              Zamanlayıcılar{' '}
              <Badge size="sm" color="gray" variant="light">
                {data.timers.length}
              </Badge>
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="faults" pt="sm">
            <DataTable
              data={data.resolved_faults}
              columns={faultColumns}
              getRowId={(row) => String(row.id)}
              emptyMessage="Bu dönemde çözülen arıza yok."
            />
          </Tabs.Panel>
          <Tabs.Panel value="timers" pt="sm">
            <DataTable
              data={data.timers}
              columns={timerColumns}
              getRowId={(row) => String(row.id)}
              rowStyle={(row) =>
                row.is_active ? { background: 'var(--mantine-color-green-0)' } : undefined
              }
              emptyMessage="Bu dönemde zamanlayıcı yok."
            />
          </Tabs.Panel>
        </Tabs>
      </>
    );
  }

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={data?.user.full_name || (detail.isPending ? 'Yükleniyor…' : 'Personel Detayı')}
      icon="fas fa-user-clock"
      size="xl"
      loading={detail.isPending}
      sections={[{ content }]}
    />
  );
}
