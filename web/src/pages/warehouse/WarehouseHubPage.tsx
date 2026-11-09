import { useQuery } from '@tanstack/react-query';
import { stockCountsQueryOptions } from '@/api/warehouse/counts';
import { hasRouteAccess } from '@/auth/accessControl';
import { MenuCards, visibleMenuCards, type MenuCard } from '@/ui';

const COUNTS = '/warehouse/counts';
const CARDS = '/planning/inventory/cards';
const PULLS = '/manufacturing/material-tracking/pull-requests';

/** Depo: the warehouse's own screens, plus the stock pages it works with. */
export function WarehouseHubPage() {
  const canCounts = hasRouteAccess(COUNTS);
  const drafts = useQuery({
    ...stockCountsQueryOptions({ status: 'draft', page_size: 1 }),
    enabled: canCounts,
  });

  const cards: MenuCard[] = [
    {
      title: 'Sayım',
      description: 'Depo sayımı; işlenen farklar stoğa düzeltme olarak yansır.',
      icon: 'fas fa-clipboard-check',
      iconColor: 'primary',
      link: COUNTS,
      stat: {
        value: drafts.isSuccess ? String(drafts.data.count) : '–',
        label: 'açık sayım',
      },
    },
    {
      title: 'Stok Kartları',
      description: 'Kartlar, Hammadde / İş Emri / Mamul bakiyeleri ve stok hareketleri.',
      icon: 'fas fa-boxes',
      iconColor: 'blue',
      link: CARDS,
    },
    {
      title: 'Depo Çekme Talepleri',
      description: 'İmalata teslim edilecek malzeme talepleri.',
      icon: 'fas fa-dolly',
      iconColor: 'orange',
      link: PULLS,
    },
  ];

  return (
    <MenuCards
      title="Depo Modülü"
      subtitle="Stok, sayım ve depo hareketleri"
      cards={visibleMenuCards(cards)}
    />
  );
}
