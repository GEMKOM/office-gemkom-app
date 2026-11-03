// Reports that were one page per department and are now one report with a
// view switch. Each old URL forwards to the merged report with its view preset
// (router.tsx builds the redirects from this list; the e2e smoke test expects them).
export const MERGED_REPORT_ROUTES: Record<string, { to: string; preset: Record<string, string> }> = {
  '/manufacturing/cnc-cutting/reports/finished-timers': {
    to: '/manufacturing/reports/finished-timers',
    preset: { module: 'cnc_cutting' },
  },
  '/manufacturing/machining/reports/finished-timers': {
    to: '/manufacturing/reports/finished-timers',
    preset: { module: 'machining' },
  },
  '/manufacturing/cnc-cutting/reports/user-report': {
    to: '/manufacturing/reports/user-report',
    preset: { module: 'cnc_cutting' },
  },
  '/manufacturing/machining/reports/user-report': {
    to: '/manufacturing/reports/user-report',
    preset: { module: 'machining' },
  },
  '/manufacturing/reports/combined-job-costs': {
    to: '/manufacturing/reports/job-costs',
    preset: { breakdown: 'combined' },
  },
  '/manufacturing/machining/reports/cost-analysis': {
    to: '/manufacturing/reports/job-costs',
    preset: { breakdown: 'machining' },
  },
  '/manufacturing/welding/reports/cost-analysis': {
    to: '/manufacturing/reports/job-costs',
    preset: { breakdown: 'welding' },
  },
};
