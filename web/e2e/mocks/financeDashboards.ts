import type { MockHandlers } from '../fixtures';

// Payment forecast, revenue and month-detail payloads for the cash-flow page
// (/management/reports/cash-flow) and the executive overview
// (/finance/reports/executive-overview). Field names follow what the legacy
// scripts read; every name is an obvious fake.

const MONTHS = [
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
  '2026-11',
];

// Outflow per month (EUR): procurement plus wages, taxes, loans, ...
const OUTFLOW = [
  412_300, 398_750, 455_120, 520_400, 486_900, 611_250, 574_800, 498_300, 452_600, 538_900, 602_150,
  233_400,
];
// Procurement share of it, split paid / awaiting.
const PROCUREMENT = [
  252_300, 241_750, 289_120, 338_400, 301_900, 405_250, 371_800, 309_300, 276_600, 344_900, 392_150,
  148_400,
];
const PAID_SHARE = [1, 1, 1, 1, 1, 0.96, 0.9, 0.82, 0.7, 0.55, 0.35, 0.1];
const INFLOW = [
  455_000, 362_400, 381_900, 610_250, 512_300, 498_600, 702_450, 455_800, 388_200, 612_900, 548_300,
  310_000,
];

const round2 = (n: number) => Math.round(n * 100) / 100;
const dec = (n: number) => round2(n).toFixed(2);

export const paymentForecast = {
  kpis: {
    total_outflow_eur: dec(OUTFLOW.reduce((a, b) => a + b, 0)),
    total_spent_eur: dec(PROCUREMENT.reduce((a, b) => a + b, 0)),
    total_procurement_paid_eur: dec(PROCUREMENT.reduce((a, b, i) => a + b * PAID_SHARE[i]!, 0)),
    total_paid_eur: dec(PROCUREMENT.reduce((a, b, i) => a + b * PAID_SHARE[i]!, 0)),
    total_procurement_awaiting_eur: dec(
      PROCUREMENT.reduce((a, b, i) => a + b * (1 - PAID_SHARE[i]!), 0),
    ),
    total_awaiting_eur: dec(PROCUREMENT.reduce((a, b, i) => a + b * (1 - PAID_SHARE[i]!), 0)),
    po_count: 412,
    active_suppliers: 87,
    mom_percent: -61.2,
    yoy_percent: 14.8,
  },
  series: MONTHS.map((month, i) => {
    const procurement = PROCUREMENT[i]!;
    const paid = procurement * PAID_SHARE[i]!;
    return {
      month,
      total_outflow_eur: dec(OUTFLOW[i]!),
      total_spent_eur: dec(procurement),
      procurement_paid_eur: dec(paid),
      paid_eur: dec(paid),
      procurement_awaiting_eur: dec(procurement - paid),
      awaiting_eur: dec(procurement - paid),
      po_count: 22 + ((i * 7) % 19),
      active_suppliers: 11 + ((i * 5) % 9),
    };
  }),
  dbs_summary: {
    total_dbs_used_eur: '318450.00',
    suppliers: [
      {
        supplier_name: 'E2E Çelik Tedarik A.Ş.',
        dbs_bank: 'E2E Bank',
        dbs_currency: 'TRY',
        dbs_used: '6345000.00',
        dbs_used_eur: '141000.00',
        dbs_limit_eur: '150000.00',
        dbs_available_eur: '9000.00',
        dbs_expiry_date: '2026-11-20',
      },
      {
        supplier_name: 'E2E Boya Kimya Ltd.',
        dbs_bank: 'Örnek Katılım',
        dbs_currency: 'EUR',
        dbs_used: '96450.00',
        dbs_used_eur: '96450.00',
        dbs_limit_eur: '120000.00',
        dbs_available_eur: '23550.00',
        dbs_expiry_date: '2027-03-31',
      },
      {
        supplier_name: 'E2E Hırdavat San.',
        dbs_bank: 'E2E Bank',
        dbs_currency: 'USD',
        dbs_used: '88200.00',
        dbs_used_eur: '81000.00',
        dbs_limit_eur: '200000.00',
        dbs_available_eur: '119000.00',
        dbs_expiry_date: '2027-06-30',
      },
    ],
  },
  undated_schedules: { total_outflow_eur: '48250.00', po_count: 6 },
};

export const revenueReport = {
  kpis: {
    total_inflow_eur: dec(INFLOW.reduce((a, b) => a + b, 0)),
    mom_percent: -43.5,
  },
  series: MONTHS.map((month, i) => ({
    month,
    total_inflow_eur: dec(INFLOW[i]!),
    offer_count: 3 + ((i * 3) % 6),
  })),
  undated: { total_inflow_eur: '125000.00', offer_count: 2 },
};

export const inflowDetail = [
  {
    customer_name: 'E2E Enerji A.Ş.',
    offer_no: 'E2E-OF-1041',
    offer_title: 'Kazan dairesi çelik konstrüksiyon',
    job_no: 'E2E-254-01',
    job_status: 'active',
    job_completion_percentage: '62.5',
    installment_label: 'Ara hakediş',
    installment_percentage: '30',
    installment_due_date: '2026-10-05',
    installment_amount_original: '165000.00',
    installment_amount_eur: '165000.00',
    original_currency: 'EUR',
    order_no: 'SIP-E2E-881',
  },
  {
    customer_name: 'E2E Enerji A.Ş.',
    offer_no: 'E2E-OF-1052',
    offer_title: 'Boru köprüsü',
    job_no: 'E2E-254-07',
    job_status: 'completed',
    job_completion_percentage: '100',
    installment_label: 'Kabul',
    installment_percentage: '10',
    installment_due_date: '2026-10-20',
    installment_amount_original: '42300.00',
    installment_amount_eur: '42300.00',
    original_currency: 'EUR',
    order_no: '',
  },
  {
    customer_name: 'Örnek Makine GmbH',
    offer_no: 'E2E-OF-0998',
    offer_title: 'Pres gövdesi imalatı',
    job_no: null,
    job_status: 'active',
    job_completion_percentage: '35',
    installment_label: 'Avans',
    installment_percentage: '40',
    installment_due_date: '2026-10-28',
    installment_amount_original: '372000.00',
    installment_amount_eur: '341000.00',
    original_currency: 'USD',
    order_no: 'PO-E2E-77',
  },
];

export const outflowDetail = {
  totals: {
    grand_total_eur: '602150.00',
    procurement_eur: '392150.00',
    wages_eur: '148000.00',
    expenses_eur: '21500.00',
    loans_eur: '18500.00',
    taxes_eur: '17000.00',
    adhoc_eur: '5000.00',
  },
  procurement: [
    {
      supplier_name: 'E2E Çelik Tedarik A.Ş.',
      supplier_code: 'E2E-TD-01',
      pr_title: 'S355 sac levha 20 mm',
      label: 'Peşin %30',
      due_date: '2026-10-03',
      amount_eur: '148200.00',
      is_paid: true,
    },
    {
      supplier_name: 'E2E Çelik Tedarik A.Ş.',
      supplier_code: 'E2E-TD-01',
      pr_title: 'HEA 300 profil',
      label: 'Vadeli 60 gün',
      due_date: '2026-10-29',
      amount_eur: '163950.00',
      is_paid: false,
    },
    {
      supplier_name: 'E2E Boya Kimya Ltd.',
      supplier_code: 'E2E-TD-02',
      pr_title: 'Epoksi astar',
      label: 'Teslimde',
      due_date: '2026-10-15',
      amount_eur: '80000.00',
      is_paid: true,
    },
  ],
  wages: {
    base_payroll_eur: '131500.00',
    overtime_premium_eur: '16500.00',
    total_eur: '148000.00',
    employee_count: 214,
  },
  expenses: [
    {
      category: 'catering',
      description: 'Yemekhane hizmeti',
      recurrence: 'monthly',
      amount_eur: '12500.00',
    },
    {
      category: 'security',
      description: 'Güvenlik hizmeti',
      recurrence: 'monthly',
      amount_eur: '9000.00',
    },
  ],
  loans: [
    {
      loan_name: 'E2E Yatırım Kredisi',
      sequence: 14,
      due_date: '2026-10-25',
      amount_eur: '18500.00',
      is_paid: false,
    },
  ],
  taxes: [
    {
      tax_type: 'vat',
      period_label: 'Eylül 2026',
      due_date: '2026-10-26',
      amount_eur: '11000.00',
      is_paid: false,
    },
    {
      tax_type: 'sgk',
      period_label: 'Eylül 2026',
      due_date: '2026-10-23',
      amount_eur: '6000.00',
      is_paid: true,
    },
  ],
  adhoc_costs: [
    {
      job_no: 'E2E-254-01',
      description: 'Vinç kiralama',
      category: 'transport',
      cost_date: '2026-10-12',
      amount_eur: '5000.00',
    },
  ],
};

export const cashFlowHandlers: MockHandlers = {
  'GET /procurement/reports/payment-forecast': { json: paymentForecast },
  'GET /sales/reports/revenue/': { json: revenueReport },
  'GET /sales/reports/inflow-detail/': { json: inflowDetail },
  'GET /procurement/reports/outflow-detail/': { json: outflowDetail },
};

export const executiveOverviewHandlers: MockHandlers = {
  'GET /procurement/reports/payment-forecast': { json: paymentForecast },
};
