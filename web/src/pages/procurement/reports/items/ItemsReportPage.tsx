import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  itemsReportQueryOptions,
  type ItemsReportParams,
  type ItemsReportRow,
} from '@/api/procurement/reports';
import {
  DataTable,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { amount, chips, euro, exportDate, exportNumber, reportDate, today } from '../reportFormat';

const DEFAULT_ORDERING = '-total_spent_eur';
const URL_DEFAULTS = { code: '', name: '', ordering: DEFAULT_ORDERING };

type FilterState = { code: string; name: string };
const EMPTY_FILTERS: FilterState = { code: '', name: '' };

const filterConfig: FilterConfig<keyof FilterState>[] = [
  { type: 'text', key: 'code', label: 'Ürün Kodu', placeholder: 'Ürün kodu giriniz' },
  { type: 'text', key: 'name', label: 'Ürün Adı', placeholder: 'Ürün adı giriniz' },
];

const EMPTY_ROWS: ItemsReportRow[] = [];

export const itemsReportColumns: DataTableColumn<ItemsReportRow>[] = [
  {
    key: 'code',
    header: 'Ürün Kodu',
    render: (row) => <span className={uiClasses.code}>{row.code || '-'}</span>,
  },
  { key: 'name', header: 'Ürün Adı' },
  {
    key: 'buy_count',
    header: 'Talep Sayısı',
    align: 'right',
    render: (row) => row.buy_count || 0,
    exportValue: (row) => row.buy_count || 0,
  },
  {
    key: 'total_quantity',
    header: 'Toplam Miktar',
    align: 'right',
    render: (row) => amount(row.total_quantity),
    exportValue: (row) => exportNumber(row.total_quantity),
  },
  { key: 'unit', header: 'Birim', render: (row) => chips(row.unit ? [row.unit] : []) },
  {
    key: 'total_spent_eur',
    header: 'Toplam Harcama',
    align: 'right',
    render: (row) => <strong>{euro(row.total_spent_eur)}</strong>,
    exportHeader: 'Toplam Harcama (EUR)',
    exportValue: (row) => exportNumber(row.total_spent_eur),
  },
  {
    key: 'min_unit_price_eur',
    header: 'En Düşük Birim Fiyat',
    align: 'right',
    render: (row) => euro(row.min_unit_price_eur),
    exportHeader: 'En Düşük Birim Fiyat (EUR)',
    exportValue: (row) => exportNumber(row.min_unit_price_eur),
  },
  {
    key: 'suppliers',
    header: 'Tedarikçiler',
    sortable: false,
    render: (row) => chips(Array.isArray(row.suppliers) ? row.suppliers : []),
    exportValue: (row) => (Array.isArray(row.suppliers) ? row.suppliers.join(', ') : ''),
  },
  {
    key: 'last_bought_at',
    header: 'Son Satın Alma',
    render: (row) => reportDate(row.last_bought_at),
    exportValue: (row) => exportDate(row.last_bought_at),
  },
];

/** Request params as getItemsReport builds them. */
export function itemsReportParams(filters: FilterState, ordering: string): ItemsReportParams {
  const params: ItemsReportParams = {};
  if (filters.code) params.code__icontains = filters.code;
  if (filters.name) params.name__icontains = filters.name;
  if (ordering) params.ordering = ordering;
  return params;
}

/** Port of procurement/reports/items (items.js). */
export function ItemsReportPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({ code: values.code, name: values.name }),
    [values.code, values.name],
  );
  const sort = fromOrdering(values.ordering || DEFAULT_ORDERING);
  const ordering = toOrdering(sort.sortBy, sort.sortDir) ?? DEFAULT_ORDERING;

  const report = useQuery({
    ...itemsReportQueryOptions(itemsReportParams(filters, ordering)),
    placeholderData: keepPreviousData,
  });
  const rows = report.data ?? EMPTY_ROWS;

  useEffect(() => {
    if (report.isError)
      notify.error(report.error, { fallback: 'Ürün raporu yüklenirken hata oluştu' });
  }, [report.isError, report.error, report.errorUpdatedAt]);

  return (
    <>
      <PageHeader
        title="Ürün Raporu"
        subtitle="Ürün satın alma analizleri ve performans metrikleri"
        icon="fas fa-chart-bar"
        backTo="/procurement/reports"
      />

      <DataTable
        title="Ürün Raporu"
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
        columns={itemsReportColumns}
        getRowId={(row, index) => `${row.code ?? ''}-${index}`}
        loading={report.isFetching}
        sortable
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? DEFAULT_ORDERING }),
        }}
        pagination={{ pageSize: 20 }}
        exportable={{ fileName: `urun_raporu_${today()}` }}
        onRefresh={() => void report.refetch()}
        emptyMessage="Veri bulunamadı"
      />
    </>
  );
}
