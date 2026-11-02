import type { MockHandlers, MockRequest } from '../fixtures';

// Realistic payloads for GET /reports/overview/{slice}/ (management/reports/overview),
// shaped after the fields the legacy page read. Names are obviously fake.

function meta(req: MockRequest) {
  const compare = req.query.get('compare') === 'true';
  const preset = req.query.get('preset');
  const from = req.query.get('date_from');
  const to = req.query.get('date_to');
  const range =
    from && to
      ? { date_from: from, date_to: to }
      : { date_from: '2026-11-01', date_to: '2026-11-30' };
  return {
    preset: preset ?? null,
    ...range,
    compare,
    ...(compare ? { prev_date_from: '2026-10-01', prev_date_to: '2026-10-31' } : {}),
  };
}

const withPrevious = (req: MockRequest, previous: Record<string, unknown>) =>
  req.query.get('compare') === 'true' ? { previous_period: previous } : {};

export const OVERVIEW_JOB_ORDERS = (req: MockRequest) => ({
  meta: meta(req),
  job_orders: {
    total_active: 42,
    total_completed_in_range: 9,
    total_started_in_range: 14,
    overdue: 3,
    avg_completion_pct: '61.35',
    by_status: { draft: 2, active: 8, completed: 3, on_hold: 1 },
  },
  costs: {
    jobs_with_cost_data: 9,
    jobs_with_selling_price: 7,
    total_selling_price_eur: '1840000.00',
    total_actual_cost_eur: '1325400.00',
    total_labor_cost_eur: '412300.00',
    total_material_cost_eur: '655800.00',
    total_subcontractor_cost_eur: '188900.00',
    avg_margin_pct: '27.96',
  },
});

const MANUFACTURING = {
  welding_hours: '3120.5',
  machining_hours: '2210.0',
  cnc_hours: '864.25',
  manufactured_tonnage_kg: '412350.75',
  total_productive_hours: '6680.4',
  machining_parts_completed: 318,
  machining_parts_remaining: 74,
  cnc_tasks_completed: 129,
  cnc_tasks_remaining: 22,
  welding_active_users: 38,
  machining_active_users: 17,
  cnc_active_users: 6,
};

export const OVERVIEW_OPERATIONS = (req: MockRequest) => ({
  meta: meta(req),
  manufacturing: MANUFACTURING,
  maintenance: {
    maintenance_hours: '486.0',
    maintenance_active_users: 5,
    faults_resolved_in_range: 27,
    faults_open: 6,
  },
  overtime: {
    requests_in_range: 46,
    requests_approved_in_range: 41,
    total_approved_hours: '612.5',
    by_team: [
      { team: 'manufacturing', hours: '488.0' },
      { team: 'planning', hours: '64.5' },
      { team: 'qualitycontrol', hours: '60.0' },
    ],
  },
  quality: {
    ncrs_opened_in_range: 12,
    ncrs_closed_in_range: 9,
    ncrs_open_total: 17,
    qc_reviews_in_range: 140,
    qc_reviews_approved: 128,
    qc_reviews_rejected: 12,
    ncrs_by_severity: { critical: 2, major: 6, minor: 9 },
    ncrs_by_defect_type: { 'Kaynak hatası': 5, 'Ölçü hatası': 4, 'Yüzey hatası': 2, Malzeme: 1 },
  },
  ...withPrevious(req, {
    manufacturing: { welding_hours: '2875.0', machining_hours: '2390.5', cnc_hours: '702.0' },
    maintenance: { maintenance_hours: '512.0' },
  }),
});

export const OVERVIEW_SALES = (req: MockRequest) => ({
  meta: meta(req),
  sales: {
    offers_created_in_range: 29,
    offers_won_in_range: 12,
    offers_lost_in_range: 7,
    total_won_value_eur: '2450000.00',
    total_lost_value_eur: '980000.00',
    total_pending_value_eur: '5120000.00',
    sales_consults_by_department: {
      design: 14,
      planning: 9,
      procurement: 7,
      manufacturing: 5,
      quality_control: 3,
    },
  },
});

export const OVERVIEW_SUBCONTRACTING = (req: MockRequest) => ({
  meta: meta(req),
  subcontracting: {
    total_approved_value: '486250.00',
    currency: 'EUR',
    total_awarded_weight_kg: '182400.00',
    total_unbilled_accrual_eur: '64300.00',
    by_subcontractor: [
      {
        name: 'E2E Taşeron Alfa',
        approved_total: '148000.00',
        currency: 'EUR',
        total_awarded_weight_kg: '52000',
      },
      {
        name: 'E2E Taşeron Beta',
        approved_total: '121500.00',
        currency: 'EUR',
        total_awarded_weight_kg: '48800',
      },
      {
        name: 'E2E Taşeron Gama',
        approved_total: '98750.00',
        currency: 'EUR',
        total_awarded_weight_kg: '41200',
      },
      {
        name: 'E2E Taşeron Delta',
        approved_total: '70000.00',
        currency: 'EUR',
        total_awarded_weight_kg: '25400',
      },
      {
        name: 'E2E Taşeron Epsilon',
        approved_total: '48000.00',
        currency: 'EUR',
        total_awarded_weight_kg: '15000',
      },
    ],
  },
  ...withPrevious(req, {
    subcontracting: {
      total_approved_value: '402100.00',
      currency: 'EUR',
      total_awarded_weight_kg: '160900.00',
      total_unbilled_accrual_eur: '71800.00',
      by_subcontractor: [
        {
          name: 'E2E Taşeron Alfa',
          approved_total: '131000.00',
          currency: 'EUR',
          total_awarded_weight_kg: '50000',
        },
        {
          name: 'E2E Taşeron Beta',
          approved_total: '126000.00',
          currency: 'EUR',
          total_awarded_weight_kg: '51000',
        },
        {
          name: 'E2E Taşeron Gama',
          approved_total: '82100.00',
          currency: 'EUR',
          total_awarded_weight_kg: '36900',
        },
        {
          name: 'E2E Taşeron Zeta',
          approved_total: '63000.00',
          currency: 'EUR',
          total_awarded_weight_kg: '23000',
        },
      ],
    },
  }),
});

const PROCUREMENT = {
  requests_submitted_in_range: 64,
  orders_created_in_range: 51,
  total_ordered_value_eur: '734900.00',
  payments_due_in_range: 38,
  payments_overdue: 4,
  total_payments_due_eur: '412700.00',
  top_items_by_quantity: [
    { item_name: 'E2E Sac 10 mm S355', total_quantity: '48200.00', unit: 'kg' },
    { item_name: 'E2E HEA 200 Profil', total_quantity: '18450.50', unit: 'kg' },
    { item_name: 'E2E M16 Cıvata', total_quantity: '3200.00', unit: 'adet' },
  ],
  top_items_by_cost: [
    { item_code: 'E2E-SAC-10', item_name: 'E2E Sac 10 mm S355', total_cost_eur: '68400.00' },
    { item_code: 'E2E-HEA-200', item_name: 'E2E HEA 200 Profil', total_cost_eur: '41250.00' },
    { item_code: 'E2E-BOYA-01', item_name: 'E2E Epoksi Astar', total_cost_eur: '18900.00' },
  ],
  top_suppliers_by_cost: [
    { supplier_name: 'E2E Tedarikçi Çelik A.Ş.', total_cost_eur: '212000.00' },
    { supplier_name: 'E2E Tedarikçi Profil Ltd.', total_cost_eur: '134500.00' },
    { supplier_name: 'E2E Tedarikçi Boya', total_cost_eur: '48700.00' },
  ],
  top_job_orders_by_cost: [
    { job_no: 'E2E-254-01', total_cost_eur: '188000.00' },
    { job_no: 'E2E-254-07', total_cost_eur: '97400.00' },
  ],
};

export const OVERVIEW_PROCUREMENT = (req: MockRequest) => ({
  meta: meta(req),
  procurement: PROCUREMENT,
  ...withPrevious(req, {
    procurement: {
      requests_submitted_in_range: 58,
      orders_created_in_range: 47,
      total_ordered_value_eur: '655300.00',
      payments_due_in_range: 41,
      payments_overdue: 6,
      total_payments_due_eur: '398000.00',
      top_items_by_quantity: [
        { item_name: 'E2E Sac 8 mm S235', total_quantity: '39800.00', unit: 'kg' },
      ],
      top_items_by_cost: [
        { item_code: 'E2E-SAC-08', item_name: 'E2E Sac 8 mm S235', total_cost_eur: '51200.00' },
      ],
      top_suppliers_by_cost: [
        { supplier_name: 'E2E Tedarikçi Çelik A.Ş.', total_cost_eur: '188300.00' },
      ],
      top_job_orders_by_cost: [{ job_no: 'E2E-253-11', total_cost_eur: '102000.00' }],
    },
  }),
});

export const handlers: MockHandlers = {
  'GET /reports/overview/job-orders/': (req) => ({ json: OVERVIEW_JOB_ORDERS(req) }),
  'GET /reports/overview/operations/': (req) => ({ json: OVERVIEW_OPERATIONS(req) }),
  'GET /reports/overview/sales/': (req) => ({ json: OVERVIEW_SALES(req) }),
  'GET /reports/overview/subcontracting/': (req) => ({ json: OVERVIEW_SUBCONTRACTING(req) }),
  'GET /reports/overview/procurement/': (req) => ({ json: OVERVIEW_PROCUREMENT(req) }),
};
