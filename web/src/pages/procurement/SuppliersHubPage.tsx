import { MenuCards, type MenuCard } from '@/ui';

// Ported from procurement/suppliers/suppliers.js.
const CARDS: MenuCard[] = [
  {
    title: 'Tedarikçi Listesi',
    description: 'Tedarikçi bilgileri, performans takibi ve tedarikçi değerlendirme yönetimi.',
    icon: 'fas fa-list',
    iconColor: 'primary',
    link: '/procurement/suppliers/list',
  },
  {
    title: 'Ödeme Koşulları',
    description: 'Ödeme koşulları tanımlama, düzenleme ve tedarikçi bazında yönetimi.',
    icon: 'fas fa-credit-card',
    iconColor: 'success',
    link: '/procurement/suppliers/payment-terms',
  },
];

export function SuppliersHubPage() {
  return (
    <MenuCards
      title="Tedarikçiler"
      subtitle="Tedarikçi bilgileri ve ödeme koşulları yönetimi"
      cards={CARDS}
    />
  );
}
