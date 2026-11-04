import { hasRouteAccess } from '@/auth/accessControl';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { DepartmentRequest } from '@/api/general/departmentRequests';
import {
  departmentRequestStatusCountQueryOptions,
  myDepartmentRequestsQueryOptions,
} from '@/api/general/hubs';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import { MenuCards, PendingValue, type MenuCard, type PageFigure, type StatusFamily } from '@/ui';
import { BreakdownPanel, HubPanels, RecordsPanel, type HubRecord } from '../hub/HubPanels';
import { countValue } from '../hubFigures';
import { departmentName } from './department-requests/shared';
import { PENDING, useDepartmentRequestPendingCount } from './generalHubData';

const LIST = '/general/department-requests/list';

// A request's way: approval, then planning turns it into a purchase request.
const STAGES = [
  { key: 'submitted', label: 'Onay Bekliyor', color: 'yellow' },
  { key: 'approved', label: 'Onaylandı, Planlamada', color: 'blue' },
  { key: 'transferred', label: 'Satın Almaya Aktarıldı', color: 'green' },
] as const;

const STATUS_FAMILY: Record<string, StatusFamily> = {
  approved: 'green',
  submitted: 'yellow',
  rejected: 'red',
  cancelled: 'red',
  transferred: 'blue',
  draft: 'grey',
};

function requestRecord(request: DepartmentRequest): HubRecord {
  return {
    key: request.id,
    link: `${LIST}?request=${request.id}`,
    code: request.request_number ?? `#${request.id}`,
    title: request.title || 'Departman talebi',
    subtitle:
      [
        departmentName(request.department),
        request.items_count ? `${request.items_count} kalem` : null,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
    status: {
      label: request.status_label || request.status || '-',
      color: STATUS_FAMILY[request.status ?? ''] ?? 'grey',
    },
    meta: request.needed_date
      ? formatDate(request.needed_date, { day: 'numeric', month: 'short' })
      : undefined,
  };
}

export function DepartmentRequestsHubPage() {
  const { user } = useAuth();
  const canList = hasRouteAccess(LIST);
  const pending = useDepartmentRequestPendingCount();
  const stages = useQueries({
    queries: STAGES.map((stage) => ({
      ...departmentRequestStatusCountQueryOptions(stage.key),
      enabled: canList,
    })),
  });
  const mine = useQuery({
    ...myDepartmentRequestsQueryOptions(6),
    select: (page) => page.results.map(requestRecord),
    enabled: canList,
  });

  // Ported from general/department-requests/department-requests.js.
  const cards: MenuCard[] = [
    {
      title: 'Tüm Talepler',
      description: 'Tüm departman taleplerinin listesi, oluşturma, düzenleme ve silme işlemleri.',
      icon: 'fas fa-list',
      iconColor: 'primary',
      link: LIST,
    },
    {
      title: 'Bekleyen Talepler',
      description: 'Onay bekleyen departman taleplerinin listesi ve durum takibi.',
      icon: 'fas fa-clock',
      iconColor: 'warning',
      link: PENDING.departmentRequests,
      stat: { value: countValue(pending), label: 'onayınızı bekliyor' },
    },
  ];

  const stats: PageFigure[] = [
    ...(hasRouteAccess(PENDING.departmentRequests)
      ? [
          {
            id: 'department-pending',
            label: 'Onayınızı Bekleyen',
            value: countValue(pending),
            icon: 'fas fa-clock',
            link: PENDING.departmentRequests,
          },
        ]
      : []),
    ...(canList
      ? [
          {
            id: 'department-submitted',
            label: 'Onay Sürecinde',
            value: countValue(stages[0]!),
            icon: 'fas fa-hourglass-half',
            link: `${LIST}?status=submitted`,
          },
        ]
      : []),
  ].map((f) => ({ ...f, value: f.value ?? <PendingValue /> }));

  return (
    <MenuCards
      title="Departman Talepleri"
      subtitle="Departman taleplerinin yönetimi ve takibi"
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
            empty="Henüz oluşturduğunuz bir departman talebi yok."
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
