import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import { departmentTaskCountQueryOptions, pendingReleaseCountQueryOptions } from '@/api/projects/design';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { countFigure, countValue } from '../hubCount';

const REVISION_REQUESTS = '/design/revision-requests';
const RELEASE_APPROVALS = '/design/release-approvals';

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

  // Ported from design/design.js. Cards the user cannot open hide themselves.
  const cards: MenuCard[] = [
    {
      title: 'Projeler',
      description: 'Dizayn departmanı görevlerini görüntüleyin ve yönetin.',
      icon: 'fas fa-project-diagram',
      iconColor: 'primary',
      link: '/design/projects',
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

  const stats: PageFigure[] = [
    ...(canRevisions
      ? [
          countFigure(
            { id: 'pending-revisions', label: 'Revizyon Talebi', icon: 'fas fa-edit', link: REVISION_REQUESTS },
            revisions,
          ),
        ]
      : []),
    ...(canReleases
      ? [
          countFigure(
            { id: 'pending-releases', label: 'İnceleme Bekleyen', icon: 'fas fa-search', link: RELEASE_APPROVALS },
            releases,
          ),
        ]
      : []),
  ];

  return (
    <MenuCards
      title="Dizayn"
      subtitle="Dizayn süreçlerinizi yönetin ve optimize edin"
      stats={stats}
      cards={cards}
    />
  );
}
