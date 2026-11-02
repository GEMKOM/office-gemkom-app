import { Group } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import {
  dailyEfficiencyQueryOptions,
  type DailyEfficiencyReport,
  type DailyEfficiencyTask,
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

/** A task row with its user (legacy renderUsersTable flattening). */
export interface DailyTaskRow extends DailyEfficiencyTask, UserFields {
  _userTotalDailyHours?: number | null;
}

type FilterKeys = 'date' | 'include_worked';

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'date', key: 'date', label: 'Tarih', span: 3 },
  {
    type: 'checkbox',
    key: 'include_worked',
    label: 'O gün çalışılan tüm görevler (tamamlanmamış dahil)',
    span: 4,
  },
];

const EMPTY_ROWS: DailyTaskRow[] = [];

/** Yesterday, or Friday on a Monday (legacy getPreviousBusinessDay), as a local day. */
export function previousBusinessDay(today = dayjs()): string {
  return localDay(today.subtract(today.day() === 1 ? 3 : 1, 'day'));
}

export function flattenDailyReport(report: DailyEfficiencyReport | undefined): DailyTaskRow[] {
  const rows: DailyTaskRow[] = [];
  for (const user of report?.users ?? []) {
    for (const task of user.tasks ?? []) {
      rows.push({ ...task, ...userFields(user), _userTotalDailyHours: user.total_daily_hours });
    }
  }
  return rows;
}

/** Legacy updateStatistics: users without tasks count too. */
function reportStats(report: DailyEfficiencyReport | undefined) {
  const users = report?.users ?? [];
  const efficiencies = users
    .flatMap((user) => user.tasks ?? [])
    .map((task) => task.efficiency)
    .filter((value): value is number => typeof value === 'number');
  return {
    users: users.length,
    hours: users.reduce((sum, user) => sum + (user.total_daily_hours || 0), 0),
    tasks: users.reduce((sum, user) => sum + (user.tasks?.length ?? 0), 0),
    efficiency: efficiencies.length
      ? `${Math.round(efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length)}%`
      : '-',
  };
}

function dailyColumns(includeWorked: boolean): DataTableColumn<DailyTaskRow>[] {
  return [
    userExportColumn<DailyTaskRow>(),
    {
      key: 'task_key',
      header: 'TI No',
      sortable: true,
      render: (row) => <TaskKeyLink value={row.task_key} />,
      exportValue: (row) => row.task_key || '-',
    },
    ...(includeWorked
      ? [
          {
            key: 'completed_on_date',
            header: 'Tarihte tamamlandı',
            sortable: true,
            render: (row) => <YesNo value={row.completed_on_date} />,
            exportValue: (row) => yesNoText(row.completed_on_date),
          } satisfies DataTableColumn<DailyTaskRow>,
        ]
      : []),
    {
      key: 'task_name',
      header: 'Görev Adı',
      sortable: true,
      render: (row) => <Truncated value={row.task_name} max={30} ellipsis="..." />,
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
      render: (row) => <Truncated value={row.machine_name} max={25} ellipsis="..." />,
      exportValue: (row) => row.machine_name || '-',
    },
    {
      key: 'daily_duration_hours',
      header: 'Günlük Süre (saat)',
      sortable: true,
      render: (row) => <BoldHours value={row.daily_duration_hours} />,
      exportValue: (row) => hoursExport(row.daily_duration_hours),
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
      header: 'Toplam Harcanan (saat)',
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
  ];
}

/** Legacy groupHeaderFormatter: the user, the task count and the day's total hours. */
const grouping: DataTableGrouping<DailyTaskRow> = {
  by: '_userId',
  header: ({ rows }) => {
    const first = rows[0]!;
    return (
      <Group gap="lg" wrap="wrap" component="span">
        <UserGroupTitle row={first} count={rows.length} />
        <GroupFigure icon="fas fa-clock" label="Toplam">
          {formatNumber(first._userTotalDailyHours || 0, 2)} saat
        </GroupFigure>
      </Group>
    );
  },
};

/** Port of manufacturing/machining/reports/daily-efficiency (dailyEfficiency.js). */
export function DailyEfficiencyPage() {
  // The previous business day is the default; only another day goes in the URL.
  const [defaults] = useState(() => ({ date: previousBusinessDay(), include_worked: false }));
  const { values, apply, reset } = useUrlFilters(defaults);
  const filters = useMemo(
    () => ({ date: values.date, include_worked: values.include_worked }),
    [values.date, values.include_worked],
  );

  const report = useQuery({
    // An emptied date falls back to the previous business day (legacy loadReport).
    ...dailyEfficiencyQueryOptions({
      date: filters.date || defaults.date,
      include_worked: filters.include_worked,
    }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (report.isError) notify.error('Rapor yüklenirken hata oluştu');
  }, [report.isError, report.errorUpdatedAt]);

  // A failed load empties the table (legacy renderErrorState).
  const shown = report.isError ? undefined : report.data;
  const rows = useMemo(() => (shown ? flattenDailyReport(shown) : EMPTY_ROWS), [shown]);
  // The completion column follows the report on screen, not the pending one.
  const includeWorked = shown?._includeWorked ?? false;
  const columns = useMemo(() => dailyColumns(includeWorked), [includeWorked]);
  const stats = reportStats(shown);
  const figure = (value: string) => (report.isPending ? '–' : value);

  return (
    <>
      <PageHeader
        title="Günlük Verimlilik Raporu"
        subtitle="Kullanıcıların günlük görev verimliliği analizi"
        icon="chart-line"
        backTo="/manufacturing/machining/reports"
        stats={[
          {
            id: 'total-users-count',
            label: 'Toplam Kullanıcı',
            value: figure(String(stats.users)),
          },
          {
            id: 'total-work-hours',
            label: 'Toplam Çalışma Saati',
            value: figure(formatNumber(stats.hours, 2)),
          },
          { id: 'total-tasks', label: 'Toplam Görev', value: figure(String(stats.tasks)) },
          { id: 'avg-efficiency', label: 'Ortalama Verimlilik', value: figure(stats.efficiency) },
        ]}
      />

      <DataTable
        title="Günlük Verimlilik Raporu"
        icon="fas fa-tasks"
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
        columns={columns}
        getRowId={(row, index) => `${row._userId}:${row.task_key ?? ''}:${index}`}
        grouping={grouping}
        sortable
        loading={report.isFetching}
        emptyMessage="Bu tarih için rapor verisi bulunamadı"
        onRefresh={() => void report.refetch()}
        exportable={{ fileName: `users-report-table-container_${dayjs().format('YYYY-MM-DD')}` }}
      />
    </>
  );
}
