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

export default defineConfig(({ command }) => ({
  // Built files are published under /app-assets/; in dev the SPA is served at /.
  base: command === 'build' ? '/app-assets/' : '/',
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
            { name: 'mantine', test: /node_modules[\\/]@mantine[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
