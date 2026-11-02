import { MenuCards, type MenuCard } from '@/ui';

// Ported from accounting/accounting.js.
const CARDS: MenuCard[] = [
  {
    title: 'Hakedişler',
    description: 'Seçilen yıl/ay için hakediş muhasebe çıktısını tablo olarak görüntüle.',
    icon: 'fas fa-file-invoice-dollar',
    iconColor: 'primary',
    link: '/accounting/subcontracting-statements',
  },
];

export function AccountingHubPage() {
  return (
    <MenuCards
      title="Muhasebe Modülü"
      subtitle="Dışa aktarımlar ve muhasebe entegrasyonları"
      cards={CARDS}
    />
  );
}
