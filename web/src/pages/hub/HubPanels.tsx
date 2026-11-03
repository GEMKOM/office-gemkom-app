import { Skeleton } from '@mantine/core';
import { Children, isValidElement, type ReactNode } from 'react';
import { formatNumber } from '@/lib/format';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, Panel, PendingValue, StatusBadge, type StatusFamily } from '@/ui';
import css from './HubPanels.module.css';

// The panels under a hub's cards, generalised from the sales hub: a list of
// records, the things waiting on the user, and a breakdown by stage.

/** What a panel needs from a query: its rows (or count) and how it went. */
export interface HubQuery<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  refetch?: () => unknown;
}

/**
 * Main panels left and a narrower column right; one column on small screens.
 * Each child sits in a cell of its own, so panels side by side are not
 * siblings and keep no stacking margin.
 */
export function HubPanels({ children }: { children: ReactNode }) {
  return (
    <div className={css.panels}>
      {Children.toArray(children).map((child, index) => (
        <div key={isValidElement(child) && child.key !== null ? child.key : index} className={css.cell}>
          {child}
        </div>
      ))}
    </div>
  );
}

/** The "Tümü →" link in a panel header. */
export function MoreLink({ to, children = 'Tümü' }: { to: string; children?: ReactNode }) {
  return (
    <AppLink to={to} className={css.more}>
      {children} <FaIcon icon="fas fa-arrow-right" />
    </AppLink>
  );
}

function LoadError({ what, retry }: { what: string; retry?: () => unknown }) {
  return (
    <p className={css.note}>
      {what} yüklenemedi.{' '}
      {retry ? (
        <button type="button" className={css.retry} onClick={() => void retry()}>
          Yeniden Dene
        </button>
      ) : null}
    </p>
  );
}

// ---- RecordsPanel -----------------------------------------------------------

export interface HubRecord {
  key: string | number;
  /** The page that opens the record (or its filtered list). */
  link?: string;
  /** A number or code, set in mono on the left. */
  code?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: { label: ReactNode; color: StatusFamily };
  /** Right-aligned, muted: a date or an amount. */
  meta?: ReactNode;
  /** Marks a row that needs attention (overdue, stopped): its meta turns red. */
  alert?: boolean;
}

export interface RecordsPanelProps {
  title: ReactNode;
  icon: string;
  /** Where "Tümü" goes; no link without it. */
  more?: string;
  query: HubQuery<HubRecord[]>;
  /** "Talepler" → "Talepler yüklenemedi." */
  noun: string;
  /** Shown when there is nothing to list. */
  empty: ReactNode;
  /** Placeholder rows while loading. */
  rows?: number;
}

/** A short list of records, each row a link: recent requests, overdue tasks. */
export function RecordsPanel({ title, icon, more, query, noun, empty, rows = 5 }: RecordsPanelProps) {
  const records = query.data ?? [];
  let body;
  if (query.isPending) {
    body = (
      <div className={css.note}>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} height={18} my={10} />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = <LoadError what={noun} retry={query.refetch} />;
  } else if (records.length === 0) {
    body = <p className={css.note}>{empty}</p>;
  } else {
    body = (
      <ul className={css.records}>
        {records.map((record) => {
          const content = (
            <>
              {record.code !== undefined ? <span className={css.recordCode}>{record.code}</span> : null}
              <span className={css.recordMain}>
                <span className={css.recordTitle}>{record.title}</span>
                {record.subtitle ? <span className={css.recordSub}>{record.subtitle}</span> : null}
              </span>
              {record.status ? (
                <span className={css.recordStatus}>
                  <StatusBadge color={record.status.color}>{record.status.label}</StatusBadge>
                </span>
              ) : null}
              {record.meta !== undefined ? (
                <span className={css.recordMeta} data-alert={record.alert || undefined}>
                  {record.meta}
                </span>
              ) : null}
            </>
          );
          return (
            <li key={record.key}>
              {record.link ? (
                <AppLink to={record.link} className={css.record}>
                  {content}
                </AppLink>
              ) : (
                <div className={css.record}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <Panel title={title} icon={icon} actions={more ? <MoreLink to={more} /> : undefined} padded={false}>
      {body}
    </Panel>
  );
}

// ---- AttentionPanel ---------------------------------------------------------

export interface AttentionItem {
  id: string;
  label: ReactNode;
  /** A line under the label, e.g. who it is waiting on. */
  hint?: ReactNode;
  icon: string;
  /** The colour when something is waiting; a zero row goes grey. */
  color: StatusFamily;
  link: string;
  count: Pick<HubQuery<number>, 'data' | 'isError'>;
}

/**
 * The things waiting on the user, each with its count and a link to the list
 * that holds them. Rows with nothing waiting stay, greyed, so the panel does
 * not jump about as counts arrive.
 */
export function AttentionPanel({
  title = 'Sizi Bekleyenler',
  icon = 'fas fa-bell',
  items,
}: {
  title?: ReactNode;
  icon?: string;
  items: AttentionItem[];
}) {
  if (items.length === 0) return null;
  const settled = items.every((item) => item.count.data !== undefined || item.count.isError);
  const clear = settled && items.every((item) => !item.count.data);
  return (
    <Panel
      title={title}
      icon={icon}
      padded={false}
      footer={
        clear ? (
          <span className={css.clear}>
            <FaIcon icon="fas fa-circle-check" /> Bekleyen bir iş yok
          </span>
        ) : undefined
      }
    >
      <ul className={css.attention}>
        {items.map((item) => {
          const { data, isError } = item.count;
          const waiting = Boolean(data);
          return (
            <li key={item.id}>
              <AppLink
                to={item.link}
                className={css.attentionRow}
                data-family={waiting ? item.color : 'grey'}
                data-idle={!waiting || undefined}
              >
                <span className={css.attentionIcon} aria-hidden>
                  <FaIcon icon={item.icon} />
                </span>
                <span className={css.attentionText}>
                  <span className={css.attentionLabel}>{item.label}</span>
                  {item.hint ? <span className={css.attentionHint}>{item.hint}</span> : null}
                </span>
                <b className={css.attentionCount}>
                  {isError ? '-' : data === undefined ? <PendingValue /> : formatNumber(data)}
                </b>
                <FaIcon icon="fas fa-chevron-right" className={css.attentionChevron} />
              </AppLink>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// ---- BreakdownPanel ---------------------------------------------------------

export interface BreakdownRow {
  key: string;
  label: ReactNode;
  color: StatusFamily;
  /** Undefined while loading. */
  count: number | undefined;
  /** The list filtered to this row. */
  link?: string;
}

/** Counts by stage as bars against their total, like the sales Teklif Hattı. */
export function BreakdownPanel({
  title,
  icon,
  rows,
  footer,
  failed = false,
  more,
}: {
  title: ReactNode;
  icon: string;
  rows: BreakdownRow[];
  footer?: ReactNode;
  /** A request behind the rows failed: say so instead of drawing empty bars. */
  failed?: boolean;
  more?: string;
}) {
  const total = rows.reduce((sum, row) => sum + (row.count ?? 0), 0);
  return (
    <Panel title={title} icon={icon} footer={footer} actions={more ? <MoreLink to={more} /> : undefined}>
      {failed ? (
        <p className={css.inlineNote}>Sayılar yüklenemedi.</p>
      ) : (
        <ul className={css.stages}>
          {rows.map((row) => {
            const head = (
              <>
                <span>{row.label}</span>
                <b>{row.count === undefined ? <PendingValue /> : formatNumber(row.count)}</b>
              </>
            );
            return (
              <li key={row.key}>
                {row.link ? (
                  <AppLink to={row.link} className={css.stageRow} data-link>
                    {head}
                  </AppLink>
                ) : (
                  <div className={css.stageRow}>{head}</div>
                )}
                <div className={css.bar} data-family={row.color}>
                  <span style={{ width: total ? `${((row.count ?? 0) / total) * 100}%` : 0 }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** "Toplam" style footer line for a panel: a label and a figure. */
export function PanelTotal({ label, value }: { label: ReactNode; value: number | string | undefined }) {
  return (
    <>
      <span>{label}</span>
      <b className={css.totalValue}>
        {value === undefined ? <PendingValue /> : typeof value === 'number' ? formatNumber(value) : value}
      </b>
    </>
  );
}
