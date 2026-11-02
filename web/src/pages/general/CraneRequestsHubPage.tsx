import { MenuCards, type MenuCard } from '@/ui';

// Ported from general/crane-requests/crane-requests.js.
const CARDS: MenuCard[] = [
  {
    title: 'Tüm Talepler',
    description: 'Tüm vinç/platform taleplerinin listesi, yeni talep oluşturma ve tamamlama işlemleri.',
    icon: 'fas fa-list',
    iconColor: 'primary',
    link: '/general/crane-requests/list',
  },
  {
    title: 'Bekleyen Talepler',
    description: 'Onayınızı bekleyen vinç taleplerinin listesi ve onay/red işlemleri.',
    icon: 'fas fa-clock',
    iconColor: 'warning',
    link: '/general/crane-requests/pending',
  },
  {
    title: 'Fiyat Listesi',
    description: 'Kiralık vinç ve platform fiyat listesi; yetkili kullanıcılar için fiyat güncelleme.',
    icon: 'fas fa-tags',
    iconColor: 'success',
    link: '/general/crane-requests/prices',
  },
];

export function CraneRequestsHubPage() {
  return (
    <MenuCards
      title="Vinç Talepleri"
      subtitle="Kiralık vinç ve platform taleplerinin yönetimi ve takibi"
      cards={CARDS}
    />
  );
}
