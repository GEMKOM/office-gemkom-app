import type { ReactNode } from 'react';
import { LegendSwatch, type LegendShape } from './ChartFrame';
import classes from './charts.module.css';

export interface TooltipLine {
  key: string;
  label: ReactNode;
  color: string;
  shape?: LegendShape;
  value: ReactNode;
}

export interface ChartTooltipBoxProps {
  title: ReactNode;
  lines: TooltipLine[];
  note?: ReactNode;
}

/** The hover card every wrapper uses: tr-TR values, one row per series. */
export function ChartTooltipBox({ title, lines, note }: ChartTooltipBoxProps) {
  return (
    <div className={classes.tooltip}>
      <div className={classes.tooltipTitle}>{title}</div>
      {lines.map((line) => (
        <div key={line.key} className={classes.tooltipRow}>
          <LegendSwatch color={line.color} shape={line.shape} />
          <span>{line.label}</span>
          <span className={classes.tooltipValue}>{line.value}</span>
        </div>
      ))}
      {note ? <div className={classes.tooltipNote}>{note}</div> : null}
    </div>
  );
}
