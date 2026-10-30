import { createBrowserRouter, type RouteObject } from 'react-router';
import type { RouteAccessHandle } from '@/auth/RequireRoute';
import { NotFound } from '@/pages/NotFound';
import { RootLayout } from '@/shell/RootLayout';

const hub: RouteAccessHandle = { access: 'hub' };

// Each migrated page is a lazy route so it ships as its own chunk. A route added
// here must also be listed in migrated-routes.json (router.test.ts checks this).
export const appRoutes: RouteObject[] = [
  {
    // The landing page; every signed-in user may open it ('/' is always allowed).
    path: '/',
    handle: hub,
    lazy: async () => ({ Component: (await import('@/pages/home/HomePage')).HomePage }),
  },
  {
    path: '/general',
    handle: hub,
    lazy: async () => ({ Component: (await import('@/pages/general/GeneralHubPage')).GeneralHubPage }),
  },
  {
    path: '/general/crane-requests',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/general/CraneRequestsHubPage')).CraneRequestsHubPage,
    }),
  },
  {
    path: '/general/department-requests',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/general/DepartmentRequestsHubPage')).DepartmentRequestsHubPage,
    }),
  },
  {
    path: '/general/overtime',
    handle: hub,
    lazy: async () => ({ Component: (await import('@/pages/general/OvertimeHubPage')).OvertimeHubPage }),
  },
  {
    path: '/general/vacation',
    handle: hub,
    lazy: async () => ({ Component: (await import('@/pages/general/VacationHubPage')).VacationHubPage }),
  },
  {
    path: '/it',
    handle: hub,
    lazy: async () => ({ Component: (await import('@/pages/it/ItHubPage')).ItHubPage }),
  },
  {
    path: '/isg',
    handle: hub,
    lazy: async () => ({ Component: (await import('@/pages/isg/IsgHubPage')).IsgHubPage }),
  },
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
