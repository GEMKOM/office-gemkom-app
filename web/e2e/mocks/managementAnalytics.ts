import type { MockHandlers } from '../fixtures';

// Backend answers for /management/analytics, shaped after the fields the
// legacy analytics.js read. Names are obviously fake.

const page = <T>(results: T[], count = results.length) => ({
  count,
  next: null,
  previous: null,
  results,
});

function costRow(
  jobNo: string,
  title: string,
  costs: {
    labor: number;
    overhead: number;
    material: number;
    subcontractor: number;
    paint?: number;
    paintMaterial?: number;
    qc?: number;
    shipping?: number;
    rental?: number;
    general?: number;
    weight: number;
    price: number | null;
    estimated: number;
    completion: number;
  },
  extra: Record<string, unknown> = {},
) {
  const actual =
    costs.labor +
    costs.overhead +
    costs.material +
    costs.subcontractor +
    (costs.paint ?? 0) +
    (costs.paintMaterial ?? 0) +
    (costs.qc ?? 0) +
    (costs.shipping ?? 0) +
    (costs.rental ?? 0) +
    (costs.general ?? 0);
  const margin = costs.price === null ? null : costs.price - actual;
  return {
    job_no: jobNo,
    title,
    customer_name: 'E2E Test Müşteri Alfa A.Ş.',
    customer_short_name: 'Alfa',
    status: 'active',
    is_manufactured: true,
    catalog_nodes: [{ id: 501, title: 'Tav Fırını', path: 'E2E Şablon › Fırınlar › Tav Fırını' }],
    catalog_nodes_from_children: false,
    has_children: false,
    total_weight_kg: String(costs.weight),
    labor_cost: costs.labor.toFixed(2),
    employee_overhead_cost: costs.overhead.toFixed(2),
    material_cost: costs.material.toFixed(2),
    subcontractor_cost: costs.subcontractor.toFixed(2),
    paint_cost: (costs.paint ?? 0).toFixed(2),
    paint_material_cost: (costs.paintMaterial ?? 0).toFixed(2),
    qc_cost: (costs.qc ?? 0).toFixed(2),
    shipping_cost: (costs.shipping ?? 0).toFixed(2),
    machine_rental_cost: (costs.rental ?? 0).toFixed(2),
    general_expenses_cost: (costs.general ?? 0).toFixed(2),
    general_expenses_rate: costs.general ? '0.08' : null,
    actual_total_cost: actual.toFixed(2),
    estimated_total_cost: costs.estimated.toFixed(2),
    price_per_kg: (actual / costs.weight).toFixed(2),
    selling_price: costs.price === null ? null : costs.price.toFixed(2),
    selling_price_currency: 'EUR',
    selling_price_is_derived: false,
    selling_price_display: costs.price === null ? null : costs.price.toFixed(2),
    selling_price_display_source: costs.price === null ? null : 'own',
    selling_price_per_kg: costs.price === null ? null : (costs.price / costs.weight).toFixed(2),
    margin_eur: margin === null ? null : margin.toFixed(2),
    margin_pct: margin === null || !costs.price ? null : ((margin / costs.price) * 100).toFixed(2),
    completion_pct: String(costs.completion),
    target_completion_date: '2026-12-15',
    ...extra,
  };
}

export const ANALYTICS_ROWS = [
  costRow(
    'E2E-254-01',
    'E2E Tav Fırını Hattı',
    {
      labor: 48200,
      overhead: 9640,
      material: 126500,
      subcontractor: 18400,
      paint: 4200,
      paintMaterial: 1800,
      qc: 2100,
      shipping: 3600,
      rental: 1200,
      general: 9800,
      weight: 42000,
      price: 298000,
      estimated: 231000,
      completion: 72,
    },
    { has_children: true, target_completion_date: '2026-12-20' },
  ),
  costRow('E2E-254-02', 'E2E Pota Ocağı Revizyonu', {
    labor: 22600,
    overhead: 4520,
    material: 61200,
    subcontractor: 9100,
    qc: 900,
    weight: 18500,
    price: 104000,
    estimated: 95500,
    completion: 88,
  }),
  costRow(
    'E2E-254-03',
    'E2E Haddehane Merdane Takımı',
    {
      labor: 31400,
      overhead: 6280,
      material: 88700,
      subcontractor: 0,
      shipping: 2400,
      weight: 26000,
      price: 128000,
      estimated: 132000,
      completion: 54,
    },
    { customer_short_name: 'Beta', customer_name: 'E2E Test Müşteri Beta Ltd.', status: 'on_hold' },
  ),
  costRow(
    'E2E-254-04',
    'E2E Konveyör Şasesi',
    {
      labor: 12800,
      overhead: 2560,
      material: 30400,
      subcontractor: 6200,
      weight: 9800,
      price: 70000,
      estimated: 50100,
      completion: 100,
    },
    { status: 'completed', is_manufactured: false },
  ),
  costRow(
    'E2E-254-05',
    'E2E Filtre Kabini',
    {
      labor: 9300,
      overhead: 1860,
      material: 21800,
      subcontractor: 14700,
      weight: 7400,
      price: null,
      estimated: 46000,
      completion: 35,
    },
    { status: 'draft', catalog_nodes: [] },
  ),
  costRow(
    'E2E-254-06',
    'E2E Kepçe Tamiri',
    {
      labor: 6400,
      overhead: 1280,
      material: 8900,
      subcontractor: 2300,
      weight: 3100,
      price: 21000,
      estimated: 17800,
      completion: 95,
    },
    { customer_short_name: 'Gama', customer_name: 'E2E Test Müşteri Gama GmbH' },
  ),
];

export const ANALYTICS_CHILDREN = [
  costRow(
    'E2E-254-01-01',
    'E2E Fırın Gövdesi',
    {
      labor: 30100,
      overhead: 6020,
      material: 82300,
      subcontractor: 11000,
      weight: 27000,
      price: null,
      estimated: 141000,
      completion: 80,
    },
    {
      selling_price_is_derived: true,
      selling_price_display: '191571.43',
      selling_price_display_source: 'allocated_from_parent',
      selling_price_derived_basis: {
        from_job_no: 'E2E-254-01',
        from_amount_eur: '298000.00',
        weight_kg: '27000',
        total_weight_kg: '42000',
      },
    },
  ),
  costRow('E2E-254-01-02', 'E2E Brülör Grubu', {
    labor: 18100,
    overhead: 3620,
    material: 44200,
    subcontractor: 7400,
    weight: 15000,
    price: null,
    estimated: 90000,
    completion: 60,
  }),
];

const CATALOG_NODES = [
  {
    id: 500,
    parent_id: null,
    title: 'Fırınlar',
    code: 'F',
    template_id: 7,
    template_name: 'E2E Şablon',
    own_job_count: 0,
    job_count: 3,
  },
  {
    id: 501,
    parent_id: 500,
    title: 'Tav Fırını',
    code: 'F-01',
    template_id: 7,
    template_name: 'E2E Şablon',
    own_job_count: 2,
    job_count: 2,
  },
  {
    id: 502,
    parent_id: 500,
    title: 'Pota Ocağı',
    code: 'F-02',
    template_id: 7,
    template_name: 'E2E Şablon',
    own_job_count: 1,
    job_count: 1,
  },
  {
    id: 600,
    parent_id: null,
    title: 'Haddehane',
    code: 'H',
    template_id: 8,
    template_name: 'E2E Şablon B',
    own_job_count: 1,
    job_count: 1,
  },
];

const COMBINED = {
  job_no: 'E2E-254-01',
  machining: {
    total_cost: 26400,
    hours: { weekday_work: 610, after_hours: 84, sunday: 12 },
    costs: { after_hours: 3900, sunday: 820 },
  },
  welding: {
    total_cost: 21800,
    hours: { regular: 540, after_hours: 66, holiday: 8 },
    costs: { after_hours: 2800, holiday: 450 },
  },
  combined_total_hours: 1320,
  by_job: [
    {
      job_no: 'E2E-254-01',
      machining_cost: 8000,
      welding_cost: 4000,
      machining_hours: 210,
      welding_hours: 90,
    },
    {
      job_no: 'E2E-254-01-01',
      machining_cost: 11400,
      welding_cost: 10700,
      machining_hours: 290,
      welding_hours: 300,
    },
    {
      job_no: 'E2E-254-01-02',
      machining_cost: 7000,
      welding_cost: 7100,
      machining_hours: 206,
      welding_hours: 224,
    },
  ],
};

const MACHINING = {
  job_no: 'E2E-254-01',
  summary: {
    total_entries: 3,
    total_hours: 21.5,
    total_cost: 1290,
    breakdown_by_type: { weekday_work: 16, after_hours: 4, sunday: 1.5 },
  },
  entries: [
    {
      job_no: 'E2E-254-01',
      operation_key: 'E2E-254-01-OP10',
      operation_name: 'Torna',
      total_hours: 12,
      total_cost: 720,
      entries: [
        {
          id: 1,
          start_time: Date.UTC(2026, 9, 6, 6, 0),
          employee_full_name: 'E2E Usta Bir',
          hours: 8,
          cost: 480,
          work_type: 'weekday_work',
        },
        {
          id: 2,
          start_time: Date.UTC(2026, 9, 7, 15, 0),
          employee_full_name: 'E2E Usta Bir',
          hours: 4,
          cost: 240,
          work_type: 'after_hours',
        },
      ],
    },
    {
      job_no: 'E2E-254-01',
      operation_key: 'E2E-254-01-OP20',
      operation_name: 'Freze',
      total_hours: 9.5,
      total_cost: 570,
      entries: [
        {
          id: 3,
          start_time: Date.UTC(2026, 9, 11, 6, 0),
          employee_full_name: 'E2E Usta İki',
          hours: 9.5,
          cost: 570,
          work_type: 'sunday',
        },
      ],
    },
  ],
};

const WELDING = {
  job_no: 'E2E-254-01',
  summary: {
    total_entries: 2,
    total_hours: 17,
    total_cost: 940,
    breakdown_by_type: { regular: 15, after_hours: 2, holiday: 0 },
  },
  entries: [
    {
      id: 11,
      job_no: 'E2E-254-01',
      date: '2026-10-08',
      employee_full_name: 'E2E Kaynakçı Bir',
      hours: 9,
      cost: 480,
      overtime_type: 'regular',
    },
    {
      id: 12,
      job_no: 'E2E-254-01',
      date: '2026-10-09',
      employee_full_name: 'E2E Kaynakçı İki',
      hours: 8,
      cost: 460,
      overtime_type: 'after_hours',
    },
  ],
};

const PROCUREMENT_LINES = [
  {
    id: 1,
    item_code: 'E2E-MLZ-001',
    item_name: 'Sac S235 10 mm',
    item_description: 'E2E test satırı',
    item_unit: 'kg',
    quantity: '12000',
    unit_price: '0.95',
    amount_eur: '11400.00',
  },
  {
    id: 2,
    item_code: 'E2E-MLZ-002',
    item_name: 'Refrakter Tuğla',
    item_description: '',
    item_unit: 'adet',
    quantity: '840',
    unit_price: '18.50',
    amount_eur: '15540.00',
  },
];

const SUBCONTRACTOR = {
  total_eur: '18400.00',
  lines: [
    {
      statement_year: 2026,
      statement_month: 9,
      subcontractor_name: 'E2E Taşeron Kaynak Ltd.',
      delta_progress: '25.00',
      cost_amount: '420000.00',
      cost_currency: 'TRY',
      cost_amount_eur: '11200.00',
    },
    {
      statement_year: 2026,
      statement_month: 10,
      subcontractor_name: 'E2E Taşeron Kaynak Ltd.',
      delta_progress: '15.00',
      cost_amount: '252000.00',
      cost_currency: 'TRY',
      cost_amount_eur: '6700.00',
    },
  ],
  adjustments: [
    {
      adjustment_type: 'Ek ödeme',
      reason: 'E2E vinç bekleme',
      amount: '18700.00',
      cost_currency: 'TRY',
      cost_amount_eur: '500.00',
    },
  ],
};

const ESTIMATED = {
  job_order: 'E2E-254-01',
  total_cost: '231000.00',
  actual_total_cost: '225440.00',
  completion_pct: '72.0',
  subtree_weight_kg: '42000',
  selling_price_eur: '298000.00',
  components: [
    {
      key: 'labor_cost',
      label: 'İşçilik',
      amount_eur: '61000.00',
      actual_amount_eur: '57840.00',
      description: '1.500 saat × €40,67',
    },
    {
      key: 'material_cost',
      label: 'Malzeme',
      amount_eur: '118000.00',
      actual_amount_eur: '126500.00',
      description: 'Malzeme satırları toplamı',
    },
    {
      key: 'subcontractor_cost',
      label: 'Taşeron',
      amount_eur: '22000.00',
      actual_amount_eur: '18400.00',
      description: 'Sözleşme tutarı',
    },
    {
      key: 'general_expenses_cost',
      label: 'Genel Giderler',
      amount_eur: '30000.00',
      description: 'Oran 0,08',
    },
  ],
  assumptions: [
    'E2E: kur 1 EUR = 37,5 TRY kabul edildi.',
    'E2E: kalan işçilik ortalama saat ücretiyle.',
  ],
  children: [
    {
      job_order: 'E2E-254-01-01',
      actual_total_cost: '129420.00',
      estimated_total_cost: '141000.00',
    },
    { job_order: 'E2E-254-01-02', actual_total_cost: '73320.00', estimated_total_cost: '90000.00' },
  ],
  material_breakdown: {
    items: [
      {
        job_order: 'E2E-254-01-01',
        item_code: 'E2E-MLZ-001',
        item_name: 'Sac S235 10 mm',
        item_unit: 'kg',
        quantity: '12000',
        unit_price_eur: '0.95',
        amount_eur: '11400.00',
        price_source: 'po_line',
        price_date: '2026-08-14',
      },
      {
        job_order: 'E2E-254-01-02',
        item_code: 'E2E-MLZ-002',
        item_name: 'Refrakter Tuğla',
        item_unit: 'adet',
        quantity: '840',
        unit_price_eur: '18.50',
        amount_eur: '15540.00',
        price_source: 'recommended_offer',
        price_date: '2026-09-02',
      },
    ],
    items_count: 2,
    lines_total: '26940.00',
    material_cost_floored_to_actual: false,
  },
  last_updated: '2026-11-01T08:30:00Z',
};

export const handlers: MockHandlers = {
  'GET /projects/job-orders/cost_table/': ({ query }) => {
    const search = query.get('search');
    const all = [...ANALYTICS_ROWS, ...ANALYTICS_CHILDREN];
    if (search) {
      const hits = all.filter((r) => r.job_no.includes(search) || r.title.includes(search));
      return { json: page(hits) };
    }
    return { json: page(ANALYTICS_ROWS, 46) };
  },
  'GET /projects/job-orders/cost_table_catalog_nodes/': { json: { nodes: CATALOG_NODES } },
  'GET /projects/job-orders/E2E-254-01/cost_children/': { json: ANALYTICS_CHILDREN },
  'GET /reports/combined-job-costs': { json: page([COMBINED]) },
  'GET /machining/reports/job-entries/': { json: MACHINING },
  'GET /welding/reports/job-entries/': { json: WELDING },
  'GET /projects/procurement-lines/': { json: PROCUREMENT_LINES },
  'GET /projects/job-orders/E2E-254-01/subcontractor_cost_breakdown/': { json: SUBCONTRACTOR },
  'GET /projects/job-orders/E2E-254-01/estimated_cost_breakdown/': { json: ESTIMATED },
};
