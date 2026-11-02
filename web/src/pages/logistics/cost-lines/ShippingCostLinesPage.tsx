import { Button, Stack } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  jobOrdersHasShippingQueryOptions,
  shippingPendingQueryOptions,
  type ShippingJobOrder,
  type ShippingJobOrdersParams,
} from '@/api/logistics/costLines';
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
import { hasEntriesColumns, pendingColumns, STATUS_FILTER_OPTIONS } from './columns';
import { ShippingLinesModal } from './ShippingLinesModal';

// Both tables keep their state in the URL; the second one's keys carry has_.
const URL_DEFAULTS = {
  search: '',
  status: '',
  page: '1',
  page_size: '20',
  ordering: 'job_no',
  has_search: '',
  has_status: '',
  has_page: '1',
  has_page_size: '20',
  has_ordering: 'job_no',
};

type PendingFilters = { search: string; status: string };
type HasFilters = { has_search: string; has_status: string };

const pendingFilterConfig: FilterConfig<keyof PendingFilters>[] = [
  {
    type: 'text',
    key: 'search',
    label: 'Arama',
    placeholder: 'İş emri no, başlık, müşteri...',
    span: 3,
  },
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
  {
    type: 'text',
    key: 'has_search',
    label: 'Arama',
    placeholder: 'İş emri no, başlık, müşteri...',
    span: 3,
  },
  {
    type: 'select',
    key: 'has_status',
    label: 'Durum',
    placeholder: 'Tümü',
    searchable: false,
    options: STATUS_FILTER_OPTIONS,
  },
];

const EMPTY_ROWS: ShippingJobOrder[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of logistics/cost-lines (cost-lines.js). */
export function ShippingCostLinesPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  // ---- pending (no shipping line yet), loaded at once ----
  const pendingFilters = useMemo<PendingFilters>(
    () => ({ search: values.search, status: values.status }),
    [values.search, values.status],
  );
  const pendingSort = fromOrdering(values.ordering || 'job_no');
  const pendingParams: ShippingJobOrdersParams = {
    ...pendingFilters,
    ordering: toOrdering(pendingSort.sortBy, pendingSort.sortDir) ?? 'job_no',
    page: positiveInt(values.page, 1),
    page_size: positiveInt(values.page_size, 20),
  };
  const pending = useQuery({
    ...shippingPendingQueryOptions(pendingParams),
    placeholderData: keepPreviousData,
  });

  // ---- has entries: legacy loads it only on Filtrele / Yenile / after a save ----
  const hasFilters = useMemo<HasFilters>(
    () => ({ has_search: values.has_search, has_status: values.has_status }),
    [values.has_search, values.has_status],
  );
  const hasStateInUrl =
    Boolean(values.has_search || values.has_status) ||
    values.has_page !== '1' ||
    values.has_page_size !== '20' ||
    values.has_ordering !== 'job_no';
  const [hasRequested, setHasRequested] = useState(false);
  const hasEnabled = hasRequested || hasStateInUrl;
  const hasSort = fromOrdering(values.has_ordering || 'job_no');
  const hasParams: ShippingJobOrdersParams = {
    search: hasFilters.has_search,
    status: hasFilters.has_status,
    ordering: toOrdering(hasSort.sortBy, hasSort.sortDir) ?? 'job_no',
    page: positiveInt(values.has_page, 1),
    page_size: positiveInt(values.has_page_size, 20),
  };
  const hasEntries = useQuery({
    ...jobOrdersHasShippingQueryOptions(hasParams),
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
      void queryClient.invalidateQueries({ queryKey: ['shippingCosts'] });
    } else {
      void queryClient.invalidateQueries({ queryKey: ['shippingCosts'], refetchType: 'none' });
      apply({ page: '1', has_page: '1' });
    }
  };

  // ---- lines modal ----
  const [openJobNo, setOpenJobNo] = useState<string | null>(null);
  const rowActions = (): RowAction<ShippingJobOrder>[] => [
    {
      key: 'open',
      label: 'Satırları Aç',
      icon: 'fas fa-list',
      color: 'primary',
      onClick: (row) => setOpenJobNo(row.job_no),
    },
  ];

  const figure = (value: number, pendingState: boolean) =>
    pendingState ? '–' : value.toLocaleString('tr-TR');

  return (
    <>
      <PageHeader
        title="Sevkiyat Maliyet Satırları"
        subtitle="Sevkiyat maliyeti girilmemiş ve girilmiş iş emirleri"
        backTo="/logistics/"
        stats={[
          {
            id: 'pending-count',
            label: 'Girilmemiş',
            value: figure(pendingTotal, pending.isPending),
          },
          {
            id: 'has-entries-count',
            label: 'Girilmiş',
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
          title="Sevkiyat Maliyeti Girilmemiş İş Emirleri"
          icon="fas fa-truck"
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
          rowActions={rowActions}
          emptyMessage="Listeyi yüklemek veya güncellemek için Filtrele veya Yenile butonuna tıklayın."
          onRefresh={refreshPending}
        />

        <DataTable
          title="Sevkiyat Maliyeti Girilmiş İş Emirleri"
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
                apply({ has_search: '', has_status: '', has_page: '1' });
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
          rowActions={rowActions}
          emptyMessage="Listeyi yüklemek için Filtrele veya Yenile butonuna tıklayın."
          onRefresh={refreshHasEntries}
        />
      </Stack>

      {openJobNo ? (
        <ShippingLinesModal
          key={openJobNo}
          jobNo={openJobNo}
          onClose={() => setOpenJobNo(null)}
          // Legacy reloads both lists after a save; the mutation invalidated them.
          onSaved={() => setHasRequested(true)}
        />
      ) : null}
    </>
  );
}
