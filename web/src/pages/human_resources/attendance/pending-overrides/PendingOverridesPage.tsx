import { Stack, Text, TextInput, Textarea } from '@mantine/core';
import { useEffect } from 'react';
import {
  useApproveOverride,
  usePendingOverrides,
  useRejectOverride,
  type AttendanceSession,
  type AttendanceStatus,
  type OverrideApprovePayload,
  type PendingOverrideRecord,
} from '@/api/human_resources/attendanceAdmin';
import {
  confirm,
  DataTable,
  notify,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
  type RowAction,
  type StatusFamily,
} from '@/ui';

const EMPTY_ROWS: PendingOverrideRecord[] = [];

const STATUS: Record<string, { color: StatusFamily; label: string }> = {
  pending_override: { color: 'yellow', label: 'İnsan Kaynakları Onayı Bekliyor (GİRİŞ)' },
  pending_checkout_override: { color: 'yellow', label: 'İnsan Kaynakları Onayı Bekliyor (ÇIKIŞ)' },
  override_rejected: { color: 'red', label: 'Reddedildi' },
  active: { color: 'blue', label: 'Aktif (Giriş Yapıldı)' },
  complete: { color: 'green', label: 'Tamamlandı (Çıkış Yapıldı)' },
  rejected: { color: 'red', label: 'Reddedildi' },
};

function statusOf(status: AttendanceStatus | undefined) {
  return (status && STATUS[status]) || { color: 'grey' as const, label: status || '-' };
}

const isPending = (status: AttendanceStatus | undefined) =>
  status === 'pending_override' || status === 'pending_checkout_override';

/** The session awaiting a decision, else the first one (legacy getPendingSession). */
export function pendingSession(row: PendingOverrideRecord): AttendanceSession | null {
  const sessions = row.sessions ?? [];
  return sessions.find((s) => isPending(s.status)) ?? sessions[0] ?? null;
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('tr-TR');
}

const columns: DataTableColumn<PendingOverrideRecord>[] = [
  {
    key: 'user_display',
    header: 'Kullanıcı',
    render: (row) => <strong>{row.user_display || '-'}</strong>,
  },
  {
    key: 'check_in_at',
    header: 'Giriş',
    render: (row) => fmtDateTime(pendingSession(row)?.check_in_time),
    exportValue: (row) => fmtDateTime(pendingSession(row)?.check_in_time),
  },
  {
    key: 'check_out_at',
    header: 'Çıkış',
    render: (row) => fmtDateTime(pendingSession(row)?.check_out_time),
    exportValue: (row) => fmtDateTime(pendingSession(row)?.check_out_time),
  },
  {
    key: 'override_reason',
    header: 'Açıklama',
    render: (row) => {
      const reason = pendingSession(row)?.override_reason || '';
      return reason ? <span title={reason}>{reason}</span> : '-';
    },
  },
  {
    key: 'status',
    header: 'Durum',
    render: (row) => {
      const s = statusOf(row.status);
      return <StatusBadge color={s.color}>{s.label}</StatusBadge>;
    },
    exportValue: (row) => statusOf(row.status).label,
  },
];

/** Port of human_resources/attendance/pending-overrides (pending-overrides.js). */
export function PendingOverridesPage() {
  const list = usePendingOverrides();
  const rows = list.data ?? EMPTY_ROWS;
  const approve = useApproveOverride();
  const reject = useRejectOverride();

  useEffect(() => {
    if (list.isError) {
      notify.error(`Bekleyen talepler yüklenemedi: ${list.error?.message || list.error}`);
    }
  }, [list.isError, list.error, list.errorUpdatedAt]);

  const confirmApprove = async (row: PendingOverrideRecord) => {
    const s = pendingSession(row);
    if (!s) return;
    const isCheckIn = s.status === 'pending_override';
    const isCheckOut = s.status === 'pending_checkout_override';
    // The confirm dialog renders outside this component; the input reports here.
    let raw = '';
    const ok = await confirm({
      title: 'Onayla',
      icon: 'fas fa-check',
      message: isCheckOut
        ? 'Bu çıkış düzeltme talebini onaylamak istiyor musunuz?'
        : 'Bu giriş düzeltme talebini onaylamak istiyor musunuz?',
      description: (row.user_display || '').trim() || undefined,
      details: (
        <Stack gap={4}>
          <TextInput
            type="datetime-local"
            label={isCheckIn ? 'Giriş saati (opsiyonel)' : 'Çıkış saati (opsiyonel)'}
            onChange={(event) => {
              raw = event.currentTarget.value;
            }}
          />
          <Text size="xs" c="dimmed">
            {isCheckIn
              ? 'Dilerseniz giriş saatini düzeltebilirsiniz. Boş bırakırsanız mevcut saat kullanılır.'
              : 'Dilerseniz çıkış saatini seçebilirsiniz. Boş bırakırsanız sistem şu anı kullanabilir.'}
          </Text>
        </Stack>
      ),
      confirmLabel: 'Onayla',
    });
    if (!ok) return;
    const value = raw.trim();
    const payload: OverrideApprovePayload = {};
    if (value) {
      if (isCheckIn) payload.check_in_time = value;
      if (isCheckOut) payload.check_out_time = value;
    }
    try {
      await approve.mutateAsync({ sessionId: s.id, payload });
      notify.success('Talep onaylandı');
    } catch (error) {
      notify.error(`Onaylama başarısız: ${(error as Error)?.message || String(error)}`);
    }
  };

  const confirmReject = async (row: PendingOverrideRecord) => {
    const s = pendingSession(row);
    if (!s) return;
    let notes = '';
    const ok = await confirm({
      title: 'Reddet',
      icon: 'fas fa-times',
      message:
        s.status === 'pending_checkout_override'
          ? 'Bu çıkış düzeltme talebini reddetmek istiyor musunuz?'
          : 'Bu giriş düzeltme talebini reddetmek istiyor musunuz?',
      description: (row.user_display || '').trim() || undefined,
      details: (
        <Textarea
          label="Reddetme notu (opsiyonel)"
          placeholder="Reddetme nedeni..."
          rows={3}
          data-autofocus
          onChange={(event) => {
            notes = event.currentTarget.value;
          }}
        />
      ),
      confirmLabel: 'Reddet',
      danger: true,
    });
    if (!ok) return;
    try {
      await reject.mutateAsync({ sessionId: s.id, notes: notes.trim() });
      notify.success('Talep reddedildi');
    } catch (error) {
      notify.error(`Reddetme başarısız: ${(error as Error)?.message || String(error)}`);
    }
  };

  const rowActions = (row: PendingOverrideRecord): RowAction<PendingOverrideRecord>[] => [
    {
      key: 'approve',
      label: 'Onayla',
      icon: 'fas fa-check',
      color: 'success',
      hidden: !isPending(row.status),
      onClick: (r) => void confirmApprove(r),
    },
    {
      key: 'reject',
      label: 'Reddet',
      icon: 'fas fa-times',
      color: 'danger',
      hidden: !isPending(row.status),
      onClick: (r) => void confirmReject(r),
    },
  ];

  return (
    <>
      <PageHeader
        title="PDKS Onayları"
        subtitle="Ofis dışı giriş taleplerini onaylayın veya reddedin"
        backTo="/human_resources/attendance"
        stats={[
          {
            id: 'pending-overrides-count',
            label: 'Bekleyen',
            value: list.isPending ? '–' : rows.length,
          },
        ]}
      />

      <DataTable
        title="Bekleyen Talepler"
        icon="fas fa-user-clock"
        data={rows}
        columns={columns}
        getRowId={(row) => String(row.id)}
        loading={list.isFetching}
        rowActions={rowActions}
        emptyMessage="Bekleyen talep bulunamadı"
        onRefresh={() => void list.refetch()}
      />
    </>
  );
}
