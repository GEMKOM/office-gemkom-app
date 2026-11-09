import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_STALE_TIME } from '@/api/queryClient';
import { materialTrackingErrorMessage } from '@/api/materialTracking/errors';
import {
  materialPullRequestsQueryOptions,
  pullRequestKeys,
  type MaterialPullRequest,
  type MaterialPullRequestsParams,
} from '@/api/materialTracking/pullRequests';
import { useAuth } from '@/auth/AuthProvider';
import {
  DataTable,
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
  canCancelPullRequest,
  PullRequestDetailModal,
  useCancelPullRequestFlow,
} from '../pullRequestShared';
import { pullRequestColumns } from './columns';
import { exportPullRequest } from './exportPullRequest';

// Depo Çekme Talepleri — the office-side list of every warehouse pull request
// (pending, handed over, cancelled), with detail, cancel and a per-request
// Excel. The warehouse works the same requests on saha /warehouse/transfer-requests/.

const DEFAULT_ORDERING = '-requested_at';

// ?talep=MPR-2026-0012 (links from other pages) pre-fills the search box and
// ?status= the status pill, as legacy applyUrlParams() did.
const URL_DEFAULTS = {
  search: '',
  talep: '',
  status: '',
  destination_type: '',
  job_no: '',
  requested_after: '',
  requested_before: '',
  mine: false,
  ordering: DEFAULT_ORDERING,
  page: '1',
  page_size: '20',
};

type FilterKeys =
  | 'search'
  | 'status'
  | 'destination_type'
  | 'job_no'
  | 'requested_after'
  | 'requested_before'
  | 'mine'
  | 'ordering';
type FilterState = {
  search: string;
  status: string;
  destination_type: string;
  job_no: string;
  requested_after: string;
  requested_before: string;
  mine: boolean;
  ordering: string;
};

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: 'Talep no, hedef, iş no, ürün...' },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    placeholder: 'Tümü',
    options: [
      { value: 'pending', label: 'Beklemede' },
      { value: 'transferred', label: 'Teslim Edildi' },
      { value: 'cancelled', label: 'İptal Edildi' },
    ],
  },
  {
    type: 'select',
    key: 'destination_type',
    label: 'Hedef Türü',
    placeholder: 'Tümü',
    options: [
      { value: 'subcontractor', label: 'Taşeron' },
      { value: 'team', label: 'Kaynak Ekibi' },
    ],
  },
  {
    type: 'text',
    key: 'job_no',
    label: 'İş No',
    placeholder: 'İş no...',
    suggestions: 'jobOrders',
  },
  { type: 'date', key: 'requested_after', label: 'Talep Tarihi (başlangıç)' },
  { type: 'date', key: 'requested_before', label: 'Talep Tarihi (bitiş)' },
  { type: 'checkbox', key: 'mine', label: 'Sadece benim taleplerim' },
  // The default (Talep: Yeni → Eski) is the pill's clear option.
  {
    type: 'select',
    key: 'ordering',
    label: 'Sıralama',
    placeholder: 'Talep: Yeni → Eski',
    options: [
      { value: 'requested_at', label: 'Talep: Eski → Yeni' },
      { value: '-confirmed_at', label: 'Teslim: Yeni → Eski' },
      { value: 'number', label: 'Talep No' },
    ],
  },
];

const EMPTY_FILTERS: FilterState = {
  search: '',
  status: '',
  destination_type: '',
  job_no: '',
  requested_after: '',
  requested_before: '',
  mine: false,
  ordering: '',
};
const EMPTY_ROWS: MaterialPullRequest[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function exportFileName() {
  return `depo_cekme_talepleri_${new Date().toISOString().slice(0, 10)}`;
}

/** Port of manufacturing/material-tracking/pull-requests (pullRequests.js). */
export function PullRequestsPage() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<FilterState>(
    () => ({
      search: values.search || values.talep,
      status: values.status,
      destination_type: values.destination_type,
      job_no: values.job_no,
      requested_after: values.requested_after,
      requested_before: values.requested_before,
      mine: values.mine,
      // The default ordering shows as an unset pill.
      ordering: values.ordering === DEFAULT_ORDERING ? '' : values.ordering,
    }),
    [values],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const ordering = values.ordering || DEFAULT_ORDERING;
  const sort = fromOrdering(ordering);

  const params: MaterialPullRequestsParams = {
    search: filters.search || undefined,
    status: filters.status || undefined,
    destination_type: filters.destination_type || undefined,
    job_no: filters.job_no || undefined,
    requested_after: filters.requested_after || undefined,
    requested_before: filters.requested_before || undefined,
    requested_by: filters.mine ? user.id : undefined,
    ordering,
    page,
    page_size: pageSize,
  };
  const list = useQuery({
    ...materialPullRequestsQueryOptions(params),
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.results ?? EMPTY_ROWS;
  const total = list.data?.count ?? 0;

  useEffect(() => {
    if (list.isError) notify.error(list.error, { fallback: 'Depo çekme talepleri yüklenemedi' });
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const [detailId, setDetailId] = useState<number | null>(null);
  const closeDetail = useCallback(() => setDetailId(null), []);
  const cancelFlow = useCancelPullRequestFlow();

  const runExport = async (request: MaterialPullRequest) => {
    try {
      await exportPullRequest(request);
    } catch (error) {
      console.error('Pull request export error:', error);
      notify.error(
        materialTrackingErrorMessage(
          error,
          'Depo çekme talebi yüklenirken hata oluştu',
          'Talep yüklenemedi.',
        ),
      );
    }
  };

  const rowActions = (row: MaterialPullRequest): RowAction<MaterialPullRequest>[] => [
    {
      key: 'detail',
      label: 'Detay',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: (r) => setDetailId(r.id),
    },
    {
      key: 'excel',
      label: 'Excel',
      icon: 'fas fa-file-excel',
      color: 'success',
      onClick: (r) => void runExport(r),
    },
    {
      key: 'cancel',
      label: 'İptal',
      icon: 'fas fa-ban',
      color: 'danger',
      hidden: !canCancelPullRequest(row, user, isAdmin),
      onClick: (r) => void cancelFlow(r),
    },
  ];

  const refresh = () => {
    // Legacy refresh goes back to page 1 and reloads.
    if (page === 1) {
      void list.refetch();
    } else {
      void queryClient.invalidateQueries({ queryKey: pullRequestKeys.all, refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  return (
    <>
      <PageHeader
        title="Depo Çekme Talepleri"
        subtitle="Taşeron ve kaynak ekiplerine depodan çekilen malzemeler: bekleyen, teslim edilen ve iptal edilen talepler"
        icon="dolly"
        backTo="/manufacturing/material-tracking/"
      />

      <DataTable
        title="Talepler"
        icon="fas fa-dolly"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) =>
              apply({ ...next, talep: '', ordering: next.ordering || DEFAULT_ORDERING, page: '1' })
            }
            onClear={() =>
              apply({ ...EMPTY_FILTERS, talep: '', ordering: DEFAULT_ORDERING, page: '1' })
            }
          />
        }
        data={rows}
        columns={pullRequestColumns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
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
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        extraData={`${user.id}:${isAdmin}`}
        emptyMessage="Depo çekme talebi bulunamadı."
        onRefresh={refresh}
        // Legacy exports the loaded page.
        exportable={{ fileName: exportFileName() }}
      />

      <PullRequestDetailModal
        requestId={detailId}
        onClose={closeDetail}
        user={user}
        isAdmin={isAdmin}
        ledger
        onExport={(request) => void runExport(request)}
      />
    </>
  );
}
