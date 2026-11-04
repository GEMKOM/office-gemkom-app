import { Skeleton } from '@mantine/core';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import type { CSSProperties, ReactNode } from 'react';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, PendingValue, type StatusFamily } from '@/ui';
import css from './AreaLane.module.css';

// One İmalat area as a full-width lane: its pages on the left, its live
// figures in the middle, the few records that matter on the right as a small
// table. Every lane uses the same three columns and the same row height, so
// columns and row lines line up down the page.

export interface LaneLink {
  label: string;
  link: string;
}

export interface LaneFigure {
  id: string;
  label: ReactNode;
  /** Formatted value, '-' on error, undefined while loading. */
  value: ReactNode | undefined;
  /** Next to the label, e.g. the tonnage behind a count. */
  hint?: ReactNode;
  link?: string;
  /** Red when it counts something late or stopped. */
  alert?: boolean;
}

export interface LaneRow {
  key: string | number;
  link?: string;
  /** Mono, the first column: a machine, a job number. */
  lead?: ReactNode;
  main: ReactNode;
  /** Muted, after the main text. */
  sub?: ReactNode;
  /** One per column after the main one. */
  cells?: ReactNode[];
}

export interface LaneColumn {
  label: ReactNode;
  /** A grid track; default minmax(0, 1fr). */
  width?: string;
  /** Numbers and durations sit on the right. */
  align?: 'end';
}

export interface LaneList {
  /** Names the table for screen readers. */
  title: string;
  /** The table's columns, in row order: the lead (when rows have one), the main text, then the cells. */
  columns: LaneColumn[];
  /** Where the footer link goes. */
  more?: string;
  /** The footer link's text; default "Tümü". */
  moreLabel?: ReactNode;
  rows: LaneRow[] | undefined;
  isError?: boolean;
  /** Shown when there are no rows. */
  empty: ReactNode;
  /** A muted note in the footer, e.g. "+3 ekip / taşeron daha". */
  footnote?: ReactNode;
}

/** Visible when the user can open at least one of the area's pages. */
export function visibleLinks(links: LaneLink[]) {
  return links.filter((item) => hasRouteAccess(item.link));
}

/** A late or stopped value inside a row. */
export function LaneAlert({ children }: { children: ReactNode }) {
  return <span className={css.alert}>{children}</span>;
}

function Figure({ figure }: { figure: LaneFigure }) {
  const body = (
    <>
      <span className={css.figureLabel}>
        {figure.label}
        {figure.hint ? <span className={css.figureHint}>{figure.hint}</span> : null}
      </span>
      <b className={css.figureValue} data-alert={figure.alert || undefined}>
        {figure.value ?? <PendingValue />}
      </b>
    </>
  );
  return figure.link ? (
    <AppLink to={figure.link} className={css.figure} data-link>
      {body}
    </AppLink>
  ) : (
    <div className={css.figure}>{body}</div>
  );
}

function Cell({ column, children }: { column: LaneColumn | undefined; children: ReactNode }) {
  return (
    <span className={css.cell} data-align={column?.align}>
      {children}
    </span>
  );
}

function ColumnTitles({ list }: { list: LaneList }) {
  return (
    <>
      {list.columns.map((column, i) => (
        <Cell key={i} column={column}>
          {column.label}
        </Cell>
      ))}
    </>
  );
}

function Rows({ list }: { list: LaneList }) {
  if (list.isError) return <p className={css.note}>Yüklenemedi.</p>;
  if (!list.rows) {
    return (
      <div aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className={css.note}>
            <Skeleton height={12} />
          </div>
        ))}
      </div>
    );
  }
  if (list.rows.length === 0) return <p className={css.note}>{list.empty}</p>;
  return (
    <ul className={css.rows} aria-label={list.title}>
      {list.rows.map((row) => {
        const parts = [
          ...(row.lead !== undefined ? [<span className={css.rowLead}>{row.lead}</span>] : []),
          <span className={css.rowMain}>
            <span className={css.rowTitle}>{row.main}</span>
            {row.sub ? <span className={css.rowSub}>{row.sub}</span> : null}
          </span>,
          ...(row.cells ?? []),
        ];
        const content = parts.map((part, i) => (
          <Cell key={i} column={list.columns[i]}>
            {part}
          </Cell>
        ));
        return (
          <li key={row.key}>
            {row.link ? (
              <AppLink to={row.link} className={css.row}>
                {content}
              </AppLink>
            ) : (
              <div className={css.row}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface AreaLaneProps {
  title: string;
  icon: string;
  family: StatusFamily;
  /** The area's hub; the title links there. */
  hub?: string;
  /** Already filtered with visibleLinks; the lane is not drawn without any. */
  links: LaneLink[];
  figures: LaneFigure[];
  list?: LaneList;
}

export function AreaLane({ title, icon, family, hub, links, figures, list }: AreaLaneProps) {
  if (links.length === 0) return null;
  const titleLink = hub && hasRouteAccess(hub) ? hub : undefined;
  const tracks = list?.columns.map((column) => column.width ?? 'minmax(0, 1fr)').join(' ');
  return (
    <section
      className={css.lane}
      aria-label={title}
      style={tracks ? ({ '--lane-columns': tracks } as CSSProperties) : undefined}
    >
      <h2 className={css.title}>
        <span className={css.tile} data-family={family} aria-hidden>
          <FaIcon icon={icon} />
        </span>
        {titleLink ? <AppLink to={titleLink}>{title}</AppLink> : title}
      </h2>
      <div className={css.statusHead}>{figures.length > 0 ? 'Durum' : null}</div>
      <div className={css.listHead}>{list ? <ColumnTitles list={list} /> : null}</div>
      <nav className={css.links} aria-label={`${title} sayfaları`}>
        <ul>
          {links.map((item) => (
            <li key={item.link}>
              <AppLink to={item.link}>
                {item.label}
                <FaIcon icon="fas fa-chevron-right" />
              </AppLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className={css.figures}>
        {figures.map((figure) => (
          <Figure key={figure.id} figure={figure} />
        ))}
      </div>
      <div className={css.list}>
        {list ? (
          <>
            {/* On phones the table scrolls sideways under its own column titles. */}
            <div className={css.scroll}>
              <div className={css.scrollHead}>
                <ColumnTitles list={list} />
              </div>
              <Rows list={list} />
            </div>
            {list.footnote || list.more ? (
              <div className={css.footer}>
                <span>{list.footnote}</span>
                {list.more ? (
                  <AppLink to={list.more} className={css.more}>
                    {list.moreLabel ?? 'Tümü'} <FaIcon icon="fas fa-arrow-right" />
                  </AppLink>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

/** The lanes, one under the other, rising into the band like any first block. */
export function AreaLanes({ children }: { children: ReactNode }) {
  return <div className={css.lanes}>{children}</div>;
}
