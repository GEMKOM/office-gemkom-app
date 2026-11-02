import { Button } from '@mantine/core';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { qcReviewCountQueryOptions } from '@/api/qualityControl';
import {
  QC_REVIEW_STATUS_CHOICES,
  qcReviewKeys,
  qcReviewQueryOptions,
  qcReviewsQueryOptions,
  type QCReview,
  type QCReviewsParams,
} from '@/api/quality-control/qcReviews';
import { useAuth } from '@/auth/AuthProvider';
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
import { isPendingReview, reviewColumns } from './columns';
import { ReviewDecisionModal } from './ReviewDecisionModal';
import { ReviewDetailModal } from './ReviewDetailModal';

// The same keys legacy wrote to the URL; review is the deep link from
// notifications and the ID column (?review=12).
const URL_DEFAULTS = {
  search: '',
  status: '',
  task__job_order: '',
  task__department: '',
  page: '1',
  page_size: '20',
  ordering: '-submitted_at',
  review: '',
};

type FilterKeys = 'search' | 'status' | 'task__job_order' | 'task__department';
type Filters = Record<FilterKeys, string>;
const EMPTY_FILTERS: Filters = {
  search: '',
  status: '',
  task__job_order: '',
  task__department: '',
};
const EMPTY_ROWS: QCReview[] = [];

const filterConfig: FilterConfig<FilterKeys>[] = [
  { type: 'text', key: 'search', label: 'Arama', placeholder: 'Görev başlığı, iş emri...' },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    placeholder: 'Durum seçin',
    searchable: false,
    options: QC_REVIEW_STATUS_CHOICES,
  },
  { type: 'text', key: 'task__job_order', label: 'İş Emri', placeholder: 'İş emri numarası' },
  {
    type: 'select',
    key: 'task__department',
    label: 'Departman',
    placeholder: 'Departman seçin',
    searchable: false,
    options: [
      { value: 'manufacturing', label: 'İmalat' },
      { value: 'design', label: 'Dizayn' },
      { value: 'planning', label: 'Planlama' },
      { value: 'procurement', label: 'Satın Alma' },
    ],
  },
];

/** Legacy canUserDecideReviews: superusers and the kalite-kontrol group (id 5). */
export function canUserDecideReviews(user: Record<string, unknown> | null | undefined): boolean {
  if (!user) return false;
  if (user.is_superuser === true) return true;
  const names = Array.isArray(user.user_groups) ? (user.user_groups as unknown[]) : [];
  const ids = Array.isArray(user.user_group_ids) ? (user.user_group_ids as unknown[]) : [];
  return (
    names.some((g) => String(g || '').toLowerCase() === 'kalite-kontrol') ||
    ids.some((id) => Number(id) === 5)
  );
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of quality-control/qc-reviews (qc-reviews.js). */
export function QcReviewsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canDecide = canUserDecideReviews(user);
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const filters = useMemo<Filters>(
    () => ({
      search: values.search,
      status: values.status,
      task__job_order: values.task__job_order,
      task__department: values.task__department,
    }),
    [values.search, values.status, values.task__job_order, values.task__department],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || '-submitted_at');
  const params: QCReviewsParams = {
    ...filters,
    ordering: toOrdering(sort.sortBy, sort.sortDir) ?? '-submitted_at',
    page,
    page_size: pageSize,
  };
  const list = useQuery({ ...qcReviewsQueryOptions(params), placeholderData: keepPreviousData });
  const pendingCount = useQuery(qcReviewCountQueryOptions({ status: 'pending' }));

  useEffect(() => {
    if (list.isError) notify.error('İncelemeler yüklenirken hata oluştu');
  }, [list.isError, list.errorUpdatedAt]);

  // ---- details (?review=) ----
  const reviewId = /^\d+$/.test(values.review) ? values.review : '';
  const detail = useQuery({ ...qcReviewQueryOptions(reviewId || 0), enabled: Boolean(reviewId) });
  const closeDetail = () => apply({ review: '' });

  useEffect(() => {
    if (!values.review) return;
    if (!reviewId || detail.isError) {
      notify.error('İnceleme detayları yüklenirken hata oluştu');
      apply({ review: '' });
    }
  }, [values.review, reviewId, detail.isError, apply]);

  // ---- decision ----
  const [decision, setDecision] = useState<{ review: QCReview; approve: boolean } | null>(null);

  const openDecision = async (row: QCReview, approve: boolean) => {
    if (!canDecide) {
      notify.warning(
        'Bu işlem için yetkiniz yok. Sadece "kalite-kontrol" grubu veya superuser karar verebilir.',
      );
      return;
    }
    if (!isPendingReview(row)) {
      notify.warning('Sadece "İnceleme Bekliyor" durumundaki kayıtlar için karar verilebilir.');
      return;
    }
    try {
      // The modal needs the task title and part data of the full review.
      const full = await queryClient.fetchQuery(qcReviewQueryOptions(row.id));
      setDecision({ review: full, approve });
    } catch (error) {
      console.error('Error loading review details:', error);
      notify.error('İnceleme detayları yüklenirken hata oluştu');
    }
  };

  const rowActions = (row: QCReview): RowAction<QCReview>[] => [
    {
      key: 'view',
      label: 'Detaylar',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => apply({ review: String(row.id) }),
    },
    {
      key: 'approve',
      label: 'Onayla',
      icon: 'fas fa-check',
      color: 'green',
      hidden: !(canDecide && isPendingReview(row)),
      onClick: () => void openDecision(row, true),
    },
    {
      key: 'reject',
      label: 'Reddet',
      icon: 'fas fa-times',
      color: 'danger',
      hidden: !(canDecide && isPendingReview(row)),
      onClick: () => void openDecision(row, false),
    },
  ];

  // Legacy refresh goes back to page 1 and reloads.
  const refresh = () => {
    if (page === 1) void list.refetch();
    else {
      void queryClient.invalidateQueries({ queryKey: qcReviewKeys.all, refetchType: 'none' });
      apply({ page: '1' });
    }
  };

  const figure = (value: number | undefined, pending: boolean) =>
    pending ? '–' : (value ?? 0).toLocaleString('tr-TR');

  return (
    <>
      <PageHeader
        title="KK İncelemeleri"
        subtitle="Kalite kontrol incelemelerini görüntüleyin ve yönetin"
        icon="search"
        stats={[
          {
            id: 'qc-reviews-count',
            label: 'Toplam',
            value: figure(list.data?.count, list.isPending),
          },
          {
            id: 'qc-reviews-pending-count',
            label: 'İnceleme Bekliyor',
            value: figure(pendingCount.data, pendingCount.isPending),
          },
        ]}
        actions={
          <Button
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            onClick={refresh}
          >
            Yenile
          </Button>
        }
      />

      <DataTable
        title="KK İncelemeleri"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => apply({ ...EMPTY_FILTERS, page: '1' })}
          />
        }
        data={list.data?.results ?? EMPTY_ROWS}
        columns={reviewColumns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? '-submitted_at', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        extraData={canDecide}
        emptyMessage="KK incelemesi bulunamadı"
        onRefresh={() => void list.refetch()}
      />

      {reviewId && !detail.isError ? (
        <ReviewDetailModal
          review={detail.data}
          loading={detail.isPending}
          canDecide={canDecide}
          onClose={closeDetail}
          onDecide={(review, approve) => {
            closeDetail();
            void openDecision(review, approve);
          }}
          onCommented={() =>
            void queryClient.invalidateQueries({ queryKey: qcReviewKeys.detail(reviewId) })
          }
        />
      ) : null}

      {decision ? (
        <ReviewDecisionModal
          key={`${decision.review.id}-${decision.approve}`}
          review={decision.review}
          approve={decision.approve}
          onClose={() => setDecision(null)}
        />
      ) : null}
    </>
  );
}
