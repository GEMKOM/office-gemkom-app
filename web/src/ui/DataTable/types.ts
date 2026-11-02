import type { RowData } from '@tanstack/react-table';
import type { CSSProperties, ReactNode } from 'react';

export type { RowData };

export type SortDir = 'asc' | 'desc';

export interface DataTableColumn<T> {
  /** Unique column id; also the field read from the row when there is no accessor. */
  key: string;
  header: ReactNode;
  /** Value for sorting and export (and display when there is no render). */
  accessor?: keyof T | ((row: T) => unknown);
  /** Cell content. Without it the value is shown, '-' when empty. */
  render?: (row: T, index: number) => ReactNode;
  /** Overrides the table-level `sortable`. */
  sortable?: boolean;
  /**
   * The field reported to `sort.onSortChange` (and matched against
   * `sort.sortBy`) when it differs from `key`, e.g. 'position__title'.
   */
  sortKey?: string;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  hidden?: boolean;
  /** Excel value; numbers and Dates stay typed in the sheet. */
  exportValue?: (row: T) => unknown;
  /** Excel header text when `header` is not a string. */
  exportHeader?: string;
  /** Excel number format for numeric cells, e.g. '#,##0.00 "₺"'. */
  exportFormat?: string;
  /** false leaves the column out of the export. */
  exportable?: boolean;
}

export interface RowAction<T> {
  key?: string;
  label: string;
  /** Font Awesome classes, e.g. 'fas fa-edit'. */
  icon: string;
  color?: string;
  onClick: (row: T) => void;
  hidden?: boolean;
  disabled?: boolean;
}

/** Server pages: the page fetches `page`/`pageSize` and owns both. Pages are 1-based like legacy. */
export interface ServerPagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Called with the new size; the table then asks for page 1 (legacy behaviour). */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

/** Client pages: all rows are in `data`; the table slices them. */
export interface ClientPagination {
  pageSize?: number;
  pageSizeOptions?: number[];
}

/** Server sorting, the legacy `onSort(field, direction)` made controlled. */
export interface ServerSort {
  sortBy: string | null;
  sortDir: SortDir;
  onSortChange: (sortBy: string, sortDir: SortDir) => void;
}

export interface DataTableSelection<T> {
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  isRowSelectable?: (row: T) => boolean;
}

export interface DataTableExport {
  /** '.xlsx' is added when missing. */
  fileName: string;
  sheetName?: string;
}

export interface DataTableFooterContext<T> {
  /** Rows on screen (the current page). */
  rows: T[];
  /** Every row in `data`. */
  allRows: T[];
}

export interface DataTableProps<T extends RowData> {
  data: readonly T[];
  /** Keep this stable (module scope or useMemo): a new array re-renders every row. */
  columns: readonly DataTableColumn<T>[];
  getRowId: (row: T, index: number) => string;
  /** Rows stay on screen under an overlay; skeleton rows only when there is no data yet. */
  loading?: boolean;
  /** false: a spinner instead of skeleton rows (legacy option). Default true. */
  skeleton?: boolean;
  skeletonRows?: number;

  /** true / ClientPagination slices `data`; ServerPagination shows a server page. */
  pagination?: boolean | ClientPagination | ServerPagination;
  /** Default for columns without their own `sortable`. Default false. */
  sortable?: boolean;
  /** Server sorting. Without it, sortable columns sort the loaded rows. */
  sort?: ServerSort;
  /** Initial client sort. */
  defaultSort?: { sortBy: string; sortDir: SortDir };

  rowActions?: (row: T) => RowAction<T>[];
  /** Header of the actions column. Default 'İşlemler'. */
  actionsHeader?: ReactNode;
  onRowClick?: (row: T, index: number) => void;
  selection?: DataTableSelection<T>;
  /** Row background (legacy rowBackgroundColor). */
  rowStyle?: (row: T, index: number) => CSSProperties | undefined;
  /**
   * Rows re-render only when their row object, `columns`, selection or this
   * change; a new rowActions/rowStyle function alone does not. Put page state
   * that `render`, `rowActions` or `rowStyle` read here. (Clicks always run
   * the latest callbacks.)
   */
  extraData?: unknown;

  /** Sticky header inside a scroll box; a CSS height, true = legacy calc(100vh - 350px). */
  stickyHeader?: boolean | string;
  /** Render only visible rows; for long unpaginated lists. Implies a sticky header. */
  virtualize?: boolean | { height?: string | number; rowHeight?: number; overscan?: number };

  exportable?: DataTableExport;
  emptyMessage?: ReactNode;
  footer?: (ctx: DataTableFooterContext<T>) => ReactNode;

  /** Card header (legacy title/icon). */
  title?: ReactNode;
  /** Takes the title's place in the header, e.g. <FilterBar inline … />. */
  filters?: ReactNode;
  icon?: string;
  /** Extra buttons in the card header. */
  toolbar?: ReactNode;
  /** Shows a Yenile button. */
  onRefresh?: () => void;

  striped?: boolean;
  withColumnBorders?: boolean;
  /** Default 'sm'. */
  verticalSpacing?: 'xs' | 'sm' | 'md';
}
