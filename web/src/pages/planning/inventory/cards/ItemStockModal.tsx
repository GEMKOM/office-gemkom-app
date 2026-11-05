import { Text } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Item } from '@/api/procurement/items';
import {
  itemBalancesQueryOptions,
  itemMovementsQueryOptions,
  warehouseLabel,
  type StockBalance,
  type StockMovement,
} from '@/api/procurement/stock';
import { formatDateTime, formatNumber, toNumber } from '@/lib/format';
import { DataTable, DetailModal, StatusBadge, type DataTableColumn } from '@/ui';

const PAGE_SIZE = 20;
const NO_BALANCES: StockBalance[] = [];
const NO_MOVEMENTS: StockMovement[] = [];

/** A quantity, red when below zero (Mikro's opening is off until the next count). */
export function Quantity({ value }: { value: number | string | null | undefined }) {
  const n = toNumber(value);
  if (n === null) return <>-</>;
  return (
    <Text span size="sm" fw={500} c={n < 0 ? 'red.8' : n > 0 ? undefined : 'dimmed'}>
      {formatNumber(value, 2)}
    </Text>
  );
}

const place = (code: string | null, job: string) =>
  code ? `${warehouseLabel(code)}${code === 'IS_EMRI' ? ` · ${job || 'atanmamış'}` : ''}` : '-';

const balanceColumns: DataTableColumn<StockBalance>[] = [
  { key: 'warehouse_code', header: 'Depo', render: (row) => warehouseLabel(row.warehouse_code) },
  {
    key: 'job_no',
    header: 'İş No',
    render: (row) =>
      row.warehouse_code === 'IS_EMRI'
        ? row.job_no || (
            <Text span size="sm" c="dimmed">
              atanmamış
            </Text>
          )
        : '-',
  },
  {
    key: 'quantity',
    header: 'Miktar',
    align: 'right',
    render: (row) => <Quantity value={row.quantity} />,
  },
];

const movementColumns: DataTableColumn<StockMovement>[] = [
  { key: 'occurred_at', header: 'Tarih', render: (row) => formatDateTime(row.occurred_at) },
  {
    key: 'movement_type',
    header: 'Hareket',
    render: (row) => <StatusBadge color="blue">{row.movement_type_label}</StatusBadge>,
  },
  {
    key: 'quantity',
    header: 'Miktar',
    align: 'right',
    render: (row) => <Quantity value={row.quantity} />,
  },
  {
    key: 'from',
    header: 'Nereden',
    render: (row) => place(row.from_warehouse_code, row.from_job_no),
  },
  { key: 'to', header: 'Nereye', render: (row) => place(row.to_warehouse_code, row.to_job_no) },
  {
    key: 'source',
    header: 'Kaynak',
    render: (row) =>
      [row.planning_request_number, row.pull_request_number].filter(Boolean).join(' · ') || '-',
  },
  { key: 'created_by_name', header: 'Kullanıcı', render: (row) => row.created_by_name || '-' },
  { key: 'note', header: 'Not', render: (row) => row.note || '-' },
];

export interface ItemStockModalProps {
  item: Item;
  onClose: () => void;
}

/** A card's balances per warehouse (İş Emri per job) and its movement history. */
export function ItemStockModal({ item, onClose }: ItemStockModalProps) {
  const [page, setPage] = useState(1);
  const balances = useQuery(itemBalancesQueryOptions(item.id));
  const movements = useQuery({
    ...itemMovementsQueryOptions(item.id, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  return (
    <DetailModal
      opened
      onClose={onClose}
      title={`Stok Hareketleri - ${item.name || item.code}`}
      icon="fas fa-exchange-alt"
      size="xl"
      sections={[
        {
          title: 'Bakiyeler',
          icon: 'fas fa-warehouse',
          content: (
            <DataTable
              data={balances.data ?? NO_BALANCES}
              columns={balanceColumns}
              getRowId={(row) => String(row.id)}
              loading={balances.isPending}
              emptyMessage={
                balances.isError ? 'Bakiyeler yüklenemedi' : 'Bu kartın hiçbir depoda bakiyesi yok'
              }
            />
          ),
        },
        {
          title: 'Hareketler',
          icon: 'fas fa-history',
          content: (
            <DataTable
              data={movements.data?.results ?? NO_MOVEMENTS}
              columns={movementColumns}
              getRowId={(row) => String(row.id)}
              loading={movements.isFetching}
              pagination={{
                page,
                pageSize: PAGE_SIZE,
                total: movements.data?.count ?? 0,
                onPageChange: setPage,
              }}
              emptyMessage={
                movements.isError ? 'Hareketler yüklenemedi' : 'Bu kartın stok hareketi yok'
              }
            />
          ),
        },
      ]}
    />
  );
}
