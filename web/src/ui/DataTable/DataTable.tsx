import {
  ActionIcon,
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
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { formatDate } from '@/lib/format';
import { FaIcon } from '../FaIcon';
import { notify } from '../notify';
import { mantineColor } from '../StatCards';
import uiClasses from '../ui.module.css';
import { columnValue, compareValues, nextSort } from './sorting';
import type {
  DataTableColumn,
  DataTableProps,
  RowAction,
  RowData,
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
}: RowProps<T>) {
  return (
    <Table.Tr
      ref={measureRef}
      data-index={virtualIndex}
      data-row-id={rowId}
      bg={selected ? 'var(--mantine-primary-color-light)' : undefined}
      style={{ cursor: clickable ? 'pointer' : undefined, ...rowStyle?.(row, index) }}
      onClick={clickable ? () => events.onRowClick(row, index) : undefined}
    >
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
      {columns.map((column) => (
        <Table.Td key={column.key} style={{ textAlign: column.align }}>
          {column.render ? column.render(row, index) : displayValue(columnValue(column, row))}
        </Table.Td>
      ))}
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
    a.virtualIndex === b.virtualIndex
  );
}

const DataTableRow = memo(RowImpl, sameRowProps) as <T>(props: RowProps<T>) => ReactElement;

function SortIcon({ dir }: { dir: SortDir | null }) {
  const icon = dir === 'asc' ? 'fas fa-sort-up' : dir === 'desc' ? 'fas fa-sort-down' : 'fas fa-sort';
  return (
    <FaIcon
      icon={icon}
      style={{ marginLeft: 6, opacity: dir ? 1 : 0.35 }}
      color={dir ? 'var(--mantine-primary-color-filled)' : undefined}
    />
  );
}

/**
 * Replaces components/table/table.js. See types.ts for the options; the
 * legacy names map as: field/label -> key/header, formatter -> render,
 * actions -> rowActions, serverSidePagination -> pagination={{ total, ... }},
 * onSort -> sort={{ sortBy, sortDir, onSortChange }}, selectable -> selection.
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
    striped = false,
    withColumnBorders = false,
    verticalSpacing = 'sm',
  } = props;

  const visibleColumns = useMemo(() => columns.filter((column) => !column.hidden), [columns]);
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
      visibleColumns.map(
        (column): ColumnDef<Features, T> => ({
          id: column.key,
          accessorFn: (row: T) => columnValue(column, row),
          sortFn: (a, b, id) => compareValues(a.getValue(id), b.getValue(id)),
        }),
      ),
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
  const rows = table.getRowModel().rows;

  // ---- row events: one stable object reading the latest props ----
  const latest = useLatest({ rowActions, onRowClick, selection });
  const events = useMemo<RowEvents<T>>(
    () => ({
      onRowClick: (row, index) => latest.current.onRowClick?.(row, index),
      onToggle: (rowId) => {
        const current = latest.current.selection;
        if (!current) return;
        const ids = current.selectedIds.includes(rowId)
          ? current.selectedIds.filter((id) => id !== rowId)
          : [...current.selectedIds, rowId];
        current.onChange(ids);
      },
      onAction: (row, rendered) => {
        // The rendered action may come from an older rowActions closure.
        const id = rendered.key ?? rendered.label;
        const fresh = latest.current.rowActions?.(row).find((a) => (a.key ?? a.label) === id);
        (fresh ?? rendered).onClick(row);
      },
    }),
    [latest],
  );

  // ---- selection ----
  const selectedSet = useMemo(() => new Set(selection?.selectedIds ?? []), [selection?.selectedIds]);
  const isSelectable = (row: T) => selection?.isRowSelectable?.(row) ?? true;
  const pageSelectableIds = selection
    ? rows.filter((row) => isSelectable(row.original)).map((row) => row.id)
    : [];
  const pageSelectedCount = pageSelectableIds.filter((id) => selectedSet.has(id)).length;
  const allSelected = pageSelectableIds.length > 0 && pageSelectedCount === pageSelectableIds.length;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: virtualOptions ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => virtualOptions?.rowHeight ?? 41,
    overscan: virtualOptions?.overscan ?? 10,
    getItemKey: (i) => rows[i]?.id ?? i,
  });

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
    const options = (server ? server.pageSizeOptions : clientOptions.pageSizeOptions) ?? DEFAULT_PAGE_SIZES;
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
      await exportToExcel(exportRows, visibleColumns, exportable);
    } catch (error) {
      notify.error(error, { fallback: 'Dışa aktarma sırasında hata oluştu' });
    } finally {
      setExporting(false);
    }
  };

  // ---- body ----
  const hasActions = Boolean(rowActions);
  const colSpan = visibleColumns.length + (selection ? 1 : 0) + (hasActions ? 1 : 0);
  const noData = data.length === 0;
  const showPlaceholder = loading && noData;
  const clickable = Boolean(onRowClick);

  const renderRow = (row: (typeof rows)[number], virtualIndex?: number) => (
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
    />
  );

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
    const items = virtualizer.getVirtualItems();
    const top = items[0]?.start ?? 0;
    const bottom = virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0);
    body = (
      <>
        {top > 0 ? (
          <tr aria-hidden style={{ height: top }}>
            <td colSpan={colSpan} style={{ padding: 0, border: 0 }} />
          </tr>
        ) : null}
        {items.map((item) => {
          const row = rows[item.index];
          return row ? renderRow(row, item.index) : null;
        })}
        {bottom > 0 ? (
          <tr aria-hidden style={{ height: bottom }}>
            <td colSpan={colSpan} style={{ padding: 0, border: 0 }} />
          </tr>
        ) : null}
      </>
    );
  } else {
    body = rows.map((row) => renderRow(row));
  }

  const scrollHeight = virtualOptions
    ? (virtualOptions.height ?? LEGACY_SCROLL_HEIGHT)
    : stickyHeader === true
      ? LEGACY_SCROLL_HEIGHT
      : stickyHeader || undefined;
  const hasHeader = Boolean(title || filters || icon || toolbar || onRefresh || exportable);
  const pageRows = useMemo(() => rows.map((row) => row.original), [rows]);
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

      <Box pos="relative" aria-busy={loading}>
        {/* Over the visible box, not the scrolled content; rows stay mounted underneath. */}
        <LoadingOverlay visible={loading && !noData} zIndex={5} overlayProps={{ blur: 0, backgroundOpacity: 0.35 }} />
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
                {visibleColumns.map((column) => {
                  const canSort = columnSortable(column);
                  const dir = canSort ? columnSortDir(column) : null;
                  return (
                    <Table.Th
                      key={column.key}
                      style={{ width: column.width, minWidth: column.width, textAlign: column.align }}
                      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
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
                          <SortIcon dir={dir} />
                        </UnstyledButton>
                      ) : (
                        column.header
                      )}
                    </Table.Th>
                  );
                })}
                {hasActions ? (
                  <Table.Th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{actionsHeader}</Table.Th>
                ) : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{body}</Table.Tbody>
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
