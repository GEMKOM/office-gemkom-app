import { hasRouteAccess } from '@/auth/accessControl';
import { useQuery } from '@tanstack/react-query';
import { activeUsersCountQueryOptions } from '@/api/human_resources/hubs';
import { vacationApprovalsInboxQueryOptions } from '@/api/human_resources/leave';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { AwayThisWeek } from '../general/generalHubData';
import { HubPanels } from '../hub/HubPanels';
import { countFigure, countValue } from '../hubCount';
import { DataQualityPanel, SUMMARY, USERS, VACATION } from './dataQuality';
import {
  ATTENDANCE,
  AttendanceTodayPanel,
  PENDING_OVERRIDES,
  PendingOverridesPanel,
  RECORDS,
  useAttendanceToday,
  usePendingOverridesCount,
} from './hrHubData';

// The PDKS card opens the PDKS hub, or else the one PDKS page the user has.
function pdksLink(): string {
  return (
    [ATTENDANCE, PENDING_OVERRIDES, RECORDS].find((route) => hasRouteAccess(route)) ?? ATTENDANCE
  );
}

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
  // open hide themselves. PDKS Onayları and PDKS Kayıtları are one PDKS card:
  // who is in now, with the approvals waiting as its badge.
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
      title: 'PDKS',
      description: 'Giriş-çıkış kayıtları, ofis dışı giriş onayları ve vardiyalar',
      icon: 'fas fa-id-card',
      iconColor: 'purple',
      link: pdksLink(),
      ...(today.canRecords
        ? { stat: { value: countValue(today.inside), label: 'kişi şu an içeride' } }
        : canApprove
          ? { stat: { value: countValue(pending), label: 'onay bekliyor' } }
          : {}),
      ...(today.canRecords && pending.data
        ? { badge: { label: `${pending.data} onay bekliyor`, color: 'yellow' as const } }
        : {}),
    },
    {
      title: 'İzin Yönetimi',
      description: 'İzin bakiyelerini düzenleyin ve bekleyen izin taleplerini yönetin',
      icon: 'fas fa-calendar-check',
      iconColor: 'success',
      link: VACATION,
      stat: { value: countValue(leaveInbox), label: 'izin onayı bekliyor' },
    },
    {
      title: 'Özel Günler',
      description: 'Uygulamanın bayramlarda ve özel günlerde nasıl görüneceğini önizleyin',
      icon: 'fas fa-cake-candles',
      iconColor: 'danger',
      link: '/human_resources/special-days',
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
  // Veri Eksikleri lists only checks the user can open; its rows come from
  // the users, PDKS and leave pages.
  const checks = canUsers || today.canRecords || canVacation || hasRouteAccess(SUMMARY);
  const panels = checks || canApprove;

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
            {checks ? <DataQualityPanel /> : null}
            <AwayThisWeek />
          </>
          {/* Everything PDKS in one column: today, then what waits on HR. */}
          {today.canRecords || canApprove ? (
            <>
              {today.canRecords ? <AttendanceTodayPanel counts={today.counts} /> : null}
              {canApprove ? <PendingOverridesPanel /> : null}
            </>
          ) : null}
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
