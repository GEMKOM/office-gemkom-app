import { hasRouteAccess } from '@/auth/accessControl';
import { Button } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import {
  criticalItemsQueryOptions,
  overdueInstalmentCountQueryOptions,
  paymentListCountQueryOptions,
  paymentsDueQueryOptions,
  pendingApprovalPageQueryOptions,
  requestablePlanningItemsQueryOptions,
} from '@/api/procurement/hubs';
import type { PoolRow } from '@/api/procurement/paymentLists';
import type { ProcurementPlanningItem, PurchaseRequestRow } from '@/api/procurement/purchaseRequests';
import type { PlanningItem } from '@/api/planning/planningItems';
import { formatCurrency, formatDate, formatNumber, toNumber } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { useDepartmentTaskFigures } from '../hub/departmentTasks';
import {
  AttentionPanel,
  HubPanels,
  RecordsPanel,
  type AttentionItem,
  type HubRecord,
} from '../hub/HubPanels';
import { countFigure, countValue } from '../hubCount';
import { PENDING_REQUESTS_LINK } from './pendingRequests';
import { PRIORITY } from './purchase-requests/shared/badges';

const PROJECTS = '/procurement/projects';
const CRITICAL = '/procurement/critical-items';
const CREATE = '/procurement/purchase-requests/create';
const PAYMENT_LISTS = '/procurement/payment-lists';
const POOL = `${PAYMENT_LISTS}?view=pool&basis=all`;
const REPORTS = '/procurement/reports';

/** Rows per queue on the hub; each list's own page has the rest. */
const ROWS = 5;

/** A page of rows as the panels and the band read it. */
interface QueuePage<T> {
  count: number;
  results: T[];
}

function quantity(value: unknown, unit: string | null | undefined): string | undefined {
  const n = toNumber(value as string | number | null | undefined);
  return n === null ? undefined : `${formatNumber(n)} ${unit ?? ''}`.trim();
}

function pendingRecord(request: PurchaseRequestRow & { needed_date?: string | null }): HubRecord {
  const priority = request.priority ? PRIORITY[request.priority] : undefined;
  const amount = toNumber(request.total_amount_eur);
  return {
    key: request.id,
    // The pending page opens the request from ?talep=.
    link: `${PENDING_REQUESTS_LINK}?talep=${encodeURIComponent(request.request_number)}`,
    code: request.request_number,
    title: request.title || '-',
    subtitle:
      [
        request.requestor_username,
        request.needed_date ? `ihtiyaç ${formatDate(request.needed_date)}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
    status: priority,
    meta: amount !== null ? formatCurrency(amount, 'EUR', 0) : undefined,
  };
}

function requestableRecord(
  item: ProcurementPlanningItem & { quantity_in_active_prs?: string | number | null },
): HubRecord {
  const partly =
    Boolean(item.is_partially_converted) || (toNumber(item.quantity_in_active_prs) ?? 0) > 0;
  return {
    key: item.id,
    link: CREATE,
    code: item.planning_request_number ?? undefined,
    title: item.item_name || '-',
    subtitle: [item.job_no, item.item_code].filter(Boolean).join(' · ') || undefined,
    status: item.is_critical
      ? { label: 'Kritik', color: 'red' }
      : partly
        ? { label: 'Kısmen', color: 'yellow' }
        : undefined,
    meta: quantity(item.quantity_remaining_for_purchase ?? item.quantity_to_purchase, item.item_unit),
  };
}

function criticalRecord(item: PlanningItem): HubRecord {
  return {
    key: item.id,
    link: item.item_code ? `${CRITICAL}?item_code=${encodeURIComponent(item.item_code)}` : CRITICAL,
    code: item.item_code ?? undefined,
    title: item.item_name || '-',
    subtitle: [item.job_no, item.planning_request_number].filter(Boolean).join(' · ') || undefined,
    status: item.purchase_request_number
      ? { label: item.purchase_request_number, color: 'blue' }
      : { label: 'Talep yok', color: 'orange' },
    meta: quantity(item.quantity_to_purchase ?? item.quantity, item.item_unit),
  };
}

function paymentRecord(row: PoolRow, today: string): HubRecord {
  const search = row.pr?.request_number || row.supplier?.name;
  return {
    key: row.schedule_id,
    link: search ? `${POOL}&q=${encodeURIComponent(search)}` : POOL,
    title: row.supplier?.name || '-',
    subtitle:
      [
        `PO-${row.po.id}`,
        row.pr?.request_number,
        row.open_list ? `${row.open_list.title} listesinde` : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
    meta: `${row.due_date ? formatDate(row.due_date, { day: 'numeric', month: 'short' }) : '-'} · ${formatCurrency(
      toNumber(row.gross_amount ?? row.net_amount),
      row.currency || 'TRY',
      0,
    )}`,
    alert: Boolean(row.due_date && row.due_date < today),
  };
}

/** The count and the records of a queue page, for countFigure and RecordsPanel. */
function toQueue<T>(
  query: {
    data: QueuePage<T> | undefined;
    isPending: boolean;
    isError: boolean;
    refetch: () => unknown;
  },
  toRecord: (row: T) => HubRecord,
) {
  return {
    count: { data: query.data?.count, isError: query.isError },
    records: {
      data: query.data?.results.map(toRecord),
      isPending: query.isPending,
      isError: query.isError,
      refetch: query.refetch,
    },
  };
}

export function ProcurementHubPage() {
  const canPending = hasRouteAccess(PENDING_REQUESTS_LINK);
  const canCreate = hasRouteAccess(CREATE);
  const canCritical = hasRouteAccess(CRITICAL);
  const canPayments = hasRouteAccess(PAYMENT_LISTS);
  const canReports = hasRouteAccess(REPORTS);

  const today = dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  // This week ends on Sunday (on a Sunday, today).
  const sunday = dayjs()
    .add((7 - dayjs().day()) % 7, 'day')
    .format('YYYY-MM-DD');

  // Each queue's first rows and its count come from one request.
  const pending = toQueue(
    useQuery({ ...pendingApprovalPageQueryOptions(ROWS), enabled: canPending }),
    pendingRecord,
  );
  const requestable = toQueue(
    useQuery({ ...requestablePlanningItemsQueryOptions(ROWS), enabled: canCreate }),
    requestableRecord,
  );
  const critical = toQueue(
    useQuery({ ...criticalItemsQueryOptions(ROWS), enabled: canCritical }),
    criticalRecord,
  );
  const due = toQueue(
    useQuery({ ...paymentsDueQueryOptions(sunday, ROWS + 1), enabled: canPayments }),
    (row: PoolRow) => paymentRecord(row, today),
  );
  const overdue = useQuery({
    ...overdueInstalmentCountQueryOptions(yesterday),
    enabled: canPayments,
  });
  const listsInApproval = useQuery({
    ...paymentListCountQueryOptions('submitted'),
    enabled: canPayments,
  });
  const tasks = useDepartmentTaskFigures('procurement', PROJECTS);

  // The queues below replace the Kritik Malzemeler card, Talep Oluştur moves
  // to the band and the Raporlar card to the band's Raporlar (the report hub).
  const cards: MenuCard[] = [
    {
      title: 'Satın Alma Talepleri',
      icon: 'fas fa-shopping-cart',
      iconColor: 'success',
      link: '/procurement/purchase-requests',
      features: [
        { label: 'Bekleyen Talepler', icon: 'fas fa-clock', link: PENDING_REQUESTS_LINK },
        {
          label: 'Kayıt Defteri',
          icon: 'fas fa-archive',
          link: '/procurement/purchase-requests/registry',
        },
      ],
    },
    {
      title: 'Ödeme Listeleri',
      icon: 'fas fa-money-check-dollar',
      iconColor: 'success',
      link: PAYMENT_LISTS,
      features: [{ label: 'Ödeme Havuzu', icon: 'fas fa-coins', link: POOL }],
    },
    {
      title: 'Tedarikçiler',
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
      title: 'Projeler',
      description: 'Satın alma departmanı görevleri.',
      icon: 'fas fa-project-diagram',
      iconColor: 'primary',
      link: PROJECTS,
      stat: tasks.enabled ? { value: countValue(tasks.active), label: 'aktif görev' } : undefined,
    },
  ];

  const stats: PageFigure[] = [
    ...(canPending
      ? [
          countFigure(
            {
              id: 'pending-requests',
              label: 'Onayınızı Bekleyen',
              icon: 'fas fa-clock',
              link: PENDING_REQUESTS_LINK,
            },
            pending.count,
          ),
        ]
      : []),
    ...(canCreate
      ? [
          countFigure(
            {
              id: 'requestable-items',
              label: 'Talepsiz Malzeme',
              icon: 'fas fa-boxes-stacked',
              link: CREATE,
            },
            requestable.count,
          ),
        ]
      : []),
    ...(canCritical
      ? [
          countFigure(
            {
              id: 'critical-items',
              label: 'Kritik Malzeme',
              icon: 'fas fa-exclamation-triangle',
              link: CRITICAL,
            },
            critical.count,
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
              link: POOL,
            },
            overdue,
          ),
        ]
      : []),
  ];

  const actions =
    canCreate || canReports ? (
      <>
        {canCreate ? (
          <Button component={AppLink} to={CREATE} leftSection={<FaIcon icon="fas fa-plus" />}>
            Talep Oluştur
          </Button>
        ) : null}
        {canReports ? (
          <Button
            component={AppLink}
            to={REPORTS}
            variant="default"
            leftSection={<FaIcon icon="fas fa-chart-bar" />}
          >
            Raporlar
          </Button>
        ) : null}
      </>
    ) : undefined;

  const queues: AttentionItem[] = [];
  if (canPayments) {
    queues.push({
      id: 'queue-lists',
      label: 'Ödeme listeleri',
      hint: 'Genel müdür onayında',
      icon: 'fas fa-money-check-dollar',
      color: 'yellow',
      link: `${PAYMENT_LISTS}?status=submitted`,
      count: listsInApproval,
    });
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

  const main: ReactNode[] = [];
  if (canPending) {
    main.push(
      <RecordsPanel
        key="pending"
        title="Onayınızı Bekleyen Talepler"
        icon="fas fa-clock"
        more={PENDING_REQUESTS_LINK}
        noun="Talepler"
        empty="Onayınızı bekleyen talep yok."
        query={pending.records}
      />,
    );
  }
  if (canCreate) {
    main.push(
      <RecordsPanel
        key="requestable"
        title="Talep Bekleyen Malzemeler"
        icon="fas fa-boxes-stacked"
        more={CREATE}
        moreLabel="Talep Oluştur"
        noun="Malzemeler"
        empty="Talebe dönüşmemiş planlama malzemesi yok."
        query={requestable.records}
      />,
    );
  }
  if (canCritical) {
    main.push(
      <RecordsPanel
        key="critical"
        title="Teslim Bekleyen Kritik Malzemeler"
        icon="fas fa-exclamation-triangle"
        more={CRITICAL}
        noun="Kritik malzemeler"
        empty="Teslim bekleyen kritik malzeme yok."
        query={critical.records}
      />,
    );
  }
  const side: ReactNode[] = [];
  if (canPayments) {
    side.push(
      <RecordsPanel
        key="due"
        title="Bu Hafta Ödenecekler"
        icon="fas fa-calendar-week"
        more={POOL}
        moreLabel="Ödeme Havuzu"
        noun="Taksitler"
        empty="Bu hafta vadesi gelen taksit yok."
        rows={ROWS + 1}
        query={due.records}
      />,
    );
  }
  if (queues.length > 0) {
    side.push(
      <AttentionPanel key="queues" title="Satın Almayı Bekleyenler" icon="fas fa-inbox" items={queues} />,
    );
  }

  let panels: ReactNode = null;
  if (main.length > 0 && side.length > 0) {
    panels = (
      <HubPanels>
        <>{main}</>
        <>{side}</>
      </HubPanels>
    );
  } else if (main.length > 0 || side.length > 0) {
    // One column only (an approver sees just their queue): full width.
    panels = <>{main.length > 0 ? main : side}</>;
  }

  return (
    <MenuCards
      title="Satın Alma"
      subtitle="Talepler, malzemeler ve ödemeler tek bakışta"
      stats={stats}
      actions={actions}
      compact
      cards={cards}
    >
      {panels}
    </MenuCards>
  );
}
