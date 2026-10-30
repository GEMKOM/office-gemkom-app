import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { AppLink, useAppNavigate } from '@/shell/AppLink';
import { FaIcon } from './FaIcon';
import { PageHeader, type PageFigure } from './PageHeader';
import { tileFamily } from './StatCards';
import { StatusBadge, type StatusFamily } from './StatusBadge';
import classes from './ui.module.css';

export interface MenuFeature {
  label: ReactNode;
  /** Font Awesome classes. */
  icon?: string;
  /** CSS colour of the icon. Default the GEMKOM red. */
  iconColor?: string;
  link?: string;
}

export interface MenuCard {
  title: ReactNode;
  description?: ReactNode;
  /** Font Awesome classes. */
  icon: string;
  /** Mantine colour or legacy Bootstrap name ('primary', 'success', ...). */
  iconColor?: string;
  link?: string;
  features?: MenuFeature[];
  /**
   * A live figure under the title, e.g. { value: 148, label: 'aktif müşteri' }.
   * An undefined value shows a placeholder bar while it loads.
   */
  stat?: { value: ReactNode | undefined; label: ReactNode };
  /** A status pill beside the stat, e.g. { label: '4 Onay Bekliyor', color: 'yellow' }. */
  badge?: { label: ReactNode; color: StatusFamily };
}

export interface MenuCardsProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Key figures for the module, shown large on the band. */
  stats?: PageFigure[];
  /** Quick actions on the band (white primary, ghost default). */
  actions?: ReactNode;
  /**
   * One-row cards: tile, title and stat (or the description, on one line).
   * For hubs that show panels underneath.
   */
  compact?: boolean;
  cards: MenuCard[];
  /** Panels under the cards, e.g. recent records. */
  children?: ReactNode;
}

/** Stands in for a figure that is still loading; static, nothing moves. */
export function PendingValue() {
  return <span className={classes.pending} aria-label="Yükleniyor" />;
}

// authService fires this after swapping in a fresh permission payload; spelled
// out (as in legacy menu.js) so this file does not pull in authService.
const PERMISSIONS_REFRESHED_EVENT = 'permissions:refreshed';

// Grants are absolute routes; some hub pages write card links relative to
// the page ("finished-timers/"). Resolve before asking hasRouteAccess.
function resolveLink(link: string): string {
  try {
    return new URL(link, window.location.href).pathname;
  } catch {
    return link;
  }
}

/**
 * Same rule as legacy MenuComponent.visibleCards(): a card whose own link is
 * not granted goes; ungranted feature links go; a link-less card goes once
 * none of its features is left; a link-less card without features stays.
 */
export function visibleMenuCards(cards: MenuCard[]): MenuCard[] {
  return cards.flatMap((card) => {
    if (card.link && !hasRouteAccess(resolveLink(card.link))) return [];
    const features = card.features ?? [];
    const visibleFeatures = features.filter(
      (feature) => !feature.link || hasRouteAccess(resolveLink(feature.link)),
    );
    if (!card.link && features.length > 0 && visibleFeatures.length === 0) return [];
    return [{ ...card, features: visibleFeatures }];
  });
}

function usePermissionsVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const onRefresh = (event: Event) => {
      if ((event as CustomEvent<{ changed?: boolean }>).detail?.changed === false) return;
      setVersion((v) => v + 1);
    };
    window.addEventListener(PERMISSIONS_REFRESHED_EVENT, onRefresh);
    return () => window.removeEventListener(PERMISSIONS_REFRESHED_EVENT, onRefresh);
  }, []);
  return version;
}

function isFromLink(event: MouseEvent) {
  return event.target instanceof Element && event.target.closest('a') !== null;
}

function Card({ card, compact }: { card: MenuCard; compact: boolean }) {
  const navigate = useAppNavigate();
  const { link, stat, badge } = card;
  const summary = stat ? (
    <span className={classes.hubStat}>
      <b>{stat.value === undefined ? <PendingValue /> : stat.value}</b> {stat.label}
    </span>
  ) : compact && card.description ? (
    <span className={classes.hubStat}>{card.description}</span>
  ) : null;
  return (
    <article
      className={classes.hubCard}
      data-link={link ? true : undefined}
      data-compact={compact || undefined}
      // The whole card is clickable like legacy; the title link keeps
      // middle-click / new tab working. Feature links handle themselves.
      onClick={link ? (event) => !isFromLink(event) && navigate(link) : undefined}
    >
      {link ? <FaIcon icon="fas fa-arrow-right" className={classes.hubArrow} /> : null}
      <div className={classes.hubHead}>
        <span className={classes.tile} data-family={tileFamily(card.iconColor)} style={{ width: 44, height: 44, fontSize: 18 }}>
          <FaIcon icon={card.icon} />
        </span>
        <div className={classes.hubHeadText}>
          <h3 className={classes.hubTitle}>{link ? <AppLink to={link}>{card.title}</AppLink> : card.title}</h3>
          {summary || badge ? (
            <div className={classes.hubMeta}>
              {summary}
              {badge ? <StatusBadge color={badge.color}>{badge.label}</StatusBadge> : null}
            </div>
          ) : null}
        </div>
      </div>
      {!compact && card.description ? <p className={classes.hubText}>{card.description}</p> : null}
      {card.features && card.features.length > 0 ? (
        <ul className={classes.hubLinks}>
          {card.features.map((feature, index) => {
            const content = (
              <>
                {feature.icon ? (
                  <FaIcon icon={feature.icon} color={feature.iconColor ?? 'var(--gk-red-700)'} style={{ width: 16 }} />
                ) : null}
                {feature.label}
                {feature.link ? <i className={`fas fa-chevron-right ${classes.hubLinkChevron}`} aria-hidden /> : null}
              </>
            );
            return (
              <li key={index}>
                {feature.link ? <AppLink to={feature.link}>{content}</AppLink> : <span>{content}</span>}
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}

/**
 * Replaces components/menu/menu.js on the section hub pages: the band (with
 * the module's figures and quick actions), the cards, then any panels.
 */
export function MenuCards({ title, subtitle, stats, actions, compact = false, cards, children }: MenuCardsProps) {
  const permissionsVersion = usePermissionsVersion();
  const visible = useMemo(
    () => visibleMenuCards(cards),
    // permissionsVersion re-runs the access check after a permission refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, permissionsVersion],
  );
  const single = visible.length === 1;

  return (
    <>
      {title || subtitle || stats?.length || actions ? (
        <PageHeader title={title ?? ''} subtitle={subtitle} stats={stats} actions={actions} />
      ) : null}
      <div
        className={classes.hubGrid}
        data-compact={compact || undefined}
        style={single ? { maxWidth: 520 } : undefined}
      >
        {visible.map((card, index) => (
          <Card key={card.link ?? index} card={card} compact={compact} />
        ))}
      </div>
      {children ? <div className={classes.hubSection}>{children}</div> : null}
    </>
  );
}
