import { Skeleton } from '@mantine/core';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import type { ReactNode } from 'react';
import { AppLink } from '@/shell/AppLink';
import { FaIcon, PendingValue, type StatusFamily } from '@/ui';
import css from './AreaLane.module.css';

// One İmalat area as a full-width lane: its pages on the left, three live
// figures in the middle, the few records that matter on the right.

export interface LaneLink {
  label: string;
  link: string;
}

export interface LaneFigure {
  id: string;
  label: ReactNode;
  /** Formatted value, '-' on error, undefined while loading. */
  value: ReactNode | undefined;
  /** A line under the label, e.g. the tonnage behind a count. */
  hint?: ReactNode;
  link?: string;
  /** Red when it counts something late or stopped. */
  alert?: boolean;
}

export interface LaneRow {
  key: string | number;
  link?: string;
  /** Mono, on the left: a machine, a job number. */
  lead?: ReactNode;
  main: ReactNode;
  sub?: ReactNode;
  /** Right-aligned: a duration, a pill, a weight. */
  end?: ReactNode;
}

export interface LaneList {
  title: ReactNode;
  /** Where "Tümü" goes. */
  more?: string;
  rows: LaneRow[] | undefined;
  isError?: boolean;
  /** Shown when there are no rows. */
  empty: ReactNode;
  /** A muted last line, e.g. "+3 ekip / taşeron". */
  footnote?: ReactNode;
}

/** Visible when the user can open at least one of the area's pages. */
export function visibleLinks(links: LaneLink[]) {
  return links.filter((item) => hasRouteAccess(item.link));
}

function Figure({ figure }: { figure: LaneFigure }) {
  const body = (
    <>
      <b className={css.figureValue} data-alert={figure.alert || undefined}>
        {figure.value ?? <PendingValue />}
      </b>
      <span className={css.figureLabel}>{figure.label}</span>
      {figure.hint ? <span className={css.figureHint}>{figure.hint}</span> : null}
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

function Rows({ list }: { list: LaneList }) {
  if (list.isError) return <p className={css.note}>Yüklenemedi.</p>;
  if (!list.rows) {
    return (
      <div className={css.note}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={14} my={8} />
        ))}
      </div>
    );
  }
  if (list.rows.length === 0) return <p className={css.note}>{list.empty}</p>;
  return (
    <ul className={css.rows}>
      {list.rows.map((row) => {
        const content = (
          <>
            {row.lead !== undefined ? <span className={css.rowLead}>{row.lead}</span> : null}
            <span className={css.rowMain}>
              <span className={css.rowTitle}>{row.main}</span>
              {row.sub ? <span className={css.rowSub}>{row.sub}</span> : null}
            </span>
            {row.end !== undefined ? <span className={css.rowEnd}>{row.end}</span> : null}
          </>
        );
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
      {list.footnote ? <li className={css.footnote}>{list.footnote}</li> : null}
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
  return (
    <section className={css.lane} aria-label={title}>
      <div className={css.head}>
        <h2 className={css.title}>
          <span className={css.tile} data-family={family} aria-hidden>
            <FaIcon icon={icon} />
          </span>
          {titleLink ? <AppLink to={titleLink}>{title}</AppLink> : title}
        </h2>
        <nav className={css.links} aria-label={`${title} sayfaları`}>
          {links.map((item) => (
            <AppLink key={item.link} to={item.link}>
              {item.label}
            </AppLink>
          ))}
        </nav>
      </div>
      <div className={css.figures} data-count={figures.length}>
        {figures.map((figure) => (
          <Figure key={figure.id} figure={figure} />
        ))}
      </div>
      {list ? (
        <div className={css.list}>
          <div className={css.listHead}>
            <span>{list.title}</span>
            {list.more ? (
              <AppLink to={list.more} className={css.more}>
                Tümü <FaIcon icon="fas fa-arrow-right" />
              </AppLink>
            ) : null}
          </div>
          <Rows list={list} />
        </div>
      ) : null}
    </section>
  );
}

/** The lanes, one under the other, rising into the band like any first block. */
export function AreaLanes({ children }: { children: ReactNode }) {
  return <div className={css.lanes}>{children}</div>;
}
