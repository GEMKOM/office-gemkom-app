import { Button, Code, Tabs, Text, Textarea } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  completedReviewsQueryOptions,
  drawingReleaseQueryOptions,
  pendingReleasesQueryOptions,
  useApproveRelease,
  useRejectRelease,
  type CompletedReviewParams,
  type DrawingRelease,
} from '@/api/projects/design';
import { useUsers } from '@/api/reference/users';
import { formatDateTime } from '@/lib/format';
import {
  confirm,
  DataTable,
  DetailModal,
  FaIcon,
  FilterBar,
  FormModal,
  fromOrdering,
  ModalSection,
  notify,
  PageHeader,
  Panel,
  toOrdering,
  useUrlFilters,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { TopicDiscussion } from '../../shared/topic-discussion/TopicDiscussion';
import {
  approvalProgress,
  COMPLETED_STATUS_CHOICES,
  completedColumns,
  FolderPath,
  pendingColumns,
  ReleaseStatusBadge,
  revisionLabel,
} from './columns';

const DEFAULT_COMPLETED_STATUS = 'released,rejected';
const DEFAULT_ORDERING = '-review_completed_at';

// The legacy URL keys: tab=completed opens the history; release_id is the deep
// link notifications, the dashboard and project tracking use.
const URL_DEFAULTS = {
  tab: 'pending',
  search: '',
  status__in: '',
  job_order: '',
  released_by: '',
  reviewer: '',
  completed_at_after: '',
  completed_at_before: '',
  page: '1',
  page_size: '20',
  ordering: DEFAULT_ORDERING,
  release_id: '',
};

type FilterKeys =
  | 'status__in'
  | 'job_order'
  | 'released_by'
  | 'reviewer'
  | 'completed_at_after'
  | 'completed_at_before'
  | 'search';
type FilterState = Omit<Record<FilterKeys, string>, 'status__in'> & { status__in: string[] };

const EMPTY: DrawingRelease[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function RejectModal({
  release,
  onClose,
  onRejected,
}: {
  release: DrawingRelease;
  onClose: () => void;
  onRejected: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reject = useRejectRelease();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Reddetme nedeni gereklidir');
      return;
    }
    try {
      await reject.mutateAsync({ id: release.id, reason: reason.trim() });
      notify.success('Yayın reddedildi');
      onRejected();
    } catch (err) {
      console.error('Error rejecting release:', err);
      notify.error('Yayın reddedilirken hata oluştu');
    }
  };
  return (
    <FormModal
      opened
      onClose={onClose}
      title="Yayını Reddet"
      subtitle={`${release.job_order_no || ''} · ${revisionLabel(release)}`}
      icon="fas fa-times-circle"
      size={560}
      submitLabel="Reddet"
      submitIcon="fas fa-times"
      submitting={reject.isPending}
      onSubmit={(event) => void submit(event)}
    >
      <ModalSection title="Reddetme Nedeni">
        <Textarea
          label="Reddetme Nedeni"
          withAsterisk
          rows={4}
          placeholder="Reddetme nedenini açıklayın..."
          value={reason}
          error={error}
          data-autofocus
          onChange={(event) => {
            setReason(event.currentTarget.value);
            setError(null);
          }}
        />
      </ModalSection>
    </FormModal>
  );
}

function ReleaseDetailModal({
  releaseId,
  opened,
  onApprove,
  onReject,
  onClose,
}: {
  releaseId: string;
  opened: boolean;
  onApprove: (release: DrawingRelease) => void;
  onReject: (release: DrawingRelease) => void;
  onClose: () => void;
}) {
  const detail = useQuery(drawingReleaseQueryOptions(releaseId));
  const release = detail.data;

  useEffect(() => {
    if (detail.isError) {
      notify.error('Yayın detayları yüklenemedi');
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.isError]);

  const isPending = release?.status === 'pending_approval';
  const approvals = release?.approvals ?? [];
  return (
    <DetailModal
      opened={opened}
      onClose={onClose}
      size="full"
      icon="fas fa-search"
      title={
        release
          ? `${release.job_order_no || ''} — Rev.${release.revision_code || release.revision_number}`
          : 'Yayın Detayları'
      }
      subtitle={release?.job_order_title || undefined}
      loading={detail.isPending}
      footerActions={
        release?.can_approve ? (
          <>
            <Button
              color="red"
              variant="light"
              leftSection={<FaIcon icon="fas fa-times" />}
              onClick={() => onReject(release)}
            >
              Reddet
            </Button>
            <Button
              color="green"
              leftSection={<FaIcon icon="fas fa-check" />}
              onClick={() => onApprove(release)}
            >
              Olumlu
            </Button>
          </>
        ) : null
      }
      sections={
        release
          ? [
              {
                title: 'Yayın Bilgileri',
                icon: 'fas fa-info-circle',
                fields: [
                  { label: 'İş Emri', span: 4, value: release.job_order_no },
                  { label: 'Başlık', span: 8, value: release.job_order_title },
                  { label: 'Oluşturan', span: 4, value: release.released_by_name },
                  { label: 'Durum', span: 4, render: <ReleaseStatusBadge release={release} /> },
                  isPending
                    ? { label: 'İnceleme', span: 4, value: approvalProgress(release) }
                    : {
                        label: 'Gönderim',
                        span: 4,
                        value: release.released_at,
                        type: 'datetime' as const,
                      },
                  {
                    label: 'Klasör Yolu',
                    span: 12,
                    render: <FolderPath path={release.folder_path} />,
                  },
                  {
                    label: 'Değişiklikler',
                    span: 12,
                    render: (
                      <Code block style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                        {release.changelog || '-'}
                      </Code>
                    ),
                  },
                  {
                    label: 'İnceleyenler',
                    span: 12,
                    hidden: isPending,
                    render: approvals.length ? (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {approvals.map((a, index) => (
                          <li key={index}>
                            {a.approver_name || '-'} — {a.decision_display || a.decision || ''} (
                            {a.created_at ? formatDateTime(a.created_at) : '-'})
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <Text c="dimmed" size="sm">
                        Kayıt yok
                      </Text>
                    ),
                  },
                ],
              },
              {
                title: 'Tartışma',
                icon: 'fas fa-comments',
                content: release.release_topic_id ? (
                  <TopicDiscussion topicId={release.release_topic_id} />
                ) : (
                  <Text c="dimmed" size="sm">
                    Bu yayın için tartışma konusu bulunamadı.
                  </Text>
                ),
              },
            ]
          : []
      }
    />
  );
}

/** Port of design/release-approvals (release-approvals.js): peer review of drawing releases. */
export function ReleaseApprovalsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const tab = values.tab === 'completed' ? 'completed' : 'pending';
  const users = useUsers({ is_active: true });

  // ---- pending ----
  const pending = useQuery({ ...pendingReleasesQueryOptions(), enabled: tab === 'pending' });
  useEffect(() => {
    if (pending.isError) notify.error('İnceleme bekleyen yayınlar yüklenirken hata oluştu');
  }, [pending.isError, pending.errorUpdatedAt]);

  // ---- completed ----
  const statuses = values.status__in || DEFAULT_COMPLETED_STATUS;
  const filters = useMemo<FilterState>(
    () => ({
      status__in: statuses.split(',').filter(Boolean),
      job_order: values.job_order,
      released_by: values.released_by,
      reviewer: values.reviewer,
      completed_at_after: values.completed_at_after,
      completed_at_before: values.completed_at_before,
      search: values.search,
    }),
    [
      statuses,
      values.job_order,
      values.released_by,
      values.reviewer,
      values.completed_at_after,
      values.completed_at_before,
      values.search,
    ],
  );
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering || DEFAULT_ORDERING);
  const params: CompletedReviewParams = {
    status__in: statuses,
    job_order: values.job_order,
    released_by: values.released_by,
    reviewer: values.reviewer,
    completed_at_after: values.completed_at_after,
    completed_at_before: values.completed_at_before,
    search: values.search,
    ordering: toOrdering(sort.sortBy, sort.sortDir) ?? DEFAULT_ORDERING,
    page,
    page_size: pageSize,
  };
  const completed = useQuery({
    ...completedReviewsQueryOptions(params),
    enabled: tab === 'completed',
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (completed.isError) notify.error('Tamamlanan incelemeler yüklenirken hata oluştu');
  }, [completed.isError, completed.errorUpdatedAt]);

  const userOptions = useMemo(
    () =>
      (users.data ?? []).map((u) => ({
        value: String(u.id),
        label: u.full_name || u.username || `Kullanıcı #${u.id}`,
      })),
    [users.data],
  );
  const filterConfig: FilterConfig<FilterKeys>[] = [
    { type: 'text', key: 'search', label: 'Ara', placeholder: 'İş emri, başlık, değişiklik...' },
    { type: 'multiselect', key: 'status__in', label: 'Sonuç', options: COMPLETED_STATUS_CHOICES },
    { type: 'text', key: 'job_order', label: 'İş Emri', placeholder: 'İş emri no' },
    {
      type: 'select',
      key: 'released_by',
      label: 'Oluşturan',
      placeholder: 'Tümü',
      options: userOptions,
    },
    {
      type: 'select',
      key: 'reviewer',
      label: 'İnceleyen',
      placeholder: 'Tümü',
      options: userOptions,
    },
    { type: 'date', key: 'completed_at_after', label: 'Tamamlanma (Başlangıç)' },
    { type: 'date', key: 'completed_at_before', label: 'Tamamlanma (Bitiş)' },
  ];

  // ---- details and decisions ----
  const [rejecting, setRejecting] = useState<DrawingRelease | null>(null);
  const approve = useApproveRelease();
  const openDetails = (release: DrawingRelease) => apply({ release_id: String(release.id) });
  const closeDetails = () => apply({ release_id: '' });

  const approveRelease = async (release: DrawingRelease) => {
    const ok = await confirm({
      title: 'Olumlu Değerlendirme',
      icon: 'fas fa-check-circle',
      message: 'Bu teknik çizim yayınını olumlu değerlendirmek istediğinizden emin misiniz?',
      details: `${release.job_order_no || ''} · ${revisionLabel(release)}`,
      confirmLabel: 'Evet, Olumlu',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      const response = await approve.mutateAsync(release.id);
      notify.success(response?.message || 'Değerlendirmeniz kaydedildi');
      // Published: the review is over, so the details go. Otherwise they stay
      // open and show the new count (the detail query was invalidated).
      if (response?.published) closeDetails();
    } catch (error) {
      console.error('Error approving release:', error);
      notify.error('Değerlendirme kaydedilirken hata oluştu');
    }
  };

  const pendingActions = (row: DrawingRelease): RowAction<DrawingRelease>[] => [
    { key: 'view', label: 'İncele', icon: 'fas fa-eye', onClick: openDetails },
    {
      key: 'approve',
      label: 'Olumlu',
      icon: 'fas fa-check',
      hidden: row.can_approve !== true,
      onClick: (r) => void approveRelease(r),
    },
    {
      key: 'reject',
      label: 'Reddet',
      icon: 'fas fa-times',
      color: 'danger',
      hidden: row.can_approve !== true,
      onClick: setRejecting,
    },
  ];

  const refresh = () => {
    if (tab === 'completed') void completed.refetch();
    else void pending.refetch();
  };

  return (
    <>
      <PageHeader
        title="Çizim İncelemesi"
        subtitle="Bekleyen incelemeleri değerlendirin ve tamamlanan inceleme geçmişini görüntüleyin"
        icon="fas fa-search"
        backTo="/design/"
        stats={[
          {
            id: 'pending-release-count',
            label: 'İnceleme Bekleyen',
            value: pending.data ? pending.data.length.toLocaleString('tr-TR') : '–',
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

      <Panel>
        <Tabs
          value={tab}
          // Leaving the history drops its URL state, as legacy did.
          onChange={(next) =>
            next === 'completed'
              ? apply({ tab: 'completed' })
              : apply({ ...URL_DEFAULTS, release_id: values.release_id })
          }
          keepMounted={false}
        >
          <Tabs.List mb="md">
            <Tabs.Tab value="pending" leftSection={<FaIcon icon="fas fa-hourglass-half" />}>
              Bekleyen
            </Tabs.Tab>
            <Tabs.Tab value="completed" leftSection={<FaIcon icon="fas fa-check-double" />}>
              Tamamlanan
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="pending">
            <DataTable
              title="İnceleme Bekleyen Yayınlar"
              data={pending.data ?? EMPTY}
              columns={pendingColumns}
              getRowId={(row) => String(row.id)}
              loading={pending.isFetching}
              rowActions={pendingActions}
              emptyMessage="İnceleme bekleyen yayın yok."
              onRefresh={() => void pending.refetch()}
            />
          </Tabs.Panel>

          <Tabs.Panel value="completed">
            <DataTable
              title="Tamamlanan İncelemeler"
              filters={
                <FilterBar
                  inline
                  filters={filterConfig}
                  values={filters}
                  onApply={(next) =>
                    apply({
                      ...next,
                      // Nothing ticked means every result, as in legacy.
                      status__in: (next.status__in.length
                        ? next.status__in
                        : COMPLETED_STATUS_CHOICES.map((s) => s.value)
                      ).join(','),
                      page: '1',
                    })
                  }
                  onClear={() =>
                    apply({
                      status__in: '',
                      job_order: '',
                      released_by: '',
                      reviewer: '',
                      completed_at_after: '',
                      completed_at_before: '',
                      search: '',
                      page: '1',
                    })
                  }
                />
              }
              data={completed.data?.results ?? EMPTY}
              columns={completedColumns}
              getRowId={(row) => String(row.id)}
              loading={completed.isFetching}
              sort={{
                sortBy: sort.sortBy,
                sortDir: sort.sortDir,
                onSortChange: (sortBy, sortDir) =>
                  apply({ ordering: toOrdering(sortBy, sortDir) ?? DEFAULT_ORDERING, page: '1' }),
              }}
              pagination={{
                page,
                pageSize,
                total: completed.data?.count ?? 0,
                onPageChange: (next) => apply({ page: String(next) }),
                onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
              }}
              rowActions={() => [
                { key: 'view', label: 'Görüntüle', icon: 'fas fa-eye', onClick: openDetails },
              ]}
              emptyMessage="Tamamlanan inceleme bulunamadı."
              onRefresh={() => void completed.refetch()}
            />
          </Tabs.Panel>
        </Tabs>
      </Panel>

      {values.release_id ? (
        <ReleaseDetailModal
          key={values.release_id}
          releaseId={values.release_id}
          opened={!rejecting}
          onApprove={(release) => void approveRelease(release)}
          onReject={setRejecting}
          onClose={closeDetails}
        />
      ) : null}

      {rejecting ? (
        <RejectModal
          release={rejecting}
          onClose={() => setRejecting(null)}
          onRejected={() => {
            setRejecting(null);
            closeDetails();
          }}
        />
      ) : null}
    </>
  );
}
