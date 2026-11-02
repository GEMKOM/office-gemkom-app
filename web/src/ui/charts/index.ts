// Chart wrappers for the dashboards. Import from '@/ui/charts' (not '@/ui'),
// so only the pages that draw charts load Recharts and its styles; those pages
// are lazy routes, so the chart code ships in their chunks.
import '@mantine/charts/styles.css';

export { BarsChart, type BarsChartProps } from './BarsChart';
export { TrendChart, type TrendChartProps } from './TrendChart';
export { DonutBreakdown, type DonutBreakdownProps, type DonutSlice } from './DonutBreakdown';
export { KpiTile, KpiGrid, type KpiTileProps, type KpiGridProps, type KpiStatus } from './KpiTile';
export { Delta, deltaTone, type DeltaProps, type DeltaTone } from './Delta';
export { DashGrid, DashCell, type DashCellProps, type DashSpan } from './DashGrid';
export {
  ChartFrame,
  ChartLegendList,
  ChartDataTable,
  LegendSwatch,
  type ChartFrameProps,
  type ChartTable,
  type LegendItem,
  type LegendShape,
} from './ChartFrame';
export { ChartTooltipBox, type TooltipLine } from './ChartTooltipBox';
export { ChartPatterns } from './ChartPatterns';
export * from './palette';
export { compactNumber, compactCurrency, valueFormats, type ValueFormat } from './format';
export { percentChange, movingAverage, sumBy, foldTail } from './math';
export type { ChartSeriesDef, ChartReferenceLine, CartesianChartProps } from './types';
