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
    lazy: async () => ({
      Component: (await import('@/pages/general/GeneralHubPage')).GeneralHubPage,
    }),
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
      Component: (await import('@/pages/general/DepartmentRequestsHubPage'))
        .DepartmentRequestsHubPage,
    }),
  },
  {
    path: '/general/overtime',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/general/OvertimeHubPage')).OvertimeHubPage,
    }),
  },
  {
    path: '/general/vacation',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/general/VacationHubPage')).VacationHubPage,
    }),
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
  {
    path: '/procurement',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/procurement/ProcurementHubPage')).ProcurementHubPage,
    }),
  },
  {
    path: '/procurement/purchase-requests',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/procurement/PurchaseRequestsHubPage'))
        .PurchaseRequestsHubPage,
    }),
  },
  {
    path: '/procurement/reports',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/procurement/ProcurementReportsHubPage'))
        .ProcurementReportsHubPage,
    }),
  },
  {
    path: '/procurement/suppliers',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/procurement/SuppliersHubPage')).SuppliersHubPage,
    }),
  },
  {
    path: '/planning',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/planning/PlanningHubPage')).PlanningHubPage,
    }),
  },
  {
    path: '/planning/inventory',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/planning/InventoryHubPage')).InventoryHubPage,
    }),
  },
  {
    path: '/logistics',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/logistics/LogisticsHubPage')).LogisticsHubPage,
    }),
  },
  {
    path: '/accounting',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/accounting/AccountingHubPage')).AccountingHubPage,
    }),
  },
  {
    path: '/finance',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/finance/FinanceHubPage')).FinanceHubPage,
    }),
  },
  {
    path: '/finance/reports',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/finance/FinanceReportsHubPage')).FinanceReportsHubPage,
    }),
  },
  {
    path: '/management',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/management/ManagementHubPage')).ManagementHubPage,
    }),
  },
  {
    path: '/management/reports',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/management/reports/ManagementReportsHubPage'))
        .ManagementReportsHubPage,
    }),
  },
  {
    path: '/human_resources',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/human_resources/HumanResourcesHubPage'))
        .HumanResourcesHubPage,
    }),
  },
  {
    path: '/human_resources/attendance',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/human_resources/attendance/AttendanceHubPage'))
        .AttendanceHubPage,
    }),
  },
  {
    path: '/quality-control',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/quality-control/QualityControlHubPage'))
        .QualityControlHubPage,
    }),
  },
  {
    path: '/projects',
    handle: hub,
    lazy: async () => ({
      Component: (await import('@/pages/projects/ProjectsHubPage')).ProjectsHubPage,
    }),
  },
  {
    path: '/design',
    handle: hub,
    lazy: async () => ({ Component: (await import('@/pages/design/DesignHubPage')).DesignHubPage }),
  },
  // ---- Genel list pages (Phase 3b) ----
  {
    path: '/general/crane-requests/list',
    lazy: async () => ({
      Component: (await import('@/pages/general/crane-requests/list/CraneRequestsListPage'))
        .CraneRequestsListPage,
    }),
  },
  {
    path: '/general/crane-requests/pending',
    lazy: async () => ({
      Component: (await import('@/pages/general/crane-requests/pending/CraneRequestsPendingPage'))
        .CraneRequestsPendingPage,
    }),
  },
  {
    path: '/general/crane-requests/prices',
    lazy: async () => ({
      Component: (await import('@/pages/general/crane-requests/prices/CranePricesPage'))
        .CranePricesPage,
    }),
  },
  {
    path: '/general/department-requests/list',
    lazy: async () => ({
      Component: (
        await import('@/pages/general/department-requests/list/DepartmentRequestsListPage')
      ).DepartmentRequestsListPage,
    }),
  },
  {
    path: '/general/department-requests/pending',
    lazy: async () => ({
      Component: (
        await import('@/pages/general/department-requests/pending/PendingDepartmentRequestsPage')
      ).PendingDepartmentRequestsPage,
    }),
  },
  {
    path: '/general/overtime/pending',
    lazy: async () => ({
      Component: (await import('@/pages/general/overtime/pending/OvertimePendingPage'))
        .OvertimePendingPage,
    }),
  },
  {
    path: '/general/overtime/registry',
    lazy: async () => ({
      Component: (await import('@/pages/general/overtime/registry/OvertimeRegistryPage'))
        .OvertimeRegistryPage,
    }),
  },
  {
    path: '/general/overtime/users',
    lazy: async () => ({
      Component: (await import('@/pages/general/overtime/users/OvertimeUsersPage'))
        .OvertimeUsersPage,
    }),
  },
  {
    path: '/general/overtime/welding-report',
    lazy: async () => ({
      Component: (await import('@/pages/general/overtime/welding-report/WeldingReportPage'))
        .WeldingReportPage,
    }),
  },
  {
    path: '/general/vacation/pending',
    lazy: async () => ({
      Component: (await import('@/pages/general/vacation/pending/VacationPendingPage'))
        .VacationPendingPage,
    }),
  },
  {
    path: '/general/vacation/requests',
    lazy: async () => ({
      Component: (await import('@/pages/general/vacation/requests/VacationRequestsPage'))
        .VacationRequestsPage,
    }),
  },
  {
    path: '/general/machines',
    lazy: async () => ({
      Component: (await import('@/pages/general/machines/MachinesPage')).MachinesPage,
    }),
  },
  {
    path: '/general/notifications',
    lazy: async () => ({
      Component: (await import('@/pages/general/notifications/NotificationsPage'))
        .NotificationsPage,
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
