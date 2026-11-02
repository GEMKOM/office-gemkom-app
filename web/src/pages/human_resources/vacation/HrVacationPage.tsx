import { Group, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LEAVE_TYPES, leaveTypeLabel } from '@/api/general/vacation';
import {
  approvedVacationRequestsQueryOptions,
  hrVacationKeys,
  patchVacationBalance,
  useHrVacationDecision,
  vacationApprovalsInboxQueryOptions,
  vacationBalancesQueryOptions,
  type ApprovedVacationParams,
  type HrVacationRequest,
  type VacationBalance,
  type VacationBalancesParams,
} from '@/api/human_resources/leave';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type CellEdit,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { HrVacationDetailModal, LeaveLedgerModal, RejectVacationModal } from './VacationModals';
import { formatVacationDate, InboxStatusBadge, RequestStatusBadge } from './vacationParts';

const EMPTY_BALANCES: VacationBalance[] = [];
const EMPTY_REQUESTS: HrVacationRequest[] = [];
const TOTAL_DAYS_MESSAGE = 'Toplam gün 0 veya daha büyük olmalıdır.';

// ---- columns ----

const balanceColumns: DataTableColumn<VacationBalance>[] = [
  { key: 'id', header: 'ID', render: (row) => String(row.id || '-') },
  { key: 'user_full_name', header: 'Çalışan', render: (row) => row.user_full_name || '-' },
  { key: 'year', header: 'Yıl', render: (row) => String(row.year || '-') },
  {
    key: 'leave_type',
    header: 'İzin Türü',
    accessor: (row) => leaveTypeLabel(row),
    render: (row) => leaveTypeLabel(row),
  },
  {
    key: 'total_days',
    header: 'Toplam Gün',
    accessor: (row) => Number(row.total_days ?? 0),
    render: (row) =>
      row.total_days === null || row.total_days === undefined ? '-' : String(row.total_days),
    // Legacy editableColumns: ['total_days'].
    editable: {
      type: 'number',
      min: 0,
      value: (row) => row.total_days,
      // Legacy saved an emptied cell as 0; an empty value is refused instead.
      validate: (value) =>
        typeof value !== 'number' || !Number.isFinite(value) || value < 0
          ? TOTAL_DAYS_MESSAGE
          : null,
      apply: (row, value) => ({ ...row, total_days: value }),
    },
  },
  {
    key: 'used_days',
    header: 'Kullanılan',
    accessor: (row) => Number(row.used_days ?? 0),
    render: (row) => String(row.used_days || '0'),
  },
  {
    key: 'remaining_days',
    header: 'Kalan',
    accessor: (row) => Number(row.remaining_days ?? 0),
    render: (row) => <strong>{String(row.remaining_days || '0')}</strong>,
  },
];

const requestIdColumn: DataTableColumn<HrVacationRequest> = {
  key: 'id',
  header: 'Talep No',
  render: (row) => <strong>#{row.id || '-'}</strong>,
};
const leaveTypeColumn: DataTableColumn<HrVacationRequest> = {
  key: 'leave_type',
  header: 'İzin Türü',
  accessor: (row) => leaveTypeLabel(row),
  render: (row) => leaveTypeLabel(row),
};
const startColumn: DataTableColumn<HrVacationRequest> = {
  key: 'start_date',
  header: 'Başlangıç',
  render: (row) => formatVacationDate(row.start_date, row.start_time),
};
const endColumn: DataTableColumn<HrVacationRequest> = {
  key: 'end_date',
  header: 'Bitiş',
  render: (row) => formatVacationDate(row.end_date, row.end_time),
};
const durationColumn: DataTableColumn<HrVacationRequest> = {
  key: 'duration_days',
  header: 'Süre',
  accessor: (row) => Number(row.duration_days) || 0,
  render: (row) => `${row.duration_days || 0} gün`,
};

const inboxColumns: DataTableColumn<HrVacationRequest>[] = [
  requestIdColumn,
  {
    key: 'requester_username',
    header: 'Talep Eden',
    render: (row) => row.requester_username || '-',
  },
  leaveTypeColumn,
  startColumn,
  endColumn,
  durationColumn,
  {
    key: 'cancellation_reason',
    header: 'İptal Gerekçesi',
    sortable: false,
    render: (row) => (row.kind === 'cancellation_request' ? row.cancellation_reason || '-' : '-'),
  },
  { key: 'status', header: 'Durum', render: (row) => <InboxStatusBadge row={row} /> },
];

const approvedColumns: DataTableColumn<HrVacationRequest>[] = [
  requestIdColumn,
  {
    key: 'requester_full_name',
    header: 'Çalışan',
    render: (row) => row.requester_full_name || row.requester_username || '-',
  },
  { key: 'team_label', header: 'Takım', render: (row) => row.team_label || row.team || '-' },
  leaveTypeColumn,
  startColumn,
  endColumn,
  durationColumn,
  { key: 'status', header: 'Durum', render: (row) => <RequestStatusBadge request={row} /> },
];

// ---- filters ----

type BalanceKeys = 'user_id' | 'year';
const balanceFilterConfig: FilterConfig<BalanceKeys>[] = [
  {
    type: 'text',
    key: 'user_id',
    label: 'Kullanıcı ID (opsiyonel)',
    placeholder: 'Kullanıcı ID (örn: 5)',
    inputType: 'number',
  },
  { type: 'text', key: 'year', label: 'Yıl', inputType: 'number' },
];

type ApprovedKeys = 'search' | 'leave_type' | 'start_date_from' | 'start_date_to';
type ApprovedFilters = Record<ApprovedKeys, string>;
const approvedFilterConfig: FilterConfig<ApprovedKeys>[] = [
  {
    type: 'text',
    key: 'search',
    label: 'Çalışan (ad / kullanıcı adı)',
    placeholder: 'Çalışan (örn: Ahmet)',
  },
  {
    type: 'select',
    key: 'leave_type',
    label: 'İzin Türü',
    placeholder: 'Tümü',
    searchable: false,
    options: LEAVE_TYPES.map(({ value, label }) => ({ value, label })),
  },
  { type: 'date', key: 'start_date_from', label: 'Başlangıç (min)' },
  { type: 'date', key: 'start_date_to', label: 'Başlangıç (max)' },
];
const EMPTY_APPROVED: ApprovedFilters = {
  search: '',
  leave_type: '',
  start_date_from: '',
  start_date_to: '',
};

function positiveInt(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Legacy getLeaveLedgerUserIdFromRow. */
function ledgerUserId(row: VacationBalance): number | null {
  const user = row.user;
  const raw =
    row.user_id ??
    (user && typeof user === 'object' ? user.id : user) ??
    row.user_pk ??
    row.employee_id ??
    row.employee_user_id ??
    row.staff_id;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** A table title next to its filter pills (the filters slot takes the title's place). */
function TitledFilters({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Group gap="md" wrap="wrap" align="center">
      <Text component="h2" fw={600} size="md" m={0} style={{ whiteSpace: 'nowrap' }}>
        <FaIcon icon={icon} style={{ marginRight: 8 }} />
        {title}
      </Text>
      {children}
    </Group>
  );
}

/** Port of human_resources/vacation (vacation.js): balances, approvals inbox, approved leaves. */
export function HrVacationPage() {
  const queryClient = useQueryClient();

  // ---- balances ----
  const [currentYear] = useState(() => String(new Date().getFullYear()));
  const balanceUrl = useUrlFilters<Record<BalanceKeys, string>>({
    user_id: '',
    year: currentYear,
  });
  const balanceValues = balanceUrl.values;
  const [balanceClears, setBalanceClears] = useState(0);
  const balanceParams = useMemo<VacationBalancesParams>(() => {
    const params: VacationBalancesParams = {};
    const userId = positiveInt(balanceValues.user_id);
    const year = positiveInt(balanceValues.year);
    if (userId) params.user_id = userId;
    if (year) params.year = year;
    return params;
  }, [balanceValues.user_id, balanceValues.year]);
  const balances = useQuery(vacationBalancesQueryOptions(balanceParams));
  const balanceRows = balances.data ?? EMPTY_BALANCES;

  useEffect(() => {
    if (balances.isError)
      notify.error(balances.error, { fallback: 'İzin bakiyeleri yüklenemedi.' });
  }, [balances.isError, balances.error, balances.errorUpdatedAt]);

  const saveTotalDays = async ({ row, value }: CellEdit<VacationBalance>) => {
    const next = Number(value);
    const total = next.toFixed(1);
    const updated = await patchVacationBalance(row.id, { total_days: total });
    queryClient.setQueryData<VacationBalance[]>(hrVacationKeys.balances(balanceParams), (old) =>
      old?.map((item) =>
        item.id === row.id
          ? {
              ...item,
              total_days: updated?.total_days ?? total,
              used_days: updated?.used_days ?? item.used_days,
              remaining_days: updated?.remaining_days ?? item.remaining_days,
            }
          : item,
      ),
    );
    notify.success('İzin bakiyesi güncellendi.');
  };

  const [ledgerUser, setLedgerUser] = useState<number | null>(null);
  const openLedger = (row: VacationBalance) => {
    const userId = ledgerUserId(row) ?? positiveInt(balanceValues.user_id);
    if (!userId) {
      notify.warning(
        'Kullanıcı ID bulunamadı. Lütfen üstteki filtreye kullanıcı ID girip tekrar deneyin.',
      );
      return;
    }
    setLedgerUser(userId);
  };

  // ---- approvals inbox ----
  const inbox = useQuery(vacationApprovalsInboxQueryOptions());
  const inboxRows = inbox.data?.results ?? EMPTY_REQUESTS;

  useEffect(() => {
    if (inbox.isError) notify.error(inbox.error, { fallback: 'Bekleyen talepler yüklenemedi.' });
  }, [inbox.isError, inbox.error, inbox.errorUpdatedAt]);

  // ---- approved requests ----
  const approvedUrl = useUrlFilters({ ...EMPTY_APPROVED, page: '1', page_size: '20' });
  const approvedValues = approvedUrl.values;
  const applyApproved = approvedUrl.apply;
  const [approvedClears, setApprovedClears] = useState(0);
  const approvedFilters = useMemo<ApprovedFilters>(
    () => ({
      search: approvedValues.search,
      leave_type: approvedValues.leave_type,
      start_date_from: approvedValues.start_date_from,
      start_date_to: approvedValues.start_date_to,
    }),
    [
      approvedValues.search,
      approvedValues.leave_type,
      approvedValues.start_date_from,
      approvedValues.start_date_to,
    ],
  );
  const page = positiveInt(approvedValues.page) ?? 1;
  const pageSize = positiveInt(approvedValues.page_size) ?? 20;
  const approvedParams: ApprovedVacationParams = {
    search: approvedFilters.search.trim(),
    leave_type: approvedFilters.leave_type,
    start_date_from: approvedFilters.start_date_from,
    start_date_to: approvedFilters.start_date_to,
    page,
    page_size: pageSize,
  };
  const approved = useQuery(approvedVacationRequestsQueryOptions(approvedParams));
  const approvedRows = approved.data?.results ?? EMPTY_REQUESTS;

  useEffect(() => {
    if (approved.isError)
      notify.error(approved.error, { fallback: 'Onaylanmış izinler yüklenemedi.' });
  }, [approved.isError, approved.error, approved.errorUpdatedAt]);

  // ---- decisions ----
  const [detailRow, setDetailRow] = useState<HrVacationRequest | null>(null);
  const closeDetail = useCallback(() => setDetailRow(null), []);
  const [rejecting, setRejecting] = useState<HrVacationRequest | null>(null);
  // Legacy reloaded the approved list from page 1 after a decision.
  const afterDecision = () => applyApproved({ page: '1' });

  const decide = useHrVacationDecision();
  const approve = async (request: HrVacationRequest) => {
    const isCancellation = request.kind === 'cancellation_request';
    const ok = await confirm({
      title: 'İzin Talebi Onayı',
      icon: 'fas fa-check-circle',
      message: isCancellation
        ? `#${request.id} numaralı izin iptal talebi onaylansın mı?`
        : `#${request.id} numaralı izin talebi onaylansın mı?`,
      details: (
        <Text size="sm" c="dimmed" component="div">
          <div>Tip: {isCancellation ? 'İptal Talebi' : 'Onay Süreci'}</div>
          <div>Talep Eden: {request.requester_username || '-'}</div>
          <div>
            Tarih: {formatVacationDate(request.start_date, request.start_time)} -{' '}
            {formatVacationDate(request.end_date, request.end_time)}
          </div>
          {isCancellation && request.cancellation_reason ? (
            <div>İptal Gerekçesi: {request.cancellation_reason}</div>
          ) : null}
        </Text>
      ),
      confirmLabel: 'Evet, Onayla',
      cancelLabel: 'İptal',
    });
    if (!ok) return;
    try {
      await decide.mutateAsync({
        id: request.id,
        kind: request.kind || 'workflow_approval',
        decision: 'approve',
      });
      notify.success(isCancellation ? 'İptal talebi onaylandı.' : 'İzin talebi onaylandı.');
      afterDecision();
    } catch (error) {
      notify.error(error, { fallback: 'Onaylama işlemi başarısız.' });
    }
  };

  const detailAction = (row: HrVacationRequest): RowAction<HrVacationRequest> => ({
    key: 'detail',
    label: 'Detay',
    icon: 'fas fa-eye',
    color: 'primary',
    onClick: () => setDetailRow(row),
  });

  const inboxActions = (row: HrVacationRequest): RowAction<HrVacationRequest>[] => {
    const workflow = row.kind === 'workflow_approval' && row.status === 'submitted';
    const cancellation = row.kind === 'cancellation_request';
    return [
      detailAction(row),
      {
        key: 'approve-workflow',
        label: 'Onayla',
        icon: 'fas fa-check',
        color: 'success',
        hidden: !workflow,
        onClick: (r) => void approve(r),
      },
      {
        key: 'reject-workflow',
        label: 'Reddet',
        icon: 'fas fa-times',
        color: 'danger',
        hidden: !workflow,
        onClick: (r) => setRejecting(r),
      },
      {
        key: 'approve-cancellation',
        label: 'İptali Onayla',
        icon: 'fas fa-check-double',
        color: 'success',
        hidden: !cancellation,
        onClick: (r) => void approve(r),
      },
      {
        key: 'reject-cancellation',
        label: 'İptali Reddet',
        icon: 'fas fa-ban',
        color: 'danger',
        hidden: !cancellation,
        onClick: (r) => setRejecting(r),
      },
    ];
  };

  const figure = (pending: boolean, value: number) =>
    pending ? '–' : value.toLocaleString('tr-TR');

  return (
    <>
      <PageHeader
        title="İzin Yönetimi"
        subtitle="İzin bakiyelerini düzenleyin ve onay süreçlerini yönetin"
        icon="fas fa-calendar-check"
        backTo="/human_resources"
        stats={[
          {
            id: 'balances-count',
            label: 'İzin Bakiyesi',
            value: figure(balances.isPending, balanceRows.length),
          },
          {
            id: 'inbox-count',
            label: 'Onay Kutusu',
            value: figure(inbox.isPending, inbox.data?.count ?? 0),
          },
          {
            id: 'approved-count',
            label: 'Onaylanmış İzin',
            value: figure(approved.isPending, approved.data?.count ?? 0),
          },
        ]}
      />

      <DataTable
        filters={
          <TitledFilters icon="fas fa-wallet" title="İzin Bakiyeleri">
            <FilterBar
              key={balanceClears}
              inline
              filters={balanceFilterConfig}
              values={balanceValues}
              onApply={balanceUrl.apply}
              onClear={() => {
                // Temizle: no user, the current year (legacy).
                balanceUrl.reset();
                setBalanceClears((n) => n + 1);
              }}
              extra={
                <Text size="xs" c="dimmed">
                  Toplam izin gününü tablo üzerinden düzenleyebilirsiniz.
                </Text>
              }
            />
          </TitledFilters>
        }
        data={balanceRows}
        columns={balanceColumns}
        getRowId={(row) => String(row.id)}
        loading={balances.isFetching}
        sortable
        onCellEdit={saveTotalDays}
        rowActions={(row) => [
          {
            key: 'leave-ledger',
            label: 'İzin Defteri',
            icon: 'fas fa-book',
            color: 'info',
            onClick: () => openLedger(row),
          },
        ]}
        emptyMessage="İzin bakiyesi bulunamadı."
        onRefresh={() => void balances.refetch()}
      />

      <DataTable
        title="Onay Kutusu"
        icon="fas fa-user-check"
        data={inboxRows}
        columns={inboxColumns}
        getRowId={(row) => String(row.id)}
        loading={inbox.isFetching}
        sortable
        rowActions={inboxActions}
        emptyMessage="Onay kutusunda kayıt bulunamadı."
        onRefresh={() => void inbox.refetch()}
      />

      <DataTable
        filters={
          <TitledFilters icon="fas fa-calendar-check" title="Onaylanmış İzinler">
            <FilterBar
              key={approvedClears}
              inline
              filters={approvedFilterConfig}
              values={approvedFilters}
              onApply={(next) => applyApproved({ ...next, page: '1' })}
              onClear={() => {
                applyApproved({ ...EMPTY_APPROVED, page: '1' });
                setApprovedClears((n) => n + 1);
              }}
            />
          </TitledFilters>
        }
        data={approvedRows}
        columns={approvedColumns}
        getRowId={(row) => String(row.id)}
        loading={approved.isFetching}
        pagination={{
          page,
          pageSize,
          total: approved.data?.count ?? 0,
          onPageChange: (next) => applyApproved({ page: String(next) }),
          onPageSizeChange: (size) => applyApproved({ page_size: String(size), page: '1' }),
        }}
        rowActions={(row) => [detailAction(row)]}
        emptyMessage="Onaylanmış izin bulunamadı."
        onRefresh={() => void approved.refetch()}
      />

      {detailRow ? (
        <HrVacationDetailModal key={detailRow.id} row={detailRow} onClose={closeDetail} />
      ) : null}

      {ledgerUser !== null ? (
        <LeaveLedgerModal
          key={ledgerUser}
          userId={ledgerUser}
          onClose={() => setLedgerUser(null)}
        />
      ) : null}

      {rejecting ? (
        <RejectVacationModal
          request={rejecting}
          onClose={() => setRejecting(null)}
          onDone={afterDecision}
        />
      ) : null}
    </>
  );
}
