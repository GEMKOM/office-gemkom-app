import { Fragment, type ReactNode } from 'react';
import { FaIcon } from '@/ui';
import { formatNumber } from '@/lib/format';
import { trendDir } from './overviewData';
import classes from './overview.module.css';

export interface StatItem {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
}

/** The legacy ov-stat grid: label, big number, small note. */
export function StatGrid({ items }: { items: StatItem[] }) {
  return (
    <div className={classes.stats}>
      {items.map((item, index) => (
        <div key={index} className={classes.stat}>
          <div className={classes.statLabel}>{item.label}</div>
          <div className={classes.statValue}>{item.value}</div>
          {item.sub ? <div className={classes.statSub}>{item.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

export interface KeyValue {
  label: ReactNode;
  value: ReactNode;
  tone?: 'good' | 'bad';
}

export function KeyValues({ rows }: { rows: KeyValue[] }) {
  return (
    <dl className={classes.kv}>
      {rows.map((row, index) => (
        <Fragment key={index}>
          <dt>{row.label}</dt>
          <dd className={row.tone ? classes[row.tone] : undefined}>{row.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/**
 * Legacy trendArrow: ↑ / ↓ with the whole-percent change, → when flat, just
 * the arrow when the previous period was 0. Direction only; whether it is
 * good news depends on the metric, so the pill stays neutral.
 */
export function TrendMark({ current, previous }: { current: unknown; previous: unknown }) {
  const t = trendDir(current, previous);
  const word = t.dir === 'up' ? 'artış' : t.dir === 'down' ? 'azalış' : 'değişim yok';
  const icon =
    t.dir === 'up'
      ? 'fas fa-arrow-up'
      : t.dir === 'down'
        ? 'fas fa-arrow-down'
        : 'fas fa-arrow-right';
  const pct = t.dir !== 'flat' && t.pct !== null ? `${formatNumber(Math.abs(t.pct), 0)}%` : null;
  return (
    <span
      className={classes.trend}
      data-family={t.dir === 'flat' ? 'grey' : 'blue'}
      title={`Önceki döneme göre ${word}`}
    >
      <FaIcon icon={icon} />
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        {word}
      </span>
      {pct}
    </span>
  );
}

export interface CompareMetric {
  title: string;
  current: ReactNode;
  previous: ReactNode;
  trendCurrent: unknown;
  trendPrevious: unknown;
  tone?: 'bad';
}

/**
 * The legacy "hakediş" metric blocks as a table: one row per metric, this
 * period with its trend beside the previous one. Without comparison, one
 * value column.
 */
export function CompareMetrics({
  metrics,
  compare,
}: {
  metrics: CompareMetric[];
  compare: boolean;
}) {
  return (
    <div className={classes.scroll}>
      <table className={classes.table}>
        <thead>
          <tr>
            <th scope="col">Metrik</th>
            <th scope="col" className={classes.num}>
              {compare ? 'Seçilen dönem' : 'Değer'}
            </th>
            {compare ? (
              <th scope="col" className={classes.num}>
                Önceki dönem
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.title}>
              <th scope="row" style={{ fontWeight: 400 }}>
                {m.title}
              </th>
              <td className={classes.num}>
                <strong className={m.tone ? classes[m.tone] : undefined}>{m.current}</strong>
                {compare ? <TrendMark current={m.trendCurrent} previous={m.trendPrevious} /> : null}
              </td>
              {compare ? (
                <td className={`${classes.num} ${classes.muted}`}>
                  <span className={m.tone ? classes[m.tone] : undefined}>{m.previous}</span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface RankColumn {
  label: string;
  numeric?: boolean;
}

/** A numbered top list; "Kayıt yok" when empty. */
export function RankTable({ columns, rows }: { columns: RankColumn[]; rows: ReactNode[][] }) {
  return (
    <div className={classes.scroll}>
      <table className={classes.table}>
        <thead>
          <tr>
            <th scope="col" className={classes.rank}>
              #
            </th>
            {columns.map((c) => (
              <th key={c.label} scope="col" className={c.numeric ? classes.num : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + 1}
                className={classes.muted}
                style={{ textAlign: 'center', padding: 12 }}
              >
                Kayıt yok
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                <td className={classes.rank}>{i + 1}</td>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={columns[j]?.numeric ? classes.num : undefined}
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Height for a horizontal bar chart with n rows. */
export function barsHeight(rows: number, min = 180): number {
  return Math.max(min, rows * 36 + 48);
}
