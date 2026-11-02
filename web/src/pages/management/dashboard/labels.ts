// Turkish label maps for the management dashboard (render/labels.js).
import type { StatusFamily } from '@/ui';

export const TEAM_LABELS: Record<string, string> = {
  manufacturing: 'Üretim',
  planning: 'Planlama',
  qualitycontrol: 'Kalite kontrol',
  quality_control: 'Kalite kontrol',
  design: 'Tasarım',
  procurement: 'Satın Alma',
  painting: 'Boya',
  logistics: 'Lojistik',
  maintenance: 'Bakım',
  finance: 'Finans',
  it: 'Bilgi İşlem',
  human_resources: 'İnsan Kaynakları',
  management: 'Yönetim',
  quality: 'Kalite',
  welding: 'Kaynak',
  machining: 'Talaşlı',
  cnc: 'CNC',
  linear_cutting: 'Boy kesim',
  rollingmill: 'Haddehane',
  rolling_mill: 'Haddehane',
  sales: 'Satış',
  marketing: 'Pazarlama',
  warehouse: 'Depo',
};

export function teamLabel(key: unknown): string {
  if (key === null || key === undefined || key === '') return '';
  const raw = String(key).trim();
  const norm = raw.toLowerCase().replace(/\s+/g, '_');
  return TEAM_LABELS[norm] || TEAM_LABELS[raw] || raw;
}

const JOB_STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  active: 'Aktif',
  completed: 'Tamamlandı',
  on_hold: 'Beklemede',
  cancelled: 'İptal Edildi',
};

/** A hold with hold_kind 'revision' reads 'Revizyonda'. */
export function jobStatusLabel(status: string, holdKind: string | null = null): string {
  if (status === 'on_hold' && holdKind === 'revision') return 'Revizyonda';
  return JOB_STATUS_LABELS[status] || (status ? String(status) : '');
}

type Meta = { label: string; color: StatusFamily };

export const KIND_META: Record<string, Meta> = {
  overdue: { label: 'Termin geçti', color: 'red' },
  material: { label: 'Malzeme bekliyor', color: 'orange' },
  ncr: { label: 'Açık NCR', color: 'orange' },
  due_soon_risk: { label: 'Termin riski', color: 'orange' },
  no_release: { label: 'Çizim yayınlanmadı', color: 'purple' },
  placeholder_price: { label: 'Yer tutucu fiyat', color: 'purple' },
  stale_quotes: { label: 'Süresi dolmuş teklif', color: 'grey' },
};

export const SEVERITY_COLORS: StatusFamily[] = ['red', 'orange', 'purple', 'grey', 'green', 'blue'];

export const SUBJECT_META: Record<string, { label: string; url: string; icon: string }> = {
  purchase_request: {
    label: 'Satın Alma',
    url: '/procurement/purchase-requests/pending',
    icon: 'shopping-cart',
  },
  subcontractor_statement: {
    label: 'Hakediş',
    url: '/manufacturing/subcontracting/statements/',
    icon: 'file-invoice',
  },
  overtime_request: { label: 'Fazla Mesai', url: '/general/overtime/pending', icon: 'user-clock' },
  vacation_request: { label: 'İzin', url: '/general/vacation/pending', icon: 'umbrella-beach' },
  department_request: {
    label: 'Departman Talebi',
    url: '/general/department-requests/pending',
    icon: 'people-arrows',
  },
  qc_review: { label: 'KK', url: '/quality-control/qc-reviews', icon: 'clipboard-check' },
  ncr: {
    label: 'NCR',
    url: '/quality-control/ncrs?status__in=submitted',
    icon: 'triangle-exclamation',
  },
  sales_offer: { label: 'Teklif', url: '/sales/offers', icon: 'file-signature' },
  crane_request: { label: 'Vinç', url: '/general/crane-requests/pending', icon: 'truck-pickup' },
  payment_list: {
    label: 'Ödeme Listesi',
    url: '/procurement/payment-lists/?status=submitted',
    icon: 'money-check-dollar',
  },
};

/** Subjects whose row stays visible at count 0 (the rest hide when empty). */
export const ALWAYS_VISIBLE_SUBJECTS = new Set([
  'purchase_request',
  'overtime_request',
  'vacation_request',
  'qc_review',
]);

export const SUBJECT_ORDER = [
  'purchase_request',
  'subcontractor_statement',
  'overtime_request',
  'vacation_request',
  'department_request',
  'qc_review',
  'ncr',
  'sales_offer',
  'crane_request',
  'payment_list',
];

export type PillarId =
  'order_book' | 'delivery' | 'production' | 'quality_safety' | 'material' | 'finance' | 'people';

export interface PillarDef {
  id: PillarId;
  title: string;
  initials: string;
  icon: string;
  /** Stacking priority on a phone. */
  mobileOrder: number;
  drill: string;
}

export const PILLARS: PillarDef[] = [
  {
    id: 'order_book',
    title: 'Sipariş Defteri',
    initials: 'SD',
    icon: 'book',
    mobileOrder: 2,
    drill: '/projects/project-tracking',
  },
  {
    id: 'delivery',
    title: 'Teslimat',
    initials: 'T',
    icon: 'truck-fast',
    mobileOrder: 1,
    drill: '/projects/project-tracking?meeting=1',
  },
  {
    id: 'production',
    title: 'Üretim',
    initials: 'Ü',
    icon: 'industry',
    mobileOrder: 3,
    drill: '/management/reports/overview',
  },
  {
    id: 'quality_safety',
    title: 'Kalite & İSG',
    initials: 'K',
    icon: 'shield-halved',
    mobileOrder: 5,
    drill: '/quality-control/ncrs?status__in=draft,submitted,rejected',
  },
  {
    id: 'material',
    title: 'Malzeme & Satın Alma',
    initials: 'M',
    icon: 'boxes-stacked',
    mobileOrder: 4,
    drill: '/planning/items?is_critical=true&is_delivered=false',
  },
  {
    id: 'finance',
    title: 'Finans',
    initials: 'F',
    icon: 'coins',
    mobileOrder: 6,
    drill: '/management/reports/cash-flow',
  },
  {
    id: 'people',
    title: 'İnsan',
    initials: 'İ',
    icon: 'users',
    mobileOrder: 7,
    drill: '/general/overtime/cost-report',
  },
];

export const CAPACITY_VERDICT: Record<string, Meta> = {
  ok: { label: 'Uygun', color: 'green' },
  tight: { label: 'Sıkışık', color: 'orange' },
  overloaded: { label: 'Aşırı yüklü', color: 'red' },
  no_rate: { label: 'Hız yok', color: 'grey' },
  idle: { label: 'Boşta', color: 'blue' },
};

export const MARGIN_VERDICT: Record<string, Meta> = {
  critical: { label: 'Kritik', color: 'red' },
  risky: { label: 'Riskli', color: 'orange' },
  healthy: { label: 'Sağlıklı', color: 'green' },
  no_price: { label: 'Fiyatsız', color: 'grey' },
  no_data: { label: 'Veri yok', color: 'grey' },
};

export const NCR_SEVERITY: Record<string, Meta> = {
  critical: { label: 'Kritik', color: 'red' },
  major: { label: 'Majör', color: 'orange' },
  minor: { label: 'Minör', color: 'grey' },
};

export const LIVE_DEPT: Record<string, string> = {
  machining: 'Talaşlı',
  cnc: 'CNC',
  linear_cutting: 'Boy kesim',
  maintenance: 'Bakım',
};
