import { Button, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  answerQuiz,
  nextQuizQuestion,
  startQuiz,
  type QuizAttemptSummary,
  type QuizPlayResponse,
  type QuizQuestion,
  type QuizToday,
} from '@/api/quiz';
import { formatDate, formatNumber } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, notify } from '@/ui';
import { quizKeys } from './queries';
import {
  CATEGORY_FAMILY,
  CATEGORY_LABEL,
  CHOICE_LETTERS,
  dayDate,
  streakLabel,
} from './quizFormat';
import css from './quiz.module.css';

// The server forgives this much past the visible countdown (quiz/rules.py
// GRACE_MS); asking for the next question sooner would just return this one.
const EXPIRY_WAIT_MS = 2300;
const LOW_MS = 5000;

interface Live {
  question: QuizQuestion;
  /** performance.now() when the server's remaining_ms was read. */
  receivedAt: number;
}

/**
 * The quiz card. The clock is the server's: every response carries what is
 * left on the shown question, the card only counts it down. Nothing says
 * right or wrong until tomorrow's review.
 */
export function QuizPlay({ today }: { today: QuizToday }) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState<Live | null>(null);
  const [result, setResult] = useState<QuizAttemptSummary | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const busyRef = useRef(false);

  const apply = useCallback(
    (response: QuizPlayResponse) => {
      if (response.done || !response.question) {
        setLive(null);
        setResult(response.attempt);
        void queryClient.invalidateQueries({ queryKey: quizKeys.all });
        return;
      }
      // A question means the attempt is under way: a cached 'available'
      // would otherwise offer Başla again (home card, a remount) while the
      // server's clock runs.
      if (queryClient.getQueryData<QuizToday>(quizKeys.today)?.status !== 'in_progress') {
        void queryClient.invalidateQueries({ queryKey: quizKeys.today });
      }
      const at = performance.now();
      setNow(at);
      setLive((prev) => {
        if (prev?.question.id !== response.question?.id) setValue('');
        return { question: response.question as QuizQuestion, receivedAt: at };
      });
    },
    [queryClient],
  );

  const run = useCallback(
    async (call: () => Promise<QuizPlayResponse>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        apply(await call());
      } catch (error) {
        notify.error(error, { fallback: 'Quiz isteği tamamlanamadı' });
        setLive(null);
        void queryClient.invalidateQueries({ queryKey: quizKeys.today });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [apply, queryClient],
  );

  useEffect(() => {
    if (!live) return undefined;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [live]);

  const remaining = live
    ? Math.min(
        live.question.remaining_ms,
        Math.max(0, live.question.remaining_ms - (now - live.receivedAt)),
      )
    : 0;
  const expired = Boolean(live) && remaining <= 0;

  // Time is up: once the server's grace has passed it moves on by itself.
  useEffect(() => {
    if (!expired) return undefined;
    const id = window.setTimeout(() => void run(nextQuizQuestion), EXPIRY_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [expired, live, run]);

  const question = live?.question;
  const locked = busy || expired;

  const pick = useCallback(
    (position: number) => {
      if (!question || locked) return;
      void run(() => answerQuiz(question.id, { choice: position }));
    },
    [question, locked, run],
  );

  // 1–4 or A–D answers a choice question from the keyboard.
  useEffect(() => {
    if (!question || question.kind !== 'choice') return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const key = event.key.toLocaleUpperCase('tr-TR');
      const count = question.choices?.length ?? 0;
      const position = /^[1-9]$/.test(key) ? Number(key) - 1 : CHOICE_LETTERS.indexOf(key);
      if (position >= 0 && position < count) {
        event.preventDefault();
        pick(position);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, pick]);

  const submitEstimate = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim().replace(',', '.');
    if (
      !question ||
      locked ||
      trimmed === '' ||
      !Number.isFinite(Number(trimmed)) ||
      Number(trimmed) < 0
    )
      return;
    void run(() => answerQuiz(question.id, { value: trimmed }));
  };

  if (question) {
    const low = remaining <= LOW_MS;
    const pct = Math.max(0, Math.min(100, (remaining / question.time_limit_ms) * 100));
    return (
      <div className={css.play} data-testid="quiz-question">
        <div className={css.qTop}>
          <div className={css.qMeta}>
            <span>
              Soru {question.number} / {question.total}
            </span>
            <span className={css.pill} data-family={CATEGORY_FAMILY[question.category]}>
              {question.category_label || CATEGORY_LABEL[question.category]}
            </span>
          </div>
          <span className={css.timer} data-low={low || undefined} aria-live="off">
            <FaIcon icon="fas fa-stopwatch" />
            {expired ? 'Süre doldu' : `${Math.ceil(remaining / 1000)} sn`}
          </span>
        </div>
        <div
          className={css.bar}
          role="progressbar"
          aria-label="Kalan süre"
          aria-valuemin={0}
          aria-valuemax={Math.round(question.time_limit_ms / 1000)}
          aria-valuenow={Math.ceil(remaining / 1000)}
        >
          <div className={css.barFill} data-low={low || undefined} style={{ width: `${pct}%` }} />
        </div>
        <h2 className={css.prompt}>{question.prompt}</h2>

        {question.kind === 'choice' ? (
          <div className={css.choices}>
            {(question.choices ?? []).map((text, position) => (
              <button
                key={`${question.id}-${position}`}
                type="button"
                className={css.choice}
                disabled={locked}
                onClick={() => pick(position)}
              >
                <span className={css.letter}>{CHOICE_LETTERS[position]}</span>
                <span>{text}</span>
              </button>
            ))}
          </div>
        ) : (
          <form className={css.estimate} onSubmit={submitEstimate}>
            <TextInput
              label="Tahmininiz"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              placeholder="Örn. 40"
              value={value}
              onChange={(event) => setValue(event.currentTarget.value.replace(/[^\d.,]/g, ''))}
              rightSection={
                question.unit ? <span className={css.footNote}>{question.unit}</span> : null
              }
              rightSectionWidth={question.unit ? 56 : undefined}
              disabled={locked}
              w={220}
              size="md"
            />
            <Button
              type="submit"
              size="md"
              loading={busy}
              disabled={expired || value.trim() === ''}
            >
              Gönder
            </Button>
            <p className={css.hint} style={{ flexBasis: '100%' }}>
              Bu soru uygulamadaki gerçek kayıtlardan hesaplandı. Ne kadar yaklaşırsanız o kadar
              puan.
            </p>
          </form>
        )}

        <div className={css.dots} aria-hidden>
          {Array.from({ length: question.total }, (_, index) => (
            <span
              key={index}
              className={css.dot}
              data-state={
                index + 1 < question.number
                  ? 'done'
                  : index + 1 === question.number
                    ? 'current'
                    : undefined
              }
            />
          ))}
        </div>
      </div>
    );
  }

  const summary = result ?? (today.status === 'finished' ? today.attempt : null);
  if (summary) return <Summary attempt={summary} today={today} />;

  if (today.status === 'available') {
    return (
      <div className={css.play}>
        <div>
          <span className={css.eyebrow}>
            {formatDate(dayDate(today.date), { day: 'numeric', month: 'long', weekday: 'long' })} ·{' '}
            {formatDate(today.opens_at, { hour: '2-digit', minute: '2-digit' })} – 24:00 arası açık
          </span>
          <h2 className={css.heading}>Bugünün quizi hazır</h2>
        </div>
        <div className={css.pills}>
          {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map((key) => (
            <span key={key} className={css.pill} data-family={CATEGORY_FAMILY[key]}>
              {CATEGORY_LABEL[key]}
            </span>
          ))}
        </div>
        <ul className={css.rules}>
          <li>
            <FaIcon icon="fas fa-stopwatch" />
            <span>
              {today.question_count} soru, her biri için {today.seconds_per_question} saniye.
              Sayfayı yenilemek süreyi durdurmaz.
            </span>
          </li>
          <li>
            <FaIcon icon="fas fa-bolt" />
            <span>
              Doğru cevap 100 puan, hızlı olana 50 puana kadar bonus. Tahmin sorusunda yaklaştıkça
              puan artar.
            </span>
          </li>
          <li>
            <FaIcon icon="fas fa-lock" />
            <span>Tek hakkınız var. Doğru cevaplar ve açıklamalar yarın sabah görünür.</span>
          </li>
        </ul>
        <div className={css.footer}>
          <Button
            size="md"
            loading={busy}
            onClick={() => void run(startQuiz)}
            rightSection={<FaIcon icon="fas fa-arrow-right" />}
          >
            Başla
          </Button>
          {today.streak ? (
            <span className={css.footNote}>
              {today.streak} günlük seriniz var, bugün oynarsanız uzar.
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  if (today.status === 'in_progress') {
    return (
      <div className={css.play}>
        <div className={css.centered}>
          <FaIcon icon="fas fa-hourglass-half" />
          <h2 className={css.heading}>Yarım kalan quiziniz var</h2>
          <p className={css.lead}>
            Açık kalan sorunun süresi işlemeye devam ediyor; süresi dolan sorular 0 puan sayılır.
          </p>
          <Button size="md" mt="sm" loading={busy} onClick={() => void run(nextQuizQuestion)}>
            Devam Et
          </Button>
        </div>
      </div>
    );
  }

  if (today.status === 'preparing') {
    return (
      <div className={css.play}>
        <div className={css.centered}>
          <FaIcon icon="fas fa-hourglass-start" />
          <h2 className={css.heading}>Bugünün quizi hazırlanıyor</h2>
          <p className={css.lead}>Sorular onaylanınca burada açılacak.</p>
        </div>
      </div>
    );
  }

  if (today.status === 'not_open') {
    return (
      <div className={css.play}>
        <div className={css.centered}>
          <FaIcon icon="fas fa-clock" />
          <h2 className={css.heading}>
            Quiz saat {formatDate(today.opens_at, { hour: '2-digit', minute: '2-digit' })}'de açılır
          </h2>
          <p className={css.lead}>Sorular hazır; açılınca buradan başlayabilirsiniz.</p>
        </div>
      </div>
    );
  }

  const weekend = [0, 6].includes(dayDate(today.date).getDay());
  return (
    <div className={css.play}>
      <div className={css.centered}>
        <FaIcon icon={weekend ? 'fas fa-mug-hot' : 'fas fa-circle-pause'} />
        <h2 className={css.heading}>
          {weekend ? 'Hafta sonu quiz yok' : 'Bugünün quizi henüz hazır değil'}
        </h2>
        <p className={css.lead}>
          {weekend
            ? 'Pazartesi sabah yeni sorularla görüşmek üzere.'
            : 'Sorular her iş günü sabah hazırlanır. Biraz sonra tekrar bakın.'}
        </p>
      </div>
    </div>
  );
}

function Summary({ attempt, today }: { attempt: QuizAttemptSummary; today: QuizToday }) {
  return (
    <div className={css.play} data-testid="quiz-summary">
      <span className={css.doneIcon}>
        <FaIcon icon="fas fa-check" />
      </span>
      <div>
        <h2 className={css.heading}>Bugünkü quiz tamamlandı</h2>
        <p className={css.lead}>Doğru cevapları yarın sabah “Dünün Cevapları”nda görebilirsiniz.</p>
      </div>
      <div className={css.stats}>
        <div className={css.stat}>
          <span className={css.statLabel}>Bugünkü puan</span>
          <span className={css.statValue}>{formatNumber(attempt.total_score)}</span>
        </div>
        <div className={css.stat}>
          <span className={css.statLabel}>Şu anki sıranız</span>
          <span className={css.statValue}>
            {attempt.rank ? `${attempt.rank}. / ${attempt.players}` : '-'}
          </span>
        </div>
        <div className={css.stat}>
          <span className={css.statLabel}>Seri</span>
          <span className={css.statValue}>{streakLabel(today.streak)}</span>
        </div>
      </div>
      {attempt.timed_out ? (
        <p className={css.hint}>{attempt.timed_out} sorunun süresi doldu.</p>
      ) : null}
      <div className={css.footer}>
        <Button component={AppLink} to="/quiz/leaderboard">
          Sıralamayı Gör
        </Button>
        {today.yesterday.review_available ? (
          <Button
            component={AppLink}
            to={`/quiz/review?date=${today.yesterday.date}`}
            variant="default"
          >
            Dünün Cevapları
          </Button>
        ) : null}
      </div>
    </div>
  );
}
