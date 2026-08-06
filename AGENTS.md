# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

GEMKOM is a static vanilla JavaScript frontend (no framework, no build step, no package manager) for a Turkish ERP system. All dependencies (Bootstrap 5.3, Font Awesome 6.4) are loaded from CDNs.

### Running the Dev Server

Serve the repo root with any static HTTP server. ES modules require HTTP — `file://` will not work.

```bash
python3 -m http.server 8080 --directory /workspace
```

The app is then accessible at `http://localhost:8080/`. Unauthenticated users are redirected to `/login/index.html`.

### Backend API

- The backend is a separate Django/DRF service **not included in this repo**.
- When served from `localhost` or `127.0.0.1`, the frontend connects to `http://127.0.0.1:8000`.
- When served from any other host, it connects to the production Cloud Run URL (`https://gemkom-backend-716746493353.europe-west3.run.app`).
- This is configured in `base.js`.

### Linting / Testing / Building

- **No linter** is configured (no ESLint, Prettier, etc.).
- **No automated test suite** exists. A few manual `test.html` demo pages exist under `components/` (e.g., `components/gantt/test.html`, `components/dropdown/test.html`).
- **No build step** — files are served as-is.

### Key Gotchas

- CDN-loaded assets (Bootstrap, Font Awesome) require internet access. The app will not render correctly without connectivity.
- Multi-page architecture: each section has its own `index.html` that imports shared ES modules. Navigation between sections triggers full page loads (not SPA-style routing).
- Authentication uses JWT tokens stored in `localStorage`. The auth flow is managed by `authService.js`.
