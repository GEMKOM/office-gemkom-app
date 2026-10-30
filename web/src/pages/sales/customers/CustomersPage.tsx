import { Button } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  CUSTOMER_CURRENCY_OPTIONS,
  DEFAULT_STALE_TIME,
  customersQueryOptions,
  qk,
  useCustomer,
  useDeleteCustomer,
  type Customer,
  type CustomersParams,
} from '@/api';
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
import { customerColumns } from './columns';
import { CustomerFormModal } from './CustomerFormModal';
import { exportCustomers } from './exportCustomers';

// Every piece of page state lives in the URL. customer_id is the legacy
// deep link that opens the edit modal (customerEditModal.js).
const URL_DEFAULTS = {
  search: '',
  is_active: '',
  default_currency: '',
  show_inactive: false,
  page: '1',
  page_size: '20',
  ordering: 'code',
  customer_id: '',
};

type FilterKeys = 'search' | 'is_active' | 'default_currency' | 'show_inactive';
type FilterState = { search: string; is_active: string; default_currency: string; show_inactive: boolean };

const filterConfig: FilterConfig<FilterKeys>[] = [
  {
    type: 'text',
    key: 'search',
    label: 'Arama',
    placeholder: 'Kod, isim, kısa ad, iletişim kişisi, e-posta',
    span: 3,
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
  {
    type: 'select',
    key: 'default_currency',
    label: 'Para Birimi',
    placeholder: 'Tümü',
    searchable: false,
    options: CUSTOMER_CURRENCY_OPTIONS.map(({ value, label }) => ({ value, label })),
  },
  { type: 'checkbox', key: 'show_inactive', label: 'Pasifleri Göster' },
];

const EMPTY_FILTERS: FilterState = { search: '', is_active: '', default_currency: '', show_inactive: false };
const EMPTY_ROWS: Customer[] = [];

/** Filter params as legacy loadCustomers built them (unset ones are left out). */
function filterParams(values: FilterState): CustomersParams {
  const params: CustomersParams = {};
  if (values.search) params.search = values.search;
  if (values.is_active) params.is_active = values.is_active === 'true';
  if (values.default_currency) params.default_currency = values.default_currency;
  if (values.show_inactive) params.show_inactive = true;
  return params;
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of sales/customers (customerList.js + customerEditModal.js). */
export function CustomersPage() {
  const queryClient = useQueryClient();
  const url = useUrlFilters(URL_DEFAULTS);
  const { values, apply } = url;

  const filters = useMemo<FilterState>(
    () => ({
      search: values.search,
      is_active: values.is_active,
      default_currency: values.default_currency,
      show_inactive: values.show_inactive,
    }),
    [values.search, values.is_active, values.default_currency, values.show_inactive],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || 'code');
  const ordering = toOrdering(sort.sortBy, sort.sortDir);

  const params: CustomersParams = { ...filterParams(filters), ordering, page, page_size: pageSize };
  const list = useQuery({
    ...customersQueryOptions(params),
    // A management page should not sit on the 5-minute reference cache.
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error('Müşteriler yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  // Legacy counts active/inactive/currencies on the loaded page; only the total is server-wide.
  const stats = useMemo(() => {
    const active = rows.filter((c) => c.is_active === true).length;
    const inactive = rows.filter((c) => c.is_active === false).length;
    const currencies = new Set(rows.map((c) => c.default_currency).filter(Boolean)).size;
    return { active, inactive, currencies };
  }, [rows]);

  // ---- create / edit ----
  const [creating, setCreating] = useState(false);
  const editingId = values.customer_id;
  const editing = useCustomer(editingId || null);
  const closeEdit = () => apply({ customer_id: '' });

  useEffect(() => {
    if (!editingId || !editing.isError) return;
    notify.error('Müşteri bilgileri yüklenirken hata oluştu');
    apply({ customer_id: '' });
  }, [editingId, editing.isError, apply]);

  // ---- delete ----
  const remove = useDeleteCustomer();
  const deleteCustomer = async (row: Customer) => {
    const ok = await confirm({
      title: 'Müşteri Silme Onayı',
      message: 'Bu müşteriyi silmek istediğinize emin misiniz?',
      details: row.name || row.code,
      description: 'Bu işlem geri alınamaz ve müşteri kalıcı olarak silinecektir.',
      confirmLabel: 'Evet, Sil',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Müşteri silindi');
    } catch (error) {
      notify.error(error, { fallback: 'Müşteri silinirken hata oluştu' });
    }
  };

  const rowActions = (row: Customer): RowAction<Customer>[] => [
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: () => apply({ customer_id: String(row.id) }),
    },
    { key: 'delete', label: 'Sil', icon: 'fas fa-trash', color: 'danger', onClick: (r) => void deleteCustomer(r) },
  ];

  // ---- export ----
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      // Legacy export: every page, current filters and sort, inactive ones included.
      const count = await exportCustomers({ ...filterParams(filters), ordering, show_inactive: true });
      if (count === 0) notify.warning('Dışa aktarılacak müşteri bulunamadı');
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
      void queryClient.invalidateQueries({ queryKey: qk.customers.all, refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  // Figures stay blank until the first page arrives rather than flashing 0.
  const figure = (value: number) => (list.isPending ? '–' : value.toLocaleString('tr-TR'));

  return (
    <>
      <PageHeader
        title="Müşteri Yönetimi"
        subtitle="Müşteri listesi ve yönetimi"
        backTo="/sales/"
        stats={[
          { id: 'total-customers-count', label: 'Toplam', value: figure(total) },
          { id: 'active-customers-count', label: 'Aktif', value: figure(stats.active) },
          { id: 'inactive-customers-count', label: 'Pasif', value: figure(stats.inactive) },
          { id: 'currencies-count', label: 'Para Birimi', value: figure(stats.currencies) },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Müşteri
          </Button>
        }
      />

      <DataTable
        title="Müşteri Listesi"
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
        columns={customerColumns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? 'code', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        emptyMessage="Müşteri bulunamadı"
        onRefresh={refresh}
        toolbar={
          <Button
            size="xs"
            variant="default"
            onClick={() => void runExport()}
            loading={exporting}
            leftSection={<FaIcon icon="fas fa-download" />}
          >
            Dışa Aktar
          </Button>
        }
      />

      {creating ? (
        <CustomerFormModal
          onClose={() => setCreating(false)}
          // Legacy goes back to page 1 after a create.
          onSaved={() => apply({ page: '1' })}
        />
      ) : null}

      {editingId && editing.data ? (
        <CustomerFormModal key={editingId} customer={editing.data} onClose={closeEdit} />
      ) : null}
    </>
  );
}
