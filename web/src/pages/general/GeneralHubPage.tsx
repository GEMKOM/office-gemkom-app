import { MenuCards, type MenuCard } from '@/ui';
import { useIsgSummary, usePendingApprovalCount, waitingBadge } from '../hubFigures';

export function GeneralHubPage() {
  // Each pill counts what is waiting on the user behind the card; the cards
  // hide themselves (and skip the request) when the user cannot open them.
  const overtime = usePendingApprovalCount('overtime', '/general/overtime/pending');
  const vacation = usePendingApprovalCount('vacation', '/general/vacation/pending');
  const isg = useIsgSummary();

  // Ported from general/management.js. The İSG and Tartışmalarım cards are
  // open to everyone, so this hub is too (/general is always allowed); the
  // other cards show only to users who can open them.
  const cards: MenuCard[] = [
    {
      title: 'Makineler',
      description: 'Şirket makinelerinin envanteri, durum takibi ve planlama yönetimi.',
      icon: 'fas fa-cogs',
      iconColor: 'success',
      link: '/general/machines',
    },
    {
      title: 'Mesailer',
      description: 'Mesai talepleri, onay süreçleri ve mesai raporları yönetimi.',
      icon: 'fas fa-clock',
      iconColor: 'warning',
      link: '/general/overtime',
      badge: waitingBadge(overtime.data, 'onayınızı bekliyor', 'yellow'),
    },
    {
      title: 'İzin Talepleri',
      description: 'İzin taleplerinin oluşturulması, onay süreçleri ve bakiye takibi.',
      icon: 'fas fa-calendar-check',
      iconColor: 'primary',
      link: '/general/vacation',
      badge: waitingBadge(vacation.data, 'onayınızı bekliyor', 'yellow'),
    },
    {
      title: 'Departman Talepleri',
      description: 'Departman taleplerinin oluşturulması, onay süreçleri ve takibi.',
      icon: 'fas fa-boxes',
      iconColor: 'info',
      link: '/general/department-requests',
    },
    {
      title: 'Vinç Talepleri',
      description: 'Vinç taleplerinin oluşturulması, onay süreçleri ve fiyat listesi.',
      icon: 'fas fa-truck-pickup',
      iconColor: 'secondary',
      link: '/general/crane-requests',
    },
    {
      title: 'İSG Bildirimleri',
      description:
        'İş sağlığı ve güvenliği bildirimlerini takip edin, üzerinize atanan aksiyonları kapatın.',
      icon: 'fas fa-helmet-safety',
      iconColor: 'danger',
      link: '/isg/issues',
      badge: waitingBadge(isg.data?.mine_open, 'size atanmış', 'orange'),
    },
    {
      title: 'Tartışmalarım',
      description:
        'Açtığınız tartışma konuları ve yazdığınız yorumlar; yanıt gelenleri görün, yerinde yanıtlayın.',
      icon: 'fas fa-comments',
      iconColor: 'primary',
      link: '/general/discussions',
    },
  ];

  return (
    <MenuCards
      title="Genel Modülü"
      subtitle="Şirket geneli yönetim işlemlerinizi gerçekleştirin"
      cards={cards}
    />
  );
}
