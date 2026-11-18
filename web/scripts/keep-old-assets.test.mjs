import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { fetchLiveAssets, keepOldAssets, referencedAssets } from './keep-old-assets.mjs';

const DAY = 24 * 60 * 60 * 1000;
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A site whose app-assets/assets holds these files, plus a history folder. */
function setup(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'keep-old-assets-'));
  dirs.push(root);
  const siteDir = path.join(root, 'site');
  const assets = path.join(siteDir, 'app-assets/assets');
  mkdirSync(assets, { recursive: true });
  for (const name of files) writeFileSync(path.join(assets, name), name);
  return { siteDir, assets, historyDir: path.join(root, 'history') };
}

function deploy(prev, files, now) {
  const next = setup(files);
  keepOldAssets({ siteDir: next.siteDir, historyDir: prev.historyDir, now });
  return next;
}

it('publishes the previous deploys’ files next to the new ones', () => {
  const first = setup(['index-AAAAAAAA.js', 'TasksPage-BBBBBBBB.js', 'index-AAAAAAAA.js.map']);
  keepOldAssets({ siteDir: first.siteDir, historyDir: first.historyDir, now: 0 });

  const second = deploy(first, ['index-CCCCCCCC.js', 'TasksPage-DDDDDDDD.js'], DAY);
  expect(readdirSync(second.assets).sort()).toEqual([
    'TasksPage-BBBBBBBB.js',
    'TasksPage-DDDDDDDD.js',
    'index-AAAAAAAA.js',
    'index-CCCCCCCC.js',
  ]);
  // Old versions keep no source maps.
  expect(existsSync(path.join(first.historyDir, 'index-AAAAAAAA.js.map'))).toBe(false);
});

it('drops files no deploy has published for the kept days', () => {
  const first = setup(['old-AAAAAAAA.js']);
  keepOldAssets({ siteDir: first.siteDir, historyDir: first.historyDir, now: 0 });
  const later = setup(['new-BBBBBBBB.js']);
  const result = keepOldAssets({
    siteDir: later.siteDir,
    historyDir: first.historyDir,
    now: 15 * DAY,
  });
  expect(result.expired).toBe(1);
  expect(readdirSync(later.assets)).toEqual(['new-BBBBBBBB.js']);
  expect(existsSync(path.join(first.historyDir, 'old-AAAAAAAA.js'))).toBe(false);
  const manifest = JSON.parse(readFileSync(path.join(first.historyDir, 'manifest.json'), 'utf8'));
  expect(manifest).toEqual({ 'new-BBBBBBBB.js': 15 * DAY });
});

it('keeps the live site’s files when the history is empty', () => {
  const site = setup(['index-CCCCCCCC.js']);
  const result = keepOldAssets({
    siteDir: site.siteDir,
    historyDir: site.historyDir,
    now: 0,
    live: { 'index-AAAAAAAA.js': Buffer.from('old entry') },
  });
  expect(result).toMatchObject({ fetched: 1, restored: 1 });
  expect(readFileSync(path.join(site.assets, 'index-AAAAAAAA.js'), 'utf8')).toBe('old entry');
});

it('finds hashed asset names in built code', () => {
  const js =
    'import{a}from"./vendor-CW9Do0P6.js";const m=["assets/BarDiagram-H4-Gzg3k.js","assets/BarDiagram-C81Mw_-g.css"];' +
    'x.endsWith(".js");url(./ibm-plex-sans-latin-400-normal-AbCdEf12.woff2)';
  expect([...referencedAssets(js)].sort()).toEqual([
    'BarDiagram-C81Mw_-g.css',
    'BarDiagram-H4-Gzg3k.js',
    'ibm-plex-sans-latin-400-normal-AbCdEf12.woff2',
    'vendor-CW9Do0P6.js',
  ]);
});

it('crawls the live site from its entry, skipping files already kept', async () => {
  const files = {
    '/': '<script type="module" src="/app-assets/assets/index-AAAAAAAA.js"></script>',
    '/app-assets/assets/index-AAAAAAAA.js': 'import("./Page-BBBBBBBB.js");"./Kept-CCCCCCCC.js"',
    '/app-assets/assets/Page-BBBBBBBB.js': 'import"./Page-DDDDDDDD.css"',
    '/app-assets/assets/Page-DDDDDDDD.css': 'url(./font-EEEEEEEE.woff2)',
    '/app-assets/assets/font-EEEEEEEE.woff2': 'font',
  };
  const fetchImpl = async (url) => {
    const body = files[new URL(url).pathname];
    return body === undefined
      ? new Response('missing', { status: 404 })
      : new Response(body, { status: 200 });
  };
  const live = await fetchLiveAssets('https://example.test', {
    fetchImpl,
    have: new Set(['Kept-CCCCCCCC.js']),
    log: () => {},
  });
  expect(Object.keys(live).sort()).toEqual([
    'Page-BBBBBBBB.js',
    'Page-DDDDDDDD.css',
    'font-EEEEEEEE.woff2',
    'index-AAAAAAAA.js',
  ]);
});
