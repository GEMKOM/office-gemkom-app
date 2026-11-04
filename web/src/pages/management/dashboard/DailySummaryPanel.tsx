// Dünden Bugüne: the Günlük Özet card (render/yesterday.js). The card never
// marks the summary read; "Özeti aç" opens it in Neo's summaries view, the
// React app's place for summaries (the legacy page opened its own modal).
import { formatWindowLabel, relativeDayLabel } from '@/neo/dailySummaryRender';
import { Button } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { dashboardKeys, getLatestDailySummary } from '@/api/management/dashboard';
import type { DailySummaryDetail } from '@/api/assistant';
import { openNeo } from '@/neo/neoStore';
import { FaIcon, Panel, StatusBadge, type StatusFamily } from '@/ui';
import classes from './dashboard.module.css';

const EMPTY_TEXT = 'Özet yok (ofis yetkisi gerekir veya özet üretilmedi)';

// The stat chips (neo/dailySummaryRender.ts STAT_META): the first
// three always, the rest only when above zero; at most six on this card.
const STAT_META: [string, string, StatusFamily, boolean][] = [
  ['new_jobs_root', 'iş emri', 'blue', true],
  ['topics_new', 'tartışma', 'purple', true],
  ['comments', 'yorum', 'grey', true],
  ['completed_jobs', 'tamamlanan iş', 'green', false],
  ['participants', 'katılımcı', 'grey', false],
  ['drawings_published', 'çizim yayını', 'grey', false],
  ['revisions_requested', 'revizyon talebi', 'grey', false],
  ['pr_created', 'satın alma talebi', 'grey', false],
  ['po_created', 'sipariş', 'grey', false],
  ['qc_submitted', 'KK gönderimi', 'grey', false],
  ['qc_decided', 'KK kararı', 'grey', false],
  ['ncr_created', 'NCR', 'red', false],
  ['tasks_completed', 'tamamlanan görev', 'grey', false],
  ['cnc_cuts', 'CNC kesim', 'grey', false],
  ['deliveries_jobs', 'teslimat alan iş', 'grey', false],
  ['tonnage_kg', 'kg üretim', 'grey', false],
  ['crane_requests', 'vinç talebi', 'grey', false],
  ['mpr_created', 'malzeme çekme', 'grey', false],
  ['isg_new', 'İSG kaydı', 'orange', false],
  ['faults_new', 'arıza', 'orange', false],
  ['date_changes', 'tarih değişikliği', 'grey', false],
  ['holds', 'bekletme', 'orange', false],
  ['cancelled', 'iptal', 'red', false],
];

const numberFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

function statNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

type Stats = Record<string, unknown>;

export function statChips(
  stats: Stats,
  limit = 6,
): { key: string; text: string; color: StatusFamily }[] {
  const chips: { key: string; text: string; color: StatusFamily }[] = [];
  for (const [key, label, color, always] of STAT_META) {
    const value = statNumber(stats[key]);
    if (!always && value <= 0) continue;
    let text = `${numberFmt.format(value)} ${label}`;
    if (key === 'new_jobs_root') {
      const child = statNumber(stats.new_jobs_child);
      if (child > 0) text += ` (+${numberFmt.format(child)} alt)`;
    }
    chips.push({ key, text, color });
    if (limit && chips.length >= limit) break;
  }
  return chips;
}

/** The four numbers the brief leads with, zeros included. */
export function kpiTiles(stats: Stats): { key: string; label: string; value: number }[] {
  return [
    {
      key: 'jobs',
      label: 'iş emri',
      value: statNumber(stats.new_jobs_root) + statNumber(stats.new_jobs_child),
    },
    { key: 'topics', label: 'tartışma', value: statNumber(stats.topics_new) },
    { key: 'comments', label: 'yorum', value: statNumber(stats.comments) },
    { key: 'tasks', label: 'tamamlanan görev', value: statNumber(stats.tasks_completed) },
  ];
}

function Body({ summary }: { summary: DailySummaryDetail }) {
  const payload = summary.payload && typeof summary.payload === 'object' ? summary.payload : {};
  const stats = (
    payload.stats && typeof payload.stats === 'object' ? payload.stats : summary.stats || {}
  ) as Stats;
  const headline = (payload.headline as string | undefined) || summary.headline || '';
  return (
    <>
      {headline ? (
        <p className={classes.headline}>{headline}</p>
      ) : (
        <div className={classes.muted}>Bu dönemde kayda değer bir hareket yok.</div>
      )}
      <div className={classes.dsKpis}>
        {kpiTiles(stats).map((k) => (
          <div key={k.key} className={classes.dsKpi} data-kpi={k.key}>
            <div className={classes.dsKpiNum}>{numberFmt.format(k.value)}</div>
            <div className={classes.dsKpiLabel}>{k.label}</div>
          </div>
        ))}
      </div>
      <div className={classes.dsChips}>
        {statChips(stats).map((c) => (
          <StatusBadge key={c.key} color={c.color}>
            {c.text}
          </StatusBadge>
        ))}
      </div>
      <Button
        size="xs"
        leftSection={<FaIcon icon="fas fa-book-open" />}
        onClick={() => openNeo({ summaryId: summary.id, openSummary: true })}
      >
        Özeti aç
      </Button>
    </>
  );
}

export function DailySummaryPanel() {
  const query = useQuery({
    queryKey: dashboardKeys.dailySummary(),
    queryFn: ({ signal }) => getLatestDailySummary(signal),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const summary = query.data ?? null;
  const day = summary?.summary_date ? relativeDayLabel(summary.summary_date) : '';
  const windowLabel = summary ? formatWindowLabel(summary) : '';
  return (
    <Panel
      title={
        <>
          Dünden Bugüne <span className={classes.panelSub}>Günlük Özet</span>
        </>
      }
      icon="fas fa-sun"
      actions={
        summary ? (
          <span className={classes.stamp}>{[day, windowLabel].filter(Boolean).join(' · ')}</span>
        ) : null
      }
    >
      {query.isPending ? (
        <>
          <div className={classes.skeletonLine} style={{ width: '70%' }} />
          <div className={classes.skeletonLine} />
        </>
      ) : summary ? (
        <Body summary={summary} />
      ) : (
        <div className={classes.empty}>{EMPTY_TEXT}</div>
      )}
    </Panel>
  );
}
