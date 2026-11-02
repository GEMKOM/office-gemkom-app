import {
  DEPARTMENT_REQUEST_PRIORITY_OPTIONS,
  DEPARTMENT_REQUEST_STATUS_OPTIONS,
  type DepartmentRequest,
} from '@/api/general/departmentRequests';
import { DetailModal, type DetailSection } from '@/ui';
import { departmentLabel, FileAttachmentList, ItemsTable } from '../shared';

const joinKeys = (keys: string[] | null | undefined) =>
  keys && keys.length > 0 ? keys.join(', ') : '-';

export interface DepartmentRequestDetailModalProps {
  request: DepartmentRequest | undefined;
  loading: boolean;
  onClose: () => void;
}

/** Port of showRequestDetailsModal in list.js. */
export function DepartmentRequestDetailModal({
  request,
  loading,
  onClose,
}: DepartmentRequestDetailModalProps) {
  const r = request;
  const sections: DetailSection[] = r
    ? [
        {
          title: 'Genel Bilgiler',
          icon: 'fas fa-info-circle',
          fields: [
            { label: 'Talep No', value: r.request_number || r.id || '-', span: 3 },
            {
              label: 'Durum',
              value:
                r.status_label ||
                DEPARTMENT_REQUEST_STATUS_OPTIONS.find((o) => o.value === r.status)?.label ||
                r.status ||
                '-',
              span: 3,
            },
            {
              label: 'Öncelik',
              value:
                DEPARTMENT_REQUEST_PRIORITY_OPTIONS.find((o) => o.value === r.priority)?.label ??
                (r.priority || '-'),
              span: 3,
            },
            { label: 'Departman', value: departmentLabel(r), span: 3 },
            {
              label: 'Talep Eden',
              value: r.requestor_full_name || r.requestor_username || '-',
              span: 3,
            },
            { label: 'İhtiyaç Tarihi', value: r.needed_date, type: 'date', span: 3 },
            { label: 'Oluşturulma', value: r.created_at, type: 'date', span: 3 },
            { label: 'Gönderilme', value: r.submitted_at, type: 'date', span: 3 },
            {
              label: 'Planlama Talepleri',
              value: joinKeys(r.planning_request_keys),
              span: 12,
              hidden: !r.planning_request_keys || r.planning_request_keys.length === 0,
            },
            { label: 'Satın Alma Talepleri', value: joinKeys(r.purchase_request_keys), span: 12 },
            { label: 'Açıklama', value: r.description, span: 12, hidden: !r.description },
          ],
        },
        {
          title: 'Ürünler',
          icon: 'fas fa-boxes',
          hidden: !r.items || r.items.length === 0,
          content: <ItemsTable items={r.items ?? []} />,
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
    />
  );
}
