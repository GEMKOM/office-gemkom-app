import { Button } from '@mantine/core';
import { formatDate, formatNumber } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, Panel } from '@/ui';
import { useQuizToday } from './queries';
import { dayDate } from './quizFormat';
import css from './quiz.module.css';

/**
 * Günün Quizi on the home page: one row that says what to do with today's
 * quiz. Renders nothing while loading, when the API refuses (not an office
 * user, or a backend without the quiz) and on a weekday with no quiz.
 */
export function QuizHomeCard() {
  const { data } = useQuizToday();
  // Anything that is not a quiz answer (an HTML page from an old backend, a
  // proxy's stub) leaves the home page as it was.
  if (!data || typeof data.status !== 'string' || !Array.isArray(data.yesterday?.winners))
    return null;

  const winner = data.yesterday.winners[0];
  const winnerLine = winner
    ? `Dünün kazananı: ${winner.name}, ${formatNumber(winner.score)} puan`
    : null;
  const weekend = [0, 6].includes(dayDate(data.date).getDay());

  let title: string;
  let line: string | null;
  let action: { label: string; to: string; primary: boolean } | null = {
    label: 'Başla',
    to: '/quiz',
    primary: true,
  };
  let streak: string | null = null;

  switch (data.status) {
    case 'available':
      title = 'Günün Quizi hazır';
      line = `${data.question_count} soru · yaklaşık 2 dakika · bugün 24:00'e kadar`;
      streak = data.streak
        ? `${data.streak} günlük seri. Bugün oynarsanız ${data.streak + 1} olur.`
        : null;
      break;
    case 'in_progress':
      title = 'Quiziniz yarım kaldı';
      line = 'Açık kalan sorunun süresi işlemeye devam ediyor.';
      action = { label: 'Devam Et', to: '/quiz', primary: true };
      break;
    case 'finished': {
      const a = data.attempt;
      title = a
        ? `Bugün ${formatNumber(a.total_score)} puan${a.rank ? ` · ${a.rank}. sıra` : ''}`
        : 'Bugünkü quiz tamamlandı';
      line = 'Doğru cevaplar yarın sabah açıklanır.';
      streak = data.streak ? `${data.streak} günlük seri` : null;
      action = { label: 'Sıralama', to: '/quiz/leaderboard', primary: false };
      break;
    }
    case 'not_open':
      title = `Günün Quizi ${formatDate(data.opens_at, { hour: '2-digit', minute: '2-digit' })}'de açılır`;
      line = winnerLine;
      action = data.yesterday.review_available
        ? {
            label: 'Dünün Cevapları',
            to: `/quiz/review?date=${data.yesterday.date}`,
            primary: false,
          }
        : null;
      break;
    default:
      if (!weekend) return null;
      title = 'Pazartesi yeni quiz var';
      line = winnerLine;
      action = data.yesterday.review_available
        ? { label: 'Son Cevaplar', to: `/quiz/review?date=${data.yesterday.date}`, primary: false }
        : null;
  }

  return (
    <Panel>
      <div className={css.homeCard} data-testid="quiz-home-card">
        <span className={css.homeIcon} aria-hidden>
          <FaIcon icon="fas fa-trophy" />
        </span>
        <div className={css.homeText}>
          <h2 className={css.homeTitle}>{title}</h2>
          {line ? <span className={css.homeLine}>{line}</span> : null}
          {streak ? (
            <span className={css.streak}>
              <FaIcon icon="fas fa-fire" />
              {streak}
            </span>
          ) : null}
        </div>
        {action ? (
          <Button
            component={AppLink}
            to={action.to}
            variant={action.primary ? 'filled' : 'default'}
          >
            {action.label}
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
