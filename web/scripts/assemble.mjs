#!/usr/bin/env node
// Builds the deployable site in <repo>/_site from
//   - web/static, copied to the site root as it is (CNAME, /images/...),
//   - web/dist (the built SPA) under /app-assets/,
//   - the SPA entry, web/dist/index.html, written at the root and into every
//     route of src/routes/migrated-routes.json as <route>/index.html, so every
//     known URL (moved and merged-report ones included) is served with 200,
//   - the same entry as /404.html: GitHub Pages answers any other path with it
//     (status 404; URL, query string and hash untouched), so an unknown or a new
//     path still boots the SPA, whose router shows the page or "Sayfa bulunamadı",
//   - a .nojekyll marker.
//
// Usage: node scripts/assemble.mjs [--routes <file>] [--out <dir>] [--dist <dir>]
//   --routes  routes JSON (default src/routes/migrated-routes.json, or $MIGRATED_ROUTES_FILE)
//   --out     output directory (default <repo>/_site)
//   --dist    built SPA (default web/dist)

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readMigratedRoutes } from './routes.mjs';

const webDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = path.resolve(webDir, '..');

const { values: args } = parseArgs({
  options: {
    routes: { type: 'string' },
    out: { type: 'string' },
    dist: { type: 'string' },
  },
});

const routesFile = path.resolve(
  args.routes ??
    process.env.MIGRATED_ROUTES_FILE ??
    path.join(webDir, 'src/routes/migrated-routes.json'),
);
const outDir = path.resolve(args.out ?? path.join(repoRoot, '_site'));
const distDir = path.resolve(args.dist ?? path.join(webDir, 'dist'));
const staticDir = path.join(webDir, 'static');
const ASSETS_DIR = 'app-assets';
const FALLBACK = '404.html';

function fail(message) {
  console.error(`assemble: ${message}`);
  process.exit(1);
}

function walk(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(abs, base));
    else if (entry.isFile()) files.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return files;
}

function copy(src, dest) {
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  return statSync(dest).size;
}

function formatBytes(n) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;
}

function main() {
  const distIndex = path.join(distDir, 'index.html');
  if (!existsSync(distIndex)) {
    fail(`${distIndex} not found. Build the SPA first: (cd web && npm run build)`);
  }
  // The output is wiped first: inside the repo only <repo>/_site is allowed.
  const within = (parent, child) => {
    const rel = path.relative(parent, child);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  };
  if (
    within(outDir, repoRoot) ||
    (within(repoRoot, outDir) && outDir !== path.join(repoRoot, '_site'))
  ) {
    fail(
      `refusing to use ${outDir} as the output directory (use <repo>/_site or a path outside the repo)`,
    );
  }
  let routes;
  try {
    routes = readMigratedRoutes(routesFile);
  } catch (err) {
    fail(err.message);
  }
  const spaHtml = readFileSync(distIndex, 'utf8');
  if (!spaHtml.includes(`/${ASSETS_DIR}/`)) {
    fail(
      `${distIndex} does not reference /${ASSETS_DIR}/; was it built with base '/${ASSETS_DIR}/'?`,
    );
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // 1. Static files at the site root
  const staticFiles = existsSync(staticDir) ? walk(staticDir) : [];
  const shipped = new Set(staticFiles);
  let staticBytes = 0;
  for (const file of staticFiles) {
    if (file.split('/')[0] === ASSETS_DIR) fail(`static/${file} collides with /${ASSETS_DIR}/`);
    if (file === FALLBACK || file === 'index.html' || file.endsWith('/index.html')) {
      fail(`static/${file} collides with the SPA entry`);
    }
    staticBytes += copy(path.join(staticDir, file), path.join(outDir, file));
  }

  // 2. SPA assets
  let assetCount = 0;
  let assetBytes = 0;
  for (const file of walk(distDir)) {
    if (file === 'index.html') continue;
    assetBytes += copy(path.join(distDir, file), path.join(outDir, ASSETS_DIR, file));
    assetCount += 1;
  }

  // 3. The SPA entry at every known route (a 200 for each page)
  for (const route of routes) {
    const target = route === '/' ? 'index.html' : `${route.slice(1)}/index.html`;
    const parts = target.split('/');
    if (parts.slice(0, -1).some((_, i) => shipped.has(parts.slice(0, i + 1).join('/')))) {
      fail(`route ${route} needs a directory where static/ has a file`);
    }
    const dest = path.join(outDir, ...parts);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, spaHtml);
  }

  // 4. The same entry as the fallback for every other path
  writeFileSync(path.join(outDir, FALLBACK), spaHtml);

  // 5. No Jekyll: publish the files as they are.
  writeFileSync(path.join(outDir, '.nojekyll'), '');

  console.log(`assemble: wrote ${outDir}`);
  console.log(`  static files : ${staticFiles.length} (${formatBytes(staticBytes)})`);
  console.log(`  SPA assets   : ${assetCount} in /${ASSETS_DIR}/ (${formatBytes(assetBytes)})`);
  const routesRel = path.relative(webDir, routesFile);
  console.log(`  routes file  : ${routesRel.startsWith('..') ? routesFile : routesRel}`);
  console.log(`  SPA routes   : ${routes.length} (each <route>/index.html is the SPA entry)`);
  console.log(`  404 fallback : ${FALLBACK} (the SPA entry)`);
  console.log('  .nojekyll    : written');
}

main();
