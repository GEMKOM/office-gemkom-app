import { MenuCards, type MenuCard } from '@/ui';

// Ported from finance/finance.js. Feature links take the card's colour
// (legacy had them dark red).
const CARDS: MenuCard[] = [
  {
    title: 'Finans İşlemleri',
    description: 'Satın alma siparişleri, ödemeler, tahsilatlar, giderler, krediler ve vergiler.',
    icon: 'fas fa-coins',
    iconColor: 'primary',
    link: '/finance/purchase-orders',
  },
  {
    title: 'Raporlar',
    description: 'Finansal analizler, maliyet raporları ve performans metrikleri.',
    icon: 'fas fa-chart-bar',
    iconColor: 'info',
    link: '/finance/reports',
    features: [
      {
        label: 'Yönetici Özeti',
        icon: 'fas fa-chart-pie',
        link: '/finance/reports/executive-overview',
      },
      { label: 'Proje Raporu', icon: 'fas fa-chart-line', link: '/finance/reports/projects' },
    ],
  },
];

export function FinanceHubPage() {
  return (
    <MenuCards
      title="Finans Modülü"
      subtitle="Finansal süreçlerinizi yönetin ve mali durumunuzu takip edin"
      cards={CARDS}
    />
  );
}
