import { Group, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import {
  performanceReportQueryOptions,
  type PerformanceReport,
  type PerformanceTask,
} from '@/api/manufacturing/machiningReports';
import { formatNumber } from '@/lib/format';
import {
  DataTable,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type DataTableColumn,
  type DataTableGrouping,
  type FilterConfig,
} from '@/ui';
import {
  BoldHours,
  Efficiency,
  efficiencyText,
  GroupFigure,
  hours,
  hoursExport,
  localDay,
  TaskKeyLink,
  Truncated,
  UserGroupTitle,
  userExportColumn,
  userFields,
  YesNo,
  yesNoText,
  type UserFields,
} from '../taskReportParts';

/** A task row with its user's period figures (legacy flattenData). */
export interface PerformanceRow extends PerformanceTask, UserFields {
  _totalHours?: number | null;
  _avgDailyHours?: number | null;
  _tasksWorked?: number | null;
  _tasksCompleted?: number | null;
  _avgEfficiency?: number | null;
  _onTimeRate?: number | null;
}

type FilterKeys = 'start_date' | 'end_date';

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'date', key: 'start_date', label: 'Başlangıç Tarihi', span: 3 },
  { type: 'date', key: 'end_date', label: 'Bitiş Tarihi', span: 3 },
];

const EMPTY_ROWS: PerformanceRow[] = [];

/** The last 30 days, today included (legacy getDefaultRange), as local days. */
export function defaultRange(today = dayjs()) {
  return { start_date: localDay(today.subtract(29, 'day')), end_date: localDay(today) };
}

export function flattenPerformance(report: PerformanceReport | undefined): PerformanceRow[] {
  const rows: PerformanceRow[] = [];
  for (const user of report?.users ?? []) {
    for (const task of user.tasks ?? []) {
      rows.push({
        ...task,
        ...userFields(user),
        _totalHours: user.total_hours,
        _avgDailyHours: user.avg_daily_hours,
        _tasksWorked: user.tasks_worked,
        _tasksCompleted: user.tasks_completed,
        _avgEfficiency: user.avg_efficiency,
        _onTimeRate: user.on_time_rate,
      });
    }
  }
  return rows;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const dash = (
  <Text span c="dimmed">
    —
  </Text>
);

const performanceColumns: DataTableColumn<PerformanceRow>[] = [
  userExportColumn<PerformanceRow>(),
  {
    key: 'task_key',
    header: 'TI No',
    sortable: true,
    render: (row) => <TaskKeyLink value={row.task_key} />,
    exportValue: (row) => row.task_key || '-',
  },
  {
    key: 'task_name',
    header: 'Görev Adı',
    sortable: true,
    render: (row) => <Truncated value={row.task_name} max={30} ellipsis="…" />,
    exportValue: (row) => row.task_name || '-',
  },
  {
    key: 'job_no',
    header: 'İş No',
    sortable: true,
    exportValue: (row) => row.job_no || '-',
  },
  {
    key: 'machine_name',
    header: 'Makine',
    sortable: true,
    render: (row) => <Truncated value={row.machine_name} max={25} ellipsis="…" />,
    exportValue: (row) => row.machine_name || '-',
  },
  {
    key: 'hours_in_period',
    header: 'Dönemdeki Süre (s)',
    sortable: true,
    render: (row) => <BoldHours value={row.hours_in_period} />,
    exportValue: (row) => hoursExport(row.hours_in_period),
  },
  {
    key: 'estimated_hours',
    header: 'Tahmini Saat',
    sortable: true,
    render: (row) => hours(row.estimated_hours),
    exportValue: (row) => hoursExport(row.estimated_hours),
  },
  {
    key: 'total_hours_spent',
    header: 'Toplam Harcanan (s)',
    sortable: true,
    render: (row) => hours(row.total_hours_spent),
    exportValue: (row) => hoursExport(row.total_hours_spent),
  },
  {
    key: 'efficiency',
    header: 'Verimlilik',
    sortable: true,
    render: (row) => <Efficiency value={row.efficiency} />,
    exportValue: (row) => efficiencyText(row.efficiency),
  },
  {
    key: 'completed_in_period',
    header: 'Dönemde Tamamlandı',
    sortable: true,
    render: (row) => <YesNo value={row.completed_in_period} />,
    exportValue: (row) => yesNoText(row.completed_in_period),
  },
  {
    key: 'on_time',
    header: 'Zamanında',
    sortable: true,
    render: (row) => <YesNo value={row.on_time} noColor="red" empty={dash} />,
    exportValue: (row) => yesNoText(row.on_time),
  },
  {
    key: 'deadline',
    header: 'Termin',
    sortable: true,
    exportValue: (row) => row.deadline || '-',
  },
];

/** Legacy buildGroupHeader: the user's figures for the period. */
const grouping: DataTableGrouping<PerformanceRow> = {
  by: '_userId',
  defaultExpanded: false,
  header: ({ rows }) => {
    const first = rows[0]!;
    return (
      <Group gap="lg" wrap="wrap" component="span">
        <UserGroupTitle row={first} count={rows.length} />
        <GroupFigure icon="fas fa-clock" label="Toplam">
          <strong>{formatNumber(first._totalHours || 0, 2)} s</strong>
        </GroupFigure>
        <GroupFigure icon="fas fa-calendar-day" label="Günlük ort.">
          <strong>{formatNumber(first._avgDailyHours || 0, 2)} s</strong>
        </GroupFigure>
        <GroupFigure icon="fas fa-check-circle" label="Tamamlanan">
          <strong>{first._tasksCompleted ?? 0}</strong>
        </GroupFigure>
        <GroupFigure icon="fas fa-chart-line" label="Ort. verimlilik">
          {isNumber(first._avgEfficiency) ? <Efficiency value={first._avgEfficiency} /> : dash}
        </GroupFigure>
        <GroupFigure icon="fas fa-clock" label="Zamanında">
          {isNumber(first._onTimeRate) ? (
            <strong>{formatNumber(first._onTimeRate, 1)}%</strong>
          ) : (
            dash
          )}
        </GroupFigure>
      </Group>
    );
  },
};

/** Port of manufacturing/machining/reports/performance (performance.js). */
export function PerformanceReportPage() {
  const [defaults] = useState(() => defaultRange());
  const { values, apply, reset } = useUrlFilters(defaults);
  const filters = useMemo(
    () => ({ start_date: values.start_date, end_date: values.end_date }),
    [values.start_date, values.end_date],
  );

  const report = useQuery({
    // An emptied date falls back to the default range (legacy loadReport).
    ...performanceReportQueryOptions({
      start_date: filters.start_date || defaults.start_date,
      end_date: filters.end_date || defaults.end_date,
    }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (report.isError) notify.error('Rapor yüklenirken hata oluştu');
  }, [report.isError, report.errorUpdatedAt]);

  // A failed load empties the table (legacy renderError); the figures keep the last report.
  const rows = useMemo(
    () => (report.isError ? EMPTY_ROWS : flattenPerformance(report.data)),
    [report.isError, report.data],
  );
  const summary = report.data?.summary ?? {};
  const figure = (value: string) => (report.isPending ? '–' : value);

  return (
    <>
      <PageHeader
        title="Performans Raporu"
        subtitle="Seçilen dönemde kullanıcı bazlı verimlilik ve performans analizi"
        icon="chart-bar"
        backTo="/manufacturing/machining/reports"
        stats={[
          {
            id: 'stat-users',
            label: 'Toplam Kullanıcı',
            value: figure(String(summary.total_users ?? 0)),
          },
          {
            id: 'stat-hours',
            label: 'Toplam Çalışma Saati',
            value: figure(formatNumber(summary.total_hours ?? 0, 2)),
          },
          {
            id: 'stat-completed',
            label: 'Tamamlanan Görev',
            value: figure(String(summary.tasks_completed ?? 0)),
          },
          {
            id: 'stat-worked',
            label: 'Çalışılan Görev',
            value: figure(String(summary.total_tasks_worked ?? 0)),
          },
          {
            id: 'stat-efficiency',
            label: 'Ortalama Verimlilik',
            value: figure(efficiencyText(summary.avg_efficiency)),
          },
          {
            id: 'stat-ontime',
            label: 'Zamanında Tamamlama',
            value: figure(
              isNumber(summary.on_time_rate) ? `${formatNumber(summary.on_time_rate, 1)}%` : '-',
            ),
          },
        ]}
      />

      <DataTable
        title="Kullanıcı Performans Raporu"
        icon="fas fa-chart-bar"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply(next)}
            onClear={() => {
              reset();
              notify.info('Filtreler temizlendi');
            }}
          />
        }
        data={rows}
        columns={performanceColumns}
        getRowId={(row, index) => `${row._userId}:${row.task_key ?? ''}:${index}`}
        grouping={grouping}
        sortable
        loading={report.isFetching}
        emptyMessage="Bu dönem için rapor verisi bulunamadı"
        onRefresh={() => void report.refetch()}
        exportable={{ fileName: `performance-table-container_${dayjs().format('YYYY-MM-DD')}` }}
      />
    </>
  );
}
