import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  myPurchaseRequestsQueryOptions,
  purchaseRequestCountQueryOptions,
} from '@/api/procurement/hubs';
import type { PurchaseRequestRow } from '@/api/procurement/purchaseRequests';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, formatNumber, toNumber } from '@/lib/format';
import { MenuCards, type MenuCard, type StatusFamily } from '@/ui';
import { BreakdownPanel, HubPanels, RecordsPanel, type HubRecord } from '../hub/HubPanels';
import { countFigure } from '../hubCount';
import { PENDING_REQUESTS_LINK, usePendingRequests } from './pendingRequests';

const REGISTRY = '/procurement/purchase-requests/registry';

// The user's own requests by status; the registry opens on the user's own.
const STAGES = [
  { key: 'submitted', label: 'Onay Bekliyor', color: 'yellow' },
  { key: 'approved', label: 'Onaylandı', color: 'green' },
  { key: 'rejected', label: 'Reddedildi', color: 'red' },
] as const;

const STATUS_FAMILY: Record<string, StatusFamily> = {
  submitted: 'yellow',
  approved: 'green',
  rejected: 'red',
  cancelled: 'grey',
};

function requestRecord(request: PurchaseRequestRow): HubRecord {
  const total = toNumber(request.total_amount_eur);
  return {
    key: request.id,
    link: `${REGISTRY}?talep=${encodeURIComponent(request.request_number)}`,
    code: request.request_number,
    title: request.title || '-',
    subtitle: request.created_at
      ? formatDate(request.created_at, { day: 'numeric', month: 'short', year: 'numeric' })
      : undefined,
    status: {
      label: request.status_label || request.status,
      color: STATUS_FAMILY[request.status] ?? 'grey',
    },
    // The list's totals are always in euros.
    meta: total ? `€${formatNumber(total, 2)}` : '-',
  };
}

export function PurchaseRequestsHubPage() {
  const pending = usePendingRequests();
  const { user } = useAuth();
  const canRegistry = hasRouteAccess(REGISTRY);
  const mineByStatus = useQueries({
    queries: STAGES.map((stage) => ({
      ...purchaseRequestCountQueryOptions({ requestor: user.id, status: stage.key }),
      enabled: canRegistry,
    })),
  });
  const recent = useQuery({
    ...myPurchaseRequestsQueryOptions(user.id, 6),
    select: (page) => page.results.map(requestRecord),
    enabled: canRegistry,
  });
  const mineLink = (status?: string) =>
    `${REGISTRY}?requestor=${user.id}${status ? `&status=${status}` : ''}`;

  // Ported from procurement/purchase-requests/purchase-requests.js.
  const cards: MenuCard[] = [
    {
      title: 'Talep Oluştur',
      description: 'Yeni satın alma talebi oluşturma ve form yönetimi.',
      icon: 'fas fa-plus',
      iconColor: 'primary',
      link: '/procurement/purchase-requests/create',
    },
    {
      title: 'Bekleyen Talepler',
      description: 'Onay bekleyen satın alma taleplerinin listesi ve durum takibi.',
      icon: 'fas fa-clock',
      iconColor: 'warning',
      link: PENDING_REQUESTS_LINK,
      stat: pending.stat,
    },
    {
      title: 'Kayıt Defteri',
      description: 'Tüm satın alma taleplerinin geçmişi ve kayıt defteri.',
      icon: 'fas fa-archive',
      iconColor: 'info',
      link: REGISTRY,
    },
  ];

  const stats = [
    ...pending.stats,
    ...(canRegistry
      ? [
          countFigure(
            {
              id: 'my-submitted',
              label: 'Onaydaki Taleplerim',
              icon: 'fas fa-hourglass-half',
              link: mineLink('submitted'),
            },
            mineByStatus[0]!,
          ),
        ]
      : []),
  ];

  return (
    <MenuCards
      title="Satın Alma Talepleri"
      subtitle="Satın alma taleplerinin yönetimi ve takibi"
      stats={stats}
      compact={canRegistry}
      cards={cards}
    >
      {canRegistry ? (
        <HubPanels>
          <RecordsPanel
            title="Son Taleplerim"
            icon="fas fa-clock-rotate-left"
            more={mineLink()}
            noun="Talepler"
            empty="Henüz oluşturduğunuz bir satın alma talebi yok."
            query={recent}
          />
          <BreakdownPanel
            title="Taleplerim"
            icon="fas fa-filter"
            failed={mineByStatus.some((q) => q.isError)}
            rows={STAGES.map((stage, i) => ({
              key: stage.key,
              label: stage.label,
              color: stage.color,
              count: mineByStatus[i]!.data,
              link: mineLink(stage.key),
            }))}
          />
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
