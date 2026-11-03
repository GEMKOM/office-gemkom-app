import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import { myVacationRequestsQueryOptions } from '@/api/general/hubs';
import type { VacationRequest } from '@/api/general/vacation';
import { formatDate, formatNumber, toNumber } from '@/lib/format';
import { MenuCards, PendingValue, type MenuCard, type PageFigure, type StatusFamily } from '@/ui';
import {
  BreakdownPanel,
  HubPanels,
  PanelTotal,
  RecordsPanel,
  type HubRecord,
} from '../hub/HubPanels';
import { countValue, usePendingApprovalCount } from '../hubFigures';
import { AwayThisWeek, leaveDays, MY_LEAVE, useMyLeave } from './generalHubData';

const PENDING = '/general/vacation/pending';

const STATUS_FAMILY: Record<string, StatusFamily> = {
  approved: 'green',
  submitted: 'yellow',
  cancellation_requested: 'orange',
  rejected: 'red',
  cancelled: 'grey',
};

const shortDate = (value: string | undefined) =>
  formatDate(value, { day: 'numeric', month: 'short' });

function requestRecord(request: VacationRequest): HubRecord {
  const days = toNumber(request.duration_days);
  const range =
    request.end_date && request.end_date !== request.start_date
      ? `${shortDate(request.start_date)} – ${shortDate(request.end_date)}`
      : shortDate(request.start_date);
  return {
    key: request.id,
    link: `${MY_LEAVE}?request_id=${request.id}`,
    title: request.leave_type_label || request.leave_type || 'İzin',
    subtitle: range,
    status: {
      label: request.status_label || request.status || '-',
      color: STATUS_FAMILY[request.status ?? ''] ?? 'grey',
    },
    meta: days !== null ? `${formatNumber(days, Number.isInteger(days) ? 0 : 1)} gün` : undefined,
  };
}

const days = (value: number | string | undefined) => {
  const n = toNumber(value);
  return n === null ? undefined : n;
};

export function VacationHubPage() {
  const pending = usePendingApprovalCount('vacation', PENDING);
  const canMine = hasRouteAccess(MY_LEAVE);
  const leave = useMyLeave();
  const mine = useQuery({
    ...myVacationRequestsQueryOptions(5),
    select: (page) => page.results.map(requestRecord),
    enabled: canMine,
  });
  const annual = leave.data?.annual_leave;
  const next = leave.data?.upcoming_leave;

  // Ported from general/vacation/vacation.js.
  const cards: MenuCard[] = [
    {
      title: 'İzin Taleplerim',
      description: 'Yeni izin talebi oluşturun, bakiyenizi görün ve taleplerinizi yönetin.',
      icon: 'fas fa-calendar-plus',
      iconColor: 'primary',
      link: MY_LEAVE,
      stat: { value: leaveDays(leave), label: 'gün izin hakkınız kaldı' },
    },
    {
      title: 'Bekleyen Onaylar',
      description: 'Onayınızda olan izin taleplerini onaylayın veya reddedin.',
      icon: 'fas fa-user-check',
      iconColor: 'warning',
      link: PENDING,
      stat: { value: countValue(pending), label: 'onayınızı bekliyor' },
    },
  ];

  const stats: PageFigure[] = [
    ...(canMine
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
    ...(hasRouteAccess(PENDING)
      ? [
          {
            id: 'leave-pending',
            label: 'Onayınızı Bekleyen',
            value: countValue(pending),
            icon: 'fas fa-user-check',
            link: PENDING,
          },
        ]
      : []),
  ].map((f) => ({ ...f, value: f.value ?? <PendingValue /> }));

  return (
    <MenuCards
      title="İzin Talepleri"
      subtitle="İzin taleplerinizi oluşturun, takip edin ve onay süreçlerini yönetin"
      stats={stats}
      compact={canMine}
      cards={cards}
    >
      {canMine ? (
        <HubPanels>
          <>
            <RecordsPanel
              title="Son Taleplerim"
              icon="fas fa-clock-rotate-left"
              more={MY_LEAVE}
              noun="Talepler"
              empty="Henüz bir izin talebiniz yok."
              query={mine}
            />
            <AwayThisWeek />
          </>
          <BreakdownPanel
            title="Yıllık İzin Bakiyem"
            icon="fas fa-scale-balanced"
            failed={leave.isError}
            rows={[
              {
                key: 'used',
                label: 'Kullanılan',
                color: 'blue',
                count: leave.data ? (days(annual?.used_days) ?? 0) : undefined,
              },
              {
                key: 'left',
                label: 'Kalan',
                color: 'green',
                count: leave.data ? (days(annual?.remaining_days) ?? 0) : undefined,
              },
            ]}
            footer={
              next?.start_date ? (
                <PanelTotal
                  label={`Sıradaki: ${next.leave_type_label ?? 'İzin'}`}
                  value={shortDate(next.start_date)}
                />
              ) : undefined
            }
          />
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
