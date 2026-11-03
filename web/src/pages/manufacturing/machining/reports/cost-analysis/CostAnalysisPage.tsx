import { Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { jobCostReportQueryOptions, type JobCostRow } from '@/api/manufacturing/costAnalysis';
import { formatNumber } from '@/lib/format';
import {
  DataTable,
  FilterBar,
  notify,
  PageHeader,
  StatCards,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { euro, hoursOf, sumHours } from './costFormat';
import { JobUsersModal } from './JobUsersModal';

export interface JobCostTableRow {
  job_no: string;
  weekday_work_hours: number;
  after_hours_hours: number;
  sunday_hours: number;
  weekday_work_cost: number;
  after_hours_cost: number;
  sunday_cost: number;
  total_cost: number;
  cost_per_hour: number;
}

/** processJobCostData in costAnalysis.js. */
export function toTableRow(job: JobCostRow): JobCostTableRow {
  const total = sumHours(job.hours);
  return {
    job_no: job.job_no,
    weekday_work_hours: job.hours?.weekday_work || 0,
    after_hours_hours: job.hours?.after_hours || 0,
    sunday_hours: job.hours?.sunday || 0,
    weekday_work_cost: job.costs?.weekday_work || 0,
    after_hours_cost: job.costs?.after_hours || 0,
    sunday_cost: job.costs?.sunday || 0,
    total_cost: job.total_cost || 0,
    cost_per_hour: total > 0 ? (job.total_cost || 0) / total : 0,
  };
}

const money = (
  key: keyof JobCostTableRow,
  header: string,
  color?: string,
  bold = false,
): DataTableColumn<JobCostTableRow> => ({
  key,
  header,
  align: 'right',
  exportFormat: '#,##0.00 "€"',
  render: (row) => (
    <Text span size="sm" c={color} fw={bold ? 700 : undefined}>
      {euro(row[key] as number)}
    </Text>
  ),
});

const hours = (
  key: keyof JobCostTableRow,
  header: string,
  color?: string,
): DataTableColumn<JobCostTableRow> => ({
  key,
  header,
  align: 'right',
  render: (row) => (
    <Text span size="sm" c={color}>
      {hoursOf(row[key] as number)}
    </Text>
  ),
});

const columns: DataTableColumn<JobCostTableRow>[] = [
  {
    key: 'job_no',
    header: 'İş No',
    render: (row) => (
      <Text span size="sm" fw={700} ff="monospace">
        {row.job_no}
      </Text>
    ),
  },
  hours('weekday_work_hours', 'Hafta İçi Saat', 'blue.8'),
  hours('after_hours_hours', 'Mesai Saat', 'yellow.8'),
  hours('sunday_hours', 'Pazar Saat', 'red.8'),
  money('weekday_work_cost', 'Hafta İçi Maliyet', 'blue.8'),
  money('after_hours_cost', 'Mesai Maliyet', 'yellow.8'),
  money('sunday_cost', 'Pazar Maliyet', 'red.8'),
  money('total_cost', 'Toplam Maliyet', 'green.8', true),
  money('cost_per_hour', 'Saat Başı Maliyet', undefined, true),
];

interface Leader {
  job_no: string;
  detail: string;
}

/** The four "most" cards of updateStatistics (first job wins ties, as reduce did). */
export function costLeaders(rows: readonly JobCostTableRow[]): Leader[] | null {
  if (rows.length === 0) return null;
  const top = (score: (r: JobCostTableRow) => number) =>
    rows.reduce((max, row) => (score(row) > score(max) ? row : max));
  const totalHours = (r: JobCostTableRow) =>
    r.weekday_work_hours + r.after_hours_hours + r.sunday_hours;
  const overtime = (r: JobCostTableRow) => r.after_hours_cost + r.sunday_cost;
  const expensive = top((r) => r.total_cost);
  const perHour = top((r) => r.cost_per_hour);
  const mostOvertime = top(overtime);
  const mostHours = top(totalHours);
  return [
    { job_no: expensive.job_no, detail: euro(expensive.total_cost) },
    { job_no: perHour.job_no, detail: `${euro(perHour.cost_per_hour)}/saat` },
    { job_no: mostOvertime.job_no, detail: euro(overtime(mostOvertime)) },
    { job_no: mostHours.job_no, detail: `${formatNumber(totalHours(mostHours), 1)} saat` },
  ];
}

function LeaderValue({ leader }: { leader?: Leader }) {
  if (!leader) return <>-</>;
  return (
    <>
      {leader.job_no}
      <Text size="xs" c="dimmed" fw={500}>
        {leader.detail}
      </Text>
    </>
  );
}

const filterConfig: FilterConfig<'job_no'>[] = [
  { type: 'text', key: 'job_no', label: 'İş No', placeholder: 'İş numarası girin (isteğe bağlı)' },
];

const EMPTY_ROWS: JobCostTableRow[] = [];

/** Port of manufacturing/machining/reports/cost-analysis (costAnalysis.js). */
export function CostAnalysisPage({ switcher }: { switcher?: ReactNode }) {
  const { values, apply } = useUrlFilters({ job_no: '' });
  const filters = useMemo(() => ({ job_no: values.job_no }), [values.job_no]);

  const report = useQuery({
    ...jobCostReportQueryOptions({ job_no: filters.job_no.trim() || undefined }),
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => report.data?.map(toTableRow) ?? EMPTY_ROWS, [report.data]);
  const leaders = useMemo(() => costLeaders(rows), [rows]);

  useEffect(() => {
    if (report.isError) notify.error('Veri yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
  }, [report.isError, report.errorUpdatedAt]);

  const [detailJob, setDetailJob] = useState<string | null>(null);
  const rowActions = (row: JobCostTableRow): RowAction<JobCostTableRow>[] => [
    {
      key: 'details',
      label: 'Detaylar',
      icon: 'fas fa-users',
      color: 'primary',
      onClick: () => setDetailJob(row.job_no),
    },
  ];

  return (
    <>
      <PageHeader
        title="İş Maliyeti Raporu"
        subtitle="İş numaralarına göre detaylı maliyet analizi, saat başı maliyet hesaplamaları ve kullanıcı bazlı detaylar. Tüm iş numaraları görüntülenir, belirli bir iş numarası için filtreleme yapabilirsiniz."
        backTo="/manufacturing/reports/"
        backLabel="Raporlara Dön"
        actions={switcher}
      />

      <StatCards
        loading={report.isPending}
        cards={[
          {
            id: 'most-expensive-job',
            title: 'En Pahalı İş',
            icon: 'fas fa-euro-sign',
            color: 'danger',
            value: <LeaderValue leader={leaders?.[0]} />,
          },
          {
            id: 'most-expensive-per-hour',
            title: 'En Pahalı Saat Başı',
            icon: 'fas fa-clock',
            color: 'warning',
            value: <LeaderValue leader={leaders?.[1]} />,
          },
          {
            id: 'most-overtime-cost',
            title: 'En Çok Mesai Maliyeti',
            icon: 'fas fa-calendar',
            color: 'info',
            value: <LeaderValue leader={leaders?.[2]} />,
          },
          {
            id: 'most-hours-job',
            title: 'En Çok Çalışılan İş',
            icon: 'fas fa-chart-bar',
            color: 'success',
            value: <LeaderValue leader={leaders?.[3]} />,
          },
        ]}
      />

      <DataTable
        title="Maliyet Analizi Raporu"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply(next)}
            onClear={() => apply({ job_no: '' })}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => row.job_no}
        loading={report.isFetching}
        // The report comes in one response; sorting and paging happen here.
        sortable
        defaultSort={{ sortBy: 'job_no', sortDir: 'asc' }}
        pagination={{ pageSize: 20 }}
        onRowClick={(row) => setDetailJob(row.job_no)}
        rowActions={rowActions}
        emptyMessage="Veri bulunamadı"
        onRefresh={() => void report.refetch()}
        exportable={{ fileName: 'maliyet-analizi-raporu', sheetName: 'Maliyet Analizi' }}
      />

      {detailJob ? <JobUsersModal jobNo={detailJob} onClose={() => setDetailJob(null)} /> : null}
    </>
  );
}
