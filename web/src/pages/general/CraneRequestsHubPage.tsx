import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQueries, useQuery } from '@tanstack/react-query';
import { craneStatusCountQueryOptions, myCraneRequestsQueryOptions } from '@/api/general/hubs';
import type { CraneRequest } from '@/api/general/craneRequests';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import { MenuCards, PendingValue, type MenuCard, type PageFigure } from '@/ui';
import { BreakdownPanel, HubPanels, RecordsPanel, type HubRecord } from '../hub/HubPanels';
import { countValue } from '../hubFigures';
import { craneStatusInfo } from './crane-requests/crane';
import { PENDING, useCranePendingCount } from './generalHubData';

const LIST = '/general/crane-requests/list';

// Requests still moving: waiting for approval, approved and waiting to be done, done.
const STAGES = [
  { key: 'submitted', label: 'Onay Bekliyor', color: 'yellow' },
  { key: 'approved', label: 'Onaylandı, Tamamlanmayı Bekliyor', color: 'blue' },
  { key: 'completed', label: 'Tamamlandı', color: 'green' },
] as const;

function craneRecord(request: CraneRequest): HubRecord {
  return {
    key: request.id,
    link: `${LIST}?request=${request.id}`,
    code: request.request_number ?? `#${request.id}`,
    title: request.crane_type_name || 'Vinç talebi',
    subtitle: [request.job_no, request.location].filter(Boolean).join(' · ') || undefined,
    status: craneStatusInfo(request.status),
    meta: request.needed_date
      ? formatDate(request.needed_date, { day: 'numeric', month: 'short' })
      : undefined,
  };
}

export function CraneRequestsHubPage() {
  const { user } = useAuth();
  const canList = hasRouteAccess(LIST);
  const pending = useCranePendingCount();
  const stages = useQueries({
    queries: STAGES.map((stage) => ({
      ...craneStatusCountQueryOptions(stage.key),
      enabled: canList,
    })),
  });
  const mine = useQuery({
    ...myCraneRequestsQueryOptions(6),
    select: (page) => page.results.map(craneRecord),
    enabled: canList,
  });

  // Ported from general/crane-requests/crane-requests.js.
  const cards: MenuCard[] = [
    {
      title: 'Tüm Talepler',
      description:
        'Tüm vinç/platform taleplerinin listesi, yeni talep oluşturma ve tamamlama işlemleri.',
      icon: 'fas fa-list',
      iconColor: 'primary',
      link: LIST,
    },
    {
      title: 'Bekleyen Talepler',
      description: 'Onayınızı bekleyen vinç taleplerinin listesi ve onay/red işlemleri.',
      icon: 'fas fa-clock',
      iconColor: 'warning',
      link: PENDING.craneRequests,
      stat: { value: countValue(pending), label: 'onayınızı bekliyor' },
    },
    {
      title: 'Fiyat Listesi',
      description:
        'Kiralık vinç ve platform fiyat listesi; yetkili kullanıcılar için fiyat güncelleme.',
      icon: 'fas fa-tags',
      iconColor: 'success',
      link: '/general/crane-requests/prices',
    },
  ];

  const stats: PageFigure[] = [
    ...(hasRouteAccess(PENDING.craneRequests)
      ? [
          {
            id: 'crane-pending',
            label: 'Onayınızı Bekleyen',
            value: countValue(pending),
            icon: 'fas fa-clock',
            link: PENDING.craneRequests,
          },
        ]
      : []),
    ...(canList
      ? [
          {
            id: 'crane-approved',
            label: 'Tamamlanacak',
            value: countValue(stages[1]!),
            icon: 'fas fa-truck-pickup',
            link: `${LIST}?status=approved`,
          },
        ]
      : []),
  ].map((f) => ({ ...f, value: f.value ?? <PendingValue /> }));

  return (
    <MenuCards
      title="Vinç Talepleri"
      subtitle="Kiralık vinç ve platform taleplerinin yönetimi ve takibi"
      stats={stats}
      compact={canList}
      cards={cards}
    >
      {canList ? (
        <HubPanels>
          <RecordsPanel
            title="Son Taleplerim"
            icon="fas fa-clock-rotate-left"
            more={`${LIST}?requestor=${user.id}`}
            noun="Talepler"
            empty="Henüz oluşturduğunuz bir vinç talebi yok."
            query={mine}
          />
          <BreakdownPanel
            title="Talep Durumu"
            icon="fas fa-filter"
            failed={stages.some((q) => q.isError)}
            rows={STAGES.map((stage, i) => ({
              key: stage.key,
              label: stage.label,
              color: stage.color,
              count: stages[i]!.data,
              link: `${LIST}?status=${stage.key}`,
            }))}
          />
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
