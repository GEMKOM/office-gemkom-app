import { Loader } from '@mantine/core';
import { isApiError } from '@/api/client';
import { formatDate, formatNumber } from '@/lib/format';
import { HubPanels, MoreLink } from '@/pages/hub/HubPanels';
import { FaIcon, PageHeader, Panel, PendingValue, type PageFigure } from '@/ui';
import { useLeaderboard, useQuizToday } from './queries';
import { QuizPlay } from './QuizPlay';
import { RankList } from './RankList';
import { dayDate, streakLabel } from './quizFormat';
import css from './quiz.module.css';

/**
 * /quiz — Günün Quizi: five questions every weekday (gemkom-backend quiz app).
 * The play card on the left; yesterday's winners and this week's top five on
 * the right.
 */
export function QuizPage() {
  const today = useQuizToday();
  const week = useLeaderboard('week');
  const forbidden = isApiError(today.error) && today.error.status === 403;

  const figure = (value: string | undefined) => (value === undefined ? <PendingValue /> : value);
  const stats: PageFigure[] = [
    {
      id: 'quiz-streak',
      label: 'Seri',
      value: figure(today.data ? streakLabel(today.data.streak) : undefined),
    },
    {
      id: 'quiz-week-rank',
      label: 'Haftalık sıra',
      value: figure(week.data ? (week.data.me ? `${week.data.me.rank}.` : '-') : undefined),
    },
    {
      id: 'quiz-week-score',
      label: 'Bu hafta',
      value: figure(week.data ? `${formatNumber(week.data.me?.score ?? 0)} puan` : undefined),
    },
  ];

  return (
    <>
      <PageHeader
        title="Günün Quizi"
        subtitle="Her iş günü 5 soru, yaklaşık 2 dakika. Doğru cevaplar gece yarısı açıklanır."
        icon="fas fa-trophy"
        stats={forbidden ? undefined : stats}
      />
      <HubPanels>
        <Panel key="play">
          {today.data ? (
            <QuizPlay today={today.data} />
          ) : (
            <div className={css.play}>
              <div className={css.centered}>
                {today.isPending ? (
                  <Loader size="sm" color="gray" />
                ) : (
                  <>
                    <FaIcon icon={forbidden ? 'fas fa-lock' : 'fas fa-circle-exclamation'} />
                    <p className={css.lead}>
                      {forbidden
                        ? 'Günün Quizi yalnızca ofis kullanıcıları içindir.'
                        : 'Quiz şu anda yüklenemedi.'}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </Panel>
        <div key="side">
          <Panel
            title="Dünün kazananları"
            icon="fas fa-medal"
            actions={
              today.data ? (
                <span className={css.footNote}>
                  {formatDate(dayDate(today.data.yesterday.date), {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              ) : null
            }
            padded={false}
            footer={
              today.data?.yesterday.review_available ? (
                <MoreLink to={`/quiz/review?date=${today.data.yesterday.date}`}>
                  Dünün cevaplarını gör
                </MoreLink>
              ) : null
            }
          >
            {today.data?.yesterday.winners.length ? (
              <RankList rows={today.data.yesterday.winners} label="Dünün ilk üçü" />
            ) : (
              <p className={css.panelNote}>
                {today.isPending ? 'Yükleniyor…' : 'Dün oynayan olmadı.'}
              </p>
            )}
          </Panel>
          <Panel
            title="Bu hafta"
            icon="fas fa-ranking-star"
            padded={false}
            footer={<MoreLink to="/quiz/leaderboard">Tüm sıralama</MoreLink>}
          >
            {week.data?.top.length ? (
              <RankList
                rows={week.data.top.slice(0, 5)}
                me={week.data.me}
                label="Haftanın ilk beşi"
              />
            ) : (
              <p className={css.panelNote}>
                {week.isPending
                  ? 'Yükleniyor…'
                  : week.isError
                    ? 'Sıralama yüklenemedi.'
                    : 'Bu hafta henüz kimse oynamadı.'}
              </p>
            )}
          </Panel>
        </div>
      </HubPanels>
    </>
  );
}
