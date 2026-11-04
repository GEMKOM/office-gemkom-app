import { hasRouteAccess } from '@/auth/accessControl';
import { useQueries, useQuery } from '@tanstack/react-query';
import { listCountQueryOptions, listPageQueryOptions } from '@/api/counts';
import { qcPendingJobOrdersQueryOptions } from '@/api/quality-control/costLines';
import { qualityDocumentExpiryCountQueryOptions } from '@/api/quality-control/documents';
import type { QCReview } from '@/api/quality-control/qcReviews';
import {
  AWAITING_CLOSE_NCR_STATUS,
  ncrCountQueryOptions,
  OPEN_NCR_STATUSES,
  qcReviewCountQueryOptions,
} from '@/api/qualityControl';
import { formatDate } from '@/lib/format';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import {
  AttentionPanel,
  BreakdownPanel,
  HubPanels,
  PanelTotal,
  RecordsPanel,
  type AttentionItem,
  type HubRecord,
} from '../hub/HubPanels';
import { countFigure, countValue } from '../hubCount';

const QC_REVIEWS = '/quality-control/qc-reviews';
const NCRS = '/quality-control/ncrs';
const COST_LINES = '/quality-control/cost-lines';
const DOCUMENTS = '/quality-control/documents';

// NCRs by stage: the three open ones, then the approved ones that are not
// closed yet, which the open count leaves out. The list narrows to the user's own teams by default;
// `assigned_team__in=all` shows every team, as the counts do.
const NCR_STAGES = [
  { key: 'draft', label: 'Aksiyon Bekliyor', color: 'orange' },
  { key: 'submitted', label: 'Onay Bekliyor', color: 'yellow' },
  { key: 'rejected', label: 'Reddedildi', color: 'red' },
  { key: AWAITING_CLOSE_NCR_STATUS, label: 'Onaylandı, Kapanmadı (açık sayılmaz)', color: 'blue' },
] as const;
const ncrLink = (params: string) => `${NCRS}?${params}&assigned_team__in=all`;

function reviewRecord(review: QCReview): HubRecord {
  return {
    key: review.id,
    link: `${QC_REVIEWS}?review=${review.id}`,
    code: review.job_order ?? undefined,
    title: review.task_title || '-',
    subtitle: review.submitted_by_name || undefined,
    status: Number(review.open_ncr_count)
      ? { label: `${review.open_ncr_count} açık NCR`, color: 'orange' }
      : undefined,
    meta: review.submitted_at
      ? formatDate(review.submitted_at, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : undefined,
  };
}

export function QualityControlHubPage() {
  // Figures follow the cards: nothing is fetched for a page the user cannot open.
  const canReviews = hasRouteAccess(QC_REVIEWS);
  const canNcrs = hasRouteAccess(NCRS);
  const canCosts = hasRouteAccess(COST_LINES);
  const canDocuments = hasRouteAccess(DOCUMENTS);
  const pendingReviews = useQuery({
    ...qcReviewCountQueryOptions({ status: 'pending' }),
    enabled: canReviews,
  });
  // Oldest first: the reviews that have waited longest.
  const waiting = useQuery({
    ...listPageQueryOptions<QCReview>(['qcReviews', 'list'], '/quality-control/qc-reviews/', {
      status: 'pending',
      ordering: 'submitted_at',
      page_size: 6,
    }),
    select: (page) => page.results.map(reviewRecord),
    enabled: canReviews,
  });
  const openNcrs = useQuery({
    ...ncrCountQueryOptions({ status__in: OPEN_NCR_STATUSES.join(',') }),
    enabled: canNcrs,
  });
  const ncrStages = useQueries({
    queries: NCR_STAGES.map((stage) => ({
      ...ncrCountQueryOptions({ status: stage.key }),
      enabled: canNcrs,
    })),
  });
  const criticalNcrs = useQuery({
    ...listCountQueryOptions(['qualityControl', 'ncrs', 'list'], '/quality-control/ncrs/', {
      status__in: OPEN_NCR_STATUSES.join(','),
      severity: 'critical',
    }),
    enabled: canNcrs,
  });
  const missingCost = useQuery({
    ...qcPendingJobOrdersQueryOptions({ page: 1, page_size: 1 }),
    select: (page) => page.count,
    enabled: canCosts,
  });
  const expiring = useQuery({
    ...qualityDocumentExpiryCountQueryOptions('expiring'),
    enabled: canDocuments,
  });
  const expired = useQuery({
    ...qualityDocumentExpiryCountQueryOptions('expired'),
    enabled: canDocuments,
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
      link: COST_LINES,
      stat: { value: countValue(missingCost), label: 'iş emri maliyet bekliyor' },
    },
    {
      title: 'Kalite Evrakları',
      description: 'Kalite evraklarını görüntüleyin ve yönetin.',
      icon: 'fas fa-file-alt',
      iconColor: 'purple',
      link: DOCUMENTS,
      stat: { value: countValue(expiring), label: '30 gün içinde süresi doluyor' },
    },
  ];

  const stats: PageFigure[] = [
    ...(canReviews
      ? [
          countFigure(
            {
              id: 'pending-reviews',
              label: 'İnceleme Bekleyen',
              icon: 'fas fa-search',
              link: `${QC_REVIEWS}?status=pending`,
            },
            pendingReviews,
          ),
        ]
      : []),
    ...(canNcrs
      ? [
          countFigure(
            {
              id: 'open-ncrs',
              label: 'Açık Uygunsuzluk',
              icon: 'fas fa-exclamation-triangle',
              link: ncrLink(`status__in=${OPEN_NCR_STATUSES.join(',')}`),
            },
            openNcrs,
          ),
          countFigure(
            {
              id: 'critical-ncrs',
              label: 'Kritik NCR',
              icon: 'fas fa-fire',
              link: ncrLink('severity=critical'),
            },
            criticalNcrs,
          ),
        ]
      : []),
  ];

  const queues: AttentionItem[] = [];
  if (canDocuments) {
    queues.push(
      {
        id: 'queue-expired',
        label: 'Süresi dolan evraklar',
        icon: 'fas fa-file-circle-xmark',
        color: 'red',
        link: `${DOCUMENTS}?expiry_status=expired`,
        count: expired,
      },
      {
        id: 'queue-expiring',
        label: 'Süresi yaklaşan evraklar',
        hint: '30 gün içinde',
        icon: 'fas fa-file-circle-exclamation',
        color: 'orange',
        link: `${DOCUMENTS}?expiry_status=expiring`,
        count: expiring,
      },
    );
  }
  if (canCosts) {
    queues.push({
      id: 'queue-cost',
      label: 'KK maliyeti',
      hint: 'Maliyet satırı girilmemiş iş emri',
      icon: 'fas fa-euro-sign',
      color: 'yellow',
      link: COST_LINES,
      count: missingCost,
    });
  }
  const panels = canReviews || canNcrs || queues.length > 0;

  return (
    <MenuCards
      title="Kalite Kontrol Modülü"
      subtitle="Kalite kontrol süreçlerinizi yönetin ve takip edin"
      stats={stats}
      compact={panels}
      cards={cards}
    >
      {panels ? (
        <HubPanels>
          {canReviews ? (
            <RecordsPanel
              title="İnceleme Bekleyenler"
              icon="fas fa-hourglass-half"
              more={`${QC_REVIEWS}?status=pending`}
              noun="İncelemeler"
              empty="İnceleme bekleyen iş yok."
              query={waiting}
            />
          ) : null}
          <>
            {canNcrs ? (
              <BreakdownPanel
                title="Açık Uygunsuzluklar"
                icon="fas fa-filter"
                failed={ncrStages.some((q) => q.isError)}
                footer={
                  <PanelTotal label="Açık rapor (onaylananlar hariç)" value={openNcrs.data} />
                }
                rows={NCR_STAGES.map((stage, i) => ({
                  key: stage.key,
                  label: stage.label,
                  color: stage.color,
                  count: ncrStages[i]!.data,
                  link: ncrLink(`status__in=${stage.key}`),
                }))}
              />
            ) : null}
            <AttentionPanel title="Takip Edilecekler" icon="fas fa-inbox" items={queues} />
          </>
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
