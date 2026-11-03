// @vitest-environment node
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url));

describe('vite.config.ts', () => {
  // Worktrees link node_modules from the main checkout. A cache under
  // node_modules is then shared by every dev server, and their differently
  // named React chunks gave the chart pages a second React (see vite.config.ts).
  it('keeps the dev dependency cache in this checkout, outside node_modules', async () => {
    const config = await resolveConfig({ configFile, root: webRoot }, 'serve', 'development');
    const fromRoot = relative(webRoot, config.cacheDir);

    expect(fromRoot.startsWith('..')).toBe(false);
    expect(fromRoot.split(sep)).not.toContain('node_modules');
  });
});
