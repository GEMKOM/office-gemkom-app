import { MenuCards, type MenuCard } from '@/ui';

// Ported from planning/planning.js.
const CARDS: MenuCard[] = [
  {
    title: 'Departman Talepleri',
    description: 'Onaylanan departman taleplerinin listesi ve transfer işlemleri.',
    icon: 'fas fa-boxes',
    iconColor: 'primary',
    link: '/planning/department-requests',
  },
  {
    title: 'Görev Şablonları',
    description: 'Departman görev şablonlarını yönetin ve oluşturun.',
    icon: 'fas fa-tasks',
    iconColor: 'primary',
    link: '/planning/task-templates',
  },
  {
    title: 'Stok',
    description: 'Stok yönetimi ve stok kartları.',
    icon: 'fas fa-warehouse',
    iconColor: 'primary',
    link: '/planning/inventory',
  },
  {
    title: 'Projeler',
    description: 'Planlama departmanı görevlerini görüntüleyin ve yönetin.',
    icon: 'fas fa-project-diagram',
    iconColor: 'primary',
    link: '/planning/projects',
  },
  {
    title: 'Proje Planlama',
    description: 'İmalat iş planını kurun, kapasite önerilerini ve sapmaları takip edin.',
    icon: 'fas fa-calendar-alt',
    iconColor: 'primary',
    link: '/planning/project-planning',
  },
  {
    title: 'Malzeme Maliyeti Satırları',
    description: 'Satın alma bekleyen iş emirleri ve malzeme maliyeti satırlarını yönetin.',
    icon: 'fas fa-shopping-cart',
    iconColor: 'primary',
    link: '/planning/procurement-lines',
  },
  {
    title: 'Planlama Kalemleri',
    description: 'Planlama taleplerindeki ürün/kalem listesini filtreleyin ve takip edin.',
    icon: 'fas fa-list',
    iconColor: 'primary',
    link: '/planning/items',
  },
];

export function PlanningHubPage() {
  return (
    <MenuCards
      title="Planlama"
      subtitle="Planlama süreçlerinizi yönetin ve optimize edin"
      cards={CARDS}
    />
  );
}
