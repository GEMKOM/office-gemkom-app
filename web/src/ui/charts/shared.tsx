import type { ReactNode } from 'react';
import type { ChartTable, LegendItem } from './ChartFrame';
import type { TooltipLine } from './ChartTooltipBox';
import { compactNumber, type ValueFormat } from './format';
import type { ChartSeriesDef } from './types';
import { formatNumber, toNumber } from '@/lib/format';

export const EMPTY_TEXT = 'Veri yok';

export const defaultFormat: ValueFormat = (v) => formatNumber(v);
export const defaultAxisFormat: ValueFormat = compactNumber;

export function valueOf(row: object, key: string): number | null {
  return toNumber((row as Record<string, unknown>)[key] as number | string | null | undefined);
}

export function formatCell(row: object, series: ChartSeriesDef, format: ValueFormat): string {
  const value = valueOf(row, series.key);
  return value === null ? '—' : (series.format ?? format)(value);
}

export function categoryText(row: object, key: string): string {
  const value = (row as Record<string, unknown>)[key];
  return value === null || value === undefined ? '' : String(value);
}

export function legendFor(series: ChartSeriesDef[], kind: 'bar' | 'line'): LegendItem[] {
  return series.map((s) => ({
    label: s.label,
    color: s.color,
    shape:
      s.pattern === 'hatch'
        ? 'hatch'
        : s.pattern === 'dashed'
          ? 'dashed'
          : kind === 'line'
            ? 'line'
            : 'box',
  }));
}

export function tableFor<Row extends object>(
  data: Row[],
  categoryKey: string,
  categoryLabel: string,
  series: ChartSeriesDef[],
  format: ValueFormat,
): ChartTable {
  return {
    columns: [categoryLabel, ...series.map((s) => s.label)],
    rows: data.map((row) => [
      categoryText(row, categoryKey),
      ...series.map((s) => formatCell(row, s, format)),
    ]),
  };
}

export function tooltipLines(
  row: object,
  series: ChartSeriesDef[],
  format: ValueFormat,
  kind: (s: ChartSeriesDef) => 'bar' | 'line',
): TooltipLine[] {
  return series.map((s) => ({
    key: s.key,
    label: s.label,
    color: s.color,
    shape:
      s.pattern === 'hatch'
        ? 'hatch'
        : s.pattern === 'dashed'
          ? 'dashed'
          : kind(s) === 'line'
            ? 'line'
            : 'box',
    value: formatCell(row, s, format),
  }));
}

/** Recharts hands tooltips its payload; the row is on every entry. */
export function rowFromPayload<Row>(payload: unknown): Row | null {
  if (!Array.isArray(payload) || !payload.length) return null;
  const first = payload[0] as { payload?: Row };
  return first.payload ?? null;
}

export interface TooltipContentProps {
  active?: boolean;
  payload?: unknown;
}

export type TooltipRenderer = (props: TooltipContentProps) => ReactNode;

/** Recharts axis styling shared by every cartesian wrapper. */
export const AXIS_TICK = { fontSize: 12, fill: 'var(--gk-muted)' } as const;
export const GRID_PROPS = { stroke: 'var(--gk-line)', strokeDasharray: '0' } as const;
