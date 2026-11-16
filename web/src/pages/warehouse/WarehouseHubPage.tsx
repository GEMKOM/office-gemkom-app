import { useQuery } from '@tanstack/react-query';
import { stockCountsQueryOptions } from '@/api/warehouse/counts';
import { hasRouteAccess } from '@/auth/accessControl';
import { MenuCards, visibleMenuCards, type MenuCard } from '@/ui';

const RECEIPTS = '/warehouse/goods-receipts';
const COUNTS = '/warehouse/counts';
const SLIPS = '/warehouse/production-slips';
const TRANSFERS = '/warehouse/transfers';
const PIECES = '/warehouse/pieces';
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
      title: 'Mal Kabul',
      description:
        'Siparişe karşı gelen malzeme, irsaliyesiyle; stoğa ve planlama kalemlerine işlenir.',
      icon: 'fas fa-truck-loading',
      iconColor: 'teal',
      link: RECEIPTS,
    },
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
      title: 'İmalata Çıkış / İade',
      description: 'Talep olmadan imalata verilen ve imalattan dönen malzeme, iş numarasıyla.',
      icon: 'fas fa-dolly-flatbed',
      iconColor: 'green',
      link: SLIPS,
    },
    {
      title: 'Depo Transferi',
      description: 'Hammadde, İş Emri ve Mamul arasında, işler arasında stok aktarımı.',
      icon: 'fas fa-exchange-alt',
      iconColor: 'violet',
      link: TRANSFERS,
    },
    {
      title: 'Sac ve Boy Stoğu',
      description:
        'Sac, profil, boru ve çubuk parçaları: ölçü, adet, ağırlık ve yer; fasona gönderme.',
      icon: 'fas fa-layer-group',
      iconColor: 'red',
      link: PIECES,
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
