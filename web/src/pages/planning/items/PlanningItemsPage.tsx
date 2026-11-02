import { Table } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  planningItemKeys,
  planningItemsQueryOptions,
  useSetPlanningItemConsumed,
  type PlanningItem,
  type PlanningItemsParams,
} from '@/api/planning/planningItems';
import {
  confirm,
  DataTable,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type DataTableFooterContext,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { formatEuro } from './cells';
import { planningItemColumns, sumTotalEur, TOTAL_COLUMN_KEY } from './columns';
import { DELIVERY_FILTER_OPTIONS, deliveryFilterParams } from './deliveryState';

const DEFAULT_ORDERING = '-id';

// Every piece of page state lives in the URL, under the legacy filter ids.
const URL_DEFAULTS = {
  search: '',
  planning_request: '',
  planning_request_number: '',
  item_type: '',
  planning_request_status: '',
  job_no: '',
  item_code: '',
  item_name: '',
  is_delivered: '',
  is_plate: '',
  is_consumed: '',
  from_inventory: '',
  is_available: '',
  has_price: '',
  // The Sıralama dropdown and the column headers share it; '' = -id.
  ordering: '',
  page: '1',
  page_size: '20',
};

type FilterKeys = Exclude<keyof typeof URL_DEFAULTS, 'page' | 'page_size'>;
type FilterState = Record<FilterKeys, string>;

const YES_NO = [
  { value: 'true', label: 'Var' },
  { value: 'false', label: 'Yok' },
];

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: 'Ürün kodu veya adı...', span: 3 },
  {
    type: 'text',
    key: 'planning_request',
    label: 'Planlama Talep ID',
    placeholder: 'örn. 5',
    inputType: 'number',
    span: 2,
  },
  {
    type: 'text',
    key: 'planning_request_number',
    label: 'Talep No',
    placeholder: 'Talep numarası...',
    span: 2,
  },
  {
    type: 'select',
    key: 'item_type',
    label: 'Kalem Tipi',
    placeholder: 'Tümü',
    options: [
      { value: 'stock', label: 'Stok' },
      { value: 'expenditure', label: 'Masraf' },
      { value: 'subcontracting', label: 'Alt Yüklenici' },
    ],
  },
  {
    type: 'select',
    key: 'planning_request_status',
    label: 'Talep Durumu',
    placeholder: 'Tümü',
    options: [
      { value: 'draft', label: 'Taslak' },
      { value: 'ready', label: 'Satın Almaya Hazır' },
      { value: 'converted', label: 'Onaya Gönderildi' },
      { value: 'completed', label: 'Tamamlandı' },
      { value: 'cancelled', label: 'İptal' },
    ],
  },
  { type: 'text', key: 'job_no', label: 'İş No', placeholder: 'İş no...', span: 2 },
  { type: 'text', key: 'item_code', label: 'Ürün Kodu', placeholder: 'Ürün kodu...', span: 2 },
  { type: 'text', key: 'item_name', label: 'Ürün Adı', placeholder: 'Ürün adı...', span: 2 },
  {
    type: 'select',
    key: 'is_delivered',
    label: 'Teslim',
    placeholder: 'Tümü',
    options: DELIVERY_FILTER_OPTIONS,
  },
  {
    type: 'select',
    key: 'is_plate',
    label: 'Plaka Kalemi',
    placeholder: 'Tümü',
    options: [
      { value: 'true', label: 'Sadece Plakalar (0100/0101)' },
      { value: 'false', label: 'Plaka Dışı' },
    ],
  },
  {
    type: 'select',
    key: 'is_consumed',
    label: 'Kullanıldı',
    placeholder: 'Tümü',
    options: [
      { value: 'true', label: 'Kullanıldı' },
      { value: 'false', label: 'Kullanılmadı' },
    ],
  },
  {
    type: 'select',
    key: 'from_inventory',
    label: 'Stoktan Karşılandı',
    placeholder: 'Tümü',
    options: [
      { value: 'true', label: 'Evet (stok ayrıldı)' },
      { value: 'false', label: 'Hayır (stok ayrılmadı)' },
    ],
  },
  {
    type: 'select',
    key: 'is_available',
    label: 'Kalan (Satın Alma)',
    placeholder: 'Tümü',
    options: YES_NO,
  },
  {
    type: 'select',
    key: 'has_price',
    label: 'Fiyat Var mı?',
    placeholder: 'Tümü',
    options: YES_NO,
  },
  {
    type: 'select',
    key: 'ordering',
    label: 'Sıralama',
    placeholder: 'Yeni → Eski',
    options: [
      { value: '-id', label: 'Yeni → Eski' },
      { value: 'id', label: 'Eski → Yeni' },
      { value: 'order', label: 'Sıra (Artan)' },
      { value: 'job_no', label: 'İş No (A→Z)' },
      { value: '-job_no', label: 'İş No (Z→A)' },
      { value: 'item_code', label: 'Ürün Kodu (A→Z)' },
      { value: '-item_code', label: 'Ürün Kodu (Z→A)' },
      { value: 'item_name', label: 'Ürün Adı (A→Z)' },
      { value: '-item_name', label: 'Ürün Adı (Z→A)' },
    ],
  },
];

const FILTER_KEYS = filterConfig.map((f) => f.key);
const EMPTY_FILTERS = Object.fromEntries(FILTER_KEYS.map((key) => [key, ''])) as FilterState;
const EMPTY_ROWS: PlanningItem[] = [];

/** Filter params as legacy loadItems built them (unset ones are dropped by apiFetch). */
function filterParams(values: FilterState): PlanningItemsParams {
  return {
    search: values.search,
    item_code: values.item_code,
    item_name: values.item_name,
    item_type: values.item_type,
    planning_request: values.planning_request,
    planning_request_number: values.planning_request_number,
    planning_request_status: values.planning_request_status,
    job_no: values.job_no,
    ...deliveryFilterParams(values.is_delivered),
    is_plate: values.is_plate,
    is_consumed: values.is_consumed,
    from_inventory: values.from_inventory,
    is_available: values.is_available,
    has_price: values.has_price,
    include_price: true,
  };
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** The legacy footer row: TOPLAM: before the Toplam (€) column, the page sum in it. */
function totalFooter({ rows }: DataTableFooterContext<PlanningItem>) {
  const totalIndex = planningItemColumns.findIndex((c) => c.key === TOTAL_COLUMN_KEY);
  return (
    <Table.Tr>
      {planningItemColumns.map((column, index) => (
        <Table.Td
          key={column.key}
          fw={index === totalIndex || index === totalIndex - 1 ? 700 : undefined}
          ta={index === totalIndex - 1 ? 'right' : undefined}
        >
          {index === totalIndex
            ? formatEuro(sumTotalEur(rows))
            : index === totalIndex - 1
              ? 'TOPLAM:'
              : null}
        </Table.Td>
      ))}
      {/* the actions column */}
      <Table.Td />
    </Table.Tr>
  );
}

/** Port of planning/items (items.js). */
export function PlanningItemsPage() {
  const queryClient = useQueryClient();
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

  // ---- consumed toggle ----
  const setConsumed = useSetPlanningItemConsumed();
  const toggleConsumed = async (row: PlanningItem) => {
    const isConsumed = row.is_consumed === true;
    const ok = await confirm({
      title: 'Kullanıldı İşareti',
      icon: 'fas fa-box',
      message: isConsumed
        ? `${row.item_code || ''} kaleminin "kullanıldı" işareti kaldırılacak.`
        : `${row.item_code || ''} kalemi "kullanıldı" olarak işaretlenecek.`,
      description: isConsumed
        ? 'Kalem yeniden CNC kesimleri için seçilebilir hale gelir.'
        : 'Kullanıldı işaretlenen kalemler yeni CNC kesimleri için seçilemez. Kesim oluşturmadan da işaretlenebilir (eski talepler için).',
      confirmLabel: 'Evet',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      await setConsumed.mutateAsync({ id: row.id, consumed: !isConsumed });
      notify.success(
        isConsumed ? 'Kullanıldı işareti kaldırıldı' : 'Kalem kullanıldı olarak işaretlendi',
      );
    } catch (error) {
      console.error('Error toggling consumed flag:', error);
      notify.error(error, { fallback: 'İşlem sırasında hata oluştu' });
    }
  };

  const rowActions = (): RowAction<PlanningItem>[] => [
    {
      key: 'toggle-consumed',
      label: 'Kullanıldı',
      icon: 'fas fa-box',
      color: 'secondary',
      onClick: (row) => void toggleConsumed(row),
    },
  ];

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) {
      void list.refetch();
    } else {
      void queryClient.invalidateQueries({ queryKey: planningItemKeys.all, refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  return (
    <>
      <PageHeader
        title="Planlama Kalemleri"
        subtitle="Planlama taleplerindeki ürün/kalem listesini filtreleyin ve takip edin"
        icon="list"
        backTo="/planning/"
        stats={[
          {
            id: 'planning-items-total',
            label: 'Toplam',
            value: list.isPending ? '–' : total.toLocaleString('tr-TR'),
          },
        ]}
      />

      <DataTable
        title="Kalemler"
        icon="fas fa-list"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => {
              // Legacy onClear also puts the ordering back to -id.
              apply({ ...EMPTY_FILTERS, page: '1' });
              notify.info('Filtreler temizlendi');
            }}
          />
        }
        data={rows}
        columns={planningItemColumns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          // Header clicks write the same ordering the Sıralama dropdown shows.
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
        rowActions={rowActions}
        footer={totalFooter}
        exportable={{ fileName: `planlama_kalemleri_${new Date().toISOString().slice(0, 10)}` }}
        emptyMessage="Kalem bulunamadı."
        onRefresh={refresh}
      />
    </>
  );
}
