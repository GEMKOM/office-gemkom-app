import { DonutChart } from '@mantine/charts';
import type { ReactNode } from 'react';
import { LegendSwatch } from './ChartFrame';
import { ChartTooltipBox } from './ChartTooltipBox';
import { defaultFormat, EMPTY_TEXT, rowFromPayload, type TooltipContentProps } from './shared';
import { categorical } from './palette';
import type { ValueFormat } from './format';
import { formatPercent } from '@/lib/format';
import classes from './charts.module.css';

export interface DonutSlice {
  name: string;
  value: number;
  /** Fixed per entity; defaults to the categorical order. */
  color?: string;
}

export interface DonutBreakdownProps {
  label: string;
  data: DonutSlice[];
  format?: ValueFormat;
  /** Text in the hole (the total, usually). */
  center?: string;
  size?: number;
  thickness?: number;
  empty?: ReactNode;
}

/**
 * Part-to-whole for a handful of slices (<= 6). The legend beside it carries
 * name, value and share, so the chart never depends on colour alone; it is
 * also the screen-reader view (the ring itself is hidden from assistive tech).
 */
export function DonutBreakdown({
  label,
  data,
  format = defaultFormat,
  center,
  size = 160,
  thickness = 26,
  empty,
}: DonutBreakdownProps) {
  const slices = data
    .filter((d) => Number.isFinite(d.value) && d.value > 0)
    .map((d, index) => ({ ...d, color: d.color ?? categorical(index) }));
  const total = slices.reduce((sum, d) => sum + d.value, 0);
  const share = (value: number) => (total > 0 ? formatPercent((value / total) * 100) : '—');

  if (empty || !slices.length) {
    return (
      <figure className={classes.frame} aria-label={label}>
        <div className={classes.empty} style={{ height: size }}>
          {empty ?? EMPTY_TEXT}
        </div>
      </figure>
    );
  }

  const tooltipContent = ({ active, payload }: TooltipContentProps) => {
    const slice = rowFromPayload<DonutSlice>(payload);
    if (!active || !slice) return null;
    return (
      <ChartTooltipBox
        title={slice.name}
        lines={[
          {
            key: 'v',
            label: share(slice.value),
            color: slice.color ?? '',
            value: format(slice.value),
          },
        ]}
      />
    );
  };

  return (
    <figure className={classes.frame} aria-label={label}>
      <div className={classes.donut}>
        <div aria-hidden style={{ flex: 'none' }}>
          <DonutChart
            data={slices.map((d) => ({ name: d.name, value: d.value, color: d.color }))}
            size={size}
            thickness={thickness}
            paddingAngle={slices.length > 1 ? 1 : 0}
            strokeWidth={0}
            chartLabel={center}
            tooltipDataSource="segment"
            tooltipProps={{ content: tooltipContent }}
            pieProps={{ isAnimationActive: false }}
          />
        </div>
        <ul className={classes.donutLegend}>
          {slices.map((d) => (
            <li key={d.name}>
              <LegendSwatch color={d.color} />
              <span className={classes.donutName} title={d.name}>
                {d.name}
              </span>
              <span className={classes.donutValue}>{format(d.value)}</span>
              <span className={classes.donutShare}>{share(d.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
