import { Button, Text } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_STALE_TIME } from '@/api/queryClient';
import { materialTrackingErrorMessage } from '@/api/materialTracking/errors';
import {
  planningItemKeys,
  planningItemsQueryOptions,
  useSetPlanningItemCritical,
  type PlanningItem,
  type PlanningItemsParams,
} from '@/api/planning/planningItems';
import { useAuth } from '@/auth/AuthProvider';
import { AppLink } from '@/shell/AppLink';
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
} from '@/ui';
import { canPull, materialTrackingColumns } from './columns';
import { CreatePullRequestModal } from './CreatePullRequestModal';
import { DELIVERY_FILTER_OPTIONS, deliveryFilterParams } from './deliveryState';
import { PullRequestDetailModal } from './pullRequestShared';

const DEFAULT_ORDERING = '-id';

// Legacy kept its filters in memory only; the URL keys are the legacy filter ids.
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
  is_critical: '',
  pull_state: '',
  from_inventory: '',
  is_available: '',
  ordering: DEFAULT_ORDERING,
  page: '1',
  page_size: '20',
};

type FilterKeys = Exclude<keyof typeof URL_DEFAULTS, 'page' | 'page_size'>;
type FilterState = Record<FilterKeys, string>;

const ORDERING_OPTIONS = [
  { value: 'id', label: 'Eski → Yeni' },
  { value: 'order', label: 'Sıra (Artan)' },
  { value: 'job_no', label: 'İş No (A→Z)' },
  { value: '-job_no', label: 'İş No (Z→A)' },
  { value: 'item_code', label: 'Ürün Kodu (A→Z)' },
  { value: '-item_code', label: 'Ürün Kodu (Z→A)' },
  { value: 'item_name', label: 'Ürün Adı (A→Z)' },
  { value: '-item_name', label: 'Ürün Adı (Z→A)' },
];

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: 'Ürün kodu veya adı...' },
  {
    type: 'text',
    key: 'planning_request',
    label: 'Planlama Talep ID',
    placeholder: 'örn. 5',
    inputType: 'number',
  },
  {
    type: 'text',
    key: 'planning_request_number',
    label: 'Talep No',
    placeholder: 'Talep numarası...',
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
  {
    type: 'text',
    key: 'job_no',
    label: 'İş No',
    placeholder: 'İş no...',
    suggestions: 'jobOrders',
  },
  { type: 'text', key: 'item_code', label: 'Ürün Kodu', placeholder: 'Ürün kodu...' },
  { type: 'text', key: 'item_name', label: 'Ürün Adı', placeholder: 'Ürün adı...' },
  {
    type: 'select',
    key: 'is_delivered',
    label: 'Teslim',
    placeholder: 'Tümü',
    options: DELIVERY_FILTER_OPTIONS,
  },
  {
    type: 'select',
    key: 'is_critical',
    label: 'Kritik',
    placeholder: 'Tümü',
    options: [
      { value: 'true', label: 'Kritik' },
      { value: 'false', label: 'Kritik Değil' },
    ],
  },
  {
    type: 'select',
    key: 'pull_state',
    label: 'Depo Çekme',
    placeholder: 'Tümü',
    options: [
      { value: 'available', label: 'Depoda kalan var' },
      { value: 'none', label: 'Hiç çekilmedi' },
      { value: 'partial', label: 'Kısmen çekildi' },
      { value: 'full', label: 'Tamamı çekildi' },
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
    options: [
      { value: 'true', label: 'Var' },
      { value: 'false', label: 'Yok' },
    ],
  },
  // The default (Yeni → Eski) is the pill's clear option.
  {
    type: 'select',
    key: 'ordering',
    label: 'Sıralama',
    placeholder: 'Yeni → Eski',
    options: ORDERING_OPTIONS,
  },
];

const EMPTY_FILTERS = Object.fromEntries(filterConfig.map((f) => [f.key, ''])) as FilterState;
const EMPTY_ROWS: PlanningItem[] = [];

/** The list params as legacy loadItems built them (unset ones are left out). */
function listParams(values: FilterState): PlanningItemsParams {
  return {
    search: values.search || undefined,
    item_code: values.item_code || undefined,
    item_name: values.item_name || undefined,
    item_type: values.item_type || undefined,
    planning_request: values.planning_request || undefined,
    planning_request_number: values.planning_request_number || undefined,
    planning_request_status: values.planning_request_status || undefined,
    job_no: values.job_no || undefined,
    ...deliveryFilterParams(values.is_delivered),
    is_critical: values.is_critical || undefined,
    from_inventory: values.from_inventory || undefined,
    is_available: values.is_available || undefined,
    pull_state: values.pull_state || undefined,
    include_price: false,
  };
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function exportFileName() {
  return `malzeme_takip_${new Date().toISOString().slice(0, 10)}`;
}

/** Port of manufacturing/material-tracking (materialTracking.js). */
export function MaterialTrackingPage() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<FilterState>(() => {
    const picked = Object.fromEntries(
      filterConfig.map((f) => [f.key, values[f.key]]),
    ) as FilterState;
    // The default ordering shows as an unset pill.
    if (picked.ordering === DEFAULT_ORDERING) picked.ordering = '';
    return picked;
  }, [values]);
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const ordering = values.ordering || DEFAULT_ORDERING;
  const sort = fromOrdering(ordering);

  const params: PlanningItemsParams = {
    ...listParams(filters),
    ordering,
    page,
    page_size: pageSize,
  };
  const list = useQuery({
    ...planningItemsQueryOptions(params),
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Kalemler yüklenirken hata oluştu' });
  }, [list.isError, list.error, list.errorUpdatedAt]);

  // ---- selection: only lines with something left in the warehouse ----
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Rows that left the page drop out of the selection (legacy updateData).
  const selectedRows = useMemo(() => {
    const picked = new Set(selectedIds);
    return rows.filter((row) => picked.has(String(row.id)) && canPull(row));
  }, [rows, selectedIds]);
  const visibleSelectedIds = useMemo(
    () => selectedRows.map((row) => String(row.id)),
    [selectedRows],
  );
  const clearSelection = () => setSelectedIds([]);

  // ---- critical toggle ----
  const { mutateAsync: saveCritical } = useSetPlanningItemCritical();
  const [pendingCritical, setPendingCritical] = useState<ReadonlySet<number>>(() => new Set());
  const toggleCritical = useCallback(
    async (row: PlanningItem, critical: boolean) => {
      setPendingCritical((prev) => new Set(prev).add(row.id));
      try {
        await saveCritical({ id: row.id, critical });
        notify.success(
          critical
            ? 'Kalem kritik olarak işaretlendi — imalat öngörüsü bu teslimatı bekleyecek'
            : 'Kritik işareti kaldırıldı',
        );
      } catch (error) {
        notify.error(
          materialTrackingErrorMessage(
            error,
            critical
              ? 'Kalem kritik olarak işaretlenirken hata oluştu'
              : 'Kritik işareti kaldırılırken hata oluştu',
            'Kritik işareti güncellenemedi',
          ),
        );
      } finally {
        setPendingCritical((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }
    },
    [saveCritical],
  );

  // ---- modals ----
  const [detailId, setDetailId] = useState<number | null>(null);
  const closeDetail = useCallback(() => setDetailId(null), []);
  const [creating, setCreating] = useState(false);
  const openCreate = () => {
    if (selectedRows.length === 0) {
      notify.warning('Lütfen en az bir kalem seçin');
      return;
    }
    setCreating(true);
  };
  const closeCreate = useCallback(() => setCreating(false), []);

  const columns = useMemo(
    () =>
      materialTrackingColumns({
        onOpenPullRequest: setDetailId,
        onToggleCritical: (row, critical) => void toggleCritical(row, critical),
        pendingCritical,
      }),
    [toggleCritical, pendingCritical],
  );

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) {
      void list.refetch();
    } else {
      void queryClient.invalidateQueries({ queryKey: planningItemKeys.all, refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  const selectionBar =
    selectedRows.length > 0 ? (
      <>
        <Text size="sm" c="dimmed">
          {selectedRows.length} kalem seçildi
        </Text>
        <Button size="xs" leftSection={<FaIcon icon="fas fa-dolly" />} onClick={openCreate}>
          Depodan Çekme Talebi Oluştur
        </Button>
        <Button size="xs" variant="default" onClick={clearSelection}>
          Seçimi Temizle
        </Button>
      </>
    ) : null;

  return (
    <>
      <PageHeader
        title="Planlama Kalemleri"
        subtitle="Planlama taleplerindeki ürün/kalem listesini filtreleyin ve takip edin"
        icon="list"
        backTo="/planning/"
        actions={
          <Button
            component={AppLink}
            to="/manufacturing/material-tracking/pull-requests/"
            variant="default"
            leftSection={<FaIcon icon="fas fa-dolly" />}
          >
            Depo Çekme Talepleri
          </Button>
        }
      />

      <DataTable
        title="Kalemler"
        icon="fas fa-list"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) =>
              apply({ ...next, ordering: next.ordering || DEFAULT_ORDERING, page: '1' })
            }
            onClear={() => apply({ ...EMPTY_FILTERS, ordering: DEFAULT_ORDERING, page: '1' })}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        selection={{
          selectedIds: visibleSelectedIds,
          onChange: setSelectedIds,
          isRowSelectable: canPull,
        }}
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
          onPageChange: (next) => {
            // Legacy clears the selection on a page change.
            clearSelection();
            apply({ page: String(next) });
          },
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        emptyMessage="Kalem bulunamadı."
        onRefresh={refresh}
        toolbar={selectionBar}
        // Legacy exports the loaded page.
        exportable={{ fileName: exportFileName() }}
      />

      {creating ? (
        <CreatePullRequestModal
          items={selectedRows}
          onClose={closeCreate}
          onCreated={clearSelection}
        />
      ) : null}

      <PullRequestDetailModal
        requestId={detailId}
        onClose={closeDetail}
        user={user}
        isAdmin={isAdmin}
      />
    </>
  );
}
