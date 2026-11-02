import { Text } from '@mantine/core';
import type { Subcontractor } from '@/api/subcontracting/subcontractors';
import { StatusBadge, type DataTableColumn } from '@/ui';

export function statusLabel(value: boolean | undefined): string {
  if (value === true) return 'Aktif';
  if (value === false) return 'Pasif';
  return '-';
}

// Module scope so DataTable rows stay memoized. Sortable set = legacy table.
export const subcontractorColumns: DataTableColumn<Subcontractor>[] = [
  {
    key: 'name',
    header: 'Firma Adı',
    sortable: true,
    render: (row) => (
      <Text size="sm" fw={600}>
        {row.name || '-'}
      </Text>
    ),
  },
  { key: 'short_name', header: 'Kısa Ad', sortable: true },
  { key: 'contact_person', header: 'İletişim Kişisi', sortable: true },
  { key: 'phone', header: 'Telefon', sortable: false },
  { key: 'email', header: 'E-posta', sortable: false },
  // Legacy shows the bare code (TRY, EUR), not the currency name.
  { key: 'default_currency', header: 'Para Birimi', sortable: true },
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
];
