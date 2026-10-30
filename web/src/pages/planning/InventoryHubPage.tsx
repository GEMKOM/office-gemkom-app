import { MenuCards, type MenuCard } from '@/ui';

// Ported from planning/inventory/inventory.js.
const CARDS: MenuCard[] = [
  {
    title: 'Stok Kartları',
    description: 'Stok kartları listesi ve yönetimi.',
    icon: 'fas fa-boxes',
    iconColor: 'primary',
    link: '/planning/inventory/cards',
  },
  {
    title: 'Ekipman',
    description: 'Ekipman envanteri ve zimmet işlemleri.',
    icon: 'fas fa-toolbox',
    iconColor: 'primary',
    link: '/planning/inventory/equipment',
  },
];

export function InventoryHubPage() {
  return <MenuCards title="Stok" subtitle="Stok yönetimi ve stok kartları" cards={CARDS} />;
}
