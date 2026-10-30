import { MenuCards, type MenuCard } from '@/ui';

// Ported from management/reports/reports.js. Cards the user cannot open hide themselves.
const CARDS: MenuCard[] = [
  {
    title: 'Genel Bakış',
    description: 'Üretim, satış, maliyet, taşeron, satınalma ve kalite metriklerinin dönem bazlı özeti.',
    icon: 'fas fa-chart-line',
    iconColor: 'primary',
    link: '/management/reports/overview',
  },
  {
    title: 'Nakit Akış Tablosu',
    description: 'Satış girişleri ile satınalma çıkışlarının birleşik nakit akış tablosu.',
    icon: 'fas fa-money-bill-wave',
    iconColor: 'success',
    link: '/management/reports/cash-flow',
  },
];

export function ManagementReportsHubPage() {
  return (
    <MenuCards
      title="Yönetim Raporları"
      subtitle="Dönem bazlı performans raporları ve karşılaştırmalar"
      cards={CARDS}
    />
  );
}
