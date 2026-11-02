import { Anchor, Text } from '@mantine/core';
import { CUSTOMER_CURRENCY_OPTIONS, type Customer } from '@/api';
import { formatDate, toDate } from '@/lib/format';
import { StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

export function currencyLabel(value: string | undefined): string {
  if (!value) return '-';
  return CUSTOMER_CURRENCY_OPTIONS.find((c) => c.value === value)?.label ?? value;
}

function statusLabel(value: boolean | undefined): string {
  if (value === true) return 'Aktif';
  if (value === false) return 'Pasif';
  return '-';
}

const CREATED_FORMAT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

// Module scope so DataTable rows stay memoized. Sortable set = legacy table.
export const customerColumns: DataTableColumn<Customer>[] = [
  {
    key: 'code',
    header: 'Müşteri Kodu',
    sortable: true,
    render: (row) => <span className={uiClasses.code}>{row.code || '-'}</span>,
  },
  { key: 'name', header: 'Firma Adı', sortable: true },
  { key: 'short_name', header: 'Kısa Ad', sortable: true },
  { key: 'contact_person', header: 'İletişim Kişisi', sortable: false },
  {
    key: 'email',
    header: 'E-posta',
    sortable: false,
    render: (row) =>
      row.email ? (
        <Anchor href={`mailto:${row.email}`} size="sm" onClick={(e) => e.stopPropagation()}>
          {row.email}
        </Anchor>
      ) : (
        '-'
      ),
  },
  { key: 'phone', header: 'Telefon', sortable: false },
  {
    key: 'default_currency',
    header: 'Para Birimi',
    sortable: true,
    render: (row) => currencyLabel(row.default_currency),
    exportValue: (row) => currencyLabel(row.default_currency),
  },
  {
    key: 'is_active',
    header: 'Durum',
    sortable: true,
    render: (row) =>
      row.is_active === true ? (
<StatusBadge color="green">Aktif</StatusBadge>
      ) : row.is_active === false ? (
<StatusBadge color="grey">Pasif</StatusBadge>
      ) : (
        <Text size="sm" c="dimmed">
          -
        </Text>
      ),
    exportValue: (row) => statusLabel(row.is_active),
  },
  {
    key: 'created_at',
    header: 'Oluşturulma',
    sortable: true,
    render: (row) => formatDate(row.created_at, CREATED_FORMAT),
    exportValue: (row) => toDate(row.created_at),
  },
];
