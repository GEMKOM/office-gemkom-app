import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { legacyStatic } from './vite/legacyStatic.ts';
import { scriptFetchDest } from './vite/scriptFetchDest.ts';

// The legacy app lives one level up and is served from the site root. The React
// app imports a few of its modules as-is (auth, access control, navigation) so
// both sides share one session and one route tree while they coexist.
const legacyRoot = fileURLToPath(new URL('..', import.meta.url));
const srcRoot = fileURLToPath(new URL('./src', import.meta.url));
const routesFile = fileURLToPath(new URL('./src/routes/migrated-routes.json', import.meta.url));
// Vite's pre-bundled dependencies, kept per checkout instead of in node_modules/.vite.
// Worktrees link node_modules from the main checkout, so with the default every
// dev server shares one deps folder. The chunk names there depend on the path
// from the cache to node_modules, so each server writes differently named React
// chunks and deletes the others'. A page that loads its libraries later (the
// chart pages) then gets a second React, and Mantine's use() reads a null
// dispatcher: "Cannot read properties of null (reading 'use')".
const cacheDir = fileURLToPath(new URL('./.vite', import.meta.url));

// Recharts and the packages only it pulls in; see the chunk groups below.
const CHART_PACKAGES =
  /node_modules[\\/](@mantine[\\/]charts|recharts|@reduxjs|immer|react-redux|reselect|redux|redux-thunk|decimal\.js-light|es-toolkit|eventemitter3|tiny-invariant|victory-vendor|d3-[^\\/]+|internmap)[\\/]/;

export default defineConfig(({ command }) => ({
  // Built files are published under /app-assets/; in dev the SPA is served at /.
  base: command === 'build' ? '/app-assets/' : '/',
  cacheDir,
  // legacyStatic: in dev, every non-migrated path is a legacy file from the repo root.
  // scriptFetchDest: see the file; keeps module loads compiled in misbehaving browsers.
  plugins: [scriptFetchDest(), react(), legacyStatic({ legacyRoot, routesFile })],
  resolve: {
    alias: {
      '@legacy': legacyRoot,
      '@': srcRoot,
    },
  },
  server: {
    // Not Vite's default 5173: that one is often taken by other local apps,
    // and passing --port through npm is unreliable in PowerShell.
    port: 5180,
    fs: { allow: [legacyRoot] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rolldownOptions: {
      output: {
        // Libraries change far less often than pages; separate chunks keep
        // them cached across deploys.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
            },
            // The shared chunks claim their modules first (equal priority goes
            // by order, and a claimed module leaves the later groups), so the
            // charts chunk keeps only what the dashboards alone use and no
            // other page loads it.
            {
              name: 'mantine',
              test: (id: string) =>
                /node_modules[\\/]@mantine[\\/]/.test(id) && !CHART_PACKAGES.test(id),
            },
            {
              name: 'vendor',
              test: (id: string) => /node_modules[\\/]/.test(id) && !CHART_PACKAGES.test(id),
            },
            { name: 'charts', test: CHART_PACKAGES },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'vite/**/*.test.ts'],
  },
}));
