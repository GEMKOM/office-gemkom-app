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
  /**
   * In the Excel export but not on screen, e.g. the group column of a grouped
   * report (legacy pages patched prepareExportData for this).
   */
  exportOnly?: boolean;
  /** Excel value; numbers and Dates stay typed in the sheet. */
  exportValue?: (row: T) => unknown;
  /** Excel header text when `header` is not a string. */
  exportHeader?: string;
  /** Excel number format for numeric cells, e.g. '#,##0.00 "₺"'. */
  exportFormat?: string;
  /** false leaves the column out of the export. */
  exportable?: boolean;
  /**
   * Inline editing (legacy `editable` + `editableColumns`): true is a text
   * editor. Needs `onCellEdit` on the table.
   */
  editable?: boolean | ColumnEditor<T>;
}

// ---- inline editing ----------------------------------------------------------

export type CellEditorType = 'text' | 'number' | 'select' | 'date';

/**
 * What an editor hands back: text and select give a string, number gives a
 * number (null when emptied), date gives 'YYYY-MM-DD' (null when emptied).
 */
export type CellValue = string | number | null;

export interface EditOption {
  value: string;
  label: string;
}

export interface ColumnEditor<T> {
  /** Default 'text'. */
  type?: CellEditorType;
  /** Select choices; a function for per-row choices. */
  options?: readonly EditOption[] | ((row: T) => readonly EditOption[]);
  /** Number limits (legacy column min/max/step). */
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /** Value the editor opens with. Default: the column value. */
  value?: (row: T) => unknown;
  /**
   * Legacy column.validate: return a message (or false) to refuse the value;
   * true, null or undefined accept it.
   */
  validate?: (value: CellValue, row: T) => string | boolean | null | undefined;
  /** Per-row switch on top of the table's `isRowEditable`. */
  enabled?: (row: T) => boolean;
  /**
   * The row shown while the save is in flight (optimistic value). Default:
   * the row with `accessor` (or `key`) set to the value. Needed only when the
   * column reads the value through a function accessor or a nested field.
   */
  apply?: (row: T, value: CellValue) => T;
}

export interface CellEdit<T> {
  row: T;
  rowId: string;
  /** The column's key. */
  columnKey: string;
  value: CellValue;
  oldValue: CellValue;
}

// ---- grouping ---------------------------------------------------------------

/** A field of the row, or a function returning the group value. */
export type GroupKey<T> = keyof T | ((row: T) => unknown);

export interface RowGroup<T> {
  /** Unique id: the group values from the top level down, joined. */
  id: string;
  /** The raw group value (from the first row). */
  value: unknown;
  /** 0 for the outer level. */
  depth: number;
  /** Every row in the group, nested groups included, in display order. */
  rows: T[];
  expanded: boolean;
}

/**
 * Cells aligned to the table's columns, keyed by column key. '_actions' fills
 * the actions column; missing keys render empty cells (legacy object form of
 * groupHeaderFormatter).
 */
export type GroupCells = Partial<Record<string, ReactNode>>;

export interface DataTableGrouping<T> {
  /** Legacy groupBy. Several keys nest the groups, outer first. */
  by: GroupKey<T> | readonly GroupKey<T>[];
  /**
   * Legacy groupHeaderFormatter. A node spans the row next to the toggle;
   * cells ({ [columnKey]: node }) line up with the columns. Default: the value
   * and a count.
   */
  header?: (group: RowGroup<T>) => ReactNode | { cells: GroupCells };
  /** A row after each group, e.g. sums. Same forms as `header`. */
  footer?: (group: RowGroup<T>) => ReactNode | { cells: GroupCells };
  /** Legacy groupCollapsible. Default true. */
  collapsible?: boolean;
  /** Legacy defaultGroupExpanded. Default true. */
  defaultExpanded?: boolean | ((group: RowGroup<T>) => boolean);
  /**
   * Legacy groupSortDirection. 'asc' (default) and 'desc' order groups by
   * value (numbers numerically, text Turkish-aware); false keeps the order
   * the groups first appear in the data; a function compares group values.
   */
  sort?: 'asc' | 'desc' | false | ((a: unknown, b: unknown) => number);
  /** Text of the default header for empty values. Default '-'. */
  emptyLabel?: string;
}

// ---- reordering -------------------------------------------------------------

export interface RowMove {
  /** The moved row. */
  id: string;
  /** The row it was dropped next to (legacy targetRowKey). */
  targetId: string;
  /** Legacy insertPosition. */
  position: 'before' | 'after';
  /** Positions in `data`. */
  from: number;
  to: number;
}

export interface DataTableReorder<T> {
  /**
   * Legacy onReorder(draggedKey, targetKey, insertPosition). `ids` is every
   * row id of `data` in the new order; the page saves it and passes the
   * reordered rows back.
   */
  onReorder: (ids: string[], move: RowMove) => void;
  /** Rows that cannot be picked up. */
  isRowDraggable?: (row: T) => boolean;
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

  /**
   * Inline edit save (legacy onEdit). Return a promise: the cell shows the
   * new value while it runs, rolls back and shows the error if it rejects.
   * Update `data` (setQueryData, invalidate, or local state) on success.
   */
  onCellEdit?: (edit: CellEdit<T>) => void | Promise<unknown>;
  /** Legacy isRowEditable. */
  isRowEditable?: (row: T, index: number) => boolean;
  /**
   * Draft editors that save later: cells to mark as changed but not saved.
   * Read on row render, like `rowStyle` (put what it reads in `extraData`).
   */
  isCellDirty?: (row: T, columnKey: string) => boolean;

  /** Legacy groupBy and friends. Sorting applies inside groups. */
  grouping?: DataTableGrouping<T>;

  /**
   * Legacy draggable/onReorder: a handle column; drag with the mouse, or
   * focus the handle, Space to pick up, arrows to move, Space to drop,
   * Escape to cancel. Off while a column sort is active.
   */
  reorder?: DataTableReorder<T>;

  striped?: boolean;
  withColumnBorders?: boolean;
  /** Default 'sm'. */
  verticalSpacing?: 'xs' | 'sm' | 'md';
}
