import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import { ncrCountQueryOptions, OPEN_NCR_STATUSES, qcReviewCountQueryOptions } from '@/api/qualityControl';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { countFigure, countValue } from '../hubCount';

const QC_REVIEWS = '/quality-control/qc-reviews';
const NCRS = '/quality-control/ncrs';

export function QualityControlHubPage() {
  // Figures follow the cards: nothing is fetched for a page the user cannot open.
  const canReviews = hasRouteAccess(QC_REVIEWS);
  const canNcrs = hasRouteAccess(NCRS);
  const pendingReviews = useQuery({
    ...qcReviewCountQueryOptions({ status: 'pending' }),
    enabled: canReviews,
  });
  const openNcrs = useQuery({
    ...ncrCountQueryOptions({ status__in: OPEN_NCR_STATUSES.join(',') }),
    enabled: canNcrs,
  });

  // Ported from quality-control/quality-control.js. Cards the user cannot
  // open hide themselves. Three of the four were blue; Maliyet Satırları
  // takes green and Kalite Evrakları purple to keep neighbours apart.
  const cards: MenuCard[] = [
    {
      title: 'KK İncelemeleri',
      description: 'Kalite kontrol incelemelerini görüntüleyin, onaylayın veya reddedin.',
      icon: 'fas fa-search',
      iconColor: 'primary',
      link: QC_REVIEWS,
      stat: { value: countValue(pendingReviews), label: 'inceleme bekliyor' },
    },
    {
      title: 'Uygunsuzluk Raporları',
      description: 'NCR (Non-Conformance Report) oluşturun, düzenleyin ve yönetin.',
      icon: 'fas fa-exclamation-triangle',
      iconColor: 'warning',
      link: NCRS,
      stat: { value: countValue(openNcrs), label: 'açık rapor' },
    },
    {
      title: 'Maliyet Satırları',
      description: 'KK maliyeti girilmemiş iş emirleri ve maliyet satırları.',
      icon: 'fas fa-euro-sign',
      iconColor: 'success',
      link: '/quality-control/cost-lines',
    },
    {
      title: 'Kalite Evrakları',
      description: 'Kalite evraklarını görüntüleyin ve yönetin.',
      icon: 'fas fa-file-alt',
      iconColor: 'purple',
      link: '/quality-control/documents',
    },
  ];

  const stats: PageFigure[] = [
    ...(canReviews
      ? [
          countFigure(
            { id: 'pending-reviews', label: 'İnceleme Bekleyen', icon: 'fas fa-search', link: QC_REVIEWS },
            pendingReviews,
          ),
        ]
      : []),
    ...(canNcrs
      ? [
          countFigure(
            { id: 'open-ncrs', label: 'Açık Uygunsuzluk', icon: 'fas fa-exclamation-triangle', link: NCRS },
            openNcrs,
          ),
        ]
      : []),
  ];

  return (
    <MenuCards
      title="Kalite Kontrol Modülü"
      subtitle="Kalite kontrol süreçlerinizi yönetin ve takip edin"
      stats={stats}
      cards={cards}
    />
  );
}
