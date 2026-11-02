import type { CSSProperties, ReactNode } from 'react';
import classes from './charts.module.css';

export type LegendShape = 'box' | 'line' | 'dashed' | 'hatch';

export interface LegendItem {
  label: ReactNode;
  color: string;
  /** How the mark looks, so the legend matches it without colour: box, line, dashed line, hatched box. */
  shape?: LegendShape;
}

/** The chart's numbers as a table: the screen-reader and no-colour fallback. */
export interface ChartTable {
  columns: string[];
  rows: ReactNode[][];
}

export interface ChartFrameProps {
  /** Names the chart for assistive tech; usually the panel title. */
  label: string;
  height: number;
  legend?: LegendItem[];
  table?: ChartTable;
  /** Shown instead of the chart (e.g. "Veri yok"); the table view is hidden too. */
  empty?: ReactNode;
  /** Small text under the chart, left of the table toggle ("* kısmi hafta"). */
  note?: ReactNode;
  children: ReactNode;
}

export function LegendSwatch({ color, shape = 'box' }: { color: string; shape?: LegendShape }) {
  return (
    <span
      className={classes.swatch}
      data-shape={shape}
      style={
        { '--swatch': color, background: shape === 'box' ? color : undefined } as CSSProperties
      }
      aria-hidden
    />
  );
}

export function ChartLegendList({ items }: { items: LegendItem[] }) {
  return (
    <ul className={classes.legend}>
      {items.map((item, index) => (
        <li key={index}>
          <LegendSwatch color={item.color} shape={item.shape} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartDataTable({ label, table }: { label: string; table: ChartTable }) {
  return (
    <details className={classes.tableToggle}>
      <summary>Tablo olarak göster</summary>
      <div className={classes.tableScroll}>
        <table className={classes.dataTable}>
          <caption className={classes.srOnly}>{label}</caption>
          <thead>
            <tr>
              {table.columns.map((column, index) => (
                <th key={index} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) =>
                  cellIndex === 0 ? (
                    <th key={cellIndex} scope="row" style={{ fontWeight: 400 }}>
                      {cell}
                    </th>
                  ) : (
                    <td key={cellIndex}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Every chart sits in one: a legend that names the series by shape as well as
 * colour, the plot (hidden from screen readers), and a "Tablo olarak göster"
 * toggle with the same numbers.
 */
export function ChartFrame({
  label,
  height,
  legend,
  table,
  empty,
  note,
  children,
}: ChartFrameProps) {
  if (empty) {
    return (
      <figure className={classes.frame} aria-label={label}>
        <div className={classes.empty} style={{ height }}>
          {empty}
        </div>
      </figure>
    );
  }
  return (
    <figure className={classes.frame} aria-label={label}>
      {legend && legend.length > 1 ? <ChartLegendList items={legend} /> : null}
      <div className={classes.plot} style={{ height }} aria-hidden>
        {children}
      </div>
      {note || table ? (
        <figcaption className={classes.foot}>
          <span>{note}</span>
          {table ? <ChartDataTable label={label} table={table} /> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
