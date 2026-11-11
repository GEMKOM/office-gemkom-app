import { Button } from '@mantine/core';
import { useSearchParams } from 'react-router';
import type { LeaderboardPeriod } from '@/api/quiz';
import { formatDate, formatNumber } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { PageHeader, Panel, PendingValue, type PageFigure } from '@/ui';
import { useLeaderboard } from './queries';
import { RankList } from './RankList';
import { dayDate } from './quizFormat';
import css from './quiz.module.css';

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: 'day', label: 'Gün' },
  { key: 'week', label: 'Hafta' },
  { key: 'month', label: 'Ay' },
];

function periodLine(period: LeaderboardPeriod, start: string, end: string): string {
  if (period === 'day')
    return formatDate(dayDate(start), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      weekday: 'long',
    });
  if (period === 'month') return formatDate(dayDate(start), { month: 'long', year: 'numeric' });
  return `${formatDate(dayDate(start), { day: 'numeric', month: 'short' })} – ${formatDate(dayDate(end), { day: 'numeric', month: 'short' })}`;
}

/** /quiz/leaderboard?period=day|week|month — top 10 and your own row. */
export function LeaderboardPage() {
  const [search, setSearch] = useSearchParams();
  const raw = search.get('period');
  const period: LeaderboardPeriod = raw === 'day' || raw === 'month' ? raw : 'week';
  const board = useLeaderboard(period);
  const data = board.data;

  const figure = (value: string | number | undefined) =>
    value === undefined ? <PendingValue /> : value;
  const stats: PageFigure[] = [
    {
      id: 'lb-rank',
      label: 'Sıranız',
      value: figure(data ? (data.me ? `${data.me.rank}.` : '-') : undefined),
    },
    {
      id: 'lb-score',
      label: 'Puanınız',
      value: figure(data ? formatNumber(data.me?.score ?? 0) : undefined),
    },
    { id: 'lb-players', label: 'Oyuncu', value: figure(data?.players) },
  ];

  return (
    <>
      <PageHeader
        title="Sıralama"
        subtitle={data ? periodLine(period, data.start, data.end) : 'Günün Quizi puan tablosu'}
        icon="fas fa-ranking-star"
        stats={stats}
        actions={
          <Button component={AppLink} to="/quiz" variant="default">
            Quize Dön
          </Button>
        }
      />
      <Panel
        padded={false}
        headerLeft={
          <div className={css.tabs} role="group" aria-label="Dönem">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={css.tab}
                aria-pressed={p.key === period}
                onClick={() =>
                  setSearch(p.key === 'week' ? {} : { period: p.key }, { replace: true })
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        }
        actions={
          <span className={css.footNote}>Eşit puanda toplam süresi kısa olan öne geçer</span>
        }
      >
        {data?.top.length ? (
          <RankList rows={data.top} me={data.me} showDays label="Sıralama" />
        ) : (
          <p className={css.panelNote}>
            {board.isPending
              ? 'Yükleniyor…'
              : board.isError
                ? 'Sıralama yüklenemedi.'
                : 'Bu dönemde henüz kimse oynamadı.'}
          </p>
        )}
      </Panel>
    </>
  );
}
