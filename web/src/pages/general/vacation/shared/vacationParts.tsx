import { Box, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  leaveTypeLabel,
  vacationRequestQueryOptions,
  type VacationRequest,
} from '@/api/general/vacation';
import { formatDate } from '@/lib/format';
import {
  DetailModal,
  FaIcon,
  notify,
  StatusBadge,
  type DetailField,
  type StatusFamily,
} from '@/ui';

// Pieces both vacation pages (requests.js, pending.js) had as copies.

function statusFamily(status: string | undefined): StatusFamily {
  if (status === 'approved') return 'green';
  if (status === 'submitted') return 'yellow';
  if (status === 'rejected' || status === 'cancelled') return 'red';
  return 'grey';
}

export function statusText(request: Pick<VacationRequest, 'status' | 'status_label'>): string {
  return request.status_label || request.status || '-';
}

export function VacationStatusBadge({
  request,
}: {
  request: Pick<VacationRequest, 'status' | 'status_label'>;
}) {
  return <StatusBadge color={statusFamily(request.status)}>{statusText(request)}</StatusBadge>;
}

/** "08:30" from "08:30:00". */
export function formatClock(value: string | null | undefined): string {
  if (!value) return '-';
  const match = /^(\d{2}:\d{2})/.exec(String(value));
  return match ? match[1]! : String(value);
}

export const isCompensatoryLeave = (leaveType: string | undefined) =>
  leaveType === 'compensatory_leave';

/** The stage still waiting, and how many approvals it lacks; for submitted requests only. */
export function ApprovalSummary({ request }: { request: VacationRequest }) {
  const approval = request.approval;
  if (!approval || request.status !== 'submitted') {
    return (
      <Text span c="dimmed" size="sm">
        -
      </Text>
    );
  }
  const stages = Array.isArray(approval.stage_instances) ? approval.stage_instances : [];
  const current = stages.find((stage) => !stage?.is_complete && !stage?.is_rejected);
  if (!current) {
    return (
      <Text span c="green.8" size="sm">
        <FaIcon icon="fas fa-check-circle" style={{ marginRight: 4 }} />
        Tamamlandı
      </Text>
    );
  }
  const remaining = Math.max(
    0,
    Number(current.required_approvals || 0) - Number(current.approved_count || 0),
  );
  return (
    <Box style={{ lineHeight: 1.2 }}>
      <Text size="sm" fw={600}>
        {current.name || 'Onay'}
      </Text>
      <Text size="xs" c="dimmed">
        {remaining} onay bekleniyor
      </Text>
    </Box>
  );
}

function ApprovalFlow({ request }: { request: VacationRequest }) {
  const stages = Array.isArray(request.approval?.stage_instances)
    ? request.approval.stage_instances
    : [];
  return (
    <Stack gap="xs">
      <ApprovalSummary request={request} />
      {stages.length === 0 ? (
        <Text size="sm" c="dimmed">
          Onay kaydı bulunamadı.
        </Text>
      ) : (
        stages.map((stage, index) => (
          <Box
            key={index}
            p="xs"
            style={{ border: '1px solid var(--gk-line)', borderRadius: 'var(--gk-radius-sm)' }}
          >
            <Text size="sm" fw={600}>
              {stage.name || `Aşama ${stage.order ?? ''}`}
            </Text>
            <Text size="xs" c="dimmed" mb={4}>
              Durum:{' '}
              {stage.is_rejected ? 'Reddedildi' : stage.is_complete ? 'Tamamlandı' : 'Bekliyor'}
            </Text>
            {Array.isArray(stage.decisions) && stage.decisions.length ? (
              stage.decisions.map((decision, i) => (
                <Text key={i} size="sm">
                  -{' '}
                  {decision.approver_detail?.full_name ||
                    decision.approver_detail?.username ||
                    'Onaylayan'}
                  : {decision.decision === 'reject' ? 'Reddetti' : 'Onayladı'}
                  {decision.decided_at ? ` (${formatDate(decision.decided_at)})` : ''}
                  {decision.comment ? (
                    <>
                      <br />
                      <Text span c="dimmed" size="sm">
                        &quot;{decision.comment}&quot;
                      </Text>
                    </>
                  ) : null}
                </Text>
              ))
            ) : (
              <Text size="xs" c="dimmed">
                Henüz karar yok.
              </Text>
            )}
          </Box>
        ))
      )}
    </Stack>
  );
}

export interface VacationRequestDetailModalProps {
  requestId: number | string;
  onClose: () => void;
  /**
   * 'mine' (requests.js): Genel + time range + the full approval flow.
   * 'approver' (pending.js): Genel Bilgiler + the approval summary only.
   */
  variant: 'mine' | 'approver';
}

/** The "İzin Talebi Detayı" modal; loads the request itself. */
export function VacationRequestDetailModal({
  requestId,
  onClose,
  variant,
}: VacationRequestDetailModalProps) {
  const detail = useQuery(vacationRequestQueryOptions(requestId));

  useEffect(() => {
    if (!detail.isError) return;
    notify.error(detail.error, { fallback: 'Talep detayı yüklenemedi.' });
    onClose();
  }, [detail.isError, detail.error, onClose]);

  if (!detail.data) return null;
  const request = detail.data;
  const fields: DetailField[] = [
    { label: 'Talep No', value: String(request.id || '-'), span: 4 },
    { label: 'İzin Türü', value: leaveTypeLabel(request), span: 4 },
    { label: 'Durum', value: statusText(request), span: 4 },
    { label: 'Başlangıç', value: formatDate(request.start_date), span: 4 },
    { label: 'Bitiş', value: formatDate(request.end_date), span: 4 },
    { label: 'Süre', value: `${request.duration_days || '0'} gün`, span: 4 },
    {
      label: 'Saat Aralığı',
      value:
        request.start_time && request.end_time
          ? `${formatClock(request.start_time)} - ${formatClock(request.end_time)}`
          : '-',
      span: 4,
      hidden: variant !== 'mine',
    },
    { label: 'Gerekçe', value: request.reason || '-', span: 12 },
  ];

  return (
    <DetailModal
      opened
      onClose={onClose}
      title="İzin Talebi Detayı"
      icon="fas fa-calendar-alt"
      size="xl"
      sections={[
        {
          title: variant === 'mine' ? 'Genel' : 'Genel Bilgiler',
          icon: 'fas fa-info-circle',
          fields,
        },
        variant === 'mine'
          ? { title: 'Onay Akışı', content: <ApprovalFlow request={request} /> }
          : { title: 'Onay Özeti', content: <ApprovalSummary request={request} /> },
      ]}
    />
  );
}
