import { Group, Progress, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { monthlyMetricsQueryOptions, type MonthlyMetric } from '@/api/maintenance/reports';
import { DataTable, PageHeader, StatCards, StatusBadge, type DataTableColumn } from '@/ui';
import { formatDuration, legacyExportName, periodLabel } from '../../shared';

const EMPTY_ROWS: MonthlyMetric[] = [];

const optionalDuration = (value: number | null | undefined) =>
  value != null ? formatDuration(value) : '-';
const oneDecimal = (value: number | null | undefined) =>
  value != null
    ? value.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : '-';

/** Legacy resolved-rate colours: ≥80 green, ≥50 orange, else red. */
function rateFamily(pct: number | null | undefined) {
  const n = pct ?? 0;
  return n >= 80 ? 'green' : n >= 50 ? 'orange' : 'red';
}

function buildColumns(maxFaults: number): DataTableColumn<MonthlyMetric>[] {
  return [
    {
      key: 'period',
      header: 'Dönem',
      render: (row) => (
        <Text span size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>
          {periodLabel(row.period)}
        </Text>
      ),
      exportValue: (row) => periodLabel(row.period),
    },
    {
      key: 'total_faults',
      header: 'Toplam Arıza',
      // Legacy faultBar: the count and a bar against the busiest month.
      render: (row) => (
        <Group gap={8} wrap="nowrap" miw={120}>
          <Text span size="sm" fw={600} miw={24}>
            {row.total_faults ?? 0}
          </Text>
          <Progress
            value={((row.total_faults ?? 0) / maxFaults) * 100}
            size={6}
            style={{ flex: 1 }}
            color="blue"
          />
        </Group>
      ),
      exportValue: (row) => row.total_faults ?? 0,
    },
    {
      key: 'breaking_faults',
      header: 'Makine Duruşu',
      render: (row) => (
        <Group gap={6} wrap="nowrap">
          <StatusBadge color="red">{row.breaking_faults ?? 0}</StatusBadge>
          {row.total_faults ? (
            <Text span size="xs" c="dimmed">
              {Math.round(((row.breaking_faults ?? 0) / row.total_faults) * 100)}%
            </Text>
          ) : null}
        </Group>
      ),
      exportValue: (row) => row.breaking_faults ?? 0,
    },
    {
      key: 'resolved_faults',
      header: 'Çözüldü',
      render: (row) => (
        <Group gap={6} wrap="nowrap">
          <StatusBadge color={rateFamily(row.resolve_rate_pct)}>
            {row.resolved_faults ?? 0}
          </StatusBadge>
          {row.resolve_rate_pct != null ? (
            <Text span size="xs" fw={600}>
              {row.resolve_rate_pct}%
            </Text>
          ) : null}
        </Group>
      ),
      exportValue: (row) => row.resolved_faults ?? 0,
    },
    {
      key: 'unresolved_faults',
      header: 'Açık',
      render: (row) =>
        (row.unresolved_faults ?? 0) > 0 ? (
          <StatusBadge color="yellow">{row.unresolved_faults}</StatusBadge>
        ) : (
          <Text span size="sm" c="dimmed">
            0
          </Text>
        ),
      exportValue: (row) => row.unresolved_faults ?? 0,
    },
    {
      key: 'avg_resolution_seconds',
      header: 'Ort. Çözüm Süresi',
      render: (row) => optionalDuration(row.avg_resolution_seconds),
      exportValue: (row) => optionalDuration(row.avg_resolution_seconds),
    },
    {
      key: 'min_resolution_seconds',
      header: 'En Hızlı',
      render: (row) =>
        row.min_resolution_seconds != null ? (
          <Text span size="sm" fw={600} c="green.8">
            {formatDuration(row.min_resolution_seconds)}
          </Text>
        ) : (
          '-'
        ),
      exportValue: (row) => optionalDuration(row.min_resolution_seconds),
    },
    {
      key: 'max_resolution_seconds',
      header: 'En Yavaş',
      render: (row) =>
        row.max_resolution_seconds != null ? (
          <Text span size="sm" fw={600} c="red.7">
            {formatDuration(row.max_resolution_seconds)}
          </Text>
        ) : (
          '-'
        ),
      exportValue: (row) => optionalDuration(row.max_resolution_seconds),
    },
    {
      key: 'total_breaking_downtime_seconds',
      header: 'Toplam Duruş',
      render: (row) =>
        row.total_breaking_downtime_seconds != null ? (
          <Text span size="sm" fw={600}>
            {formatDuration(row.total_breaking_downtime_seconds)}
          </Text>
        ) : (
          '-'
        ),
      exportValue: (row) => optionalDuration(row.total_breaking_downtime_seconds),
    },
    {
      key: 'unique_machines_affected',
      header: 'Etkilenen Makine',
      render: (row) => row.unique_machines_affected ?? 0,
      exportValue: (row) => row.unique_machines_affected ?? 0,
    },
    {
      key: 'unique_resolvers',
      header: 'Çözen Kişi',
      render: (row) => row.unique_resolvers ?? 0,
      exportValue: (row) => row.unique_resolvers ?? 0,
    },
  ];
}

/** Port of manufacturing/maintenance/reports/monthly-metrics (monthlyMetrics.js). */
export function MonthlyMetricsPage() {
  const report = useQuery(monthlyMetricsQueryOptions());
  // Most recent month first, as legacy reversed the API order.
  const rows = useMemo(
    () => (report.data ? [...report.data.monthly].reverse() : EMPTY_ROWS),
    [report.data],
  );
  const summary = report.data?.summary ?? {};

  const maxFaults = Math.max(...rows.map((r) => r.total_faults || 0), 1);
  const columns = useMemo(() => buildColumns(maxFaults), [maxFaults]);

  const figure = (value: string | number) =>
    report.isPending ? '–' : typeof value === 'number' ? value.toLocaleString('tr-TR') : value;

  return (
    <>
      <PageHeader
        title="Aylık Metrikler"
        subtitle="Arıza ve bakım süreçlerine ait aylık istatistikler ve trendler"
        icon="chart-bar"
        backTo="/manufacturing/maintenance/reports"
        stats={[
          {
            id: 'total-faults',
            label: 'Toplam Arıza',
            value: figure(summary.total_faults_all_time ?? 0),
          },
          {
            id: 'total-resolved',
            label: 'Toplam Çözüldü',
            value: figure(summary.total_resolved_all_time ?? 0),
          },
          {
            id: 'avg-resolution',
            label: 'Ort. Çözüm Süresi',
            value: figure(optionalDuration(summary.overall_avg_resolution_seconds)),
          },
          {
            id: 'total-downtime',
            label: 'Toplam Makine Duruşu',
            value: figure(optionalDuration(summary.total_breaking_downtime_all_time)),
          },
        ]}
      />

      {/* Legacy renderHighlights cards. */}
      <StatCards
        loading={report.isPending}
        cards={[
          {
            id: 'avg-faults-per-month',
            title: 'Aylık Ortalama Arıza',
            value: oneDecimal(summary.overall_avg_faults_per_month),
            icon: 'fas fa-chart-line',
            color: 'primary',
          },
          {
            id: 'avg-breaking-per-month',
            title: 'Aylık Ortalama Makine Duruşu',
            value: oneDecimal(summary.overall_avg_breaking_per_month),
            icon: 'fas fa-stop-circle',
            color: 'danger',
          },
          {
            id: 'busiest-month',
            title: 'En Yoğun Ay',
            value: periodLabel(summary.busiest_month),
            icon: 'fas fa-fire',
            color: 'orange',
          },
          {
            id: 'fastest-month',
            title: 'En Hızlı Çözüm Ayı',
            value: periodLabel(summary.fastest_month),
            icon: 'fas fa-bolt',
            color: 'success',
          },
        ]}
      />

      <DataTable
        title="Aylık Arıza Detayları"
        data={rows}
        columns={columns}
        getRowId={(row) => row.period}
        loading={report.isFetching}
        // Every month is loaded; legacy headers looked sortable but did nothing.
        sortable
        emptyMessage="Henüz kayıt bulunamadı"
        onRefresh={() => void report.refetch()}
        exportable={{ fileName: legacyExportName(), sheetName: 'Sheet1' }}
      />
    </>
  );
}
