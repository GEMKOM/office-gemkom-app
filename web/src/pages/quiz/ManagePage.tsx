import { Button } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  approveQuizDay,
  generateQuizDay,
  getQuizAdminDays,
  replaceQuizQuestion,
  type AdminDay,
  type AdminDayEntry,
  type AdminQuestion,
} from '@/api/quiz';
import { isApiError } from '@/api/client';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import {
  confirm,
  FaIcon,
  notify,
  PageHeader,
  Panel,
  PendingValue,
  StatusBadge,
  type PageFigure,
  type StatusFamily,
} from '@/ui';
import { quizKeys } from './queries';
import { CATEGORY_FAMILY, CHOICE_LETTERS, dayDate, toNumber } from './quizFormat';
import css from './quiz.module.css';

const STATUS: Record<string, { label: string; color: StatusFamily }> = {
  draft: { label: 'Onay bekliyor', color: 'yellow' },
  ready: { label: 'Onaylandı', color: 'green' },
  generating: { label: 'Hazırlanıyor', color: 'blue' },
  failed: { label: 'Oluşturulamadı', color: 'red' },
};

const dayLabel = (iso: string) =>
  formatDate(dayDate(iso), { day: 'numeric', month: 'long', weekday: 'long' });

/**
 * /quiz/manage?date= — the approver's view (manage_quiz): every question of
 * today's and the next quiz day's draft with its answer, "Başka soru öner" on
 * each, and the approval that lets players see it.
 */
export function ManagePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const days = useQuery({
    queryKey: quizKeys.adminDays,
    queryFn: ({ signal }) => getQuizAdminDays(signal),
    retry: (count, error) => !(isApiError(error) && error.status === 403) && count < 1,
  });
  const entries = days.data?.days ?? [];
  const asked = search.get('date');
  const current: AdminDayEntry | undefined =
    entries.find((e) => e.date === asked) ??
    entries.find((e) => e.day?.status === 'draft') ??
    entries[entries.length - 1];
  const day = current?.day ?? null;

  const store = (date: string, next: AdminDay | null) => {
    queryClient.setQueryData<{ days: AdminDayEntry[] }>(quizKeys.adminDays, (old) =>
      old ? { days: old.days.map((e) => (e.date === date ? { ...e, day: next } : e)) } : old,
    );
    void queryClient.invalidateQueries({ queryKey: quizKeys.today });
  };

  const approve = useMutation({
    mutationFn: (date: string) => approveQuizDay(date),
    onSuccess: (res) => {
      store(res.date, res.day);
      notify.success(
        current?.is_today
          ? 'Quiz onaylandı ve açıldı.'
          : 'Quiz onaylandı. Saat 07:00’de oyunculara açılacak.',
      );
    },
    onError: (error) => notify.error(error, { fallback: 'Onaylanamadı' }),
  });

  const generate = useMutation({
    mutationFn: ({ date, force }: { date: string; force: boolean }) => generateQuizDay(date, force),
    onSuccess: (res) => {
      store(res.date, res.day);
      if (res.status === 'failed')
        notify.error('Taslak oluşturulamadı. Biraz sonra tekrar deneyin.');
      else notify.success('Yeni taslak hazır.');
    },
    onError: (error) => {
      notify.error(error, { fallback: 'Taslak oluşturulamadı' });
      void days.refetch();
    },
  });

  const [replacing, setReplacing] = useState<number | null>(null);
  const replace = useMutation({
    mutationFn: (questionId: number) => replaceQuizQuestion(questionId),
    onMutate: (questionId) => setReplacing(questionId),
    onSuccess: (res) => {
      store(res.date, res.day);
      notify.success('Soru değiştirildi.');
    },
    onError: (error) => notify.error(error, { fallback: 'Yeni soru bulunamadı' }),
    onSettled: () => setReplacing(null),
  });

  const redo = async () => {
    if (!current) return;
    const ok = await confirm({
      title: 'Tüm sorular yeniden oluşturulsun mu?',
      message: 'Bu günün beş sorusu ve yedekleri baştan üretilir; mevcut taslak silinir.',
      confirmLabel: 'Yeniden Oluştur',
    });
    if (ok) generate.mutate({ date: current.date, force: true });
  };

  const status = day ? STATUS[day.status] : undefined;
  const spareTotal = day ? Object.values(day.spares).reduce((a, b) => a + (b ?? 0), 0) : undefined;
  const stats: PageFigure[] = [
    {
      id: 'qm-status',
      label: 'Durum',
      value: days.isPending ? <PendingValue /> : (status?.label ?? 'Taslak yok'),
    },
    {
      id: 'qm-questions',
      label: 'Soru',
      value: days.isPending ? (
        <PendingValue />
      ) : (
        (day?.questions.filter((q) => !q.is_voided).length ?? 0)
      ),
    },
    {
      id: 'qm-spares',
      label: 'Yedek soru',
      value: days.isPending ? <PendingValue /> : (spareTotal ?? 0),
    },
  ];

  const busy = approve.isPending || generate.isPending;
  const forbidden = isApiError(days.error) && days.error.status === 403;

  return (
    <>
      <PageHeader
        title="Quiz Onayı"
        subtitle={
          current
            ? `${dayLabel(current.date)} quizinin soruları. Oyuncular yalnızca onaylanan quizi görür.`
            : 'Günün Quizi sorularını inceleyin, değiştirin ve onaylayın'
        }
        icon="fas fa-clipboard-check"
        stats={forbidden ? undefined : stats}
        backTo="/quiz"
        backLabel="Günün Quizi"
        actions={
          current ? (
            <>
              {day?.editable && day.status !== 'generating' ? (
                <Button
                  variant="default"
                  leftSection={<FaIcon icon="fas fa-rotate" />}
                  onClick={() => void redo()}
                  disabled={busy || replacing !== null}
                >
                  Tümünü Yeniden Oluştur
                </Button>
              ) : null}
              {day?.status === 'draft' ? (
                <Button
                  leftSection={<FaIcon icon="fas fa-check" />}
                  loading={approve.isPending}
                  disabled={busy || replacing !== null}
                  onClick={() => approve.mutate(current.date)}
                >
                  Onayla ve Yayınla
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      <Panel
        headerLeft={
          <div className={css.tabs} role="group" aria-label="Gün">
            {entries.map((e) => (
              <button
                key={e.date}
                type="button"
                className={css.tab}
                aria-pressed={e.date === current?.date}
                onClick={() => setSearch({ date: e.date }, { replace: true })}
              >
                {e.is_today ? 'Bugün' : 'Sonraki gün'} ·{' '}
                {formatDate(dayDate(e.date), { day: 'numeric', month: 'short' })}
                {e.day?.status === 'draft' ? ' •' : ''}
              </button>
            ))}
          </div>
        }
      >
        {days.isPending ? (
          <p className={css.lead}>Yükleniyor…</p>
        ) : forbidden ? (
          <p className={css.lead}>Quiz sorularını yönetme yetkiniz yok.</p>
        ) : days.isError ? (
          <p className={css.lead}>Quiz taslakları yüklenemedi.</p>
        ) : !current ? null : (
          <DayStatus
            entry={current}
            busy={generate.isPending}
            onGenerate={() => generate.mutate({ date: current.date, force: false })}
          />
        )}
      </Panel>

      {day && day.questions.length ? (
        <div className={css.reviewList}>
          {day.questions.map((q) => (
            <ManageQuestion
              key={q.id}
              q={q}
              day={day}
              loading={replacing === q.id}
              disabled={!day.editable || busy || (replacing !== null && replacing !== q.id)}
              onReplace={() => replace.mutate(q.id)}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function DayStatus({
  entry,
  busy,
  onGenerate,
}: {
  entry: AdminDayEntry;
  busy: boolean;
  onGenerate: () => void;
}) {
  const day = entry.day;
  if (!day || day.status === 'failed') {
    return (
      <div className={css.homeCard}>
        <span className={css.homeIcon} aria-hidden>
          <FaIcon icon={day ? 'fas fa-triangle-exclamation' : 'fas fa-wand-magic-sparkles'} />
        </span>
        <div className={css.homeText}>
          <h2 className={css.homeTitle}>
            {day ? 'Taslak oluşturulamadı' : 'Bu gün için henüz taslak yok'}
          </h2>
          <span className={css.homeLine}>
            {day?.error_detail ||
              'Taslaklar her iş günü 15:00’te bir sonraki gün için hazırlanır. Şimdi oluşturabilirsiniz; bir iki dakika sürer.'}
          </span>
        </div>
        <Button loading={busy} onClick={onGenerate}>
          Taslak Oluştur
        </Button>
      </div>
    );
  }
  if (day.status === 'generating') {
    return <p className={css.lead}>Taslak hazırlanıyor. Bir iki dakika sonra sayfayı yenileyin.</p>;
  }
  const s = STATUS[day.status];
  let line: string;
  if (!day.editable) {
    line = `${formatNumber(day.players)} kişi oynamaya başladı; sorular artık değiştirilemez.`;
  } else if (day.status === 'ready') {
    line = `${day.approved_by ?? 'Bir yönetici'} ${day.approved_at ? formatDateTime(day.approved_at) : ''} onayladı. İlk oyuncu başlayana kadar soruları yine değiştirebilirsiniz.`;
  } else {
    line = entry.is_today
      ? 'Onaylayana kadar oyuncular “quiz hazırlanıyor” görür; onayladığınız an açılır.'
      : `Onaylarsanız ${formatDate(day.opens_at, { hour: '2-digit', minute: '2-digit' })}’de oyunculara açılır. Beğenmediğiniz soruda “Başka soru öner”e basın.`;
  }
  return (
    <div className={css.reviewHead}>
      <span className={css.lead}>{line}</span>
      {s ? <StatusBadge color={s.color}>{s.label}</StatusBadge> : null}
    </div>
  );
}

function spareHint(day: AdminDay, q: AdminQuestion): string {
  if (q.kind === 'estimate') return 'Başka bir ölçü seçilir (CNC, kaynak, satın alma…).';
  const n = day.spares[q.category] ?? 0;
  return n
    ? `Bu kategoride ${n} hazır yedek soru var; değişim hemen olur.`
    : 'Yedek kalmadı; yeni soru üretilip kontrol edilir (yarım dakika kadar).';
}

function ManageQuestion({
  q,
  day,
  loading,
  disabled,
  onReplace,
}: {
  q: AdminQuestion;
  day: AdminDay;
  loading: boolean;
  disabled: boolean;
  onReplace: () => void;
}) {
  const value = toNumber(q.correct_value);
  return (
    <Panel>
      <div className={css.reviewHead}>
        <div className={css.qMeta}>
          <span>Soru {q.order}</span>
          <span className={css.pill} data-family={CATEGORY_FAMILY[q.category]}>
            {q.category_label}
          </span>
          {q.is_voided ? <StatusBadge color="grey">İptal edildi</StatusBadge> : null}
        </div>
        <Button
          size="xs"
          variant="default"
          leftSection={<FaIcon icon="fas fa-shuffle" />}
          loading={loading}
          disabled={disabled}
          onClick={onReplace}
        >
          Başka soru öner
        </Button>
      </div>
      <h2 className={css.reviewPrompt}>{q.prompt}</h2>

      {q.kind === 'choice' ? (
        <div className={css.options}>
          {(q.choices ?? []).map((text, index) => (
            <div
              key={index}
              className={css.option}
              data-correct={index === q.correct_index || undefined}
              style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}
            >
              <div className={css.optionText}>
                <span className={css.letter}>{CHOICE_LETTERS[index]}</span>
                <span>{text}</span>
                {index === q.correct_index ? (
                  <span className={css.optionNote}>Doğru cevap</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`${css.stats} ${css.estimateStats}`}>
          <div className={css.stat} data-truth={value !== null || undefined}>
            <span className={css.statLabel}>Doğru cevap</span>
            <span className={css.statValue}>
              {value !== null ? `${formatNumber(value)} ${q.unit ?? ''}` : 'Gün bitince'}
            </span>
          </div>
          <div className={css.stat}>
            <span className={css.statLabel}>Kaynak</span>
            <span className={css.statValue} style={{ fontSize: 18 }}>
              {q.metric_label || q.metric}
            </span>
          </div>
          <div className={css.stat}>
            <span className={css.statLabel}>Birim</span>
            <span className={css.statValue} style={{ fontSize: 18 }}>
              {q.unit || '-'}
            </span>
          </div>
        </div>
      )}

      {q.kind === 'estimate' && q.value_pending ? (
        <p className={css.explanation}>
          Sayı, sorduğu gün bittikten sonra uygulamadaki kayıtlardan otomatik doldurulur. Siz soruyu
          ve ölçüyü onaylıyorsunuz.
        </p>
      ) : q.explanation ? (
        <p className={css.explanation}>{q.explanation}</p>
      ) : null}
      {day.editable ? <div className={css.reviewFoot}>{spareHint(day, q)}</div> : null}
    </Panel>
  );
}
