import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQueries, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { QueryParams } from '@/api/client';
import { listCountQueryOptions, listPageQueryOptions } from '@/api/counts';
import type { JobOrder } from '@/api/projects/jobOrders';
import { referenceSummaryQueryOptions } from '@/api/projects/references';
import { formatDate, formatNumber, toNumber } from '@/lib/format';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { BreakdownPanel, HubPanels, RecordsPanel, type HubRecord } from '../hub/HubPanels';
import { countFigure, countValue } from '../hubCount';

const TRACKING = '/projects/project-tracking';
const REFERENCES = '/projects/references';

// Job orders as Proje Takibi lists them by default: top-level jobs only.
const KEY = ['jobOrders', 'list'] as const;
const PATH = '/projects/job-orders/';
const jobCount = (params: QueryParams) =>
  listCountQueryOptions(KEY, PATH, { root_only: true, ...params });

const STAGES = [
  { key: 'draft', label: 'Taslak', color: 'grey' },
  { key: 'active', label: 'Aktif', color: 'blue' },
  { key: 'on_hold', label: 'Beklemede', color: 'orange' },
] as const;
// Late = still open (active or on hold) with the target date behind us.
const OPEN = 'active,on_hold';

function lateRecord(job: JobOrder): HubRecord {
  const done = toNumber(job.completion_percentage);
  return {
    key: job.job_no,
    link: `${TRACKING}?job_no=${encodeURIComponent(job.job_no)}`,
    code: job.job_no,
    title: job.title,
    subtitle: job.customer_short_name || job.customer_name || undefined,
    status:
      job.status === 'on_hold'
        ? { label: 'Beklemede', color: 'orange' }
        : { label: done !== null ? `%${formatNumber(done, 0)}` : 'Aktif', color: 'blue' },
    meta: job.target_completion_date
      ? formatDate(job.target_completion_date, { day: 'numeric', month: 'short', year: '2-digit' })
      : undefined,
    alert: true,
  };
}

export function ProjectsHubPage() {
  // Figures follow the cards: nothing is fetched for a page the user cannot open.
  const canTracking = hasRouteAccess(TRACKING);
  const canReferences = hasRouteAccess(REFERENCES);
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const stages = useQueries({
    queries: STAGES.map((stage) => ({ ...jobCount({ status: stage.key }), enabled: canTracking })),
  });
  const late = useQuery({
    ...jobCount({ status__in: OPEN, target_completion_date__lte: yesterday }),
    enabled: canTracking,
  });
  const lateList = useQuery({
    ...listPageQueryOptions<JobOrder>(KEY, PATH, {
      root_only: true,
      status__in: OPEN,
      target_completion_date__lte: yesterday,
      ordering: 'target_completion_date',
      page_size: 6,
    }),
    select: (page) => page.results.map(lateRecord),
    enabled: canTracking,
  });
  const references = useQuery({
    ...referenceSummaryQueryOptions(),
    select: (summary) => summary.counts?.review_status?.unreviewed ?? 0,
    enabled: canReferences,
  });
  const active = stages[1]!;

  // Ported from projects/projects.js. Cards the user cannot open hide
  // themselves. All three were blue; Tahminler takes yellow (like the sales
  // cost table) and Referanslar purple (like the sales catalogue) to keep
  // neighbours apart.
  const cards: MenuCard[] = [
    {
      title: 'Proje Takibi',
      description: 'İş emirleri, proje durumu ve ilerleme takibi.',
      icon: 'fas fa-project-diagram',
      iconColor: 'primary',
      link: TRACKING,
      stat: { value: countValue(active), label: 'aktif iş emri' },
    },
    {
      title: 'Tahminler',
      description: 'Çizimlerden üretilen maliyet ve risk raporları; iş emri ve teklif tahminleri.',
      icon: 'fas fa-calculator',
      iconColor: 'warning',
      link: '/projects/estimates',
    },
    {
      title: 'Referanslar',
      description:
        'Tahminde kullanılan bitmiş işler: kaynak listesi, faktör, inceleme ve birim süreler.',
      icon: 'fas fa-book-open',
      iconColor: 'purple',
      link: REFERENCES,
      stat: { value: countValue(references), label: 'inceleme bekliyor' },
    },
  ];

  // Proje Takibi reads its status filter from the URL; the target date it
  // does not, so the late figure opens the open jobs, soonest target first.
  const stats: PageFigure[] = [
    ...(canTracking
      ? [
          countFigure(
            {
              id: 'jobs-active',
              label: 'Aktif İş Emri',
              icon: 'fas fa-play',
              link: `${TRACKING}?status=active`,
            },
            active,
          ),
          countFigure(
            {
              id: 'jobs-late',
              label: 'Hedefi Geçen',
              icon: 'fas fa-calendar-xmark',
              link: `${TRACKING}?status=active&status=on_hold&ordering=target_completion_date`,
            },
            late,
          ),
          countFigure(
            {
              id: 'jobs-on-hold',
              label: 'Beklemede',
              icon: 'fas fa-pause',
              link: `${TRACKING}?status=on_hold`,
            },
            stages[2]!,
          ),
        ]
      : []),
    ...(canReferences
      ? [
          countFigure(
            {
              id: 'references-unreviewed',
              label: 'İncelenmemiş Referans',
              icon: 'fas fa-book-open',
              link: `${REFERENCES}?review=unreviewed`,
            },
            references,
          ),
        ]
      : []),
  ];

  return (
    <MenuCards
      title="Projeler Modülü"
      subtitle="Proje takibi ve yönetim işlemlerinizi gerçekleştirin"
      stats={stats}
      compact={canTracking}
      cards={cards}
    >
      {canTracking ? (
        <HubPanels>
          <RecordsPanel
            title="Hedef Tarihi Geçen İş Emirleri"
            icon="fas fa-calendar-xmark"
            more={`${TRACKING}?status=active&status=on_hold&ordering=target_completion_date`}
            noun="İş emirleri"
            empty="Hedef tarihi geçen açık iş emri yok."
            query={lateList}
          />
          <BreakdownPanel
            title="İş Emirleri"
            icon="fas fa-filter"
            failed={stages.some((q) => q.isError)}
            rows={STAGES.map((stage, i) => ({
              key: stage.key,
              label: stage.label,
              color: stage.color,
              count: stages[i]!.data,
              link: `${TRACKING}?status=${stage.key}`,
            }))}
          />
        </HubPanels>
      ) : null}
    </MenuCards>
  );
}
