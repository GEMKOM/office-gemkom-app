import type { ReactNode } from 'react';
import {
  DEFECT_TYPE_CHOICES,
  DISPOSITION_CHOICES,
  SEVERITY_CHOICES,
  type Ncr,
  type NcrSubmission,
} from '@/api/quality-control/ncrs';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  FaIcon,
  PaperBlock,
  PaperCell,
  PaperChecks,
  PaperForm,
  PaperGrid,
  PaperNarrative,
  PaperSection,
  PaperSectionNumber,
  PaperSignature,
  PaperSignatures,
  PaperSignComment,
  PaperSubhead,
  PaperTable,
  PaperTextCell,
  paperClasses,
  StatusBadge,
  type StatusFamily,
} from '@/ui';
import type { NextAction } from './ncrRules';
import classes from './ncrs.module.css';

// Port of ncrForm.js renderNcrForm / renderNcrContext.

const STATUS_COLOR: Record<string, StatusFamily> = {
  draft: 'grey',
  submitted: 'blue',
  approved: 'green',
  rejected: 'red',
  closed: 'purple',
};

const SEVERITY_COLOR: Record<string, StatusFamily> = {
  minor: 'blue',
  major: 'orange',
  critical: 'red',
};

const OUTCOME: Record<string, { label: string; color: StatusFamily }> = {
  pending: { label: 'Karar Bekleniyor', color: 'blue' },
  approved: { label: 'Onaylandı', color: 'green' },
  rejected: { label: 'Reddedildi', color: 'red' },
  cancelled: { label: 'İptal Edildi', color: 'grey' },
};

const outcomeOf = (entry: NcrSubmission) => OUTCOME[entry.outcome ?? ''] ?? OUTCOME.pending!;

const DAY: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
const day = (value: string | null | undefined) => (value ? formatDate(value, DAY) : '');
const stamp = (value: string | null | undefined) => (value ? formatDateTime(value) : '');

function history(ncr: Ncr): NcrSubmission[] {
  return Array.isArray(ncr.approval_history)
    ? ncr.approval_history.map((entry) => ({ ...entry, decisions: entry.decisions ?? [] }))
    : [];
}

export const SectionNumber = PaperSectionNumber;

/** A modal section title in the form's numbered style. */
export function numberedTitle(number: ReactNode, title: string) {
  return (
    <span className={classes.sectionHeading}>
      <SectionNumber>{number}</SectionNumber>
      {title}
    </span>
  );
}

function QcSignature({ ncr, entries }: { ncr: Ncr; entries: NcrSubmission[] }) {
  const last = entries[entries.length - 1];
  if (!last) {
    // No history array at all = an older backend; only claim "not sent" when we know.
    const neverSent = Array.isArray(ncr.approval_history) && (ncr.submission_count ?? 0) === 0;
    return (
      <PaperSignature
        role="Kalite Kontrol Onayı"
        note={neverSent ? 'Henüz onaya gönderilmedi' : '—'}
      />
    );
  }
  const decision = last.decisions[last.decisions.length - 1];
  const outcome = outcomeOf(last);
  const badge = <StatusBadge color={outcome.color}>{outcome.label}</StatusBadge>;
  if (!decision) {
    return (
      <PaperSignature
        role="Kalite Kontrol Onayı"
        date={`Gönderim: ${stamp(last.submitted_at)}`}
        note={badge}
      />
    );
  }
  return (
    <PaperSignature
      role="Kalite Kontrol Onayı"
      name={decision.approver_name}
      date={stamp(decision.decided_at)}
      note={badge}
    >
      {decision.comment ? <PaperSignComment>{decision.comment}</PaperSignComment> : null}
    </PaperSignature>
  );
}

function HistoryTable({ entries }: { entries: NcrSubmission[] }) {
  if (entries.length === 0) return null;
  return (
    <>
      <PaperSubhead>Gönderim Geçmişi</PaperSubhead>
      <PaperTable>
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th>Gönderim</th>
            <th>Sonuç</th>
            <th>Karar Veren</th>
            <th>Karar Tarihi</th>
            <th>Yorum</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const outcome = outcomeOf(entry);
            const decision = entry.decisions[entry.decisions.length - 1];
            return (
              <tr key={index}>
                <td style={{ textAlign: 'center' }}>{index + 1}</td>
                <td>{stamp(entry.submitted_at)}</td>
                <td>
                  <StatusBadge color={outcome.color}>{outcome.label}</StatusBadge>
                </td>
                <td>{decision?.approver_name || '—'}</td>
                <td>{decision ? stamp(decision.decided_at) || '—' : '—'}</td>
                <td style={{ whiteSpace: 'pre-line' }}>
                  {decision?.comment || <span className={paperClasses.empty}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </PaperTable>
    </>
  );
}

export interface NcrPaperFormProps {
  ncr: Ncr;
  statusLabel: string;
  teamName: string;
  qcReviewId: string | null;
  next: NextAction | null;
  /** The Ekler section's content (file list and buttons). */
  attachments: ReactNode;
  /** The print copy leaves the next-step strip out. */
  forPrint?: boolean;
}

export function QcReviewLink({ id }: { id: string }) {
  return (
    <a
      href={`/quality-control/qc-reviews/?review=${encodeURIComponent(id)}`}
      target="_blank"
      rel="noreferrer"
      className={paperClasses.mono}
      onClick={(event) => event.stopPropagation()}
    >
      <FaIcon icon="fas fa-search" style={{ fontSize: 11, marginRight: 4 }} />#{id}
    </a>
  );
}

export function NcrPaperForm({
  ncr,
  statusLabel,
  teamName,
  qcReviewId,
  next,
  attachments,
  forPrint = false,
}: NcrPaperFormProps) {
  const entries = history(ncr);
  const members = (ncr.assigned_members_data ?? []).map((m) => m.name).filter(Boolean);
  return (
    <PaperForm
      org="GEMKOM · Kalite Kontrol"
      title="Uygunsuzluk Raporu"
      subtitle="Non-Conformance Report (NCR)"
      meta={[
        { label: 'Rapor No', value: ncr.ncr_number || `#${ncr.id}`, mono: true },
        { label: 'Açılış Tarihi', value: day(ncr.created_at) || '—' },
        {
          label: 'Durum',
          value: (
            <StatusBadge color={STATUS_COLOR[String(ncr.status)] ?? 'grey'}>
              {statusLabel}
            </StatusBadge>
          ),
        },
        { label: 'Gönderim Sayısı', value: ncr.submission_count ?? 0 },
      ]}
      banner={
        !forPrint && next?.actor ? (
          <>
            <FaIcon icon="fas fa-arrow-right" />
            <span>
              Sıradaki adım: <strong>{next.actor}</strong> — {next.task}
            </span>
          </>
        ) : null
      }
    >
      <PaperSection number={1} title="Tanımlama">
        <PaperGrid>
          <PaperCell label="İş Emri" span={2} empty={!ncr.job_order}>
            {ncr.job_order ? (
              <>
                <a
                  href={`/projects/project-tracking/?job_no=${encodeURIComponent(ncr.job_order)}`}
                  target="_blank"
                  rel="noreferrer"
                  className={paperClasses.mono}
                >
                  {ncr.job_order}
                </a>
                {ncr.job_order_title ? (
                  <div className={paperClasses.sub}>{ncr.job_order_title}</div>
                ) : null}
              </>
            ) : (
              '—'
            )}
          </PaperCell>
          <PaperTextCell label="Müşteri" value={ncr.job_order_customer_name} />
          <PaperCell label="Etkilenen Miktar">
            {ncr.affected_quantity ?? '—'} <span className={paperClasses.sub}>adet</span>
          </PaperCell>
          <PaperTextCell label="İlgili Görev" value={ncr.department_task_title} span={2} />
          <PaperCell label="KK İnceleme" empty={!qcReviewId}>
            {qcReviewId ? <QcReviewLink id={qcReviewId} /> : '—'}
          </PaperCell>
          <PaperTextCell label="Tespit Eden" value={ncr.detected_by_name} />
          <PaperTextCell label="Sorumlu Grup" value={teamName} span={2} emptyText="Atanmamış" />
          <PaperCell label="Sorumlu Kişiler" span={2} empty={members.length === 0}>
            {members.length ? members.join(', ') : '—'}
          </PaperCell>
        </PaperGrid>
      </PaperSection>

      <PaperSection number={2} title="Uygunsuzluk Tanımı">
        <PaperGrid>
          <PaperCell label="Başlık" span={4}>
            <strong>{ncr.title || '—'}</strong>
          </PaperCell>
          <PaperCell label="Açıklama" span={4} empty={!ncr.description}>
            {ncr.description || '—'}
          </PaperCell>
          <PaperCell label="Kusur Tipi" span={3}>
            <PaperChecks choices={DEFECT_TYPE_CHOICES} selected={ncr.defect_type} />
          </PaperCell>
          <PaperCell label="Önem Derecesi">
            <PaperChecks choices={SEVERITY_CHOICES} selected={ncr.severity} />
          </PaperCell>
        </PaperGrid>
      </PaperSection>

      <PaperSection number={3} title="Kök Neden Analizi">
        <PaperNarrative value={ncr.root_cause} emptyText="Kök neden henüz girilmedi." />
      </PaperSection>

      <PaperSection number={4} title="Düzeltici Faaliyet">
        <PaperNarrative
          value={ncr.corrective_action}
          emptyText="Düzeltici faaliyet henüz girilmedi."
        />
      </PaperSection>

      <PaperSection number={5} title="Karar (Uygunsuz Ürün)">
        <PaperGrid>
          <PaperCell label="Ürün için verilen karar" span={4}>
            <PaperChecks choices={DISPOSITION_CHOICES} selected={ncr.disposition} />
          </PaperCell>
        </PaperGrid>
      </PaperSection>

      <PaperSection number={6} title="Onay ve Kayıt">
        <PaperSignatures>
          <PaperSignature
            role="Hazırlayan"
            name={ncr.created_by_name}
            date={stamp(ncr.created_at)}
          />
          <PaperSignature role="Tespit Eden" name={ncr.detected_by_name} />
          <QcSignature ncr={ncr} entries={entries} />
        </PaperSignatures>
        <HistoryTable entries={entries} />
      </PaperSection>

      <PaperSection number={7} title="Ekler">
        <PaperBlock>{attachments}</PaperBlock>
      </PaperSection>
    </PaperForm>
  );
}

/** The QC decision that sent this NCR back, if its latest submission was rejected. */
function latestRejection(ncr: Ncr) {
  const entries = history(ncr);
  const last = entries[entries.length - 1];
  if (!last || last.outcome !== 'rejected') return null;
  return last.decisions.filter((d) => d.decision === 'reject').pop() ?? null;
}

/**
 * Read-only summary at the top of the edit / submit modals, so whoever fills
 * them in sees what they are answering.
 */
export function NcrContext({
  ncr,
  statusLabel,
  showDescription = true,
}: {
  ncr: Ncr;
  statusLabel: string;
  showDescription?: boolean;
}) {
  const rejection = latestRejection(ncr);
  return (
    <>
      <div className={classes.context}>
        <div className={classes.contextTop}>
          <span className={paperClasses.mono}>{ncr.ncr_number || `#${ncr.id}`}</span>
          <StatusBadge color={STATUS_COLOR[String(ncr.status)] ?? 'grey'}>
            {statusLabel}
          </StatusBadge>
          {ncr.severity_display || ncr.severity ? (
            <StatusBadge color={SEVERITY_COLOR[String(ncr.severity)] ?? 'grey'}>
              {ncr.severity_display || ncr.severity}
            </StatusBadge>
          ) : null}
          {ncr.job_order ? (
            <span>
              İş Emri <span className={paperClasses.mono}>{ncr.job_order}</span>
              {ncr.job_order_title ? ` · ${ncr.job_order_title}` : ''}
            </span>
          ) : null}
        </div>
        <div className={classes.contextTitle}>{ncr.title || ''}</div>
        {showDescription && ncr.description ? (
          <div className={classes.contextDesc}>{ncr.description}</div>
        ) : null}
      </div>
      {rejection ? (
        <div className={classes.callout}>
          <FaIcon icon="fas fa-rotate-left" />
          <div>
            <div>
              <strong>Kalite Kontrol reddetti</strong> · {rejection.approver_name},{' '}
              {stamp(rejection.decided_at)}
            </div>
            {rejection.comment ? (
              <div className={classes.calloutText}>{rejection.comment}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
