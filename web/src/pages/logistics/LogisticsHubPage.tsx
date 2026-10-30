import { MenuCards, type MenuCard } from '@/ui';

// Ported from logistics/logistics.js.
const CARDS: MenuCard[] = [
  {
    title: 'Projeler',
    description: 'Lojistik departmanı görevlerini görüntüleyin ve yönetin.',
    icon: 'fas fa-project-diagram',
    iconColor: 'primary',
    link: '/logistics/projects',
  },
  {
    title: 'Maliyet Satırları',
    description: 'Sevkiyat maliyeti girilmemiş iş emirleri ve maliyet satırları.',
    icon: 'fas fa-euro-sign',
    iconColor: 'primary',
    link: '/logistics/cost-lines',
  },
];

export function LogisticsHubPage() {
  return (
    <MenuCards
      title="Lojistik Modülü"
      subtitle="Lojistik süreçlerinizi yönetin ve optimize edin"
      cards={CARDS}
    />
  );
}
