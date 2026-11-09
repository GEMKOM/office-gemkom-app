import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, type CSSProperties } from 'react';
import {
  planningItemsQueryOptions,
  type PlanningItem,
  type PlanningItemsParams,
} from '@/api/planning/planningItems';
import {
  DELIVERY_FILTER_OPTIONS,
  deliveryFilterParams,
} from '@/pages/planning/items/deliveryState';
import {
  DataTable,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
} from '@/ui';
import { isDeliveryLate, procurementItemColumns } from './columns';

// Satın Alma Kalemleri: every planning line with where it stands in
// purchasing. GET /planning/items/?include_procurement=true.

const DEFAULT_ORDERING = '-id';

const URL_DEFAULTS = {
  search: '',
  planning_request_number: '',
  job_no: '',
  request_priority: '',
  has_po: '',
  is_delivered: '',
  ordering: '',
  page: '1',
  page_size: '20',
};

type FilterKeys = Exclude<keyof typeof URL_DEFAULTS, 'page' | 'page_size' | 'ordering'>;
type FilterState = Record<FilterKeys, string>;

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: 'Ürün kodu veya adı...', span: 3 },
  {
    type: 'text',
    key: 'planning_request_number',
    label: 'Talep No',
    placeholder: 'Talep numarası...',
  },
  { type: 'text', key: 'job_no', label: 'İş No', placeholder: 'İş no...' },
  {
    type: 'select',
    key: 'request_priority',
    label: 'Öncelik',
    placeholder: 'Tümü',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'urgent', label: 'Acil' },
      { value: 'critical', label: 'Kritik' },
    ],
  },
  {
    type: 'select',
    key: 'has_po',
    label: 'Sipariş',
    placeholder: 'Tümü',
    options: [
      { value: 'true', label: 'Sipariş verildi' },
      { value: 'false', label: 'Sipariş yok' },
    ],
  },
  {
    type: 'select',
    key: 'is_delivered',
    label: 'Teslim',
    placeholder: 'Tümü',
    options: DELIVERY_FILTER_OPTIONS,
  },
];

const FILTER_KEYS = filterConfig.map((f) => f.key);
const EMPTY_FILTERS = Object.fromEntries(FILTER_KEYS.map((key) => [key, ''])) as FilterState;
const EMPTY_ROWS: PlanningItem[] = [];

export function filterParams(values: FilterState): PlanningItemsParams {
  return {
    search: values.search,
    planning_request_number: values.planning_request_number,
    job_no: values.job_no,
    request_priority: values.request_priority,
    has_po: values.has_po,
    ...deliveryFilterParams(values.is_delivered),
    include_procurement: true,
  };
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const lateRow: CSSProperties = { backgroundColor: 'var(--mantine-color-red-0)' };

export function ProcurementPlanningItemsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo(
    () => Object.fromEntries(FILTER_KEYS.map((key) => [key, values[key]])) as FilterState,
    [values],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const ordering = values.ordering || DEFAULT_ORDERING;
  const sort = fromOrdering(ordering);

  const params: PlanningItemsParams = {
    ...filterParams(filters),
    ordering,
    page,
    page_size: pageSize,
  };
  const list = useQuery({
    ...planningItemsQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Kalemler yüklenirken hata oluştu' });
  }, [list.isError, list.error, list.errorUpdatedAt]);

  return (
    <>
      <PageHeader
        title="Satın Alma Kalemleri"
        subtitle="Planlama kalemleri: talep, sipariş, tedarikçi, beklenen teslim ve teslim durumu"
        icon="list-check"
        backTo="/procurement/"
        stats={[
          {
            id: 'procurement-items-total',
            label: 'Toplam',
            value: list.isPending ? '–' : total.toLocaleString('tr-TR'),
          },
        ]}
      />
      <DataTable
        columnsKey="procurement-planning-items"
        title="Kalemler"
        icon="fas fa-list-check"
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
        columns={procurementItemColumns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        rowStyle={(row) => (isDeliveryLate(row) ? lateRow : undefined)}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? '', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        exportable={{ fileName: `satin_alma_kalemleri_${new Date().toISOString().slice(0, 10)}` }}
        emptyMessage="Kalem bulunamadı."
        onRefresh={() => void list.refetch()}
      />
    </>
  );
}
