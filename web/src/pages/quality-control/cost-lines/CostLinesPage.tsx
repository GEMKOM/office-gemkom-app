import { Button, Stack } from '@mantine/core';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  jobOrdersHasQcQueryOptions,
  qcCostKeys,
  qcPendingJobOrdersQueryOptions,
  type CostJobOrder,
  type CostJobOrdersParams,
} from '@/api/quality-control/costLines';
import type { Paginated } from '@/api/types';
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
import { hasEntriesColumns, JOB_STATUS_OPTIONS, pendingColumns } from './columns';
import { QcCostLinesModal } from './QcCostLinesModal';

const PAGE_SIZE = 20;

// Both tables keep their state in the URL; the second one's keys carry a has_ prefix.
const URL_DEFAULTS = {
  search: '',
  status: '',
  page: '1',
  ordering: 'job_no',
  has_search: '',
  has_status: '',
  has_page: '1',
  has_ordering: 'job_no',
};

type Filters = { search: string; status: string };
const EMPTY_FILTERS: Filters = { search: '', status: '' };
const EMPTY_ROWS: CostJobOrder[] = [];

const filterConfig: FilterConfig<keyof Filters>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: 'İş emri no, başlık, müşteri...' },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    placeholder: 'Tümü',
    searchable: false,
    options: JOB_STATUS_OPTIONS,
  },
];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function useListErrorToast(list: UseQueryResult<Paginated<CostJobOrder>>, fallback: string) {
  useEffect(() => {
    if (list.isError) {
      console.error(list.error);
      notify.error(list.error, { fallback });
    }
  }, [list.isError, list.errorUpdatedAt, list.error, fallback]);
}

/** Port of quality-control/cost-lines (cost-lines.js). */
export function CostLinesPage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const [openJobNo, setOpenJobNo] = useState<string | null>(null);

  // ---- pending (no QC cost line yet) ----
  const pendingFilters = useMemo<Filters>(
    () => ({ search: values.search, status: values.status }),
    [values.search, values.status],
  );
  const pendingPage = positiveInt(values.page, 1);
  const pendingSort = fromOrdering(values.ordering || 'job_no');
  const pendingParams: CostJobOrdersParams = {
    ...pendingFilters,
    ordering: toOrdering(pendingSort.sortBy, pendingSort.sortDir) ?? 'job_no',
    page: pendingPage,
    page_size: PAGE_SIZE,
  };
  const pending = useQuery({
    ...qcPendingJobOrdersQueryOptions(pendingParams),
    placeholderData: keepPreviousData,
  });
  useListErrorToast(pending, 'Liste yüklenemedi');

  // ---- job orders that have QC cost lines ----
  const hasFilters = useMemo<Filters>(
    () => ({ search: values.has_search, status: values.has_status }),
    [values.has_search, values.has_status],
  );
  const hasPage = positiveInt(values.has_page, 1);
  const hasSort = fromOrdering(values.has_ordering || 'job_no');
  const hasParams: CostJobOrdersParams = {
    ...hasFilters,
    ordering: toOrdering(hasSort.sortBy, hasSort.sortDir) ?? 'job_no',
    page: hasPage,
    page_size: PAGE_SIZE,
  };
  const hasEntries = useQuery({
    ...jobOrdersHasQcQueryOptions(hasParams),
    placeholderData: keepPreviousData,
  });
  useListErrorToast(hasEntries, 'Satır girilmiş liste yüklenemedi');

  // Legacy refresh goes back to page 1 and reloads.
  const refreshPending = () => {
    if (pendingPage === 1) void pending.refetch();
    else apply({ page: '1' });
  };
  const refreshHasEntries = () => {
    if (hasPage === 1) void hasEntries.refetch();
    else apply({ has_page: '1' });
  };
  const refreshAll = () => {
    // Both tables back to page 1 in one URL write; the rest refetch in place.
    void queryClient.invalidateQueries({ queryKey: qcCostKeys.all, refetchType: 'none' });
    if (pendingPage === 1) void pending.refetch();
    if (hasPage === 1) void hasEntries.refetch();
    if (pendingPage !== 1 || hasPage !== 1) apply({ page: '1', has_page: '1' });
  };

  const rowActions = (row: CostJobOrder): RowAction<CostJobOrder>[] => [
    {
      key: 'open',
      label: 'Satırları Aç',
      icon: 'fas fa-list',
      color: 'primary',
      onClick: () => setOpenJobNo(row.job_no),
    },
  ];

  const figure = (list: UseQueryResult<Paginated<CostJobOrder>>) =>
    list.isPending ? '–' : (list.data?.count ?? 0).toLocaleString('tr-TR');

  return (
    <>
      <PageHeader
        title="KK Maliyet Satırları"
        subtitle="Kalite kontrol maliyeti girilmemiş ve girilmiş iş emirleri"
        icon="project-diagram"
        backTo="/quality-control/"
        stats={[
          { id: 'qc-pending-count', label: 'Maliyet Bekleyen', value: figure(pending) },
          { id: 'qc-has-entries-count', label: 'Maliyet Girilmiş', value: figure(hasEntries) },
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
          title="KK Maliyeti Girilmemiş İş Emirleri"
          icon="fas fa-clipboard-check"
          filters={
            <FilterBar
              inline
              filters={filterConfig}
              values={pendingFilters}
              onApply={(next) => apply({ ...next, page: '1' })}
              onClear={() => apply({ ...EMPTY_FILTERS, page: '1' })}
            />
          }
          data={pending.data?.results ?? EMPTY_ROWS}
          columns={pendingColumns}
          getRowId={(row) => row.job_no}
          loading={pending.isFetching}
          sort={{
            sortBy: pendingSort.sortBy,
            sortDir: pendingSort.sortDir,
            onSortChange: (sortBy, sortDir) =>
              apply({ ordering: toOrdering(sortBy, sortDir) ?? 'job_no', page: '1' }),
          }}
          pagination={{
            page: pendingPage,
            pageSize: PAGE_SIZE,
            total: pending.data?.count ?? 0,
            onPageChange: (next) => apply({ page: String(next) }),
          }}
          rowActions={rowActions}
          emptyMessage="Listeyi yüklemek veya güncellemek için Filtrele veya Yenile butonuna tıklayın."
          onRefresh={refreshPending}
        />

        <DataTable
          title="KK Maliyeti Girilmiş İş Emirleri"
          icon="fas fa-check-double"
          filters={
            <FilterBar
              inline
              filters={filterConfig}
              values={hasFilters}
              onApply={(next) =>
                apply({ has_search: next.search, has_status: next.status, has_page: '1' })
              }
              onClear={() => apply({ has_search: '', has_status: '', has_page: '1' })}
            />
          }
          data={hasEntries.data?.results ?? EMPTY_ROWS}
          columns={hasEntriesColumns}
          getRowId={(row) => row.job_no}
          loading={hasEntries.isFetching}
          sort={{
            sortBy: hasSort.sortBy,
            sortDir: hasSort.sortDir,
            onSortChange: (sortBy, sortDir) =>
              apply({ has_ordering: toOrdering(sortBy, sortDir) ?? 'job_no', has_page: '1' }),
          }}
          pagination={{
            page: hasPage,
            pageSize: PAGE_SIZE,
            total: hasEntries.data?.count ?? 0,
            onPageChange: (next) => apply({ has_page: String(next) }),
          }}
          rowActions={rowActions}
          emptyMessage="Listeyi yüklemek için Filtrele veya Yenile butonuna tıklayın."
          onRefresh={refreshHasEntries}
        />
      </Stack>

      {openJobNo ? (
        <QcCostLinesModal key={openJobNo} jobNo={openJobNo} onClose={() => setOpenJobNo(null)} />
      ) : null}
    </>
  );
}
