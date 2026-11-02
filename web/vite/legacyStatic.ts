// Dev-server plugin: serves the legacy multi-page app from the repo root next to
// the React SPA, the way production will (see scripts/assemble.mjs):
//   - migrated routes (src/routes/migrated-routes.json) and /react-preview*
//     fall through to Vite, whose SPA fallback serves web/index.html;
//   - Vite's own requests (/@vite, /@fs, /src/, module ?import, ...) fall through;
//   - everything else is a legacy file from the repo root, resolved like GitHub
//     Pages does it (directory -> 301 + index.html). Missing files fall through
//     too, so Vite answers them (public/ files, or the SPA's 404 page).

import { statSync } from 'node:fs';
import type { Plugin } from 'vite';
import { normalizeRoute, readMigratedRoutes } from '../scripts/routes.mjs';
import { createStaticHandler } from '../scripts/static-handler.mjs';

export interface LegacyStaticOptions {
  /** Absolute path of the legacy app (the repo root). */
  legacyRoot: string;
  /** Absolute path of migrated-routes.json. */
  routesFile: string;
  /** Dev-only SPA prefix. Default "/react-preview". */
  previewPrefix?: string;
}

/** Path prefixes that belong to Vite (or the SPA's sources), never to the legacy app. */
const VITE_PREFIXES = ['/@', '/src/', '/node_modules/', '/__'];

/** Query keys Vite puts on module requests (?import, ?v=hash, ?t=hmr-timestamp, ...). */
const VITE_QUERY_KEYS = [
  'import',
  'v',
  't',
  'raw',
  'url',
  'inline',
  'worker',
  'sharedworker',
  'direct',
  'html-proxy',
];

/** Top-level directories of the repo that are not part of the legacy site. */
const BLOCKED_TOP = new Set(['web', 'graphify-out', 'node_modules', '_site']);

/** Never serve dot-files/-dirs (.git, .claude, .github, ...) or any node_modules. */
export function isBlockedLegacyPath(relSegments: string[]): boolean {
  const [top] = relSegments;
  if (top !== undefined && BLOCKED_TOP.has(top.toLowerCase())) return true;
  return relSegments.some((s) => s.startsWith('.') || s.toLowerCase() === 'node_modules');
}

export function isViteRequest(pathname: string, search: string): boolean {
  if (VITE_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // Query markers only count on asset-like paths: legacy pages ("/sales/?t=2")
  // keep their own query strings.
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  const ext = last.includes('.') ? last.slice(last.lastIndexOf('.')).toLowerCase() : '';
  if (!ext || ext === '.html') return false;
  const params = new URLSearchParams(search);
  return VITE_QUERY_KEYS.some((k) => params.has(k));
}

function safeDecode(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

export function legacyStatic(options: LegacyStaticOptions): Plugin {
  const { legacyRoot, routesFile, previewPrefix = '/react-preview' } = options;

  // Re-read the routes list whenever the file changes, so adding a route needs no restart.
  let cached: { mtimeMs: number; routes: Set<string> } | null = null;
  const migrated = (): Set<string> => {
    const { mtimeMs } = statSync(routesFile);
    if (!cached || cached.mtimeMs !== mtimeMs) {
      cached = { mtimeMs, routes: new Set(readMigratedRoutes(routesFile)) };
    }
    return cached.routes;
  };

  const serveLegacy = createStaticHandler(legacyRoot, {
    isBlocked: isBlockedLegacyPath,
    fallthrough: true,
  });

  return {
    name: 'gemkom:legacy-static',
    apply: 'serve',
    configureServer(server) {
      // Registered directly (not in a returned hook) so it runs before Vite's middlewares.
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const url = req.url ?? '/';
        const q = url.indexOf('?');
        const pathname = q === -1 ? url : url.slice(0, q);
        const search = q === -1 ? '' : url.slice(q);

        if (isViteRequest(pathname, search)) return next();

        const decoded = safeDecode(pathname);
        if (decoded === null) return next();
        // "/x/index.html" is the same page as "/x/" (assemble writes the SPA to that file).
        const route = normalizeRoute(decoded.replace(/\/index\.html$/, '/'));
        if (route === previewPrefix || route.startsWith(`${previewPrefix}/`)) return next();
        try {
          if (migrated().has(route)) return next();
        } catch (err) {
          return next(err);
        }

        serveLegacy(req, res, next);
      });
    },
  };
}
