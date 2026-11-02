import { Button, Text } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  equipmentItemsQueryOptions,
  equipmentKeys,
  useDeleteEquipmentItem,
  type EquipmentItem,
  type EquipmentItemsParams,
} from '@/api/equipment/equipment';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  PageHeader,
  toOrdering,
  useUrlFilters,
  type DetailField,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { equipmentColumns } from './columns';
import { EquipmentFormModal } from './EquipmentFormModal';

// Filter keys and request params are the same names (legacy collectFilterParams).
// Legacy starts unsorted, so there is no default ordering.
const URL_DEFAULTS = {
  name: '',
  asset_type: '',
  is_active: '',
  page: '1',
  page_size: '20',
  ordering: '',
};

type FilterKeys = 'name' | 'asset_type' | 'is_active';
type FilterState = Record<FilterKeys, string>;

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'name', label: 'Ad', placeholder: 'Ekipman adı', span: 4 },
  { type: 'text', key: 'asset_type', label: 'Tip', placeholder: 'Örn: instrument', span: 4 },
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
    span: 4,
  },
];

const EMPTY_FILTERS: FilterState = { name: '', asset_type: '', is_active: '' };
const EMPTY_ROWS: EquipmentItem[] = [];

function filterParams(values: FilterState): EquipmentItemsParams {
  const params: EquipmentItemsParams = {};
  if (values.name) params.name = values.name;
  if (values.asset_type) params.asset_type = values.asset_type;
  if (values.is_active) params.is_active = values.is_active;
  return params;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Legacy formatAny: scalars as text, anything else as indented JSON. */
function detailField(key: string, value: unknown): DetailField {
  if (value !== null && typeof value === 'object')
    return { label: key, value, type: 'json', span: 6 };
  return {
    label: key,
    value: value === null || value === undefined ? '-' : String(value),
    span: 6,
  };
}

/** Port of planning/inventory/equipment (equipmentList.js). */
export function EquipmentPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<FilterState>(
    () => ({ name: values.name, asset_type: values.asset_type, is_active: values.is_active }),
    [values.name, values.asset_type, values.is_active],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering);
  const ordering = toOrdering(sort.sortBy, sort.sortDir);

  const params: EquipmentItemsParams = { ...filterParams(filters), page, page_size: pageSize };
  if (ordering) params.ordering = ordering;
  const list = useQuery({
    ...equipmentItemsQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  // Legacy empties the table when loading fails.
  const rows = list.isError ? EMPTY_ROWS : (list.data?.results ?? EMPTY_ROWS);
  const total = list.isError ? 0 : (list.data?.count ?? 0);

  useEffect(() => {
    if (list.isError) {
      console.error('Error loading equipment:', list.error);
      notify.error('Ekipmanlar yüklenirken hata oluştu');
    }
  }, [list.isError, list.error, list.errorUpdatedAt]);

  // Legacy counts active items and types on the loaded page; only the total is server-wide.
  const stats = useMemo(() => {
    const active = rows.filter((i) => i.is_active === true).length;
    const types = new Set(rows.map((i) => i.asset_type).filter(Boolean)).size;
    return { active, types, onPage: rows.length };
  }, [rows]);

  // ---- modals ----
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EquipmentItem | null>(null);
  const [viewing, setViewing] = useState<EquipmentItem | null>(null);
  const columns = useMemo(() => equipmentColumns(setViewing), []);

  const detailFields = useMemo<DetailField[]>(() => {
    const entries = Object.entries(viewing ?? {});
    if (entries.length === 0) return [{ label: 'Bilgi', value: 'Detay bulunamadı', span: 12 }];
    return entries.map(([key, value]) => detailField(key, value));
  }, [viewing]);

  // ---- delete ----
  const remove = useDeleteEquipmentItem();
  const deleteItem = async (row: EquipmentItem) => {
    const ok = await confirm({
      title: 'Silme Onayı',
      message: 'Bu ekipmanı silmek istediğinize emin misiniz?',
      details: (
        <Text size="sm">
          <Text span c="dimmed" size="xs" mr="xs">
            Ekipman
          </Text>
          {row.name || String(row.id)}
        </Text>
      ),
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
    } catch (error) {
      // Legacy only logged the failure.
      console.error('Error deleting equipment:', error);
      notify.error(error, { fallback: 'Ekipman silinirken hata oluştu' });
    }
  };

  const rowActions = (row: EquipmentItem): RowAction<EquipmentItem>[] => [
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: () => setEditing(row),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (r) => void deleteItem(r),
    },
  ];

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) {
      void list.refetch();
    } else {
      void queryClient.invalidateQueries({ queryKey: equipmentKeys.all, refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));
  const today = new Date().toISOString().split('T')[0];

  return (
    <>
      <PageHeader
        title="Ekipman Yönetimi"
        subtitle="Ekipman envanteri ve durum yönetimi"
        icon="fas fa-toolbox"
        backTo="/planning/inventory/"
        stats={[
          { id: 'total-equipment', label: 'Toplam Ekipman', value: figure(total) },
          { id: 'active-equipment', label: 'Aktif', value: figure(stats.active) },
          { id: 'equipment-types', label: 'Tip', value: figure(stats.types) },
          { id: 'page-items', label: 'Bu Sayfa', value: figure(stats.onPage) },
        ]}
        actions={
          <>
            <Button
              variant="default"
              leftSection={<FaIcon icon="fas fa-sync-alt" />}
              onClick={refresh}
            >
              Yenile
            </Button>
            <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
              Yeni Ekipman
            </Button>
          </>
        }
      />

      <DataTable
        title="Ekipman Listesi"
        icon="fas fa-toolbox"
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
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
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
        rowActions={rowActions}
        emptyMessage="Ekipman bulunamadı"
        onRefresh={refresh}
        exportable={{ fileName: `equipment-table-container_${today}` }}
      />

      <DetailModal
        opened={viewing !== null}
        onClose={() => setViewing(null)}
        title="Ekipman Detayı"
        subtitle={
          viewing
            ? [viewing.code, viewing.name].filter(Boolean).join(' · ') || undefined
            : undefined
        }
        icon="fas fa-toolbox"
        size="lg"
        sections={[{ title: 'Detay', icon: 'fas fa-list', fields: detailFields }]}
        onEdit={() => {
          const item = viewing;
          setViewing(null);
          if (item) setEditing(item);
        }}
      />

      {creating ? <EquipmentFormModal onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <EquipmentFormModal key={editing.id} item={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
