// The migrated-routes list (web/src/routes/migrated-routes.json), read the same
// way by the dev server plugin and the assemble script. The SPA has its own copy
// of normalizeRoute in src/routes/migrated.ts; keep them in step.

import { readFileSync } from 'node:fs';

/** "/sales/customers/?q=1#x" -> "/sales/customers" (the root stays "/"). */
export function normalizeRoute(path) {
  const bare = path.split(/[?#]/)[0] || '/';
  return bare.length > 1 && bare.endsWith('/') ? bare.slice(0, -1) : bare;
}

/**
 * Reads and validates a routes file: a JSON array of strings, each starting
 * with "/", without "." / ".." segments, query or hash. Entries are normalized.
 * Throws with a message naming the file on anything else.
 */
export function readMigratedRoutes(file) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot read migrated routes from ${file}: ${err.message}`, { cause: err });
  }
  if (!Array.isArray(data)) throw new Error(`${file} must be a JSON array of route strings`);
  const routes = [];
  for (const entry of data) {
    if (typeof entry !== 'string' || !entry.startsWith('/') || /[?#\\]/.test(entry)) {
      throw new Error(`${file}: invalid route ${JSON.stringify(entry)}`);
    }
    const segments = entry.split('/').filter(Boolean);
    if (segments.some((s) => s === '.' || s === '..') || entry.includes('//')) {
      throw new Error(`${file}: invalid route ${JSON.stringify(entry)}`);
    }
    routes.push(normalizeRoute(entry));
  }
  return [...new Set(routes)];
}
