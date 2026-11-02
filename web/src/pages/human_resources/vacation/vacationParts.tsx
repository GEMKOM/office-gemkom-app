import { Box, Group, Stack, Text } from '@mantine/core';
import type { HrApprovalStage, HrVacationRequest } from '@/api/human_resources/leave';
import { formatDate, formatDateTime } from '@/lib/format';
import { StatusBadge, type StatusFamily } from '@/ui';

// Badges and the approval flow of human_resources/vacation (vacation.js).

function statusFamily(status: string | undefined): StatusFamily {
  if (status === 'approved') return 'green';
  if (status === 'submitted') return 'yellow';
  if (status === 'rejected' || status === 'cancelled') return 'red';
  return 'grey';
}

export function RequestStatusBadge({
  request,
}: {
  request: Pick<HrVacationRequest, 'status' | 'status_label'>;
}) {
  return (
    <StatusBadge color={statusFamily(request.status)}>
      {request.status_label || request.status || '-'}
    </StatusBadge>
  );
}

export function ApprovalKindBadge({ kind }: { kind: string | undefined }) {
  return kind === 'cancellation_request' ? (
    <StatusBadge color="red">İptal Talebi</StatusBadge>
  ) : (
    <StatusBadge color="yellow">Onay Süreci</StatusBadge>
  );
}

/** Inbox status: what HR decides on for open items, else the request status. */
export function InboxStatusBadge({ row }: { row: HrVacationRequest }) {
  if (row.kind === 'cancellation_request') return <ApprovalKindBadge kind={row.kind} />;
  if (row.kind === 'workflow_approval' && row.status === 'submitted')
    return <ApprovalKindBadge kind={row.kind} />;
  return <RequestStatusBadge request={row} />;
}

/** "08:30" from "08:30:00". */
export function formatClock(value: string | null | undefined): string {
  if (!value) return '-';
  const match = /^(\d{2}:\d{2})/.exec(String(value));
  return match ? match[1]! : String(value);
}

/** The day, plus the time for an hourly leave. */
export function formatVacationDate(
  date: string | null | undefined,
  time: string | null | undefined,
): string {
  if (!date) return '-';
  const day = formatDate(date);
  return time ? `${day} ${formatClock(time)}` : day;
}

/** Legacy resolveRequestKind. */
export function resolveRequestKind(request: HrVacationRequest, context: HrVacationRequest | null) {
  if (context?.kind) return context.kind;
  if (request.status === 'cancellation_requested') return 'cancellation_request';
  return 'workflow_approval';
}

function ApprovalSummary({ request }: { request: HrVacationRequest }) {
  const approval = request.approval;
  if (!approval) {
    return (
      <Text size="sm" c="dimmed">
        Onay kaydı bulunamadı.
      </Text>
    );
  }
  if (request.status === 'cancellation_requested') {
    return <StatusBadge color="red">İptal talebi — İK onayı bekleniyor</StatusBadge>;
  }
  if (request.status !== 'submitted') {
    if (approval.is_rejected) return <StatusBadge color="red">Onay süreci reddedildi</StatusBadge>;
    if (approval.is_complete || request.status === 'approved')
      return <StatusBadge color="green">Onay süreci tamamlandı</StatusBadge>;
    return (
      <Text size="sm" c="dimmed">
        -
      </Text>
    );
  }
  const stages = Array.isArray(approval.stage_instances) ? approval.stage_instances : [];
  const current = stages.find((stage) => !stage?.is_complete && !stage?.is_rejected);
  if (!current) return <StatusBadge color="green">Onay süreci tamamlandı</StatusBadge>;
  const remaining = Math.max(
    0,
    Number(current.required_approvals || 0) - Number(current.approved_count || 0),
  );
  return (
    <Box style={{ lineHeight: 1.3 }}>
      <Text size="sm" fw={600}>
        {current.name || 'Onay'}
      </Text>
      <Text size="xs" c="dimmed">
        {remaining} onay bekleniyor
      </Text>
    </Box>
  );
}

function StageStatus({ stage }: { stage: HrApprovalStage }) {
  if (stage.is_rejected) return <StatusBadge color="red">Reddedildi</StatusBadge>;
  if (stage.is_complete) return <StatusBadge color="green">Tamamlandı</StatusBadge>;
  return <StatusBadge color="yellow">Bekliyor</StatusBadge>;
}

function approverNames(stage: HrApprovalStage) {
  const approvers = Array.isArray(stage.approvers) ? stage.approvers : [];
  if (!approvers.length) {
    return (
      <Text span size="sm" c="dimmed">
        Atanmış onaylayıcı yok
      </Text>
    );
  }
  return approvers
    .map((user) => user.full_name || user.username || `Kullanıcı #${user.id}`)
    .join(', ');
}

/** The "Onay Akışı" section: summary, then each stage with its approvers and decisions. */
export function ApprovalFlow({ request }: { request: HrVacationRequest }) {
  const stages = Array.isArray(request.approval?.stage_instances)
    ? request.approval.stage_instances
    : [];
  return (
    <Stack gap="xs">
      <Box mb="xs">
        <ApprovalSummary request={request} />
      </Box>
      {stages.length === 0 ? (
        <Text size="sm" c="dimmed">
          Onay aşaması bulunamadı.
        </Text>
      ) : (
        stages.map((stage, index) => {
          const decisions = Array.isArray(stage.decisions) ? stage.decisions : [];
          return (
            <Box
              key={index}
              p="sm"
              style={{ border: '1px solid var(--gk-line)', borderRadius: 'var(--gk-radius-sm)' }}
            >
              <Group justify="space-between" align="flex-start" gap="xs" mb={6}>
                <div>
                  <Text size="sm" fw={600}>
                    {stage.name || `Aşama ${stage.order || ''}`}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Gerekli onay: {stage.required_approvals || 0} · Verilen:{' '}
                    {stage.approved_count || 0}
                  </Text>
                </div>
                <StageStatus stage={stage} />
              </Group>
              <Text size="sm" mb={4}>
                <Text span c="dimmed" size="sm">
                  Onaylayıcılar:
                </Text>{' '}
                {approverNames(stage)}
              </Text>
              {decisions.length ? (
                decisions.map((decision, i) => {
                  const rejected = decision.decision === 'reject';
                  return (
                    <Box key={i} pt={6} mt={6} style={{ borderTop: '1px solid var(--gk-line)' }}>
                      <Text size="sm">
                        <strong>
                          {decision.approver_detail?.full_name ||
                            decision.approver_detail?.username ||
                            'Onaylayan'}
                        </strong>{' '}
                        <Text span size="sm" c={rejected ? 'red.7' : 'green.8'}>
                          {rejected ? 'Reddetti' : 'Onayladı'}
                        </Text>
                        {decision.decided_at ? (
                          <Text span size="sm" c="dimmed">
                            {' '}
                            ({formatDateTime(decision.decided_at)})
                          </Text>
                        ) : null}
                      </Text>
                      {decision.comment ? (
                        <Text size="sm" c="dimmed" fs="italic" mt={2}>
                          &quot;{decision.comment}&quot;
                        </Text>
                      ) : null}
                    </Box>
                  );
                })
              ) : (
                <Text size="xs" c="dimmed" mt={6}>
                  Henüz karar verilmedi.
                </Text>
              )}
            </Box>
          );
        })
      )}
    </Stack>
  );
}
