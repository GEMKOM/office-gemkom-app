import { FaIcon } from '@/ui/FaIcon';
import { formatPercent } from '@/lib/format';
import classes from './charts.module.css';
import type { ReactNode } from 'react';

export interface DeltaProps {
  /** Signed change; null shows nothing. */
  value: number | null | undefined;
  /** Formats the absolute change. Default percent with one decimal ("12,3%"). */
  format?: (abs: number) => string;
  /** Which direction is good news: 'up' (sales), 'down' (late jobs, costs) or 'none' (just change). */
  good?: 'up' | 'down' | 'none';
  /** What the change is against, read after the number ("geçen aya göre"). */
  against?: ReactNode;
}

export type DeltaTone = 'good' | 'bad' | 'flat';

export function deltaTone(value: number, good: DeltaProps['good'] = 'up'): DeltaTone {
  if (value === 0 || good === 'none') return 'flat';
  const up = value > 0;
  return (good === 'up') === up ? 'good' : 'bad';
}

const FAMILY: Record<DeltaTone, string> = { good: 'green', bad: 'red', flat: 'grey' };

/**
 * A change shown by form and colour: an arrow and a sign for the direction,
 * green or red only for whether that is good. Screen readers hear
 * "artış 12,3%" / "azalış 4%".
 */
export function Delta({
  value,
  format = (abs) => formatPercent(abs),
  good = 'up',
  against,
}: DeltaProps) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const tone = deltaTone(value, good);
  const direction = value > 0 ? 'artış' : value < 0 ? 'azalış' : 'değişim yok';
  const icon = value > 0 ? 'fas fa-arrow-up' : value < 0 ? 'fas fa-arrow-down' : 'fas fa-minus';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return (
    <span
      className={classes.delta}
      data-family={good === 'none' && value !== 0 ? 'blue' : FAMILY[tone]}
    >
      <FaIcon icon={icon} />
      <span className={classes.srOnly}>{direction} </span>
      <span>
        {sign}
        {format(Math.abs(value))}
      </span>
      {against ? <span style={{ fontWeight: 400 }}>{against}</span> : null}
    </span>
  );
}
