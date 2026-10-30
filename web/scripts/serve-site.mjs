#!/usr/bin/env node
// Serves the assembled site (<repo>/_site) the way GitHub Pages would, for smoke tests.
//
// Usage: node scripts/serve-site.mjs [--port 4173] [--host 127.0.0.1] [--dir <dir>]
//   PORT is also honoured.

import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createStaticHandler } from './static-handler.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const { values: args } = parseArgs({
  options: {
    port: { type: 'string' },
    host: { type: 'string' },
    dir: { type: 'string' },
  },
});

const dir = path.resolve(args.dir ?? path.join(repoRoot, '_site'));
const port = Number(args.port ?? process.env.PORT ?? 4173);
const host = args.host ?? '127.0.0.1';

if (!existsSync(dir)) {
  console.error(`serve-site: ${dir} not found. Run: npm run build && npm run assemble`);
  process.exit(1);
}
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`serve-site: invalid port ${args.port ?? process.env.PORT}`);
  process.exit(1);
}

const handle = createStaticHandler(dir);
const server = createServer((req, res) => {
  res.on('finish', () => console.log(`${res.statusCode} ${req.method} ${req.url}`));
  handle(req, res);
});

server.on('error', (err) => {
  console.error(`serve-site: ${err.message}`);
  process.exit(1);
});
server.listen(port, host, () => console.log(`serve-site: ${dir} at http://${host}:${port}/`));

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
