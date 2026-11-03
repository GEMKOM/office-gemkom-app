import { Text, Textarea } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import {
  leaveDurationLabel,
  leaveHours,
  leaveTypeLabel,
  pendingVacationApprovalsQueryOptions,
  useDecideVacationRequest,
  vacationDecisionsByMeQueryOptions,
  type VacationRequest,
} from '@/api/general/vacation';
import { formatDate } from '@/lib/format';
import {
  confirm,
  DataTable,
  FormModal,
  notify,
  PageHeader,
  type DataTableColumn,
  type RowAction,
} from '@/ui';
import {
  ApprovalSummary,
  VacationRequestDetailModal,
  VacationStatusBadge,
  formatClock,
  statusText,
} from '../shared/vacationParts';

const EMPTY_ROWS: VacationRequest[] = [];

const withClock = (date: string | undefined, time: string | null | undefined) =>
  time ? `${formatDate(date)} ${formatClock(time)}` : formatDate(date);

const idColumn: DataTableColumn<VacationRequest> = {
  key: 'id',
  header: 'Talep No',
  accessor: 'id',
  render: (row) => <strong>#{row.id || '-'}</strong>,
};
const requesterColumn: DataTableColumn<VacationRequest> = {
  key: 'requester_username',
  header: 'Talep Eden',
  render: (row) => row.requester_username || '-',
};
const leaveTypeColumn: DataTableColumn<VacationRequest> = {
  key: 'leave_type',
  header: 'İzin Türü',
  accessor: (row) => leaveTypeLabel(row),
  render: (row) => leaveTypeLabel(row),
};
const startColumn: DataTableColumn<VacationRequest> = {
  key: 'start_date',
  header: 'Başlangıç',
  render: (row) => withClock(row.start_date, row.start_time),
};
const endColumn: DataTableColumn<VacationRequest> = {
  key: 'end_date',
  header: 'Bitiş',
  render: (row) => withClock(row.end_date, row.end_time),
};
const statusColumn = (header: string): DataTableColumn<VacationRequest> => ({
  key: 'status',
  header,
  accessor: (row) => statusText(row),
  render: (row) => <VacationStatusBadge request={row} />,
});

// Both tables sort the loaded rows, as legacy did.
const pendingColumns: DataTableColumn<VacationRequest>[] = [
  idColumn,
  requesterColumn,
  leaveTypeColumn,
  startColumn,
  endColumn,
  {
    key: 'duration_days',
    header: 'Süre',
    accessor: (row) => leaveHours(row) ?? (Number(row.duration_days) || 0) * 8,
    render: (row) => leaveDurationLabel(row),
  },
  {
    key: 'approval',
    header: 'Onay',
    sortable: false,
    render: (row) => <ApprovalSummary request={row} />,
  },
  statusColumn('Durum'),
];

const decisionColumns: DataTableColumn<VacationRequest>[] = [
  idColumn,
  requesterColumn,
  leaveTypeColumn,
  startColumn,
  endColumn,
  statusColumn('Son Durum'),
];

function RejectModal({ request, onClose }: { request: VacationRequest; onClose: () => void }) {
  const [comment, setComment] = useState('');
  const decide = useDecideVacationRequest();

  const reject = async () => {
    try {
      await decide.mutateAsync({ id: request.id, decision: 'reject', comment: comment.trim() });
      notify.success('İzin talebi reddedildi.');
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'Reddetme işlemi başarısız.' });
    }
  };

  return (
    <FormModal
      opened
      onClose={onClose}
      title="İzin Talebini Reddet"
      subtitle={`#${request.id} · ${request.requester_username || '-'}`}
      icon="fas fa-times-circle"
      size="md"
      submitLabel="Reddet"
      submitIcon="fas fa-times"
      submitting={decide.isPending}
      onSubmit={() => void reject()}
    >
      <Textarea
        label="Yorum (opsiyonel)"
        placeholder="Reddetme sebebi..."
        rows={4}
        maxLength={500}
        value={comment}
        onChange={(event) => setComment(event.currentTarget.value)}
        data-autofocus
      />
    </FormModal>
  );
}

/** Port of general/vacation/pending (pending.js). */
export function VacationPendingPage() {
  const pending = useQuery(pendingVacationApprovalsQueryOptions());
  const decisions = useQuery(vacationDecisionsByMeQueryOptions());
  const pendingRows = pending.data?.results ?? EMPTY_ROWS;
  const decisionRows = decisions.data?.results ?? EMPTY_ROWS;

  useEffect(() => {
    if (pending.isError)
      notify.error(pending.error, { fallback: 'Bekleyen talepler yüklenemedi.' });
  }, [pending.isError, pending.error, pending.errorUpdatedAt]);
  useEffect(() => {
    if (decisions.isError)
      notify.error(decisions.error, { fallback: 'Karar geçmişi yüklenemedi.' });
  }, [decisions.isError, decisions.error, decisions.errorUpdatedAt]);

  const [detailId, setDetailId] = useState<number | null>(null);
  const closeDetail = useCallback(() => setDetailId(null), []);
  const [rejecting, setRejecting] = useState<VacationRequest | null>(null);

  const decide = useDecideVacationRequest();
  const approve = async (request: VacationRequest) => {
    const ok = await confirm({
      title: 'İzin Talebi Onayı',
      icon: 'fas fa-check-circle',
      message: `#${request.id} numaralı izin talebi onaylansın mı?`,
      details: (
        <Text size="sm" c="dimmed" component="div">
          <div>Talep Eden: {request.requester_username || '-'}</div>
          <div>
            Tarih: {formatDate(request.start_date)} - {formatDate(request.end_date)}
          </div>
        </Text>
      ),
      confirmLabel: 'Evet, Onayla',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      await decide.mutateAsync({ id: request.id, decision: 'approve' });
      notify.success('İzin talebi onaylandı.');
    } catch (error) {
      notify.error(error, { fallback: 'Onaylama başarısız.' });
    }
  };

  const detailAction = (row: VacationRequest): RowAction<VacationRequest> => ({
    key: 'detail',
    label: 'Detay',
    icon: 'fas fa-eye',
    color: 'primary',
    onClick: () => setDetailId(row.id),
  });

  const pendingActions = (row: VacationRequest): RowAction<VacationRequest>[] => [
    detailAction(row),
    {
      key: 'approve',
      label: 'Onayla',
      icon: 'fas fa-check',
      color: 'success',
      hidden: row.status !== 'submitted',
      onClick: (r) => void approve(r),
    },
    {
      key: 'reject',
      label: 'Reddet',
      icon: 'fas fa-times',
      color: 'danger',
      hidden: row.status !== 'submitted',
      onClick: (r) => setRejecting(r),
    },
  ];

  const figure = (query: typeof pending) =>
    query.isPending ? '–' : (query.data?.count ?? 0).toLocaleString('tr-TR');

  return (
    <>
      <PageHeader
        title="Bekleyen İzin Onayları"
        subtitle="Onayınızda olan izin taleplerini inceleyin ve karar verin"
        backTo="/general/vacation"
        stats={[
          { id: 'pending-count', label: 'Onayımı Bekleyen', value: figure(pending) },
          { id: 'decided-count', label: 'Karar Verdiğim', value: figure(decisions) },
        ]}
      />

      <DataTable
        title="Onayımı Bekleyen Talepler"
        icon="fas fa-clock"
        data={pendingRows}
        columns={pendingColumns}
        getRowId={(row) => String(row.id)}
        loading={pending.isFetching}
        sortable
        rowActions={pendingActions}
        emptyMessage="Bekleyen izin talebi bulunamadı."
        onRefresh={() => void pending.refetch()}
      />

      <DataTable
        title="Karar Verdiğim Talepler"
        icon="fas fa-history"
        data={decisionRows}
        columns={decisionColumns}
        getRowId={(row) => String(row.id)}
        loading={decisions.isFetching}
        sortable
        rowActions={(row) => [detailAction(row)]}
        emptyMessage="Karar geçmişi bulunamadı."
        onRefresh={() => void decisions.refetch()}
      />

      {detailId !== null ? (
        <VacationRequestDetailModal
          key={detailId}
          requestId={detailId}
          variant="approver"
          onClose={closeDetail}
        />
      ) : null}

      {rejecting ? <RejectModal request={rejecting} onClose={() => setRejecting(null)} /> : null}
    </>
  );
}
