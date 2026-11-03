import { createBrowserRouter, type RouteObject } from 'react-router';
import type { RouteAccessHandle } from '@/auth/RequireRoute';
import { NotFound } from '@/pages/NotFound';
import { RootLayout } from '@/shell/RootLayout';
import { RouteLoading } from './RouteLoading';

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
  {
    path: '/sales/catalog',
    lazy: async () => ({
      Component: (await import('@/pages/sales/catalog/CatalogPage')).CatalogPage,
    }),
  },
  {
    path: '/sales/cost-table',
    lazy: async () => ({
      Component: (await import('@/pages/sales/cost-table/CostTablePage')).CostTablePage,
    }),
  },
  {
    path: '/sales/offers',
    lazy: async () => ({
      Component: (await import('@/pages/sales/offers/OffersPage')).OffersPage,
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
  { path: '/manufacturing/maintenance/reports', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/reports', handle: hub, lazy: manufacturingHub },
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
    path: '/projects/estimates',
    lazy: async () => ({
      Component: (await import('@/pages/projects/estimates/EstimatesPage')).EstimatesPage,
    }),
  },
  {
    path: '/projects/references',
    lazy: async () => ({
      Component: (await import('@/pages/projects/references/ReferencesPage')).ReferencesPage,
    }),
  },
  {
    path: '/projects/project-tracking',
    lazy: async () => ({
      Component: (await import('@/pages/projects/project-tracking/ProjectTrackingPage'))
        .ProjectTrackingPage,
    }),
  },
  {
    path: '/design',
    handle: hub,
    lazy: async () => ({ Component: (await import('@/pages/design/DesignHubPage')).DesignHubPage }),
  },
  // Bilgi İşlem list pages (Phase 3b).
  {
    path: '/it/approvals',
    lazy: async () => ({
      Component: (await import('@/pages/it/approvals/ApprovalsPage')).ApprovalsPage,
    }),
  },
  {
    path: '/it/feedback',
    lazy: async () => ({
      Component: (await import('@/pages/it/feedback/FeedbackPage')).FeedbackPage,
    }),
  },
  {
    path: '/it/groups',
    lazy: async () => ({ Component: (await import('@/pages/it/groups/GroupsPage')).GroupsPage }),
  },
  {
    path: '/it/inventory',
    lazy: async () => ({
      Component: (await import('@/pages/it/inventory/InventoryPage')).InventoryPage,
    }),
  },
  {
    path: '/it/neo',
    lazy: async () => ({ Component: (await import('@/pages/it/neo/NeoUsagePage')).NeoUsagePage }),
  },
  {
    path: '/it/password-resets',
    lazy: async () => ({
      Component: (await import('@/pages/it/password-resets/PasswordResetsPage')).PasswordResetsPage,
    }),
  },
  {
    path: '/it/permissions',
    lazy: async () => ({
      Component: (await import('@/pages/it/permissions/PermissionsPage')).PermissionsPage,
    }),
  },
  {
    path: '/it/job-completion',
    lazy: async () => ({
      Component: (await import('@/pages/it/job-completion/JobCompletionPage')).JobCompletionPage,
    }),
  },
  // Phase 3b: quality control, HR and other list pages.
  {
    path: '/quality-control/cost-lines',
    lazy: async () => ({
      Component: (await import('@/pages/quality-control/cost-lines/CostLinesPage')).CostLinesPage,
    }),
  },
  {
    path: '/quality-control/documents',
    lazy: async () => ({
      Component: (await import('@/pages/quality-control/documents/DocumentsPage')).DocumentsPage,
    }),
  },
  {
    path: '/quality-control/ncrs',
    lazy: async () => ({
      Component: (await import('@/pages/quality-control/ncrs/NcrsPage')).NcrsPage,
    }),
  },
  {
    path: '/quality-control/qc-reviews',
    lazy: async () => ({
      Component: (await import('@/pages/quality-control/qc-reviews/QcReviewsPage')).QcReviewsPage,
    }),
  },
  {
    path: '/human_resources/users',
    lazy: async () => ({
      Component: (await import('@/pages/human_resources/users/UsersPage')).UsersPage,
    }),
  },
  {
    path: '/human_resources/org/positions',
    lazy: async () => ({
      Component: (await import('@/pages/human_resources/org/positions/PositionsPage'))
        .PositionsPage,
    }),
  },
  {
    path: '/human_resources/org',
    lazy: async () => ({
      Component: (await import('@/pages/human_resources/org/OrgChartPage')).OrgChartPage,
    }),
  },
  {
    path: '/human_resources/attendance/pending-overrides',
    lazy: async () => ({
      Component: (
        await import('@/pages/human_resources/attendance/pending-overrides/PendingOverridesPage')
      ).PendingOverridesPage,
    }),
  },
  {
    path: '/human_resources/attendance/shift-rules',
    lazy: async () => ({
      Component: (await import('@/pages/human_resources/attendance/shift-rules/ShiftRulesPage'))
        .ShiftRulesPage,
    }),
  },
  {
    path: '/human_resources/attendance/summary',
    lazy: async () => ({
      Component: (await import('@/pages/human_resources/attendance/summary/AttendanceSummaryPage'))
        .AttendanceSummaryPage,
    }),
  },
  {
    path: '/accounting/subcontracting-statements',
    lazy: async () => ({
      Component: (
        await import('@/pages/accounting/subcontracting-statements/SubcontractingStatementsPage')
      ).SubcontractingStatementsPage,
    }),
  },
  {
    path: '/manufacturing/machining/create-task',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/machining/create-task/CreateTaskPage'))
        .CreateTaskPage,
    }),
  },
  // ---- department task pages (components/department-tasks) ----
  {
    path: '/design/projects',
    lazy: async () => ({
      Component: (await import('@/pages/design/projects/DesignProjectsPage')).DesignProjectsPage,
    }),
  },
  {
    path: '/logistics/projects',
    lazy: async () => ({
      Component: (await import('@/pages/logistics/projects/LogisticsProjectsPage'))
        .LogisticsProjectsPage,
    }),
  },
  {
    path: '/manufacturing/projects',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/projects/ManufacturingProjectsPage'))
        .ManufacturingProjectsPage,
    }),
  },
  {
    path: '/planning/projects',
    lazy: async () => ({
      Component: (await import('@/pages/planning/projects/PlanningProjectsPage'))
        .PlanningProjectsPage,
    }),
  },
  {
    path: '/procurement/projects',
    lazy: async () => ({
      Component: (await import('@/pages/procurement/projects/ProcurementProjectsPage'))
        .ProcurementProjectsPage,
    }),
  },
  {
    path: '/design/revision-requests',
    lazy: async () => ({
      Component: (await import('@/pages/design/revision-requests/RevisionRequestsPage'))
        .RevisionRequestsPage,
    }),
  },
  {
    path: '/logistics/cost-lines',
    lazy: async () => ({
      Component: (await import('@/pages/logistics/cost-lines/ShippingCostLinesPage'))
        .ShippingCostLinesPage,
    }),
  },
  {
    path: '/finance/purchase-orders',
    lazy: async () => ({
      Component: (await import('@/pages/finance/purchase-orders/FinanceOperationsPage'))
        .FinanceOperationsPage,
    }),
  },
  {
    path: '/finance/reports/projects',
    lazy: async () => ({
      Component: (await import('@/pages/finance/reports/projects/ProjectsReportPage'))
        .ProjectsReportPage,
    }),
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
  // Phase 3b: CNC kesim, lineer kesim and talaşlı imalat lists and reports.
  { path: '/manufacturing/cnc-cutting/reports', handle: hub, lazy: manufacturingHub },
  { path: '/manufacturing/machining/reports', handle: hub, lazy: manufacturingHub },
  {
    path: '/manufacturing/cnc-cutting/dashboard',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/cnc-cutting/dashboard/CncDashboardPage'))
        .CncDashboardPage,
    }),
  },
  {
    path: '/manufacturing/linear-cutting/dashboard',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/linear-cutting/dashboard/LinearCuttingDashboardPage')
      ).LinearCuttingDashboardPage,
    }),
  },
  {
    path: '/manufacturing/linear-cutting/cuts',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/linear-cutting/cuts/LinearCuttingCutsPage'))
        .LinearCuttingCutsPage,
    }),
  },
  {
    path: '/manufacturing/linear-cutting/tasks',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/linear-cutting/tasks/LinearCuttingTasksPage'))
        .LinearCuttingTasksPage,
    }),
  },
  {
    path: '/manufacturing/machining/dashboard',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/machining/dashboard/MachiningDashboardPage'))
        .MachiningDashboardPage,
    }),
  },
  {
    path: '/manufacturing/cnc-cutting/reports/finished-timers',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/cnc-cutting/reports/finished-timers/CncFinishedTimersPage')
      ).CncFinishedTimersPage,
    }),
  },
  {
    path: '/manufacturing/cnc-cutting/reports/user-report',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/cnc-cutting/reports/user-report/CncUserReportPage')
      ).CncUserReportPage,
    }),
  },
  {
    path: '/manufacturing/machining/reports/finished-timers',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/machining/reports/finished-timers/MachiningFinishedTimersPage')
      ).MachiningFinishedTimersPage,
    }),
  },
  {
    path: '/manufacturing/machining/reports/user-report',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/machining/reports/user-report/MachiningUserReportPage')
      ).MachiningUserReportPage,
    }),
  },
  {
    path: '/manufacturing/cnc-cutting/cuts',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/cnc-cutting/cuts/CncCutsPage')).CncCutsPage,
    }),
  },
  {
    path: '/manufacturing/cnc-cutting/remnants',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/cnc-cutting/remnants/RemnantsPage'))
        .RemnantsPage,
    }),
  },
  {
    path: '/manufacturing/cnc-cutting/reports/parts-search',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/cnc-cutting/reports/parts-search/PartsSearchPage')
      ).PartsSearchPage,
    }),
  },
  {
    path: '/manufacturing/machining/reports/cost-analysis',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/machining/reports/cost-analysis/CostAnalysisPage')
      ).CostAnalysisPage,
    }),
  },
  // Manufacturing shop-floor lists and reports (Phase 3b).
  {
    path: '/manufacturing/subcontracting/adjustments',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/subcontracting/adjustments/AdjustmentsPage'))
        .AdjustmentsPage,
    }),
  },
  {
    path: '/manufacturing/subcontracting/subcontractors',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/subcontracting/subcontractors/SubcontractorsPage')
      ).SubcontractorsPage,
    }),
  },
  {
    path: '/manufacturing/welding/reports/cost-analysis',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/welding/reports/cost-analysis/CostAnalysisPage')
      ).CostAnalysisPage,
    }),
  },
  {
    path: '/manufacturing/welding/reports/user-work-hours',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/welding/reports/user-work-hours/UserWorkHoursPage')
      ).UserWorkHoursPage,
    }),
  },
  {
    path: '/manufacturing/welding/teams',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/welding/teams/WeldingTeamsPage'))
        .WeldingTeamsPage,
    }),
  },
  {
    path: '/manufacturing/reports/combined-job-costs',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/reports/combined-job-costs/CombinedJobCostsPage')
      ).CombinedJobCostsPage,
    }),
  },
  {
    path: '/manufacturing/material-tracking',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/material-tracking/MaterialTrackingPage'))
        .MaterialTrackingPage,
    }),
  },
  {
    path: '/manufacturing/material-tracking/pull-requests',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/material-tracking/pull-requests/PullRequestsPage')
      ).PullRequestsPage,
    }),
  },
  {
    path: '/manufacturing/maintenance/dashboard',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/maintenance/dashboard/MaintenanceDashboardPage')
      ).MaintenanceDashboardPage,
    }),
  },
  {
    path: '/manufacturing/maintenance/fault-requests',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/maintenance/fault-requests/FaultRequestsPage')
      ).FaultRequestsPage,
    }),
  },
  {
    path: '/manufacturing/maintenance/reports/faults',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/maintenance/reports/faults/FaultsReportPage'))
        .FaultsReportPage,
    }),
  },
  {
    path: '/manufacturing/maintenance/reports/monthly-metrics',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/maintenance/reports/monthly-metrics/MonthlyMetricsPage')
      ).MonthlyMetricsPage,
    }),
  },
  {
    path: '/manufacturing/maintenance/reports/staff-report',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/maintenance/reports/staff-report/StaffReportPage')
      ).StaffReportPage,
    }),
  },
  // Phase 3b: planning and procurement lists.
  {
    path: '/planning/inventory/cards',
    lazy: async () => ({
      Component: (await import('@/pages/planning/inventory/cards/InventoryCardsPage'))
        .InventoryCardsPage,
    }),
  },
  {
    path: '/planning/inventory/equipment',
    lazy: async () => ({
      Component: (await import('@/pages/planning/inventory/equipment/EquipmentPage')).EquipmentPage,
    }),
  },
  {
    path: '/planning/items',
    lazy: async () => ({
      Component: (await import('@/pages/planning/items/PlanningItemsPage')).PlanningItemsPage,
    }),
  },
  {
    path: '/planning/department-requests',
    lazy: async () => ({
      Component: (await import('@/pages/planning/department-requests/DepartmentRequestsPage'))
        .DepartmentRequestsPage,
    }),
  },
  {
    path: '/procurement/critical-items',
    lazy: async () => ({
      Component: (await import('@/pages/procurement/critical-items/CriticalItemsPage'))
        .CriticalItemsPage,
    }),
  },
  {
    path: '/procurement/reports/items',
    lazy: async () => ({
      Component: (await import('@/pages/procurement/reports/items/ItemsReportPage'))
        .ItemsReportPage,
    }),
  },
  {
    path: '/procurement/reports/staff',
    lazy: async () => ({
      Component: (await import('@/pages/procurement/reports/staff/StaffReportPage'))
        .StaffReportPage,
    }),
  },
  {
    path: '/procurement/reports/suppliers',
    lazy: async () => ({
      Component: (await import('@/pages/procurement/reports/suppliers/SuppliersReportPage'))
        .SuppliersReportPage,
    }),
  },
  {
    path: '/procurement/suppliers/list',
    lazy: async () => ({
      Component: (await import('@/pages/procurement/suppliers/list/SuppliersPage')).SuppliersPage,
    }),
  },
  {
    path: '/procurement/suppliers/payment-terms',
    lazy: async () => ({
      Component: (await import('@/pages/procurement/suppliers/payment-terms/PaymentTermsPage'))
        .PaymentTermsPage,
    }),
  },
  // Talaşlı İmalat tasks
  {
    path: '/manufacturing/machining/tasks/list',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/machining/tasks/list/MachiningPartsPage'))
        .MachiningPartsPage,
    }),
  },
  {
    path: '/manufacturing/machining/tasks/create',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/machining/tasks/create/MachiningCreateTasksPage')
      ).MachiningCreateTasksPage,
    }),
  },
  {
    path: '/planning/procurement-lines',
    lazy: async () => ({
      Component: (await import('@/pages/planning/procurement-lines/ProcurementLinesPage'))
        .ProcurementLinesPage,
    }),
  },
  {
    path: '/general/overtime/cost-report',
    lazy: async () => ({
      Component: (await import('@/pages/general/overtime/cost-report/CostReportPage'))
        .CostReportPage,
    }),
  },
  {
    path: '/general/overtime/machining-report',
    lazy: async () => ({
      Component: (await import('@/pages/general/overtime/machining-report/MachiningReportPage'))
        .MachiningReportPage,
    }),
  },
  {
    path: '/manufacturing/machining/reports/daily-efficiency',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/machining/reports/daily-efficiency/DailyEfficiencyPage')
      ).DailyEfficiencyPage,
    }),
  },
  {
    path: '/manufacturing/machining/reports/performance',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/machining/reports/performance/PerformanceReportPage')
      ).PerformanceReportPage,
    }),
  },
  {
    path: '/manufacturing/machining/reports/sum-report',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/machining/reports/sum-report/SumReportPage'))
        .SumReportPage,
    }),
  },
  {
    path: '/human_resources/vacation',
    lazy: async () => ({
      Component: (await import('@/pages/human_resources/vacation/HrVacationPage')).HrVacationPage,
    }),
  },
  {
    path: '/human_resources/attendance/records',
    lazy: async () => ({
      Component: (await import('@/pages/human_resources/attendance/records/AttendanceRecordsPage'))
        .AttendanceRecordsPage,
    }),
  },
  {
    path: '/procurement/purchase-requests/create',
    lazy: async () => ({
      Component: (await import('@/pages/procurement/purchase-requests/create/CreatePurchaseRequestPage'))
        .CreatePurchaseRequestPage,
    }),
  },
  {
    path: '/procurement/purchase-requests/pending',
    lazy: async () => ({
      Component: (await import('@/pages/procurement/purchase-requests/pending/PendingRequestsPage'))
        .PendingRequestsPage,
    }),
  },
  {
    path: '/procurement/purchase-requests/registry',
    lazy: async () => ({
      Component: (await import('@/pages/procurement/purchase-requests/registry/RegistryPage'))
        .RegistryPage,
    }),
  },
  {
    path: '/procurement/payment-lists',
    lazy: async () => ({
      Component: (await import('@/pages/procurement/payment-lists/PaymentListsPage'))
        .PaymentListsPage,
    }),
  },
  {
    path: '/planning/task-templates',
    lazy: async () => ({
      Component: (await import('@/pages/planning/task-templates/TaskTemplatesPage'))
        .TaskTemplatesPage,
    }),
  },
  {
    path: '/planning/project-planning',
    lazy: async () => ({
      Component: (await import('@/pages/planning/project-planning/ProjectPlanningPage'))
        .ProjectPlanningPage,
    }),
  },
  {
    path: '/manufacturing/welding/time-entries',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/welding/time-entries/TimeEntriesPage'))
        .TimeEntriesPage,
    }),
  },
  {
    path: '/manufacturing/welding/timesheets',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/welding/timesheets/TimesheetsPage'))
        .TimesheetsPage,
    }),
  },
  {
    path: '/it/notifications',
    lazy: async () => ({
      Component: (await import('@/pages/it/notifications/NotificationConfigsPage'))
        .NotificationConfigsPage,
    }),
  },
  {
    path: '/manufacturing/subcontracting/labor-pricing',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/subcontracting/labor-pricing/LaborPricingPage')
      ).LaborPricingPage,
    }),
  },
  {
    path: '/manufacturing/subcontracting/overview',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/subcontracting/overview/OverviewPage'))
        .OverviewPage,
    }),
  },
  {
    path: '/manufacturing/subcontracting/statements',
    lazy: async () => ({
      Component: (await import('@/pages/manufacturing/subcontracting/statements/StatementsPage'))
        .StatementsPage,
    }),
  },
  // Attachments, file preview and rich text (discussions)
  {
    path: '/general/discussions',
    lazy: async () => ({
      Component: (await import('@/pages/general/discussions/DiscussionsPage')).DiscussionsPage,
    }),
  },
  {
    path: '/isg/issues',
    lazy: async () => ({
      Component: (await import('@/pages/isg/issues/IsgIssuesPage')).IsgIssuesPage,
    }),
  },
  {
    path: '/design/release-approvals',
    lazy: async () => ({
      Component: (await import('@/pages/design/release-approvals/ReleaseApprovalsPage'))
        .ReleaseApprovalsPage,
    }),
  },
  // Capacity planning and machining reports on the React Gantt.
  {
    path: '/manufacturing/cnc-cutting/capacity/planning',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/cnc-cutting/capacity/planning/CncPlanningPage')
      ).CncPlanningPage,
    }),
  },
  {
    path: '/manufacturing/linear-cutting/capacity/planning',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/linear-cutting/capacity/planning/LinearPlanningPage')
      ).LinearPlanningPage,
    }),
  },
  {
    path: '/manufacturing/machining/capacity/planning',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/machining/capacity/planning/MachiningPlanningPage')
      ).MachiningPlanningPage,
    }),
  },
  {
    path: '/manufacturing/machining/reports/history',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/machining/reports/history/MachiningHistoryPage')
      ).MachiningHistoryPage,
    }),
  },
  {
    path: '/manufacturing/machining/reports/production-plan',
    lazy: async () => ({
      Component: (
        await import('@/pages/manufacturing/machining/reports/production-plan/ProductionPlanPage')
      ).ProductionPlanPage,
    }),
  },
  // Management and finance dashboards (charts load with these pages only).
  {
    path: '/management/reports/overview',
    lazy: async () => ({
      Component: (await import('@/pages/management/reports/overview/OverviewReportPage'))
        .OverviewReportPage,
    }),
  },
  {
    path: '/finance/reports/executive-overview',
    lazy: async () => ({
      Component: (await import('@/pages/finance/reports/executive-overview/ExecutiveOverviewPage'))
        .ExecutiveOverviewPage,
    }),
  },
  {
    path: '/management/reports/cash-flow',
    lazy: async () => ({
      Component: (await import('@/pages/management/reports/cash-flow/CashFlowReportPage'))
        .CashFlowReportPage,
    }),
  },
  {
    path: '/management/dashboard',
    lazy: async () => ({
      Component: (await import('@/pages/management/dashboard/ManagementDashboardPage'))
        .ManagementDashboardPage,
    }),
  },
  {
    path: '/management/analytics',
    lazy: async () => ({
      Component: (await import('@/pages/management/analytics/AnalyticsPage')).AnalyticsPage,
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
      {
        path: '/react-preview/gantt',
        lazy: async () => ({ Component: (await import('@/pages/dev/GanttPreview')).GanttPreview }),
      },
    ]
  : [];

// Signed-out pages: outside RootLayout, so no session check, rail or band.
// They are listed in migrated-routes.json like the app routes.
export const publicRoutes: RouteObject[] = [
  {
    path: '/login',
    lazy: async () => ({ Component: (await import('@/pages/auth/LoginPage')).LoginPage }),
  },
  {
    path: '/login/reset-password',
    lazy: async () => ({
      Component: (await import('@/pages/auth/ResetPasswordPage')).ResetPasswordPage,
    }),
  },
  {
    // Plan ve Sapmalar on its own: opened by a customer's share link without a
    // session (?share=), or by the office for printing (?job_no=, whose API
    // call signs in through apiFetch as usual).
    path: '/projects/plan-sheet',
    lazy: async () => ({
      Component: (await import('@/pages/projects/plan-sheet/PlanSheetPage')).PlanSheetPage,
    }),
  },
];

// The pathless top route only gives the first load something to show while
// the opened page's lazy chunk loads (React Router warns without one).
export const routeTree: RouteObject[] = [
  {
    HydrateFallback: RouteLoading,
    children: [
      ...publicRoutes,
      {
        Component: RootLayout,
        children: [...appRoutes, ...devRoutes, { path: '*', Component: NotFound }],
      },
    ],
  },
];

export const router = createBrowserRouter(routeTree);
