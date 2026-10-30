import { Button } from '@mantine/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useState } from 'react';
import { customersQueryOptions } from '@/api';
import { offerCountQueryOptions, offersQueryOptions, type OffersParams } from '@/api/sales/offers';
import { formatNumber } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, MenuCards, PendingValue, type MenuCard, type PageFigure } from '@/ui';
import { CustomerFormModal } from './customers/CustomerFormModal';
import { OfferPipeline, RecentOffers, type PipelineStage } from './SalesHubPanels';
import css from './SalesHubPage.module.css';

// Open offers, stage by stage. Won and converted are counted apart; lost and
// cancelled are left out.
const STAGES: (Omit<PipelineStage, 'count'> & { filter: Pick<OffersParams, 'status' | 'status__in'> })[] = [
  { key: 'draft', label: 'Taslak', color: 'grey', filter: { status: 'draft' } },
  { key: 'preparing', label: 'Danışma / Fiyatlandırma', color: 'blue', filter: { status__in: 'consultation,pricing' } },
  { key: 'pending', label: 'Onay Bekliyor', color: 'yellow', filter: { status: 'pending_approval' } },
  { key: 'customer', label: 'Onaylandı / Sunuldu', color: 'purple', filter: { status__in: 'approved,submitted_customer' } },
];
const PENDING = STAGES.findIndex((stage) => stage.key === 'pending');
const WON: Pick<OffersParams, 'status__in'> = { status__in: 'won,converted' };
const RECENT: OffersParams = { ordering: '-created_at', page_size: 6 };

function figure(value: number | undefined, failed: boolean) {
  return failed ? '-' : value === undefined ? undefined : formatNumber(value);
}

/** Every request starts at once; nothing waits on anything else. */
function useSalesFigures(canCustomers: boolean, canOffers: boolean) {
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
  const recent = useQuery({ ...offersQueryOptions(RECENT), enabled: canOffers });

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
    openOffers: figure(open, stageCounts.some((q) => q.isError)),
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
  const data = useSalesFigures(canCustomers, canOffers);
  const [creatingCustomer, setCreatingCustomer] = useState(false);

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
      iconColor: 'info',
      link: '/sales/catalog',
    },
  ];

  const stats: PageFigure[] = [
    ...(canCustomers ? [{ id: 'active-customers', label: 'Aktif Müşteri', value: data.activeCustomers }] : []),
    ...(canOffers
      ? [
          { id: 'open-offers', label: 'Açık Teklif', value: data.openOffers },
          { id: 'pending-offers', label: 'Onay Bekleyen', value: data.pendingOffers },
        ]
      : []),
  ].map((f) => ({ ...f, value: f.value ?? <PendingValue /> }));

  const actions =
    canCustomers || canOffers ? (
      <>
        {canOffers ? (
          <Button
            variant="default"
            component={AppLink}
            to="/sales/offers/"
            leftSection={<FaIcon icon="fas fa-list" />}
          >
            Teklif Listesi
          </Button>
        ) : null}
        {canCustomers ? (
          <Button leftSection={<FaIcon icon="fas fa-plus" />} onClick={() => setCreatingCustomer(true)}>
            Yeni Müşteri
          </Button>
        ) : null}
      </>
    ) : undefined;

  return (
    <>
      <MenuCards
        title="Satış Modülü"
        subtitle="Müşteri yönetimi, teklif oluşturma ve satış süreçlerinizi yönetin"
        stats={stats}
        actions={actions}
        compact={canOffers}
        cards={cards}
      >
        {canOffers ? (
          <div className={css.panels}>
            <div className={css.cell}>
              <RecentOffers query={data.recent} />
            </div>
            <div className={css.cell}>
              <OfferPipeline stages={data.stages} won={data.won} />
            </div>
          </div>
        ) : null}
      </MenuCards>
      {creatingCustomer ? <CustomerFormModal onClose={() => setCreatingCustomer(false)} /> : null}
    </>
  );
}
