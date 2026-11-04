# GEMKOM Ofis

The office app at **https://ofis.gemcore.com.tr**: one React single-page app
(Vite, React 19, TypeScript strict, Mantine 9, TanStack Query, React Router)
talking to the GEMKOM backend. Everything lives in [`web/`](web/).

## Layout

| Path | What it is |
|---|---|
| `web/src/main.tsx`, `web/src/app/` | Entry: providers (Mantine theme, query client, auth), the router |
| `web/src/routes/` | `router.tsx` (every page, lazy-loaded), `migrated-routes.json` (the same paths; the router test keeps them in step), `movedRoutes.ts` (old URLs that forward), `reportCatalog.ts` (the Rapor Merkezi) |
| `web/src/auth/` | `authService.ts` (sign-in, tokens, refresh, impersonation, permission cache), `accessControl.ts` (who may open which route), `AuthProvider`, `RequireRoute` |
| `web/src/shell/` | The signed-in frame: rail, top bar, bell, `navigationStructure.ts` (the menu tree), `AppLink` |
| `web/src/pages/<section>/<page>/` | One folder per page, with its tests |
| `web/src/api/<domain>/` | Typed endpoint functions and TanStack Query options; `client.ts` is the one fetch wrapper |
| `web/src/ui/` | Shared building blocks: `PageHeader`, `DataTable`, `FilterBar`, modals, `FileAttachments`, `RichText`, `Gantt`, charts |
| `web/src/neo/` | Neo, the assistant panel, and the morning daily summary |
| `web/static/` | Files published at the site root as they are (`CNAME`, `/images/…`) |
| `web/e2e/` | Playwright tests against the assembled site |
| `web/scripts/` | `assemble.mjs` (builds `_site`), `serve-site.mjs` (serves it like GitHub Pages) |
| `web/docs/porting-guide.md` | How pages are built: the checklist, the shared blocks, the rules |

## Working on it

```sh
cd web
npm ci
npm run dev            # http://localhost:5180, against a backend on 127.0.0.1:8001
npm run check          # typecheck + lint + unit tests (Vitest)
npm run test:e2e       # build + assemble + Playwright (installed Chrome)
```

A page served from `localhost` or `127.0.0.1` talks to `http://127.0.0.1:8001`;
anything else talks to production (`src/lib/backend.ts`).

## Deploy

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):
checks, `npm run build`, `npm run assemble`, then GitHub Pages (source: GitHub
Actions). `assemble` writes `<repo>/_site`:

- `web/static/*` at the root,
- the Vite build under `/app-assets/` (hashed file names, so browsers keep them
  cached across deploys; the library chunks change least),
- the SPA's one `index.html`, written at the root, into every route of
  `src/routes/migrated-routes.json` as `<route>/index.html`, and as `/404.html`.

GitHub Pages has no rewrites. Every known URL (moved and merged-report ones
included) has its own copy of the entry, so a deep link or a refresh on
`/procurement/purchase-requests/pending/?talep=SAT-123#x` is a plain 200 (link
previews, monitors and caches see a normal page). Any other path gets
`/404.html`, the same app with status 404, so a mistyped or brand-new URL still
boots the SPA. The router then opens the page, forwards an old URL
(`movedRoutes.ts`, query and hash kept) or shows "Sayfa bulunamadı". A new page
therefore needs its route in `migrated-routes.json` (the router test enforces it).

Pull requests run the same checks plus the e2e suite ([`ci.yml`](.github/workflows/ci.yml)).

## Session and permissions

The session lives in `localStorage` (`accessToken`, `refreshToken`, `user`,
`permissions`, `permissionsFetchedAt`, the `impersonator*` keys) and is shared
by every tab: one token refresh at a time, another tab's newer token or new
sign-in is picked up, a sign-out anywhere ends it everywhere. Permissions are
cached and refreshed in the background (on load, at most once a minute, after
every token refresh, and when another tab stores new ones). A page is open to
a user when they hold its `Page: /route/` grant, or one of the rules in
`accessControl.ts` opens it (always-open pages, inherited and moved routes).
A user signed out mid-way lands back on the deep link after signing in
(`sessionStorage.postLoginReturnUrl`).
