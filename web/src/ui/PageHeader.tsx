import { NAVIGATION_STRUCTURE } from '@legacy/navigationStructure.js';
import { Fragment, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { AppLink } from '@/shell/AppLink';
import { findTrail } from '@/shell/navModel';
import { FaIcon } from './FaIcon';
import classes from './ui.module.css';

export interface PageFigure {
  id?: string;
  label: ReactNode;
  value: ReactNode;
  /** Font Awesome classes; shown on a tile (figureStyle 'tiles'). */
  icon?: string;
  /** Makes the tile a link to the list behind the figure (figureStyle 'tiles'). */
  link?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Font Awesome classes ("fas fa-users") or a bare legacy name ("users"). */
  icon?: string;
  /** Key figures shown large on the band (replaces stat cards on list pages). */
  stats?: PageFigure[];
  /**
   * 'plain' (default): numbers set straight on the band, as on list pages.
   * 'tiles': each figure in a translucent tile with its icon, a link when it
   * has one; hub pages use these.
   */
  figureStyle?: 'plain' | 'tiles';
  /**
   * Buttons on the right. A filled button turns white on the band and a
   * default one becomes a ghost, e.g. <Button leftSection={...}>Yeni Müşteri</Button>.
   */
  actions?: ReactNode;
  /** Shows a back arrow linking here (legacy backUrl). */
  backTo?: string;
  backLabel?: string;
}

// The whole menu tree, not the access-filtered one: the user is already on
// this page, and the trail only names where it sits.
function Breadcrumbs() {
  const { pathname } = useLocation();
  const trail = useMemo(() => findTrail(NAVIGATION_STRUCTURE, pathname), [pathname]);
  return (
    <nav className={classes.crumbs} aria-label="Konum">
      {trail.map((step, index) => (
        <Fragment key={step.path}>
          {index > 0 ? <span className={classes.crumbSep}>/</span> : null}
          {index < trail.length - 1 ? <AppLink to={step.path}>{step.label}</AppLink> : <span>{step.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

/**
 * Opens every page: the red band with the breadcrumb, title, key figures and
 * actions. The next block on the page rises into the band. Replaces
 * components/header/header.js.
 */
function FigureTiles({ figures }: { figures: PageFigure[] }) {
  return (
    <ul className={classes.figureTiles}>
      {figures.map((figure, index) => {
        const content = (
          <>
            {figure.icon ? (
              <span className={classes.figureTileIcon} aria-hidden>
                <FaIcon icon={figure.icon} />
              </span>
            ) : null}
            <span className={classes.figureValue}>{figure.value}</span>
            <span className={classes.figureLabel}>{figure.label}</span>
          </>
        );
        return (
          <li key={figure.id ?? index} id={figure.id}>
            {figure.link ? (
              <AppLink to={figure.link} className={classes.figureTile}>
                {content}
              </AppLink>
            ) : (
              <div className={classes.figureTile}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PageHeader({
  title,
  subtitle,
  icon,
  stats,
  figureStyle = 'plain',
  actions,
  backTo,
  backLabel = 'Geri Dön',
}: PageHeaderProps) {
  return (
    <header className={classes.band}>
      <Breadcrumbs />
      <div className={classes.bandRow}>
        <div style={{ minWidth: 0 }}>
          <div className={classes.bandTitleRow}>
            {backTo ? (
              <AppLink to={backTo} className={classes.bandBack} aria-label={backLabel} title={backLabel}>
                <FaIcon icon="fas fa-arrow-left" />
              </AppLink>
            ) : null}
            <h1 className={classes.bandTitle}>
              {icon ? <FaIcon icon={icon} style={{ fontSize: 22, opacity: 0.85, marginRight: 12 }} /> : null}
              {title}
            </h1>
          </div>
          {subtitle ? <p className={classes.bandSubtitle}>{subtitle}</p> : null}
        </div>
        {stats?.length || actions ? (
          <div className={classes.bandSide}>
            {stats?.length && figureStyle === 'tiles' ? (
              <FigureTiles figures={stats} />
            ) : stats?.length ? (
              <dl className={classes.figures}>
                {stats.map((figure, index) => (
                  <div key={figure.id ?? index} id={figure.id} className={classes.figure}>
                    <dt className={classes.figureLabel}>{figure.label}</dt>
                    <dd className={classes.figureValue}>{figure.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {actions ? <div className={classes.bandActions}>{actions}</div> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
