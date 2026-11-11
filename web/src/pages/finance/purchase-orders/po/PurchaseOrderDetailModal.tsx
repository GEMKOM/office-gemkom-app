import { hasPerm, isSuperuser } from '@/auth/authService';
import { ActionIcon, Anchor, Button, Text, Tooltip } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  listOrderEvaluations,
  purchaseOrderQueryOptions,
  type PaymentSchedule,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from '@/api/procurement/purchaseOrders';
import { formatDate, formatNumber } from '@/lib/format';
import { NeoAskButton } from '@/neo';
import { DataTable, DetailModal, FaIcon, notify, type DataTableColumn } from '@/ui';
import classes from '../FinanceOperations.module.css';
import { CurrencyBadge, money, parseMoney } from '../shared';
import {
  OrderStatusBadge,
  PriorityBadge,
  remainingAmount,
  ScheduleStateBadge,
  scheduleTax,
} from './orderParts';
import { SupplierEvaluationModal } from './SupplierEvaluationModal';

// Procurement uses page permissions; the PR-create page is the write gate for
// rating suppliers. Superusers always qualify (the backend's user_has_role_perm).
const canWriteProcurement = () =>
  isSuperuser() || hasPerm('access_procurement_purchase_requests_create');

function scheduleColumns(
  onMarkPaid: (s: PaymentSchedule) => void,
): DataTableColumn<PaymentSchedule>[] {
  return [
    { key: 'sequence', header: 'Sıra', align: 'center' },
    { key: 'label', header: 'Ödeme Türü' },
    { key: 'percentage', header: 'Yüzde', align: 'right', render: (s) => `${s.percentage ?? ''}%` },
    {
      key: 'due_date',
      header: 'Vade Tarihi',
      align: 'center',
      render: (s) => formatDate(s.due_date),
    },
    {
      key: 'amount',
      header: 'Tutar',
      align: 'right',
      render: (s) => <strong className={classes.money}>{money(s.amount, s.currency)}</strong>,
    },
    {
      key: 'tax_amount',
      header: 'KDV Tutarı',
      align: 'right',
      render: (s) => <span className={classes.money}>{money(scheduleTax(s), s.currency)}</span>,
    },
    {
      key: 'status',
      header: 'Durum',
      align: 'center',
      render: (s) => <ScheduleStateBadge schedule={s} />,
    },
    {
      key: 'actions',
      header: 'İşlemler',
      align: 'center',
      render: (s) =>
        s.is_paid ? (
          <Text c="green" span aria-label="Ödendi">
            <FaIcon icon="fas fa-check-circle" />
          </Text>
        ) : (
          <Tooltip label="Ödeme İşaretle" withArrow openDelay={300}>
            <ActionIcon
              variant="light"
              color="green"
              aria-label={`Ödeme İşaretle: ${s.label ?? ''}`}
              onClick={() => onMarkPaid(s)}
            >
              <FaIcon icon="fas fa-check" />
            </ActionIcon>
          </Tooltip>
        ),
    },
  ];
}

function lineColumns(currency?: string): DataTableColumn<PurchaseOrderLine>[] {
  return [
    { key: 'item_code', header: 'Malzeme Kodu', render: (l) => <code>{l.item_code}</code> },
    { key: 'item_name', header: 'Malzeme Adı' },
    {
      key: 'job_no',
      header: 'İş Emri No',
      render: (l) => (l.allocations?.length ? l.allocations.map((a) => a.job_no).join(', ') : '-'),
    },
    {
      key: 'quantity',
      header: 'Miktar',
      align: 'right',
      render: (l) => formatNumber(parseMoney(l.quantity)),
    },
    {
      key: 'unit_price',
      header: 'Birim Fiyat',
      align: 'right',
      render: (l) => money(l.unit_price, currency),
    },
    {
      key: 'total_price',
      header: 'Toplam',
      align: 'right',
      render: (l) => <strong>{money(l.total_price, currency)}</strong>,
    },
    {
      key: 'delivery_days',
      header: 'Teslimat (Gün)',
      align: 'center',
      render: (l) => ((l.delivery_days ?? 0) > 0 ? l.delivery_days : '-'),
    },
    {
      key: 'notes',
      header: 'Notlar',
      render: (l) =>
        l.notes ? (
          <Text size="xs" c="dimmed">
            {l.notes}
          </Text>
        ) : (
          '-'
        ),
    },
  ];
}

function Details({
  order,
  onMarkPaid,
}: {
  order: PurchaseOrder;
  onMarkPaid: (s: PaymentSchedule) => void;
}) {
  const schedules = useMemo(() => scheduleColumns(onMarkPaid), [onMarkPaid]);
  const lines = useMemo(() => lineColumns(order.currency), [order.currency]);
  return (
    <>
      {order.payment_schedules?.length ? (
        <DataTable
          title="Ödeme Planı"
          data={order.payment_schedules}
          columns={schedules}
          getRowId={(s) => String(s.id)}
          striped
          verticalSpacing="xs"
        />
      ) : null}
      {order.lines?.length ? (
        <DataTable
          title="Sipariş Kalemleri"
          data={order.lines}
          columns={lines}
          getRowId={(l) => String(l.id)}
          striped
          verticalSpacing="xs"
        />
      ) : null}
    </>
  );
}

/**
 * Legacy viewPurchaseOrderDetails (Sipariş Detayları). Mounted while the
 * URL has ?order=<id>; closing drops the param.
 */
export function PurchaseOrderDetailModal({
  orderId,
  onClose,
  onMarkPaid,
}: {
  orderId: number;
  onClose: () => void;
  onMarkPaid: (order: PurchaseOrder, schedule: PaymentSchedule) => void;
}) {
  const detail = useQuery(purchaseOrderQueryOptions(orderId));
  const [evaluating, setEvaluating] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!detail.isError) return;
    notify.error('Sipariş detayları yüklenirken hata oluştu.');
    onClose();
  }, [detail.isError, onClose]);

  const order = detail.data;
  const markPaid = useMemo(
    () => (schedule: PaymentSchedule) => {
      if (order) onMarkPaid(order, schedule);
    },
    [order, onMarkPaid],
  );

  const openEvaluation = async () => {
    setChecking(true);
    try {
      // Guard against a second evaluation of the same order.
      if ((await listOrderEvaluations(orderId)).length > 0) {
        notify.error('Bu sipariş zaten değerlendirilmiş.');
        return;
      }
    } catch {
      // If the check fails, the backend still enforces one evaluation per order.
    } finally {
      setChecking(false);
    }
    setEvaluating(true);
  };

  const remaining = order ? remainingAmount(order) : 0;
  const taxOutstanding = order ? parseMoney(order.tax_outstanding) || 0 : 0;

  return (
    <>
      <DetailModal
        opened
        onClose={onClose}
        title="Sipariş Detayları"
        subtitle={
          order ? [`#${order.id}`, order.supplier_name].filter(Boolean).join(' · ') : undefined
        }
        icon="fas fa-shopping-cart"
        size="xl"
        loading={detail.isPending}
        headerActions={
          <NeoAskButton
            page={
              order
                ? {
                    type: 'purchase_order',
                    id: String(order.id),
                    label: order.supplier_name ? String(order.supplier_name) : undefined,
                  }
                : null
            }
          />
        }
        footerActions={
          order && canWriteProcurement() && order.status !== 'cancelled' ? (
            <Button
              variant="outline"
              color="yellow"
              leftSection={<FaIcon icon="fas fa-star" />}
              loading={checking}
              onClick={() => void openEvaluation()}
            >
              Tedarikçi Değerlendir
            </Button>
          ) : null
        }
        sections={
          order
            ? [
                {
                  title: 'Genel',
                  fields: [
                    { label: 'Sipariş No', value: order.id },
                    { label: 'Tedarikçi', value: order.supplier_name },
                    { label: 'Durum', render: <OrderStatusBadge order={order} /> },
                    { label: 'Öncelik', render: <PriorityBadge priority={order.priority} /> },
                    { label: 'Oluşturulma Tarihi', value: order.created_at, type: 'date' },
                    {
                      label: 'PR No',
                      render: order.purchase_request_number ? (
                        <Anchor
                          href={`/procurement/purchase-requests/registry/?talep=${encodeURIComponent(order.purchase_request_number)}`}
                          target="_blank"
                          rel="noopener"
                        >
                          {order.purchase_request_number}
                        </Anchor>
                      ) : (
                        'N/A'
                      ),
                    },
                    { label: 'Kalem Sayısı', value: (order.lines ?? []).length },
                  ],
                },
                {
                  title: 'Fiyat Bilgileri',
                  fields: [
                    { label: 'Para Birimi', render: <CurrencyBadge currency={order.currency} /> },
                    {
                      label: 'Toplam Tutar',
                      render: <strong>{money(order.total_amount, order.currency)}</strong>,
                    },
                    {
                      label: 'KDV Tutarı',
                      render: <strong>{money(order.total_tax_amount, order.currency)}</strong>,
                    },
                    { label: 'KDV Oranı', render: `${order.tax_rate ?? ''}%` },
                    {
                      label: 'Kalan Tutar',
                      render: (
                        <Text span fw={700} c={remaining > 0 ? 'red' : 'green'}>
                          {money(remaining, order.currency)}
                        </Text>
                      ),
                    },
                    {
                      label: 'Kalan KDV Borcu',
                      render: (
                        <Text span fw={700} c={taxOutstanding > 0 ? 'red' : 'green'}>
                          {money(order.tax_outstanding, order.currency)}
                        </Text>
                      ),
                    },
                  ],
                },
                { content: <Details order={order} onMarkPaid={markPaid} /> },
              ]
            : []
        }
      />
      {evaluating ? (
        <SupplierEvaluationModal orderId={orderId} onClose={() => setEvaluating(false)} />
      ) : null}
    </>
  );
}
