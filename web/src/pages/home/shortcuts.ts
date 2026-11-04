import { hasRouteAccess } from '@/auth/accessControl';
import { findNavPage, topVisitedRoutes, type NavPage } from '@/shell/pageVisits';

// "Kısayollar": the pages the user pinned, then those they open most on this
// browser, topped up with their department's everyday pages until there are
// enough.

/** Department names by users' department_code (organization's seed data). */
export const DEPARTMENT_LABELS: Record<string, string> = {
  machining: 'Talaşlı İmalat',
  design: 'Dizayn',
  logistics: 'Lojistik',
  procurement: 'Satın Alma',
  welding: 'Kaynaklı İmalat',
  planning: 'Planlama',
  manufacturing: 'İmalat',
  maintenance: 'Bakım',
  rollingmill: 'Haddehane',
  qualitycontrol: 'Kalite Kontrol',
  cutting: 'CNC Kesim',
  warehouse: 'Ambar',
  finance: 'Finans',
  management: 'Yönetim',
  human_resources: 'İnsan Kaynakları',
  sales: 'Proje Taahhüt',
  accounting: 'Muhasebe',
};

/** Everyday pages per department (users' department_code). */
const DEPARTMENT_PAGES: Record<string, string[]> = {
  design: ['/design/projects', '/design/release-approvals', '/design/revision-requests', '/projects/project-tracking'],
  planning: [
    '/planning/projects',
    '/planning/department-requests',
    '/planning/project-planning',
    '/manufacturing/machining/capacity/planning',
    '/planning/inventory/cards',
  ],
  procurement: [
    '/procurement/purchase-requests/pending',
    '/procurement/purchase-requests/registry',
    '/procurement/projects',
    '/procurement/payment-lists',
    '/procurement/suppliers/list',
  ],
  finance: ['/finance/purchase-orders', '/procurement/payment-lists', '/finance/reports/projects'],
  accounting: ['/accounting/subcontracting-statements', '/finance/purchase-orders'],
  manufacturing: [
    '/manufacturing/projects',
    '/manufacturing/welding/time-entries',
    '/manufacturing/material-tracking',
    '/manufacturing/subcontracting/statements',
  ],
  welding: ['/manufacturing/welding/time-entries', '/manufacturing/welding/timesheets', '/manufacturing/welding/teams'],
  machining: [
    '/manufacturing/machining/dashboard',
    '/manufacturing/machining/tasks/list',
    '/manufacturing/machining/capacity/planning',
  ],
  maintenance: ['/manufacturing/maintenance/fault-requests', '/manufacturing/maintenance/dashboard', '/general/machines'],
  logistics: ['/logistics/projects', '/logistics/cost-lines'],
  qualitycontrol: ['/quality-control/qc-reviews', '/quality-control/ncrs', '/quality-control/documents'],
  cutting: ['/planning/cnc-cutting/cuts', '/planning/cnc-cutting/remnants', '/planning/cnc-cutting/capacity'],
  warehouse: ['/manufacturing/material-tracking/pull-requests', '/planning/inventory/cards'],
  sales: ['/sales/offers', '/sales/customers', '/sales/cost-table'],
  human_resources: ['/human_resources/users', '/human_resources/attendance/records', '/human_resources/vacation'],
  it: ['/it/inventory', '/it/permissions', '/it/password-resets'],
  management: ['/management/dashboard', '/management/reports/overview', '/projects/project-tracking'],
};

/** For everyone, after the department's own. */
const COMMON_PAGES = ['/general/vacation/requests', '/general/overtime/registry', '/isg/issues', '/general/discussions'];

export const SHORTCUT_COUNT = 6;

export interface Shortcut extends NavPage {
  pinned: boolean;
}

/**
 * The pinned pages first (all of them), then the most visited ones, then the
 * department's and everyone's everyday pages, up to `limit` in all. Pages the
 * user cannot open are left out.
 */
export function shortcuts(
  userId: number,
  departmentCode: string | null,
  pinned: readonly string[] = [],
  limit = SHORTCUT_COUNT,
): Shortcut[] {
  const candidates = [
    ...pinned,
    ...topVisitedRoutes(userId, limit * 2),
    ...(departmentCode ? (DEPARTMENT_PAGES[departmentCode] ?? []) : []),
    ...COMMON_PAGES,
  ];
  const pages: Shortcut[] = [];
  for (const route of new Set(candidates)) {
    const isPinned = pinned.includes(route);
    if (!isPinned && pages.length >= limit) break;
    const page = findNavPage(route);
    if (page && hasRouteAccess(route)) pages.push({ ...page, pinned: isPinned });
  }
  return pages;
}
