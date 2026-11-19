import { hasRouteAccess } from '@/auth/accessControl';
import { MenuCards, PendingValue, type MenuCard, type PageFigure } from '@/ui';
import { AttentionPanel, HubPanels } from '../hub/HubPanels';
import { countValue, useIsgSummary, waitingBadge } from '../hubFigures';
import {
  AwayThisWeek,
  leaveDays,
  MY_LEAVE,
  useCranePendingCount,
  useDepartmentRequestPendingCount,
  useMyLeave,
  useWaitingOnMe,
} from './generalHubData';

export function GeneralHubPage() {
  // Each pill counts what is waiting on the user behind the card; the cards
  // hide themselves (and skip the request) when the user cannot open them.
  // The same cached queries feed the Sizi Bekleyenler panel.
  const department = useDepartmentRequestPendingCount();
  const crane = useCranePendingCount();
  const isg = useIsgSummary();
  const waiting = useWaitingOnMe();
  const leave = useMyLeave();
  const canLeave = hasRouteAccess(MY_LEAVE);

  // Talepler (was Genel, reorganised 2026-11-19): the requests that cross
  // departments. Makineler moved to Depo, Mesailer to İnsan Kaynakları, İSG has
  // its own section; leave / overtime requests and approvals are in the user
  // menu. /general stays always allowed; each card shows only to users who can
  // open it.
  const cards: MenuCard[] = [
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
      title: 'Fason',
      description:
        'Atölyenin fason işleri: satınalma ve malzeme yan yana; depodan tedarikçiye gidiş ve dönüş.',
      icon: 'fas fa-people-carry',
      iconColor: 'warning',
      link: '/general/fason',
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
      title="Talepler"
      subtitle="Departman ve vinç talepleri, atölyenin fason işleri"
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
