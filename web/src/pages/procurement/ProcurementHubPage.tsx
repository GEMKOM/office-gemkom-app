import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  criticalItemsCountQueryOptions,
  criticalItemsQueryOptions,
  overdueInstalmentCountQueryOptions,
  paymentListCountQueryOptions,
} from '@/api/procurement/hubs';
import type { PlanningItem } from '@/api/planning/planningItems';
import { pendingApprovalCountQueryOptions } from '@/api/procurement/purchaseRequests';
import { formatNumber, toNumber } from '@/lib/format';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { TaskDeadlinesPanel, useDepartmentTaskFigures } from '../hub/departmentTasks';
import {
  AttentionPanel,
  HubPanels,
  RecordsPanel,
  type AttentionItem,
  type HubRecord,
} from '../hub/HubPanels';
import { countFigure, countValue } from '../hubCount';
import { PENDING_REQUESTS_LINK, usePendingRequests } from './pendingRequests';

const PROJECTS = '/procurement/projects';
const CRITICAL = '/procurement/critical-items';
const PAYMENT_LISTS = '/procurement/payment-lists';

function criticalRecord(item: PlanningItem): HubRecord {
  const quantity = toNumber(item.quantity_to_purchase ?? item.quantity);
  return {
    key: item.id,
    link: item.item_code ? `${CRITICAL}?item_code=${encodeURIComponent(item.item_code)}` : CRITICAL,
    code: item.item_code ?? undefined,
    title: item.item_name || '-',
    subtitle: [item.job_no, item.planning_request_number].filter(Boolean).join(' · ') || undefined,
    status: item.purchase_request_number
      ? { label: item.purchase_request_number, color: 'blue' }
      : { label: 'Talep yok', color: 'orange' },
    meta:
      quantity !== null ? `${formatNumber(quantity)} ${item.item_unit ?? ''}`.trim() : undefined,
  };
}

export function ProcurementHubPage() {
  const pending = usePendingRequests();
  // The same cached count usePendingRequests reads, for the queue below.
  const pendingCount = useQuery({
    ...pendingApprovalCountQueryOptions(),
    enabled: hasRouteAccess(PENDING_REQUESTS_LINK),
  });
  const canCritical = hasRouteAccess(CRITICAL);
  const canPayments = hasRouteAccess(PAYMENT_LISTS);
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const critical = useQuery({ ...criticalItemsCountQueryOptions(), enabled: canCritical });
  const criticalList = useQuery({
    ...criticalItemsQueryOptions(6),
    select: (page) => page.results.map(criticalRecord),
    enabled: canCritical,
  });
  const listsInApproval = useQuery({
    ...paymentListCountQueryOptions('submitted'),
    enabled: canPayments,
  });
  const overdue = useQuery({
    ...overdueInstalmentCountQueryOptions(yesterday),
    enabled: canPayments,
  });
  const tasks = useDepartmentTaskFigures('procurement', PROJECTS);

  // Ported from procurement/procurement.js. Cards the user cannot open hide
  // themselves. Feature links take the card's colour (legacy had them dark red).
  const cards: MenuCard[] = [
    {
      title: 'Projeler',
      description: 'Satın alma departmanı görevlerini görüntüleyin ve yönetin.',
      icon: 'fas fa-project-diagram',
      iconColor: 'primary',
      link: PROJECTS,
      stat: tasks.enabled ? { value: countValue(tasks.active), label: 'aktif görev' } : undefined,
    },
    {
      title: 'Tedarikçiler',
      description: 'Tedarikçi bilgileri, performans takibi ve tedarikçi değerlendirme yönetimi.',
      icon: 'fas fa-handshake',
      iconColor: 'primary',
      link: '/procurement/suppliers',
      features: [
        { label: 'Tedarikçi Listesi', icon: 'fas fa-list', link: '/procurement/suppliers/list' },
        {
          label: 'Ödeme Koşulları',
          icon: 'fas fa-credit-card',
          link: '/procurement/suppliers/payment-terms',
        },
      ],
    },
    {
      title: 'Kritik Malzemeler',
      description: 'Kritik olarak işaretlenen malzemeleri ve tedarik durumlarını izleyin.',
      icon: 'fas fa-exclamation-triangle',
      iconColor: 'danger',
      link: CRITICAL,
      stat: { value: countValue(critical), label: 'teslim bekliyor' },
    },
    {
      title: 'Ödeme Listeleri',
      description:
        'Haftalık tedarikçi ödeme planı: havuzdan seç, genel müdür onayı, proformalarla finansa gönder.',
      icon: 'fas fa-money-check-dollar',
      iconColor: 'success',
      link: PAYMENT_LISTS,
      stat: { value: countValue(listsInApproval), label: 'liste onayda' },
    },
    {
      title: 'Satın Alma Talepleri',
      description: 'Satın alma taleplerinin oluşturulması, onay süreçleri ve takip yönetimi.',
      icon: 'fas fa-shopping-cart',
      iconColor: 'success',
      link: '/procurement/purchase-requests',
      stat: pending.stat,
      features: [
        {
          label: 'Talep Oluştur',
          icon: 'fas fa-plus',
          link: '/procurement/purchase-requests/create',
        },
        {
          label: 'Bekleyen Talepler',
          icon: 'fas fa-clock',
          link: '/procurement/purchase-requests/pending',
        },
        {
          label: 'Kayıt Defteri',
          icon: 'fas fa-archive',
          link: '/procurement/purchase-requests/registry',
        },
      ],
    },
    {
      title: 'Raporlar',
      description: 'Satın alma raporları, analizler ve performans metrikleri.',
      icon: 'fas fa-chart-bar',
      iconColor: 'info',
      link: '/procurement/reports',
      features: [
        { label: 'Ürün Raporu', icon: 'fas fa-chart-bar', link: '/procurement/reports/items' },
        {
          label: 'Tedarikçi Raporu',
          icon: 'fas fa-chart-pie',
          link: '/procurement/reports/suppliers',
        },
        { label: 'Personel Raporu', icon: 'fas fa-users', link: '/procurement/reports/staff' },
      ],
    },
  ];

  // Approvals first, then what is late: critical material and overdue payments.
  const stats: PageFigure[] = [
    ...pending.stats,
    ...(canCritical
      ? [
          countFigure(
            {
              id: 'critical-items',
              label: 'Kritik Malzeme',
              icon: 'fas fa-exclamation-triangle',
              link: CRITICAL,
            },
            critical,
          ),
        ]
      : []),
    ...(canPayments
      ? [
          countFigure(
            {
              id: 'overdue-instalments',
              label: 'Vadesi Geçen Taksit',
              icon: 'fas fa-calendar-xmark',
              link: `${PAYMENT_LISTS}?view=pool&basis=all`,
            },
            overdue,
          ),
        ]
      : []),
    // Bana Atanan.
    ...tasks.figures.slice(0, 1),
  ];

  const queues: AttentionItem[] = [];
  if (hasRouteAccess(PENDING_REQUESTS_LINK)) {
    queues.push({
      id: 'queue-pr',
      label: 'Satın alma talepleri',
      hint: 'Onayınızı bekliyor',
      icon: 'fas fa-shopping-cart',
      color: 'yellow',
      link: PENDING_REQUESTS_LINK,
      count: pendingCount,
    });
  }
  if (canPayments) {
    queues.push(
      {
        id: 'queue-lists',
        label: 'Ödeme listeleri',
        hint: 'Genel müdür onayında',
        icon: 'fas fa-money-check-dollar',
        color: 'yellow',
        link: `${PAYMENT_LISTS}?status=submitted`,
        count: listsInApproval,
      },
      {
        id: 'queue-overdue',
        label: 'Vadesi geçen taksitler',
        hint: 'Ödenmemiş, vadesi dün veya daha önce',
        icon: 'fas fa-calendar-xmark',
        color: 'red',
        link: `${PAYMENT_LISTS}?view=pool&basis=all`,
        count: overdue,
      },
    );
  }
  if (tasks.enabled) {
    queues.push(
      {
        id: 'queue-task-overdue',
        label: 'Hedefi geçen görevler',
        hint: 'Satın alma görevi, hedef tarihi geçti',
        icon: 'fas fa-flag',
        color: 'orange',
        link: PROJECTS,
        count: tasks.overdue,
      },
      {
        id: 'queue-blocked',
        label: 'Engellenen görevler',
        icon: 'fas fa-ban',
        color: 'red',
        link: `${PROJECTS}?status=blocked`,
        count: tasks.blocked,
      },
    );
  }
  const panels = queues.length > 0 || canCritical;

  return (
    <MenuCards
      title="Satın Alma Modülü"
      subtitle="Tedarik süreçlerinizi yönetin ve optimize edin"
      stats={stats}
      compact={panels}
      cards={cards}
    >
      {panels ? (
        <HubPanels>
          <>
            {tasks.enabled ? (
              <TaskDeadlinesPanel department="procurement" route={PROJECTS} />
            ) : null}
            {canCritical ? (
              <RecordsPanel
                title="Teslim Bekleyen Kritik Malzemeler"
                icon="fas fa-exclamation-triangle"
                more={CRITICAL}
                noun="Kritik malzemeler"
                empty="Teslim bekleyen kritik malzeme yok."
                query={criticalList}
              />
            ) : null}
          </>
          <AttentionPanel title="Satın Almayı Bekleyenler" icon="fas fa-inbox" items={queues} />
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
