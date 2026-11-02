import { Button, Stack } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { paymentForecastQueryOptions, type PaymentForecastMonth } from '@/api/procurement/reports';
import { formatCurrency, formatPercent } from '@/lib/format';
import {
  DataTable,
  errorMessage,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  Panel,
  StatusBadge,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import {
  BarsChart,
  compactCurrency,
  DashCell,
  DashGrid,
  DonutBreakdown,
  GRAPHITE,
  KpiGrid,
  KpiTile,
  SERIES,
  STATUS,
  TrendChart,
  valueFormats,
} from '@/ui/charts';
import {
  chartMonths,
  executiveKpis,
  formatMonth,
  num,
  paymentSplit,
  seriesOf,
} from './executiveData';

// The legacy filters were not in the URL; these keys are the API params.
const URL_DEFAULTS = { created_gte: '', created_lte: '' };

type FilterKeys = 'created_gte' | 'created_lte';

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'date', key: 'created_gte', label: 'Başlangıç Tarihi' },
  { type: 'date', key: 'created_lte', label: 'Bitiş Tarihi' },
];

const EUR = valueFormats.currency('EUR', 2);
const eur = (value: unknown) => formatCurrency(num(value), 'EUR', 2);
const eurAxis = (v: number) => compactCurrency(v, 'EUR');
const EUR_FORMAT = '#,##0.00 "€"';

const columns: DataTableColumn<PaymentForecastMonth>[] = [
  { key: 'month', header: 'Ay', render: (row) => formatMonth(row.month) },
  {
    key: 'total_spent_eur',
    header: 'Harcama (EUR)',
    align: 'right',
    accessor: (row) => num(row.total_spent_eur),
    exportFormat: EUR_FORMAT,
    render: (row) => eur(row.total_spent_eur),
  },
  {
    key: 'paid_eur',
    header: 'Ödenen (EUR)',
    align: 'right',
    accessor: (row) => num(row.paid_eur),
    exportFormat: EUR_FORMAT,
    render: (row) => <span style={{ color: '#11633d' }}>{eur(row.paid_eur)}</span>,
  },
  {
    key: 'awaiting_eur',
    header: 'Bekleyen (EUR)',
    align: 'right',
    accessor: (row) => num(row.awaiting_eur),
    exportFormat: EUR_FORMAT,
    render: (row) => <span style={{ color: '#a31d1d' }}>{eur(row.awaiting_eur)}</span>,
  },
  {
    key: 'po_count',
    header: 'PO Sayısı',
    align: 'right',
    accessor: (row) => Number(row.po_count ?? 0) || 0,
    render: (row) => <StatusBadge color="grey">{String(row.po_count || 0)}</StatusBadge>,
  },
  {
    key: 'active_suppliers',
    header: 'Aktif Tedarikçiler',
    align: 'right',
    accessor: (row) => Number(row.active_suppliers ?? 0) || 0,
    render: (row) => <StatusBadge color="green">{String(row.active_suppliers || 0)}</StatusBadge>,
  },
];

function exportFileName() {
  return `yonetici-ozeti_${new Date().toISOString().split('T')[0]}`;
}

/** "%12,5" change with its direction as an arrow (legacy colours ≥ 0 green, < 0 red). */
function changeTile(
  id: string,
  label: string,
  value: number | null,
  icon: string,
  loading: boolean,
) {
  return (
    <KpiTile
      id={id}
      label={label}
      icon={icon}
      value={loading ? '–' : value === null ? formatPercent(0) : formatPercent(value)}
      status={
        loading || value === null
          ? undefined
          : value >= 0
            ? { tone: 'good', label: 'Artış' }
            : { tone: 'bad', label: 'Azalış' }
      }
    />
  );
}

/** Port of finance/reports/executive-overview (executive-overview.js). */
export function ExecutiveOverviewPage() {
  const { values, apply, reset } = useUrlFilters(URL_DEFAULTS);
  const params = { created_gte: values.created_gte, created_lte: values.created_lte };
  const report = useQuery({
    ...paymentForecastQueryOptions(params),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (report.isError)
      notify.error(`Yönetici özeti yüklenirken hata oluştu: ${errorMessage(report.error)}`);
  }, [report.isError, report.errorUpdatedAt, report.error]);

  const data = report.isError ? null : report.data;
  const kpis = useMemo(() => executiveKpis(data), [data]);
  const series = useMemo(() => seriesOf(data), [data]);
  const months = useMemo(() => chartMonths(series), [series]);
  const split = useMemo(() => paymentSplit(months), [months]);

  const loading = report.isPending;
  const figure = (text: string) => (loading ? '–' : report.isError ? '—' : text);
  const emptyChart = loading ? 'Yükleniyor…' : months.length ? undefined : 'Aylık veri bulunamadı.';

  return (
    <>
      <PageHeader
        title="Yönetici Özeti"
        subtitle="Finansal durumun genel görünümü ve temel performans göstergeleri"
        icon="fas fa-chart-pie"
        backTo="/finance/reports"
        // Short figures on the band (it does not wrap on a phone); the tiles carry the exact amounts.
        stats={[
          {
            id: 'band-spent',
            label: 'Toplam Harcama',
            value: figure(compactCurrency(kpis.totalSpent, 'EUR')),
          },
          {
            id: 'band-paid',
            label: 'Ödenen',
            value: figure(compactCurrency(kpis.totalPaid, 'EUR')),
          },
          {
            id: 'band-awaiting',
            label: 'Bekleyen',
            value: figure(compactCurrency(kpis.totalAwaiting, 'EUR')),
          },
        ]}
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            onClick={() => void report.refetch()}
            loading={report.isFetching}
          >
            Yenile
          </Button>
        }
      />

      <Stack gap="md">
        <Panel>
          <Stack gap="md">
            <FilterBar
              inline
              filters={filterConfig}
              values={values}
              onApply={apply}
              onClear={reset}
            />
            <KpiGrid minWidth={180}>
              <KpiTile
                id="total-spent"
                label="Toplam Harcama"
                icon="fas fa-euro-sign"
                value={figure(eur(kpis.totalSpent))}
              />
              <KpiTile
                id="total-paid"
                label="Ödenen"
                icon="fas fa-check-circle"
                value={figure(eur(kpis.totalPaid))}
              />
              <KpiTile
                id="total-awaiting"
                label="Bekleyen"
                icon="fas fa-clock"
                value={figure(eur(kpis.totalAwaiting))}
              />
              <KpiTile
                id="po-count"
                label="PO Sayısı"
                icon="fas fa-file-invoice"
                value={figure(String(kpis.poCount))}
              />
              <KpiTile
                id="active-suppliers"
                label="Aktif Tedarikçiler"
                icon="fas fa-truck"
                value={figure(String(kpis.activeSuppliers))}
              />
              {changeTile(
                'mom-percent',
                'Aylık Değişim',
                kpis.mom,
                'fas fa-arrows-up-down',
                loading || report.isError,
              )}
              {changeTile(
                'yoy-percent',
                'Yıllık Değişim',
                kpis.yoy,
                'fas fa-calendar-alt',
                loading || report.isError,
              )}
            </KpiGrid>
          </Stack>
        </Panel>

        <DashGrid>
          <DashCell span={8}>
            <Panel title="Kümülatif Harcama Trendi" icon="fas fa-chart-line">
              <TrendChart
                label="Kümülatif harcama trendi"
                data={months}
                categoryKey="label"
                categoryLabel="Ay"
                series={[
                  { key: 'cumulativeSpent', label: 'Kümülatif Harcama (EUR)', color: GRAPHITE },
                  { key: 'cumulativePaid', label: 'Kümülatif Ödenen (EUR)', color: STATUS.good },
                  {
                    key: 'cumulativeAwaiting',
                    label: 'Kümülatif Bekleyen (EUR)',
                    color: STATUS.bad,
                    pattern: 'dashed',
                  },
                ]}
                format={EUR}
                axisFormat={eurAxis}
                height={280}
                empty={emptyChart}
              />
            </Panel>
          </DashCell>
          <DashCell span={4}>
            <Panel title="PO ve Tedarikçi Sayıları" icon="fas fa-chart-bar">
              <BarsChart
                label="PO ve tedarikçi sayıları"
                data={months}
                categoryKey="label"
                categoryLabel="Ay"
                series={[
                  { key: 'poCount', label: 'PO Sayısı', color: SERIES.blue },
                  { key: 'activeSuppliers', label: 'Aktif Tedarikçiler', color: SERIES.orange },
                ]}
                format={valueFormats.number()}
                axisFormat={(v) => (Number.isInteger(v) ? String(v) : '')}
                height={280}
                empty={emptyChart}
              />
            </Panel>
          </DashCell>
          <DashCell span={6}>
            <Panel title="Ödeme Durumu" icon="fas fa-credit-card">
              <BarsChart
                label="Ödeme durumu"
                data={months}
                categoryKey="label"
                categoryLabel="Ay"
                series={[
                  { key: 'paid', label: 'Ödenen (EUR)', color: STATUS.good },
                  { key: 'awaiting', label: 'Bekleyen (EUR)', color: STATUS.bad, pattern: 'hatch' },
                ]}
                format={EUR}
                axisFormat={eurAxis}
                height={260}
                empty={emptyChart}
              />
            </Panel>
          </DashCell>
          <DashCell span={6}>
            <Panel title="Ödeme Dağılımı" icon="fas fa-chart-pie">
              <DonutBreakdown
                label="Ödeme dağılımı"
                data={[
                  { name: 'Ödenen', value: split.paid, color: STATUS.good },
                  { name: 'Bekleyen', value: split.awaiting, color: STATUS.bad },
                ]}
                format={EUR}
                center={loading ? undefined : compactCurrency(split.paid + split.awaiting, 'EUR')}
                empty={loading ? 'Yükleniyor…' : undefined}
              />
            </Panel>
          </DashCell>
          <DashCell>
            <DataTable
              title="Aylık Detaylar"
              icon="fas fa-chart-bar"
              data={series}
              columns={columns}
              getRowId={(row, index) => `${row.month}-${index}`}
              loading={report.isFetching}
              sortable
              pagination={{ pageSize: 12 }}
              emptyMessage="Aylık veri bulunamadı."
              exportable={{ fileName: exportFileName() }}
            />
          </DashCell>
        </DashGrid>
      </Stack>
    </>
  );
}
