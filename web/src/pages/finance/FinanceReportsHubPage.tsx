import { MenuCards, type MenuCard } from '@/ui';

// Ported from finance/reports/reports.js.
const CARDS: MenuCard[] = [
  {
    title: 'Yönetici Özeti',
    description:
      'Finansal durumun genel görünümü, temel performans göstergeleri ve trend analizleri.',
    icon: 'fas fa-chart-pie',
    iconColor: 'primary',
    link: '/finance/reports/executive-overview',
  },
  {
    title: 'Proje Raporu',
    description: 'Proje bazlı satın alma analizleri, maliyet metrikleri ve performans takibi.',
    icon: 'fas fa-chart-line',
    iconColor: 'success',
    link: '/finance/reports/projects',
  },
];

export function FinanceReportsHubPage() {
  return (
    <MenuCards
      title="Finans Raporları"
      subtitle="Finansal analizler, maliyet raporları ve performans metrikleri"
      cards={CARDS}
    />
  );
}
