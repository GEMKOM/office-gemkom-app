import { createBrowserRouter, type RouteObject } from 'react-router';
import type { RouteAccessHandle } from '@/auth/RequireRoute';
import { NotFound } from '@/pages/NotFound';
import { RootLayout } from '@/shell/RootLayout';

const hub: RouteAccessHandle = { access: 'hub' };

// Each migrated page is a lazy route so it ships as its own chunk. A route added
// here must also be listed in migrated-routes.json (router.test.ts checks this).
export const appRoutes: RouteObject[] = [
  {
    path: '/sales',
    handle: hub,
    lazy: async () => ({ Component: (await import('@/pages/sales/SalesHubPage')).SalesHubPage }),
  },
  {
    path: '/sales/customers',
    lazy: async () => ({
      Component: (await import('@/pages/sales/customers/CustomersPage')).CustomersPage,
    }),
  },
];

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/react-preview',
        lazy: async () => ({ Component: (await import('@/pages/dev/ReactPreview')).ReactPreview }),
      },
      {
        path: '/react-preview/ui',
        lazy: async () => ({ Component: (await import('@/pages/dev/UiPreview')).UiPreview }),
      },
    ]
  : [];

export const routeTree: RouteObject[] = [
  {
    Component: RootLayout,
    children: [...appRoutes, ...devRoutes, { path: '*', Component: NotFound }],
  },
];

export const router = createBrowserRouter(routeTree);
