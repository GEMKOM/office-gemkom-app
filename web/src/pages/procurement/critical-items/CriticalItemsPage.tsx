import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  planningItemKeys,
  planningItemsQueryOptions,
  type PlanningItem,
  type PlanningItemsParams,
} from '@/api/planning/planningItems';
import { formatDate, toDate } from '@/lib/format';
import { raw, textOrDash, ValueBadge } from '@/pages/planning/items/cells';
import { DeliveryState, deliveryStateText } from '@/pages/planning/items/deliveryState';
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

const DEFAULT_ORDERING = '-id';

// Undelivered rows are the whole point of this page, so the list is filtered
// to them by default; show_delivered opens it up to the delivered ones too.
const URL_DEFAULTS = {
  job_no: '',
  item_code: '',
  item_name: '',
  planning_request_number: '',
  show_delivered: false,
  ordering: DEFAULT_ORDERING,
  page: '1',
  page_size: '20',
};

type FilterKeys =
  'job_no' | 'item_code' | 'item_name' | 'planning_request_number' | 'show_delivered';
type FilterState = {
  job_no: string;
  item_code: string;
  item_name: string;
  planning_request_number: string;
  show_delivered: boolean;
};

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'job_no', label: 'İş No', placeholder: 'İş no...', span: 3 },
  { type: 'text', key: 'item_code', label: 'Ürün Kodu', placeholder: 'Ürün kodu...', span: 3 },
  { type: 'text', key: 'item_name', label: 'Ürün Adı', placeholder: 'Ürün adı...', span: 3 },
  {
    type: 'text',
    key: 'planning_request_number',
    label: 'Planlama Talebi',
    placeholder: 'Talep numarası...',
    span: 3,
  },
  { type: 'checkbox', key: 'show_delivered', label: 'Teslim Edilenleri de Göster', span: 3 },
];

const EMPTY_FILTERS: FilterState = {
  job_no: '',
  item_code: '',
  item_name: '',
  planning_request_number: '',
  show_delivered: false,
};
const EMPTY_ROWS: PlanningItem[] = [];

// Module scope so DataTable rows stay memoized. Sortable set = legacy onSort's
// orderable fields that have a column (item_code, item_name, job_no).
const columns: DataTableColumn<PlanningItem>[] = [
  {
    // Display-only: the flag is toggled in Malzeme Takibi or the Satın Alma
    // Detayı modal, never from this monitoring list.
    key: 'is_critical',
    header: 'Kritik',
    render: () => (
      <ValueBadge
        value="Kritik"
        color="red"
        title="İmalat bu kalem teslim edilmeden devam edemez"
      />
    ),
    exportValue: () => 'Kritik',
  },
  {
    key: 'item_code',
    header: 'Ürün Kodu',
    sortable: true,
    render: (row) => textOrDash(row.item_code),
  },
  {
    key: 'item_name',
    header: 'Ürün Adı',
    sortable: true,
    render: (row) => textOrDash(row.item_name),
  },
  {
    key: 'planning_request_number',
    header: 'Planlama Talebi',
    render: (row) => <ValueBadge value={row.planning_request_number} color="blue" />,
  },
  {
    key: 'job_no',
    header: 'İş No',
    sortable: true,
    render: (row) => <ValueBadge value={row.job_no} color="grey" />,
  },
  {
    key: 'quantity_to_purchase',
    header: 'Satın Alınacak',
    render: (row) => raw(row.quantity_to_purchase),
  },
  { key: 'item_unit', header: 'Birim', render: (row) => textOrDash(row.item_unit) },
  {
    key: 'is_delivered',
    header: 'Teslim',
    render: (row) => <DeliveryState row={row} />,
    exportValue: deliveryStateText,
  },
  {
    key: 'purchase_request_number',
    header: 'Satın Alma PR No',
    render: (row) => <ValueBadge value={row.purchase_request_number} color="green" />,
  },
  {
    key: 'critical_marked_by_username',
    header: 'İşaretleyen',
    render: (row) => textOrDash(row.critical_marked_by_username),
  },
  {
    key: 'critical_marked_at',
    header: 'İşaretlenme',
    render: (row) => formatDate(row.critical_marked_at),
    exportValue: (row) => toDate(row.critical_marked_at),
  },
];

// Undelivered rows carry the light-red tint: those are the ones actually
// holding manufacturing right now.
const rowStyle = (row: PlanningItem) =>
  row.is_delivered ? undefined : { backgroundColor: 'var(--mantine-color-red-light)' };

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of procurement/critical-items (criticalItems.js). */
export function CriticalItemsPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<FilterState>(
    () => ({
      job_no: values.job_no,
      item_code: values.item_code,
      item_name: values.item_name,
      planning_request_number: values.planning_request_number,
      show_delivered: values.show_delivered,
    }),
    [values],
  );
  const showDelivered = filters.show_delivered;
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const ordering = values.ordering || DEFAULT_ORDERING;
  const sort = fromOrdering(ordering);

  const params: PlanningItemsParams = {
    is_critical: 'true',
    is_delivered: showDelivered ? undefined : 'false',
    job_no: filters.job_no,
    item_code: filters.item_code,
    item_name: filters.item_name,
    planning_request_number: filters.planning_request_number,
    include_price: false,
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
    if (list.isError)
      notify.error(list.error, { fallback: 'Kritik kalemler yüklenirken hata oluştu' });
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) {
      void list.refetch();
    } else {
      void queryClient.invalidateQueries({ queryKey: planningItemKeys.all, refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  // The scope title the legacy table card showed; the filter row takes the
  // card header here, so it names the figure on the band instead.
  const scopeTitle = showDelivered ? 'Kritik Kalemler' : 'Teslim Edilmemiş Kritik Kalemler';

  return (
    <>
      <PageHeader
        title="Kritik Malzemeler"
        subtitle="İmalatı tutan kalemler — hepsi teslim edilmeden Üretim öngörüsü başlamaz"
        icon="circle-exclamation"
        backTo="/procurement/"
        stats={[
          {
            id: 'critical-items-total',
            label: scopeTitle,
            value: list.isPending ? '–' : total.toLocaleString('tr-TR'),
          },
        ]}
      />

      <DataTable
        title={scopeTitle}
        icon="fas fa-circle-exclamation"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => {
              // Legacy onClear also puts the ordering back to -id.
              apply({ ...EMPTY_FILTERS, ordering: DEFAULT_ORDERING, page: '1' });
              notify.info('Filtreler temizlendi');
            }}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        rowStyle={rowStyle}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? DEFAULT_ORDERING, page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        exportable={{ fileName: `kritik_malzemeler_${new Date().toISOString().slice(0, 10)}` }}
        emptyMessage={
          showDelivered ? 'Kritik işaretli kalem yok.' : 'Teslim edilmemiş kritik kalem yok.'
        }
        onRefresh={refresh}
      />
    </>
  );
}
