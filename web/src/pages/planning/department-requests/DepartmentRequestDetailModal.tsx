import { Button, Table, Text } from '@mantine/core';
import type { DepartmentRequest } from '@/api/general/departmentRequests';
import { formatDateTime } from '@/lib/format';
import {
  DetailModal,
  FaIcon,
  FileAttachments,
  type AttachmentFile,
  type DetailSection,
} from '@/ui';
import {
  departmentLabel,
  normalizeItem,
  prettyFileName,
  RequestStatusBadge,
} from '../../general/department-requests/shared';
import { PriorityBadge } from './columns';
import { rejectionComments } from './logic';

/** API file rows (department and planning requests) as FileAttachments rows. */
export function toAttachmentFiles(
  files: readonly {
    id?: number;
    file_name?: string | null;
    file_url?: string | null;
    description?: string | null;
    uploaded_by_username?: string | null;
    uploaded_at?: string | null;
  }[] = [],
): AttachmentFile[] {
  return files
    .filter((file) => file.file_url)
    .map((file) => ({
      id: file.id,
      url: file.file_url as string,
      name: prettyFileName(file),
      description: file.description ?? null,
      uploadedBy: file.uploaded_by_username ?? null,
      uploadedAt: file.uploaded_at ?? null,
    }));
}

function ItemsTable({ request }: { request: DepartmentRequest }) {
  return (
    <Table.ScrollContainer minWidth={900}>
      <Table striped withTableBorder verticalSpacing={6} fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>#</Table.Th>
            <Table.Th style={{ minWidth: 200, whiteSpace: 'nowrap' }}>Ürün Kodu</Table.Th>
            <Table.Th>Ürün Adı</Table.Th>
            <Table.Th>Ürün Açıklaması</Table.Th>
            <Table.Th>İş No</Table.Th>
            <Table.Th>Miktar</Table.Th>
            <Table.Th>Birim</Table.Th>
            <Table.Th>Özellikler</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(request.items ?? []).map((raw, index) => {
            const item = normalizeItem(raw);
            return (
              <Table.Tr key={index}>
                <Table.Td>{index + 1}</Table.Td>
                <Table.Td fw={700} style={{ whiteSpace: 'nowrap' }}>
                  {raw.item_code || '-'}
                </Table.Td>
                <Table.Td>{item.name}</Table.Td>
                <Table.Td>{raw.item_description || '-'}</Table.Td>
                <Table.Td>{item.job_no}</Table.Td>
                <Table.Td>{String(item.quantity || 0)}</Table.Td>
                <Table.Td>{item.unit || 'adet'}</Table.Td>
                <Table.Td>{item.item_specifications}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

export interface DepartmentRequestDetailModalProps {
  request: DepartmentRequest | undefined;
  loading: boolean;
  onClose: () => void;
  /** Transfer Et on an approved request: opens the planning request form. */
  onTransfer: (request: DepartmentRequest) => void;
  transferring?: boolean;
}

/** Port of showDepartmentRequestDetailsModal (modals.js). */
export function DepartmentRequestDetailModal({
  request: r,
  loading,
  onClose,
  onTransfer,
  transferring = false,
}: DepartmentRequestDetailModalProps) {
  const rejections = r ? rejectionComments(r) : [];
  const sections: DetailSection[] = r
    ? [
        {
          title: 'Genel Bilgiler',
          icon: 'fas fa-info-circle',
          fields: [
            { label: 'Talep No', value: `#${r.id}`, span: 6 },
            {
              label: 'Talep Numarası',
              value: r.request_number,
              span: 6,
              hidden: !r.request_number,
            },
            {
              label: 'Talep Eden',
              value: r.requestor_full_name || r.requestor_username || 'Bilinmiyor',
              span: 6,
            },
            { label: 'Departman', value: departmentLabel(r), span: 6 },
            { label: 'Durum', render: <RequestStatusBadge row={r} />, span: 6 },
            { label: 'Oluşturulma', value: r.created_at, type: 'datetime', span: 6 },
            {
              label: 'Gönderilme',
              value: r.submitted_at,
              type: 'datetime',
              span: 6,
              hidden: !r.submitted_at,
            },
          ],
        },
        {
          title: 'Talep Bilgileri',
          icon: 'fas fa-clipboard-list',
          fields: [
            { label: 'Başlık', value: r.title, span: 12, hidden: !r.title },
            {
              label: 'Açıklama',
              render: (
                <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                  {r.description || '-'}
                </Text>
              ),
              span: 12,
            },
            { label: 'Öncelik', render: <PriorityBadge priority={r.priority} />, span: 6 },
            { label: 'İhtiyaç Tarihi', value: r.needed_date, type: 'date', span: 6 },
            { label: 'Ürün Sayısı', value: `${r.items?.length || 0} ürün`, span: 6 },
            {
              label: 'Onay Tarihi',
              value: r.approved_at,
              type: 'datetime',
              span: 6,
              hidden: !r.approved_at,
            },
            {
              label: 'Onaylayan',
              value: r.approved_by_username,
              span: 6,
              hidden: !r.approved_by_username,
            },
          ],
        },
        {
          title: 'Reddetme Gerekçeleri',
          icon: 'fas fa-times-circle',
          hidden: rejections.length === 0,
          fields: rejections.map((c) => ({
            label: `${c.approver} - ${c.stage}`,
            render: (
              <>
                <Text size="sm">{c.comment}</Text>
                <Text size="xs" c="dimmed">
                  Tarih: {c.date ? formatDateTime(c.date) : '-'}
                </Text>
              </>
            ),
            span: 12,
          })),
        },
        {
          title: 'Talep Edilen Ürünler',
          icon: 'fas fa-boxes',
          hidden: !r.items || r.items.length === 0,
          content: <ItemsTable request={r} />,
        },
        {
          title: 'Dosya Ekleri',
          icon: 'fas fa-paperclip',
          hidden: !r.files || r.files.length === 0,
          content: <FileAttachments files={toAttachmentFiles(r.files)} layout="grid" readOnly />,
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
        r?.status === 'approved' ? (
          <Button
            loading={transferring}
            leftSection={<FaIcon icon="fas fa-exchange-alt" />}
            onClick={() => onTransfer(r)}
          >
            Transfer Et
          </Button>
        ) : null
      }
    />
  );
}
