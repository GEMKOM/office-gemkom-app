# E2E smoke tests

Playwright tests against the assembled site (`<repo>/_site`), served by
`scripts/serve-site.mjs` the way GitHub Pages serves it. They run in the
installed Google Chrome (`channel: 'chrome'`), so there are no Playwright
browsers to download. No backend is needed: every call to
`http://127.0.0.1:8001` is mocked, and calls to the production API are blocked.

## Running

```sh
cd web
npm run test:e2e                 # build + assemble + playwright test
npx playwright test              # reuse the current _site (after build + assemble)
npx playwright test -g "401"     # one test by name
npx playwright show-trace test-results/<test>/trace.zip   # after a failure
```

Port 4173 by default (`E2E_PORT` changes it). Locally an already running
`npm run serve:site` is reused. On a failure the trace and a screenshot go to
`web/test-results/`; CI uploads them, plus the HTML report, as an artifact.

## What is covered (`smoke.spec.ts`)

- Signed out: a migrated page sends you to `/login/` and parks the URL in
  `sessionStorage.postLoginReturnUrl`.
- Hub → page navigation inside the SPA is client-side (`window.__spaMarker`
  survives).
- SPA → legacy is a full page load, and back again, with the session intact.
- A 401 triggers one `POST /token/refresh/` and a retry with the new token.
- Route permissions: no grant shows "Erişim yetkiniz yok"; a `Page:` grant opens the page.
- Every route in `src/routes/migrated-routes.json` loads as admin, shows
  `<main>`, and logs no console errors. New routes are picked up on their own;
  give them the mocks they need (below).

`manufacturing.spec.ts`: the manufacturing hubs, as admin (cards, band counts,
hub to hub inside the SPA) and as a user with a few page grants.

## Fixtures (`fixtures.ts`)

Import `test` and `expect` from `./fixtures`, not from `@playwright/test`: that
`test` adds a `consoleErrors` collector to every test.

```ts
const session = await seedSession(page, { admin: false, grants: ['/sales/customers/'] });
const backend = await mockBackend(page, {}, { session });
await page.goto('/sales/customers/');
consoleErrors.expectNone();
```

- `seedSession(page, { admin?, grants?, user? })` writes fake tokens, the user
  and the permissions to localStorage before any page script runs. It writes
  once per tab, so later page loads see what the app left there.
- `mockBackend(page, handlers, { session })` answers the backend. Unknown
  endpoints get 200: an empty DRF page for list-looking GETs, `{}` otherwise.
  `backend.calls` records every call; `backend.callsTo(path, method?)` filters
  them; `backend.unhandled()` lists the endpoints only the fallback answered.
- `consoleErrors.allow(/pattern/)` ignores an error a test provokes on purpose.
  The always-ignored noise is `BENIGN_CONSOLE_ERRORS` in `fixtures.ts`.

## Adding a mock

Handler keys are `"METHOD /path/"` (exact backend path, query ignored) or
`"/path/"` for any method. A handler is a response or a function returning
one:

```ts
await mockBackend(page, {
  'GET /projects/job-orders/': { json: paginated([{ id: 1, job_no: 'E2E-1' }]) },
  'POST /projects/customers/': ({ body }) => ({
    status: 201,
    json: { id: 1, ...(body as object) },
  }),
  'GET /projects/customers/': ({ callIndex }) =>
    callIndex === 0 ? { status: 500, json: { detail: 'boom' } } : { json: paginated([]) },
});
```

A mock that every page needs (the navbar, the session) belongs in
`defaultHandlers()`. Keep test values obviously fake (`e2e-…`, `@example.test`).
