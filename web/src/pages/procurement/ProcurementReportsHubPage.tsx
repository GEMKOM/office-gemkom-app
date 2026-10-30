import { MenuCards, type MenuCard } from '@/ui';

// Ported from procurement/reports/reports.js.
const CARDS: MenuCard[] = [
  {
    title: 'Ürün Raporu',
    description: 'Ürün satın alma analizleri, miktar ve maliyet metrikleri.',
    icon: 'fas fa-chart-bar',
    iconColor: 'primary',
    link: '/procurement/reports/items',
  },
  {
    title: 'Tedarikçi Raporu',
    description: 'Tedarikçi performans analizleri, satın alma metrikleri ve DBS durumları.',
    icon: 'fas fa-chart-pie',
    iconColor: 'success',
    link: '/procurement/reports/suppliers',
  },
  {
    title: 'Personel Raporu',
    description:
      'Satın alma personeli performans analizleri, PR/PO metrikleri ve aktivite durumları.',
    icon: 'fas fa-users',
    iconColor: 'info',
    link: '/procurement/reports/staff',
  },
];

export function ProcurementReportsHubPage() {
  return (
    <MenuCards
      title="Raporlar"
      subtitle="Satın alma analizleri ve performans raporları"
      cards={CARDS}
    />
  );
}
