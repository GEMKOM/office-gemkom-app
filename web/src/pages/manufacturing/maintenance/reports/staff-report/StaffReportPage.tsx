import { ActionIcon, Avatar, Group, Text, Tooltip } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  staffActivityQueryOptions,
  type StaffActivity,
  type StaffPeriod,
} from '@/api/maintenance/reports';
import {
  DataTable,
  FaIcon,
  PageHeader,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type RowAction,
} from '@/ui';
import { formatDuration, legacyExportName } from '../../shared';
import { StaffDetailModal } from './StaffDetailModal';

const EMPTY_ROWS: StaffActivity[] = [];

/** YYYY-MM of a year and month. */
function monthValue(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function currentMonth(): string {
  const now = new Date();
  return monthValue(now.getFullYear(), now.getMonth() + 1);
}

/** "2026-03" → {2026, 3}; '' (Tüm zamanlar) → nulls. */
export function toPeriod(value: string): StaffPeriod {
  const match = /^(\d{4})-(\d{1,2})/.exec(value);
  if (!match) return { year: null, month: null };
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** Legacy shiftMonth: from all-time it starts at this month. */
export function shiftMonth(value: string, delta: number): string {
  let { year, month } = toPeriod(value);
  if (!year || !month) {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
  month += delta;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return monthValue(year, month);
}

const name = (row: StaffActivity) => row.full_name || row.username || '';

const columns: DataTableColumn<StaffActivity>[] = [
  {
    key: 'full_name',
    header: 'Personel',
    accessor: (row) => name(row),
    render: (row) => (
      <Group gap="sm" wrap="nowrap">
        <Avatar size={34} radius="xl" color="blue" variant="filled">
          {(name(row) || '?')[0]!.toLocaleUpperCase('tr-TR')}
        </Avatar>
        <div>
          <Text size="sm" fw={600}>
            {name(row)}
          </Text>
          <Text size="xs" c="dimmed">
            @{row.username}
          </Text>
        </div>
      </Group>
    ),
    exportValue: (row) => name(row),
  },
  {
    key: 'faults_resolved_count',
    header: 'Çözülen Arıza',
    render: (row) => (
      <StatusBadge color="green">{Number(row.faults_resolved_count ?? 0)}</StatusBadge>
    ),
    exportValue: (row) => Number(row.faults_resolved_count ?? 0),
  },
  {
    key: 'timers_count',
    header: 'Zamanlayıcı',
    render: (row) => <StatusBadge color="blue">{Number(row.timers_count ?? 0)}</StatusBadge>,
    exportValue: (row) => Number(row.timers_count ?? 0),
  },
  {
    key: 'total_timer_seconds',
    header: 'Toplam Çalışma',
    render: (row) => (
      <StatusBadge color="orange">{formatDuration(row.total_timer_seconds)}</StatusBadge>
    ),
    exportValue: (row) => formatDuration(row.total_timer_seconds),
  },
];

interface MonthNavigatorProps {
  value: string;
  onChange: (value: string) => void;
}

/** Legacy month navigator: previous / month picker / next / all time. */
function MonthNavigator({ value, onChange }: MonthNavigatorProps) {
  return (
    <Group gap={6} wrap="nowrap">
      <Tooltip label="Önceki ay">
        <ActionIcon
          variant="default"
          aria-label="Önceki ay"
          onClick={() => onChange(shiftMonth(value, -1))}
        >
          <FaIcon icon="fas fa-chevron-left" />
        </ActionIcon>
      </Tooltip>
      <MonthPickerInput
        aria-label="Dönem"
        placeholder="Tüm zamanlar"
        valueFormat="MMMM YYYY"
        w={170}
        size="xs"
        value={value ? `${value}-01` : null}
        onChange={(next) => onChange(next ? next.slice(0, 7) : '')}
      />
      <Tooltip label="Sonraki ay">
        <ActionIcon
          variant="default"
          aria-label="Sonraki ay"
          onClick={() => onChange(shiftMonth(value, 1))}
        >
          <FaIcon icon="fas fa-chevron-right" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Tüm zamanlar">
        <ActionIcon
          variant={value ? 'default' : 'filled'}
          aria-label="Tüm zamanlar"
          onClick={() => onChange('')}
        >
          <FaIcon icon="fas fa-infinity" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

/** Port of manufacturing/maintenance/reports/staff-report (staffReport.js). */
export function StaffReportPage() {
  // The month is in the URL as `period=YYYY-MM`; `period=` (empty) is all time.
  // Legacy opened on the current month and kept it in memory only.
  const { values, apply } = useUrlFilters({ period: currentMonth() });
  const period = useMemo(() => toPeriod(values.period), [values.period]);

  const report = useQuery(staffActivityQueryOptions(period));
  const rows = report.data ?? EMPTY_ROWS;

  const stats = useMemo(
    () => ({
      staff: rows.length,
      faults: rows.reduce((s, r) => s + (r.faults_resolved_count || 0), 0),
      timers: rows.reduce((s, r) => s + (r.timers_count || 0), 0),
      seconds: rows.reduce((s, r) => s + (r.total_timer_seconds || 0), 0),
    }),
    [rows],
  );
  const figure = (value: string | number) =>
    report.isPending ? '–' : typeof value === 'number' ? value.toLocaleString('tr-TR') : value;

  const [detailUserId, setDetailUserId] = useState<number | null>(null);
  const rowActions = (): RowAction<StaffActivity>[] => [
    {
      key: 'detail',
      label: 'Detay',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: (row) => setDetailUserId(row.user_id),
    },
  ];

  return (
    <>
      <PageHeader
        title="Personel Faaliyet Raporu"
        subtitle="Her personelin çözdüğü arızalar, başlattığı zamanlayıcılar ve toplam çalışma süresi"
        icon="users"
        backTo="/manufacturing/maintenance/reports"
        stats={[
          { id: 'staff-count', label: 'Aktif Personel', value: figure(stats.staff) },
          { id: 'faults-resolved', label: 'Çözülen Arıza', value: figure(stats.faults) },
          { id: 'timers-count', label: 'Zamanlayıcı', value: figure(stats.timers) },
          {
            id: 'work-total',
            label: 'Toplam Çalışma',
            value: figure(formatDuration(stats.seconds)),
          },
        ]}
      />

      <DataTable
        title="Personel Özeti"
        filters={
          <MonthNavigator value={values.period} onChange={(next) => apply({ period: next })} />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.user_id)}
        loading={report.isFetching}
        // Every row is loaded; legacy headers looked sortable but did nothing.
        sortable
        rowActions={rowActions}
        actionsHeader=""
        emptyMessage="Faaliyet kaydı bulunamadı"
        onRefresh={() => void report.refetch()}
        exportable={{ fileName: legacyExportName(), sheetName: 'Sheet1' }}
      />

      {detailUserId !== null ? (
        <StaffDetailModal
          userId={detailUserId}
          period={period}
          onClose={() => setDetailUserId(null)}
        />
      ) : null}
    </>
  );
}
