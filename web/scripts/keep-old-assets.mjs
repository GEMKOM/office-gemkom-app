#!/usr/bin/env node
// Keeps the asset files of recent deploys in the assembled site, next to the
// new ones.
//
// Every deploy replaces the whole site, and the built files have hashed names,
// so a tab opened before a deploy asked for page files that no longer existed
// the next time it switched to a page it hadn't loaded yet. That broke the
// page ("Cannot read properties of undefined") and reloaded the tab after
// every deploy. With the old files still published, an open tab keeps running
// the version it loaded and picks up the new one on its next full load.
//
// The files live in a history folder that the deploy workflow keeps between
// runs (actions/cache). manifest.json in it records, per file, when a deploy
// last published it; files no deploy has published for --days are dropped.
// The live site's files are also fetched into the history (--live), so the
// version that is up now is kept even when the cache is empty or was evicted.
// Source maps are not kept for old versions.
//
// Usage: node scripts/keep-old-assets.mjs --site <dir> --history <dir> [--days 14] [--live <url>]
//   --site     the assembled site (its app-assets/assets/ gets the old files)
//   --history  the folder kept between deploys
//   --days     how long a file stays after the last deploy that published it
//   --live     the site that is up now, e.g. https://ofis.gemcore.com.tr

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ASSETS = 'app-assets/assets';
const MANIFEST = 'manifest.json';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hashed asset names (Name-<8 hash chars>.ext, as the build writes them)
 * referenced from a JS, CSS or HTML file.
 */
export function referencedAssets(text) {
  const names = new Set();
  for (const [name] of text.matchAll(/\w[\w.-]*\.(?:js|css|woff2?|ttf|png|svg)(?![\w.])/g)) {
    if (/-[\w-]{8}\.\w+$/.test(name)) names.add(name);
  }
  return names;
}

function readManifest(historyDir) {
  try {
    const data = JSON.parse(readFileSync(path.join(historyDir, MANIFEST), 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

const kept = (name) => !name.endsWith('.map');

/**
 * Merges the history into the site's assets and the site's assets into the
 * history. Returns what it did.
 */
export function keepOldAssets({ siteDir, historyDir, days = 14, now = Date.now(), live = {} }) {
  const assetsDir = path.join(siteDir, ASSETS);
  if (!existsSync(assetsDir)) throw new Error(`${assetsDir} not found; assemble the site first`);
  mkdirSync(historyDir, { recursive: true });
  const manifest = readManifest(historyDir);
  const current = new Set(readdirSync(assetsDir));

  // The live site's files, unless the history already has them.
  let fetched = 0;
  for (const [name, bytes] of Object.entries(live)) {
    if (current.has(name) || !kept(name)) continue;
    if (!existsSync(path.join(historyDir, name))) {
      writeFileSync(path.join(historyDir, name), bytes);
      fetched += 1;
    }
    manifest[name] = now;
  }

  // This deploy's files: published now.
  for (const name of current) {
    if (!kept(name)) continue;
    manifest[name] = now;
    copyFileSync(path.join(assetsDir, name), path.join(historyDir, name));
  }

  // Older files: published again while recent, dropped once expired.
  let restored = 0;
  let expired = 0;
  for (const [name, at] of Object.entries(manifest)) {
    if (current.has(name)) continue;
    const file = path.join(historyDir, name);
    if (typeof at !== 'number' || now - at > days * DAY_MS || !existsSync(file)) {
      rmSync(file, { force: true });
      delete manifest[name];
      expired += 1;
      continue;
    }
    copyFileSync(file, path.join(assetsDir, name));
    restored += 1;
  }
  // Files in the history the manifest doesn't know (a broken run) go too.
  for (const name of readdirSync(historyDir)) {
    if (name !== MANIFEST && !(name in manifest))
      rmSync(path.join(historyDir, name), { force: true });
  }
  writeFileSync(path.join(historyDir, MANIFEST), JSON.stringify(manifest, null, 1));
  return { current: current.size, fetched, restored, expired };
}

/**
 * The live site's asset files: its entry script, and every asset that one
 * references, followed through the JS and CSS files. Files in `have` (already
 * in the history, with everything they reference) are not fetched. Failures
 * are warnings: a deploy never fails over this.
 */
export async function fetchLiveAssets(
  origin,
  { have = new Set(), fetchImpl = fetch, log = console.warn, parallel = 8 } = {},
) {
  const out = {};
  // One retry: GitHub Pages now and then answers a burst with a 503.
  const get = async (url, retry = true) => {
    const res = await fetchImpl(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (retry && res.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return get(url, false);
    }
    throw new Error(`${url}: ${res.status}`);
  };
  try {
    const html = (await get(`${origin}/`)).toString('utf8');
    const queue = [...referencedAssets(html)].filter(
      (n) => html.includes(`/${ASSETS}/${n}`) && !have.has(n),
    );
    const seen = new Set(queue);
    const worker = async () => {
      while (queue.length) {
        const name = queue.shift();
        try {
          const bytes = await get(`${origin}/${ASSETS}/${name}`);
          out[name] = bytes;
          if (/\.(js|css)$/.test(name)) {
            for (const ref of referencedAssets(bytes.toString('utf8'))) {
              if (!seen.has(ref) && !have.has(ref)) {
                seen.add(ref);
                queue.push(ref);
              }
            }
          }
        } catch (err) {
          log(`  ${err.message}`);
        }
      }
    };
    // Workers that find the queue empty stop; the first ones refill it as
    // they go, so start them one after another as the crawl widens.
    const running = [];
    while (queue.length || running.length) {
      while (queue.length && running.length < parallel) {
        const job = worker().finally(() => running.splice(running.indexOf(job), 1));
        running.push(job);
      }
      await Promise.race(running);
    }
  } catch (err) {
    log(`keep-old-assets: could not read the live site (${err.message}); using the history only`);
  }
  return out;
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      site: { type: 'string' },
      history: { type: 'string' },
      days: { type: 'string', default: '14' },
      live: { type: 'string' },
    },
  });
  if (!args.site || !args.history) {
    console.error('keep-old-assets: --site and --history are required');
    process.exit(1);
  }
  const historyDir = path.resolve(args.history);
  const have = new Set(existsSync(historyDir) ? readdirSync(historyDir) : []);
  const live = args.live ? await fetchLiveAssets(args.live.replace(/\/+$/, ''), { have }) : {};
  const result = keepOldAssets({
    siteDir: path.resolve(args.site),
    historyDir,
    days: Number(args.days),
    live,
  });
  console.log(
    `keep-old-assets: ${result.current} new files, ${result.restored} kept from earlier deploys` +
      ` (${result.fetched} fetched from the live site), ${result.expired} expired`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
