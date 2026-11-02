import { hasPerm, isSuperuser } from '@legacy/authService.js';
import { Button } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  paymentTermOptionsQueryOptions,
  supplierApiErrorMessage,
  supplierQueryOptions,
  suppliersQueryOptions,
  useDeleteSupplier,
  type Supplier,
  type SuppliersParams,
} from '@/api/procurement/suppliers';
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
import { supplierColumns } from './columns';
import { SupplierFormModal } from './SupplierFormModal';
import { SupplierPurchaseHistoryModal } from './SupplierPurchaseHistoryModal';
import { SupplierRatingsModal } from './SupplierRatingsModal';
import { SupplierStatusModal } from './SupplierStatusModal';

// Filter keys are the request params legacy loadSuppliers sent.
const URL_DEFAULTS = {
  name: '',
  contact_person: '',
  is_active: '',
  default_currency: '',
  created_at__gte: '',
  supplier_status: '',
  page: '1',
  ordering: '-id',
};

type FilterKeys =
  | 'name'
  | 'contact_person'
  | 'is_active'
  | 'default_currency'
  | 'created_at__gte'
  | 'supplier_status';
type FilterState = Record<FilterKeys, string>;

const EMPTY_FILTERS: FilterState = {
  name: '',
  contact_person: '',
  is_active: '',
  default_currency: '',
  created_at__gte: '',
  supplier_status: '',
};

const filterConfig: FilterConfig<FilterKeys>[] = [
  {
    type: 'text',
    key: 'name',
    label: 'Tedarikçi Adı',
    placeholder: 'Tedarikçi adı girin...',
    span: 4,
  },
  {
    type: 'text',
    key: 'contact_person',
    label: 'İletişim Kişisi',
    placeholder: 'İletişim kişisi girin...',
    span: 4,
  },
  {
    type: 'select',
    key: 'is_active',
    label: 'Durum',
    placeholder: 'Tüm Durumlar',
    options: [
      { value: 'true', label: 'Aktif' },
      { value: 'false', label: 'Pasif' },
    ],
  },
  {
    type: 'select',
    key: 'default_currency',
    label: 'Para Birimi',
    placeholder: 'Tüm Para Birimleri',
    options: [
      { value: 'TRY', label: 'TRY - Türk Lirası' },
      { value: 'USD', label: 'USD - Amerikan Doları' },
      { value: 'EUR', label: 'EUR - Euro' },
      { value: 'GBP', label: 'GBP - İngiliz Sterlini' },
    ],
  },
  { type: 'date', key: 'created_at__gte', label: 'Oluşturulma Tarihi' },
  {
    type: 'select',
    key: 'supplier_status',
    label: 'Tedarikçi Durumu',
    placeholder: 'Tümü',
    options: [
      { value: 'approved', label: 'Onaylı' },
      { value: 'watch', label: 'İzlemede' },
      { value: 'blacklisted', label: 'Kara Liste' },
    ],
  },
];

/** Legacy fixed page size. */
const PAGE_SIZE = 20;
const EMPTY_ROWS: Supplier[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Loads the supplier fresh (legacy editSupplier → getSupplier) and then opens the form. */
function EditSupplier({ id, onClose }: { id: number; onClose: () => void }) {
  const query = useQuery(supplierQueryOptions(id));
  useEffect(() => {
    if (!query.isError) return;
    const message = supplierApiErrorMessage(query.error, 'Tedarikçi yüklenirken hata oluştu');
    notify.error(`Tedarikçi bilgileri yüklenirken hata oluştu: ${message}`);
    onClose();
  }, [query.isError, query.error, onClose]);
  // Wait for this open's fetch so the form never starts from an older cache entry.
  if (!query.data || !query.isFetchedAfterMount) return null;
  return <SupplierFormModal supplier={query.data} onClose={onClose} />;
}

type Drilldown = { kind: 'ratings' | 'purchases' | 'status'; supplier: Supplier };

/** Port of procurement/suppliers/list (suppliers.js). */
export function SuppliersPage() {
  // Legacy suppliers.js computed both gates once at load.
  const [{ canWriteSuppliers, canRateSuppliers }] = useState(() => ({
    // The suppliers-list page permission gates blacklist / status changes.
    canWriteSuppliers: isSuperuser() || hasPerm('access_procurement_suppliers_list'),
    // Mirrors the backend RATING_WRITE_PERM (procurement/permissions.py).
    canRateSuppliers: isSuperuser() || hasPerm('access_procurement_purchase_requests_create'),
  }));

  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({
      name: values.name,
      contact_person: values.contact_person,
      is_active: values.is_active,
      default_currency: values.default_currency,
      created_at__gte: values.created_at__gte,
      supplier_status: values.supplier_status,
    }),
    [
      values.name,
      values.contact_person,
      values.is_active,
      values.default_currency,
      values.created_at__gte,
      values.supplier_status,
    ],
  );
  const page = positiveInt(values.page, 1);
  const sort = fromOrdering(values.ordering || '-id');
  const ordering = toOrdering(sort.sortBy, sort.sortDir);

  // Unset filters are dropped by the request builder, as legacy skipped them.
  const params: SuppliersParams = { ...filters, ordering, page, page_size: PAGE_SIZE };
  const list = useQuery({ ...suppliersQueryOptions(params), placeholderData: keepPreviousData });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (!list.isError) return;
    const message = supplierApiErrorMessage(list.error, 'Tedarikçiler yüklenirken hata oluştu');
    notify.error(`Tedarikçiler yüklenirken hata oluştu: ${message}`);
  }, [list.isError, list.error, list.errorUpdatedAt]);

  // Payment term names for the table; a failure leaves '-' (legacy loadPaymentTerms).
  const terms = useQuery(paymentTermOptionsQueryOptions());
  const columns = useMemo(() => supplierColumns(terms.data ?? []), [terms.data]);

  // Legacy counts the loaded page; only Toplam is the server count.
  const stats = useMemo(
    () => ({
      loaded: rows.length,
      active: rows.filter((s) => s.is_active).length,
      inactive: rows.filter((s) => !s.is_active).length,
    }),
    [rows],
  );

  // ---- modals ----
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const closeDrilldown = () => setDrilldown(null);
  const closeEdit = useCallback(() => setEditingId(null), []);
  // The drill-downs follow the list row, so a refetched rating shows up.
  const drillSupplier = drilldown
    ? (rows.find((s) => s.id === drilldown.supplier.id) ?? drilldown.supplier)
    : undefined;

  // ---- delete ----
  const remove = useDeleteSupplier();
  const deleteSupplier = async (row: Supplier) => {
    const ok = await confirm({
      title: 'Onay',
      icon: 'fas fa-exclamation-triangle',
      message: `"${row.name}" tedarikçisini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
      confirmLabel: 'Evet',
      cancelLabel: 'İptal',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(row.id);
      notify.success('Tedarikçi başarıyla silindi');
    } catch (error) {
      notify.error(
        `Tedarikçi silinirken hata oluştu: ${supplierApiErrorMessage(error, 'Tedarikçi silinirken hata oluştu')}`,
      );
    }
  };

  const rowActions = (): RowAction<Supplier>[] => [
    {
      key: 'purchases',
      label: 'Satın Alma Geçmişi',
      icon: 'fas fa-clipboard-list',
      color: 'info',
      onClick: (r) => setDrilldown({ kind: 'purchases', supplier: r }),
    },
    {
      key: 'ratings',
      label: 'Değerlendirmeler',
      icon: 'fas fa-star',
      color: 'warning',
      onClick: (r) => setDrilldown({ kind: 'ratings', supplier: r }),
    },
    {
      key: 'status',
      label: 'Durum Değiştir',
      icon: 'fas fa-shield-halved',
      color: 'secondary',
      hidden: !canWriteSuppliers,
      onClick: (r) => {
        if (canWriteSuppliers) setDrilldown({ kind: 'status', supplier: r });
      },
    },
    {
      key: 'edit',
      label: 'Düzenle',
      icon: 'fas fa-edit',
      color: 'primary',
      onClick: (r) => setEditingId(r.id),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      onClick: (r) => void deleteSupplier(r),
    },
  ];

  // Figures stay blank until the first page arrives rather than flashing 0.
  const figure = (value: number) => (list.isPending ? '–' : String(value));

  return (
    <>
      <PageHeader
        title="Tedarikçiler"
        subtitle="Tedarikçi yönetimi ve takibi"
        icon="fas fa-building"
        backTo="/procurement/"
        stats={[
          { id: 'all-suppliers-count', label: 'Tüm Tedarikçiler', value: figure(stats.loaded) },
          { id: 'active-suppliers-count', label: 'Aktif', value: figure(stats.active) },
          { id: 'inactive-suppliers-count', label: 'Pasif', value: figure(stats.inactive) },
          { id: 'total-suppliers-count', label: 'Toplam', value: figure(total) },
        ]}
        actions={
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreating(true)}>
            Yeni Tedarikçi
          </Button>
        }
      />

      <DataTable
        title="Tüm Tedarikçiler"
        icon="fas fa-building"
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
        sortable
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? '-id', page: '1' }),
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: (next) => apply({ page: String(next) }),
        }}
        rowActions={rowActions}
        extraData={canWriteSuppliers}
        emptyMessage="Henüz tedarikçi bulunmuyor"
        onRefresh={() => void list.refetch()}
        toolbar={
          <Button
            size="xs"
            variant="default"
            onClick={() => notify.info('Dışa aktarma özelliği yakında eklenecek')}
            leftSection={<FaIcon icon="fas fa-download" />}
          >
            Dışa Aktar
          </Button>
        }
      />

      {creating ? <SupplierFormModal onClose={() => setCreating(false)} /> : null}
      {editingId !== null ? (
        <EditSupplier key={editingId} id={editingId} onClose={closeEdit} />
      ) : null}

      {drilldown?.kind === 'status' ? (
        <SupplierStatusModal supplier={drilldown.supplier} onClose={closeDrilldown} />
      ) : null}
      {drilldown?.kind === 'ratings' ? (
        <SupplierRatingsModal
          supplierId={drilldown.supplier.id}
          supplier={drillSupplier}
          onClose={closeDrilldown}
        />
      ) : null}
      {drilldown?.kind === 'purchases' ? (
        <SupplierPurchaseHistoryModal
          supplierId={drilldown.supplier.id}
          supplier={drillSupplier}
          canRate={canRateSuppliers}
          onClose={closeDrilldown}
        />
      ) : null}
    </>
  );
}
