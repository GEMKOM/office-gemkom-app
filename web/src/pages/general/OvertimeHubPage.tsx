import { hasRouteAccess } from '@/auth/accessControl';
import { useQueries, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  overtimeCountQueryOptions,
  overtimePageQueryOptions,
  overtimeUsersCountQueryOptions,
} from '@/api/general/hubs';
import type { OvertimeRequest } from '@/api/general/overtime';
import { formatDate, formatNumber, formatTime, toNumber } from '@/lib/format';
import { MenuCards, PendingValue, type MenuCard, type PageFigure } from '@/ui';
import { BreakdownPanel, HubPanels, RecordsPanel, type HubRecord } from '../hub/HubPanels';
import { countValue, usePendingApprovalCount } from '../hubFigures';

const PENDING = '/general/overtime/pending';
const REGISTRY = '/general/overtime/registry';
const USERS = '/general/overtime/users';

// This month's requests by status, as the registry filters them (on the start).
const MONTH_STAGES = [
  { key: 'submitted', label: 'Onay Bekliyor', color: 'yellow' },
  { key: 'approved', label: 'Onaylandı', color: 'green' },
  { key: 'rejected', label: 'Reddedildi', color: 'red' },
] as const;

function upcomingRecord(request: OvertimeRequest): HubRecord {
  const hours = toNumber(request.duration_hours);
  const people = request.total_users ? `${request.total_users} kişi` : null;
  return {
    key: request.id,
    link: `${REGISTRY}?request=${request.id}`,
    code: formatDate(request.start_at, { day: 'numeric', month: 'short', weekday: 'short' }),
    title: request.team_label || request.team || 'Mesai',
    subtitle: request.reason || undefined,
    meta: [
      request.start_at && request.end_at
        ? `${formatTime(request.start_at)}–${formatTime(request.end_at)}`
        : null,
      hours !== null ? `${formatNumber(hours, Number.isInteger(hours) ? 0 : 1)} sa` : null,
      people,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

export function OvertimeHubPage() {
  const pending = usePendingApprovalCount('overtime', PENDING);
  const canRegistry = hasRouteAccess(REGISTRY);
  const canUsers = hasRouteAccess(USERS);
  const today = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');

  // Every request starts at once; the backend shows each user the requests they may see.
  const onShift = useQuery({ ...overtimeUsersCountQueryOptions(today), enabled: canUsers });
  const upcoming = useQuery({
    ...overtimePageQueryOptions({
      status: 'approved',
      start_at__gte: today,
      ordering: 'start_at',
      page_size: 6,
    }),
    select: (page) => page.results.map(upcomingRecord),
    enabled: canRegistry,
  });
  const month = useQueries({
    queries: MONTH_STAGES.map((stage) => ({
      ...overtimeCountQueryOptions({
        status: stage.key,
        start_at__gte: monthStart,
        start_at__lte: `${monthEnd}T23:59:59`,
      }),
      enabled: canRegistry,
    })),
  });
  const monthLink = (status: string) =>
    `${REGISTRY}?status=${status}&start_date=${monthStart}&end_date=${monthEnd}`;

  // Ported from general/overtime/overtime.js.
  const cards: MenuCard[] = [
    {
      title: 'Bekleyen Talepler',
      description: 'Onay bekleyen mesai taleplerinin listesi ve durum takibi.',
      icon: 'fas fa-clock',
      iconColor: 'warning',
      link: PENDING,
      stat: { value: countValue(pending), label: 'onayınızı bekliyor' },
    },
    {
      title: 'Kayıt Defteri',
      description: 'Tüm mesai taleplerinin geçmişi ve kayıt defteri.',
      icon: 'fas fa-archive',
      iconColor: 'info',
      link: '/general/overtime/registry',
    },
    {
      title: 'Mesai Kullanıcıları',
      description: 'Belirli bir tarihte mesai yapacak kullanıcıların listesi.',
      icon: 'fas fa-users',
      iconColor: 'primary',
      link: '/general/overtime/users',
    },
    {
      title: 'Talaşlı İmalat Mesai Raporu',
      description: 'Onaylı mesailerdeki operasyonların o gün çalışılıp çalışılmadığı ve süreleri.',
      icon: 'fas fa-cogs',
      iconColor: 'success',
      link: '/general/overtime/machining-report',
    },
    {
      title: 'Kaynaklı İmalat Mesai Raporu',
      description:
        'Onaylı mesai saatleri ile kaynak zaman kayıtlarının karşılaştırması ve sapmalar.',
      icon: 'fas fa-fire',
      iconColor: 'danger',
      link: '/general/overtime/welding-report',
    },
    {
      title: 'Mesai Maliyet Raporu',
      description: 'Seçilen dönemdeki toplam mesai maliyeti; ekip, kişi ve iş bazında dağılım.',
      icon: 'fas fa-coins',
      iconColor: 'warning',
      link: '/general/overtime/cost-report',
    },
  ];

  const stats: PageFigure[] = [
    ...(hasRouteAccess(PENDING)
      ? [
          {
            id: 'overtime-pending',
            label: 'Onayınızı Bekleyen',
            value: countValue(pending),
            icon: 'fas fa-clock',
            link: PENDING,
          },
        ]
      : []),
    ...(canUsers
      ? [
          {
            id: 'overtime-today',
            label: 'Bugün Mesaide',
            value: countValue(onShift),
            icon: 'fas fa-users',
            link: USERS,
          },
        ]
      : []),
    ...(canRegistry
      ? [
          {
            id: 'overtime-month',
            label: 'Bu Ay Onaylanan',
            value: countValue(month[1]!),
            icon: 'fas fa-check',
            link: monthLink('approved'),
          },
        ]
      : []),
  ].map((f) => ({ ...f, value: f.value ?? <PendingValue /> }));

  return (
    <MenuCards
      title="Mesai Talepleri"
      subtitle="Mesai taleplerinin yönetimi ve takibi"
      stats={stats}
      compact={canRegistry}
      cards={cards}
    >
      {canRegistry ? (
        <HubPanels>
          <RecordsPanel
            title="Yaklaşan Mesailer"
            icon="fas fa-calendar-day"
            more={`${REGISTRY}?status=approved&start_date=${today}`}
            noun="Mesailer"
            empty="Önümüzdeki günler için onaylı mesai yok."
            query={upcoming}
          />
          <BreakdownPanel
            title={`${formatDate(monthStart, { month: 'long' })} Talepleri`}
            icon="fas fa-filter"
            failed={month.some((q) => q.isError)}
            rows={MONTH_STAGES.map((stage, i) => ({
              key: stage.key,
              label: stage.label,
              color: stage.color,
              count: month[i]!.data,
              link: monthLink(stage.key),
            }))}
          />
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
