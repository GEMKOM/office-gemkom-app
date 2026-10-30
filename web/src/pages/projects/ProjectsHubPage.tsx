import { MenuCards, type MenuCard } from '@/ui';

// Ported from projects/projects.js. Cards the user cannot open hide
// themselves. All three were blue; Tahminler takes yellow (like the sales
// cost table) and Referanslar purple (like the sales catalogue) to keep
// neighbours apart.
const CARDS: MenuCard[] = [
  {
    title: 'Proje Takibi',
    description: 'İş emirleri, proje durumu ve ilerleme takibi.',
    icon: 'fas fa-project-diagram',
    iconColor: 'primary',
    link: '/projects/project-tracking',
  },
  {
    title: 'Tahminler',
    description: 'Çizimlerden üretilen maliyet ve risk raporları; iş emri ve teklif tahminleri.',
    icon: 'fas fa-calculator',
    iconColor: 'warning',
    link: '/projects/estimates',
  },
  {
    title: 'Referanslar',
    description: 'Tahminde kullanılan bitmiş işler: kaynak listesi, faktör, inceleme ve birim süreler.',
    icon: 'fas fa-book-open',
    iconColor: 'purple',
    link: '/projects/references',
  },
];

export function ProjectsHubPage() {
  return (
    <MenuCards
      title="Projeler Modülü"
      subtitle="Proje takibi ve yönetim işlemlerinizi gerçekleştirin"
      cards={CARDS}
    />
  );
}
