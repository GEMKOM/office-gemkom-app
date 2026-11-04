import { hasRouteAccess } from '@/auth/accessControl';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  duePurchaseOrdersQueryOptions,
  instalmentCountQueryOptions,
  purchaseOrderCountQueryOptions,
} from '@/api/finance/hubs';
import { paymentListCountQueryOptions } from '@/api/procurement/hubs';
import type { PurchaseOrder } from '@/api/procurement/purchaseOrders';
import { formatCurrency, formatDate } from '@/lib/format';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import {
  AttentionPanel,
  HubPanels,
  RecordsPanel,
  type AttentionItem,
  type HubRecord,
} from '../hub/HubPanels';
import { countFigure, countValue } from '../hubCount';

const ORDERS = '/finance/purchase-orders';
const PAYMENT_LISTS = '/procurement/payment-lists';

function orderRecord(order: PurchaseOrder, today: string): HubRecord {
  const due = order.next_unpaid_due ?? undefined;
  return {
    key: order.id,
    link: `${ORDERS}?order=${order.id}`,
    code: order.purchase_request_number ?? `#${order.id}`,
    title: order.supplier_name || '-',
    subtitle: order.total_amount
      ? formatCurrency(order.total_amount, order.currency || 'TRY')
      : undefined,
    meta: due ? formatDate(due, { day: 'numeric', month: 'short', year: '2-digit' }) : 'Vadesiz',
    alert: Boolean(due && due < today),
  };
}

export function FinanceHubPage() {
  // Figures follow the cards: nothing is fetched for a page the user cannot open.
  const canOrders = hasRouteAccess(ORDERS);
  const canLists = hasRouteAccess(PAYMENT_LISTS);
  const today = dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const weekEnd = dayjs().add(7, 'day').format('YYYY-MM-DD');
  const awaiting = useQuery({
    ...purchaseOrderCountQueryOptions('awaiting_payment'),
    enabled: canOrders,
  });
  const overdue = useQuery({
    ...instalmentCountQueryOptions({ due_before: yesterday }),
    enabled: canOrders,
  });
  const thisWeek = useQuery({
    ...instalmentCountQueryOptions({ due_after: today, due_before: weekEnd }),
    enabled: canOrders,
  });
  const atFinance = useQuery({
    ...paymentListCountQueryOptions('sent_to_finance'),
    enabled: canLists,
  });
  const due = useQuery({
    ...duePurchaseOrdersQueryOptions(6),
    select: (page) => page.results.map((order) => orderRecord(order, today)),
    enabled: canOrders,
  });

  // Ported from finance/finance.js. Feature links take the card's colour
  // (legacy had them dark red).
  const cards: MenuCard[] = [
    {
      title: 'Finans İşlemleri',
      description: 'Satın alma siparişleri, ödemeler, tahsilatlar, giderler, krediler ve vergiler.',
      icon: 'fas fa-coins',
      iconColor: 'primary',
      link: ORDERS,
      stat: { value: countValue(awaiting), label: 'sipariş ödeme bekliyor' },
    },
    {
      title: 'Raporlar',
      description: 'Finansal analizler, maliyet raporları ve performans metrikleri.',
      icon: 'fas fa-chart-bar',
      iconColor: 'info',
      link: '/finance/reports',
      features: [
        {
          label: 'Yönetici Özeti',
          icon: 'fas fa-chart-pie',
          link: '/finance/reports/executive-overview',
        },
        { label: 'Proje Raporu', icon: 'fas fa-chart-line', link: '/finance/reports/projects' },
      ],
    },
  ];

  // The payment pool page cannot be linked to a due-date window; its "all
  // bases" view sorts by due date, so the overdue rows come first.
  const pool = `${PAYMENT_LISTS}?view=pool&basis=all`;
  const poolLink = canLists ? pool : ORDERS;
  const stats: PageFigure[] = canOrders
    ? [
        countFigure(
          {
            id: 'orders-awaiting',
            label: 'Ödeme Bekleyen Sipariş',
            icon: 'fas fa-file-invoice-dollar',
            link: ORDERS,
          },
          awaiting,
        ),
        countFigure(
          {
            id: 'instalments-overdue',
            label: 'Vadesi Geçen Taksit',
            icon: 'fas fa-calendar-xmark',
            link: poolLink,
          },
          overdue,
        ),
        countFigure(
          {
            id: 'instalments-week',
            label: '7 Gün İçinde Vadeli',
            icon: 'fas fa-calendar-week',
            link: poolLink,
          },
          thisWeek,
        ),
      ]
    : [];

  const queues: AttentionItem[] = [];
  if (canLists) {
    queues.push({
      id: 'queue-lists',
      label: 'Finansa iletilen ödeme listeleri',
      hint: 'Ödenmeyi bekliyor',
      icon: 'fas fa-money-check-dollar',
      color: 'yellow',
      link: `${PAYMENT_LISTS}?status=sent_to_finance`,
      count: atFinance,
    });
  }
  if (canOrders) {
    queues.push(
      {
        id: 'queue-overdue',
        label: 'Vadesi geçen taksitler',
        hint: 'Ödenmemiş, vadesi dün veya daha önce',
        icon: 'fas fa-calendar-xmark',
        color: 'red',
        link: poolLink,
        count: overdue,
      },
      {
        id: 'queue-week',
        label: 'Bu hafta vadesi gelenler',
        hint: 'Önümüzdeki 7 gün',
        icon: 'fas fa-calendar-week',
        color: 'orange',
        link: poolLink,
        count: thisWeek,
      },
    );
  }

  return (
    <MenuCards
      title="Finans Modülü"
      subtitle="Finansal süreçlerinizi yönetin ve mali durumunuzu takip edin"
      stats={stats}
      cards={cards}
    >
      {canOrders ? (
        <HubPanels>
          <RecordsPanel
            title="Sıradaki Ödemeler"
            icon="fas fa-calendar-check"
            more={ORDERS}
            noun="Siparişler"
            empty="Ödeme bekleyen sipariş yok."
            query={due}
          />
          <AttentionPanel title="Finansı Bekleyenler" icon="fas fa-inbox" items={queues} />
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
