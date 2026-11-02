import type { ReactNode } from 'react';
import {
  DEFECT_TYPE_CHOICES,
  DISPOSITION_CHOICES,
  SEVERITY_CHOICES,
  type Choice,
  type Ncr,
  type NcrSubmission,
} from '@/api/quality-control/ncrs';
import { formatDate, formatDateTime } from '@/lib/format';
import { FaIcon, StatusBadge, type StatusFamily } from '@/ui';
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

function Cell({
  label,
  span = 1,
  empty = false,
  children,
}: {
  label: string;
  span?: number;
  empty?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={classes.cell} style={{ gridColumn: `span ${span}` }}>
      <div className={classes.label}>{label}</div>
      <div className={`${classes.value} ${empty ? classes.empty : ''}`}>{children}</div>
    </div>
  );
}

function TextCell({
  label,
  value,
  span,
  emptyText = '—',
}: {
  label: string;
  value: unknown;
  span?: number;
  emptyText?: string;
}) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return (
    <Cell label={label} span={span} empty={!text}>
      {text || emptyText}
    </Cell>
  );
}

/** A choice list drawn as form check boxes, the selected one ticked. */
function Checks({ choices, selected }: { choices: Choice[]; selected: string | undefined }) {
  return (
    <div className={classes.checks}>
      {choices.map((choice) => {
        const on = choice.value === selected;
        return (
          <span key={choice.value} className={classes.check} data-checked={on || undefined}>
            <span className={classes.box}>
              {on ? <i className="fas fa-check" aria-hidden /> : null}
            </span>
            {choice.label}
          </span>
        );
      })}
    </div>
  );
}

export function SectionNumber({ children }: { children: ReactNode }) {
  return <span className={classes.num}>{children}</span>;
}

/** A modal section title in the form's numbered style. */
export function numberedTitle(number: ReactNode, title: string) {
  return (
    <span className={classes.sectionHeading}>
      <SectionNumber>{number}</SectionNumber>
      {title}
    </span>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={classes.section}>
      <h3 className={classes.sectionTitle}>
        <SectionNumber>{number}</SectionNumber>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Narrative({ value, emptyText }: { value: string | undefined; emptyText: string }) {
  const text = (value || '').trim();
  return (
    <div className={`${classes.narrative} ${text ? '' : classes.empty}`}>{text || emptyText}</div>
  );
}

function Signature({
  role,
  name,
  date,
  children,
}: {
  role: string;
  name?: string | null;
  date?: string;
  children?: ReactNode;
}) {
  return (
    <div className={classes.sign}>
      <div className={classes.label}>{role}</div>
      <div className={`${classes.signName} ${name ? '' : classes.empty}`}>{name || '—'}</div>
      <div className={classes.signDate}>{date || ' '}</div>
      {children}
    </div>
  );
}

function QcSignature({ ncr, entries }: { ncr: Ncr; entries: NcrSubmission[] }) {
  const last = entries[entries.length - 1];
  if (!last) {
    // No history array at all = an older backend; only claim "not sent" when we know.
    const neverSent = Array.isArray(ncr.approval_history) && (ncr.submission_count ?? 0) === 0;
    return (
      <Signature role="Kalite Kontrol Onayı">
        <div className={classes.signNote}>{neverSent ? 'Henüz onaya gönderilmedi' : '—'}</div>
      </Signature>
    );
  }
  const decision = last.decisions[last.decisions.length - 1];
  const outcome = outcomeOf(last);
  const badge = (
    <div className={classes.signNote}>
      <StatusBadge color={outcome.color}>{outcome.label}</StatusBadge>
    </div>
  );
  if (!decision) {
    return (
      <Signature role="Kalite Kontrol Onayı" date={`Gönderim: ${stamp(last.submitted_at)}`}>
        {badge}
      </Signature>
    );
  }
  return (
    <Signature
      role="Kalite Kontrol Onayı"
      name={decision.approver_name}
      date={stamp(decision.decided_at)}
    >
      {badge}
      {decision.comment ? <div className={classes.signComment}>“{decision.comment}”</div> : null}
    </Signature>
  );
}

function HistoryTable({ entries }: { entries: NcrSubmission[] }) {
  if (entries.length === 0) return null;
  return (
    <>
      <div className={classes.subhead}>Gönderim Geçmişi</div>
      <div style={{ overflowX: 'auto' }}>
        <table className={classes.table}>
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
                    {decision?.comment || <span className={classes.empty}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
      className={classes.mono}
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
    <div className={classes.form}>
      <header className={classes.head}>
        <div className={classes.brand}>
          <img src="/images/gemkom.png" alt="GEMKOM" className={classes.logo} />
          <div>
            <div className={classes.org}>GEMKOM · Kalite Kontrol</div>
            <h2 className={classes.title}>Uygunsuzluk Raporu</h2>
            <div className={classes.subtitle}>Non-Conformance Report (NCR)</div>
          </div>
        </div>
        <table className={classes.meta}>
          <tbody>
            <tr>
              <th>Rapor No</th>
              <td className={classes.mono}>{ncr.ncr_number || `#${ncr.id}`}</td>
            </tr>
            <tr>
              <th>Açılış Tarihi</th>
              <td>{day(ncr.created_at) || '—'}</td>
            </tr>
            <tr>
              <th>Durum</th>
              <td>
                <StatusBadge color={STATUS_COLOR[String(ncr.status)] ?? 'grey'}>
                  {statusLabel}
                </StatusBadge>
              </td>
            </tr>
            <tr>
              <th>Gönderim Sayısı</th>
              <td>{ncr.submission_count ?? 0}</td>
            </tr>
          </tbody>
        </table>
      </header>

      {!forPrint && next?.actor ? (
        <div className={classes.next}>
          <FaIcon icon="fas fa-arrow-right" />
          <span>
            Sıradaki adım: <strong>{next.actor}</strong> — {next.task}
          </span>
        </div>
      ) : null}

      <Section number={1} title="Tanımlama">
        <div className={classes.grid}>
          <Cell label="İş Emri" span={2} empty={!ncr.job_order}>
            {ncr.job_order ? (
              <>
                <a
                  href={`/projects/project-tracking/?job_no=${encodeURIComponent(ncr.job_order)}`}
                  target="_blank"
                  rel="noreferrer"
                  className={classes.mono}
                >
                  {ncr.job_order}
                </a>
                {ncr.job_order_title ? (
                  <div className={classes.sub}>{ncr.job_order_title}</div>
                ) : null}
              </>
            ) : (
              '—'
            )}
          </Cell>
          <TextCell label="Müşteri" value={ncr.job_order_customer_name} />
          <Cell label="Etkilenen Miktar">
            {ncr.affected_quantity ?? '—'} <span className={classes.sub}>adet</span>
          </Cell>
          <TextCell label="İlgili Görev" value={ncr.department_task_title} span={2} />
          <Cell label="KK İnceleme" empty={!qcReviewId}>
            {qcReviewId ? <QcReviewLink id={qcReviewId} /> : '—'}
          </Cell>
          <TextCell label="Tespit Eden" value={ncr.detected_by_name} />
          <TextCell label="Sorumlu Grup" value={teamName} span={2} emptyText="Atanmamış" />
          <Cell label="Sorumlu Kişiler" span={2} empty={members.length === 0}>
            {members.length ? members.join(', ') : '—'}
          </Cell>
        </div>
      </Section>

      <Section number={2} title="Uygunsuzluk Tanımı">
        <div className={classes.grid}>
          <Cell label="Başlık" span={4}>
            <strong>{ncr.title || '—'}</strong>
          </Cell>
          <Cell label="Açıklama" span={4} empty={!ncr.description}>
            {ncr.description || '—'}
          </Cell>
          <Cell label="Kusur Tipi" span={3}>
            <Checks choices={DEFECT_TYPE_CHOICES} selected={ncr.defect_type} />
          </Cell>
          <Cell label="Önem Derecesi">
            <Checks choices={SEVERITY_CHOICES} selected={ncr.severity} />
          </Cell>
        </div>
      </Section>

      <Section number={3} title="Kök Neden Analizi">
        <Narrative value={ncr.root_cause} emptyText="Kök neden henüz girilmedi." />
      </Section>

      <Section number={4} title="Düzeltici Faaliyet">
        <Narrative value={ncr.corrective_action} emptyText="Düzeltici faaliyet henüz girilmedi." />
      </Section>

      <Section number={5} title="Karar (Uygunsuz Ürün)">
        <div className={classes.grid}>
          <Cell label="Ürün için verilen karar" span={4}>
            <Checks choices={DISPOSITION_CHOICES} selected={ncr.disposition} />
          </Cell>
        </div>
      </Section>

      <Section number={6} title="Onay ve Kayıt">
        <div className={classes.signs}>
          <Signature role="Hazırlayan" name={ncr.created_by_name} date={stamp(ncr.created_at)} />
          <Signature role="Tespit Eden" name={ncr.detected_by_name} />
          <QcSignature ncr={ncr} entries={entries} />
        </div>
        <HistoryTable entries={entries} />
      </Section>

      <Section number={7} title="Ekler">
        <div className={classes.files}>{attachments}</div>
      </Section>
    </div>
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
          <span className={classes.mono}>{ncr.ncr_number || `#${ncr.id}`}</span>
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
              İş Emri <span className={classes.mono}>{ncr.job_order}</span>
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
