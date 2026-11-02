import { Button, Menu } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  itDevicesQueryOptions,
  itInventoryKeys,
  useMachineTypes,
  type ItDevice,
  type ItDevicesParams,
} from '@/api/it/inventory';
import {
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
import { inventoryColumns } from './columns';
import { DeviceEditModal } from './DeviceEditModal';
import { DevicePropertiesModal } from './DevicePropertiesModal';
import { exportInventory, type ExportFormat } from './exportInventory';

// Page state lives in the URL. Legacy kept its filters in memory only, so the
// keys are the backend params they mapped to. No ordering until a header is
// clicked (legacy sent none).
const URL_DEFAULTS = {
  name: '',
  code: '',
  machine_type: '',
  is_active: '',
  page: '1',
  page_size: '20',
  ordering: '',
};

type FilterKeys = 'name' | 'code' | 'machine_type' | 'is_active';
type FilterState = Record<FilterKeys, string>;

const EMPTY_FILTERS: FilterState = { name: '', code: '', machine_type: '', is_active: '' };
const EMPTY_ROWS: ItDevice[] = [];

/** Legacy collectFilterValues + `used_in: 'it'`, in fetchMachines' param order. */
function filterParams(values: FilterState): Omit<ItDevicesParams, 'page' | 'page_size' | 'ordering'> {
  return {
    name: values.name || undefined,
    code: values.code || undefined,
    machine_type: values.machine_type || undefined,
    // Always IT devices.
    used_in: 'it',
    is_active: values.is_active || undefined,
  };
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of it/inventory (inventory.js). */
export function InventoryPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<FilterState>(
    () => ({ name: values.name, code: values.code, machine_type: values.machine_type, is_active: values.is_active }),
    [values.name, values.code, values.machine_type, values.is_active],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering);
  const ordering = toOrdering(sort.sortBy, sort.sortDir);

  const types = useMachineTypes();
  const filterConfig = useMemo<FilterConfig<FilterKeys>[]>(
    () => [
      { type: 'text', key: 'name', label: 'Cihaz Adı', placeholder: 'Cihaz adı', span: 3 },
      { type: 'text', key: 'code', label: 'Cihaz Kodu', placeholder: 'Cihaz kodu', span: 3 },
      {
        type: 'select',
        key: 'machine_type',
        label: 'Cihaz Tipi',
        placeholder: 'Tüm Tipler',
        options: types.data ?? [],
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
    ],
    [types.data],
  );

  const params: ItDevicesParams = { page, page_size: pageSize, ...filterParams(filters), ordering };
  const list = useQuery({ ...itDevicesQueryOptions(params), placeholderData: keepPreviousData });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error('Cihazlar yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  // Legacy: the total is server-wide, the rest are counted on the loaded page.
  const stats = useMemo(
    () => ({
      active: rows.filter((d) => d.is_active === true).length,
      laptops: rows.filter((d) => d.machine_type === 'Laptop').length,
      desktops: rows.filter((d) => d.machine_type === 'Desktop' || d.machine_type === 'Bilgisayar').length,
    }),
    [rows],
  );

  // ---- modals ----
  const [viewing, setViewing] = useState<ItDevice | null>(null);
  const [editing, setEditing] = useState<ItDevice | null>(null);
  const columns = useMemo(() => inventoryColumns(setViewing), []);

  const rowActions = (row: ItDevice): RowAction<ItDevice>[] => [
    { key: 'edit', label: 'Düzenle', icon: 'fas fa-edit', color: 'primary', onClick: () => setEditing(row) },
  ];

  // ---- export ----
  const [exporting, setExporting] = useState(false);
  const runExport = async (format: ExportFormat) => {
    setExporting(true);
    try {
      const count = await exportInventory({ ...filterParams(filters), ordering }, format);
      if (count === 0) notify.warning('Dışa aktarılacak cihaz bulunamadı');
    } catch (error) {
      console.error('Export error:', error);
      notify.error('Dışa aktarma sırasında hata oluştu');
    } finally {
      setExporting(false);
    }
  };

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) {
      void list.refetch();
    } else {
      void queryClient.invalidateQueries({ queryKey: itInventoryKeys.all, refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  // Figures stay blank until the first page arrives rather than flashing 0.
  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));

  return (
    <>
      <PageHeader
        title="IT Envanter"
        subtitle="IT cihazlarının envanter takibi ve yönetimi"
        icon="desktop"
        backTo="/it/"
        stats={[
          { id: 'total-devices', label: 'Toplam Cihaz', value: figure(total) },
          { id: 'active-devices', label: 'Aktif Cihaz', value: figure(stats.active) },
          { id: 'laptops', label: 'Laptop', value: figure(stats.laptops) },
          { id: 'desktops', label: 'Masaüstü', value: figure(stats.desktops) },
        ]}
      />

      <DataTable
        title="IT Cihaz Listesi"
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
          onSortChange: (sortBy, sortDir) => apply({ ordering: toOrdering(sortBy, sortDir) ?? '', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        emptyMessage="IT cihazı bulunamadı"
        onRefresh={refresh}
        toolbar={
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button
                size="xs"
                variant="default"
                loading={exporting}
                leftSection={<FaIcon icon="fas fa-download" />}
              >
                Dışa Aktar
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<FaIcon icon="fas fa-file-csv" />} onClick={() => void runExport('csv')}>
                CSV
              </Menu.Item>
              <Menu.Item leftSection={<FaIcon icon="fas fa-file-excel" />} onClick={() => void runExport('excel')}>
                Excel
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        }
      />

      {viewing ? <DevicePropertiesModal device={viewing} onClose={() => setViewing(null)} /> : null}
      {editing ? <DeviceEditModal key={editing.id} device={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
