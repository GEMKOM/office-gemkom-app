import { ActionIcon, Badge, Text, Tooltip } from '@mantine/core';
import type { PaymentSchedule, PurchaseOrder } from '@/api/procurement/purchaseOrders';
import { formatDate } from '@/lib/format';
import { FaIcon, StatusBadge, type StatusFamily } from '@/ui';
import classes from '../FinanceOperations.module.css';
import { daysUntil, money, parseMoney } from '../shared';

// Badges and the payment-plan cell of the orders table and the detail modal
// (legacy getStatusBadgeClass/getPriorityText/renderPaymentSchedules).

const STATUS: Record<string, { color: StatusFamily; label: string }> = {
  awaiting_payment: { color: 'yellow', label: 'Ödeme Bekliyor' },
  paid: { color: 'green', label: 'Ödendi' },
  cancelled: { color: 'red', label: 'İptal Edildi' },
};

const PRIORITY: Record<string, { color: StatusFamily; label: string }> = {
  critical: { color: 'red', label: 'Kritik' },
  high: { color: 'yellow', label: 'Yüksek' },
  normal: { color: 'grey', label: 'Normal' },
  low: { color: 'grey', label: 'Düşük' },
};

export const ORDER_STATUS_OPTIONS = [
  { value: 'awaiting_payment', label: 'Ödeme Bekliyor' },
  { value: 'paid', label: 'Ödendi' },
  { value: 'cancelled', label: 'İptal Edildi' },
];

export function orderStatusLabel(order: Pick<PurchaseOrder, 'status' | 'status_label'>): string {
  return order.status_label || STATUS[order.status ?? '']?.label || order.status || '';
}

export function priorityLabel(priority?: string): string {
  return PRIORITY[priority ?? '']?.label ?? priority ?? '';
}

export function OrderStatusBadge({ order }: { order: PurchaseOrder }) {
  return (
    <StatusBadge color={STATUS[order.status ?? '']?.color ?? 'grey'}>
      {orderStatusLabel(order)}
    </StatusBadge>
  );
}

export function PriorityBadge({ priority }: { priority?: string }) {
  return (
    <StatusBadge color={PRIORITY[priority ?? '']?.color ?? 'grey'}>
      {priorityLabel(priority)}
    </StatusBadge>
  );
}

export type ScheduleState = 'paid' | 'late' | 'waiting';

/** Paid, past its due day (Gecikmiş) or waiting. */
export function scheduleState(schedule: PaymentSchedule): ScheduleState {
  if (schedule.is_paid) return 'paid';
  const days = daysUntil(schedule.due_date);
  return days !== null && days < 0 ? 'late' : 'waiting';
}

const STATE = {
  paid: { label: 'Ödendi', color: 'green', icon: 'fas fa-check-circle' },
  late: { label: 'Gecikmiş', color: 'red', icon: 'fas fa-exclamation-triangle' },
  waiting: { label: 'Bekliyor', color: 'yellow', icon: 'fas fa-clock' },
} as const;

export function ScheduleStateBadge({
  schedule,
  withIcon = false,
}: {
  schedule: PaymentSchedule;
  withIcon?: boolean;
}) {
  const state = STATE[scheduleState(schedule)];
  return (
    <Badge
      size="sm"
      color={state.color}
      variant="light"
      leftSection={withIcon ? <FaIcon icon={state.icon} /> : undefined}
    >
      {state.label}
    </Badge>
  );
}

/** The VAT shown next to an instalment: what was paid with it, or what is still due. */
export function scheduleTax(schedule: PaymentSchedule): number {
  if (schedule.is_paid) return schedule.paid_with_tax ? parseMoney(schedule.base_tax) || 0 : 0;
  return parseMoney(schedule.effective_tax_due) || 0;
}

/** Amount to pay: with its VAT when the box is ticked (legacy updatePaymentAmountDisplay). */
export function schedulePayable(schedule: PaymentSchedule, withTax: boolean): number {
  const amount = parseMoney(schedule.amount) || 0;
  return withTax ? amount + (parseMoney(schedule.effective_tax_due) || 0) : amount;
}

/** Sum of the unpaid instalments (Kalan Tutar). */
export function remainingAmount(order: PurchaseOrder): number {
  return (order.payment_schedules ?? [])
    .filter((s) => !s.is_paid)
    .reduce((sum, s) => sum + (parseMoney(s.amount) || 0), 0);
}

export function PaymentSchedules({
  order,
  onMarkPaid,
}: {
  order: PurchaseOrder;
  onMarkPaid: (schedule: PaymentSchedule) => void;
}) {
  const schedules = order.payment_schedules ?? [];
  if (schedules.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Ödeme planı yok
      </Text>
    );
  }
  const taxOutstanding = parseMoney(order.tax_outstanding) > 0;
  return (
    <div className={classes.schedules}>
      {schedules.map((schedule) => {
        const state = scheduleState(schedule);
        const tone =
          state === 'paid' ? classes.paid : state === 'late' ? classes.late : classes.waiting;
        let tax = null;
        if (schedule.is_paid) {
          tax = (
            <Text size="xs" span c={schedule.paid_with_tax ? 'green' : 'dimmed'}>
              + {money(scheduleTax(schedule), schedule.currency)} (KDV Ödendi)
            </Text>
          );
        } else if (scheduleTax(schedule) > 0) {
          tax = (
            <Text size="xs" span c={taxOutstanding ? 'red' : 'green'}>
              + {money(schedule.effective_tax_due, schedule.currency)} (KDV)
            </Text>
          );
        }
        return (
          <div key={schedule.id} className={classes.schedule}>
            <div>
              <Text size="xs" c="dimmed">
                {schedule.label}
              </Text>
              <div className={classes.scheduleLine}>
                <ScheduleStateBadge schedule={schedule} withIcon />
                <strong className={`${classes.money} ${tone}`}>
                  {money(schedule.amount, schedule.currency)}
                </strong>
                {tax}
              </div>
              <Text size="xs" c="dimmed">
                Vade: {formatDate(schedule.due_date)}
              </Text>
            </div>
            {!schedule.is_paid ? (
              <Tooltip label="Ödeme İşaretle" withArrow openDelay={300}>
                <ActionIcon
                  variant="light"
                  color="green"
                  aria-label={`Ödeme İşaretle: ${schedule.label ?? ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMarkPaid(schedule);
                  }}
                >
                  <FaIcon icon="fas fa-check" />
                </ActionIcon>
              </Tooltip>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
