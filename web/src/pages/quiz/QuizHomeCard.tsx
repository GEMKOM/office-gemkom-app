import { Button } from '@mantine/core';
import type { QuizToday } from '@/api/quiz';
import { formatDate, formatNumber } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, Panel } from '@/ui';
import { useQuizToday } from './queries';
import { dayDate } from './quizFormat';
import css from './quiz.module.css';

interface Row {
  icon: string;
  title: string;
  line: string | null;
  streak?: string | null;
  action: { label: string; to: string; primary: boolean } | null;
  testId: string;
}

/**
 * Günün Quizi on the home page: a row that says what to do with today's quiz
 * and, for approvers, a row when a draft waits for them. Renders nothing while
 * loading, when the API refuses (not an office user, or a backend without the
 * quiz) and on a weekday with no quiz and nothing to approve.
 */
export function QuizHomeCard() {
  const { data } = useQuizToday();
  // Anything that is not a quiz answer (an HTML page from an old backend, a
  // proxy's stub) leaves the home page as it was.
  if (!data || typeof data.status !== 'string' || !Array.isArray(data.yesterday?.winners))
    return null;

  const rows = [approverRow(data), playerRow(data)].filter((row): row is Row => row !== null);
  if (!rows.length) return null;

  return (
    <Panel>
      <div style={{ display: 'grid', gap: 16 }}>
        {rows.map((row) => (
          <div key={row.testId} className={css.homeCard} data-testid={row.testId}>
            <span className={css.homeIcon} aria-hidden>
              <FaIcon icon={row.icon} />
            </span>
            <div className={css.homeText}>
              <h2 className={css.homeTitle}>{row.title}</h2>
              {row.line ? <span className={css.homeLine}>{row.line}</span> : null}
              {row.streak ? (
                <span className={css.streak}>
                  <FaIcon icon="fas fa-fire" />
                  {row.streak}
                </span>
              ) : null}
            </div>
            {row.action ? (
              <Button
                component={AppLink}
                to={row.action.to}
                variant={row.action.primary ? 'filled' : 'default'}
              >
                {row.action.label}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function approverRow(data: QuizToday): Row | null {
  const review = data.review;
  if (!review || review.status !== 'draft') return null;
  const isToday = review.date === data.date;
  const label = formatDate(dayDate(review.date), {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });
  return {
    icon: 'fas fa-clipboard-check',
    title: isToday ? 'Bugünün quizi onayınızı bekliyor' : `${label} quizi onayınızı bekliyor`,
    line: isToday
      ? 'Onaylayana kadar oyuncular quizi göremez.'
      : 'Soruları inceleyin, isterseniz başka soru önerin ve onaylayın.',
    action: { label: 'İncele', to: `/quiz/manage?date=${review.date}`, primary: true },
    testId: 'quiz-review-card',
  };
}

function playerRow(data: QuizToday): Row | null {
  const winner = data.yesterday.winners[0];
  const winnerLine = winner
    ? `Dünün kazananı: ${winner.name}, ${formatNumber(winner.score)} puan`
    : null;
  const weekend = [0, 6].includes(dayDate(data.date).getDay());
  const base = { icon: 'fas fa-trophy', testId: 'quiz-home-card' };
  const reviewLink = data.yesterday.review_available
    ? { to: `/quiz/review?date=${data.yesterday.date}`, primary: false }
    : null;

  switch (data.status) {
    case 'available':
      return {
        ...base,
        title: 'Günün Quizi hazır',
        line: `${data.question_count} soru · yaklaşık 2 dakika · bugün 24:00'e kadar`,
        streak: data.streak
          ? `${data.streak} günlük seri. Bugün oynarsanız ${data.streak + 1} olur.`
          : null,
        action: { label: 'Başla', to: '/quiz', primary: true },
      };
    case 'in_progress':
      return {
        ...base,
        title: 'Quiziniz yarım kaldı',
        line: 'Açık kalan sorunun süresi işlemeye devam ediyor.',
        action: { label: 'Devam Et', to: '/quiz', primary: true },
      };
    case 'finished': {
      const a = data.attempt;
      return {
        ...base,
        title: a
          ? `Bugün ${formatNumber(a.total_score)} puan${a.rank ? ` · ${a.rank}. sıra` : ''}`
          : 'Bugünkü quiz tamamlandı',
        line: 'Doğru cevaplar yarın sabah açıklanır.',
        streak: data.streak ? `${data.streak} günlük seri` : null,
        action: { label: 'Sıralama', to: '/quiz/leaderboard', primary: false },
      };
    }
    case 'preparing':
      return {
        ...base,
        title: 'Günün Quizi hazırlanıyor',
        line: 'Sorular onaylanınca açılacak.',
        action: null,
      };
    case 'not_open':
      return {
        ...base,
        title: `Günün Quizi ${formatDate(data.opens_at, { hour: '2-digit', minute: '2-digit' })}'de açılır`,
        line: winnerLine,
        action: reviewLink ? { label: 'Dünün Cevapları', ...reviewLink } : null,
      };
    default:
      if (!weekend) return null;
      return {
        ...base,
        title: 'Pazartesi yeni quiz var',
        line: winnerLine,
        action: reviewLink ? { label: 'Son Cevaplar', ...reviewLink } : null,
      };
  }
}
