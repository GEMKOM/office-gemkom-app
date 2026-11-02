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
