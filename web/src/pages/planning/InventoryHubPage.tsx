import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import { equipmentCountQueryOptions, stockCardCountQueryOptions } from '@/api/planning/hubs';
import { MenuCards, type MenuCard } from '@/ui';
import { countValue } from '../hubCount';

const CARDS = '/planning/inventory/cards';
const EQUIPMENT = '/planning/inventory/equipment';

export function InventoryHubPage() {
  const cardsCount = useQuery({ ...stockCardCountQueryOptions(), enabled: hasRouteAccess(CARDS) });
  const equipment = useQuery({
    ...equipmentCountQueryOptions(),
    enabled: hasRouteAccess(EQUIPMENT),
  });

  // Ported from planning/inventory/inventory.js. Ekipman was blue like Stok
  // Kartları; green keeps them apart.
  const cards: MenuCard[] = [
    {
      title: 'Stok Kartları',
      description: 'Stok kartları listesi ve yönetimi.',
      icon: 'fas fa-boxes',
      iconColor: 'primary',
      link: CARDS,
      stat: { value: countValue(cardsCount), label: 'stok kartı' },
    },
    {
      title: 'Ekipman',
      description: 'Ekipman envanteri ve zimmet işlemleri.',
      icon: 'fas fa-toolbox',
      iconColor: 'success',
      link: EQUIPMENT,
      stat: { value: countValue(equipment), label: 'aktif ekipman' },
    },
  ];

  return <MenuCards title="Stok" subtitle="Stok yönetimi ve stok kartları" cards={cards} />;
}
