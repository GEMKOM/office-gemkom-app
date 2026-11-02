import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TimerModule } from '@/api/manufacturing/counts';
import { userReportQueryOptions, type UserReportDates } from '@/api/manufacturing/userReport';
import { formatNumber } from '@/lib/format';
import {
  DataTable,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type DateRange,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { UserDetailModal } from './UserDetailModal';
import {
  officeHours,
  summaryFooter,
  toReportRow,
  userReportColumns,
  type UserReportRow,
} from './userReportColumns';

const HEADERS: Record<TimerModule, { title: string; subtitle: string; backTo: string }> = {
  machining: {
    title: 'Kullanıcı Raporu',
    subtitle: 'Seçilen tarih aralığında kullanıcı çalışma performansı ve zaman kullanımı analizi',
    backTo: '/manufacturing/machining/reports',
  },
  cnc_cutting: {
    title: 'CNC Kesim — Kullanıcı Raporu',
    subtitle:
      'Seçilen tarih aralığında CNC kesim ekibi kullanıcı performansı, parça ve zaman kullanımı analizi',
    backTo: '/manufacturing/cnc-cutting/reports',
  },
};

const filterConfig: FilterConfig<'date'>[] = [
  { type: 'dateRange', key: 'date', label: 'Tarih aralığı' },
];

/** Legacy getReportDateParams: one open end takes the other; none sends nothing (backend: today). */
export function reportDates(range: DateRange): UserReportDates {
  let { start, end } = range;
  if (!start && !end) return {};
  if (!start) start = end;
  if (!end) end = start;
  return { start_date: start, end_date: end };
}

const EMPTY_ROWS: UserReportRow[] = [];

/** Port of {machining,cnc-cutting}/reports/user-report/userReport.js. */
export function UserReport({ module }: { module: TimerModule }) {
  const header = HEADERS[module];
  // The range opens on today (local day), as legacy did.
  const [defaults] = useState(() => {
    const today = dayjs().format('YYYY-MM-DD');
    return { date: { start: today, end: today } };
  });
  const { values, apply, reset } = useUrlFilters(defaults);
  const dates = reportDates(values.date);

  const report = useQuery({
    ...userReportQueryOptions(module, dates),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (report.isError) notify.error('Rapor yüklenirken hata oluştu');
  }, [report.isError, report.errorUpdatedAt]);

  const rows = useMemo(
    () => (report.isError ? EMPTY_ROWS : (report.data?.users ?? EMPTY_ROWS).map(toReportRow)),
    [report.data, report.isError],
  );
  const columns = useMemo(() => userReportColumns(module), [module]);
  const footer = useMemo(() => summaryFooter(columns), [columns]);

  const stats = useMemo(() => {
    const work = rows.reduce((sum, u) => sum + (u.total_work_hours || 0), 0);
    const idle = rows.reduce((sum, u) => sum + (u.total_idle_hours || 0), 0);
    const office = rows.reduce((sum, u) => sum + (officeHours(u) || 0), 0);
    return { users: rows.length, work, idle, efficiency: office > 0 ? (work / office) * 100 : 0 };
  }, [rows]);
  const figure = (value: string) => (report.isPending ? '–' : value);

  // ---- details ----
  const [selected, setSelected] = useState<UserReportRow | null>(null);
  const closeDetails = useCallback(() => setSelected(null), []);
  const showDetails = (row: UserReportRow) => {
    if ((row.id ?? row.user_id) == null) {
      notify.error('Kullanıcı kimliği bulunamadı');
      return;
    }
    setSelected(row);
  };
  const rowActions = (row: UserReportRow): RowAction<UserReportRow>[] => [
    {
      key: 'details',
      label: 'Detaylar',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => showDetails(row),
    },
  ];

  return (
    <>
      <PageHeader
        title={header.title}
        subtitle={header.subtitle}
        icon="fas fa-calendar-alt"
        backTo={header.backTo}
        stats={[
          {
            id: 'total-users-count',
            label: 'Toplam Kullanıcı',
            value: figure(formatNumber(stats.users)),
          },
          {
            id: 'total-work-hours',
            label: 'Toplam Çalışma Saati',
            value: figure(formatNumber(stats.work, 2)),
          },
          {
            id: 'total-idle-hours',
            label: 'Toplam Boşta Geçen Saat',
            value: figure(formatNumber(stats.idle, 2)),
          },
          {
            id: 'avg-efficiency',
            label: 'Ortalama Verimlilik',
            value: figure(`${formatNumber(stats.efficiency, 1)}%`),
          },
        ]}
      />

      <DataTable
        title={header.title}
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={values}
            onApply={(next) => apply(next)}
            onClear={() => {
              // Legacy Temizle goes back to today.
              reset();
              notify.info('Filtreler temizlendi');
            }}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id ?? row.user_id ?? row.username)}
        loading={report.isFetching}
        sortable
        pagination={{ pageSize: 20 }}
        rowActions={rowActions}
        footer={footer}
        emptyMessage="Bu aralık için rapor verisi bulunamadı"
        onRefresh={() => void report.refetch()}
      />

      {selected ? (
        <UserDetailModal
          key={String(selected.id ?? selected.user_id)}
          module={module}
          user={selected}
          dates={dates}
          onClose={closeDetails}
        />
      ) : null}
    </>
  );
}
