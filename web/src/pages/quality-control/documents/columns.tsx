import { Stack } from '@mantine/core';
import {
  QUALITY_DOCUMENT_TYPE_CHOICES,
  type QualityDocument,
} from '@/api/quality-control/documents';
import { formatDate, toDate } from '@/lib/format';
import { FaIcon, StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  QUALITY_DOCUMENT_TYPE_CHOICES.map((c) => [c.value, c.label]),
);

export function documentTypeLabel(value: string | undefined): string {
  return (value && TYPE_LABELS[value]) || value || '-';
}

/** The expiry pill legacy formatValidUntil adds under the date (active documents only). */
function expiryBadge(row: QualityDocument) {
  if (!row.valid_until || !row.is_active) return null;
  if (row.expiry_status === 'expired') {
    return (
      <span title="Geçerlilik süresi doldu">
        <StatusBadge color="red">
          <FaIcon icon="fas fa-exclamation-circle" style={{ marginRight: 4 }} />
          Süresi Doldu
        </StatusBadge>
      </span>
    );
  }
  if (row.expiry_status === 'expiring') {
    const days = row.days_until_expiry;
    return (
      <span title="Geçerlilik süresi 30 gün içinde doluyor">
        <StatusBadge color="orange">
          <FaIcon icon="fas fa-exclamation-triangle" style={{ marginRight: 4 }} />
          {days === 0 ? 'Bugün Doluyor' : `${days} Gün Kaldı`}
        </StatusBadge>
      </span>
    );
  }
  return null;
}

export const documentColumns: DataTableColumn<QualityDocument>[] = [
  { key: 'title', header: 'Başlık', sortable: true },
  {
    key: 'document_type',
    header: 'Tip',
    sortable: true,
    render: (row) => documentTypeLabel(row.document_type),
    exportValue: (row) => documentTypeLabel(row.document_type),
  },
  {
    key: 'document_number',
    header: 'Evrak No',
    render: (row) => <span className={uiClasses.code}>{row.document_number || '-'}</span>,
  },
  { key: 'revision', header: 'Rev.' },
  { key: 'job_order_no', header: 'İş Emri' },
  {
    key: 'valid_until',
    header: 'Geçerlilik',
    sortable: true,
    render: (row) => {
      const badge = expiryBadge(row);
      const date = formatDate(row.valid_until);
      return badge ? (
        <Stack gap={4} align="flex-start">
          <span>{date}</span>
          {badge}
        </Stack>
      ) : (
        date
      );
    },
    exportValue: (row) => toDate(row.valid_until),
  },
  { key: 'uploaded_by_name', header: 'Yükleyen' },
  {
    key: 'created_at',
    header: 'Yüklenme',
    sortable: true,
    render: (row) => formatDate(row.created_at),
    exportValue: (row) => toDate(row.created_at),
  },
];
