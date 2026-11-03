import { Text } from '@mantine/core';
import type { PaymentTermOption, Supplier } from '@/api/procurement/suppliers';
import { StatusBadge, type DataTableColumn } from '@/ui';
import uiClasses from '@/ui/ui.module.css';
import { StarRating, SupplierStatusBadge } from './supplierBadges';

/** Legacy getPaymentTermName: a nested term's name, or the name looked up by id. */
export function paymentTermName(
  ref: Supplier['default_payment_terms'],
  terms: readonly PaymentTermOption[],
): string {
  if (ref === null || ref === undefined || ref === '') return '-';
  if (typeof ref === 'object') return ref.name || '-';
  const term = terms.find((pt) => pt.id === ref || String(pt.id) === String(ref));
  return term ? term.name : '-';
}

/** Legacy taxRateBadge text: "20%", "—%" when unset. */
export function taxRateText(rate: Supplier['default_tax_rate']): string {
  const n = rate !== null && rate !== undefined && rate !== '' ? Number(rate) : null;
  const t =
    n !== null && Number.isFinite(n)
      ? n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
      : '—';
  return `${t}%`;
}

/** Legacy formatDbsLimit: "150.000,00 TRY", '-' when empty or 0. */
export function dbsLimitText(limit: Supplier['dbs_limit'], currency: string | undefined): string {
  if (!limit) return '-';
  return `${parseFloat(String(limit)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || 'TRY'}`;
}

/** The legacy table's columns; every one sorts on the server by its `data-field`. */
export function supplierColumns(terms: readonly PaymentTermOption[]): DataTableColumn<Supplier>[] {
  return [
    {
      key: 'id',
      header: 'ID',
      hideBelow: 1600,
      render: (row) => <span className={uiClasses.code}>{row.id}</span>,
    },
    {
      key: 'name',
      header: 'Tedarikçi Adı',
      maxWidth: 'clamp(140px, 12.5vw, 360px)',
      render: (row) => (
        <Text span fz="inherit" fw={600}>
          {row.name || 'İsimsiz'}
        </Text>
      ),
    },
    {
      key: 'contact_person',
      header: 'İletişim Kişisi',
      maxWidth: 'clamp(90px, 8.5vw, 220px)',
      render: (row) => row.contact_person || '-',
    },
    {
      key: 'phone',
      header: 'Telefon',
      render: (row) => row.phone || '-',
    },
    {
      key: 'email',
      header: 'E-posta',
      maxWidth: 'clamp(110px, 10vw, 280px)',
      render: (row) => row.email || '-',
    },
    {
      key: 'default_currency',
      header: 'Para Birimi',
      align: 'center',
      hideBelow: 1600,
      render: (row) => <StatusBadge color="grey">{row.default_currency || 'TRY'}</StatusBadge>,
    },
    {
      key: 'default_tax_rate',
      header: 'Vergi Oranı',
      align: 'center',
      hideBelow: 1600,
      render: (row) => <StatusBadge color="blue">{taxRateText(row.default_tax_rate)}</StatusBadge>,
    },
    {
      key: 'is_active',
      header: 'Durum',
      align: 'center',
      render: (row) =>
        row.is_active ? (
          <StatusBadge color="green">Aktif</StatusBadge>
        ) : (
          <StatusBadge color="red">Pasif</StatusBadge>
        ),
    },
    {
      key: 'default_payment_terms',
      sortKey: 'payment_terms_name',
      header: 'Ödeme Koşulları',
      maxWidth: 'clamp(100px, 9vw, 240px)',
      render: (row) => paymentTermName(row.default_payment_terms, terms),
    },
    {
      key: 'has_dbs',
      header: 'DBS Kullanıyor',
      align: 'center',
      // DBS Limiti shows '-' for a supplier without DBS.
      hideBelow: 1600,
      render: (row) =>
        row.has_dbs ? (
          <StatusBadge color="blue">Evet</StatusBadge>
        ) : (
          <StatusBadge color="grey">Hayır</StatusBadge>
        ),
    },
    {
      key: 'dbs_limit',
      header: 'DBS Limiti',
      align: 'center',
      render: (row) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {dbsLimitText(row.dbs_limit, row.dbs_currency || row.default_currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Tedarikçi Durumu',
      align: 'center',
      render: (row) => <SupplierStatusBadge status={row.status} />,
    },
    {
      key: 'rating_score',
      header: 'Puan',
      align: 'center',
      render: (row) => (
        <>
          <StarRating score={row.rating_score} compact />
          {row.rating_count ? (
            <Text size="xs" c="dimmed">
              ({row.rating_count})
            </Text>
          ) : null}
        </>
      ),
    },
  ];
}
