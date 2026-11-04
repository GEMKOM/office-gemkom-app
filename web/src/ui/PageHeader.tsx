import { NAVIGATION_STRUCTURE } from '@/shell/navigationStructure';
import { Fragment, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { hasHubAccess } from '@/auth/RequireRoute';
import { isMigratedRoute, normalizeRoute } from '@/routes/migrated';
import { AppLink } from '@/shell/AppLink';
import { findParent, findTrail } from '@/shell/navModel';
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
  /**
   * Where the back arrow leads when the menu does not decide it. The arrow
   * normally goes one level up in the menu (useBackLink); this is for pages
   * the menu does not place, and for a view inside the page itself (a payment
   * list's detail back to the lists), which it always wins for.
   */
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

// A parent the user can open: a React page their grants reach. Hubs open
// for anyone with a page under them, so this is the hub rule (RequireRoute).
// Access that cannot be read counts as closed; the page's backTo stands in.
function canOpenParent(path: string): boolean {
  if (!isMigratedRoute(path)) return false;
  try {
    return hasHubAccess(path);
  } catch {
    return false;
  }
}

/**
 * The band's back arrow: one level up in the menu hierarchy (never the
 * browser history), so every page below a hub has a way up.
 */
function useBackLink(backTo: string | undefined, backLabel: string) {
  const { pathname } = useLocation();
  return useMemo(() => {
    const current = normalizeRoute(pathname);
    if (backTo && normalizeRoute(backTo) === current) return { to: backTo, label: backLabel };
    const parent = findParent(NAVIGATION_STRUCTURE, current, canOpenParent);
    if (parent) return { to: parent.path, label: `${parent.label} sayfasına dön` };
    return backTo ? { to: backTo, label: backLabel } : null;
  }, [pathname, backTo, backLabel]);
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
  const back = useBackLink(backTo, backLabel);
  return (
    <header className={classes.band}>
      <Breadcrumbs />
      <div className={classes.bandRow}>
        <div style={{ minWidth: 0 }}>
          <div className={classes.bandTitleRow}>
            {back ? (
              <AppLink to={back.to} className={classes.bandBack} aria-label={back.label} title={back.label}>
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
