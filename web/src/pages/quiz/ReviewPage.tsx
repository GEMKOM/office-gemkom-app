import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { reportQuizQuestion, type QuizReviewQuestion } from '@/api/quiz';
import { isApiError } from '@/api/client';
import { formatDate, formatNumber } from '@/lib/format';
import {
  FaIcon,
  PageHeader,
  Panel,
  PendingValue,
  StatusBadge,
  notify,
  type PageFigure,
} from '@/ui';
import { quizKeys, useQuizReview, useQuizToday } from './queries';
import { CATEGORY_FAMILY, CHOICE_LETTERS, dayDate, toNumber } from './quizFormat';
import css from './quiz.module.css';

/**
 * /quiz/review?date=YYYY-MM-DD — a closed day's answers: the right option,
 * the user's own, how everyone answered and why. Without a date: the last
 * quiz day before today.
 */
export function ReviewPage() {
  const [search] = useSearchParams();
  const asked = search.get('date');
  const today = useQuizToday(!asked);
  const date = asked ?? today.data?.yesterday.date ?? null;
  const review = useQuizReview(date);
  const data = review.data;
  const attempt = data?.attempt;

  const correctCount = data
    ? data.questions.filter(
        (q) => !q.is_voided && q.my_score !== null && (q.my_score ?? 0) > 0 && !q.my_timed_out,
      ).length
    : undefined;
  const liveCount = data?.questions.filter((q) => !q.is_voided).length;
  const figure = (value: string | number | undefined) =>
    value === undefined ? <PendingValue /> : value;
  const stats: PageFigure[] = [
    {
      id: 'rv-score',
      label: 'Puanınız',
      value: figure(data ? (attempt ? formatNumber(attempt.total_score) : '-') : undefined),
    },
    {
      id: 'rv-rank',
      label: 'Sıranız',
      value: figure(
        data ? (attempt?.rank ? `${attempt.rank}. / ${attempt.players}` : '-') : undefined,
      ),
    },
    {
      id: 'rv-correct',
      label: 'Puan aldığınız',
      value: figure(data ? (attempt ? `${correctCount} / ${liveCount}` : '-') : undefined),
    },
  ];

  const notClosed = isApiError(review.error) && review.error.status === 403;
  const missing = isApiError(review.error) && review.error.status === 404;

  return (
    <>
      <PageHeader
        title="Dünün Cevapları"
        subtitle={
          date
            ? `${formatDate(dayDate(date), { day: 'numeric', month: 'long', weekday: 'long' })} günkü quizin doğru cevapları ve açıklamaları`
            : 'Kapanan quizlerin doğru cevapları ve açıklamaları'
        }
        icon="fas fa-list-check"
        stats={stats}
        backTo="/quiz"
        backLabel="Günün Quizi"
      />
      {data ? (
        <div className={css.reviewList}>
          {data.questions.map((q) => (
            <ReviewCard key={q.id} q={q} played={Boolean(attempt)} />
          ))}
        </div>
      ) : (
        <Panel>
          <p className={css.lead}>
            {/* A disabled query (no date yet) stays "pending": only count it while it can run. */}
            {(date && review.isPending) || (!asked && today.isPending)
              ? 'Yükleniyor…'
              : notClosed
                ? 'Bu günün cevapları gün bitince açıklanır.'
                : missing
                  ? 'Bu tarihte quiz yok.'
                  : 'Cevaplar yüklenemedi.'}
          </p>
        </Panel>
      )}
    </>
  );
}

function resultBadge(q: QuizReviewQuestion, played: boolean) {
  if (q.is_voided) return <StatusBadge color="grey">İptal edildi · puan sayılmadı</StatusBadge>;
  if (!played || q.my_score === null) return <StatusBadge color="grey">Oynamadınız</StatusBadge>;
  if (q.my_timed_out) return <StatusBadge color="grey">Süre doldu · 0 puan</StatusBadge>;
  if (q.kind === 'choice' && q.my_choice_index !== q.correct_index) {
    return <StatusBadge color="red">Yanlış · 0 puan</StatusBadge>;
  }
  if (q.kind === 'estimate' && !q.my_score)
    return <StatusBadge color="orange">Uzak · 0 puan</StatusBadge>;
  return (
    <StatusBadge color="green">
      {q.kind === 'choice' ? 'Doğru' : 'Yakın'} · {formatNumber(q.my_score)} puan
    </StatusBadge>
  );
}

function ReviewCard({ q, played }: { q: QuizReviewQuestion; played: boolean }) {
  const queryClient = useQueryClient();
  const [reported, setReported] = useState(false);
  const report = useMutation({
    mutationFn: () => reportQuizQuestion(q.id, ''),
    onSuccess: (res) => {
      setReported(true);
      // A void rescored everyone: this review, the band figures and the
      // leaderboards all change.
      if (res.voided) void queryClient.invalidateQueries({ queryKey: quizKeys.all });
      notify.success(
        res.voided
          ? 'Bildiriminiz alındı; soru iptal edildi.'
          : 'Bildiriminiz alındı. Teşekkürler.',
      );
    },
    onError: (error) => notify.error(error, { fallback: 'Bildirim gönderilemedi' }),
  });

  const answered = q.answered || 0;
  const unit = q.unit ? ` ${q.unit}` : '';
  const num = (value: number | string | null | undefined) => {
    const n = toNumber(value);
    return n === null ? '-' : `${formatNumber(n)}${unit}`;
  };

  return (
    <Panel>
      <div className={css.reviewHead}>
        <div className={css.qMeta}>
          <span>Soru {q.order}</span>
          <span className={css.pill} data-family={CATEGORY_FAMILY[q.category]}>
            {q.category_label}
          </span>
        </div>
        {resultBadge(q, played)}
      </div>
      <h2 className={css.reviewPrompt}>{q.prompt}</h2>

      {q.kind === 'choice' ? (
        <div className={css.options}>
          {(q.choices ?? []).map((text, index) => {
            const isCorrect = index === q.correct_index;
            const isMine = index === q.my_choice_index;
            const count = q.distribution?.[index] ?? 0;
            const pct = answered ? Math.round((count / answered) * 100) : 0;
            return (
              <div
                key={index}
                className={css.option}
                data-correct={isCorrect || undefined}
                data-mine={isMine || undefined}
              >
                <div className={css.optionText}>
                  <span className={css.letter}>{CHOICE_LETTERS[index]}</span>
                  <span>{text}</span>
                  <span className={css.optionNote}>
                    {isCorrect && isMine
                      ? 'Doğru cevap · sizin cevabınız'
                      : isCorrect
                        ? 'Doğru cevap'
                        : isMine
                          ? 'Sizin cevabınız'
                          : ''}
                  </span>
                </div>
                <div className={css.optionBar}>
                  <div className={css.optionTrack} aria-hidden>
                    <div className={css.optionFill} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={css.optionCount}>{count} kişi</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`${css.stats} ${css.estimateStats}`}>
          <div className={css.stat} data-truth>
            <span className={css.statLabel}>Gerçek değer</span>
            <span className={css.statValue}>{num(q.correct_value)}</span>
          </div>
          <div className={css.stat}>
            <span className={css.statLabel}>Sizin tahmininiz</span>
            <span className={css.statValue}>{num(q.my_value)}</span>
          </div>
          <div className={css.stat}>
            <span className={css.statLabel}>Ortanca tahmin</span>
            <span className={css.statValue}>{num(q.median_guess)}</span>
          </div>
        </div>
      )}

      {q.explanation ? <p className={css.explanation}>{q.explanation}</p> : null}
      <div className={css.reviewFoot}>
        <span>
          {answered
            ? q.kind === 'choice'
              ? `${answered} kişiden ${q.correct} kişi doğru bildi`
              : `${answered} kişiden ${q.correct} kişi gerçek değerin %10 yakınında tahmin etti`
            : 'Bu soruyu cevaplayan olmadı'}
        </span>
        {played && !q.is_voided ? (
          <button
            type="button"
            className={css.reportBtn}
            disabled={reported || report.isPending}
            onClick={() => report.mutate()}
          >
            <FaIcon icon="fas fa-flag" />
            {reported ? 'Bildirildi' : 'Bu soru hatalı mı? Bildir'}
          </button>
        ) : null}
      </div>
    </Panel>
  );
}
