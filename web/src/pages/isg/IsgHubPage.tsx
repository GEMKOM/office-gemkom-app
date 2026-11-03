import { useQuery } from '@tanstack/react-query';
import { isgIssuesQueryOptions, type IsgIssue, type IsgSeverity } from '@/api/isg/issues';
import { formatDate } from '@/lib/format';
import { MenuCards, PendingValue, type MenuCard, type PageFigure, type StatusFamily } from '@/ui';
import { countValue, useIsgSummary } from '../hubFigures';
import { BreakdownPanel, HubPanels, PanelTotal, RecordsPanel, type HubRecord } from '../hub/HubPanels';

const ISSUES = '/isg/issues';
const MINE = '/isg/issues?mine=true';
/** What the assignee still has to do; resolved issues wait on İSG to close them. */
const MY_ACTIONS = { mine: 'true', status__in: 'open,in_progress', ordering: 'due_date', page_size: 6 };

const SEVERITY: Record<IsgSeverity, { label: string; color: StatusFamily }> = {
  low: { label: 'Düşük', color: 'grey' },
  medium: { label: 'Orta', color: 'yellow' },
  high: { label: 'Yüksek', color: 'orange' },
  critical: { label: 'Kritik', color: 'red' },
};

function actionRecord(issue: IsgIssue): HubRecord {
  return {
    key: issue.id,
    link: `${ISSUES}?issue=${encodeURIComponent(issue.issue_number)}`,
    code: issue.issue_number,
    title: issue.title,
    subtitle: [issue.location, issue.category_display].filter(Boolean).join(' · ') || undefined,
    status: SEVERITY[issue.severity] ?? { label: issue.severity_display ?? issue.severity, color: 'grey' },
    meta: issue.due_date ? formatDate(issue.due_date, { day: 'numeric', month: 'short' }) : 'Süresiz',
    alert: Boolean(issue.is_overdue),
  };
}

export function IsgHubPage() {
  // One request for every figure; the same counters as the cards on the list.
  const summary = useIsgSummary();
  const actions = useQuery({
    ...isgIssuesQueryOptions(MY_ACTIONS),
    select: (page) => page.results.map(actionRecord),
  });
  const s = summary.data;
  const count = (value: number | undefined) =>
    countValue({ data: s && (value ?? 0), isError: summary.isError });
  // The list opens on open, in progress and resolved; the tile counts the same.
  const active = s && (s.open ?? 0) + (s.in_progress ?? 0) + (s.resolved ?? 0);

  // Ported from isg/isg.js. Open to everyone (/isg is always allowed).
  const cards: MenuCard[] = [
    {
      title: 'İSG Bildirimleri',
      description: 'Tüm İSG bildirimlerini görüntüleyin, filtreleyin ve takip edin.',
      icon: 'fas fa-helmet-safety',
      iconColor: 'primary',
      link: ISSUES,
      stat: { value: count(active), label: 'açık bildirim' },
    },
    {
      title: 'Bana Atananlar',
      description: 'Size atanmış, henüz kapanmamış İSG aksiyonlarını görün.',
      icon: 'fas fa-user-shield',
      iconColor: 'danger',
      link: MINE,
      stat: { value: count(s?.mine_open), label: 'açık aksiyon' },
    },
  ];

  // Each figure opens the list behind it (the list reads mine / overdue / severity from the URL).
  const stats: PageFigure[] = [
    { id: 'isg-mine', label: 'Bana Atanan', value: count(s?.mine_open), icon: 'fas fa-user-shield', link: MINE },
    {
      id: 'isg-overdue',
      label: 'Geciken',
      value: count(s?.overdue),
      icon: 'fas fa-triangle-exclamation',
      link: '/isg/issues?overdue=true',
    },
    {
      id: 'isg-critical',
      label: 'Yüksek / Kritik',
      value: count(s?.critical_open),
      icon: 'fas fa-fire',
      link: '/isg/issues?severity__in=high,critical',
    },
    { id: 'isg-open', label: 'Açık', value: count(active), icon: 'fas fa-folder-open', link: ISSUES },
  ].map((f) => ({ ...f, value: f.value ?? <PendingValue /> }));

  const stage = (status: 'open' | 'in_progress' | 'resolved') => (s ? (s[status] ?? 0) : undefined);

  return (
    <MenuCards
      title="İş Sağlığı ve Güvenliği"
      subtitle="İSG bildirimlerini takip edin, üzerinize atanan aksiyonları kapatın"
      stats={stats}
      compact
      cards={cards}
    >
      <HubPanels>
        <RecordsPanel
          title="Bana Atanan Aksiyonlar"
          icon="fas fa-list-check"
          more={MINE}
          noun="Aksiyonlar"
          empty="Size atanmış açık bir aksiyon yok."
          query={actions}
        />
        <BreakdownPanel
          title="Bildirim Durumu"
          icon="fas fa-filter"
          failed={summary.isError}
          rows={[
            { key: 'open', label: 'Açık', color: 'red', count: stage('open'), link: `${ISSUES}?status__in=open` },
            {
              key: 'in_progress',
              label: 'Devam Ediyor',
              color: 'blue',
              count: stage('in_progress'),
              link: `${ISSUES}?status__in=in_progress`,
            },
            {
              key: 'resolved',
              label: 'Giderildi, Kapanış Bekliyor',
              color: 'yellow',
              count: stage('resolved'),
              link: `${ISSUES}?status__in=resolved`,
            },
          ]}
          footer={<PanelTotal label="Kapatılan" value={summary.isError ? '-' : s && (s.closed ?? 0)} />}
        />
      </HubPanels>
    </MenuCards>
  );
}
