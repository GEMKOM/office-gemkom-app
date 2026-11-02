import {
  Button,
  NativeSelect,
  Textarea,
  TextInput,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  createReport,
  needsAnswer,
  respondToReport,
  type FeedbackReport,
  type ReportKind,
} from '@/api/assistant';
import { FaIcon } from '@/ui/FaIcon';
import { notify } from '@/ui/notify';
import { StatusBadge, type StatusFamily } from '@/ui/StatusBadge';
import classes from './neo.module.css';
import { clearFocusReport, getNeoState, useNeo } from './neoStore';
import { neoKeys, useMyReports } from './queries';

// The bug / idea reports the user filed through Neo, with Neo's triage: what
// it made of the report, the questions it asked, the answers given, and
// where the report stands. Neo's questions are answered right here.

export const REPORT_STATUS: Record<string, { label: string; family: StatusFamily }> = {
  new: { label: 'Yeni', family: 'grey' },
  analyzed: { label: 'İncelendi', family: 'purple' },
  needs_info: { label: 'Bilgi Bekleniyor', family: 'orange' },
  duplicate: { label: 'Yinelenen', family: 'grey' },
  queued: { label: 'Kuyruğa Alındı', family: 'blue' },
  in_review: { label: 'İncelemede', family: 'orange' },
  done: { label: 'Tamamlandı', family: 'green' },
  dismissed: { label: 'Reddedildi', family: 'grey' },
  failed: { label: 'Başarısız', family: 'red' },
};

const KIND_ICONS: Record<string, string> = {
  bug: 'fas fa-bug',
  feature: 'fas fa-lightbulb',
  improvement: 'fas fa-arrow-trend-up',
  other: 'fas fa-comment-dots',
};

const KIND_OPTIONS: { value: ReportKind; label: string }[] = [
  { value: 'bug', label: 'Hata' },
  { value: 'feature', label: 'Özellik İsteği' },
  { value: 'improvement', label: 'İyileştirme' },
  { value: 'other', label: 'Diğer' },
];

// How many reports show before "Tümünü göster".
const PAGE_SIZE = 5;

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The report's steps so far, as the legacy widget lists them. */
export function reportTimeline(
  report: FeedbackReport,
): { label: string; done: boolean; when?: string | null }[] {
  const status = report.status;
  // reviewed_at is stamped on dismissal too, so the status decides whether
  // the report actually reached development.
  const wentToDev = ['queued', 'in_review', 'done'].includes(status);
  const closed = ['done', 'dismissed', 'duplicate'].includes(status);
  let finalLabel = 'Tamamlanma';
  if (status === 'done') finalLabel = 'Tamamlandı — yayında';
  else if (status === 'dismissed') finalLabel = 'Değerlendirildi, uygulanmayacak';
  else if (status === 'duplicate') finalLabel = 'Aynı konu daha önce bildirilmiş';

  const rows = [
    { label: 'Bildiriminiz alındı', done: true, when: report.created_at },
    { label: 'Neo inceledi', done: !!report.analyzed_at, when: report.analyzed_at },
  ];
  if (status === 'needs_info')
    rows.push({ label: 'Yanıtınız bekleniyor', done: false, when: null });
  rows.push({
    label: 'Geliştirmeye alındı',
    done: wentToDev,
    when: wentToDev ? report.queued_at : null,
  });
  if (status === 'in_review')
    rows.push({ label: 'Değişiklik hazır, onay bekliyor', done: false, when: null });
  rows.push({ label: finalLabel, done: closed, when: report.resolved_at });
  return rows;
}

function AnswerForm({ report }: { report: FeedbackReport }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (value.length < 5) {
      notify.error('Lütfen soruları yanıtlayın.');
      return;
    }
    setSending(true);
    try {
      await respondToReport(report.id, value);
      notify.success('Yanıtınız alındı; bildirim yeniden inceleniyor.');
      setText('');
      void queryClient.invalidateQueries({ queryKey: neoKeys.reports });
    } catch (error) {
      notify.error(error, { fallback: 'Yanıt gönderilemedi.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={classes.ask} onSubmit={submit}>
      <p className={classes.askIntro}>Neo bu bildirimi çözmek için ek bilgiye ihtiyaç duyuyor:</p>
      <ul className={classes.questions}>
        {(report.clarifying_questions ?? []).map((question) => (
          <li key={question}>{question}</li>
        ))}
      </ul>
      <Textarea
        aria-label="Yanıtınız"
        placeholder="Soruların yanıtlarını buraya yazın..."
        autosize
        minRows={3}
        maxRows={8}
        maxLength={8000}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <Button
        type="submit"
        size="xs"
        loading={sending}
        leftSection={<FaIcon icon="fas fa-paper-plane" />}
      >
        Yanıtla
      </Button>
    </form>
  );
}

function ReportEntry({
  report,
  open,
  onToggle,
}: {
  report: FeedbackReport;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = REPORT_STATUS[report.status] ?? {
    label: report.status_display || report.status,
    family: 'grey' as const,
  };
  const waiting = needsAnswer(report);
  const bodyId = `neo-report-${report.id}`;
  return (
    <li className={classes.report} data-open={open || undefined} data-report-id={report.id}>
      <UnstyledButton
        className={classes.row}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className={classes.rowIcon}>
          <FaIcon icon={KIND_ICONS[report.kind] ?? KIND_ICONS.other!} />
        </span>
        <span className={classes.rowMain}>
          <span className={classes.rowTitle}>{report.title}</span>
        </span>
        {waiting && (
          <span className={classes.answerHint} title="Neo yanıtınızı bekliyor">
            <FaIcon icon="fas fa-reply" />
            <VisuallyHidden>Neo yanıtınızı bekliyor</VisuallyHidden>
          </span>
        )}
        <StatusBadge color={meta.family}>{meta.label}</StatusBadge>
        <FaIcon icon="fas fa-chevron-down" className={classes.caret} />
      </UnstyledButton>
      {open && (
        <div className={classes.reportBody} id={bodyId}>
          <ul className={classes.timeline}>
            {reportTimeline(report).map((row) => (
              <li key={row.label} data-pending={!row.done || undefined}>
                <FaIcon icon={row.done ? 'fas fa-circle-check' : 'far fa-circle'} />
                <span>{row.label}</span>
                <span className={classes.timelineWhen}>{formatDate(row.when)}</span>
              </li>
            ))}
          </ul>
          <div className={classes.label}>Bildiriminiz</div>
          <div className={classes.quote}>{report.description || '-'}</div>
          {report.ai_summary ? (
            <>
              <div className={classes.label}>Neo&apos;nun değerlendirmesi</div>
              <div className={classes.quote}>{report.ai_summary}</div>
            </>
          ) : null}
          {(report.user_responses ?? []).map((response, index) => (
            <div key={`${response.at ?? ''}-${index}`}>
              <div className={classes.label}>Neo sordu</div>
              <ul className={classes.questions}>
                {(response.questions ?? []).map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
              <div className={classes.label}>
                Yanıtınız <span>{formatDate(response.at)}</span>
              </div>
              <div className={classes.quote}>{response.text || '-'}</div>
            </div>
          ))}
          {waiting && <AnswerForm report={report} />}
        </div>
      )}
    </li>
  );
}

function ReportForm({ titleRef }: { titleRef: React.RefObject<HTMLInputElement | null> }) {
  const [kind, setKind] = useState<ReportKind>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    if (title.trim().length < 5) {
      notify.error('Başlık en az 5 karakter olmalı.');
      return;
    }
    if (description.trim().length < 15) {
      notify.error('Lütfen sorunu biraz daha ayrıntılı anlatın.');
      return;
    }
    setSending(true);
    try {
      await createReport({
        kind,
        title: title.trim(),
        description: description.trim(),
        pageUrl: window.location.href,
        context: {
          user_agent: navigator.userAgent,
          screen: `${window.innerWidth}x${window.innerHeight}`,
          portal: 'office',
        },
      });
      setTitle('');
      setDescription('');
      notify.success('Bildiriminiz alındı. Teşekkürler.');
      void queryClient.invalidateQueries({ queryKey: neoKeys.reports });
    } catch (error) {
      notify.error(error, { fallback: 'Bildirim gönderilemedi.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={classes.form} onSubmit={submit}>
      <NativeSelect
        aria-label="Bildirim türü"
        data={KIND_OPTIONS}
        value={kind}
        onChange={(event) => setKind(event.currentTarget.value as ReportKind)}
      />
      <TextInput
        ref={titleRef}
        aria-label="Kısa başlık"
        placeholder="Kısa başlık"
        maxLength={200}
        value={title}
        onChange={(event) => setTitle(event.currentTarget.value)}
      />
      <Textarea
        aria-label="Açıklama"
        placeholder="Sorunu veya isteği anlatın: Hangi sayfada? Ne yaptınız? Ne oldu, ne olmalıydı?"
        autosize
        minRows={4}
        maxRows={10}
        maxLength={8000}
        value={description}
        onChange={(event) => setDescription(event.currentTarget.value)}
      />
      <Button type="submit" loading={sending} leftSection={<FaIcon icon="fas fa-paper-plane" />}>
        Gönder
      </Button>
      <p className={classes.formNote}>
        Bildiriminiz yapay zekâ tarafından incelenir; uygun görülenler otomatik olarak geliştirme
        kuyruğuna alınır. Durumunu aşağıdan takip edebilirsiniz.
      </p>
    </form>
  );
}

/** "Hata / Öneri Bildir": the form, then the user's reports. */
export function NeoReports() {
  const { data: reports, isPending, isError } = useMyReports(true);
  const focusId = useNeo((s) => s.focusReportId);
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Plain opens land in the form; a deep link lands on its report instead.
  useEffect(() => {
    if (getNeoState().focusReportId === null) titleRef.current?.focus();
  }, []);

  // The bell's deep link: open that report and bring it into view.
  useEffect(() => {
    if (focusId === null || !reports) return;
    const index = reports.findIndex((report) => report.id === focusId);
    if (index >= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- an outside request, applied once
      setOpenIds((ids) => new Set(ids).add(focusId));
      if (index >= PAGE_SIZE) setShowAll(true);
      requestAnimationFrame(() => {
        scrollRef.current
          ?.querySelector(`[data-report-id="${focusId}"]`)
          ?.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    }
    clearFocusReport();
  }, [focusId, reports]);

  const toggle = (id: number) =>
    setOpenIds((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  let list;
  if (isPending) list = <div className={classes.muted}>Yükleniyor…</div>;
  else if (isError) list = <div className={classes.muted}>Bildirimler yüklenemedi.</div>;
  else if (reports.length === 0)
    list = <div className={classes.muted}>Henüz bildiriminiz yok.</div>;
  else {
    const visible = showAll ? reports : reports.slice(0, PAGE_SIZE);
    list = (
      <>
        <ul className={classes.list}>
          {visible.map((report) => (
            <ReportEntry
              key={report.id}
              report={report}
              open={openIds.has(report.id)}
              onToggle={() => toggle(report.id)}
            />
          ))}
        </ul>
        {reports.length > visible.length && (
          <UnstyledButton className={classes.more} onClick={() => setShowAll(true)}>
            Tümünü Göster ({reports.length})
          </UnstyledButton>
        )}
      </>
    );
  }

  return (
    <div className={classes.scroll} ref={scrollRef}>
      <h3 className={classes.sectionTitle}>Hata / Öneri Bildir</h3>
      <ReportForm titleRef={titleRef} />
      <h3 className={classes.sectionTitle}>Bildirim Geçmişim</h3>
      {list}
    </div>
  );
}
