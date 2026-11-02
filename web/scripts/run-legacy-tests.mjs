#!/usr/bin/env node
// Runs every tracked legacy *.test.mjs with plain `node`, one at a time, from
// the repo root. The legacy tests are self-contained scripts (node:assert, some
// node:test) that exit non-zero on failure; a "FAIL" line in the output is also
// treated as a failure in case a script forgets to set its exit code.

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const TIMEOUT_MS = 120_000;

// A parent `node --test` would make node:test children report to it instead of exiting.
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;

const files = execFileSync('git', ['ls-files', '-z', '--', '*.test.mjs'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\0')
  .filter((f) => f && !f.startsWith('web/'));

if (files.length === 0) {
  console.error('test:legacy: no tracked *.test.mjs files found');
  process.exit(1);
}

const failed = [];
for (const file of files) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [file], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    env,
  });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const ms = Date.now() - started;
  let reason = null;
  if (run.error)
    reason =
      run.error.code === 'ETIMEDOUT' ? `timed out after ${TIMEOUT_MS} ms` : run.error.message;
  else if (run.signal) reason = `killed by ${run.signal}`;
  else if (run.status !== 0) reason = `exit code ${run.status}`;
  else if (/^\s*FAIL\b/m.test(output)) reason = 'printed FAIL but exited 0';

  if (reason) {
    failed.push(file);
    console.log(`FAIL ${file} (${reason}, ${ms} ms)`);
    console.log(output.replace(/^/gm, '     '));
  } else {
    console.log(`ok   ${file} (${ms} ms)`);
  }
}

console.log(`\n${files.length - failed.length}/${files.length} legacy test files passed`);
if (failed.length) {
  console.log(`failed:\n${failed.map((f) => `  ${path.posix.normalize(f)}`).join('\n')}`);
  process.exit(1);
}
