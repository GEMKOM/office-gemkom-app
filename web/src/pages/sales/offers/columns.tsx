import { Text, UnstyledButton } from '@mantine/core';
import { offerStatusFamily, offerStatusLabel, type Offer } from '@/api/sales/offers';
import { StatusBadge, type DataTableColumn } from '@/ui';
import {
  daysUntilDate,
  deadlineActive,
  shortDate,
  statusTab,
  TAB_LABELS,
  type OfferTab,
} from './logic';
import css from './OffersPage.module.css';

export interface OfferRow extends Offer {
  customer_code?: string;
  item_count?: number | null;
  delivery_date_requested?: string | null;
  needs_my_approval?: boolean;
}

function Deadline({ row }: { row: OfferRow }) {
  const value = row.offer_expiry_date;
  if (!value)
    return (
      <Text span c="dimmed">
        -
      </Text>
    );
  const date = shortDate(value);
  const days = daysUntilDate(value);
  if (days === null || !deadlineActive(row.status)) return <>{date}</>;
  return (
    <>
      {date}{' '}
      {days < 0 ? (
        <Text span size="xs" c="red" fw={600}>
          ({Math.abs(days)} gün gecikti)
        </Text>
      ) : days === 0 ? (
        <Text span size="xs" c="red" fw={600}>
          (bugün)
        </Text>
      ) : (
        <Text span size="xs" c="dimmed">
          ({days} gün)
        </Text>
      )}
    </>
  );
}

/** The list columns; the status badge opens the offer on the tab its status is about. */
export function offerColumns(
  open: (row: OfferRow, tab: OfferTab) => void,
): DataTableColumn<OfferRow>[] {
  return [
    {
      key: 'offer_no',
      header: 'Teklif No',
      sortable: true,
      render: (row) => <strong>{row.offer_no || '-'}</strong>,
    },
    { key: 'title', header: 'Başlık', sortable: true, render: (row) => row.title || '-' },
    {
      key: 'customer_name',
      header: 'Müşteri',
      render: (row) => (
        <>
          {row.customer_name || '-'}{' '}
          {row.customer_code ? (
            <Text span size="xs" c="dimmed">
              ({row.customer_code})
            </Text>
          ) : null}
        </>
      ),
    },
    {
      key: 'status_display',
      header: 'Durum',
      sortable: true,
      align: 'center',
      accessor: (row) => offerStatusLabel(row),
      render: (row) => {
        const tab = statusTab(row.status);
        return (
          <UnstyledButton
            className={css.statusButton}
            title={`${TAB_LABELS[tab]} sekmesini aç`}
            onClick={(event) => {
              event.stopPropagation();
              open(row, tab);
            }}
          >
            <StatusBadge color={offerStatusFamily(row.status)}>{offerStatusLabel(row)}</StatusBadge>
          </UnstyledButton>
        );
      },
    },
    {
      key: 'total_price',
      header: 'Güncel Fiyat',
      align: 'right',
      render: (row) => {
        const n =
          row.total_price === null || row.total_price === undefined || row.total_price === ''
            ? Number.NaN
            : Number(row.total_price);
        if (!Number.isFinite(n))
          return (
            <Text span c="dimmed">
              -
            </Text>
          );
        return (
          <strong>
            {n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>
        );
      },
    },
    { key: 'item_count', header: 'Kalem', align: 'center', render: (row) => row.item_count ?? '-' },
    {
      key: 'delivery_date_requested',
      header: 'Termin',
      sortable: true,
      render: (row) => shortDate(row.delivery_date_requested),
    },
    {
      key: 'offer_expiry_date',
      header: 'Teklif Sunum Son Tarih',
      sortable: true,
      render: (row) => <Deadline row={row} />,
    },
    { key: 'created_by_name', header: 'Oluşturan', render: (row) => row.created_by_name || '-' },
    {
      key: 'created_at',
      header: 'Tarih',
      sortable: true,
      render: (row) => shortDate(row.created_at),
    },
  ];
}
