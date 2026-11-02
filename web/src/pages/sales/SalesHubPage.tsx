import { useQueries, useQuery } from '@tanstack/react-query';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { customersQueryOptions } from '@/api';
import {
  offerCountQueryOptions,
  offersQueryOptions,
  type Offer,
  type OffersParams,
} from '@/api/sales/offers';
import { useAuth } from '@/auth/AuthProvider';
import { formatNumber } from '@/lib/format';
import { MenuCards, PendingValue, type MenuCard, type PageFigure } from '@/ui';
import { OfferPipeline, RecentOffers, type PipelineStage } from './SalesHubPanels';
import css from './SalesHubPage.module.css';

// Open offers, stage by stage. Won and converted are counted apart; lost and
// cancelled are left out.
const STAGES: (Omit<PipelineStage, 'count'> & {
  filter: Pick<OffersParams, 'status' | 'status__in'>;
})[] = [
  { key: 'draft', label: 'Taslak', color: 'grey', filter: { status: 'draft' } },
  {
    key: 'preparing',
    label: 'Danışma / Fiyatlandırma',
    color: 'blue',
    filter: { status__in: 'consultation,pricing' },
  },
  {
    key: 'pending',
    label: 'Onay Bekliyor',
    color: 'yellow',
    filter: { status: 'pending_approval' },
  },
  {
    key: 'customer',
    label: 'Onaylandı / Sunuldu',
    color: 'purple',
    filter: { status__in: 'approved,submitted_customer' },
  },
];
const PENDING = STAGES.findIndex((stage) => stage.key === 'pending');
const WON: Pick<OffersParams, 'status__in'> = { status__in: 'won,converted' };
const RECENT_COUNT = 6;

function figure(value: number | undefined, failed: boolean) {
  return failed ? '-' : value === undefined ? undefined : formatNumber(value);
}

const byNewest = (a: Offer, b: Offer) => (b.created_at ?? '').localeCompare(a.created_at ?? '');

/** Every request starts at once; nothing waits on anything else. */
function useSalesFigures(canCustomers: boolean, canOffers: boolean, userId: number) {
  const customers = useQuery({
    ...customersQueryOptions({ is_active: true, page_size: 1 }),
    select: (page) => page.count,
    enabled: canCustomers,
  });
  const counts = useQueries({
    queries: [...STAGES.map((stage) => stage.filter), WON].map((filter) => ({
      ...offerCountQueryOptions(filter),
      enabled: canOffers,
    })),
  });
  // The user's own offers. The backend lists offers awaiting the user's
  // approval first whatever the ordering, so take a few extra and sort here.
  const recent = useQuery({
    ...offersQueryOptions({
      created_by: userId,
      ordering: '-created_at',
      page_size: RECENT_COUNT * 2,
    }),
    select: (page) => [...page.results].sort(byNewest).slice(0, RECENT_COUNT),
    enabled: canOffers,
  });

  const stageCounts = counts.slice(0, STAGES.length);
  const stages: PipelineStage[] = STAGES.map(({ key, label, color }, i) => ({
    key,
    label,
    color,
    count: stageCounts[i]!.data,
  }));
  const open = stageCounts.every((q) => q.data !== undefined)
    ? stageCounts.reduce((sum, q) => sum + q.data!, 0)
    : undefined;

  return {
    activeCustomers: figure(customers.data, customers.isError),
    openOffers: figure(
      open,
      stageCounts.some((q) => q.isError),
    ),
    pendingOffers: figure(stages[PENDING]!.count, stageCounts[PENDING]!.isError),
    won: counts[STAGES.length]!.data,
    stages,
    recent,
  };
}

export function SalesHubPage() {
  // Figures follow the cards: nothing is fetched for a page the user cannot open.
  const canCustomers = hasRouteAccess('/sales/customers');
  const canOffers = hasRouteAccess('/sales/offers');
  const { user } = useAuth();
  const data = useSalesFigures(canCustomers, canOffers, user.id);

  // Ported from sales/sales.js. Cards the user cannot open hide themselves.
  const cards: MenuCard[] = [
    {
      title: 'Maliyet Tablosu',
      description: 'İş emirlerinin maliyet özetleri',
      icon: 'fas fa-calculator',
      iconColor: 'warning',
      link: '/sales/cost-table',
    },
    {
      title: 'Müşteriler',
      description: 'Müşteri bilgileri ve iletişim detayları',
      icon: 'fas fa-users',
      iconColor: 'primary',
      link: '/sales/customers',
      stat: { value: data.activeCustomers, label: 'aktif müşteri' },
    },
    {
      title: 'Teklifler',
      description: 'Fiyatlandırma, departman görüşü ve onay süreci',
      icon: 'fas fa-file-invoice-dollar',
      iconColor: 'success',
      link: '/sales/offers',
      stat: { value: data.openOffers, label: 'açık teklif' },
    },
    {
      title: 'Ürün Kataloğu',
      description: 'Teklif şablonları ve ürün ağaçları',
      icon: 'fas fa-book',
      iconColor: 'purple',
      link: '/sales/catalog',
    },
  ];

  // Each figure opens the list behind it.
  const stats: PageFigure[] = [
    ...(canCustomers
      ? [
          {
            id: 'active-customers',
            label: 'Aktif Müşteri',
            value: data.activeCustomers,
            icon: 'fas fa-users',
            link: '/sales/customers',
          },
        ]
      : []),
    ...(canOffers
      ? [
          {
            id: 'open-offers',
            label: 'Açık Teklif',
            value: data.openOffers,
            icon: 'fas fa-file-invoice-dollar',
            link: '/sales/offers/',
          },
          {
            id: 'pending-offers',
            label: 'Onay Bekleyen',
            value: data.pendingOffers,
            icon: 'fas fa-hourglass-half',
            link: '/sales/offers/',
          },
        ]
      : []),
  ].map((f) => ({ ...f, value: f.value ?? <PendingValue /> }));

  return (
    <MenuCards
      title="Satış Modülü"
      subtitle="Müşteri yönetimi, teklif oluşturma ve satış süreçlerinizi yönetin"
      stats={stats}
      compact={canOffers}
      cards={cards}
    >
      {canOffers ? (
        <div className={css.panels}>
          <div className={css.cell}>
            <RecentOffers query={data.recent} userId={user.id} />
          </div>
          <div className={css.cell}>
            <OfferPipeline stages={data.stages} won={data.won} />
          </div>
        </div>
      ) : null}
    </MenuCards>
  );
}
