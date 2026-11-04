import { hasRouteAccess } from '@/auth/accessControl';
import { MenuCards, PendingValue, type MenuCard, type PageFigure } from '@/ui';
import { AttentionPanel, HubPanels } from '../hub/HubPanels';
import { countValue, useIsgSummary, usePendingApprovalCount, waitingBadge } from '../hubFigures';
import {
  AwayThisWeek,
  leaveDays,
  MY_LEAVE,
  PENDING,
  useCranePendingCount,
  useDepartmentRequestPendingCount,
  useMyLeave,
  useWaitingOnMe,
} from './generalHubData';

export function GeneralHubPage() {
  // Each pill counts what is waiting on the user behind the card; the cards
  // hide themselves (and skip the request) when the user cannot open them.
  // The same cached queries feed the Sizi Bekleyenler panel.
  const overtime = usePendingApprovalCount('overtime', PENDING.overtime);
  const vacation = usePendingApprovalCount('vacation', PENDING.vacation);
  const department = useDepartmentRequestPendingCount();
  const crane = useCranePendingCount();
  const isg = useIsgSummary();
  const waiting = useWaitingOnMe();
  const leave = useMyLeave();
  const canLeave = hasRouteAccess(MY_LEAVE);

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
      badge: waitingBadge(department.data, 'onayınızı bekliyor', 'yellow'),
    },
    {
      title: 'Vinç Talepleri',
      description: 'Vinç taleplerinin oluşturulması, onay süreçleri ve fiyat listesi.',
      icon: 'fas fa-truck-pickup',
      iconColor: 'secondary',
      link: '/general/crane-requests',
      badge: waitingBadge(crane.data, 'onayınızı bekliyor', 'yellow'),
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

  // The user's own figures: leave left this year and İSG actions on them.
  const stats: PageFigure[] = [
    ...(canLeave
      ? [
          {
            id: 'leave-left',
            label: 'Kalan İzin (gün)',
            value: leaveDays(leave),
            icon: 'fas fa-umbrella-beach',
            link: MY_LEAVE,
          },
        ]
      : []),
    {
      id: 'isg-mine',
      label: 'İSG Aksiyonum',
      value: countValue({ data: isg.data && (isg.data.mine_open ?? 0), isError: isg.isError }),
      icon: 'fas fa-helmet-safety',
      link: '/isg/issues?mine=true',
    },
  ].map((f) => ({ ...f, value: f.value ?? <PendingValue /> }));

  return (
    <MenuCards
      title="Genel Modülü"
      subtitle="Şirket geneli yönetim işlemlerinizi gerçekleştirin"
      stats={stats}
      compact
      cards={cards}
    >
      <HubPanels>
        {canLeave ? <AwayThisWeek key="away" /> : null}
        <AttentionPanel key="waiting" items={waiting} />
      </HubPanels>
    </MenuCards>
  );
}
