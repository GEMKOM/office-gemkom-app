import { renderRichText } from '@/ui/RichText/renderRichText';
import { Anchor, Button, Center, Loader, Modal, Text, Textarea } from '@mantine/core';
import { useEffect, useState, type ReactNode } from 'react';
import {
  useFeedbackAction,
  useFeedbackReport,
  type FeedbackAction,
  type FeedbackReportDetail,
} from '@/api/it/feedback';
import { FaIcon, FormModal, ModalBody, ModalFooter, ModalHeader, ModalSection, modalClassNames, notify } from '@/ui';
import css from './FeedbackPage.module.css';
import {
  FeedbackStatusBadge,
  kindMeta,
  PRIORITY_LABELS,
  RECOMMENDATION_LABELS,
  REPO_LABELS,
  shortDateTime,
  usd,
} from './feedbackMeta';

function Chip({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <span className={css.chip}>
      {label}: <strong>{value}</strong>
    </span>
  );
}

function TimelineItem({ done, label, when }: { done: boolean; label: string; when?: string | null }) {
  return (
    <li>
      {done ? (
        <FaIcon icon="fas fa-check-circle" className={css.done} />
      ) : (
        <FaIcon icon="far fa-circle" className={css.pending} />
      )}
      <span className={css.when}>{shortDateTime(when)}</span>
      <span>{label}</span>
    </li>
  );
}

function ReportBody({ report }: { report: FeedbackReportDetail }) {
  const analysis = report.ai_analysis ?? {};
  const kind = kindMeta(report.kind);
  const context = report.context ?? {};
  const github = report.github_issues ?? [];
  const responses = report.user_responses ?? [];
  const anyPr = github.find((e) => e.pr_number);
  const merged = github.some((e) => e.pr_merged_at);
  const closed = ['done', 'dismissed', 'duplicate'].includes(report.status);
  const criteria = analysis.acceptance_criteria ?? [];
  const questions = analysis.clarifying_questions ?? [];

  return (
    <>
      <ModalSection title="Bildirim" icon="fas fa-file-lines">
        <div className={css.chips}>
          <FeedbackStatusBadge status={report.status} />
          <Chip label="Tür" value={kind.label} />
          <Chip label="Bildiren" value={report.reporter_name || report.reporter_username} />
          <Chip label="Tarih" value={new Date(report.created_at).toLocaleString('tr-TR')} />
        </div>
        <div className={css.desc}>{report.description}</div>
        {report.page_url ? (
          <div className={css.metaLine}>
            <FaIcon icon="fas fa-link" /> {report.page_url}
          </div>
        ) : null}
        {context.user_agent ? (
          <div className={css.metaLine}>
            <FaIcon icon="fas fa-display" /> {`${context.screen || ''} · ${context.user_agent}`}
          </div>
        ) : null}
        {report.admin_note ? (
          <div className={css.metaLine}>
            <FaIcon icon="fas fa-note-sticky" /> Not: {report.admin_note}
          </div>
        ) : null}
      </ModalSection>

      {report.analyzed_at ? (
        <ModalSection title="AI Triyajı" icon="fas fa-robot">
          <div>{report.ai_summary || analysis.summary || ''}</div>
          <div className={css.chips}>
            <Chip
              label="Öneri"
              value={RECOMMENDATION_LABELS[report.ai_recommendation ?? ''] || report.ai_recommendation}
            />
            <Chip label="Önem" value={analysis.severity} />
            <Chip label="Öncelik" value={PRIORITY_LABELS[report.priority ?? ''] || report.priority} />
            <Chip label="Risk" value={analysis.risk} />
            <Chip label="Kapsam" value={analysis.estimated_scope} />
            <Chip label="Hedef" value={REPO_LABELS[report.target_repo ?? ''] || report.target_repo} />
            <Chip label="Alan" value={analysis.affected_area} />
            <Chip label="Maliyet" value={usd(report.ai_cost_usd)} />
          </div>
          {analysis.reasoning ? (
            <Text size="sm" c="dimmed">
              {analysis.reasoning}
            </Text>
          ) : null}
          {analysis.implementation_brief ? (
            // renderRichText escapes first and only adds its own tags.
            <div
              className={css.brief}
              dangerouslySetInnerHTML={{ __html: renderRichText(analysis.implementation_brief) }}
            />
          ) : null}
          {criteria.length ? (
            <>
              <div className={css.listTitle}>Kabul kriterleri</div>
              <ul className={css.criteria}>
                {criteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
          {questions.length ? (
            <>
              <div className={css.listTitle}>Kullanıcıya sorulacaklar</div>
              <ul className={css.criteria}>
                {questions.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
        </ModalSection>
      ) : null}

      {responses.length ? (
        <ModalSection title="Kullanıcı Yanıtları" icon="fas fa-reply">
          {responses.map((response, index) => (
            <div key={index} className={css.ghEntry} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              {(response.questions ?? []).map((q, i) => (
                <Text key={i} size="xs" c="dimmed">
                  ▸ {q}
                </Text>
              ))}
              <div style={{ whiteSpace: 'pre-wrap' }}>{response.text || ''}</div>
              <Text size="xs" c="dimmed">
                {response.at ? new Date(response.at).toLocaleString('tr-TR') : ''}
              </Text>
            </div>
          ))}
        </ModalSection>
      ) : null}

      {github.length ? (
        <ModalSection title="GitHub" icon="fab fa-github">
          {github.map((entry, index) => (
            <div key={index} className={css.ghEntry}>
              <Text span c="dimmed" size="sm">
                {entry.repo}
              </Text>
              <Anchor href={entry.issue_url || '#'} target="_blank" rel="noopener" size="sm">
                <FaIcon icon="fas fa-circle-dot" /> Issue #{entry.issue_number}
              </Anchor>
              <span className={css.chip}>{entry.issue_state || '?'}</span>
              {entry.pr_url ? (
                <>
                  <Anchor href={entry.pr_url} target="_blank" rel="noopener" size="sm">
                    <FaIcon icon="fas fa-code-pull-request" /> PR #{entry.pr_number}
                  </Anchor>
                  <span className={css.chip}>{entry.pr_merged_at ? 'merge edildi' : entry.pr_state || '?'}</span>
                </>
              ) : (
                <Text span c="dimmed" size="xs">
                  PR henüz açılmadı
                </Text>
              )}
            </div>
          ))}
        </ModalSection>
      ) : null}

      <ModalSection title="Süreç" icon="fas fa-timeline">
        <ul className={css.timeline}>
          <TimelineItem done label="Bildirim alındı" when={report.created_at} />
          <TimelineItem done={Boolean(report.analyzed_at)} label="AI analizi" when={report.analyzed_at} />
          <TimelineItem
            done={github.length > 0}
            label="Geliştirme kuyruğu (GitHub issue)"
            when={report.reviewed_at}
          />
          <TimelineItem done={Boolean(anyPr)} label={anyPr ? `PR açıldı (#${anyPr.pr_number})` : 'PR açılması'} />
          <TimelineItem
            done={merged || closed}
            label={merged ? 'Merge edildi — yayında' : 'Kapanış'}
            when={report.resolved_at}
          />
        </ul>
      </ModalSection>
    </>
  );
}

interface ActionButton {
  action: FeedbackAction;
  label: string;
  icon: string;
  variant: 'filled' | 'default' | 'light';
  color?: string;
}

/** The manager actions legacy offered for each status. */
export function actionsFor(report: FeedbackReportDetail): ActionButton[] {
  const actions: ActionButton[] = [];
  if (['new', 'needs_info', 'analyzed', 'duplicate'].includes(report.status)) {
    actions.push({
      action: 'analyze',
      label: report.analyzed_at ? 'Yeniden Analiz Et' : 'AI Analizi Çalıştır',
      icon: 'fas fa-robot',
      variant: 'default',
    });
  }
  if (report.status === 'analyzed') {
    actions.push({ action: 'queue', label: 'Kuyruğa Al (Issue Aç)', icon: 'fas fa-rocket', variant: 'filled' });
  }
  if (['queued', 'in_review', 'failed'].includes(report.status)) {
    actions.push({ action: 'sync', label: 'GitHub Senkronize', icon: 'fas fa-rotate', variant: 'default' });
  }
  if (!['done', 'dismissed'].includes(report.status)) {
    actions.push({ action: 'dismiss', label: 'Reddet', icon: 'fas fa-ban', variant: 'light', color: 'red' });
  }
  return actions;
}

/** Legacy used window.prompt; a cancelled prompt no longer dismisses the report. */
function DismissModal({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <FormModal
      opened
      onClose={onCancel}
      title="Bildirimi Reddet"
      icon="fas fa-ban"
      size="md"
      submitLabel="Reddet"
      submitIcon="fas fa-ban"
      onSubmit={() => onSubmit(note)}
    >
      <Textarea
        label="Reddetme nedeni (opsiyonel):"
        rows={3}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        data-autofocus
      />
    </FormModal>
  );
}

export interface FeedbackReportModalProps {
  reportId: number;
  onClose: () => void;
}

/** Port of openReportModal + runAction in feedback.js. */
export function FeedbackReportModal({ reportId, onClose }: FeedbackReportModalProps) {
  const detail = useFeedbackReport(reportId);
  const run = useFeedbackAction();
  const [running, setRunning] = useState<FeedbackAction | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!detail.isError) return;
    notify.error(detail.error, { fallback: 'Bildirim yüklenemedi.' });
    onClose();
  }, [detail.isError, detail.error, onClose]);

  const report = detail.data;

  const execute = async (action: FeedbackAction, note?: string) => {
    setRunning(action);
    try {
      await run.mutateAsync({ id: reportId, action, note });
      notify.success('İşlem tamamlandı.');
      onClose();
    } catch (error) {
      notify.error(error, { fallback: 'İşlem başarısız.' });
      setRunning(null);
    }
  };

  let body: ReactNode;
  if (!report) {
    body = (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  } else {
    body = <ReportBody report={report} />;
  }

  return (
    <>
      <Modal
        opened={!dismissing}
        onClose={() => {
          if (!running) onClose();
        }}
        size="lg"
        withCloseButton={false}
        classNames={modalClassNames}
      >
        <ModalHeader
          title={report ? `#${report.id} — ${report.title}` : 'Bildirim'}
          icon={kindMeta(report?.kind).icon}
        />
        <ModalBody>{body}</ModalBody>
        <ModalFooter>
          {report
            ? actionsFor(report).map((a) => (
                <Button
                  key={a.action}
                  size="sm"
                  variant={a.variant}
                  color={a.color}
                  loading={running === a.action}
                  disabled={running !== null && running !== a.action}
                  leftSection={<FaIcon icon={a.icon} />}
                  onClick={() => (a.action === 'dismiss' ? setDismissing(true) : void execute(a.action))}
                >
                  {a.label}
                </Button>
              ))
            : null}
          <Button variant="default" onClick={onClose} disabled={running !== null}>
            Kapat
          </Button>
        </ModalFooter>
      </Modal>
      {dismissing ? (
        <DismissModal
          onCancel={() => setDismissing(false)}
          onSubmit={(note) => {
            setDismissing(false);
            void execute('dismiss', note);
          }}
        />
      ) : null}
    </>
  );
}
