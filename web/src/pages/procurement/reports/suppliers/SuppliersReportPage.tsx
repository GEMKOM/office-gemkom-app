import { Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  suppliersReportQueryOptions,
  type SuppliersReportParams,
  type SuppliersReportRow,
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
const URL_DEFAULTS = {
  name: '',
  code: '',
  has_dbs: '',
  created_gte: '',
  created_lte: '',
  min_total_spent_eur: '',
  ordering: DEFAULT_ORDERING,
};

type FilterState = {
  name: string;
  code: string;
  has_dbs: string;
  created_gte: string;
  created_lte: string;
  min_total_spent_eur: string;
};
const EMPTY_FILTERS: FilterState = {
  name: '',
  code: '',
  has_dbs: '',
  created_gte: '',
  created_lte: '',
  min_total_spent_eur: '',
};

const filterConfig: FilterConfig<keyof FilterState>[] = [
  { type: 'text', key: 'name', label: 'Tedarikçi Adı', placeholder: 'Tedarikçi adı giriniz' },
  { type: 'text', key: 'code', label: 'Tedarikçi Kodu', placeholder: 'Tedarikçi kodu giriniz' },
  {
    type: 'select',
    key: 'has_dbs',
    label: 'DBS Durumu',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'true', label: 'DBS Var' },
      { value: 'false', label: 'DBS Yok' },
    ],
  },
  { type: 'date', key: 'created_gte', label: 'Başlangıç Tarihi' },
  { type: 'date', key: 'created_lte', label: 'Bitiş Tarihi' },
  {
    type: 'text',
    key: 'min_total_spent_eur',
    label: 'Min. Toplam Harcama (EUR)',
    placeholder: 'Minimum harcama giriniz',
    inputType: 'number',
  },
];

const EMPTY_ROWS: SuppliersReportRow[] = [];

const dash = (
  <Text size="sm" c="dimmed">
    -
  </Text>
);

const count = (value: number | undefined) => value || 0;

export const suppliersReportColumns: DataTableColumn<SuppliersReportRow>[] = [
  {
    key: 'code',
    header: 'Tedarikçi Kodu',
    render: (row) => <span className={uiClasses.code}>{row.code || '-'}</span>,
  },
  { key: 'name', header: 'Tedarikçi Adı' },
  {
    key: 'default_currency',
    header: 'Varsayılan Para Birimi',
    render: (row) => chips(row.default_currency ? [row.default_currency] : []),
  },
  {
    key: 'has_dbs',
    header: 'DBS Durumu',
    render: (row) =>
      row.has_dbs === true ? chips(['DBS Var']) : row.has_dbs === false ? chips(['DBS Yok']) : dash,
    exportValue: (row) => (row.has_dbs ? 'DBS Var' : 'DBS Yok'),
  },
  {
    key: 'dbs_limit',
    header: 'DBS Limiti',
    align: 'right',
    render: (row) => (row.dbs_limit ? amount(row.dbs_limit) : dash),
    exportValue: (row) => exportNumber(row.dbs_limit),
  },
  {
    key: 'total_pos',
    header: 'Toplam PO',
    align: 'right',
    render: (row) => count(row.total_pos),
    exportValue: (row) => count(row.total_pos),
  },
  {
    key: 'total_post',
    header: 'Onaylanan PO',
    align: 'right',
    render: (row) => count(row.total_post),
    exportValue: (row) => count(row.total_post),
  },
  {
    key: 'cancelled_pos',
    header: 'İptal Edilen PO',
    align: 'right',
    render: (row) => count(row.cancelled_pos),
    exportValue: (row) => count(row.cancelled_pos),
  },
  {
    key: 'total_spent_eur',
    header: 'Toplam Harcama',
    align: 'right',
    render: (row) => <strong>{euro(row.total_spent_eur)}</strong>,
    exportHeader: 'Toplam Harcama (EUR)',
    exportValue: (row) => exportNumber(row.total_spent_eur),
  },
  {
    key: 'total_tax_eur',
    header: 'Toplam Vergi',
    align: 'right',
    render: (row) => euro(row.total_tax_eur),
    exportHeader: 'Toplam Vergi (EUR)',
    exportValue: (row) => exportNumber(row.total_tax_eur),
  },
  {
    key: 'unpaid_amount_eur',
    header: 'Ödenmemiş Tutar',
    align: 'right',
    render: (row) =>
      exportNumber(row.unpaid_amount_eur) > 0 ? (
        <strong>{euro(row.unpaid_amount_eur)}</strong>
      ) : (
        <Text size="sm" c="dimmed">
          Ödendi
        </Text>
      ),
    exportHeader: 'Ödenmemiş Tutar (EUR)',
    exportValue: (row) => exportNumber(row.unpaid_amount_eur),
  },
  {
    key: 'distinct_items',
    header: 'Farklı Ürün Sayısı',
    align: 'right',
    render: (row) => count(row.distinct_items),
    exportValue: (row) => count(row.distinct_items),
  },
  {
    key: 'avg_delivery_days_weighted',
    header: 'Ort. Teslimat Süresi',
    align: 'right',
    render: (row) =>
      row.avg_delivery_days_weighted ? `${row.avg_delivery_days_weighted} gün` : dash,
    exportHeader: 'Ortalama Teslimat Süresi (Gün)',
    exportValue: (row) => exportNumber(row.avg_delivery_days_weighted),
  },
  {
    key: 'last_purchase_at',
    header: 'Son Satın Alma',
    render: (row) => reportDate(row.last_purchase_at),
    exportValue: (row) => exportDate(row.last_purchase_at),
  },
];

/** Request params as getSuppliersReport builds them. */
export function suppliersReportParams(
  filters: FilterState,
  ordering: string,
): SuppliersReportParams {
  const params: SuppliersReportParams = {};
  if (filters.name) params.name__icontains = filters.name;
  if (filters.code) params.code__icontains = filters.code;
  if (filters.has_dbs) params.has_dbs = filters.has_dbs;
  if (filters.created_gte) params.created_gte = filters.created_gte;
  if (filters.created_lte) params.created_lte = filters.created_lte;
  if (filters.min_total_spent_eur) params.min_total_spent_eur = filters.min_total_spent_eur;
  if (ordering) params.ordering = ordering;
  return params;
}

/** Port of procurement/reports/suppliers (suppliers.js). */
export function SuppliersReportPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({
      name: values.name,
      code: values.code,
      has_dbs: values.has_dbs,
      created_gte: values.created_gte,
      created_lte: values.created_lte,
      min_total_spent_eur: values.min_total_spent_eur,
    }),
    [
      values.name,
      values.code,
      values.has_dbs,
      values.created_gte,
      values.created_lte,
      values.min_total_spent_eur,
    ],
  );
  const sort = fromOrdering(values.ordering || DEFAULT_ORDERING);
  const ordering = toOrdering(sort.sortBy, sort.sortDir) ?? DEFAULT_ORDERING;

  const report = useQuery({
    ...suppliersReportQueryOptions(suppliersReportParams(filters, ordering)),
    placeholderData: keepPreviousData,
  });
  const rows = report.data ?? EMPTY_ROWS;

  useEffect(() => {
    if (report.isError)
      notify.error(report.error, { fallback: 'Tedarikçi raporu yüklenirken hata oluştu' });
  }, [report.isError, report.error, report.errorUpdatedAt]);

  return (
    <>
      <PageHeader
        title="Tedarikçi Raporu"
        subtitle="Tedarikçi performans analizleri ve satın alma metrikleri"
        icon="fas fa-chart-pie"
        backTo="/procurement/reports"
      />

      <DataTable
        title="Tedarikçi Raporu"
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
        columns={suppliersReportColumns}
        getRowId={(row, index) => String(row.id ?? `${row.code ?? ''}-${index}`)}
        loading={report.isFetching}
        sortable
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? DEFAULT_ORDERING }),
        }}
        pagination={{ pageSize: 20 }}
        exportable={{ fileName: `tedarikci_raporu_${today()}` }}
        onRefresh={() => void report.refetch()}
        emptyMessage="Veri bulunamadı"
      />
    </>
  );
}
