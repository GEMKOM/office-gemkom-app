import { Button, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deletePurchaseOrder,
  purchaseOrderKeys,
  purchaseOrdersQueryOptions,
  type PaymentSchedule,
  type PurchaseOrder,
  type PurchaseOrdersParams,
} from '@/api/procurement/purchaseOrders';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  fromOrdering,
  notify,
  toOrdering,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
  type RowAction,
} from '@/ui';
import { FinanceHeader } from '../FinanceOperationsPage';
import classes from '../FinanceOperations.module.css';
import { CurrencyBadge, money, parseMoney } from '../shared';
import { exportPurchaseOrders } from '../po/exportOrders';
import { MarkPaidModal } from '../po/MarkPaidModal';
import {
  ORDER_STATUS_OPTIONS,
  OrderStatusBadge,
  PaymentSchedules,
  PriorityBadge,
} from '../po/orderParts';
import { PurchaseOrderDetailModal } from '../po/PurchaseOrderDetailModal';

// `order` is the deep link from notification e-mails, Neo and the payment
// lists (?order=<id>): it opens the order's details.
const URL_DEFAULTS = {
  status: 'awaiting_payment',
  page: '1',
  page_size: '20',
  ordering: '',
  order: '',
};

const filterConfig: FilterConfig<'status'>[] = [
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    placeholder: 'Tümü',
    searchable: false,
    options: ORDER_STATUS_OPTIONS,
  },
];

const EMPTY: PurchaseOrder[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Satın Alma Siparişleri: orders waiting for payment, their instalments and details. */
export function PurchaseOrdersTab() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const { values, apply, reset } = useUrlFilters(URL_DEFAULTS);
  const page = positiveInt(values.page, 1);
  const pageSize = positiveInt(values.page_size, 20);
  const sort = fromOrdering(values.ordering);
  const ordering = toOrdering(sort.sortBy, sort.sortDir);

  const params: PurchaseOrdersParams = {
    status: values.status || undefined,
    ordering: ordering || undefined,
    page,
    page_size: pageSize,
  };
  const list = useQuery(purchaseOrdersQueryOptions(params));
  const rows = list.data?.results ?? EMPTY;

  useEffect(() => {
    if (list.isError) notify.error('Satın alma siparişleri yüklenirken hata oluştu.');
  }, [list.isError, list.errorUpdatedAt]);

  // ---- mark paid (from the table or the detail modal) ----
  const [paying, setPaying] = useState<{ orderId: number; schedule: PaymentSchedule } | null>(null);
  const openMarkPaid = useCallback(
    (order: PurchaseOrder, schedule: PaymentSchedule) => setPaying({ orderId: order.id, schedule }),
    [],
  );

  // ---- details ----
  const detailId = positiveInt(values.order, 0);
  const openDetails = (id: number) => apply({ order: String(id) });
  const closeDetails = useCallback(() => apply({ order: '' }), [apply]);

  // ---- delete (admin) ----
  const remove = async (order: PurchaseOrder) => {
    const ok = await confirm({
      message: 'Bu satın alma siparişini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      confirmLabel: 'Evet',
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePurchaseOrder(order.id);
      if (detailId === order.id) closeDetails();
      notify.success('Satın alma siparişi silindi.');
      void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.all });
    } catch (error) {
      notify.error(error, { fallback: 'Sipariş silinirken hata oluştu.' });
    }
  };

  const rowActions = (order: PurchaseOrder): RowAction<PurchaseOrder>[] => [
    {
      key: 'view',
      label: 'Detayları Görüntüle',
      icon: 'fas fa-eye',
      color: 'primary',
      onClick: () => openDetails(order.id),
    },
    {
      key: 'delete',
      label: 'Sil',
      icon: 'fas fa-trash',
      color: 'danger',
      hidden: !isAdmin,
      onClick: (row) => void remove(row),
    },
  ];

  const columns = useMemo<DataTableColumn<PurchaseOrder>[]>(
    () => [
      { key: 'id', header: 'Sipariş No', sortable: true, render: (o) => <strong>{o.id}</strong> },
      { key: 'supplier_name', header: 'Tedarikçi', render: (o) => o.supplier_name || '-' },
      { key: 'status', header: 'Durum', render: (o) => <OrderStatusBadge order={o} /> },
      {
        key: 'total_amount',
        header: 'Toplam Tutar',
        sortable: true,
        render: (o) => (
          <div className={classes.money}>
            {money(o.total_amount, o.currency)}
            {parseMoney(o.tax_outstanding) > 0 ? (
              <span className={classes.taxDue}>+ {money(o.tax_outstanding, o.currency)} (KDV)</span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'currency',
        header: 'Para Birimi',
        render: (o) => <CurrencyBadge currency={o.currency || 'TRY'} />,
      },
      {
        key: 'priority',
        header: 'Öncelik',
        render: (o) => <PriorityBadge priority={o.priority} />,
      },
      {
        key: 'created_at',
        header: 'Oluşturulma Tarihi',
        sortable: true,
        render: (o) => <span className={classes.nowrap}>{formatDate(o.created_at)}</span>,
      },
      {
        key: 'payment_schedules',
        header: 'Ödeme Planı',
        render: (o) => <PaymentSchedules order={o} onMarkPaid={(s) => openMarkPaid(o, s)} />,
      },
    ],
    [openMarkPaid],
  );

  // ---- export ----
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      const count = await exportPurchaseOrders({
        status: params.status,
        ordering: params.ordering,
      });
      if (count === 0) notify.warning('Dışa aktarılacak sipariş bulunamadı.');
    } catch (error) {
      console.error('Error exporting purchase orders:', error);
      notify.error('Dışa aktarma sırasında hata oluştu.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <FinanceHeader
        tab="po"
        actions={
          <Button
            variant="default"
            loading={exporting}
            leftSection={<FaIcon icon="fas fa-download" />}
            onClick={() => void runExport()}
          >
            Dışa Aktar
          </Button>
        }
      />
      <DataTable
        title="Satın Alma Siparişleri"
        icon="fas fa-shopping-cart"
        filters={
          <FilterBar
            inline
            filters={filterConfig}
            values={{ status: values.status }}
            onApply={(next) => apply({ ...next, page: '1' })}
            onClear={() => reset()}
          />
        }
        data={rows}
        columns={columns}
        getRowId={(o) => String(o.id)}
        loading={list.isFetching}
        sort={{
          sortBy: sort.sortBy,
          sortDir: sort.sortDir,
          onSortChange: (sortBy, sortDir) =>
            apply({ ordering: toOrdering(sortBy, sortDir) ?? '', page: '1' }),
        }}
        pagination={{
          page,
          pageSize,
          total: list.data?.count ?? 0,
          onPageChange: (next) => apply({ page: String(next) }),
          onPageSizeChange: (size) => apply({ page_size: String(size), page: '1' }),
        }}
        rowActions={rowActions}
        extraData={isAdmin}
        emptyMessage={
          <Text c="dimmed">
            <FaIcon icon="fas fa-inbox" /> Henüz satın alma siparişi bulunmamaktadır.
          </Text>
        }
        onRefresh={() => void list.refetch()}
      />

      {detailId ? (
        <PurchaseOrderDetailModal
          key={detailId}
          orderId={detailId}
          onClose={closeDetails}
          onMarkPaid={openMarkPaid}
        />
      ) : null}
      {paying ? (
        <MarkPaidModal
          orderId={paying.orderId}
          schedule={paying.schedule}
          onClose={() => setPaying(null)}
        />
      ) : null}
    </>
  );
}
