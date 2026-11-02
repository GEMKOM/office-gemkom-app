import { AreaChart, LineChart } from '@mantine/charts';
import { ChartFrame, type LegendItem } from './ChartFrame';
import { ChartTooltipBox } from './ChartTooltipBox';
import { GRAPHITE } from './palette';
import {
  categoryText,
  defaultAxisFormat,
  defaultFormat,
  EMPTY_TEXT,
  GRID_PROPS,
  legendFor,
  rowFromPayload,
  tableFor,
  tooltipLines,
  type TooltipContentProps,
} from './shared';
import type { CartesianChartProps } from './types';

export interface TrendChartProps<Row extends object> extends CartesianChartProps<Row> {
  /** Fill under the first series (a running total, a volume). */
  area?: boolean;
  /** Dots on every point; on by default for short series (<= 13 points). */
  dots?: boolean;
  legendExtra?: LegendItem[];
}

/** Change over time: one or a few lines on one axis, with a crosshair tooltip. */
export function TrendChart<Row extends object>({
  label,
  data,
  categoryKey,
  categoryLabel = 'Dönem',
  series,
  height = 260,
  format = defaultFormat,
  axisFormat = defaultAxisFormat,
  referenceLines,
  tooltipNote,
  empty,
  note,
  domain,
  area = false,
  dots,
  legendExtra = [],
}: TrendChartProps<Row>) {
  const emptyText = empty ?? (data.length ? undefined : EMPTY_TEXT);
  const withDots = dots ?? data.length <= 13;

  const tooltipContent = ({ active, payload }: TooltipContentProps) => {
    const row = rowFromPayload<Row>(payload);
    if (!active || !row) return null;
    return (
      <ChartTooltipBox
        title={categoryText(row, categoryKey)}
        lines={tooltipLines(row, series, format, () => 'line')}
        note={tooltipNote?.(row)}
      />
    );
  };

  const common = {
    h: height,
    data: data as Record<string, unknown>[],
    dataKey: categoryKey,
    series: series.map((s) => ({
      name: s.key,
      label: s.label,
      color: s.color,
      strokeDasharray: s.pattern === 'dashed' ? '6 4' : undefined,
    })),
    withLegend: false,
    gridAxis: 'x' as const,
    gridProps: GRID_PROPS,
    textColor: 'var(--gk-muted)',
    gridColor: 'var(--gk-line)',
    tooltipAnimationDuration: 0,
    tooltipProps: { content: tooltipContent },
    referenceLines: referenceLines?.map((line) => ({
      y: line.value,
      label: line.label,
      color: line.color ?? GRAPHITE,
      strokeDasharray: '6 4',
      labelPosition: 'insideTopLeft' as const,
    })),
    withDots,
    strokeWidth: 2,
    curveType: 'linear' as const,
    connectNulls: true,
    xAxisProps: { tick: { fontSize: 12, fill: 'var(--gk-muted)' }, minTickGap: 12 },
    yAxisProps: {
      tickFormatter: axisFormat,
      ...(domain ? { domain } : {}),
      tick: { fontSize: 12, fill: 'var(--gk-muted)' },
    },
    valueFormatter: axisFormat,
  };

  return (
    <ChartFrame
      label={label}
      height={height}
      empty={emptyText}
      note={note}
      legend={[...legendFor(series, 'line'), ...legendExtra]}
      table={tableFor(data, categoryKey, categoryLabel, series, format)}
    >
      {area ? (
        <AreaChart
          {...common}
          fillOpacity={0.15}
          withGradient={false}
          areaProps={{ isAnimationActive: false }}
        />
      ) : (
        <LineChart {...common} lineProps={{ isAnimationActive: false }} />
      )}
    </ChartFrame>
  );
}
