import { MenuCards, type MenuCard } from '@/ui';

// Ported from management/management.js. Cards the user cannot open hide
// themselves. Analitik was blue like Dashboard; purple keeps neighbours apart.
const CARDS: MenuCard[] = [
  {
    title: 'Dashboard',
    description: 'Genel performans göstergeleri, önemli metrikler ve hızlı erişim panosu.',
    icon: 'fas fa-tachometer-alt',
    iconColor: 'primary',
    link: '/management/dashboard',
  },
  {
    title: 'Raporlar',
    description: 'Detaylı analiz raporları, performans değerlendirmeleri ve trend analizleri.',
    icon: 'fas fa-chart-bar',
    iconColor: 'success',
    link: '/management/reports',
  },
  {
    title: 'Analitik',
    description: 'Gelişmiş veri analizi, tahminleme modelleri ve stratejik öngörüler.',
    icon: 'fas fa-chart-pie',
    iconColor: 'purple',
    link: '/management/analytics',
  },
];

export function ManagementHubPage() {
  return (
    <MenuCards
      title="Yönetim Modülü"
      subtitle="Şirket yönetimi ve analitik işlemlerinizi gerçekleştirin"
      cards={CARDS}
    />
  );
}
