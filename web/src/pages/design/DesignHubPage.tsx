import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import {
  departmentTaskCountQueryOptions,
  pendingReleaseCountQueryOptions,
  pendingReleasesQueryOptions,
  type DrawingRelease,
} from '@/api/projects/design';
import { formatDate } from '@/lib/format';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { TaskDeadlinesPanel, useDepartmentTaskFigures } from '../hub/departmentTasks';
import {
  AttentionPanel,
  HubPanels,
  RecordsPanel,
  type AttentionItem,
  type HubRecord,
} from '../hub/HubPanels';
import { countFigure, countValue } from '../hubCount';

const PROJECTS = '/design/projects';
const REVISION_REQUESTS = '/design/revision-requests';
const RELEASE_APPROVALS = '/design/release-approvals';

function releaseRecord(release: DrawingRelease): HubRecord {
  const state = release.approval_state;
  return {
    key: release.id,
    link: `${RELEASE_APPROVALS}?release_id=${release.id}`,
    code: release.job_order_no,
    title: release.job_order_title || '-',
    subtitle:
      [release.revision_code ? `Rev. ${release.revision_code}` : null, release.released_by_name]
        .filter(Boolean)
        .join(' · ') || undefined,
    status: state?.required_count
      ? { label: `${state.approval_count ?? 0}/${state.required_count} onay`, color: 'yellow' }
      : undefined,
    meta: release.released_at
      ? formatDate(release.released_at, { day: 'numeric', month: 'short' })
      : undefined,
  };
}

export function DesignHubPage() {
  // Figures follow the cards: nothing is fetched for a page the user cannot open.
  const canRevisions = hasRouteAccess(REVISION_REQUESTS);
  const canReleases = hasRouteAccess(RELEASE_APPROVALS);
  // The same filter the revision requests page lists.
  const revisions = useQuery({
    ...departmentTaskCountQueryOptions({ department: 'design', has_pending_revision: true }),
    enabled: canRevisions,
  });
  const releases = useQuery({ ...pendingReleaseCountQueryOptions(), enabled: canReleases });
  // The review page's own request: every release waiting, each saying whether
  // the user still has to decide. The user's turn first.
  const mine = useQuery({
    ...pendingReleasesQueryOptions(),
    select: (rows) => {
      const waitingOnMe = rows.filter((release) => release.can_approve);
      return { count: waitingOnMe.length, records: waitingOnMe.slice(0, 6).map(releaseRecord) };
    },
    enabled: canReleases,
  });
  const tasks = useDepartmentTaskFigures('design', PROJECTS);

  // Ported from design/design.js. Cards the user cannot open hide themselves.
  const cards: MenuCard[] = [
    {
      title: 'Projeler',
      description: 'Dizayn departmanı görevlerini görüntüleyin ve yönetin.',
      icon: 'fas fa-project-diagram',
      iconColor: 'primary',
      link: PROJECTS,
      stat: { value: countValue(tasks.active), label: 'aktif görev' },
    },
    {
      title: 'Revizyon Talepleri',
      description: 'Bekleyen revizyon taleplerini görüntüleyin, onaylayın veya reddedin.',
      icon: 'fas fa-edit',
      iconColor: 'warning',
      link: REVISION_REQUESTS,
      stat: { value: countValue(revisions), label: 'bekleyen talep' },
    },
    {
      title: 'Çizim İncelemesi',
      description:
        'Tasarım ekibinin incelemesini bekleyen teknik çizim yayınlarını görüntüleyin ve değerlendirin.',
      icon: 'fas fa-search',
      iconColor: 'success',
      link: RELEASE_APPROVALS,
      stat: { value: countValue(releases), label: 'inceleme bekliyor' },
    },
  ];

  const myReviews = { data: mine.data?.count, isError: mine.isError };
  const stats: PageFigure[] = [
    ...(canReleases
      ? [
          countFigure(
            {
              id: 'my-reviews',
              label: 'İncelemenizi Bekleyen',
              icon: 'fas fa-user-pen',
              link: RELEASE_APPROVALS,
            },
            myReviews,
          ),
        ]
      : []),
    ...(canRevisions
      ? [
          countFigure(
            {
              id: 'pending-revisions',
              label: 'Revizyon Talebi',
              icon: 'fas fa-edit',
              link: REVISION_REQUESTS,
            },
            revisions,
          ),
        ]
      : []),
    ...(canReleases
      ? [
          countFigure(
            {
              id: 'pending-releases',
              label: 'İnceleme Bekleyen',
              icon: 'fas fa-search',
              link: RELEASE_APPROVALS,
            },
            releases,
          ),
        ]
      : []),
    // Bana Atanan.
    ...tasks.figures.slice(0, 1),
  ];

  const queues: AttentionItem[] = [];
  if (canRevisions) {
    queues.push({
      id: 'queue-revisions',
      label: 'Revizyon talepleri',
      hint: 'Dizaynın kararını bekliyor',
      icon: 'fas fa-edit',
      color: 'yellow',
      link: REVISION_REQUESTS,
      count: revisions,
    });
  }
  if (tasks.enabled) {
    queues.push(
      {
        id: 'queue-overdue',
        label: 'Hedefi geçen görevler',
        hint: 'Dizayn görevi, hedef tarihi geçti',
        icon: 'fas fa-flag',
        color: 'orange',
        link: PROJECTS,
        count: tasks.overdue,
      },
      {
        id: 'queue-blocked',
        label: 'Engellenen görevler',
        icon: 'fas fa-ban',
        color: 'red',
        link: `${PROJECTS}?status=blocked`,
        count: tasks.blocked,
      },
    );
  }
  const panels = canReleases || queues.length > 0;

  return (
    <MenuCards
      title="Dizayn"
      subtitle="Dizayn süreçlerinizi yönetin ve optimize edin"
      stats={stats}
      compact={panels}
      cards={cards}
    >
      {panels ? (
        <HubPanels>
          <>
            {canReleases ? (
              <RecordsPanel
                title="İncelemenizi Bekleyen Çizimler"
                icon="fas fa-user-pen"
                more={RELEASE_APPROVALS}
                noun="Çizim yayınları"
                empty="Kararınızı bekleyen çizim yayını yok."
                query={{ ...mine, data: mine.data?.records }}
              />
            ) : null}
            {tasks.enabled ? <TaskDeadlinesPanel department="design" route={PROJECTS} /> : null}
          </>
          <AttentionPanel title="Dizaynı Bekleyenler" icon="fas fa-inbox" items={queues} />
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
