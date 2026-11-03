import { Text } from '@mantine/core';
import type { PurchaseRequestRow } from '@/api/procurement/purchaseRequests';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { PriorityBadge, RequestStatusBadge } from './badges';

// The columns pending.js and registry.js share. Ordering = the field name.

const CREATED_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function baseColumns({
  truncateDescription,
}: {
  truncateDescription: boolean;
}): DataTableColumn<PurchaseRequestRow>[] {
  return [
    {
      key: 'request_number',
      header: 'Talep No',
      sortable: true,
      render: (row) => <span className={uiClasses.code}>{row.request_number || '-'}</span>,
    },
    {
      key: 'title',
      header: 'Başlık',
      sortable: true,
      render: (row) => {
        const description = row.description || 'Açıklama yok';
        return (
          <div>
            <Text size="sm" fw={600}>
              {row.title || 'Başlıksız'}
            </Text>
            {truncateDescription ? (
              <Text
                size="xs"
                c="dimmed"
                title={row.description || ''}
                style={{
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                  cursor: 'help',
                }}
              >
                {truncate(description, 50)}
              </Text>
            ) : (
              <Text size="xs" c="dimmed">
                {description}
              </Text>
            )}
          </div>
        );
      },
    },
    {
      key: 'requestor_username',
      header: 'Talep Eden',
      sortable: true,
      render: (row) => (
        <span>
          <i className="fas fa-user-circle" style={{ marginRight: 8, color: 'var(--gk-muted)' }} />
          {row.requestor_username || 'Bilinmiyor'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Durum',
      sortable: true,
      render: (row) => <RequestStatusBadge status={row.status} label={row.status_label} />,
    },
    {
      key: 'priority',
      header: 'Öncelik',
      sortable: true,
      render: (row) => <PriorityBadge priority={row.priority} />,
    },
    {
      key: 'total_amount_eur',
      header: 'Toplam Tutar',
      sortable: true,
      render: (row) => (row.total_amount_eur ? formatCurrency(row.total_amount_eur, 'EUR') : '-'),
    },
    {
      key: 'created_at',
      header: 'Oluşturulma',
      sortable: true,
      render: (row) => (
        <span style={{ color: '#6c757d', fontWeight: 500 }}>
          {row.created_at ? formatDateTime(row.created_at, CREATED_FORMAT) : 'N/A'}
        </span>
      ),
    },
  ];
}

/** Legacy table sort: none shown at first (list asks -request_number); first click is asc. */
export function listOrdering(sortBy: string | null, sortDir: 'asc' | 'desc'): string {
  if (!sortBy) return '-request_number';
  return `${sortDir === 'desc' ? '-' : ''}${sortBy}`;
}
