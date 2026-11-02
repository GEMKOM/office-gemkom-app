import { Grid, Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  approvedDepartmentRequestsQueryOptions,
  departmentRequestQueryOptions,
  pendingDepartmentRequestsQueryOptions,
  useApproveDepartmentRequest,
  useRejectDepartmentRequest,
  type DepartmentRequest,
} from '@/api/general/departmentRequests';
import { formatDate } from '@/lib/format';
import {
  confirm,
  DataTable,
  errorMessage,
  notify,
  PageHeader,
  useUrlFilters,
  type RowAction,
} from '@/ui';
import { itemsCount, priorityLabel } from '../shared';
import { approvedColumns, pendingColumns } from './columns';
import { PendingRequestDetailModal } from './PendingRequestDetailModal';
import { RejectDepartmentRequestModal } from './RejectDepartmentRequestModal';

// `request` is the legacy deep link (daily summary e-mails: ?request=<id>).
const URL_DEFAULTS = { request: '', approved_page: '1' };
const PAGE_SIZE = 20;
const EMPTY_ROWS: DepartmentRequest[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Port of general/department-requests/pending (pending.js + modals.js). */
export function PendingDepartmentRequestsPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const pending = useQuery(pendingDepartmentRequestsQueryOptions());
  const pendingRows = pending.data?.results ?? EMPTY_ROWS;

  const approvedPage = positiveInt(values.approved_page, 1);
  const approved = useQuery({
    ...approvedDepartmentRequestsQueryOptions({ page: approvedPage, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const approvedRows = approved.data?.results ?? EMPTY_ROWS;

  // ---- details ----
  const detailId = values.request;
  const detail = useQuery({
    ...departmentRequestQueryOptions(detailId || 0),
    enabled: Boolean(detailId),
  });
  const openDetail = (id: number) => apply({ request: String(id) });
  const closeDetail = () => apply({ request: '' });
  useEffect(() => {
    if (!detailId || !detail.isError) return;
    notify.error(`Talep detayları yüklenirken hata oluştu: ${errorMessage(detail.error)}`);
    apply({ request: '' });
  }, [detailId, detail.isError, detail.error, apply]);

  // ---- approve ----
  const approve = useApproveDepartmentRequest();
  const approveRequest = async (row: DepartmentRequest) => {
    // Legacy closes the details first, then asks.
    closeDetail();
    const ok = await confirm({
      title: 'Departman Talebi Onayı',
      icon: 'fas fa-check-circle',
      message: 'Bu departman talebini onaylamak istediğinizden emin misiniz?',
      details: (
        <Grid gap={6}>
          {[
            ['Talep No', `#${row.id}`],
            ['Talep Eden', row.requestor_username || 'Bilinmiyor'],
            ['Departman', row.department_label || '-'],
            ['Ürün Sayısı', `${itemsCount(row)} ürün`],
            ['Öncelik', priorityLabel(row.priority)],
            ['Talep Tarihi', row.needed_date ? formatDate(row.needed_date) : '-'],
          ].map(([label, value]) => (
            <Grid.Col key={label} span={6}>
              <Text size="sm">
                <strong>{label}:</strong> {value}
              </Text>
            </Grid.Col>
          ))}
        </Grid>
      ),
      confirmLabel: 'Evet, Onayla',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      await approve.mutateAsync(row.id);
      notify.success('Departman talebi başarıyla onaylandı');
    } catch (error) {
      notify.error(`Departman talebi onaylanırken hata oluştu: ${errorMessage(error)}`);
    }
  };

  // ---- reject ----
  const reject = useRejectDepartmentRequest();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const rejectRequest = async (comment: string) => {
    if (rejectingId === null) {
      notify.error('Hata: Talep ID bulunamadı');
      return;
    }
    try {
      await reject.mutateAsync({ id: rejectingId, comment });
      notify.success('Departman talebi başarıyla reddedildi');
      setRejectingId(null);
      closeDetail();
    } catch (error) {
      notify.error(`Departman talebi reddedilirken hata oluştu: ${errorMessage(error)}`);
    }
  };

  const pendingActions = (row: DepartmentRequest): RowAction<DepartmentRequest>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => openDetail(row.id),
    },
    {
      key: 'approve',
      label: 'Onayla',
      icon: 'fas fa-check',
      color: 'success',
      onClick: (r) => void approveRequest(r),
      hidden: row.status !== 'submitted',
    },
    {
      key: 'reject',
      label: 'Reddet',
      icon: 'fas fa-times',
      color: 'danger',
      onClick: () => setRejectingId(row.id),
      hidden: row.status !== 'submitted',
    },
  ];

  const approvedActions = (row: DepartmentRequest): RowAction<DepartmentRequest>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => openDetail(row.id),
    },
  ];

  const figure = (pendingQuery: boolean, value: number) =>
    pendingQuery ? '–' : value.toLocaleString('tr-TR');

  return (
    <>
      <PageHeader
        title="Onay Bekleyen Departman Talepleri"
        subtitle="Onayınızı bekleyen departman taleplerinin yönetimi"
        icon="boxes"
        backTo="/general/department-requests"
        stats={[
          {
            id: 'pending-requests-count',
            label: 'Onay Bekleyen',
            value: figure(pending.isPending, pending.data?.count ?? 0),
          },
          {
            id: 'approved-requests-count',
            label: 'Onayladığım',
            value: figure(approved.isPending, approved.data?.count ?? 0),
          },
        ]}
      />

      <DataTable
        title="Onay Bekleyen Departman Talepleri"
        icon="fas fa-clock"
        data={pendingRows}
        columns={pendingColumns}
        getRowId={(row) => String(row.id)}
        loading={pending.isFetching}
        pagination={{ pageSize: PAGE_SIZE }}
        rowActions={pendingActions}
        emptyMessage="Onay bekleyen departman talebi bulunamadı."
        onRefresh={() => void pending.refetch()}
      />

      <div style={{ height: 'var(--mantine-spacing-lg)' }} />

      <DataTable
        title="Onayladığım Departman Talepleri"
        icon="fas fa-check-circle"
        data={approvedRows}
        columns={approvedColumns}
        getRowId={(row) => String(row.id)}
        loading={approved.isFetching}
        pagination={{
          page: approvedPage,
          pageSize: PAGE_SIZE,
          total: approved.data?.count ?? 0,
          onPageChange: (next) => apply({ approved_page: String(next) }),
        }}
        rowActions={approvedActions}
        emptyMessage="Onayladığınız departman talebi bulunamadı."
        onRefresh={() => void approved.refetch()}
      />

      {detailId ? (
        <PendingRequestDetailModal
          request={detail.data}
          loading={detail.isFetching}
          onClose={closeDetail}
          onApprove={(r) => void approveRequest(r)}
          onReject={(r) => setRejectingId(r.id)}
        />
      ) : null}

      {rejectingId !== null ? (
        <RejectDepartmentRequestModal
          onClose={() => setRejectingId(null)}
          onReject={rejectRequest}
          submitting={reject.isPending}
        />
      ) : null}
    </>
  );
}
