import { Button, SimpleGrid, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  craneErrorText,
  craneRequestQueryOptions,
  craneRequestsQueryOptions,
  pendingApprovalCraneRequestsQueryOptions,
  useApproveCraneRequest,
  type CraneRequest,
} from '@/api/general/craneRequests';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import {
  confirm,
  DataTable,
  FaIcon,
  notify,
  PageHeader,
  useUrlFilters,
  type DataTableColumn,
  type RowAction,
} from '@/ui';
import {
  craneTypeColumn,
  createdAtColumn,
  departmentColumn,
  durationColumn,
  estimatedCostColumn,
  jobNoColumn,
  neededDateColumn,
  priorityColumn,
  requestNumberColumn,
  requestorColumn,
  statusColumn,
} from '../columns';
import { formatDurationSummary, formatMoney } from '../crane';
import { CraneRequestDetailModal } from '../CraneRequestDetailModal';
import { RejectCraneRequestModal } from './RejectCraneRequestModal';

const URL_DEFAULTS = { request: '' };
const EMPTY_ROWS: CraneRequest[] = [];

const SHARED_COLUMNS: DataTableColumn<CraneRequest>[] = [
  requestNumberColumn,
  requestorColumn,
  departmentColumn,
  craneTypeColumn,
  jobNoColumn,
  durationColumn,
  neededDateColumn(false),
  estimatedCostColumn,
  priorityColumn,
  statusColumn,
];
const APPROVED_COLUMNS = [...SHARED_COLUMNS, createdAtColumn];

// Legacy loadApprovedRequests: one 100-row page, filtered here.
const APPROVED_SOURCE_PARAMS = { page_size: 100 };

/** Port of general/crane-requests/pending (pending.js): Onay Bekleyen Vinç Talepleri. */
export function CraneRequestsPendingPage() {
  const { user } = useAuth();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);

  const pending = useQuery(pendingApprovalCraneRequestsQueryOptions());
  const pendingRows = pending.data?.results ?? EMPTY_ROWS;

  // Requests I approved: approved/completed ones where I am the approver.
  const approvedSource = useQuery(craneRequestsQueryOptions(APPROVED_SOURCE_PARAMS));
  const approvedRows = useMemo(
    () =>
      (approvedSource.data?.results ?? EMPTY_ROWS).filter(
        (r) => r.approved_by === user.id && ['approved', 'completed'].includes(String(r.status)),
      ),
    [approvedSource.data, user.id],
  );

  useEffect(() => {
    if (pending.isError) console.error('Error loading pending crane requests:', pending.error);
  }, [pending.isError, pending.error]);
  useEffect(() => {
    if (approvedSource.isError)
      console.error('Error loading approved crane requests:', approvedSource.error);
  }, [approvedSource.isError, approvedSource.error]);

  // ---- details (?request=<id>, from notification links) ----
  const requestId = values.request;
  const detail = useQuery({ ...craneRequestQueryOptions(requestId), enabled: Boolean(requestId) });
  const closeDetail = () => apply({ request: '' });
  useEffect(() => {
    if (!requestId || !detail.isError) return;
    notify.error(`Talep detayları yüklenirken hata oluştu: ${craneErrorText(detail.error)}`);
    apply({ request: '' });
  }, [requestId, detail.isError, detail.error, apply]);

  // ---- approve / reject ----
  const approve = useApproveCraneRequest();
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  const approveRequest = async (row: CraneRequest) => {
    // Legacy hides the details modal before asking.
    closeDetail();
    const ok = await confirm({
      title: 'Vinç Talebi Onayı',
      icon: 'fas fa-check-circle',
      message: 'Bu vinç talebini onaylamak istediğinizden emin misiniz?',
      details: (
        <SimpleGrid cols={2} spacing={6} verticalSpacing={6} fz="sm">
          <div>
            <strong>Talep No:</strong> {row.request_number}
          </div>
          <div>
            <strong>Talep Eden:</strong> {row.requestor_full_name || row.requestor_username || '-'}
          </div>
          <div>
            <strong>Ekipman:</strong> {row.crane_type_name || '-'}
          </div>
          <div>
            <strong>İş Emri:</strong> {row.job_no || '-'}
          </div>
          <div>
            <strong>Süre:</strong> {formatDurationSummary(row)}
          </div>
          <div>
            <strong>İhtiyaç Tarihi:</strong> {formatDate(row.needed_date)}
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <strong>Tahmini Maliyet:</strong>{' '}
            <Text span fw={700} c="blue.8" fz="sm">
              {formatMoney(row.estimated_cost, row.estimated_cost_currency)}
            </Text>{' '}
            <Text span c="dimmed" fz="sm">
              (KDV hariç)
            </Text>
          </div>
        </SimpleGrid>
      ),
      confirmLabel: 'Evet, Onayla',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      await approve.mutateAsync({ id: row.id });
      notify.success('Vinç talebi onaylandı');
    } catch (error) {
      notify.error(`Talep onaylanırken hata oluştu: ${craneErrorText(error)}`);
    }
  };

  const view = (row: CraneRequest) => apply({ request: String(row.id) });

  const pendingActions = (row: CraneRequest): RowAction<CraneRequest>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: view,
    },
    {
      key: 'approve',
      label: 'Onayla',
      icon: 'fas fa-check',
      color: 'success',
      hidden: row.status !== 'submitted',
      onClick: (r) => void approveRequest(r),
    },
    {
      key: 'reject',
      label: 'Reddet',
      icon: 'fas fa-times',
      color: 'danger',
      hidden: row.status !== 'submitted',
      onClick: (r) => setRejectingId(r.id),
    },
  ];
  const approvedActions = (): RowAction<CraneRequest>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: view,
    },
  ];

  const request = detail.data ?? null;
  const figure = (loading: boolean, value: number) =>
    loading ? '–' : value.toLocaleString('tr-TR');

  return (
    <>
      <PageHeader
        title="Onay Bekleyen Vinç Talepleri"
        subtitle="Onayınızı bekleyen vinç/platform taleplerinin yönetimi"
        icon="fas fa-truck-pickup"
        backTo="/general/crane-requests"
        stats={[
          {
            id: 'crane-pending-count',
            label: 'Onay Bekleyen',
            value: figure(pending.isPending, pending.data?.count ?? 0),
          },
          {
            id: 'crane-approved-count',
            label: 'Onayladığım',
            value: figure(approvedSource.isPending, approvedRows.length),
          },
        ]}
      />

      <DataTable
        title="Onay Bekleyen Vinç Talepleri"
        icon="fas fa-clock"
        data={pendingRows}
        columns={SHARED_COLUMNS}
        getRowId={(row) => String(row.id)}
        loading={pending.isFetching}
        pagination={{ pageSize: 20 }}
        rowActions={pendingActions}
        emptyMessage="Onay bekleyen vinç talebi bulunamadı."
        onRefresh={() => void pending.refetch()}
      />

      <DataTable
        title="Onayladığım Vinç Talepleri"
        icon="fas fa-check-circle"
        data={approvedRows}
        columns={APPROVED_COLUMNS}
        getRowId={(row) => String(row.id)}
        loading={approvedSource.isFetching}
        pagination={{ pageSize: 20 }}
        rowActions={approvedActions}
        emptyMessage="Onayladığınız vinç talebi bulunamadı."
        onRefresh={() => void approvedSource.refetch()}
      />

      {requestId ? (
        <CraneRequestDetailModal
          variant="pending"
          request={request}
          loading={detail.isPending}
          onClose={closeDetail}
          footerActions={
            request?.status === 'submitted' ? (
              <>
                <Button
                  color="red"
                  miw={120}
                  leftSection={<FaIcon icon="fas fa-times" />}
                  onClick={() => setRejectingId(request.id)}
                >
                  Reddet
                </Button>
                <Button
                  color="green"
                  miw={120}
                  leftSection={<FaIcon icon="fas fa-check" />}
                  onClick={() => void approveRequest(request)}
                >
                  Onayla
                </Button>
              </>
            ) : null
          }
        />
      ) : null}

      {rejectingId !== null ? (
        <RejectCraneRequestModal
          requestId={rejectingId}
          onClose={() => setRejectingId(null)}
          onRejected={closeDetail}
        />
      ) : null}
    </>
  );
}
