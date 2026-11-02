#!/usr/bin/env node
// Builds the deployable site in <repo>/_site from
//   - the tracked legacy files (git ls-files), minus repo tooling,
//   - web/dist (the built SPA) under /app-assets/,
//   - web/dist/index.html copied to every migrated route's index.html,
//   - a .nojekyll marker.
// It also reports tracked files that GitHub Pages' Jekyll build treats specially
// today, since a deploy without Jekyll publishes them differently.
//
// Usage: node scripts/assemble.mjs [--routes <file>] [--out <dir>] [--dist <dir>]
//   --routes  routes JSON (default src/routes/migrated-routes.json, or $MIGRATED_ROUTES_FILE)
//   --out     output directory (default <repo>/_site)
//   --dist    built SPA (default web/dist)

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
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
const ASSETS_DIR = 'app-assets';

function fail(message) {
  console.error(`assemble: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Which tracked files are part of the legacy site

const EXCLUDED_TOP_DIRS = new Set([
  'web',
  '.github',
  '.claude',
  '.vscode',
  'graphify-out',
  '_site',
]);
const EXCLUDED_NAMES = new Set(['CLAUDE.md', '.gitignore']);

function excludedReason(file) {
  const parts = file.split('/');
  if (parts.length > 1 && EXCLUDED_TOP_DIRS.has(parts[0])) return `${parts[0]}/`;
  const name = parts[parts.length - 1];
  if (EXCLUDED_NAMES.has(name)) return name;
  if (name.endsWith('.test.mjs')) return '*.test.mjs';
  return null;
}

function trackedFiles() {
  let out;
  try {
    out = execFileSync('git', ['ls-files', '-z', '-s'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    fail(`git ls-files failed in ${repoRoot}: ${err.message}`);
  }
  // "<mode> <sha> <stage>\t<path>\0"
  return out
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      return { mode: line.slice(0, 6), file: line.slice(tab + 1) };
    });
}

// ---------------------------------------------------------------------------
// Jekyll check: what GitHub Pages' default (branch) build does differently

const JEKYLL_DEFAULT_EXCLUDES = [
  '.sass-cache/',
  '.jekyll-cache/',
  'gemfiles/',
  'Gemfile',
  'Gemfile.lock',
  'node_modules/',
  'vendor/bundle/',
  'vendor/cache/',
  'vendor/gems/',
  'vendor/ruby/',
];

function hasFrontMatter(abs) {
  try {
    const head = readFileSync(abs, 'utf8').slice(0, 8);
    const text = head.charCodeAt(0) === 0xfeff ? head.slice(1) : head; // skip a BOM
    return /^---\r?\n/.test(text);
  } catch {
    return false;
  }
}

function jekyllReport(entries) {
  const all = new Set(entries.map((e) => e.file));
  const findings = {
    specialName: [], // a segment starts with "_", ".", "#" or "~", or ends with "~"
    defaultExcluded: [],
    frontMatter: [],
    markdown: [], // non-README .md: Pages renders them to .html (jekyll-optional-front-matter)
    readmeAsIndex: [], // README.md in a directory without index.html
    symlinks: [],
  };
  for (const { mode, file } of entries) {
    const parts = file.split('/');
    if (parts.some((p) => /^[_.#~]/.test(p) || p.endsWith('~'))) findings.specialName.push(file);
    if (JEKYLL_DEFAULT_EXCLUDES.some((x) => (x.endsWith('/') ? file.startsWith(x) : file === x))) {
      findings.defaultExcluded.push(file);
    }
    if (mode === '120000') findings.symlinks.push(file);
    const abs = path.join(repoRoot, file);
    if (
      /\.(html?|md|markdown|css|scss|sass|js|mjs|json|xml|txt|svg)$/i.test(file) &&
      hasFrontMatter(abs)
    ) {
      findings.frontMatter.push(file);
    }
    if (/\.(md|markdown)$/i.test(file)) {
      const dir = parts.slice(0, -1).join('/');
      const index = dir ? `${dir}/index.html` : 'index.html';
      if (!/^readme\.(md|markdown)$/i.test(parts[parts.length - 1])) findings.markdown.push(file);
      else if (!all.has(index)) findings.readmeAsIndex.push(file);
    }
  }
  return findings;
}

function printJekyllReport(findings) {
  const shipped = (f) => !excludedReason(f);
  const line = (label, files, note) => {
    if (!files.length) {
      console.log(`  - ${label}: none`);
      return;
    }
    console.log(`  - ${label}: ${files.length} (${note})`);
    for (const f of files)
      console.log(`      ${f}${shipped(f) ? '' : '   [not copied by assemble]'}`);
  };
  console.log("\nJekyll check (tracked files GitHub Pages' Jekyll build treats specially today):");
  line(
    'names starting with _ . # ~',
    findings.specialName,
    'Jekyll skips these; assemble copies them unless excluded above',
  );
  line('Jekyll default excludes', findings.defaultExcluded, 'Jekyll skips these');
  line('YAML front matter', findings.frontMatter, 'Jekyll runs Liquid/converters on these');
  line(
    'Markdown pages (not README)',
    findings.markdown,
    'Pages publishes them rendered as .html; without Jekyll only the raw .md is published',
  );
  line(
    'README.md acting as a directory index',
    findings.readmeAsIndex,
    'Pages serves the README rendered as "<dir>/" (no index.html there); without Jekyll "<dir>/" is a 404',
  );
  line('symlinks', findings.symlinks, 'Jekyll does not follow them');
}

// ---------------------------------------------------------------------------

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
  // Preconditions
  const distIndex = path.join(distDir, 'index.html');
  if (!existsSync(distIndex)) {
    fail(`${distIndex} not found. Build the SPA first: (cd web && npm run build)`);
  }
  // The output is wiped first: inside the repo only <repo>/_site is allowed.
  const within = (parent, child) => {
    const rel = path.relative(parent, child);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  };
  const inRepo = within(repoRoot, outDir);
  const containsRepo = within(outDir, repoRoot);
  if (containsRepo || (inRepo && outDir !== path.join(repoRoot, '_site'))) {
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

  const entries = trackedFiles();
  const findings = jekyllReport(entries);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // 1. Legacy files
  const excluded = new Map();
  const missing = [];
  let legacyCount = 0;
  let legacyBytes = 0;
  const shippedFiles = new Set();
  for (const { file } of entries) {
    const reason = excludedReason(file);
    if (reason) {
      excluded.set(reason, (excluded.get(reason) ?? 0) + 1);
      continue;
    }
    if (file === ASSETS_DIR || file.startsWith(`${ASSETS_DIR}/`)) {
      fail(`tracked file ${file} collides with the SPA's /${ASSETS_DIR}/ directory`);
    }
    const src = path.join(repoRoot, file);
    if (!existsSync(src) || !lstatSync(src).isFile()) {
      missing.push(file);
      continue;
    }
    legacyBytes += copy(src, path.join(outDir, file));
    shippedFiles.add(file);
    legacyCount += 1;
  }

  // 2. SPA assets
  let assetCount = 0;
  let assetBytes = 0;
  for (const file of walk(distDir)) {
    if (file === 'index.html') continue;
    assetBytes += copy(path.join(distDir, file), path.join(outDir, ASSETS_DIR, file));
    assetCount += 1;
  }

  // 3. SPA entry at each migrated route
  const replaced = [];
  for (const route of routes) {
    const target = route === '/' ? 'index.html' : `${route.slice(1)}/index.html`;
    const parentFile = target
      .split('/')
      .slice(0, -1)
      .find((_, i, parts) => shippedFiles.has(parts.slice(0, i + 1).join('/')));
    if (parentFile !== undefined) {
      fail(`route ${route} needs a directory where the legacy site has a file`);
    }
    if (shippedFiles.has(target)) replaced.push(`${route} (legacy ${target})`);
    const dest = path.join(outDir, ...target.split('/'));
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, spaHtml);
  }

  // 4. No Jekyll: publish the files as they are.
  writeFileSync(path.join(outDir, '.nojekyll'), '');

  // Summary
  console.log(`assemble: wrote ${outDir}`);
  console.log(`  legacy files : ${legacyCount} (${formatBytes(legacyBytes)})`);
  console.log(
    `  excluded     : ${[...excluded].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`,
  );
  if (missing.length) {
    console.log(
      `  WARNING      : ${missing.length} tracked file(s) missing from the working tree, skipped:`,
    );
    for (const f of missing) console.log(`      ${f}`);
  }
  console.log(`  SPA assets   : ${assetCount} in /${ASSETS_DIR}/ (${formatBytes(assetBytes)})`);
  const routesRel = path.relative(webDir, routesFile);
  console.log(`  routes file  : ${routesRel.startsWith('..') ? routesFile : routesRel}`);
  console.log(`  SPA routes   : ${routes.length ? routes.join(', ') : 'none'}`);
  if (replaced.length) console.log(`  replaced     : ${replaced.join(', ')}`);
  console.log('  .nojekyll    : written');

  printJekyllReport(findings);
}

main();
