import { BarChart, CompositeChart } from '@mantine/charts';
import { useMediaQuery } from '@mantine/hooks';
import type { ReactElement } from 'react';
import { Rectangle, type BarShapeProps } from 'recharts';
import { ChartFrame, type LegendItem } from './ChartFrame';
import { ChartPatterns } from './ChartPatterns';
import { ChartTooltipBox } from './ChartTooltipBox';
import {
  ACCENT,
  CATEGORICAL,
  GRAPHITE,
  hatchFill,
  NEUTRAL,
  NEUTRAL_LIGHT,
  STATUS,
} from './palette';
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
  valueOf,
  type TooltipContentProps,
} from './shared';
import type { CartesianChartProps, ChartSeriesDef } from './types';

const PATTERN_COLORS = [
  ACCENT,
  GRAPHITE,
  NEUTRAL,
  NEUTRAL_LIGHT,
  ...CATEGORICAL,
  ...Object.values(STATUS),
];

export interface BarsChartProps<Row extends object> extends CartesianChartProps<Row> {
  /** Lines drawn over the bars on the same axis (an average, a target per period). Vertical bars only. */
  lines?: ChartSeriesDef[];
  /** Stack all bar series into one bar per category. */
  stacked?: boolean;
  /** Bars run left to right, categories down the side (long names, rankings). */
  horizontal?: boolean;
  /** Width of the category axis when horizontal. Default 140. */
  categoryWidth?: number;
  /**
   * Direct labels at the bar ends: true formats the value, a function returns
   * the text ('' hides it). Use for a few bars, not every point of a long series.
   */
  valueLabels?: boolean | ((value: number, row: Row, series: ChartSeriesDef) => string);
  /** Per-bar fill, e.g. red for a negative week or hatchFill() for a partial one. */
  cellFill?: (row: Row, series: ChartSeriesDef) => string | undefined;
  /** Extra legend entries (what a hatched or grey bar means). */
  legendExtra?: LegendItem[];
  /** Shown instead of the default legend (one series needs none). */
  legend?: LegendItem[];
}

interface LabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
  index?: number;
}

/** Long category names on a horizontal axis: cut to what fits (about 7px a character). */
function truncate(text: string, width: number): string {
  const max = Math.max(6, Math.floor(width / 7));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function num(value: number | string | undefined): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

/**
 * Vertical or horizontal bars, grouped or stacked, optionally with lines on the
 * same axis. Never a second y-axis: a measure on another scale gets its own chart.
 */
export function BarsChart<Row extends object>({
  label,
  data,
  categoryKey,
  categoryLabel = 'Dönem',
  series,
  lines = [],
  stacked = false,
  horizontal = false,
  categoryWidth = 140,
  height = 260,
  format = defaultFormat,
  axisFormat = defaultAxisFormat,
  valueLabels = false,
  cellFill,
  referenceLines,
  tooltipNote,
  empty,
  note,
  domain,
  legendExtra = [],
  legend,
}: BarsChartProps<Row>) {
  const phone = useMediaQuery('(max-width: 36em)') ?? false;
  const axisWidth = phone ? Math.min(categoryWidth, 120) : categoryWidth;
  const all = [...series, ...lines];
  const isLine = (s: ChartSeriesDef) => lines.includes(s);
  const emptyText = empty ?? (data.length ? undefined : EMPTY_TEXT);

  const shape = (s: ChartSeriesDef) => (props: BarShapeProps) => {
    const row = props.payload as Row | undefined;
    const custom = row && cellFill ? cellFill(row, s) : undefined;
    const fill = custom ?? (s.pattern === 'hatch' ? hatchFill(s.color) : props.fill);
    const radius: [number, number, number, number] = stacked
      ? [0, 0, 0, 0]
      : horizontal
        ? [0, 3, 3, 0]
        : [3, 3, 0, 0];
    return <Rectangle {...props} fill={fill} radius={radius} />;
  };

  const label_ = (s: ChartSeriesDef) =>
    valueLabels
      ? (props: LabelProps): ReactElement | string => {
          const row = props.index === undefined ? undefined : data[props.index];
          const value = row ? valueOf(row, s.key) : null;
          if (!row || value === null) return '';
          const text =
            typeof valueLabels === 'function'
              ? valueLabels(value, row, s)
              : (s.format ?? format)(value);
          if (!text) return '';
          const x = num(props.x);
          const y = num(props.y);
          const w = num(props.width);
          const h = num(props.height);
          return horizontal ? (
            <text
              x={x + w + 6}
              y={y + h / 2}
              dominantBaseline="central"
              fontSize={12}
              fill="var(--gk-ink-2)"
            >
              {text}
            </text>
          ) : (
            <text
              x={x + w / 2}
              y={value < 0 ? y + h + 14 : y - 6}
              textAnchor="middle"
              fontSize={12}
              fill="var(--gk-ink-2)"
            >
              {text}
            </text>
          );
        }
      : undefined;

  const barProps = (s: { name: string }) => {
    const def = all.find((d) => d.key === s.name)!;
    return {
      shape: shape(def),
      label: label_(def),
      ...(stacked
        ? { stackId: 'stack', stroke: 'var(--gk-surface)', strokeWidth: 1, strokeOpacity: 1 }
        : {}),
    };
  };

  const tooltipContent = ({ active, payload }: TooltipContentProps) => {
    const row = rowFromPayload<Row>(payload);
    if (!active || !row) return null;
    return (
      <ChartTooltipBox
        title={categoryText(row, categoryKey)}
        lines={tooltipLines(row, all, format, (s) => (isLine(s) ? 'line' : 'bar'))}
        note={tooltipNote?.(row)}
      />
    );
  };

  const references = referenceLines?.map((line) => ({
    [horizontal ? 'x' : 'y']: line.value,
    label: line.label,
    color: line.color ?? GRAPHITE,
    strokeDasharray: '6 4',
    labelPosition: horizontal ? ('insideTopRight' as const) : ('insideTopLeft' as const),
  }));

  const valueAxis = {
    tickFormatter: axisFormat,
    ...(domain ? { domain } : {}),
    tick: { fontSize: 12, fill: 'var(--gk-muted)' },
  };
  const categoryAxis = {
    tick: { fontSize: 12, fill: 'var(--gk-muted)' },
    ...(horizontal
      ? { width: axisWidth, tickFormatter: (v: unknown) => truncate(String(v ?? ''), axisWidth) }
      : {}),
  };

  const common = {
    h: height,
    data: data as Record<string, unknown>[],
    dataKey: categoryKey,
    withLegend: false,
    gridAxis: (horizontal ? 'y' : 'x') as 'x' | 'y',
    gridProps: GRID_PROPS,
    textColor: 'var(--gk-muted)',
    gridColor: 'var(--gk-line)',
    tooltipAnimationDuration: 0,
    tooltipProps: { content: tooltipContent },
    referenceLines: references,
    maxBarWidth: horizontal ? 28 : 48,
  };
  // Room for direct labels past the bar ends.
  const margin = {
    top: valueLabels && !horizontal ? 18 : 8,
    right: valueLabels && horizontal ? 72 : 12,
    bottom: 0,
    left: 0,
  };

  const legendItems = legend ?? [
    ...legendFor(series, 'bar'),
    ...legendFor(lines, 'line'),
    ...legendExtra,
  ];

  return (
    <ChartFrame
      label={label}
      height={height}
      empty={emptyText}
      note={note}
      legend={legendItems}
      table={tableFor(data, categoryKey, categoryLabel, all, format)}
    >
      {horizontal ? (
        <BarChart
          {...common}
          orientation="vertical"
          type={stacked ? 'stacked' : 'default'}
          series={series.map((s) => ({ name: s.key, label: s.label, color: s.color }))}
          barProps={barProps}
          xAxisProps={valueAxis}
          yAxisProps={categoryAxis}
          valueFormatter={axisFormat}
          barChartProps={{ margin }}
        >
          <ChartPatterns colors={PATTERN_COLORS} />
        </BarChart>
      ) : (
        <CompositeChart
          {...common}
          series={[
            ...series.map((s) => ({
              name: s.key,
              label: s.label,
              color: s.color,
              type: 'bar' as const,
            })),
            ...lines.map((s) => ({
              name: s.key,
              label: s.label,
              color: s.color,
              type: 'line' as const,
              strokeDasharray: s.pattern === 'dashed' ? '6 4' : undefined,
            })),
          ]}
          barProps={barProps}
          lineProps={{ isAnimationActive: false, connectNulls: true }}
          withDots={false}
          strokeWidth={2}
          curveType="linear"
          xAxisProps={categoryAxis}
          yAxisProps={valueAxis}
          valueFormatter={axisFormat}
          composedChartProps={{ margin }}
        >
          <ChartPatterns colors={PATTERN_COLORS} />
        </CompositeChart>
      )}
    </ChartFrame>
  );
}
