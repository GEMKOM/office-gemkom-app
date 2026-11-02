// A small, dependency-free static file server that behaves like GitHub Pages
// for the cases this app relies on:
//   - "/dir"  (a directory)       -> 301 to "/dir/"
//   - "/dir/"                     -> dir/index.html
//   - "/page" (no file, page.html) -> page.html
//   - anything else missing       -> 404 (the root's 404.html when there is one)
// Path traversal (encoded or not) is refused, and every resolved file is checked
// to really live under the root after symlinks are followed.
//
// Shared by the Vite dev plugin (vite/legacyStatic.ts) and scripts/serve-site.mjs.

import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const DEFAULT_TYPE = 'application/octet-stream';

/** Content-Type for a file name, by extension. */
export function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? DEFAULT_TYPE;
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function statOrNull(p) {
  try {
    return await stat(p);
  } catch {
    return null;
  }
}

/**
 * Splits a URL pathname into decoded, validated segments.
 * Returns null for anything that could escape the root or that a Windows file
 * system would read differently from how it is written.
 */
export function pathSegments(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.includes('\0') || decoded.includes('\\')) return null;
  const segments = decoded.split('/').filter((s) => s !== '' && s !== '.');
  for (const s of segments) {
    if (s === '..') return null;
    // "C:", "file.txt:stream", "dir." and "dir " resolve to something else on Windows.
    if (s.includes(':') || /[. ]$/.test(s)) return null;
  }
  return segments;
}

/**
 * Resolves a URL pathname against `root`.
 *
 * @param {string} root absolute directory
 * @param {string} pathname URL pathname (still percent-encoded, no query)
 * @param {{ isBlocked?: (relSegments: string[]) => boolean }} [options]
 *   isBlocked gets the file's path relative to the root, as segments, after
 *   symlinks and case have been resolved; returning true makes it a 404.
 * @returns {Promise<
 *   | { kind: 'file', filePath: string, size: number, mtime: Date }
 *   | { kind: 'redirect', location: string }
 *   | { kind: 'not-found' }
 *   | { kind: 'bad-request' }
 * >}
 */
export async function resolveStatic(root, pathname, options = {}) {
  const segments = pathSegments(pathname);
  if (!segments) return { kind: 'bad-request' };

  const realRoot = await realpath(root);
  const target = path.join(realRoot, ...segments);
  if (!isInside(realRoot, target)) return { kind: 'bad-request' };

  const accept = async (filePath) => {
    let real;
    try {
      real = await realpath(filePath);
    } catch {
      return null;
    }
    if (!isInside(realRoot, real)) return null;
    const rel = path.relative(realRoot, real).split(path.sep).filter(Boolean);
    if (options.isBlocked?.(rel)) return null;
    return real;
  };

  const info = await statOrNull(target);
  if (info?.isDirectory()) {
    if (!(await accept(target))) return { kind: 'not-found' };
    if (!pathname.endsWith('/')) {
      // Rebuilt from the clean segments so "//host/dir" can't become an open redirect.
      const location = `/${segments.map(encodeURIComponent).join('/')}/`;
      return { kind: 'redirect', location };
    }
    const index = path.join(target, 'index.html');
    const indexInfo = await statOrNull(index);
    const real = indexInfo?.isFile() ? await accept(index) : null;
    return real
      ? { kind: 'file', filePath: real, size: indexInfo.size, mtime: indexInfo.mtime }
      : { kind: 'not-found' };
  }
  if (info?.isFile()) {
    const real = await accept(target);
    return real
      ? { kind: 'file', filePath: real, size: info.size, mtime: info.mtime }
      : { kind: 'not-found' };
  }
  // GitHub Pages serves "/page" from "page.html" when there is no such file or directory.
  if (segments.length > 0 && !pathname.endsWith('/') && !path.extname(target)) {
    const html = `${target}.html`;
    const htmlInfo = await statOrNull(html);
    const real = htmlInfo?.isFile() ? await accept(html) : null;
    if (real) return { kind: 'file', filePath: real, size: htmlInfo.size, mtime: htmlInfo.mtime };
  }
  return { kind: 'not-found' };
}

/** Writes a resolved file to the response (HEAD writes headers only). */
export function sendFile(req, res, file, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentTypeFor(file.filePath));
  res.setHeader('Content-Length', String(file.size));
  res.setHeader('Last-Modified', file.mtime.toUTCString());
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(file.filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function sendText(res, status, text, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(text);
}

/**
 * Connect-style middleware serving `root`.
 *
 * @param {string} root absolute directory
 * @param {{
 *   isBlocked?: (relSegments: string[]) => boolean,
 *   fallthrough?: boolean,
 * }} [options]
 *   fallthrough: when true, a missing file (or a non-GET/HEAD request) calls
 *   next() instead of answering 404/405, so another handler can take it.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next?: (err?: unknown) => void) => void}
 */
export function createStaticHandler(root, options = {}) {
  const { fallthrough = false } = options;
  return (req, res, next) => {
    const pass = () => (next ? next() : sendText(res, 404, 'Not Found'));
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (fallthrough) return pass();
      return sendText(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    }
    const url = req.url ?? '/';
    const q = url.indexOf('?');
    const pathname = q === -1 ? url : url.slice(0, q);
    const search = q === -1 ? '' : url.slice(q);

    resolveStatic(root, pathname, options)
      .then(async (result) => {
        if (result.kind === 'file') return sendFile(req, res, result);
        if (result.kind === 'redirect') {
          res.statusCode = 301;
          res.setHeader('Location', result.location + search);
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          return res.end(`Moved Permanently: ${result.location}`);
        }
        if (result.kind === 'bad-request') return sendText(res, 400, 'Bad Request');
        if (fallthrough) return pass();
        const notFound = await resolveStatic(root, '/404.html', options);
        if (notFound.kind === 'file') return sendFile(req, res, notFound, 404);
        return sendText(res, 404, 'Not Found');
      })
      .catch((err) => (next ? next(err) : sendText(res, 500, 'Internal Server Error')));
  };
}
