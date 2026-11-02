import { Group, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  faultsSummaryQueryOptions,
  type FaultsSummaryParams,
  type MachineFaultSummary,
} from '@/api/maintenance/reports';
import {
  DataTable,
  FaIcon,
  FilterBar,
  PageHeader,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import { formatDuration, legacyExportName, localDay } from '../../shared';

const URL_DEFAULTS = { search: '', dateRange: '', page: '1', page_size: '20' };

type FilterKeys = 'search' | 'dateRange';
type FilterState = Record<FilterKeys, string>;

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Ara (Ad/Kod)', placeholder: 'Makine adı veya kodu' },
  {
    type: 'select',
    key: 'dateRange',
    label: 'Tarih',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'today', label: 'Bugün' },
      { value: 'week', label: 'Bu Hafta' },
      { value: 'month', label: 'Bu Ay' },
    ],
  },
];

const EMPTY_FILTERS: FilterState = { search: '', dateRange: '' };
const EMPTY_ROWS: MachineFaultSummary[] = [];

/**
 * Legacy buildApiFilters: the date shortcut becomes reported_at__date (today)
 * or reported_at__gte (7 days / one month back). Days are local; legacy took
 * them from toISOString(), a day early around midnight.
 */
export function faultsReportParams(values: FilterState, now = new Date()): FaultsSummaryParams {
  const params: FaultsSummaryParams = {};
  const search = values.search.trim();
  if (search) params.search = search;
  if (values.dateRange === 'today') {
    params.reported_at__date = localDay(now);
  } else if (values.dateRange === 'week') {
    params.reported_at__gte = localDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  } else if (values.dateRange === 'month') {
    params.reported_at__gte = localDay(
      new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
    );
  }
  return params;
}

const breakingPlusOther = (row: MachineFaultSummary) =>
  Number(row.total_breaking_downtime_seconds || 0) +
  Number(row.total_non_breaking_duration_seconds || 0);

function DurationCell({ seconds }: { seconds: unknown }) {
  return (
    <Group gap={8} wrap="nowrap">
      <FaIcon icon="fas fa-clock" style={{ color: 'var(--mantine-color-dimmed)' }} />
      <Text span size="sm" fw={600}>
        {formatDuration(seconds)}
      </Text>
    </Group>
  );
}

// Legacy marked every column sortable but had no onSort, so nothing sorted.
const columns: DataTableColumn<MachineFaultSummary>[] = [
  {
    key: 'name',
    header: 'Makine',
    render: (row) => (
      <Group gap={8} wrap="nowrap">
        <FaIcon icon="fas fa-cog" style={{ color: 'var(--mantine-color-dimmed)' }} />
        <Text span size="sm" fw={600}>
          {row.name || '-'}
        </Text>
      </Group>
    ),
    exportValue: (row) => row.name || '',
  },
  {
    key: 'total_faults',
    header: 'Toplam Arıza',
    render: (row) => Number(row.total_faults ?? 0).toLocaleString('tr-TR'),
    exportValue: (row) => Number(row.total_faults ?? 0),
  },
  {
    key: 'breaking_faults_count',
    header: 'Duruşlu Arıza',
    render: (row) => Number(row.breaking_faults_count ?? 0).toLocaleString('tr-TR'),
    exportValue: (row) => Number(row.breaking_faults_count ?? 0),
  },
  {
    key: 'total_breaking_downtime_seconds',
    header: 'Toplam Duruş',
    render: (row) => <DurationCell seconds={row.total_breaking_downtime_seconds} />,
    exportValue: (row) => formatDuration(row.total_breaking_downtime_seconds),
  },
  {
    key: 'total_non_breaking_duration_seconds',
    header: 'Duruş Harici Arıza Süresi',
    render: (row) => <DurationCell seconds={row.total_non_breaking_duration_seconds} />,
    exportValue: (row) => formatDuration(row.total_non_breaking_duration_seconds),
  },
  {
    key: 'total_downtime_seconds',
    header: 'Toplam Arıza Süresi',
    // Legacy shows breaking + non-breaking here, not total_downtime_seconds.
    render: (row) => <DurationCell seconds={breakingPlusOther(row)} />,
    exportValue: (row) => formatDuration(breakingPlusOther(row)),
  },
];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of manufacturing/maintenance/reports/faults (faults.js). */
export function FaultsReportPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({ search: values.search, dateRange: values.dateRange }),
    [values.search, values.dateRange],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);

  const params: FaultsSummaryParams = { page, page_size: pageSize, ...faultsReportParams(filters) };
  const report = useQuery({
    ...faultsSummaryQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const rows = report.data?.results ?? EMPTY_ROWS;
  const total = report.data?.count ?? 0;

  // Legacy sums the loaded page.
  const stats = useMemo(
    () => ({
      machines: rows.length,
      faults: rows.reduce((sum, r) => sum + (Number(r.total_faults) || 0), 0),
      breaking: rows.reduce((sum, r) => sum + (Number(r.breaking_faults_count) || 0), 0),
      downtime: rows.reduce((sum, r) => sum + (Number(r.total_downtime_seconds) || 0), 0),
    }),
    [rows],
  );
  const figure = (value: string | number) =>
    report.isPending ? '–' : typeof value === 'number' ? value.toLocaleString('tr-TR') : value;

  return (
    <>
      <PageHeader
        title="Arızalar Özeti"
        subtitle="Makine bazında arıza özeti ve toplam duruş süresi"
        icon="chart-bar"
        backTo="/manufacturing/maintenance/reports"
        stats={[
          { id: 'machines-count', label: 'Makine Sayısı', value: figure(stats.machines) },
          { id: 'faults-count', label: 'Toplam Arıza', value: figure(stats.faults) },
          { id: 'breaking-count', label: 'Duruşlu Arıza', value: figure(stats.breaking) },
          {
            id: 'downtime-total',
            label: 'Toplam Duruş',
            value: figure(formatDuration(stats.downtime)),
          },
        ]}
      />

      <DataTable
        title="Arızalar Özeti"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ ...EMPTY_FILTERS, page: '1' })}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row, index) => String(row.id ?? `${row.name}-${index}`)}
        loading={report.isFetching}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        emptyMessage="Kayıt bulunamadı"
        onRefresh={() => void report.refetch()}
        exportable={{ fileName: legacyExportName(), sheetName: 'Sheet1' }}
      />
    </>
  );
}
