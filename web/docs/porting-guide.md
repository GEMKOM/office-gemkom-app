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
| `new FileAttachments(...)` + `setFiles()` | `<FileAttachments files onUpload onDelete>` | Map API rows to `AttachmentFile`; see below. |
| `new FileViewer().openFile(url, name, ext)` | `<FileViewer files index onIndexChange onClose>` | FileAttachments opens it itself. |
| `renderRichText(text, opts)` into `innerHTML` | `<RichText content mentionedUsers mentionedGroups>` | Never set other HTML. |
| `attachRichTextEditor(textarea)` | `<RichTextEditor value onChange>` | Works with `form.getInputProps(field)`. |
| `mountTopicDiscussion(root, topicId)` | `<TopicDiscussion topicId>` from `@/pages/shared/topic-discussion/TopicDiscussion` | Topic text, files, comments, posting and editing. |
| JSZip "Tümünü İndir (ZIP)" | `downloadFilesAsZip(files, name)` from `@/ui` | No library; stored zip. |

## Attachments, file preview and rich text

Three shared blocks replace `components/file-attachments`, `components/file-viewer`
and `utils/richText.js` + `utils/richTextEditor.js`. The legacy files stay until
their last legacy page is gone.

**FileAttachments** shows a record's files and takes the page's own endpoints:

```tsx
const files = useQuery(issueFilesQueryOptions(issue.id));
<FileAttachments
  title="Dosyalar"
  files={(files.data ?? []).map(toAttachmentFile)} // AttachmentFile: url, name, size, uploadedBy, ...
  loading={files.isPending}
  error={files.error}
  readOnly={!canEdit}
  onUpload={(file, { onProgress, signal }) => uploadIssueFile(issue.id, file, { onProgress, signal })}
  onUploaded={({ uploaded, failed }) => { /* notify, then */ void files.refetch(); }}
  onDelete={(file) => deleteIssueFile.mutateAsync(file.id)}  // the confirm is built in
/>
```

- Write the upload call with `apiUpload(path, formData, { onProgress, signal })`
  from `@/api/client`: it reports progress (XMLHttpRequest) and falls back to
  `apiFetch` for a token refresh.
- Files upload one at a time; a failed one stays in the queue with its error,
  **Tekrar dene** and **Kaldır**. `maxSize` refuses big files before upload.
- When a page uploads with extra fields (İSG's file type and title), keep its
  form and use `FileDropzone` + `useUploadQueue` + `UploadQueueList` in it.
- `downloadFile(url, name)` and `downloadFilesAsZip(files, name)` replace the
  per-page download and JSZip code.

**FileViewer** previews images (zoom: buttons, `+` `-` `0`), PDFs, video and
plain text in a modal; other types get a download card. `←` `→` move between
files, Escape closes. Use it directly only for files that are not in a
FileAttachments list.

**RichText** renders stored comment text: `**kalın**`, `*italik*`, `~~çizili~~`,
`` `kod` ``, `!!kritik!!`, `++olumlu++`, lists, links and `@mention` badges, the
same HTML the legacy renderer makes (its tests are ported). Pass the API's
`mentioned_users_data` and `mentioned_groups_data`; a group badge opens its
member list. `renderRichText()` escapes everything first and only adds its own
tags: it is the one string the app may give `dangerouslySetInnerHTML`, and
`richTextToPlain()` makes a one-line excerpt.

**RichTextEditor** is the WYSIWYG box: toolbar, typed markers, `@` suggestions
for people and groups, a raw-text view. Its value is the stored markdown-lite,
so it drops into a form like a textarea. Pasted HTML goes through the
serializer and the renderer, so nothing pasted survives as markup.

### Exception: the Tahmin report (`EstimateHtml`)

`renderRichText()` is not the only HTML string the app puts into the page.
The Tahmin report card (`src/pages/projects/estimate-report/`) is React for
its state, requests and actions, but a finished report's sections come from
the legacy `components/estimate-report/report-view.js` builders through one
`<EstimateHtml html>` component. The legacy offers and project-tracking
modals mount the same card, and the report changes often; one source keeps
both sides in step. The builders escape every payload value and send markdown
through `utils/markdownLite.js` (escape first), the same contract as
`renderRichText`. Rules:

- Only report-view.js output goes into `EstimateHtml`; nothing else may use it.
- Clicks inside it are handled by event delegation on `data-est-action` /
  `data-est-goto`, as the legacy card did.
- The few Bootstrap classes the markup uses are restyled in
  `EstimateReport.module.css` under the card's root class only.
- When offers and project tracking move to React, port the builders to JSX
  and delete `EstimateHtml`.

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
`src/ui/DataTable/{editing,grouping,reorder}.test.tsx`; live demos at
`/react-preview/ui` (dev only). Screenshots:
[editing](img/datatable-editing.png), [saving](img/datatable-edit-saving.png),
[grouped report](img/datatable-grouping.png), [group footers](img/datatable-group-footers.png),
[reorder](img/datatable-reorder.png).

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
| `groupCollapsible` | `collapsible` (default **true**; or `(group) => boolean`: a group without a toggle stays as `defaultExpanded` set it, like legacy) |
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
