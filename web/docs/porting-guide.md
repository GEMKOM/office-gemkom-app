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
