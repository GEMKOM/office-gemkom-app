import { useState, type ReactNode } from 'react';
import { AppLink } from '@/shell/AppLink';
import { FaIcon } from '@/ui';
import classes from './NeoUsagePage.module.css';

/*
 * The summary body of components/daily-summary/render.js renderDailySummary(),
 * as the Neo page called it: the `full` layer with its defaults (headline,
 * stat chips, highlights, job orders, discussions, areas; lists fold after 8).
 * The payload is data the model helped write, so every string is plain text.
 * "Sizinle ilgili" (for_you) is left out: analytics rows never carry it.
 */

type Json = Record<string, unknown>;

const AREAS: [key: string, label: string, icon: string][] = [
  ['tasarim', 'Tasarım', 'fa-drafting-compass'],
  ['satinalma', 'Satın Alma', 'fa-cart-shopping'],
  ['kalite', 'Kalite', 'fa-clipboard-check'],
  ['planlama', 'Planlama', 'fa-calendar-days'],
  ['uretim', 'Üretim', 'fa-industry'],
  ['satis', 'Satış', 'fa-handshake'],
  ['diger', 'Diğer', 'fa-ellipsis'],
];

const FULL_COLLAPSE_AFTER = 8;

const enc = (value: unknown) => encodeURIComponent(String(value));

// REF.id is whatever the target page's query parameter expects.
const REF_ROUTES: Record<string, (r: Json) => string | null> = {
  job: (r) => `/projects/project-tracking/?job_no=${enc(r.id)}`,
  topic: (r) => (r.job_no ? `/projects/project-tracking/?job_no=${enc(r.job_no)}&topic_id=${enc(r.id)}` : null),
  release: (r) => `/design/release-approvals/?release_id=${enc(r.id)}`,
  qc_review: (r) => `/quality-control/qc-reviews/?review=${enc(r.id)}`,
  ncr: (r) => `/quality-control/ncrs/?ncr=${enc(r.id)}`,
  isg: (r) => `/isg/issues/?issue=${enc(r.id)}`,
  crane: (r) => `/general/crane-requests/list/?request=${enc(r.id)}`,
  pr: (r) => `/procurement/purchase-requests/registry/?talep=${enc(r.id)}`,
  po: (r) => `/finance/purchase-orders/?order=${enc(r.id)}`,
  offer: (r) => `/sales/offers/?offer_no=${enc(r.id)}`,
  dr: (r) => `/general/department-requests/pending/?request=${enc(r.id)}`,
  planning_request: (r) => `/planning/department-requests/?talep=${enc(r.id)}`,
  cnc: (r) => `/manufacturing/cnc-cutting/cuts/?cut=${enc(r.id)}`,
  lc_session: (r) => `/manufacturing/linear-cutting/cuts/?session=${enc(r.id)}`,
  statement: (r) => `/manufacturing/subcontracting/statements/?statement=${enc(r.id)}`,
  mpr: () => '/manufacturing/material-tracking/',
};

const REF_TYPE_LABELS: Record<string, string> = {
  job: 'İş emri',
  topic: 'Tartışma',
  release: 'Çizim yayını',
  qc_review: 'Kalite kontrol',
  ncr: 'NCR',
  isg: 'İSG',
  crane: 'Vinç talebi',
  pr: 'Satın alma talebi',
  po: 'Sipariş',
  offer: 'Teklif',
  dr: 'Departman talebi',
  planning_request: 'Planlama talebi',
  cnc: 'CNC kesim',
  lc_session: 'Profil kesim',
  statement: 'Hakediş',
  mpr: 'Malzeme çekme',
  fault: 'Arıza',
};

// Types whose id is already a human-readable number (GS-10162, NCR-2026-0004…).
const READABLE_ID_TYPES = new Set(['job', 'ncr', 'isg', 'pr', 'offer', 'planning_request']);

type ChipColor = 'grey' | 'green' | 'blue' | 'red' | 'purple' | 'orange';

const OUTCOME_META: Record<string, { label: string; color: ChipColor }> = {
  decided: { label: 'Karar', color: 'green' },
  question_open: { label: 'Soru açık', color: 'orange' },
  needs_action: { label: 'Aksiyon', color: 'red' },
  info: { label: '', color: 'grey' },
};

const TOPIC_TYPE_LABELS: Record<string, string> = {
  revision_request: 'Revizyon talebi',
  drawing_release: 'Çizim yayını',
  release_review: 'Yayın incelemesi',
  qc_review: 'Kalite kontrol',
  consultation: 'Danışma',
  sales_consult: 'Satış danışma',
};

const PRIORITY_META: Record<string, { label: string; color: ChipColor }> = {
  high: { label: 'Yüksek', color: 'orange' },
  urgent: { label: 'Acil', color: 'red' },
  critical: { label: 'Kritik', color: 'red' },
};

const JOB_KIND_LABELS: Record<string, string> = { child: 'Alt iş emri', phase: 'Faz' };

// Stat key → [label, color, always shown]. Order is display order.
const STAT_META: [string, string, ChipColor, boolean][] = [
  ['new_jobs_root', 'iş emri', 'blue', true],
  ['topics_new', 'tartışma', 'purple', true],
  ['comments', 'yorum', 'grey', true],
  ['completed_jobs', 'tamamlanan iş', 'green', false],
  ['participants', 'katılımcı', 'grey', false],
  ['drawings_published', 'çizim yayını', 'grey', false],
  ['revisions_requested', 'revizyon talebi', 'grey', false],
  ['pr_created', 'satın alma talebi', 'grey', false],
  ['po_created', 'sipariş', 'grey', false],
  ['qc_submitted', 'KK gönderimi', 'grey', false],
  ['qc_decided', 'KK kararı', 'grey', false],
  ['ncr_created', 'NCR', 'red', false],
  ['tasks_completed', 'tamamlanan görev', 'grey', false],
  ['cnc_cuts', 'CNC kesim', 'grey', false],
  ['deliveries_jobs', 'teslimat alan iş', 'grey', false],
  ['tonnage_kg', 'kg üretim', 'grey', false],
  ['crane_requests', 'vinç talebi', 'grey', false],
  ['mpr_created', 'malzeme çekme', 'grey', false],
  ['isg_new', 'İSG kaydı', 'orange', false],
  ['faults_new', 'arıza', 'orange', false],
  ['date_changes', 'tarih değişikliği', 'grey', false],
  ['holds', 'bekletme', 'orange', false],
  ['cancelled', 'iptal', 'red', false],
];

const numberFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

function obj(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function statNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isBlankId(id: unknown): boolean {
  return id === null || id === undefined || id === '';
}

/** Site-relative URL for a payload ref, or null when there is no page to open. */
export function refUrl(ref: Json): string | null {
  const build = REF_ROUTES[String(ref.type)];
  if (!build) return null;
  if (ref.type !== 'mpr' && isBlankId(ref.id)) return null;
  return build(ref);
}

function refText(ref: Json): string {
  if (ref.label) return String(ref.label);
  const typeLabel = REF_TYPE_LABELS[String(ref.type)] || String(ref.type || '');
  if (isBlankId(ref.id)) return typeLabel;
  if (READABLE_ID_TYPES.has(String(ref.type))) return String(ref.id);
  return `${typeLabel} #${String(ref.id)}`;
}

function Ref({ target: value }: { target: Json }) {
  const url = refUrl(value);
  const text = refText(value);
  return url ? (
    <AppLink to={url} className={classes.ref}>
      {text}
    </AppLink>
  ) : (
    <span className={classes.refPlain}>{text}</span>
  );
}

function Refs({ refs }: { refs: unknown }) {
  const list = arr(refs).filter((r): r is Json => Boolean(r) && typeof r === 'object');
  if (!list.length) return null;
  return (
    <span className={classes.refs}>
      {list.map((r, i) => (
        <Ref key={i} target={r} />
      ))}
    </span>
  );
}

function Chip({ color = 'grey', children }: { color?: ChipColor; children: ReactNode }) {
  return (
    <span className={classes.chip} data-color={color}>
      {children}
    </span>
  );
}

function StatChips({ stats }: { stats: Json }) {
  const chips: ReactNode[] = [];
  for (const [key, label, color, always] of STAT_META) {
    const value = statNumber(stats[key]);
    if (!always && value <= 0) continue;
    let text = `${numberFmt.format(value)} ${label}`;
    if (key === 'new_jobs_root') {
      const child = statNumber(stats.new_jobs_child);
      if (child > 0) text += ` (+${numberFmt.format(child)} alt)`;
    }
    chips.push(
      <span key={key} className={`${classes.chip} ${classes.dsStat}`} data-color={color} data-stat={key}>
        {text}
      </span>,
    );
  }
  return chips.length ? <div className={classes.dsStats}>{chips}</div> : null;
}

/** Long lists show the first `collapseAfter` rows and a "Tümünü göster (N)" toggle. */
function CollapsibleList({ items, collapseAfter }: { items: ReactNode[]; collapseAfter: number }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  if (!collapseAfter || items.length <= collapseAfter) return <ul className={classes.list}>{items}</ul>;
  return (
    <div>
      <ul className={classes.list}>{open ? items : items.slice(0, collapseAfter)}</ul>
      <button type="button" className={classes.moreBtn} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Daha az göster' : `Tümünü göster (${items.length})`}
      </button>
    </div>
  );
}

function validItems(items: unknown): Json[] {
  return arr(items).filter(
    (it): it is Json => Boolean(it) && typeof it === 'object' && Boolean((it as Json).text || arr((it as Json).refs).length),
  );
}

function Item({ item }: { item: Json }) {
  return (
    <li className={classes.item} data-kind={String(item.kind ?? '')}>
      <span className={classes.itemText}>{String(item.text ?? '')}</span>
      <Refs refs={item.refs} />
    </li>
  );
}

function SectionTitle({ icon, text, count }: { icon: string; text: string; count?: number }) {
  return (
    <div className={classes.sectionTitle}>
      <FaIcon icon={`fas ${icon}`} /> {text}
      {count ? <span className={classes.count}>{count}</span> : null}
    </div>
  );
}

function JobRow({ job, showKind }: { job: Json; showKind: boolean }) {
  return (
    <li className={classes.item}>
      <Ref target={{ type: 'job', id: job.job_no }} />{' '}
      {job.title ? <span className={classes.jobTitle}>{String(job.title)} </span> : null}
      {job.customer ? <span className={classes.dsMuted}>· {String(job.customer)} </span> : null}
      {showKind && job.kind && job.kind !== 'root' ? (
        <>
          <Chip>{JOB_KIND_LABELS[String(job.kind)] || String(job.kind)}</Chip>{' '}
          {job.parent_job_no ? <span className={classes.dsMuted}>← {String(job.parent_job_no)} </span> : null}
        </>
      ) : null}
      {job.offer_no ? (
        <>
          <span className={classes.dsMuted}>Teklif</span>
          <Ref target={{ type: 'offer', id: job.offer_no }} />
        </>
      ) : null}
    </li>
  );
}

function JobGroup({ label, icon, jobs, showKind = false }: { label: string; icon: string; jobs: unknown; showKind?: boolean }) {
  const rows = arr(jobs).filter((j): j is Json => Boolean(j) && typeof j === 'object' && Boolean((j as Json).job_no));
  if (!rows.length) return null;
  return (
    <div className={classes.subsection}>
      <div className={classes.subtitle}>
        <FaIcon icon={`fas ${icon}`} /> {label} <span className={classes.count}>{rows.length}</span>
      </div>
      <CollapsibleList
        collapseAfter={FULL_COLLAPSE_AFTER}
        items={rows.map((job, i) => <JobRow key={i} job={job} showKind={showKind} />)}
      />
    </div>
  );
}

function hasJobs(jobs: unknown): boolean {
  return arr(jobs).some((j) => Boolean(j) && typeof j === 'object' && Boolean((j as Json).job_no));
}

function Discussion({ topic }: { topic: Json }) {
  const title = String(topic.title || 'Başlıksız konu');
  const url = refUrl({ type: 'topic', id: topic.topic_id, job_no: topic.job_no });
  const typeLabel = TOPIC_TYPE_LABELS[String(topic.type)];
  const prio = PRIORITY_META[String(topic.priority)];
  const comments = statNumber(topic.comment_count);
  const outcome = OUTCOME_META[String(topic.outcome)];
  const chips: ReactNode[] = [];
  if (topic.is_new) chips.push(<Chip key="new" color="blue">Yeni</Chip>);
  if (typeLabel) chips.push(<Chip key="type" color="purple">{typeLabel}</Chip>);
  if (prio) chips.push(<Chip key="prio" color={prio.color}>{prio.label}</Chip>);
  if (comments > 0) chips.push(<Chip key="comments">{`${comments} yorum`}</Chip>);
  if (outcome?.label) chips.push(<Chip key="outcome" color={outcome.color}>{outcome.label}</Chip>);
  return (
    <li className={classes.item}>
      <div className={classes.topicHead}>
        {topic.job_no ? <Ref target={{ type: 'job', id: topic.job_no }} /> : null}
        {url ? (
          <AppLink to={url} className={classes.topicTitle}>
            {title}
          </AppLink>
        ) : (
          <span className={classes.topicTitle}>{title}</span>
        )}
        {chips.length ? <span className={classes.topicChips}>{chips}</span> : null}
      </div>
      {topic.gist ? <div className={classes.gist}>{String(topic.gist)}</div> : null}
    </li>
  );
}

function Area({ area: [key, label, icon], data, omittedLines }: { area: (typeof AREAS)[number]; data: Json; omittedLines: number }) {
  const lines = validItems(data.lines);
  const rawLines = arr(data.lines);
  const note = data.note ? String(data.note) : '';
  if (!note && rawLines.length === 0 && !omittedLines) return null;
  return (
    <section className={classes.section} data-area={key}>
      <SectionTitle icon={icon} text={label} count={rawLines.length} />
      {note ? <p className={classes.areaNote}>{note}</p> : null}
      <CollapsibleList collapseAfter={FULL_COLLAPSE_AFTER} items={lines.map((it, i) => <Item key={i} item={it} />)} />
      {omittedLines ? <div className={classes.omitted}>+{omittedLines} satır daha</div> : null}
    </section>
  );
}

/** A DailySummary detail laid out as legacy renderDailySummary(detail) did. */
export function DailySummaryBody({ summary }: { summary: Json }) {
  const payload = obj(summary.payload);
  const stats = payload.stats && typeof payload.stats === 'object' ? obj(payload.stats) : obj(summary.stats);
  const headline = String(payload.headline || summary.headline || '');
  const omitted = obj(payload.omitted);
  const omittedLines = obj(omitted.lines);
  const areas = obj(payload.areas);
  const omittedTopics = statNumber(omitted.topics);

  const highlights = validItems(payload.highlights);
  const jobOrders = obj(payload.job_orders);
  const showJobs = hasJobs(jobOrders.new) || hasJobs(jobOrders.completed) || hasJobs(jobOrders.started);
  const discussions = arr(payload.discussions).filter((t): t is Json => Boolean(t) && typeof t === 'object');
  const areaSections = AREAS.map((area) => (
    <Area key={area[0]} area={area} data={obj(areas[area[0]])} omittedLines={statNumber(omittedLines[area[0]])} />
  ));
  const anyArea = AREAS.some(([key]) => {
    const a = obj(areas[key]);
    return Boolean(a.note) || arr(a.lines).length > 0 || statNumber(omittedLines[key]) > 0;
  });

  if (!headline && !highlights.length && !showJobs && !discussions.length && !omittedTopics && !anyArea) {
    // `empty` days and payload-less rows: zero chips would only add noise.
    return (
      <div className={classes.ds}>
        <div className={classes.dsMuted}>Bu dönemde kayda değer bir hareket yok.</div>
      </div>
    );
  }

  return (
    <div className={classes.ds}>
      {headline ? <p className={classes.dsHeadline}>{headline}</p> : null}
      <StatChips stats={stats} />
      {highlights.length ? (
        <section className={`${classes.section} ${classes.highlights}`}>
          <SectionTitle icon="fa-star" text="Öne çıkanlar" />
          <ul className={classes.list}>
            {highlights.map((it, i) => (
              <Item key={i} item={it} />
            ))}
          </ul>
        </section>
      ) : null}
      {showJobs ? (
        <section className={classes.section}>
          <SectionTitle icon="fa-briefcase" text="İş Emirleri" />
          <JobGroup label="Yeni açılan" icon="fa-plus" jobs={jobOrders.new} showKind />
          <JobGroup label="Tamamlanan" icon="fa-check" jobs={jobOrders.completed} />
          <JobGroup label="Başlayan" icon="fa-play" jobs={jobOrders.started} />
        </section>
      ) : null}
      {discussions.length || omittedTopics ? (
        <section className={classes.section}>
          <SectionTitle icon="fa-comments" text="Tartışmalar" count={discussions.length} />
          <CollapsibleList
            collapseAfter={FULL_COLLAPSE_AFTER}
            items={discussions.map((topic, i) => <Discussion key={i} topic={topic} />)}
          />
          {omittedTopics ? <div className={classes.omitted}>+{omittedTopics} konu daha (özet dışında)</div> : null}
        </section>
      ) : null}
      {areaSections}
    </div>
  );
}
