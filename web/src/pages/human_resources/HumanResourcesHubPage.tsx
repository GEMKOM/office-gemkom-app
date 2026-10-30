import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import { pendingOverridesCountQueryOptions } from '@/api/human_resources/attendance';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { countFigure, countValue } from '../hubCount';

const PENDING_OVERRIDES = '/human_resources/attendance/pending-overrides';

export function HumanResourcesHubPage() {
  // Figures follow the cards: nothing is fetched for a page the user cannot open.
  const canApprove = hasRouteAccess(PENDING_OVERRIDES);
  const pending = useQuery({ ...pendingOverridesCountQueryOptions(), enabled: canApprove });

  // Ported from human_resources/human_resources.js. Cards the user cannot
  // open hide themselves. Both PDKS cards linked to the PDKS hub; they now
  // open the page each one describes. PDKS Kayıtları was blue like
  // Çalışanlar; purple keeps them apart.
  const cards: MenuCard[] = [
    {
      title: 'Çalışanlar',
      description: 'Çalışan listesini görüntüleyin ve yönetin',
      icon: 'fas fa-users',
      iconColor: 'primary',
      link: '/human_resources/users',
    },
    {
      title: 'Organizasyon',
      description: 'Organizasyon şemasını, departmanları ve pozisyonları yönetin',
      icon: 'fas fa-sitemap',
      iconColor: 'dark',
      link: '/human_resources/org',
    },
    {
      title: 'PDKS Onayları',
      description: 'Ofis dışı giriş taleplerini onaylayın veya reddedin',
      icon: 'fas fa-user-check',
      iconColor: 'warning',
      link: PENDING_OVERRIDES,
      stat: { value: countValue(pending), label: 'onay bekliyor' },
    },
    {
      title: 'PDKS Kayıtları',
      description: 'PDKS kayıtlarını filtreleyin ve inceleyin',
      icon: 'fas fa-clipboard-list',
      iconColor: 'purple',
      link: '/human_resources/attendance/records',
    },
    {
      title: 'İzin Yönetimi',
      description: 'İzin bakiyelerini düzenleyin ve bekleyen izin taleplerini yönetin',
      icon: 'fas fa-calendar-check',
      iconColor: 'success',
      link: '/human_resources/vacation',
    },
  ];

  const stats: PageFigure[] = canApprove
    ? [
        countFigure(
          {
            id: 'pending-overrides',
            label: 'PDKS Onayı Bekleyen',
            icon: 'fas fa-user-check',
            link: PENDING_OVERRIDES,
          },
          pending,
        ),
      ]
    : [];

  return (
    <MenuCards
      title="İnsan Kaynakları Modülü"
      subtitle="İnsan kaynakları süreçlerinizi yönetin ve çalışan bilgilerini takip edin"
      stats={stats}
      cards={cards}
    />
  );
}
