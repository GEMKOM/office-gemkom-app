// Small building blocks the dashboard renderers share (render/util.js, rag.js).
import { Fragment, type ReactNode } from 'react';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, StatusBadge, type StatusFamily } from '@/ui';
import {
  pf,
  ragText,
  ragWord,
  SLOW_TEXT,
  trendArrow,
  trendTone,
  type SlowBlockState,
} from './model';
import classes from './dashboard.module.css';

type Part = ReactNode | null | undefined | false;

function present(part: Part): boolean {
  return part !== null && part !== undefined && part !== false && part !== '';
}

/** Parts joined with ' · ', empty ones dropped (legacy dots()). */
export function Dots({ parts }: { parts: Part[] }) {
  const kept = parts.filter(present);
  return (
    <>
      {kept.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? ' · ' : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}

export function hasParts(parts: Part[]): boolean {
  return parts.some(present);
}

/** A number in a state colour, set bold so it does not rely on colour alone. */
export function Tone({
  tone,
  children,
}: {
  tone: 'red' | 'orange' | 'green' | null | undefined;
  children: ReactNode;
}) {
  if (!tone) return <span>{children}</span>;
  return (
    <span className={classes.tone} data-tone={tone}>
      {children}
    </span>
  );
}

export function Chip({
  color,
  children,
  title,
}: {
  color: StatusFamily;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={classes.chip} data-family={color} title={title}>
      {children}
    </span>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className={classes.muted}>{children}</span>;
}

/** The server's RAG word as a pill with the Turkish verdict. */
export function RagBadge({ word, text, title }: { word: unknown; text?: string; title?: string }) {
  const w = ragWord(word);
  return (
    <span title={title}>
      <StatusBadge color={w}>{text ?? ragText(w)}</StatusBadge>
    </span>
  );
}

export function HiddenMoneyBadge() {
  return (
    <span title="Tutarlar için maliyet görüntüleme yetkisi gerekir">
      <StatusBadge color="grey">€ gizli</StatusBadge>
    </span>
  );
}

/**
 * '↑ 12%' / '↓ 8%' / '→'. The arrow carries the direction; green or red says
 * whether that is good (goodWhen), grey when flat or the baseline is too small.
 */
export function TrendBadge({
  cur,
  prev,
  goodWhen = 'up',
  minPrev = 0,
  title,
}: {
  cur: unknown;
  prev: unknown;
  goodWhen?: 'up' | 'down';
  minPrev?: number;
  title?: string;
}) {
  const tone = trendTone(cur, prev, { goodWhen, minPrev });
  if (!tone) return null;
  const family = tone === 'good' ? 'green' : tone === 'bad' ? 'red' : 'grey';
  const word = tone === 'good' ? 'iyi yönde' : tone === 'bad' ? 'kötü yönde' : 'değişim yok';
  return (
    <span
      className={classes.trend}
      data-family={family}
      title={title}
      aria-label={`${trendArrow(cur, prev)} (${word})`}
    >
      {trendArrow(cur, prev)}
    </span>
  );
}

export function JobLink({ jobNo, text }: { jobNo: string | null | undefined; text?: string }) {
  if (!jobNo) return <>—</>;
  return (
    <AppLink
      to={`/projects/project-tracking?job_no=${encodeURIComponent(jobNo)}`}
      className={classes.jobLink}
    >
      <code>{text || jobNo}</code>
    </AppLink>
  );
}

export function SlowText({
  label,
  state,
}: {
  label?: string;
  state: Exclude<SlowBlockState, 'ready'>;
}) {
  return (
    <span className={state === 'pending' ? classes.pending : classes.muted} data-slow-state={state}>
      {label ? `${label} ` : ''}
      {SLOW_TEXT[state]}
    </span>
  );
}

// ------------------------------------------------------------------ drawer pieces

export type KvRow = [string, ReactNode] | null | false;

/** Label / value rows; rows with an empty value are dropped. */
export function Kv({ rows }: { rows: KvRow[] }) {
  const kept = rows.filter((r): r is [string, ReactNode] => !!r && present(r[1]));
  if (!kept.length) return null;
  return (
    <dl className={classes.kv}>
      {kept.map(([k, v]) => (
        <Fragment key={k}>
          <dt className={classes.kvK}>{k}</dt>
          <dd className={classes.kvV} style={{ margin: 0 }}>
            {v}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function DrawerSection({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={classes.drawerSection}>
      <h3 className={classes.drawerH}>
        {title}
        {extra ? <span className={classes.stamp}>{extra}</span> : null}
      </h3>
      {children}
    </section>
  );
}

export interface Column<T> {
  label: string;
  num?: boolean;
  cell: (row: T) => ReactNode;
}

export function SimpleTable<T>({
  columns,
  rows,
  empty = 'Kayıt yok',
}: {
  columns: Column<T>[];
  rows: T[] | null | undefined;
  empty?: string;
}) {
  if (!Array.isArray(rows) || rows.length === 0)
    return <div className={classes.empty}>{empty}</div>;
  return (
    <div className={classes.scroll}>
      <table className={classes.dtable}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label} data-num={c.num || undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.label} data-num={c.num || undefined}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SlowNote({ state }: { state: Exclude<SlowBlockState, 'ready'> }) {
  return (
    <div className={classes.empty} data-slow-state={state}>
      {SLOW_TEXT[state]}
    </div>
  );
}

export function DrillLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <AppLink to={to} className={classes.drill}>
      <FaIcon icon="fas fa-arrow-up-right-from-square" />
      {children}
    </AppLink>
  );
}

/** '' for a null value: used to drop kv rows whose number is missing. */
export function has(v: unknown): boolean {
  return pf(v) !== null;
}
