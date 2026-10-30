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
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Font Awesome classes ("fas fa-users") or a bare legacy name ("users"). */
  icon?: string;
  /** Key figures shown large on the band (replaces stat cards on list pages). */
  stats?: PageFigure[];
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
export function PageHeader({ title, subtitle, icon, stats, actions, backTo, backLabel = 'Geri Dön' }: PageHeaderProps) {
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
            {stats?.length ? (
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
