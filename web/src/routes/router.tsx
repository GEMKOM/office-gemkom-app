import { createBrowserRouter, type RouteObject } from 'react-router';
import type { RouteAccessHandle } from '@/auth/RequireRoute';
import { NotFound } from '@/pages/NotFound';
import { RootLayout } from '@/shell/RootLayout';

const hub: RouteAccessHandle = { access: 'hub' };

// One page for every manufacturing hub; it picks its cards by path.
const manufacturingHub = async () => ({
  Component: (await import('@/pages/manufacturing/ManufacturingHubPage')).ManufacturingHubPage,
});

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
  { path: '/manufacturing', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/cnc-cutting', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/cnc-cutting/capacity', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/linear-cutting', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/linear-cutting/capacity', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/machining', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/machining/capacity', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/machining/tasks', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/maintenance', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/subcontracting', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/welding', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/welding/reports', handle: hub, lazy: manufacturingHub },
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
