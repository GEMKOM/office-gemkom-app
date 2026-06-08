# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

GEMKOM is a static frontend-only ERP web application (vanilla HTML/CSS/JavaScript with ES6 modules). There is **no build system, no package manager, no linting, and no test framework**. All dependencies (Bootstrap 5.3.0, Font Awesome 6.4.0) are loaded via CDN.

### Running the Dev Server

Serve the project root with any static file server:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

The app is then available at `http://127.0.0.1:8080/`. The login page is at `/login/`.

### Backend API

The frontend talks to an external Django REST Framework backend. In `base.js`, when running on `localhost`/`127.0.0.1`, it targets `http://127.0.0.1:8000`. The production backend is at `https://gemkom-backend-716746493353.europe-west3.run.app`.

Authentication uses JWT tokens (`/token/` and `/token/refresh/` endpoints).

### Key Caveats

- **No lint/test/build commands exist.** There is no `package.json`, no ESLint, no Prettier, no test runner.
- **No dependencies to install.** The project has zero npm/pip/etc. packages.
- **File-system routing:** Each page is a directory with its own `index.html` + JS module. URL paths map directly to directories.
- **Authentication required:** All pages (except `/login/`) require a valid JWT token. Without the backend running locally, authenticated pages will redirect to `/login/`.
- **ES modules:** All JS uses `type="module"` imports. The static server must serve `.js` files with the correct MIME type (Python's http.server does this correctly).
