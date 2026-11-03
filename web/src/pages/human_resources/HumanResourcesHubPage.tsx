import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import { activeUsersCountQueryOptions } from '@/api/human_resources/hubs';
import { vacationApprovalsInboxQueryOptions } from '@/api/human_resources/leave';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { AwayThisWeek } from '../general/generalHubData';
import { HubPanels } from '../hub/HubPanels';
import { countFigure, countValue } from '../hubCount';
import {
  AttendanceTodayPanel,
  PENDING_OVERRIDES,
  PendingOverridesPanel,
  RECORDS,
  useAttendanceToday,
  usePendingOverridesCount,
} from './hrHubData';

const USERS = '/human_resources/users';
const VACATION = '/human_resources/vacation';

export function HumanResourcesHubPage() {
  // Figures follow the cards: nothing is fetched for a page the user cannot open.
  const canApprove = hasRouteAccess(PENDING_OVERRIDES);
  const canUsers = hasRouteAccess(USERS);
  const canVacation = hasRouteAccess(VACATION);
  const pending = usePendingOverridesCount();
  const today = useAttendanceToday();
  const staff = useQuery({ ...activeUsersCountQueryOptions(), enabled: canUsers });
  // The HR leave inbox (final-stage approvals and cancellation requests); the
  // same request the İzin Yönetimi page makes.
  const leaveInbox = useQuery({
    ...vacationApprovalsInboxQueryOptions(),
    select: (page) => page.count,
    enabled: canVacation,
  });

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
      link: USERS,
      stat: { value: countValue(staff), label: 'aktif çalışan' },
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
      link: RECORDS,
      stat: { value: countValue(today.inside), label: 'kişi şu an içeride' },
    },
    {
      title: 'İzin Yönetimi',
      description: 'İzin bakiyelerini düzenleyin ve bekleyen izin taleplerini yönetin',
      icon: 'fas fa-calendar-check',
      iconColor: 'success',
      link: VACATION,
      stat: { value: countValue(leaveInbox), label: 'izin onayı bekliyor' },
    },
  ];

  // What waits on HR first, then the head counts.
  const stats: PageFigure[] = [
    ...(canApprove
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
      : []),
    ...(canVacation
      ? [
          countFigure(
            {
              id: 'leave-inbox',
              label: 'İzin Onayı Bekleyen',
              icon: 'fas fa-calendar-check',
              link: VACATION,
            },
            leaveInbox,
          ),
        ]
      : []),
    ...(today.canRecords
      ? [
          countFigure(
            {
              id: 'inside-now',
              label: 'Şu An İçeride',
              icon: 'fas fa-building-user',
              link: `${RECORDS}?status=active`,
            },
            today.inside,
          ),
        ]
      : []),
    ...(canUsers
      ? [
          countFigure(
            { id: 'active-staff', label: 'Aktif Çalışan', icon: 'fas fa-users', link: USERS },
            staff,
          ),
        ]
      : []),
  ];
  const panels = canApprove || today.canRecords;

  return (
    <MenuCards
      title="İnsan Kaynakları Modülü"
      subtitle="İnsan kaynakları süreçlerinizi yönetin ve çalışan bilgilerini takip edin"
      stats={stats}
      compact={panels}
      cards={cards}
    >
      {panels ? (
        <HubPanels>
          <>
            {canApprove ? <PendingOverridesPanel /> : null}
            <AwayThisWeek />
          </>
          {today.canRecords ? <AttendanceTodayPanel counts={today.counts} /> : null}
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
