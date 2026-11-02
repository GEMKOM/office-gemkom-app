import type { ReactNode } from 'react';
import type { ValueFormat } from './format';

/** One series of a cartesian chart. */
export interface ChartSeriesDef {
  /** The row field holding this series' value. */
  key: string;
  label: string;
  color: string;
  /** 'hatch' fills bars with diagonal lines; 'dashed' draws a dashed line. Secondary encoding beside colour. */
  pattern?: 'hatch' | 'dashed';
  /** Overrides the chart's format for this series (tooltip, labels, table). */
  format?: ValueFormat;
}

export interface ChartReferenceLine {
  value: number;
  label: string;
  color?: string;
}

/** Shared by the cartesian wrappers. Rows are plain objects keyed by series key. */
export interface CartesianChartProps<Row extends object> {
  /** Names the chart for screen readers and the table caption. */
  label: string;
  data: Row[];
  /** Row field with the category text shown on the axis ("Oca 26", "Tedarikçi A"). */
  categoryKey: keyof Row & string;
  /** First column of the table view. Default 'Dönem'. */
  categoryLabel?: string;
  series: ChartSeriesDef[];
  height?: number;
  /** Tooltip, label and table format. Default tr-TR number. */
  format?: ValueFormat;
  /** Axis tick format. Default compact number ("1,2 Mn"). */
  axisFormat?: ValueFormat;
  referenceLines?: ChartReferenceLine[];
  /** Extra lines under the values in the tooltip (tonnage, notes). */
  tooltipNote?: (row: Row) => ReactNode;
  /** Text shown instead of the chart. Default: "Veri yok" when data is empty. */
  empty?: ReactNode;
  /** Small text under the chart ("* kısmi hafta"). */
  note?: ReactNode;
  /** Value-axis bounds, e.g. [0, 100] for percentages. */
  domain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMin' | 'dataMax'];
}
