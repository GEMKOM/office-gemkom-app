import type { HrUser } from '@/api/human_resources/users';
import { StatusBadge, type DataTableColumn } from '@/ui';

const BIRTH_FORMAT = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

/** "15 Mayıs 1986"; text that is not a date stays as it is. */
export function formatBirthDate(value: unknown): string {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return '-';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : BIRTH_FORMAT.format(date);
}

const text = (value: unknown) =>
  value === null || value === undefined || value === '' ? '-' : String(value);

// Module scope so DataTable rows stay memoized. Every legacy column sorts except
// those UserViewSet cannot order by (id, personel_kodu, birth_date, is_active).
export const userColumns: DataTableColumn<HrUser>[] = [
  { key: 'id', header: 'ID', sortable: false, render: (row) => text(row.id) },
  {
    key: 'username',
    header: 'Kullanıcı Adı',
    render: (row) => <strong>{text(row.username)}</strong>,
  },
  {
    key: 'personel_kodu',
    header: 'Personel Kodu',
    sortable: false,
    render: (row) => text(row.personel_kodu),
  },
  { key: 'first_name', header: 'Ad', render: (row) => text(row.first_name) },
  { key: 'last_name', header: 'Soyad', render: (row) => text(row.last_name) },
  {
    key: 'birth_date',
    header: 'Doğum Tarihi',
    sortable: false,
    render: (row) => formatBirthDate(row.birth_date),
    exportValue: (row) => formatBirthDate(row.birth_date),
  },
  { key: 'email', header: 'E-posta', render: (row) => text(row.email) },
  {
    key: 'position_title',
    header: 'Pozisyon',
    // Backend orders by the nested profile field (legacy mapSortFieldToOrdering).
    sortKey: 'profile__position__title',
    render: (row) => text(row.position_title),
  },
  {
    key: 'is_active',
    header: 'Durum',
    sortable: false,
    render: (row) =>
      row.is_active ? (
        <StatusBadge color="green">Aktif</StatusBadge>
      ) : (
        <StatusBadge color="red">Pasif</StatusBadge>
      ),
    exportValue: (row) => (row.is_active ? 'Aktif' : 'Pasif'),
  },
];
