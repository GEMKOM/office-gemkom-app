# Porting a legacy page to React

How to move one legacy page (`<route>/index.html` + its script) into `web/`.
Every page so far was ported this way; keep to it so the pages stay alike.
The pilot pages are the worked examples:

- Hub page: [`src/pages/sales/SalesHubPage.tsx`](../src/pages/sales/SalesHubPage.tsx) (was `sales/sales.js`)
- List/CRUD page: [`src/pages/sales/customers/`](../src/pages/sales/customers/) (was `sales/customers/`)

## Checklist

1. **Read the whole legacy page first**: its `index.html` (inline styles,
   extra `<script>` tags), its page script and anything only it imports. List
   every behaviour: buttons, modals, URL params, exports, polling, keyboard
   shortcuts. The port should do all of it unless you agree otherwise.
2. **Check nothing else imports its files**:
   `git grep -n "<route>/" -- ':!<route>/*' ':!web/*'`. Shared helpers stay
   where they are until their last legacy user is gone.
3. **API**: add typed functions and hooks under `src/api/` (one module per
   domain). Copy endpoints and params from `apis/*.js` exactly; never call
   `authedFetch` from a page. Reference data (users, customers, machines,
   teams, job orders) already has cached hooks in `src/api/reference/`.
4. **Page**: `src/pages/<section>/<page>/<Name>Page.tsx`, built from `@/ui`
   (table below). Keep labels, field names and validation identical.
5. **Route**: add a lazy route in `src/routes/router.tsx` and the same path in
   `src/routes/migrated-routes.json` (normalized: leading slash, no trailing
   slash). Section landing pages get `handle: { access: 'hub' }`. The router
   test fails if the two lists disagree.
6. **Delete the legacy page**: its `index.html` and the scripts only it used,
   in the same change. The deploy writes the SPA's `index.html` at that path.
7. **Tests**: a `*.test.tsx` next to the page (list renders, filters update
   the URL, create/edit validation and submit, delete confirm). Mock
   `@/api/client`'s `apiFetch`.
8. **Check**: `npm run check`, `npm run test:e2e`, and click through the page
   with `npm run dev` (port 5180) against a local backend.

## Legacy → React

| Legacy | React | Notes |
|---|---|---|
| `guardRoute()` + `initRouteProtection()` | nothing | Every SPA route is guarded by the shell (`RequireRoute`). |
| `initNavbar()` | nothing | The shell renders the navbar. |
| `new HeaderComponent({...})` | `<PageHeader>` (the red band) | `show*Button` flags become `actions`; `backUrl` becomes `backTo`. The breadcrumb comes from the menu tree. |
| `new StatisticsCards(...)` | `PageHeader` `stats` on list pages; `<StatCards>` on dashboards | Pass values; no `updateValues()`. |
| `new FiltersComponent(...)` + `add*Filter()` | `<FilterBar inline filters={[...]}>` in `DataTable`'s `filters` slot + `useUrlFilters(defaults)` | The first text filter is the search box, the rest are pills that apply at once. Applied filters live in the URL (shareable, survive reload). |
| `new TableComponent(...)` + `setLoading`/`updateData` | `<DataTable>` + `useQuery({ placeholderData: keepPreviousData })` | Pass `loading={isFetching}`; rows stay on screen while refetching. |
| `onSort` + `mapSortFieldToOrdering` | `sort={{ sortBy, sortDir, onSortChange }}` + `toOrdering()` | Column `sortKey` replaces the mapping table. |
| `new DisplayModal(...)` + `addSection`/`addField`/`show()` | `<DetailModal opened sections={[...]}>` | Controlled by state, not `show()`/`hide()`. |
| `new EditModal(...)` + `getFormData()` | `<FormModal>` + `useForm` (zod resolver) | Validation in the schema. |
| `new ConfirmationModal(...).show({ onConfirm })` | `if (await confirm({...})) { ... }` | |
| `showNotification(msg, type)` | `notify.success(msg)` / `notify.error(err)` | `notify.error` takes the caught error. |
| `new ModernDropdown(el, { remoteSearch })` | `<SelectRemote search={...}>` | Debounced, cancels stale searches. |
| `new MenuComponent(...)` | `<MenuCards cards={[...]}>` | Cards filter themselves by access. |
| `window.location.href = path` / `navigateTo` | `useAppNavigate()` / `<AppLink to>` | Client-side for React routes, full load for legacy ones. |
| `window.fooHandler = ...` + `onclick="fooHandler(id)"` | a prop or a closure | No globals. |
| module-level `let` state | `useState` / URL params / query cache | Server data belongs in TanStack Query, not in state. |
| `Promise` chains in `DOMContentLoaded` | independent `useQuery` hooks | They run in parallel; no waterfalls. |
| `setInterval` polling | `refetchInterval` | Pause it while the tab is hidden. |
| `toLocaleString('tr-TR')` | `formatDate`, `formatNumber`, `formatCurrency` from `@/lib/format` | |

## Rules

- **No new features in a port.** Fix obvious bugs, say so in the PR, and leave
  the rest for later. Reviewers compare behaviour, not code.
- **Keep the old URLs and query params.** Notification e-mails deep-link to
  them (`?talep=SAT-123`).
- **One render per data change.** Don't copy server data into `useState`; read
  it from the query. Memoize column definitions (`useMemo`) for big tables.
- **Parallel by default.** Requests that don't depend on each other are
  separate queries; mutations invalidate the keys they change instead of
  reloading the page.

## DataTable: editing, grouping, reordering

The legacy table's `editable`, `groupBy` and `draggable` options have
DataTable equivalents, so a page using them ports line by line. Unit tests:
`src/ui/DataTable/{editing,grouping,reorder}.test.tsx`.

### Inline cell editing

| Legacy | React |
|---|---|
| `editable: true` + `editableColumns: ['note']` | `editable` on each editable column |
| column `type: 'number'`, `min`, `max`, `step` | `editable: { type: 'number', min, max, step }` |
| column `type: 'select'`, `options` | `editable: { type: 'select', options }` (options may be `(row) => [...]`) |
| column `type: 'date'` | `editable: { type: 'date' }` (value `'YYYY-MM-DD'`) |
| column `validate(value, row)` | `editable: { validate }`: return a message to refuse |
| `isRowEditable(row)` | `isRowEditable={(row, index) => ...}`; per column `editable: { enabled: (row) => ... }` |
| `onEdit(row, field, newValue, oldValue)` | `onCellEdit={({ row, rowId, columnKey, value, oldValue }) => promise}` |

```tsx
const columns = useMemo<DataTableColumn<Item>[]>(() => [
  { key: 'note', header: 'Not', editable: true },
  { key: 'qty', header: 'Miktar', editable: { type: 'number', min: 0, step: 0.5 } },
], []);

<DataTable
  data={rows}
  columns={columns}
  getRowId={(r) => String(r.id)}
  isRowEditable={(r) => !r.is_paid}
  onCellEdit={({ row, columnKey, value }) =>
    patchItem.mutateAsync({ id: row.id, [columnKey]: value })}
/>
```

- **Values are typed**: number editors hand over a number (`null` when
  emptied; `1,5` and `1.234,5` are read the Turkish way), dates a
  `'YYYY-MM-DD'` string or `null`, text and select a string. Legacy `onEdit`
  got the raw input string; drop the `parseFloat` when porting.
- **Click** a cell (or focus it and press **Enter**/**F2**) to edit. **Enter**
  saves, **Escape** cancels, **Tab**/**Shift+Tab** save and open the next or
  previous editable cell, leaving the cell (blur) saves, like legacy. Arrow
  keys move between editable cells; the table is one tab stop.
- **Optimistic**: while the returned promise runs the cell shows the new value
  and a spinner (`data-cell-state="saving"`). If it rejects, the old value
  comes back, the cell turns red with the message in a tooltip
  (`data-cell-state="error"`) and an error toast shows (legacy
  `showNotification`). On success the new value stays until the page hands
  over a new row object, so invalidate or `setQueryData` as usual. An
  unchanged value does not call `onCellEdit`.
- **Optimistic display**: the cell renders the row with `accessor` (or `key`)
  set to the value. For a function accessor or nested field, give
  `editable: { apply: (row, value) => ({ ...row, ... }) }`.
- **Draft editors** that save later with a button (multi-row create forms):
  keep the rows in state, update them in `onCellEdit` (no promise), and mark
  changed cells with `isCellDirty={(row, key) => ...}` (`data-cell-state="dirty"`).
- An editable cell's click does not fire `onRowClick` (legacy stopped it too).
  A select column without `render` shows the option label.

### Grouped rows

| Legacy | React |
|---|---|
| `groupBy: 'user_id'` | `grouping={{ by: 'user_id' }}`, or a function, or several keys `by: ['month', 'user']` (nested) |
| `groupHeaderFormatter(value, rows)` returning HTML | `header: (group) => <node />` (`group.value`, `group.rows`, `group.depth`) |
| `groupHeaderFormatter` returning `{ field: html, _actions }` | `header: (group) => ({ cells: { field: node, _actions: node } })` |
| `groupCollapsible` | `collapsible` (default **true**) |
| `defaultGroupExpanded` | `defaultExpanded` (boolean or `(group) => boolean`) |
| `groupSortDirection` | `sort: 'asc' \| 'desc' \| false \| (a, b) => n` (natural order, empties last) |
| (none) | `footer: (group) => ({ cells: { hours: sum(group.rows) } })`: a totals row after each group |

- Sorting a column sorts rows **inside** their groups; the groups keep their
  own order.
- With client pagination the groups are built from the current page; grouped
  reports normally have `pagination` off.
- The whole-table `footer` still works for a grand total.
- A column the export needs but the screen doesn't (the group's user, say)
  gets `exportOnly: true` (legacy pages patched `prepareExportData` for this).

### Drag to reorder

`draggable: true` + `onReorder(draggedKey, targetKey, position)` becomes
`reorder={{ onReorder: (ids, move) => ... }}`. `ids` is every row id of
`data` in the new order; `move` has `id`, `targetId`, `position`
(`'before' | 'after'`), `from` and `to`, so legacy handlers port as
`onReorder: (_, m) => handle(m.id, m.targetId, m.position)`.

- A grip column comes first. Drag it with the mouse, or focus it and press
  **Space** to pick the row up, **↑/↓** to move it (the table previews the
  new order), **Space** to drop, **Escape** to cancel. Moves are announced to
  screen readers.
- The page owns the order: save it, then pass the reordered `data`.
- Rows move only within their group. `isRowDraggable(row)` pins rows; the
  handles are off while a column sort is active.

All three work with `virtualize`: groups and footers are virtual rows, and
keyboard moves scroll the target cell into view.
