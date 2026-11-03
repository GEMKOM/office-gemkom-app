import { Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { weldingJobCostTotalsQueryOptions } from '@/api/welding/jobCosts';
import {
  DataTable,
  FilterBar,
  PageHeader,
  StatCards,
  useUrlFilters,
  notify,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { euro, hours, jobCostColumns } from './columns';
import { costStats, toJobCostRow, type JobCostRow } from './costAnalysis';
import { UserDetailsModal } from './UserDetailsModal';

// The filters live in the URL; the keys are the API params.
const URL_DEFAULTS = { job_no: '', date_after: '', date_before: '' };

type FilterKeys = keyof typeof URL_DEFAULTS;
type FilterState = Record<FilterKeys, string>;

const filterConfig: FilterConfig<FilterKeys>[] = [
  {
    type: 'text',
    key: 'job_no',
    label: 'İş No',
    placeholder: 'İş numarası girin (isteğe bağlı)',
    span: 4,
  },
  // The entry's work date, not its creation date.
  { type: 'date', key: 'date_after', label: 'Başlangıç Tarihi', span: 3 },
  { type: 'date', key: 'date_before', label: 'Bitiş Tarihi', span: 3 },
];

const EMPTY_FILTERS: FilterState = { job_no: '', date_after: '', date_before: '' };
const EMPTY_ROWS: JobCostRow[] = [];
const DEFAULT_SORT = { sortBy: 'job_no', sortDir: 'asc' } as const;

function Leader({ jobNo, detail }: { jobNo: string; detail: string }): ReactNode {
  return (
    <>
      <span className={uiClasses.code}>{jobNo}</span>
      <Text size="xs" c="dimmed" fw={500}>
        {detail}
      </Text>
    </>
  );
}

/** Port of manufacturing/welding/reports/cost-analysis (costAnalysis.js). */
export function CostAnalysisPage({ switcher }: { switcher?: ReactNode }) {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({
      job_no: values.job_no,
      date_after: values.date_after,
      date_before: values.date_before,
    }),
    [values.job_no, values.date_after, values.date_before],
  );

  // The endpoint returns every job at once; the table sorts and pages the
  // loaded rows itself (legacy sortJobHoursData), so no ordering is sent.
  const list = useQuery({
    ...weldingJobCostTotalsQueryOptions({
      job_no: filters.job_no || undefined,
      date_after: filters.date_after || undefined,
      date_before: filters.date_before || undefined,
    }),
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => list.data?.results.map(toJobCostRow) ?? EMPTY_ROWS, [list.data]);
  const stats = useMemo(() => costStats(rows), [rows]);

  useEffect(() => {
    if (list.isError) notify.error('Veri yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
  }, [list.isError, list.errorUpdatedAt]);

  const [detailJob, setDetailJob] = useState<string | null>(null);
  const closeDetail = useCallback(() => setDetailJob(null), []);

  const rowActions = (row: JobCostRow): RowAction<JobCostRow>[] => [
    {
      key: 'details',
      label: 'Kullanıcı Detaylarını Görüntüle',
      icon: 'fas fa-users',
      color: 'primary',
      onClick: () => setDetailJob(row.job_no),
    },
  ];

  const exportName = `maliyet-analizi-raporu_${new Date().toISOString().slice(0, 10)}`;

  return (
    <>
      <PageHeader
        title="İş Maliyeti Raporu"
        subtitle="İş numaralarına göre detaylı maliyet analizi, saat başı maliyet hesaplamaları ve kullanıcı bazlı detaylar. Tüm iş numaraları görüntülenir, belirli bir iş numarası için filtreleme yapabilirsiniz."
        icon="fas fa-calculator"
        backTo="/manufacturing/reports/"
        backLabel="Raporlara Dön"
        actions={switcher}
      />

      <StatCards
        loading={list.isPending}
        cards={[
          {
            id: 'most-expensive-job',
            title: 'En Pahalı İş',
            icon: 'fas fa-euro-sign',
            color: 'danger',
            value: stats ? (
              <Leader jobNo={stats.mostExpensive.job_no} detail={euro(stats.mostExpensive.value)} />
            ) : (
              '-'
            ),
          },
          {
            id: 'most-expensive-per-hour',
            title: 'En Pahalı Saat Başı',
            icon: 'fas fa-clock',
            color: 'warning',
            value: stats ? (
              <Leader
                jobNo={stats.mostExpensivePerHour.job_no}
                detail={`${euro(stats.mostExpensivePerHour.value)}/saat`}
              />
            ) : (
              '-'
            ),
          },
          {
            id: 'most-overtime-cost',
            title: 'En Çok Mesai Maliyeti',
            icon: 'fas fa-calendar',
            color: 'info',
            value: stats ? (
              <Leader
                jobNo={stats.mostOvertimeCost.job_no}
                detail={euro(stats.mostOvertimeCost.value)}
              />
            ) : (
              '-'
            ),
          },
          {
            id: 'most-hours-job',
            title: 'En Çok Çalışılan İş',
            icon: 'fas fa-chart-bar',
            color: 'success',
            value: stats ? (
              <Leader
                jobNo={stats.mostHours.job_no}
                detail={`${hours(stats.mostHours.value)} saat`}
              />
            ) : (
              '-'
            ),
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
            onClear={() => apply(EMPTY_FILTERS)}
          />
        }
        data={rows}
        columns={jobCostColumns}
        getRowId={(row) => row.job_no}
        loading={list.isFetching}
        sortable
        defaultSort={DEFAULT_SORT}
        pagination
        rowActions={rowActions}
        onRowClick={(row) => setDetailJob(row.job_no)}
        emptyMessage="Veri bulunamadı"
        exportable={{ fileName: exportName }}
        onRefresh={() => void list.refetch()}
      />

      {detailJob ? (
        <UserDetailsModal
          key={detailJob}
          jobNo={detailJob}
          dateAfter={filters.date_after || undefined}
          dateBefore={filters.date_before || undefined}
          onClose={closeDetail}
        />
      ) : null}
    </>
  );
}
