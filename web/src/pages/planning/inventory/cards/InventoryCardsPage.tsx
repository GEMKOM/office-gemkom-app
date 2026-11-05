import { Button } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_STALE_TIME } from '@/api/queryClient';
import {
  canManageStockCards,
  ITEM_TYPE_CHOICES,
  itemCategoriesQueryOptions,
  itemErrorMessage,
  itemKeys,
  itemsQueryOptions,
  useDeleteItem,
  type Item,
  type ItemRequestsKind,
  type ItemsParams,
} from '@/api/procurement/items';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { itemColumns } from './columns';
import { ItemFormModal } from './ItemFormModal';
import { ItemRequestsModal } from './ItemRequestsModal';
import { ItemStockModal } from './ItemStockModal';

// Legacy kept its filters in memory; here they live in the URL. A lookup
// type left at '' is the legacy default "İçerir" (icontains).
const URL_DEFAULTS = {
  code: '',
  code_lookup: '',
  name: '',
  item_type: '',
  // Inactive cards (legacy plate / boy / service cards, Mikro codes nobody
  // holds stock of) are hidden unless asked for.
  is_active: 'true',
  category: '',
  page: '1',
  ordering: 'code',
};

const PAGE_SIZE = 20;

type FilterKeys = 'code' | 'code_lookup' | 'name' | 'item_type' | 'is_active' | 'category';
type FilterState = Record<FilterKeys, string>;

const baseFilterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'code', label: 'Ürün Kodu', placeholder: 'Ürün kodu ara...', span: 2 },
  {
    type: 'select',
    key: 'code_lookup',
    label: 'Filtre Tipi (Kod)',
    placeholder: 'İçerir (varsayılan)',
    searchable: false,
    options: [
      { value: 'startswith', label: 'İle Başlar' },
      { value: 'exact', label: 'Tam Eşleşme' },
    ],
  },
  // Names are searched by "contains" only: a "starts with" choice added little
  // over it. Codes keep theirs: a Mikro code prefix is a family / size.
  { type: 'text', key: 'name', label: 'Ürün Adı', placeholder: 'Ürün adı ara...', span: 2 },
  {
    type: 'select',
    key: 'item_type',
    label: 'Ürün Tipi',
    placeholder: 'Tümü',
    searchable: false,
    options: ITEM_TYPE_CHOICES.map(({ value, label }) => ({ value, label })),
  },
  {
    type: 'select',
    key: 'is_active',
    label: 'Durum',
    placeholder: 'Tümü',
    searchable: false,
    options: [
      { value: 'true', label: 'Aktif' },
      { value: 'false', label: 'Pasif' },
    ],
  },
];

const EMPTY_FILTERS: FilterState = {
  code: '',
  code_lookup: '',
  name: '',
  item_type: '',
  is_active: '',
  category: '',
};
const EMPTY_ROWS: Item[] = [];

/** Filter params as legacy loadItems built them (the lookup picks the param name). */
function filterParams(values: FilterState): ItemsParams {
  const params: ItemsParams = {};
  if (values.code) {
    if (values.code_lookup === 'exact') params.code__exact = values.code;
    else if (values.code_lookup === 'startswith') params.code__startswith = values.code;
    else params.code = values.code;
  }
  if (values.name) params.name = values.name;
  if (values.item_type) params.item_type = values.item_type;
  if (values.is_active === 'true' || values.is_active === 'false')
    params.is_active = values.is_active;
  if (values.category) params.category = values.category;
  return params;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of planning/inventory/cards (cards.js). */
export function InventoryCardsPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<FilterState>(
    () => ({
      code: values.code,
      code_lookup: values.code_lookup,
      name: values.name,
      item_type: values.item_type,
      is_active: values.is_active,
      category: values.category,
    }),
    [
      values.code,
      values.code_lookup,
      values.name,
      values.item_type,
      values.is_active,
      values.category,
    ],
  );
  const canManage = canManageStockCards();
  const categories = useQuery(itemCategoriesQueryOptions());
  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      ...baseFilterConfig,
      {
        type: 'select',
        key: 'category',
        label: 'Aile',
        placeholder: 'Tümü',
        searchable: true,
        span: 2,
        options: (categories.data ?? []).map((c) => ({
          value: String(c.id),
          label: `${c.code} — ${c.name}`,
        })),
      },
    ],
    [categories.data],
  );
  const page = positiveInt(values.page, 1);
  const sort = fromOrdering(values.ordering || 'code');
  const ordering = toOrdering(sort.sortBy, sort.sortDir);

  const params: ItemsParams = { page, page_size: PAGE_SIZE, ...filterParams(filters), ordering };
  const list = useQuery({
    ...itemsQueryOptions(params),
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (!list.isError) return;
    console.error('Error loading items:', list.error);
    notify.error(
      `Stok kartları yüklenirken hata oluştu: ${itemErrorMessage(list.error, 'Malzemeler yüklenirken hata oluştu')}`,
    );
  }, [list.isError, list.error, list.errorUpdatedAt]);

  // ---- modals ----
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const [stockOf, setStockOf] = useState<Item | null>(null);
  const [requests, setRequests] = useState<{ item: Item; kind: ItemRequestsKind } | null>(null);
  const closeRequests = useCallback(() => setRequests(null), []);

  // ---- delete ----
  const remove = useDeleteItem();
  const deleteItem = async (row: Item) => {
    const itemName = row.name || row.code || 'Bu stok kartı';
    const ok = await confirm({
      title: 'Stok Kartını Sil',
      icon: 'fas fa-trash-alt',
      message: `${itemName} adlı stok kartını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz!`,
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Stok kartı başarıyla silindi');
    } catch (error) {
      console.error('Error deleting item:', error);
      notify.error(
        `Stok kartı silinirken hata oluştu: ${itemErrorMessage(error, 'Malzeme silinirken hata oluştu')}`,
      );
    }
  };

  const rowActions = (row: Item): RowAction<Item>[] => [
    ...(canManage
      ? [
          {
            key: 'edit',
            label: 'Düzenle',
            icon: 'fas fa-edit',
            color: 'primary',
            onClick: () => setEditing(row),
          } satisfies RowAction<Item>,
        ]
      : []),
    {
      key: 'stock',
      label: 'Stok Hareketleri',
      icon: 'fas fa-exchange-alt',
      color: 'secondary',
      onClick: () => setStockOf(row),
    },
    {
      key: 'purchase-requests',
      label: 'Satın Alma Talepleri',
      icon: 'fas fa-shopping-cart',
      color: 'info',
      onClick: () => setRequests({ item: row, kind: 'purchase' }),
    },
    {
      key: 'planning-requests',
      label: 'Planlama Talepleri',
      icon: 'fas fa-calendar-alt',
      color: 'success',
      onClick: () => setRequests({ item: row, kind: 'planning' }),
    },
    ...(canManage
      ? [
          {
            key: 'delete',
            label: 'Sil',
            icon: 'fas fa-trash',
            color: 'danger',
            onClick: (r: Item) => void deleteItem(r),
          } satisfies RowAction<Item>,
        ]
      : []),
  ];

  const refresh = () => {
    // Legacy Yenile reloads page 1 with the current filters and sort.
    if (page === 1) {
      void list.refetch();
    } else {
      void queryClient.invalidateQueries({ queryKey: itemKeys.all, refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  return (
    <>
      <PageHeader
        title="Stok Kartları"
        subtitle="Stok kartları listesi ve yönetimi"
        icon="boxes"
        backTo="/planning/inventory"
        actions={
          canManage ? (
            <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
              Yeni Stok Kartı
            </Button>
          ) : undefined
        }
        stats={[
          {
            id: 'total-items-count',
            label: 'Toplam',
            value: list.isPending ? '–' : total.toLocaleString('tr-TR'),
          },
        ]}
      />

      <DataTable
        title="Stok Kartları"
        icon="fas fa-boxes"
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
        columns={itemColumns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          // Legacy re-sorted the page it was on.
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? 'code' }),
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
        }}
        rowActions={rowActions}
        onRefresh={refresh}
      />

      {editing ? (
        <ItemFormModal key={editing.id} item={editing} onClose={() => setEditing(null)} />
      ) : null}

      {creating ? <ItemFormModal onClose={() => setCreating(false)} /> : null}

      {stockOf ? (
        <ItemStockModal key={stockOf.id} item={stockOf} onClose={() => setStockOf(null)} />
      ) : null}

      {requests ? (
        <ItemRequestsModal
          key={`${requests.kind}-${requests.item.id}`}
          item={requests.item}
          kind={requests.kind}
          onClose={closeRequests}
        />
      ) : null}
    </>
  );
}
