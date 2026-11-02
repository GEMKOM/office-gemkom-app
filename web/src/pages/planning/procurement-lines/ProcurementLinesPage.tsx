import { Button, Stack } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  jobOrdersHasProcurementQueryOptions,
  procurementLineKeys,
  procurementPendingQueryOptions,
  useSetCostNotApplicable,
  type ProcurementJobOrder,
  type ProcurementJobOrdersParams,
} from '@/api/planning/procurementLines';
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
import {
  COST_NA_FILTER_OPTIONS,
  hasEntriesColumns,
  pendingColumns,
  STATUS_FILTER_OPTIONS,
} from './columns';
import { ProcurementLinesModal } from './ProcurementLinesModal';

// Both tables keep their state in the URL; the second one's keys carry has_.
const URL_DEFAULTS = {
  search: '',
  status: '',
  page: '1',
  page_size: '20',
  ordering: 'job_no',
  has_search: '',
  has_status: '',
  has_cost_not_applicable: '',
  has_page: '1',
  has_page_size: '20',
  has_ordering: 'job_no',
};

type PendingFilters = { search: string; status: string };
type HasFilters = { has_search: string; has_status: string; has_cost_not_applicable: string };

const SEARCH_PLACEHOLDER = 'İş emri no, başlık, müşteri...';

const pendingFilterConfig: FilterConfig<keyof PendingFilters>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: SEARCH_PLACEHOLDER, span: 3 },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    placeholder: 'Tümü',
    searchable: false,
    options: STATUS_FILTER_OPTIONS,
  },
];

const hasFilterConfig: FilterConfig<keyof HasFilters>[] = [
  { type: 'text', key: 'has_search', label: 'Arama', placeholder: SEARCH_PLACEHOLDER, span: 3 },
  {
    type: 'select',
    key: 'has_status',
    label: 'Durum',
    placeholder: 'Tümü',
    searchable: false,
    options: STATUS_FILTER_OPTIONS,
  },
  {
    type: 'select',
    key: 'has_cost_not_applicable',
    label: 'Maliyet Durumu',
    placeholder: 'Tümü',
    searchable: false,
    options: COST_NA_FILTER_OPTIONS,
  },
];

const EMPTY_HAS_FILTERS: HasFilters = {
  has_search: '',
  has_status: '',
  has_cost_not_applicable: '',
};
const EMPTY_ROWS: ProcurementJobOrder[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of planning/procurement-lines (procurement-lines.js). */
export function ProcurementLinesPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  // ---- pending (no procurement line yet), loaded at once ----
  const pendingFilters = useMemo<PendingFilters>(
    () => ({ search: values.search, status: values.status }),
    [values.search, values.status],
  );
  const pendingSort = fromOrdering(values.ordering || 'job_no');
  const pendingParams: ProcurementJobOrdersParams = {
    ...pendingFilters,
    ordering: toOrdering(pendingSort.sortBy, pendingSort.sortDir) ?? 'job_no',
    page: positiveInt(values.page, 1),
    page_size: positiveInt(values.page_size, 20),
  };
  const pending = useQuery({
    ...procurementPendingQueryOptions(pendingParams),
    placeholderData: keepPreviousData,
  });

  // ---- has entries: legacy loads it only on Filtrele / Yenile / after a change ----
  const hasFilters = useMemo<HasFilters>(
    () => ({
      has_search: values.has_search,
      has_status: values.has_status,
      has_cost_not_applicable: values.has_cost_not_applicable,
    }),
    [values.has_search, values.has_status, values.has_cost_not_applicable],
  );
  const hasStateInUrl =
    Boolean(values.has_search || values.has_status || values.has_cost_not_applicable) ||
    values.has_page !== '1' ||
    values.has_page_size !== '20' ||
    values.has_ordering !== 'job_no';
  const [hasRequested, setHasRequested] = useState(false);
  const hasEnabled = hasRequested || hasStateInUrl;
  const hasSort = fromOrdering(values.has_ordering || 'job_no');
  const hasParams: ProcurementJobOrdersParams = {
    search: hasFilters.has_search,
    status: hasFilters.has_status,
    cost_not_applicable: hasFilters.has_cost_not_applicable,
    ordering: toOrdering(hasSort.sortBy, hasSort.sortDir) ?? 'job_no',
    page: positiveInt(values.has_page, 1),
    page_size: positiveInt(values.has_page_size, 20),
  };
  const hasEntries = useQuery({
    ...jobOrdersHasProcurementQueryOptions(hasParams),
    enabled: hasEnabled,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (pending.isError) notify.error(pending.error, { fallback: 'Liste yüklenemedi' });
  }, [pending.isError, pending.errorUpdatedAt, pending.error]);
  useEffect(() => {
    if (hasEntries.isError)
      notify.error(hasEntries.error, { fallback: 'Satır girilmiş liste yüklenemedi' });
  }, [hasEntries.isError, hasEntries.errorUpdatedAt, hasEntries.error]);

  const pendingRows = pending.isError ? EMPTY_ROWS : (pending.data?.results ?? EMPTY_ROWS);
  const pendingTotal = pending.isError ? 0 : (pending.data?.count ?? 0);
  const hasRows =
    hasEntries.isError || !hasEnabled ? EMPTY_ROWS : (hasEntries.data?.results ?? EMPTY_ROWS);
  const hasTotal = hasEntries.isError || !hasEnabled ? 0 : (hasEntries.data?.count ?? 0);

  // ---- refresh: back to page 1 and reload ----
  const refreshPending = () => {
    if (values.page === '1') void pending.refetch();
    else apply({ page: '1' });
  };
  const refreshHasEntries = () => {
    setHasRequested(true);
    if (values.has_page !== '1') apply({ has_page: '1' });
    else if (hasEnabled) void hasEntries.refetch();
  };
  const refreshAll = () => {
    setHasRequested(true);
    if (values.page === '1' && values.has_page === '1') {
      void queryClient.invalidateQueries({ queryKey: procurementLineKeys.all });
    } else {
      void queryClient.invalidateQueries({
        queryKey: procurementLineKeys.all,
        refetchType: 'none',
      });
      apply({ page: '1', has_page: '1' });
    }
  };

  // ---- cost not applicable ----
  const setCostNa = useSetCostNotApplicable();
  const markCostNotApplicable = async (row: ProcurementJobOrder) => {
    const ok = await confirm({
      title: 'Maliyet Uygulanamaz',
      message: `${row.job_no} için maliyet uygulanamaz olarak işaretlensin mi?`,
      description:
        'Bu işlem sonrası iş emri tüm departman bekleyen listelerinden ve maliyet tablosundan kaldırılır.',
      confirmLabel: 'Evet, işaretle',
      cancelLabel: 'İptal',
      icon: 'fas fa-ban',
      danger: true,
    });
    if (!ok) return;
    try {
      await setCostNa.mutateAsync({ jobNo: row.job_no, value: true });
      notify.success('İş emri maliyet uygulanamaz olarak işaretlendi.');
      // Legacy reloads both lists afterwards.
      setHasRequested(true);
    } catch (error) {
      console.error(error);
      notify.error(error, { fallback: 'İşlem başarısız' });
    }
  };
  const unmarkCostNotApplicable = async (row: ProcurementJobOrder) => {
    const ok = await confirm({
      title: 'Maliyeti Uygula',
      message: `${row.job_no} için "maliyet uygulanamaz" işareti kaldırılsın mı?`,
      description: 'İş emri yeniden maliyet tablosunda ve departman bekleyen listelerinde görünür.',
      confirmLabel: 'Evet, kaldır',
      cancelLabel: 'İptal',
      icon: 'fas fa-rotate-left',
    });
    if (!ok) return;
    try {
      await setCostNa.mutateAsync({ jobNo: row.job_no, value: false });
      notify.success('İş emri yeniden maliyet takibine alındı.');
      setHasRequested(true);
    } catch (error) {
      console.error(error);
      notify.error(error, { fallback: 'İşlem başarısız' });
    }
  };

  // ---- lines modal ----
  const [openLines, setOpenLines] = useState<{ jobNo: string; preview: boolean } | null>(null);
  const openAction: RowAction<ProcurementJobOrder> = {
    key: 'open-lines',
    label: 'Satırları Aç',
    icon: 'fas fa-list',
    color: 'primary',
    onClick: (row) => setOpenLines({ jobNo: row.job_no, preview: false }),
  };
  const markAction: RowAction<ProcurementJobOrder> = {
    key: 'mark-cost-na',
    label: 'Maliyet Uygulanamaz',
    icon: 'fas fa-ban',
    color: 'danger',
    onClick: (row) => void markCostNotApplicable(row),
  };
  const pendingActions = (): RowAction<ProcurementJobOrder>[] => [openAction, markAction];
  const hasActions = (row: ProcurementJobOrder): RowAction<ProcurementJobOrder>[] => [
    openAction,
    {
      key: 'preview-lines',
      label: 'Önizle',
      icon: 'fas fa-eye',
      color: 'secondary',
      onClick: (r) => setOpenLines({ jobNo: r.job_no, preview: true }),
    },
    { ...markAction, hidden: Boolean(row.cost_not_applicable) },
    {
      key: 'unmark-cost-na',
      label: 'Maliyeti Uygula',
      icon: 'fas fa-rotate-left',
      color: 'success',
      hidden: !row.cost_not_applicable,
      onClick: (r) => void unmarkCostNotApplicable(r),
    },
  ];

  const figure = (value: number, pendingState: boolean) =>
    pendingState ? '–' : value.toLocaleString('tr-TR');

  return (
    <>
      <PageHeader
        title="Malzeme Maliyeti Satırları"
        subtitle="Satın alma bekleyen ve satır girilmiş iş emirleri"
        backTo="/planning/"
        stats={[
          {
            id: 'pending-count',
            label: 'Bekleyen',
            value: figure(pendingTotal, pending.isPending),
          },
          {
            id: 'has-entries-count',
            label: 'Satır Girilmiş',
            value: figure(hasTotal, !hasEnabled || hasEntries.isPending),
          },
        ]}
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            onClick={refreshAll}
          >
            Yenile
          </Button>
        }
      />

      <Stack gap="md">
        <DataTable
          title="Satın Alma Bekleyen İş Emirleri"
          icon="fas fa-shopping-cart"
          filters={
            <FilterBar
              inline
              filters={pendingFilterConfig}
              values={pendingFilters}
              onApply={(next) => apply({ ...next, page: '1' })}
              onClear={() => apply({ search: '', status: '', page: '1' })}
            />
          }
          data={pendingRows}
          columns={pendingColumns}
          getRowId={(row, index) => `${row.job_no}-${index}`}
          loading={pending.isFetching}
          sort={{
            sortBy: pendingSort.sortBy,
            sortDir: pendingSort.sortDir,
            onSortChange: (sortBy, sortDir) =>
              apply({ ordering: toOrdering(sortBy, sortDir) ?? 'job_no', page: '1' }),
          }}
          pagination={{
            page: pendingParams.page ?? 1,
            pageSize: pendingParams.page_size ?? 20,
            total: pendingTotal,
            onPageChange: (next) => apply({ page: String(next) }),
            onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
          }}
          rowActions={pendingActions}
          emptyMessage="Listeyi yüklemek veya güncellemek için Filtrele veya Yenile butonuna tıklayın."
          onRefresh={refreshPending}
        />

        <DataTable
          title="Malzeme Maliyeti Girilmiş İş Emirleri"
          icon="fas fa-check-double"
          filters={
            <FilterBar
              inline
              filters={hasFilterConfig}
              values={hasFilters}
              onApply={(next) => {
                setHasRequested(true);
                apply({ ...next, has_page: '1' });
              }}
              onClear={() => {
                setHasRequested(true);
                apply({ ...EMPTY_HAS_FILTERS, has_page: '1' });
              }}
            />
          }
          data={hasRows}
          columns={hasEntriesColumns}
          getRowId={(row, index) => `${row.job_no}-${index}`}
          loading={hasEnabled && hasEntries.isFetching}
          sort={{
            sortBy: hasSort.sortBy,
            sortDir: hasSort.sortDir,
            onSortChange: (sortBy, sortDir) => {
              setHasRequested(true);
              apply({ has_ordering: toOrdering(sortBy, sortDir) ?? 'job_no', has_page: '1' });
            },
          }}
          pagination={{
            page: hasParams.page ?? 1,
            pageSize: hasParams.page_size ?? 20,
            total: hasTotal,
            onPageChange: (next) => apply({ has_page: String(next) }),
            onPageSizeChange: (size) => apply({ has_page_size: String(size), has_page: '1' }),
          }}
          rowActions={hasActions}
          emptyMessage="Listeyi yüklemek için Filtrele veya Yenile butonuna tıklayın."
          onRefresh={refreshHasEntries}
        />
      </Stack>

      {openLines ? (
        <ProcurementLinesModal
          key={`${openLines.jobNo}-${String(openLines.preview)}`}
          jobNo={openLines.jobNo}
          usePreview={openLines.preview}
          onClose={() => setOpenLines(null)}
          // Legacy reloads both lists after a save; the mutation invalidated them.
          onSaved={() => setHasRequested(true)}
        />
      ) : null}
    </>
  );
}
