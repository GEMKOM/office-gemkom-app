import { Anchor, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import type {
  CraneApprovalStage,
  CraneRequest,
  CraneRequestFile,
} from '@/api/general/craneRequests';
import { formatDate, formatDateTime } from '@/lib/format';
import { DetailModal, FaIcon, StatusBadge, type DetailSection } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import {
  craneStatusInfo,
  cranePriorityInfo,
  formatDurationSummary,
  formatMoney,
  neededTimeSuffix,
} from './crane';

export function CraneStatusBadge({ status, label }: { status?: string; label?: string }) {
  const info = craneStatusInfo(status);
  return <StatusBadge color={info.color}>{label || info.label}</StatusBadge>;
}

export function CranePriorityBadge({ priority }: { priority?: string }) {
  const info = cranePriorityInfo(priority);
  return <StatusBadge color={info.color}>{info.label}</StatusBadge>;
}

export function RequestNumber({ value }: { value?: string }) {
  return <span className={uiClasses.code}>{value || '-'}</span>;
}

function MoneyRow({
  label,
  value,
  strong,
  color,
}: {
  label: ReactNode;
  value: string;
  strong?: boolean;
  color?: string;
}) {
  return (
    <Group
      justify="space-between"
      gap="xs"
      fz="sm"
      fw={strong ? 700 : undefined}
      c={color}
      mt={strong ? 6 : 0}
      pt={strong ? 6 : 0}
      style={strong ? { borderTop: '1px solid var(--mantine-color-gray-3)' } : undefined}
    >
      <span>{label}</span>
      <span>{value}</span>
    </Group>
  );
}

function ApprovalChain({ stages }: { stages: CraneApprovalStage[] | undefined }) {
  if (!stages || stages.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Onay akışı bulunamadı.
      </Text>
    );
  }
  return (
    <Stack gap="sm">
      {stages.map((stage, index) => {
        const icon = stage.is_rejected
          ? { icon: 'fas fa-times-circle', color: 'var(--mantine-color-red-7)' }
          : stage.is_complete
            ? { icon: 'fas fa-check-circle', color: 'var(--mantine-color-green-7)' }
            : { icon: 'fas fa-hourglass-half', color: 'var(--mantine-color-yellow-7)' };
        const approvers = (stage.approvers ?? []).map((a) => a.full_name || a.username).join(', ');
        return (
          <div key={index}>
            <Text size="sm" fw={600}>
              <FaIcon icon={icon.icon} style={{ color: icon.color, marginRight: 8 }} />
              {stage.order}. {stage.name}{' '}
              <Text span size="xs" c="dimmed" fw={400}>
                ({stage.approved_count || 0}/{stage.required_approvals} onay)
              </Text>
            </Text>
            {approvers ? (
              <Text size="xs" c="dimmed" ml={24}>
                <FaIcon icon="fas fa-users" style={{ marginRight: 4 }} />
                {approvers}
              </Text>
            ) : null}
            {(stage.decisions ?? []).map((d, i) => (
              <Text key={i} size="xs" c="dimmed" ml={24}>
                <FaIcon
                  icon={d.decision === 'approve' ? 'fas fa-check' : 'fas fa-times'}
                  style={{
                    marginRight: 4,
                    color:
                      d.decision === 'approve'
                        ? 'var(--mantine-color-green-7)'
                        : 'var(--mantine-color-red-7)',
                  }}
                />
                {d.approver_detail
                  ? d.approver_detail.full_name || d.approver_detail.username
                  : '—'}
                {d.decided_at ? ` · ${formatDateTime(d.decided_at)}` : ''}
                {d.comment ? ` — "${d.comment}"` : ''}
              </Text>
            ))}
          </div>
        );
      })}
    </Stack>
  );
}

function fileName(file: CraneRequestFile): string {
  const raw = file.file_name || file.name || file.filename || file.display_name;
  return raw ? String(raw).split('/').pop() || 'Dosya' : 'Dosya';
}

function FileList({ files }: { files: CraneRequestFile[] | undefined }) {
  if (!files || files.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Dosya eki bulunmuyor.
      </Text>
    );
  }
  return (
    <Stack gap={6}>
      {files.map((file, index) => (
        <Group key={file.id ?? index} gap="xs" wrap="nowrap">
          <FaIcon icon="fas fa-paperclip" style={{ color: 'var(--mantine-color-dimmed)' }} />
          {file.file_url ? (
            <Anchor href={file.file_url} target="_blank" rel="noopener noreferrer" size="sm">
              {fileName(file)}
            </Anchor>
          ) : (
            <Text size="sm">{fileName(file)}</Text>
          )}
          {file.uploaded_by_username || file.uploaded_at ? (
            <Text size="xs" c="dimmed">
              {[file.uploaded_by_username, file.uploaded_at ? formatDateTime(file.uploaded_at) : '']
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </Group>
      ))}
    </Stack>
  );
}

function EstimateBlock({ request, footnote }: { request: CraneRequest; footnote: ReactNode }) {
  const breakdown = request.estimate_breakdown ?? {};
  return (
    <div>
      <Text size="sm" fw={600} mb={6}>
        <FaIcon icon="fas fa-calculator" style={{ marginRight: 6 }} />
        Tahmini
      </Text>
      {(['base', 'transport', 'rigger'] as const).map((key) => {
        const entry = breakdown[key];
        if (!entry || entry.amount === undefined) return null;
        return (
          <MoneyRow key={key} label={entry.label || key} value={formatMoney(entry.amount, '')} />
        );
      })}
      <MoneyRow
        strong
        color="var(--mantine-color-blue-8)"
        label="Tahmini Toplam"
        value={formatMoney(request.estimated_cost, request.estimated_cost_currency)}
      />
      <Text size="xs" c="dimmed" mt={4}>
        {footnote}
      </Text>
    </div>
  );
}

function ActualBlock({ request }: { request: CraneRequest }) {
  return (
    <div>
      <Text size="sm" fw={600} mb={6}>
        <FaIcon icon="fas fa-receipt" style={{ marginRight: 6 }} />
        Fiili
      </Text>
      <MoneyRow label="Fiili Miktar (saat/gün)" value={String(request.actual_quantity ?? '-')} />
      <MoneyRow
        strong
        color="var(--mantine-color-green-8)"
        label="Fiili Maliyet"
        value={formatMoney(request.actual_cost, request.actual_cost_currency)}
      />
      <Text size="xs" c="dimmed" mt={4}>
        {request.completed_by_username ? `Giren: ${request.completed_by_username}` : ''}
        {request.completed_at ? ` · ${formatDateTime(request.completed_at)}` : ''}
      </Text>
    </div>
  );
}

export interface CraneRequestDetailModalProps {
  /** null while the request loads. */
  request: CraneRequest | null;
  loading?: boolean;
  onClose: () => void;
  /**
   * 'list' (Tüm Talepler): product code among the fields, actual cost and
   * rejection reason sections. 'pending': the estimate only, the product code
   * under it, as legacy pending.js showed it.
   */
  variant: 'list' | 'pending';
  footerActions?: ReactNode;
}

/** The "Vinç Talebi Detayları" modal of list.js and pending.js. */
export function CraneRequestDetailModal({
  request,
  loading,
  onClose,
  variant,
  footerActions,
}: CraneRequestDetailModalProps) {
  const sections: DetailSection[] = request
    ? [
        {
          title: 'Genel Bilgiler',
          icon: 'fas fa-info-circle',
          fields: [
            { label: 'Talep No', value: request.request_number, span: 6 },
            {
              label: 'Talep Eden',
              value: request.requestor_full_name || request.requestor_username || '-',
            },
            { label: 'Departman', value: request.department || '-' },
            {
              label: 'Durum',
              render: <CraneStatusBadge status={request.status} label={request.status_label} />,
            },
            { label: 'Öncelik', render: <CranePriorityBadge priority={request.priority} /> },
            { label: 'Oluşturulma', value: request.created_at, type: 'datetime' },
            {
              label: 'Ürün Kodu',
              render: <code>{request.procurement_item_code || '-'}</code>,
              hidden: variant !== 'list',
            },
          ],
        },
        {
          title: 'Kiralama Bilgileri',
          icon: 'fas fa-truck-pickup',
          fields: [
            { label: 'Ekipman', value: request.crane_type_name || '-' },
            {
              label: 'İş Emri',
              render: (
                <Text fw={600} span fz="sm">
                  {request.job_no || '-'}
                </Text>
              ),
            },
            { label: 'Süre', value: formatDurationSummary(request) },
            {
              label: 'İhtiyaç Tarihi',
              value: request.needed_date
                ? `${formatDate(request.needed_date)}${neededTimeSuffix(request.needed_time)}`
                : '-',
            },
            { label: 'Konum', value: request.location || '-' },
            {
              label: 'Açıklama',
              span: 12,
              render: (
                <Text fz="sm" style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                  {request.description || '-'}
                </Text>
              ),
            },
          ],
        },
        {
          title: variant === 'list' ? 'Maliyet' : 'Tahmini Maliyet',
          icon: 'fas fa-lira-sign',
          content: (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
              <EstimateBlock
                request={request}
                footnote={
                  variant === 'list' ? (
                    'KDV hariç, fiyat listesine göre.'
                  ) : (
                    <>
                      KDV hariç, fiyat listesine göre. Ürün kodu:{' '}
                      <code>{request.procurement_item_code || '-'}</code>
                    </>
                  )
                }
              />
              {variant === 'list' &&
              request.actual_cost !== null &&
              request.actual_cost !== undefined ? (
                <ActualBlock request={request} />
              ) : null}
            </SimpleGrid>
          ),
        },
        {
          title: 'Reddetme Gerekçesi',
          icon: 'fas fa-times-circle',
          hidden: !(
            variant === 'list' &&
            request.status === 'rejected' &&
            request.rejection_reason
          ),
          content: (
            <Text fz="sm" c="red.8" style={{ whiteSpace: 'pre-wrap' }}>
              {request.rejection_reason}
            </Text>
          ),
        },
        {
          title: 'Onay Akışı',
          icon: 'fas fa-route',
          content: <ApprovalChain stages={request.approval?.stage_instances} />,
        },
        {
          title: 'Dosya Ekleri',
          icon: 'fas fa-paperclip',
          content: <FileList files={request.files} />,
        },
      ]
    : [];

  return (
    <DetailModal
      opened
      onClose={onClose}
      title="Vinç Talebi Detayları"
      subtitle={request?.request_number}
      icon="fas fa-truck-pickup"
      size="xl"
      loading={loading}
      sections={sections}
      footerActions={footerActions}
    />
  );
}
