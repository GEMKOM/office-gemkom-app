#!/usr/bin/env node
// Fails when a legacy page points at a file that isn't there: a relative or
// root-absolute `import ... from '...'`, `export ... from '...'`, `import('...')`
// in a legacy .js/.mjs file or inline <script>, or a <script src="..."> in a
// legacy .html file. One missing static import kills the page's whole module
// graph, so this catches a React migration that deleted a file another legacy
// page still uses.
//
// Scans the files git knows about (tracked plus untracked, not ignored) outside
// web/, graphify-out/, node_modules/ and .claude/. A target must exist with the
// exact same case, since the deployed site is served case-sensitively.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const SKIP_PREFIXES = ['web/', 'graphify-out/', 'node_modules/', '.claude/'];

// Dead references that predate the React migration, as `file -> missing target`.
// A classic <script src> 404 only logs an error, so these pages still work. Remove
// an entry once its page is fixed; a stale entry fails the check too.
const KNOWN_MISSING = new Set([
  'manufacturing/cnc-cutting/reports/index.html -> components/dropdown.js',
  'manufacturing/machining/reports/index.html -> components/dropdown.js',
  'manufacturing/reports/index.html -> components/dropdown.js',
]);

const known = new Set(
  execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((f) => f && existsSync(path.join(repoRoot, f))),
);

const sources = [...known].filter(
  (f) =>
    /\.(m?js|html)$/.test(f) && !SKIP_PREFIXES.some((p) => f.startsWith(p) || f.includes(`/${p}`)),
);

// `import x from '...'`, `import '...'`, `export { x } from '...'` at the start of a line
// (so `// import ...` is skipped), and `import('...')` with a literal specifier.
const STATIC_IMPORT = /^[ \t]*(?:import|export)\s+(?:[^'";]*?\s*from\s*)?['"]([^'"\n]+)['"]/gm;
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g;
// The end tag may carry spaces or junk before its `>` (`</script >`); browsers accept both.
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi;
const SRC_ATTR = /\bsrc\s*=\s*["']([^"']+)["']/i;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function jsSpecifiers(code, offset) {
  const found = [];
  for (const re of [STATIC_IMPORT, DYNAMIC_IMPORT]) {
    for (const m of code.matchAll(re)) found.push({ spec: m[1], index: offset + m.index });
  }
  return found;
}

function htmlSpecifiers(html) {
  // Blank out comments (keeping their newlines) so commented-out tags are ignored
  // and line numbers still match the file.
  const text = html.replace(HTML_COMMENT, (c) => c.replace(/[^\n]/g, ' '));
  const found = [];
  for (const m of text.matchAll(SCRIPT_TAG)) {
    const src = SRC_ATTR.exec(m[1]);
    if (src) found.push({ spec: src[1], index: m.index });
    else found.push(...jsSpecifiers(m[2], m.index + m[0].indexOf('>') + 1));
  }
  return found;
}

// Repo-relative path of a local specifier, or null for URLs, bare names and templates.
// Resolved the way the browser does it, so a `../` too many stops at the site root.
function resolveLocal(file, spec) {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(spec) || /\$\{|\{\{/.test(spec)) return null;
  const isPath = spec.startsWith('/') || spec.startsWith('./') || spec.startsWith('../');
  // Module specifiers must be paths; a <script src> may also be a bare relative name.
  if (!isPath && !file.endsWith('.html')) return null;
  const url = new URL(spec, `http://site/${file}`);
  return decodeURIComponent(url.pathname.slice(1));
}

const missing = [];
const stillKnown = new Set();
for (const file of sources.sort()) {
  const text = readFileSync(path.join(repoRoot, file), 'utf8');
  const specs = file.endsWith('.html') ? htmlSpecifiers(text) : jsSpecifiers(text, 0);
  for (const { spec, index } of specs) {
    const target = resolveLocal(file, spec);
    if (target === null || known.has(target)) continue;
    const key = `${file} -> ${target}`;
    if (KNOWN_MISSING.has(key)) {
      stillKnown.add(key);
      continue;
    }
    const note = existsSync(path.join(repoRoot, target))
      ? ' (exists, but ignored by git or with different case)'
      : '';
    missing.push(`  ${file}:${lineOf(text, index)}  ${spec}  ->  ${target}${note}`);
  }
}
const stale = [...KNOWN_MISSING].filter((k) => !stillKnown.has(k));

if (missing.length) {
  console.log(`check:legacy-imports: ${missing.length} reference(s) to missing files:`);
  console.log(missing.join('\n'));
}
if (stale.length) {
  console.log('check:legacy-imports: KNOWN_MISSING entries that no longer occur (remove them):');
  console.log(stale.map((k) => `  ${k}`).join('\n'));
}
if (missing.length || stale.length) process.exit(1);
console.log(
  `check:legacy-imports: ${sources.length} legacy files, no missing imports` +
    ` (${KNOWN_MISSING.size} known, see KNOWN_MISSING)`,
);
