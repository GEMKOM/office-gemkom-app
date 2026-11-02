import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  LoadingOverlay,
  Menu,
  NativeSelect,
  Pagination,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  isValidElement,
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { formatDate } from '@/lib/format';
import { FaIcon } from '../FaIcon';
import { notify } from '../notify';
import { mantineColor } from '../StatCards';
import uiClasses from '../ui.module.css';
import tableClasses from './DataTable.module.css';
import {
  applyCellValue,
  CellEditor,
  editorOf,
  editorOptions,
  editorValue,
  parseEditorText,
  sameCellValue,
  toEditorText,
  type CommitVia,
} from './editing';
import {
  buildGroupTree,
  flattenGroups,
  groupKeys,
  type BodyRow,
  type DisplayItem,
  type GroupNode,
} from './grouping';
import { moveId, sameOrder } from './reorder';
import { columnValue, compareValues, nextSort } from './sorting';
import type {
  CellValue,
  ColumnEditor,
  DataTableColumn,
  DataTableProps,
  GroupCells,
  RowAction,
  RowData,
  RowGroup,
  ServerPagination,
  SortDir,
} from './types';

// Registered once: client sorting and slicing; the manual* flags switch each
// stage off when the server already did it.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});
type Features = typeof features;

const LEGACY_SCROLL_HEIGHT = 'calc(100vh - 350px)';
const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

function isServerPagination(p: DataTableProps<RowData>['pagination']): p is ServerPagination {
  return typeof p === 'object' && p !== null && 'total' in p;
}

/**
 * The latest value, for event handlers. Updated after commit, so it is only
 * read from events (never during render).
 */
function useLatest<V>(value: V) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

function displayValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (value instanceof Date) return formatDate(value);
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Event entry points; one stable object, so they never re-render a row. */
interface RowEvents<T> {
  onRowClick: (row: T, index: number) => void;
  onToggle: (rowId: string) => void;
  /** Runs the action from the page's latest rowActions, so its closure is current. */
  onAction: (row: T, action: RowAction<T>) => void;
  // inline editing
  onCellStart: (rowId: string, columnKey: string) => void;
  onCellFocus: (rowId: string, columnKey: string) => void;
  onCellKey: (rowId: string, columnKey: string, event: KeyboardEvent<HTMLElement>) => void;
  onCellCommit: (rowId: string, columnKey: string, raw: string, via: CommitVia) => void;
  onCellCancel: (rowId: string, columnKey: string) => void;
  // reordering
  handleHelpId: string;
  onHandleKey: (rowId: string, event: KeyboardEvent<HTMLElement>) => void;
  onDragStart: (rowId: string, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

/** Per-cell edit outcome; `baseRow` is the row object the edit was made on. */
interface CellState<T> {
  status: 'saving' | 'saved' | 'error';
  value: CellValue;
  baseRow: T;
  error?: string;
  token: number;
}

/** What one row needs of the edit state; undefined for most rows. */
interface RowEditView<T> {
  /** Column whose editor is open. */
  editing?: string;
  /** Column whose cell is the table's tab stop. */
  tabStop?: string;
  cells?: Record<string, CellState<T>>;
}

interface RowProps<T> {
  row: T;
  rowId: string;
  index: number;
  columns: readonly DataTableColumn<T>[];
  /** undefined: no selection column. */
  selectable: boolean | undefined;
  selected: boolean;
  clickable: boolean;
  events: RowEvents<T>;
  /** Read while rendering the row; a new function alone does not re-render it. */
  rowActions: ((row: T) => RowAction<T>[]) | undefined;
  rowStyle: ((row: T, index: number) => CSSProperties | undefined) | undefined;
  extraData: unknown;
  measureRef?: (node: HTMLTableRowElement | null) => void;
  virtualIndex?: number;
  /** One per column; null for read-only columns. Undefined: no inline editing. */
  editors: readonly (ColumnEditor<T> | null)[] | undefined;
  rowEditable: boolean;
  edit: RowEditView<T> | undefined;
  isCellDirty: ((row: T, columnKey: string) => boolean) | undefined;
  /** undefined: no handle column; false: this row stays put. */
  draggable: boolean | undefined;
  dragState: 'lifted' | 'dragging' | undefined;
  dropPosition: 'before' | 'after' | undefined;
}

function headerText(header: ReactNode): string {
  return typeof header === 'string' || typeof header === 'number' ? String(header) : 'Değer';
}

function renderCellContent<T>(
  column: DataTableColumn<T>,
  row: T,
  index: number,
  editor: ColumnEditor<T> | null,
): ReactNode {
  if (column.render) return column.render(row, index);
  const value = columnValue(column, row);
  // A select column without render shows the option label, not the stored value.
  if (editor?.type === 'select' && value !== null && value !== undefined) {
    const option = editorOptions(editor, row).find((o) => o.value === String(value));
    if (option) return option.label;
  }
  return displayValue(value);
}

function ActionsCell<T>({
  row,
  actions,
  onAction,
}: {
  row: T;
  actions: RowAction<T>[];
  onAction: RowEvents<T>['onAction'];
}) {
  const visible = actions.filter((action) => !action.hidden);
  // More than three: two icons plus a menu, so the column never grows past three slots.
  const inline = visible.length > 3 ? visible.slice(0, 2) : visible;
  const overflow = visible.length > 3 ? visible.slice(2) : [];
  return (
    <Group gap={4} wrap="nowrap" justify="flex-end">
      {inline.map((action, i) => (
        <Tooltip key={action.key ?? i} label={action.label} withArrow openDelay={300}>
          <ActionIcon
            variant="subtle"
            color="gray"
            className={uiClasses.rowAction}
            data-tone={mantineColor(action.color, 'gray')}
            aria-label={action.label}
            disabled={action.disabled}
            onClick={(event) => {
              event.stopPropagation();
              onAction(row, action);
            }}
          >
            <FaIcon icon={action.icon} />
          </ActionIcon>
        </Tooltip>
      ))}
      {overflow.length > 0 ? (
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Diğer işlemler"
              onClick={(event) => event.stopPropagation()}
            >
              <FaIcon icon="fas fa-ellipsis-v" />
            </ActionIcon>
          </Menu.Target>
          {/* React events bubble out of portals; keep menu clicks off the row. */}
          <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
            {overflow.map((action, i) => (
              <Menu.Item
                key={action.key ?? i}
                color={action.color ? mantineColor(action.color) : undefined}
                disabled={action.disabled}
                leftSection={<FaIcon icon={action.icon} />}
                onClick={() => onAction(row, action)}
              >
                {action.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      ) : null}
    </Group>
  );
}

function RowImpl<T>({
  row,
  rowId,
  index,
  columns,
  selectable,
  selected,
  clickable,
  events,
  rowActions,
  rowStyle,
  measureRef,
  virtualIndex,
  editors,
  rowEditable,
  edit,
  isCellDirty,
  draggable,
  dragState,
  dropPosition,
}: RowProps<T>) {
  return (
    <Table.Tr
      ref={measureRef}
      data-index={virtualIndex}
      data-row-id={rowId}
      data-drop={dropPosition}
      data-drag={dragState}
      className={draggable !== undefined ? tableClasses.reorderRow : undefined}
      bg={selected ? 'var(--mantine-primary-color-light)' : undefined}
      style={{ cursor: clickable ? 'pointer' : undefined, ...rowStyle?.(row, index) }}
      onClick={clickable ? () => events.onRowClick(row, index) : undefined}
    >
      {draggable !== undefined ? (
        <Table.Td
          w={36}
          className={tableClasses.handleCell}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={tableClasses.dragHandle}
            aria-label="Satırı taşı"
            aria-roledescription="sürüklenebilir satır"
            aria-describedby={events.handleHelpId}
            aria-pressed={dragState === 'lifted'}
            disabled={!draggable}
            draggable={draggable}
            data-drag-handle
            onKeyDown={(event) => events.onHandleKey(rowId, event)}
            onDragStart={(event) => events.onDragStart(rowId, event)}
            onDragEnd={events.onDragEnd}
          >
            <FaIcon icon="fas fa-grip-vertical" />
          </button>
        </Table.Td>
      ) : null}
      {selectable !== undefined ? (
        <Table.Td w={40} onClick={(event) => event.stopPropagation()}>
          <Checkbox
            aria-label="Satırı seç"
            checked={selected}
            disabled={!selectable}
            onChange={() => events.onToggle(rowId)}
          />
        </Table.Td>
      ) : null}
      {columns.map((column, ci) => {
        const editor = editors?.[ci] ?? null;
        const enabled = Boolean(editor) && rowEditable && (editor?.enabled?.(row) ?? true);
        if (!editor || !enabled) {
          return (
            <Table.Td key={column.key} data-col={column.key} style={{ textAlign: column.align }}>
              {renderCellContent(column, row, index, editor)}
            </Table.Td>
          );
        }
        if (edit?.editing === column.key) {
          return (
            <Table.Td key={column.key} className={tableClasses.editingCell} data-col={column.key}>
              <CellEditor
                editor={editor}
                row={row}
                initial={toEditorText(editor, editorValue(editor, column, row))}
                label={headerText(column.header)}
                onCommit={(raw, via) => events.onCellCommit(rowId, column.key, raw, via)}
                onCancel={() => events.onCellCancel(rowId, column.key)}
              />
            </Table.Td>
          );
        }
        const state = edit?.cells?.[column.key];
        // A saved or failed edit shows until the page hands over a new row object.
        const live =
          state && (state.status === 'saving' || state.baseRow === row) ? state : undefined;
        const shown =
          live && live.status !== 'error' ? applyCellValue(column, editor, row, live.value) : row;
        const dirty = !live && isCellDirty ? isCellDirty(row, column.key) : false;
        const cellState =
          live?.status === 'saving'
            ? 'saving'
            : live?.status === 'error'
              ? 'error'
              : dirty
                ? 'dirty'
                : undefined;
        return (
          <Table.Td
            key={column.key}
            className={tableClasses.editCell}
            style={{ textAlign: column.align }}
            data-edit-cell
            data-col={column.key}
            data-cell-state={cellState}
            tabIndex={edit?.tabStop === column.key ? 0 : -1}
            aria-label={`${headerText(column.header)}: düzenlemek için Enter`}
            onClick={(event) => {
              // Like legacy, the click edits instead of opening the row.
              event.stopPropagation();
              events.onCellStart(rowId, column.key);
            }}
            onFocus={(event) => {
              if (event.target === event.currentTarget) events.onCellFocus(rowId, column.key);
            }}
            onKeyDown={(event) => events.onCellKey(rowId, column.key, event)}
          >
            <span className={tableClasses.cellInner}>
              <span className={tableClasses.cellValue}>
                {renderCellContent(column, shown, index, editor)}
              </span>
              {cellState === 'saving' ? <Loader size={10} aria-label="Kaydediliyor" /> : null}
              {cellState === 'error' ? (
                <Tooltip label={live?.error ?? 'Düzenleme başarısız'} withArrow>
                  <span
                    className={tableClasses.cellError}
                    role="img"
                    aria-label={live?.error ?? 'Düzenleme başarısız'}
                  >
                    <FaIcon icon="fas fa-exclamation-circle" />
                  </span>
                </Tooltip>
              ) : null}
            </span>
          </Table.Td>
        );
      })}
      {rowActions ? (
        <Table.Td>
          <ActionsCell row={row} actions={rowActions(row)} onAction={events.onAction} />
        </Table.Td>
      ) : null}
    </Table.Tr>
  );
}

// Pages pass inline functions; comparing those by identity would re-render
// every row on every parent render. A row re-renders when its data object,
// columns, selection or extraData change, and then picks up the new functions.
function sameRowProps<T>(a: RowProps<T>, b: RowProps<T>): boolean {
  return (
    a.row === b.row &&
    a.rowId === b.rowId &&
    a.index === b.index &&
    a.columns === b.columns &&
    a.selectable === b.selectable &&
    a.selected === b.selected &&
    a.clickable === b.clickable &&
    a.events === b.events &&
    !a.rowActions === !b.rowActions &&
    !a.rowStyle === !b.rowStyle &&
    a.extraData === b.extraData &&
    a.measureRef === b.measureRef &&
    a.virtualIndex === b.virtualIndex &&
    a.editors === b.editors &&
    a.rowEditable === b.rowEditable &&
    a.edit === b.edit &&
    !a.isCellDirty === !b.isCellDirty &&
    a.draggable === b.draggable &&
    a.dragState === b.dragState &&
    a.dropPosition === b.dropPosition
  );
}

const DataTableRow = memo(RowImpl, sameRowProps) as <T>(props: RowProps<T>) => ReactElement;

function SortIcon({ dir }: { dir: SortDir | null }) {
  const icon =
    dir === 'asc' ? 'fas fa-sort-up' : dir === 'desc' ? 'fas fa-sort-down' : 'fas fa-sort';
  return (
    <FaIcon
      icon={icon}
      style={{ marginLeft: 6, opacity: dir ? 1 : 0.35 }}
      color={dir ? 'var(--mantine-primary-color-filled)' : undefined}
    />
  );
}

function isCells(value: unknown): value is { cells: GroupCells } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !isValidElement(value) &&
    'cells' in (value as object)
  );
}

interface GroupRowProps<T> {
  kind: 'header' | 'footer';
  group: RowGroup<T>;
  content: ReactNode | { cells: GroupCells };
  columns: readonly DataTableColumn<T>[];
  leading: number;
  hasActions: boolean;
  collapsible: boolean;
  onToggle: (groupId: string) => void;
  measureRef?: (node: HTMLTableRowElement | null) => void;
  virtualIndex?: number;
}

/** A group header (legacy group-header row) or a group footer row. */
function GroupRow<T>({
  kind,
  group,
  content,
  columns,
  leading,
  hasActions,
  collapsible,
  onToggle,
  measureRef,
  virtualIndex,
}: GroupRowProps<T>) {
  const toggle =
    kind === 'header' && collapsible ? (
      <UnstyledButton
        className={tableClasses.groupToggle}
        aria-expanded={group.expanded}
        aria-label={group.expanded ? 'Grubu daralt' : 'Grubu genişlet'}
        onClick={(event) => {
          event.stopPropagation();
          onToggle(group.id);
        }}
      >
        <FaIcon icon={group.expanded ? 'fas fa-chevron-down' : 'fas fa-chevron-right'} />
      </UnstyledButton>
    ) : null;
  const indent = { paddingLeft: 12 + group.depth * 18 };
  const rowProps = {
    ref: measureRef,
    'data-index': virtualIndex,
    'data-group-id': group.id,
    'data-group-row': kind,
    'data-depth': group.depth,
    className: kind === 'header' ? tableClasses.groupHeader : tableClasses.groupFooter,
    // Like legacy, the whole header row toggles.
    onClick: kind === 'header' && collapsible ? () => onToggle(group.id) : undefined,
    style: { cursor: kind === 'header' && collapsible ? 'pointer' : undefined },
  };
  if (isCells(content)) {
    return (
      <Table.Tr {...rowProps}>
        {leading > 0 ? <Table.Td colSpan={leading} /> : null}
        {columns.map((column, i) => (
          <Table.Td
            key={column.key}
            style={{ textAlign: column.align, ...(i === 0 ? indent : undefined) }}
          >
            {i === 0 && toggle ? (
              <span className={tableClasses.groupLabel}>
                {toggle}
                {content.cells[column.key]}
              </span>
            ) : (
              content.cells[column.key]
            )}
          </Table.Td>
        ))}
        {hasActions ? (
          <Table.Td style={{ textAlign: 'right' }}>{content.cells._actions}</Table.Td>
        ) : null}
      </Table.Tr>
    );
  }
  return (
    <Table.Tr {...rowProps}>
      <Table.Td colSpan={leading + columns.length + (hasActions ? 1 : 0)} style={indent}>
        <span className={tableClasses.groupLabel}>
          {toggle}
          <span className={tableClasses.groupContent}>{content}</span>
        </span>
      </Table.Td>
    </Table.Tr>
  );
}

function defaultGroupHeader<T>(group: RowGroup<T>, emptyLabel: string): ReactNode {
  const empty = group.value === null || group.value === undefined || group.value === '';
  return (
    <Group gap={8} wrap="nowrap" component="span">
      <strong>{empty ? emptyLabel : displayValue(group.value)}</strong>
      <Badge size="sm" variant="light" color="gray">
        {group.rows.length} kayıt
      </Badge>
    </Group>
  );
}

const cellKey = (rowId: string, columnKey: string) => `${rowId}\u0000${columnKey}`;

interface CellPos {
  rowId: string;
  col: string;
}

/** Keyboard lift for reordering: the order being previewed. */
interface Lift {
  id: string;
  order: string[];
}

/**
 * Replaces components/table/table.js. See types.ts for the options; the
 * legacy names map as: field/label -> key/header, formatter -> render,
 * actions -> rowActions, serverSidePagination -> pagination={{ total, ... }},
 * onSort -> sort={{ sortBy, sortDir, onSortChange }}, selectable -> selection,
 * editable/editableColumns/onEdit -> column `editable` + onCellEdit,
 * groupBy/groupHeaderFormatter -> grouping, draggable/onReorder -> reorder.
 */
export function DataTable<T extends RowData>(props: DataTableProps<T>) {
  const {
    data,
    columns,
    getRowId,
    loading = false,
    skeleton = true,
    skeletonRows = 5,
    pagination,
    sortable = false,
    sort,
    defaultSort,
    rowActions,
    actionsHeader = 'İşlemler',
    onRowClick,
    selection,
    extraData,
    stickyHeader = false,
    virtualize,
    exportable,
    emptyMessage = 'Kayıt bulunamadı',
    footer,
    title,
    filters,
    icon,
    toolbar,
    onRefresh,
    onCellEdit,
    isRowEditable,
    isCellDirty,
    grouping,
    reorder,
    striped = false,
    withColumnBorders = false,
    verticalSpacing = 'sm',
  } = props;

  const visibleColumns = useMemo(
    () => columns.filter((column) => !column.hidden && !column.exportOnly),
    [columns],
  );
  const exportColumns = useMemo(() => columns.filter((column) => !column.hidden), [columns]);
  const virtualOptions = virtualize ? (typeof virtualize === 'object' ? virtualize : {}) : null;
  const server = isServerPagination(pagination) ? pagination : null;
  const paginated = Boolean(pagination) && !virtualOptions;
  const clientOptions = !server && typeof pagination === 'object' ? pagination : {};

  // ---- sorting ----
  const [clientSort, setClientSort] = useState<{ sortBy: string | null; sortDir: SortDir }>(
    defaultSort ?? { sortBy: null, sortDir: 'asc' },
  );
  const sorting = useMemo<SortingState>(
    () =>
      !sort && clientSort.sortBy
        ? [{ id: clientSort.sortBy, desc: clientSort.sortDir === 'desc' }]
        : [],
    [sort, clientSort],
  );

  // ---- client pagination ----
  const [clientPage, setClientPage] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: clientOptions.pageSize ?? 20,
  });
  const pageSize = server ? server.pageSize : clientPage.pageSize;
  const total = server ? server.total : data.length;
  const pageCount = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  // Clamp instead of resetting: a refetch that shrinks the data keeps the user near their page.
  const clientPageIndex = Math.min(clientPage.pageIndex, pageCount - 1);
  const page = server ? server.page : clientPageIndex + 1;
  const paginationState = useMemo<PaginationState>(
    () => ({ pageIndex: clientPageIndex, pageSize: clientPage.pageSize }),
    [clientPageIndex, clientPage.pageSize],
  );

  // ---- table model ----
  const tableColumns = useMemo(
    () =>
      visibleColumns.map((column): ColumnDef<Features, T> => ({
        id: column.key,
        accessorFn: (row: T) => columnValue(column, row),
        sortFn: (a, b, id) => compareValues(a.getValue(id), b.getValue(id)),
      })),
    [visibleColumns],
  );
  const table = useTable({
    features,
    columns: tableColumns,
    data: data as T[],
    getRowId,
    state: { sorting, pagination: paginationState },
    manualSorting: Boolean(sort),
    manualPagination: !paginated || Boolean(server),
    autoResetPageIndex: false,
    rowCount: server ? server.total : undefined,
  });
  const tableRows = table.getRowModel().rows;

  // ---- reordering: a keyboard lift previews the new order ----
  const [lift, setLift] = useState<Lift | null>(null);
  const [mouseDrag, setMouseDrag] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState('');
  const reorderActive = Boolean(reorder) && !(!sort && clientSort.sortBy);
  const rows: BodyRow<T>[] = useMemo(() => {
    if (!lift) return tableRows;
    const at = new Map(lift.order.map((id, i) => [id, i]));
    return [...tableRows].sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0));
  }, [tableRows, lift]);

  // ---- grouping ----
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const collapsibleOption = grouping?.collapsible ?? true;
  const canCollapse = (group: RowGroup<T>) =>
    typeof collapsibleOption === 'function' ? collapsibleOption(group) : collapsibleOption;
  const hasGroupFooter = Boolean(grouping?.footer);
  const groupTree = useMemo<GroupNode<T>[] | null>(
    () => (grouping ? buildGroupTree(rows, groupKeys(grouping), grouping.sort ?? 'asc') : null),
    // The tree depends on the keys and sort, not on the header/footer functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, grouping?.by, grouping?.sort],
  );
  const items: DisplayItem<T>[] = useMemo(() => {
    if (!groupTree || !grouping) {
      return rows.map((row) => ({
        kind: 'row' as const,
        key: row.id,
        row,
        groupId: null,
        depth: 0,
      }));
    }
    const { defaultExpanded = true } = grouping;
    const isExpanded = (node: GroupNode<T>) => {
      const info: RowGroup<T> = {
        id: node.id,
        value: node.value,
        depth: node.depth,
        rows: node.rows.map((r) => r.original),
        expanded: true,
      };
      const initial =
        typeof defaultExpanded === 'function' ? defaultExpanded(info) : defaultExpanded;
      // Like legacy, a group without a toggle stays as it started.
      if (!canCollapse({ ...info, expanded: initial })) return initial;
      return groupOpen[node.id] ?? initial;
    };
    return flattenGroups(groupTree, isExpanded, hasGroupFooter);
    // The items depend on these options, not on the header/footer functions' identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupTree, rows, groupOpen, collapsibleOption, grouping?.defaultExpanded, hasGroupFooter]);
  const bodyRows = useMemo(
    () =>
      items.filter((item): item is Extract<DisplayItem<T>, { kind: 'row' }> => item.kind === 'row'),
    [items],
  );
  const toggleGroup = (groupId: string) => {
    const current = items.find((item) => item.kind === 'group' && item.group.id === groupId);
    const expanded = current?.kind === 'group' ? current.group.expanded : true;
    setGroupOpen((prev) => ({ ...prev, [groupId]: !expanded }));
  };

  // ---- inline editing ----
  const editors = useMemo(
    () => (onCellEdit ? visibleColumns.map((column) => editorOf(column)) : undefined),
    // Only whether there is a handler matters, not its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleColumns, Boolean(onCellEdit)],
  );
  const editableKeys = useMemo(
    () => (editors ? visibleColumns.filter((_, i) => editors[i]).map((c) => c.key) : []),
    [editors, visibleColumns],
  );
  const [editing, setEditing] = useState<CellPos | null>(null);
  const [active, setActive] = useState<CellPos | null>(null);
  const [cellStates, setCellStates] = useState<Record<string, CellState<T>>>({});
  const [focusRequest, setFocusRequest] = useState<(CellPos & { n: number }) | null>(null);
  const tokenRef = useRef(0);

  const rowEditableFor = (row: BodyRow<T>) =>
    !isRowEditable || isRowEditable(row.original, row.index);
  const canEdit = (row: BodyRow<T>, col: string) => {
    if (!editors || !rowEditableFor(row)) return false;
    const ci = visibleColumns.findIndex((c) => c.key === col);
    const editor = editors[ci];
    return Boolean(editor) && (editor?.enabled?.(row.original) ?? true);
  };
  // The tab stop: the last focused cell while its row is on screen, else the first editable cell.
  let tabStop: CellPos | null = null;
  if (editableKeys.length > 0) {
    if (active && bodyRows.some((item) => item.row.id === active.rowId)) tabStop = active;
    else {
      outer: for (const item of bodyRows) {
        for (const col of editableKeys) {
          if (canEdit(item.row, col)) {
            tabStop = { rowId: item.row.id, col };
            break outer;
          }
        }
      }
    }
  }
  const rowEditViews = useMemo(() => {
    const views = new Map<string, RowEditView<T>>();
    const view = (rowId: string) => {
      let v = views.get(rowId);
      if (!v) {
        v = {};
        views.set(rowId, v);
      }
      return v;
    };
    for (const [key, state] of Object.entries(cellStates)) {
      const [rowId = '', col = ''] = key.split('\u0000');
      const v = view(rowId);
      v.cells = { ...v.cells, [col]: state };
    }
    if (editing) view(editing.rowId).editing = editing.col;
    if (tabStop) view(tabStop.rowId).tabStop = tabStop.col;
    return views;
  }, [cellStates, editing, tabStop?.rowId, tabStop?.col]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- row events: one stable object reading the latest props ----
  const handleHelpId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const latest = useLatest({
    rowActions,
    onRowClick,
    selection,
    onCellEdit,
    bodyRows,
    items,
    visibleColumns,
    editors,
    editableKeys,
    canEdit,
    reorder,
    reorderActive,
    lift,
    mouseDrag,
    data,
    getRowId,
  });

  const findRow = (rowId: string) => latest.current.bodyRows.find((item) => item.row.id === rowId);

  /** The next editable cell from `from` in a direction, or null. */
  const neighbour = (
    from: CellPos,
    dir: 'up' | 'down' | 'left' | 'right' | 'next' | 'prev',
  ): CellPos | null => {
    const { bodyRows: list, editableKeys: cols, canEdit: can } = latest.current;
    const r = list.findIndex((item) => item.row.id === from.rowId);
    const c = cols.indexOf(from.col);
    if (r < 0 || c < 0) return null;
    const at = (ri: number, ci: number) => {
      const item = list[ri];
      const col = cols[ci];
      return item && col && can(item.row, col) ? { rowId: item.row.id, col } : null;
    };
    if (dir === 'up' || dir === 'down') {
      const step = dir === 'up' ? -1 : 1;
      for (let ri = r + step; ri >= 0 && ri < list.length; ri += step) {
        const hit = at(ri, c);
        if (hit) return hit;
      }
      return null;
    }
    if (dir === 'left' || dir === 'right') {
      const step = dir === 'left' ? -1 : 1;
      for (let ci = c + step; ci >= 0 && ci < cols.length; ci += step) {
        const hit = at(r, ci);
        if (hit) return hit;
      }
      return null;
    }
    // Tab order: across the row, then on to the next row.
    const step = dir === 'prev' ? -1 : 1;
    let ri = r;
    let ci = c + step;
    while (ri >= 0 && ri < list.length) {
      while (ci >= 0 && ci < cols.length) {
        const hit = at(ri, ci);
        if (hit) return hit;
        ci += step;
      }
      ri += step;
      ci = step > 0 ? 0 : cols.length - 1;
    }
    return null;
  };

  const focusCell = (pos: CellPos) => {
    setActive(pos);
    setFocusRequest({ ...pos, n: Date.now() + Math.random() });
  };

  const commit = (rowId: string, col: string, raw: string, via: CommitVia) => {
    const current = latest.current;
    const item = findRow(rowId);
    const ci = current.visibleColumns.findIndex((c) => c.key === col);
    const column = current.visibleColumns[ci];
    const editor = current.editors?.[ci];
    setEditing(null);
    const next = via === 'next' || via === 'prev' ? neighbour({ rowId, col }, via) : null;
    if (next) {
      setActive(next);
      setEditing(next);
    } else if (via !== 'blur') {
      focusCell({ rowId, col });
    }
    if (!item || !column || !editor || !current.onCellEdit) return;
    const row = item.row.original;
    const parsed = parseEditorText(editor, raw, row);
    const key = cellKey(rowId, col);
    const token = ++tokenRef.current;
    const put = (state: CellState<T> | null) =>
      setCellStates((prev) => {
        const nextStates = { ...prev };
        if (state) nextStates[key] = state;
        else delete nextStates[key];
        return nextStates;
      });
    if (!parsed.ok) {
      notify.error(parsed.error);
      put({ status: 'error', value: null, baseRow: row, error: parsed.error, token });
      return;
    }
    const oldValue = editorValue(editor, column, row);
    if (sameCellValue(oldValue, parsed.value)) {
      put(null);
      return;
    }
    const value = parsed.value;
    const fail = (error: unknown) => {
      setCellStates((prev) => {
        if (prev[key]?.token !== token) return prev;
        return {
          ...prev,
          [key]: {
            status: 'error',
            value,
            baseRow: row,
            error: error instanceof Error && error.message ? error.message : 'Düzenleme başarısız',
            token,
          },
        };
      });
      notify.error(error, { fallback: 'Düzenleme başarısız' });
    };
    let result: void | Promise<unknown>;
    try {
      result = current.onCellEdit({ row, rowId, columnKey: col, value, oldValue });
    } catch (error) {
      fail(error);
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      put({ status: 'saving', value, baseRow: row, token });
      (result as Promise<unknown>).then(
        () =>
          setCellStates((prev) =>
            prev[key]?.token === token
              ? { ...prev, [key]: { status: 'saved', value, baseRow: row, token } }
              : prev,
          ),
        fail,
      );
    } else {
      put({ status: 'saved', value, baseRow: row, token });
    }
  };

  // ---- reordering ----
  const current = () => latest.current;
  const dataIds = () => current().data.map((row, i) => current().getRowId(row, i));
  const groupOf = (rowId: string) =>
    current().bodyRows.find((item) => item.row.id === rowId)?.groupId ?? null;
  const finishMove = (order: string[], id: string) => {
    const { reorder: options, bodyRows: list } = current();
    const before = dataIds();
    if (!options || sameOrder(before, order)) return false;
    // The neighbour in display order within the same group names the drop target.
    const at = new Map(order.map((x, i) => [x, i]));
    const sameGroup = list
      .filter((item) => item.groupId === groupOf(id))
      .map((item) => item.row.id)
      .sort((a, b) => (at.get(a) ?? 0) - (at.get(b) ?? 0));
    const idx = sameGroup.indexOf(id);
    const prev = sameGroup[idx - 1];
    const nextId = sameGroup[idx + 1];
    const targetId = prev ?? nextId ?? id;
    options.onReorder(order, {
      id,
      targetId,
      position: prev ? 'after' : 'before',
      from: before.indexOf(id),
      to: order.indexOf(id),
    });
    return true;
  };
  const focusHandle = (rowId: string) => {
    requestAnimationFrame(() => {
      const tr = [
        ...(scrollRef.current?.querySelectorAll<HTMLElement>('tr[data-row-id]') ?? []),
      ].find((el) => el.dataset.rowId === rowId);
      tr?.querySelector<HTMLElement>('[data-drag-handle]')?.focus();
    });
  };

  const events = useMemo<RowEvents<T>>(
    () => ({
      onRowClick: (row, index) => latest.current.onRowClick?.(row, index),
      onToggle: (rowId) => {
        const sel = latest.current.selection;
        if (!sel) return;
        const ids = sel.selectedIds.includes(rowId)
          ? sel.selectedIds.filter((id) => id !== rowId)
          : [...sel.selectedIds, rowId];
        sel.onChange(ids);
      },
      onAction: (row, rendered) => {
        // The rendered action may come from an older rowActions closure.
        const id = rendered.key ?? rendered.label;
        const fresh = latest.current.rowActions?.(row).find((a) => (a.key ?? a.label) === id);
        (fresh ?? rendered).onClick(row);
      },
      onCellStart: (rowId, col) => {
        setActive({ rowId, col });
        setEditing({ rowId, col });
      },
      onCellFocus: (rowId, col) => setActive({ rowId, col }),
      onCellKey: (rowId, col, event) => {
        const dirs: Record<string, 'up' | 'down' | 'left' | 'right'> = {
          ArrowUp: 'up',
          ArrowDown: 'down',
          ArrowLeft: 'left',
          ArrowRight: 'right',
        };
        if (event.key === 'Enter' || event.key === 'F2') {
          event.preventDefault();
          event.stopPropagation();
          setActive({ rowId, col });
          setEditing({ rowId, col });
          return;
        }
        const dir = dirs[event.key];
        if (!dir) return;
        event.preventDefault();
        const next = neighbour({ rowId, col }, dir);
        if (next) focusCell(next);
      },
      onCellCommit: commit,
      onCellCancel: (rowId, col) => {
        setEditing(null);
        focusCell({ rowId, col });
      },
      handleHelpId,
      onHandleKey: (rowId, event) => {
        const { lift: lifted, reorderActive: on, bodyRows: list, data: rowsData } = latest.current;
        if (!on) return;
        const key = event.key;
        if (!lifted) {
          if (key !== ' ' && key !== 'Enter') return;
          event.preventDefault();
          const order = rowsData.map((row, i) => latest.current.getRowId(row, i));
          setLift({ id: rowId, order });
          const pos = list.findIndex((item) => item.row.id === rowId);
          setAnnouncement(
            `Satır seçildi, konum ${pos + 1} / ${list.length}. Ok tuşlarıyla taşıyın, Boşluk ile bırakın, Escape ile iptal edin.`,
          );
          return;
        }
        if (key === 'Escape') {
          event.preventDefault();
          setLift(null);
          setAnnouncement('Taşıma iptal edildi.');
          focusHandle(rowId);
          return;
        }
        if (key === ' ' || key === 'Enter') {
          event.preventDefault();
          const moved = finishMove(lifted.order, lifted.id);
          setLift(null);
          const pos = list.findIndex((item) => item.row.id === lifted.id);
          setAnnouncement(
            moved
              ? `Satır bırakıldı, yeni konum ${pos + 1} / ${list.length}.`
              : 'Satır yerinde bırakıldı.',
          );
          focusHandle(lifted.id);
          return;
        }
        if (key !== 'ArrowUp' && key !== 'ArrowDown') return;
        event.preventDefault();
        // Swap with the neighbour on screen, inside the same group.
        const group = list.find((item) => item.row.id === lifted.id)?.groupId ?? null;
        const peers = list.filter((item) => item.groupId === group);
        const pos = peers.findIndex((item) => item.row.id === lifted.id);
        const other = peers[key === 'ArrowUp' ? pos - 1 : pos + 1];
        if (!other) return;
        const order = moveId(
          lifted.order,
          lifted.id,
          other.row.id,
          key === 'ArrowUp' ? 'before' : 'after',
        );
        setLift({ id: lifted.id, order });
        const listPos =
          list.findIndex((item) => item.row.id === lifted.id) + (key === 'ArrowUp' ? -1 : 1);
        setAnnouncement(`Konum ${listPos + 1} / ${list.length}.`);
        focusHandle(lifted.id);
      },
      onDragStart: (rowId, event) => {
        if (!latest.current.reorderActive) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', rowId);
        const tr = (event.currentTarget as HTMLElement).closest('tr');
        if (tr && typeof event.dataTransfer.setDragImage === 'function')
          event.dataTransfer.setDragImage(tr, 16, 16);
        setMouseDrag(rowId);
      },
      onDragEnd: () => {
        setMouseDrag(null);
        setDropTarget(null);
      },
    }),
    // commit/neighbour/finishMove read everything through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest, handleHelpId],
  );

  const dragRowAt = (event: DragEvent<HTMLElement>) => {
    const tr = (event.target as HTMLElement).closest<HTMLElement>('tr[data-row-id]');
    const dragged = latest.current.mouseDrag;
    if (!tr || !dragged) return null;
    const id = tr.dataset.rowId ?? '';
    if (id === dragged || groupOf(id) !== groupOf(dragged)) return null;
    const rect = tr.getBoundingClientRect();
    const position: 'before' | 'after' =
      event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    return { id, position };
  };
  const bodyDragProps = reorder
    ? {
        onDragOver: (event: DragEvent<HTMLElement>) => {
          const target = dragRowAt(event);
          if (!target) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDropTarget((prev) =>
            prev?.id === target.id && prev.position === target.position ? prev : target,
          );
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
          const target = dragRowAt(event) ?? dropTarget;
          const dragged = latest.current.mouseDrag;
          setMouseDrag(null);
          setDropTarget(null);
          if (!target || !dragged) return;
          event.preventDefault();
          finishMove(moveId(dataIds(), dragged, target.id, target.position), dragged);
        },
      }
    : {};

  // ---- selection ----
  const selectedSet = useMemo(
    () => new Set(selection?.selectedIds ?? []),
    [selection?.selectedIds],
  );
  const isSelectable = (row: T) => selection?.isRowSelectable?.(row) ?? true;
  const pageSelectableIds = selection
    ? rows.filter((row) => isSelectable(row.original)).map((row) => row.id)
    : [];
  const pageSelectedCount = pageSelectableIds.filter((id) => selectedSet.has(id)).length;
  const allSelected =
    pageSelectableIds.length > 0 && pageSelectedCount === pageSelectableIds.length;
  const toggleAll = () => {
    if (!selection) return;
    if (allSelected) {
      const drop = new Set(pageSelectableIds);
      selection.onChange(selection.selectedIds.filter((id) => !drop.has(id)));
    } else {
      const add = pageSelectableIds.filter((id) => !selectedSet.has(id));
      selection.onChange([...selection.selectedIds, ...add]);
    }
  };

  // ---- virtualization ----
  const virtualizer = useVirtualizer({
    count: virtualOptions ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => virtualOptions?.rowHeight ?? 41,
    overscan: virtualOptions?.overscan ?? 10,
    getItemKey: (i) => items[i]?.key ?? i,
  });

  // Keyboard focus follows the active cell; a virtualized row is scrolled in first.
  useEffect(() => {
    if (!focusRequest) return;
    // Compare attributes instead of building a selector from the ids.
    const find = () => {
      const tr = [
        ...(scrollRef.current?.querySelectorAll<HTMLElement>('tr[data-row-id]') ?? []),
      ].find((el) => el.dataset.rowId === focusRequest.rowId);
      return [...(tr?.querySelectorAll<HTMLElement>('td[data-col]') ?? [])].find(
        (td) => td.dataset.col === focusRequest.col,
      );
    };
    const el = find();
    if (el) {
      el.focus();
      return;
    }
    if (!virtualOptions) return;
    const index = items.findIndex(
      (item) => item.kind === 'row' && item.row.id === focusRequest.rowId,
    );
    if (index < 0) return;
    virtualizer.scrollToIndex(index);
    const frame = requestAnimationFrame(() => find()?.focus());
    return () => cancelAnimationFrame(frame);
    // Only a new request moves focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // ---- sorting interaction ----
  const columnSortable = (column: DataTableColumn<T>) => column.sortable ?? sortable;
  const columnSortDir = (column: DataTableColumn<T>): SortDir | null => {
    if (sort) return sort.sortBy === (column.sortKey ?? column.key) ? sort.sortDir : null;
    return clientSort.sortBy === column.key ? clientSort.sortDir : null;
  };
  const onSortClick = (column: DataTableColumn<T>) => {
    if (sort) {
      const next = nextSort(sort, column.sortKey ?? column.key);
      sort.onSortChange(next.sortBy, next.sortDir);
    } else {
      setClientSort((prev) => nextSort(prev, column.key));
      setClientPage((prev) => ({ ...prev, pageIndex: 0 }));
    }
  };

  // ---- pagination interaction ----
  const changePage = (next: number) => {
    if (server) server.onPageChange(next);
    else setClientPage((prev) => ({ ...prev, pageIndex: next - 1 }));
  };
  const changePageSize = (size: number) => {
    if (server) {
      server.onPageSizeChange?.(size);
      if (server.page !== 1) server.onPageChange(1);
    } else {
      setClientPage({ pageIndex: 0, pageSize: size });
    }
  };
  const pageSizeOptions = useMemo(() => {
    const options =
      (server ? server.pageSizeOptions : clientOptions.pageSizeOptions) ?? DEFAULT_PAGE_SIZES;
    return options.includes(pageSize) ? options : [...options, pageSize].sort((a, b) => a - b);
  }, [server, clientOptions.pageSizeOptions, pageSize]);

  // ---- export ----
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (!exportable) return;
    const exportRows = table.getPrePaginatedRowModel().rows.map((row) => row.original);
    if (exportRows.length === 0) {
      notify.warning('Dışa aktarılacak veri bulunamadı');
      return;
    }
    setExporting(true);
    try {
      const { exportToExcel } = await import('./exportExcel');
      await exportToExcel(exportRows, exportColumns, exportable);
    } catch (error) {
      notify.error(error, { fallback: 'Dışa aktarma sırasında hata oluştu' });
    } finally {
      setExporting(false);
    }
  };

  // ---- body ----
  const hasActions = Boolean(rowActions);
  const leading = (reorder ? 1 : 0) + (selection ? 1 : 0);
  const colSpan = visibleColumns.length + leading + (hasActions ? 1 : 0);
  const noData = data.length === 0;
  const showPlaceholder = loading && noData;
  const clickable = Boolean(onRowClick);
  const draggingId = lift?.id ?? mouseDrag;

  const renderRow = (row: BodyRow<T>, virtualIndex?: number) => (
    <DataTableRow<T>
      key={row.id}
      row={row.original}
      rowId={row.id}
      index={row.index}
      columns={visibleColumns}
      selectable={selection ? isSelectable(row.original) : undefined}
      selected={selectedSet.has(row.id)}
      clickable={clickable}
      events={events}
      rowActions={rowActions}
      rowStyle={props.rowStyle}
      extraData={extraData}
      measureRef={virtualIndex === undefined ? undefined : virtualizer.measureElement}
      virtualIndex={virtualIndex}
      editors={editors}
      rowEditable={editors ? rowEditableFor(row) : false}
      edit={rowEditViews.get(row.id)}
      isCellDirty={isCellDirty}
      draggable={
        reorder ? reorderActive && (reorder.isRowDraggable?.(row.original) ?? true) : undefined
      }
      dragState={draggingId === row.id ? (lift ? 'lifted' : 'dragging') : undefined}
      dropPosition={dropTarget?.id === row.id ? dropTarget.position : undefined}
    />
  );

  const renderItem = (item: DisplayItem<T>, virtualIndex?: number) => {
    if (item.kind === 'row') return renderRow(item.row, virtualIndex);
    const isHeader = item.kind === 'group';
    const content = isHeader
      ? (grouping?.header?.(item.group) ??
        defaultGroupHeader(item.group, grouping?.emptyLabel ?? '-'))
      : grouping?.footer?.(item.group);
    return (
      <GroupRow<T>
        key={item.key}
        kind={isHeader ? 'header' : 'footer'}
        group={item.group}
        content={content}
        columns={visibleColumns}
        leading={leading}
        hasActions={hasActions}
        collapsible={isHeader && canCollapse(item.group)}
        onToggle={toggleGroup}
        measureRef={virtualIndex === undefined ? undefined : virtualizer.measureElement}
        virtualIndex={virtualIndex}
      />
    );
  };

  let body: ReactNode;
  if (showPlaceholder && skeleton) {
    body = Array.from({ length: skeletonRows }, (_, r) => (
      <Table.Tr key={`skeleton-${r}`} data-skeleton-row>
        {Array.from({ length: colSpan }, (_, c) => (
          <Table.Td key={c}>
            <Skeleton height={12} width={`${55 + ((r * 7 + c * 13) % 40)}%`} />
          </Table.Td>
        ))}
      </Table.Tr>
    ));
  } else if (showPlaceholder) {
    body = (
      <Table.Tr>
        <Table.Td colSpan={colSpan}>
          <Stack align="center" gap={4} py="lg">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Yükleniyor...
            </Text>
          </Stack>
        </Table.Td>
      </Table.Tr>
    );
  } else if (rows.length === 0) {
    body = (
      <Table.Tr>
        <Table.Td colSpan={colSpan}>
          <Stack align="center" gap={6} py="xl" c="dimmed">
            <FaIcon icon="fas fa-inbox" size={28} />
            <Text size="sm">{emptyMessage}</Text>
          </Stack>
        </Table.Td>
      </Table.Tr>
    );
  } else if (virtualOptions) {
    // Spacer rows keep a real <table>, so columns stay aligned with the header.
    const virtualItems = virtualizer.getVirtualItems();
    const top = virtualItems[0]?.start ?? 0;
    const bottom = virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0);
    body = (
      <>
        {top > 0 ? (
          <tr aria-hidden style={{ height: top }}>
            <td colSpan={colSpan} style={{ padding: 0, border: 0 }} />
          </tr>
        ) : null}
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          return item ? renderItem(item, virtualItem.index) : null;
        })}
        {bottom > 0 ? (
          <tr aria-hidden style={{ height: bottom }}>
            <td colSpan={colSpan} style={{ padding: 0, border: 0 }} />
          </tr>
        ) : null}
      </>
    );
  } else {
    body = items.map((item) => renderItem(item));
  }

  const scrollHeight = virtualOptions
    ? (virtualOptions.height ?? LEGACY_SCROLL_HEIGHT)
    : stickyHeader === true
      ? LEGACY_SCROLL_HEIGHT
      : stickyHeader || undefined;
  const hasHeader = Boolean(title || filters || icon || toolbar || onRefresh || exportable);
  const pageRows = useMemo(() => tableRows.map((row) => row.original), [tableRows]);
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <section className={uiClasses.panel}>
      {hasHeader ? (
        <div className={uiClasses.panelHead}>
          {filters ?? (
            <h2 className={uiClasses.panelTitle}>
              {icon ? <FaIcon icon={icon} /> : null}
              {title}
            </h2>
          )}
          <Group gap="xs">
            {toolbar}
            {onRefresh ? (
              <Button
                size="xs"
                variant="default"
                onClick={onRefresh}
                leftSection={<FaIcon icon="fas fa-sync-alt" />}
              >
                Yenile
              </Button>
            ) : null}
            {exportable ? (
              <Button
                size="xs"
                variant="default"
                onClick={handleExport}
                loading={exporting}
                leftSection={<FaIcon icon="fas fa-download" />}
              >
                Dışa Aktar
              </Button>
            ) : null}
          </Group>
        </div>
      ) : null}

      {reorder ? (
        <>
          <span id={handleHelpId} className={tableClasses.srOnly}>
            Taşımak için Boşluk tuşuna basın, ok tuşlarıyla yerini seçin, bırakmak için yine Boşluk,
            iptal için Escape.
          </span>
          <span aria-live="assertive" className={tableClasses.srOnly}>
            {announcement}
          </span>
        </>
      ) : null}

      <Box pos="relative" aria-busy={loading}>
        {/* Over the visible box, not the scrolled content; rows stay mounted underneath. */}
        <LoadingOverlay
          visible={loading && !noData}
          zIndex={5}
          overlayProps={{ blur: 0, backgroundOpacity: 0.35 }}
        />
        <Box
          ref={scrollRef}
          style={{
            overflow: 'auto',
            maxHeight: scrollHeight,
            height: virtualOptions ? scrollHeight : undefined,
          }}
        >
          <Table
            stickyHeader={Boolean(scrollHeight)}
            highlightOnHover
            striped={striped}
            withColumnBorders={withColumnBorders}
            verticalSpacing={verticalSpacing}
          >
            <Table.Thead>
              <Table.Tr>
                {reorder ? (
                  <Table.Th w={36}>
                    <span className={tableClasses.srOnly}>Sıra</span>
                  </Table.Th>
                ) : null}
                {selection ? (
                  <Table.Th w={40}>
                    <Checkbox
                      aria-label="Tümünü seç"
                      checked={allSelected}
                      indeterminate={pageSelectedCount > 0 && !allSelected}
                      disabled={pageSelectableIds.length === 0}
                      onChange={toggleAll}
                    />
                  </Table.Th>
                ) : null}
                {visibleColumns.map((column, ci) => {
                  const canSort = columnSortable(column);
                  const dir = canSort ? columnSortDir(column) : null;
                  // Legacy editable-indicator next to the label.
                  const pen = editors?.[ci] ? (
                    <FaIcon
                      icon="fas fa-pen"
                      className={tableClasses.editableMark}
                      style={{ marginLeft: 6 }}
                    />
                  ) : null;
                  return (
                    <Table.Th
                      key={column.key}
                      style={{
                        width: column.width,
                        minWidth: column.width,
                        textAlign: column.align,
                      }}
                      aria-sort={
                        dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined
                      }
                    >
                      {canSort ? (
                        <UnstyledButton
                          onClick={() => onSortClick(column)}
                          fw={500}
                          fz={12}
                          c="inherit"
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          {column.header}
                          {pen}
                          <SortIcon dir={dir} />
                        </UnstyledButton>
                      ) : (
                        <>
                          {column.header}
                          {pen}
                        </>
                      )}
                    </Table.Th>
                  );
                })}
                {hasActions ? (
                  <Table.Th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {actionsHeader}
                  </Table.Th>
                ) : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody {...bodyDragProps}>{body}</Table.Tbody>
            {footer && !showPlaceholder ? (
              <Table.Tfoot>{footer({ rows: pageRows, allRows: data as T[] })}</Table.Tfoot>
            ) : null}
          </Table>
        </Box>
      </Box>

      {paginated ? (
        <div className={uiClasses.panelFoot}>
          <Text size="sm" c="dimmed">
            <FaIcon icon="fas fa-list-alt" style={{ marginRight: 6 }} />
            Sayfa {page} / {pageCount} ({first}-{last} / {total} kayıt)
          </Text>
          <Group gap="md" wrap="wrap">
            {!server || server.onPageSizeChange ? (
              <Group gap={6} wrap="nowrap">
                <Text size="sm">Sayfa başına:</Text>
                <NativeSelect
                  size="xs"
                  aria-label="Sayfa başına"
                  data={pageSizeOptions.map(String)}
                  value={String(pageSize)}
                  onChange={(event) => changePageSize(Number(event.currentTarget.value))}
                />
              </Group>
            ) : null}
            <Pagination
              size="sm"
              total={pageCount}
              value={page}
              onChange={changePage}
              withEdges={pageCount > 3}
              getControlProps={(control) => ({
                'aria-label':
                  control === 'first'
                    ? 'İlk sayfa'
                    : control === 'previous'
                      ? 'Önceki sayfa'
                      : control === 'next'
                        ? 'Sonraki sayfa'
                        : 'Son sayfa',
              })}
            />
          </Group>
        </div>
      ) : null}
    </section>
  );
}
