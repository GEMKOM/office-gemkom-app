import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { theme } from '@/theme';
import { RouteError } from './RouteError';
import { isStaleChunkError, page, reloadForNewVersion } from './staleChunk';

const STALE =
  'Failed to fetch dynamically imported module: https://ofis.gemcore.com.tr/app-assets/assets/EstimatesPage-KzMRwZyr.js';

function renderFailing(error: Error) {
  const router = createMemoryRouter(
    [
      {
        ErrorBoundary: RouteError,
        children: [
          {
            path: '/projects/estimates',
            lazy: async () => {
              throw error;
            },
          },
        ],
      },
    ],
    { initialEntries: ['/projects/estimates'] },
  );
  return render(
    <MantineProvider theme={theme}>
      <RouterProvider router={router} />
    </MantineProvider>,
  );
}

let reload: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sessionStorage.clear();
  reload = vi.spyOn(page, 'reload').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('isStaleChunkError', () => {
  it('knows the browsers’ wordings for a chunk a deploy removed', () => {
    expect(isStaleChunkError(new TypeError(STALE))).toBe(true);
    expect(
      isStaleChunkError(new TypeError('error loading dynamically imported module: x.js')),
    ).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError(new Error('Unable to preload CSS for /app-assets/assets/x.css'))).toBe(
      true,
    );
    expect(isStaleChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe('reloadForNewVersion', () => {
  it('reloads once in a short window, so a chunk that is really gone cannot loop', () => {
    expect(reloadForNewVersion(1_000_000)).toBe(true);
    expect(reloadForNewVersion(1_005_000)).toBe(false);
    expect(reloadForNewVersion(1_020_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});

describe('RouteError', () => {
  it('reloads for the new version when a page chunk is gone', async () => {
    renderFailing(new TypeError(STALE));
    expect(await screen.findByText('Uygulamanın yeni sürümü yükleniyor…')).toBeInTheDocument();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('after a reload that did not help, asks the user to refresh instead of looping', async () => {
    reloadForNewVersion();
    reload.mockClear();
    renderFailing(new TypeError(STALE));
    expect(await screen.findByText('Uygulama güncellendi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sayfayı yenile' })).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows other errors with their message, without reloading', async () => {
    renderFailing(new Error('Cannot read properties of undefined'));
    expect(await screen.findByText('Bir hata oluştu')).toBeInTheDocument();
    expect(screen.getByText('Cannot read properties of undefined')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana sayfa' })).toHaveAttribute('href', '/');
    expect(reload).not.toHaveBeenCalled();
  });
});
