import { MenuCards, type MenuCard } from '@/ui';

// Ported from general/department-requests/department-requests.js.
const CARDS: MenuCard[] = [
  {
    title: 'Tüm Talepler',
    description: 'Tüm departman taleplerinin listesi, oluşturma, düzenleme ve silme işlemleri.',
    icon: 'fas fa-list',
    iconColor: 'primary',
    link: '/general/department-requests/list',
  },
  {
    title: 'Bekleyen Talepler',
    description: 'Onay bekleyen departman taleplerinin listesi ve durum takibi.',
    icon: 'fas fa-clock',
    iconColor: 'warning',
    link: '/general/department-requests/pending',
  },
];

export function DepartmentRequestsHubPage() {
  return (
    <MenuCards
      title="Departman Talepleri"
      subtitle="Departman taleplerinin yönetimi ve takibi"
      cards={CARDS}
    />
  );
}
