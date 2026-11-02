import { Sparkline } from '@mantine/charts';
import type { CSSProperties, ReactNode } from 'react';
import { AppLink } from '@/shell/AppLink';
import { FaIcon } from '@/ui/FaIcon';
import { Delta, type DeltaProps } from './Delta';
import { ACCENT, STATUS, type StatusTone } from './palette';
import classes from './charts.module.css';

export interface KpiStatus {
  tone: StatusTone;
  /** Always shown: the word carries the state, the colour only repeats it. */
  label: string;
}

export interface KpiTileProps {
  id?: string;
  label: ReactNode;
  value: ReactNode;
  /** Font Awesome classes, shown in red before the label. */
  icon?: string;
  /** Change against a previous period. */
  delta?: DeltaProps;
  /** Over / under target, on time / late: a coloured edge plus an icon and a word. */
  status?: KpiStatus;
  /** Small text under the value (period, unit, source). */
  hint?: ReactNode;
  /** A small trend under the value; at least two points. */
  spark?: (number | null)[];
  sparkColor?: string;
  /** Makes the tile a link (drill-down). */
  to?: string;
  onClick?: () => void;
}

const STATUS_ICON: Record<StatusTone, string> = {
  good: 'fas fa-circle-check',
  warning: 'fas fa-triangle-exclamation',
  bad: 'fas fa-circle-exclamation',
  neutral: 'fas fa-circle-minus',
};

const STATUS_FAMILY: Record<StatusTone, string> = {
  good: 'green',
  warning: 'yellow',
  bad: 'red',
  neutral: 'grey',
};

/** One headline number: label, value, change, state and an optional sparkline. */
export function KpiTile({
  id,
  label,
  value,
  icon,
  delta,
  status,
  hint,
  spark,
  sparkColor = ACCENT,
  to,
  onClick,
}: KpiTileProps) {
  const points = (spark ?? []).filter((v): v is number => v !== null && Number.isFinite(v));
  const body = (
    <>
      <span className={classes.kpiLabel}>
        {icon ? <FaIcon icon={icon} /> : null}
        {label}
      </span>
      <span className={classes.kpiValue}>{value}</span>
      {delta || status || hint ? (
        <span className={classes.kpiMeta}>
          {delta ? <Delta {...delta} /> : null}
          {status ? (
            <span className={classes.delta} data-family={STATUS_FAMILY[status.tone]}>
              <FaIcon icon={STATUS_ICON[status.tone]} />
              {status.label}
            </span>
          ) : null}
          {hint ? <span>{hint}</span> : null}
        </span>
      ) : null}
      {points.length >= 2 ? (
        <span className={classes.kpiSpark} aria-hidden>
          <Sparkline
            h={32}
            data={points}
            color={sparkColor}
            fillOpacity={0.12}
            strokeWidth={1.5}
            curveType="linear"
          />
        </span>
      ) : null}
    </>
  );
  const style = status ? ({ '--kpi-tone': STATUS[status.tone] } as CSSProperties) : undefined;
  const tone = status ? status.tone : undefined;
  if (to) {
    return (
      <AppLink to={to} id={id} className={classes.kpi} data-tone={tone} style={style}>
        {body}
      </AppLink>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        id={id}
        className={classes.kpi}
        data-tone={tone}
        style={style}
        onClick={onClick}
      >
        {body}
      </button>
    );
  }
  return (
    <div id={id} className={classes.kpi} data-tone={tone} style={style}>
      {body}
    </div>
  );
}

export interface KpiGridProps {
  children: ReactNode;
  /** Narrowest a tile gets before the row wraps. Default 200px. */
  minWidth?: number;
}

/** Tiles in rows that wrap: four or five across on a desktop, one or two on a phone. */
export function KpiGrid({ children, minWidth = 200 }: KpiGridProps) {
  return (
    <div className={classes.kpiGrid} style={{ '--kpi-min': `${minWidth}px` } as CSSProperties}>
      {children}
    </div>
  );
}
