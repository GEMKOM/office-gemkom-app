import { Button, Text } from '@mantine/core';
import type { DepartmentRequest } from '@/api/general/departmentRequests';
import { formatDateTime } from '@/lib/format';
import { DetailModal, FaIcon, type DetailSection } from '@/ui';
import { FileAttachmentList, ItemsTable, PriorityBadge, RequestStatusBadge } from '../shared';

interface RejectionComment {
  approver: string;
  stage: string;
  comment: string;
  date: string | null | undefined;
}

/** Legacy getRejectionComments: commented cancel/reject decisions of the latest workflow. */
export function rejectionComments(request: DepartmentRequest): RejectionComment[] {
  const approval = request.approvals?.[0];
  const out: RejectionComment[] = [];
  for (const stage of approval?.stage_instances ?? []) {
    for (const decision of stage.decisions ?? []) {
      if (
        (decision.decision === 'cancelled' || decision.decision === 'rejected') &&
        decision.comment
      ) {
        out.push({
          approver: decision.approver_name || decision.approver_username || 'Bilinmeyen',
          stage: stage.name ?? '',
          comment: decision.comment,
          date: decision.decision_date,
        });
      }
    }
  }
  return out;
}

export interface PendingRequestDetailModalProps {
  request: DepartmentRequest | undefined;
  loading: boolean;
  onClose: () => void;
  onApprove: (request: DepartmentRequest) => void;
  onReject: (request: DepartmentRequest) => void;
}

/** Port of showDepartmentRequestDetailsModal in pending/modals.js. */
export function PendingRequestDetailModal({
  request: r,
  loading,
  onClose,
  onApprove,
  onReject,
}: PendingRequestDetailModalProps) {
  const comments = r ? rejectionComments(r) : [];
  const sections: DetailSection[] = r
    ? [
        {
          title: 'Genel Bilgiler',
          icon: 'fas fa-info-circle',
          fields: [
            { label: 'Talep No', value: `#${r.id}` },
            { label: 'Talep Eden', value: r.requestor_username || 'Bilinmiyor' },
            { label: 'Departman', value: r.department_label || r.department || '-' },
            { label: 'Durum', render: <RequestStatusBadge row={r} /> },
            { label: 'Oluşturulma', value: r.created_at, type: 'datetime' },
            { label: 'Son Güncelleme', value: r.updated_at, type: 'datetime' },
          ],
        },
        {
          title: 'Talep Bilgileri',
          icon: 'fas fa-clipboard-list',
          fields: [
            { label: 'Başlık', value: r.title, span: 12, hidden: !r.title },
            {
              label: 'Açıklama',
              span: 12,
              render: (
                <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                  {r.description || '-'}
                </Text>
              ),
            },
            { label: 'Öncelik', render: <PriorityBadge priority={r.priority} /> },
            { label: 'Talep Tarihi', value: r.needed_date, type: 'date' },
            { label: 'Ürün Sayısı', value: `${r.items?.length ?? r.items_count ?? 0} ürün` },
            {
              label: 'Onay Tarihi',
              value: r.approved_at,
              type: 'datetime',
              hidden: !r.approved_at,
            },
            { label: 'Onaylayan', value: r.approved_by_username, hidden: !r.approved_by_username },
          ],
        },
        {
          title: 'Reddetme Gerekçeleri',
          icon: 'fas fa-times-circle',
          hidden: comments.length === 0,
          fields: comments.map((c) => ({
            label: `${c.approver} - ${c.stage}`,
            span: 12,
            render: (
              <>
                <Text size="sm">{c.comment}</Text>
                <Text size="xs" c="dimmed">
                  Tarih: {c.date ? formatDateTime(c.date) : '-'}
                </Text>
              </>
            ),
          })),
        },
        {
          title: 'Talep Edilen Ürünler',
          icon: 'fas fa-boxes',
          hidden: !r.items || r.items.length === 0,
          content: <ItemsTable items={r.items ?? []} approval files={r.files ?? []} />,
        },
        {
          title: 'Dosya Ekleri',
          icon: 'fas fa-paperclip',
          content: <FileAttachmentList files={r.files} />,
        },
      ]
    : [];

  return (
    <DetailModal
      opened
      onClose={onClose}
      title="Departman Talebi Detayları"
      subtitle={r?.title ?? undefined}
      icon="fas fa-boxes"
      size="xl"
      loading={loading}
      sections={sections}
      footerActions={
        r?.status === 'submitted' ? (
          <>
            <Button
              color="red.9"
              leftSection={<FaIcon icon="fas fa-times" />}
              onClick={() => onReject(r)}
            >
              Reddet
            </Button>
            <Button
              color="green.8"
              leftSection={<FaIcon icon="fas fa-check" />}
              onClick={() => onApprove(r)}
            >
              Onayla
            </Button>
          </>
        ) : null
      }
    />
  );
}
