# Building pages

How pages are built in `web/`. Every page of the app was ported from the old
multi-page site this way; new pages follow the same pattern so they stay
alike. The worked examples:

- Hub page: [`src/pages/sales/SalesHubPage.tsx`](../src/pages/sales/SalesHubPage.tsx)
- List/CRUD page: [`src/pages/sales/customers/`](../src/pages/sales/customers/)

See the [README](../../README.md) for the layout, the commands and the deploy.

## Adding a page

1. **API**: typed functions and query options under `src/api/<domain>/` (one
   module per resource; search `src/api` first, most resources already have
   one). Pages reach the backend through these modules, which use `apiFetch` /
   `apiUpload` from `@/api/client`; never `fetch` or `authedFetch` in a
   page. Reference data (users, customers, machines, teams, job orders) has
   cached hooks in `src/api/reference/`.
2. **Page**: `src/pages/<section>/<page>/<Name>Page.tsx`, built from `@/ui`
   (table below).
3. **Route**: a lazy route in `src/routes/router.tsx` and the same path in
   `src/routes/migrated-routes.json` (leading slash, no trailing slash). Section
   landing pages get `handle: { access: 'hub' }`. The router test fails if the
   two lists disagree; the e2e smoke test opens every listed route.
4. **Menu and access**: add the page to `src/shell/navigationStructure.ts`.
   Who may open it comes from its `Page: /route/` grant (a backend migration
   adds the permission); exceptions go in `src/auth/accessControl.ts`. A
   report also gets an entry in `src/routes/reportCatalog.ts`.
5. **Moving a page** to a new URL: add old → new to `src/routes/movedRoutes.ts`.
   The old URL forwards with its query and hash, and the old grant keeps
   opening it.
6. **Tests**: a `*.test.tsx` next to the page (list renders, filters update
   the URL, create/edit validation and submit, delete confirm). Mock
   `@/api/client`'s `apiFetch`, or the backend with MSW.
7. **Check**: `npm run check`, `npm run test:e2e`, and click through the page
   with `npm run dev` (port 5180) against a local backend.

## Building blocks

| Need | Use | Notes |
|---|---|---|
| Sign-in, route guard | nothing | The shell guards every route (`RequireRoute`); a signed-out visitor goes to `/login/` and comes back after. |
| Navbar, breadcrumb | nothing | The shell renders the rail and top bar from the menu tree. |
| Page title, actions, back arrow | `<PageHeader>` (the red band) | The breadcrumb and back arrow come from the menu tree; `backTo` only for a page the menu does not place or a view inside the page. |
| Figures | `PageHeader` `stats` on list pages; `<StatCards>` on dashboards | |
| Filters | `<FilterBar inline filters={[...]}>` in `DataTable`'s `filters` slot + `useUrlFilters(defaults)` | The first text filter is the search box, the rest are pills that apply at once. Applied filters live in the URL (shareable, survive reload). |
| A table | `<DataTable>` + `useQuery({ placeholderData: keepPreviousData })` | Pass `loading={isFetching}`; rows stay on screen while refetching. |
| Server-side sorting | `sort={{ sortBy, sortDir, onSortChange }}` + `toOrdering()` | Column `sortKey` names the API field. |
| A record's details | `<DetailModal opened sections={[...]}>` | Controlled by state. |
| A form | `<FormModal>` + `useForm` (zod resolver) | Validation in the schema. |
| "Are you sure?" | `if (await confirm({...})) { ... }` | |
| Toasts | `notify.success(msg)` / `notify.error(err)` | `notify.error` takes the caught error. |
| A searchable remote select | `<SelectRemote search={...}>` | Debounced, cancels stale searches. |
| Hub cards | `<MenuCards cards={[...]}>` | Cards filter themselves by access. |
| A link or navigation | `<AppLink to>` / `useAppNavigate()` | |
| Server data | TanStack Query, not `useState` | Mutations invalidate the keys they change. |
| Polling | `refetchInterval` | Pause it while the tab is hidden. |
| Dates, numbers, money | `formatDate`, `formatNumber`, `formatCurrency` from `@/lib/format` | |
| Files on a record | `<FileAttachments files onUpload onDelete>` | Map API rows to `AttachmentFile`; see below. |
| A file preview | `<FileViewer files index onIndexChange onClose>` | FileAttachments opens it itself. |
| Stored comment text | `<RichText content mentionedUsers mentionedGroups>` | Never set other HTML. |
| A comment box | `<RichTextEditor value onChange>` | Works with `form.getInputProps(field)`. |
| A topic with its comments | `<TopicDiscussion topicId>` from `@/pages/shared/topic-discussion/TopicDiscussion` | |
| "Tümünü İndir (ZIP)" | `downloadFilesAsZip(files, name)` from `@/ui` | No library; stored zip. |
| A PDF of what is on screen | `exportElementToPdf` / `exportPagesToPdf` from `@/lib/pdfExport` | html2canvas + jsPDF load from the CDN on first use. |
| A timeline | `<Gantt>` from `@/ui` | |

## Attachments, file preview and rich text

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
same HTML the old site rendered (its tests were ported). Pass the API's
`mentioned_users_data` and `mentioned_groups_data`; a group badge opens its
member list. `renderRichText()` escapes everything first and only adds its own
tags: it is the one string the app may give `dangerouslySetInnerHTML`, and
`richTextToPlain()` makes a one-line excerpt.

**RichTextEditor** is the WYSIWYG box: toolbar, typed markers, `@` suggestions
for people and groups, a raw-text view. Its value is the stored markdown-lite,
so it drops into a form like a textarea. Pasted HTML goes through the
serializer and the renderer, so nothing pasted survives as markup.

### The Tahmin report

The Tahmin card (`src/pages/projects/estimate-report/`) is plain React: the
sections of a finished report are JSX (`ReportSections.tsx`,
`LaborSection.tsx`, `PlanTables.tsx`, data from `reportModel.ts`), and the
model-written markdown goes through `Markdown.tsx`, which builds React
elements, not an HTML string. So `renderRichText()` stays the only string the
app gives `dangerouslySetInnerHTML`. The markup keeps the old card's `est-*`
class names; `EstimateReport.module.css` styles them under its `.scope`
class only (the card's root, and a wrapper in the Referanslar modals that
show the plan tables and the "Nasıl çalışır?" text).

## Rules

- **Keep the old URLs and query params.** Notification e-mails deep-link to
  them (`?talep=SAT-123`).
- **One render per data change.** Don't copy server data into `useState`; read
  it from the query. Memoize column definitions (`useMemo`) for big tables.
- **Parallel by default.** Requests that don't depend on each other are
  separate queries; mutations invalidate the keys they change instead of
  reloading the page.

## DataTable: fitting the screen

Tables are compact by default (6px cell padding, 13px text, small pills) and
headers wrap before the table scrolls sideways. A table should fit a 1440px
screen without scrolling, and nearly fit 1366px:

- **Long text:** `maxWidth` on the column ends it in "…" and shows it all on
  hover (`cellTitle` overrides the hover text). Use a clamp, e.g.
  `maxWidth: 'clamp(160px, 16vw, 360px)'`, so wide screens show more.
- **Fixed `width`s are minimums** (the header gets `min-width`); don't add them
  to text columns, and never percentages that sum past 100%.
- **Too many columns:** `hideBelow: 1600` starts a column hidden on narrower
  screens; the Sütunlar menu ("Sütunlar (2 gizli)") shows it again, and
  `columnsKey="page-name"` remembers the user's choice. A table `footer` lines
  up with `ctx.columns`, the columns on screen.
- Don't clip pill columns: a pill has no "…". Shorten the label instead and put
  the full text in a `title`.

## DataTable: editing, grouping, reordering

DataTable edits cells in place, groups rows and reorders them by drag. Unit tests:
`src/ui/DataTable/{editing,grouping,reorder}.test.tsx`; live demos at
`/react-preview/ui` (dev only). Screenshots:
[editing](img/datatable-editing.png), [saving](img/datatable-edit-saving.png),
[grouped report](img/datatable-grouping.png), [group footers](img/datatable-group-footers.png),
[reorder](img/datatable-reorder.png).

### Inline cell editing

| Want | Column / table option |
|---|---|
| an editable column | `editable` on each editable column |
| a number | `editable: { type: 'number', min, max, step }` |
| a choice | `editable: { type: 'select', options }` (options may be `(row) => [...]`) |
| a date | `editable: { type: 'date' }` (value `'YYYY-MM-DD'`) |
| multi-line text | `editable: { type: 'textarea' }` (Enter is a new line, Ctrl/Cmd+Enter saves) |
| validation | `editable: { validate }`: return a message to refuse |
| rows or cells that may not be edited | `isRowEditable={(row, index) => ...}`; per column `editable: { enabled: (row) => ... }` |
| saving | `onCellEdit={({ row, rowId, columnKey, value, oldValue }) => promise}` |

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
  `'YYYY-MM-DD'` string or `null`, text and select a string.
  `editable: { type: 'number', parse }` replaces the reading when a field
  reads numbers its own way (the sales cost table's price takes every
  dot as a thousands separator, so `90.000` is 90000).
- **Click** a cell (or focus it and press **Enter**/**F2**) to edit. **Enter**
  saves, **Escape** cancels, **Tab**/**Shift+Tab** save and open the next or
  previous editable cell, leaving the cell (blur) saves. Arrow
  keys move between editable cells; the table is one tab stop.
- **Optimistic**: while the returned promise runs the cell shows the new value
  and a spinner (`data-cell-state="saving"`). If it rejects, the old value
  comes back, the cell turns red with the message in a tooltip
  (`data-cell-state="error"`) and an error toast shows. On success the new value stays until the page hands
  over a new row object, so invalidate or `setQueryData` as usual. An
  unchanged value does not call `onCellEdit`.
- **Optimistic display**: the cell renders the row with `accessor` (or `key`)
  set to the value. For a function accessor or nested field, give
  `editable: { apply: (row, value) => ({ ...row, ... }) }`.
- **Draft editors** that save later with a button (multi-row create forms):
  keep the rows in state, update them in `onCellEdit` (no promise), and mark
  changed cells with `isCellDirty={(row, key) => ...}` (`data-cell-state="dirty"`).
- An editable cell's click does not fire `onRowClick`.
  A select column without `render` shows the option label.

### Grouped rows

| Want | `grouping` option |
|---|---|
| group by a field | `grouping={{ by: 'user_id' }}`, or a function, or several keys `by: ['month', 'user']` (nested) |
| a group header | `header: (group) => <node />` (`group.value`, `group.rows`, `group.depth`) |
| header cells per column | `header: (group) => ({ cells: { field: node, _actions: node } })` |
| open/close groups | `collapsible` (default **true**; or `(group) => boolean`: a group without a toggle stays as `defaultExpanded` set it) |
| groups open at first | `defaultExpanded` (boolean or `(group) => boolean`) |
| group order | `sort: 'asc' \| 'desc' \| false \| (a, b) => n` (natural order, empties last) |
| group totals | `footer: (group) => ({ cells: { hours: sum(group.rows) } })`: a totals row after each group |

- Sorting a column sorts rows **inside** their groups; the groups keep their
  own order.
- With client pagination the groups are built from the current page; grouped
  reports normally have `pagination` off.
- The whole-table `footer` still works for a grand total.
- A column the export needs but the screen doesn't (the group's user, say)
  gets `exportOnly: true`.

### Drag to reorder

`reorder={{ onReorder: (ids, move) => ... }}`. `ids` is every row id of
`data` in the new order; `move` has `id`, `targetId`, `position`
(`'before' | 'after'`), `from` and `to`.

- A grip column comes first. Drag it with the mouse, or focus it and press
  **Space** to pick the row up, **↑/↓** to move it (the table previews the
  new order), **Space** to drop, **Escape** to cancel. Moves are announced to
  screen readers.
- The page owns the order: save it, then pass the reordered `data`.
- Rows move only within their group. `isRowDraggable(row)` pins rows; the
  handles are off while a column sort is active.

All three work with `virtualize`: groups and footers are virtual rows, and
keyboard moves scroll the target cell into view.
