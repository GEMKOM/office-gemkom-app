import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery } from '@tanstack/react-query';
import { openFaultCountQueryOptions } from '@/api/manufacturing/counts';
import { companySnapshotQueryOptions, type CompanySnapshot } from '@/api/management/snapshot';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { AttentionPanel, HubPanels, type AttentionItem } from '../hub/HubPanels';
import { countFigure } from '../hubCount';

const DASHBOARD = '/management/dashboard';
const FAULTS = '/manufacturing/maintenance/fault-requests';

// Ported from management/management.js. Cards the user cannot open hide
// themselves. Analitik was blue like Dashboard; purple keeps neighbours apart.
const CARDS: MenuCard[] = [
  {
    title: 'Dashboard',
    description: 'Genel performans göstergeleri, önemli metrikler ve hızlı erişim panosu.',
    icon: 'fas fa-tachometer-alt',
    iconColor: 'primary',
    link: DASHBOARD,
  },
  {
    title: 'Raporlar',
    description: 'Detaylı analiz raporları, performans değerlendirmeleri ve trend analizleri.',
    icon: 'fas fa-chart-bar',
    iconColor: 'success',
    link: '/management/reports',
  },
  {
    title: 'Analitik',
    description: 'Gelişmiş veri analizi, tahminleme modelleri ve stratejik öngörüler.',
    icon: 'fas fa-chart-pie',
    iconColor: 'purple',
    link: '/management/analytics',
  },
];

/** The page behind a figure when the user can open it, else the dashboard. */
const linkOr = (route: string, query = '') =>
  hasRouteAccess(route) ? `${route}${query}` : DASHBOARD;

export function ManagementHubPage() {
  // One request: the company-wide counts of /reports/snapshot/ (plain counts,
  // open to every user). Open faults come from the fault list's own count.
  const snapshot = useQuery(companySnapshotQueryOptions());
  const faults = useQuery({ ...openFaultCountQueryOptions(), enabled: hasRouteAccess(FAULTS) });
  const stopped = useQuery({
    ...openFaultCountQueryOptions({ is_breaking: true }),
    enabled: hasRouteAccess(FAULTS),
  });
  const figure = <K extends keyof CompanySnapshot>(
    section: K,
    key: keyof NonNullable<CompanySnapshot[K]>,
  ) => {
    const values = snapshot.data?.[section] as Record<string, number | undefined> | undefined;
    return {
      data: snapshot.data ? (values?.[key as string] ?? 0) : undefined,
      isError: snapshot.isError,
    };
  };

  const tracking = '/projects/project-tracking';
  const stats: PageFigure[] = [
    countFigure(
      {
        id: 'company-active-jobs',
        label: 'Aktif İş Emri',
        icon: 'fas fa-play',
        link: linkOr(tracking, '?status=active'),
      },
      figure('job_orders', 'active'),
    ),
    countFigure(
      {
        id: 'company-late-jobs',
        label: 'Hedefi Geçen İş Emri',
        icon: 'fas fa-calendar-xmark',
        link: linkOr(tracking, '?status=active&ordering=target_completion_date'),
      },
      figure('job_orders', 'overdue'),
    ),
    countFigure(
      {
        id: 'company-critical-ncrs',
        label: 'Açık Kritik NCR',
        icon: 'fas fa-fire',
        link: linkOr('/quality-control/ncrs', '?severity=critical&assigned_team__in=all'),
      },
      figure('alerts', 'ncrs_critical_open'),
    ),
    countFigure(
      {
        id: 'company-overdue-payments',
        label: 'Vadesi Geçen Taksit',
        icon: 'fas fa-money-bill-wave',
        link: linkOr('/procurement/payment-lists', '?view=pool&basis=all'),
      },
      figure('alerts', 'payments_overdue'),
    ),
  ];

  // Requests in approval across the company, whoever approves them.
  const approvals: AttentionItem[] = [
    {
      id: 'company-pr',
      label: 'Satın alma talepleri',
      icon: 'fas fa-shopping-cart',
      color: 'yellow',
      link: linkOr('/procurement/purchase-requests/registry', '?requestor=&status=submitted'),
      count: figure('approvals_pending', 'purchase_requests'),
    },
    {
      id: 'company-overtime',
      label: 'Mesai talepleri',
      icon: 'fas fa-clock',
      color: 'yellow',
      link: linkOr('/general/overtime/registry', '?status=submitted'),
      count: figure('approvals_pending', 'overtime_requests'),
    },
    {
      id: 'company-statements',
      label: 'Taşeron hakedişleri',
      icon: 'fas fa-file-invoice-dollar',
      color: 'yellow',
      link: linkOr('/manufacturing/subcontracting/statements', '?status=submitted'),
      count: figure('approvals_pending', 'subcontractor_statements'),
    },
  ];

  const alerts: AttentionItem[] = [
    {
      id: 'company-blocked',
      label: 'Engellenen departman görevleri',
      icon: 'fas fa-ban',
      color: 'red',
      link: DASHBOARD,
      count: figure('alerts', 'tasks_blocked'),
    },
    {
      id: 'company-revision-hold',
      label: 'Revizyon için bekleyen iş emirleri',
      icon: 'fas fa-pen-ruler',
      color: 'orange',
      link: linkOr(tracking, '?status=on_hold'),
      count: figure('job_orders', 'on_hold_for_revision'),
    },
    ...(hasRouteAccess(FAULTS)
      ? [
          {
            id: 'company-faults',
            label: 'Açık arızalar',
            hint: 'Çözülmemiş makine arızası',
            icon: 'fas fa-screwdriver-wrench',
            color: 'orange' as const,
            link: FAULTS,
            count: faults,
          },
          {
            id: 'company-stopped',
            label: 'Duruştaki makineler',
            hint: 'Makineyi durduran açık arıza',
            icon: 'fas fa-power-off',
            color: 'red' as const,
            link: `${FAULTS}?type=breaking`,
            count: stopped,
          },
        ]
      : []),
  ];

  return (
    <MenuCards
      title="Yönetim Modülü"
      subtitle="Şirket yönetimi ve analitik işlemlerinizi gerçekleştirin"
      stats={stats}
      compact
      cards={CARDS}
    >
      <HubPanels>
        <AttentionPanel
          title="Onay Sürecindekiler"
          icon="fas fa-hourglass-half"
          items={approvals}
        />
        <AttentionPanel
          title="Dikkat Gerektirenler"
          icon="fas fa-triangle-exclamation"
          items={alerts}
        />
      </HubPanels>
    </MenuCards>
  );
}
