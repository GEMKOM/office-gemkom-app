import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { HubPanels } from '../../hub/HubPanels';
import { countFigure, countValue } from '../../hubCount';
import {
  AttendanceTodayPanel,
  PENDING_OVERRIDES,
  PendingOverridesPanel,
  RECORDS,
  useAttendanceToday,
  usePendingOverridesCount,
} from '../hrHubData';

export function AttendanceHubPage() {
  // Figures follow the cards: nothing is fetched for a page the user cannot open.
  const canApprove = hasRouteAccess(PENDING_OVERRIDES);
  const pending = usePendingOverridesCount();
  const today = useAttendanceToday();

  // Ported from human_resources/attendance/attendance.js. Cards the user
  // cannot open hide themselves. Kayıtlar, Özet and Vardiya Kuralları were
  // all blue; Kayıtlar takes purple (as on the HR hub) and Vardiya Kuralları
  // grey to keep neighbours apart.
  const cards: MenuCard[] = [
    {
      title: 'Onay Bekleyenler',
      description: 'Ofis dışı giriş taleplerini onaylayın veya reddedin',
      icon: 'fas fa-user-clock',
      iconColor: 'warning',
      link: PENDING_OVERRIDES,
      stat: { value: countValue(pending), label: 'onay bekliyor' },
    },
    {
      title: 'Kayıtlar',
      description: 'PDKS kayıtlarını filtreleyin ve inceleyin',
      icon: 'fas fa-clipboard-list',
      iconColor: 'purple',
      link: RECORDS,
      stat: { value: countValue(today.inside), label: 'kişi şu an içeride' },
    },
    {
      title: 'Özet',
      description: 'Kullanıcı bazlı PDKS özet metriklerini görüntüleyin',
      icon: 'fas fa-chart-bar',
      iconColor: 'primary',
      link: '/human_resources/attendance/summary',
    },
    {
      title: 'Vardiya Kuralları',
      description: 'Vardiya saatlerini ve fazla mesai eşiğini yönetin',
      icon: 'fas fa-clock',
      iconColor: 'secondary',
      link: '/human_resources/attendance/shift-rules',
    },
  ];

  const stats: PageFigure[] = [
    ...(canApprove
      ? [
          countFigure(
            {
              id: 'pending-overrides',
              label: 'Onay Bekleyen',
              icon: 'fas fa-user-clock',
              link: PENDING_OVERRIDES,
            },
            pending,
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
          countFigure(
            {
              id: 'on-leave',
              label: 'Bugün İzinli',
              icon: 'fas fa-umbrella-beach',
              link: `${RECORDS}?status=leave`,
            },
            today.onLeave,
          ),
        ]
      : []),
  ];
  const panels = canApprove || today.canRecords;

  return (
    <MenuCards
      title="PDKS"
      subtitle="PDKS kayıtlarını yönetin ve ofis dışı giriş taleplerini değerlendirin"
      stats={stats}
      compact={panels}
      cards={cards}
    >
      {panels ? (
        <HubPanels>
          {canApprove ? <PendingOverridesPanel /> : null}
          {today.canRecords ? <AttendanceTodayPanel counts={today.counts} /> : null}
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
