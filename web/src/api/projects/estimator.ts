import { queryOptions } from '@tanstack/react-query';
import { apiFetch, isApiError } from '../client';

// Port of apis/estimator.js (Tahmin: drawing-based cost and risk reports) for
// the React estimate report and the Tahminler list. Every call needs the
// `view_estimates` right; a 403 means "no access" and the card hides itself.
// The report payloads are wide and versioned and the report view reads them
// field by field (see estimate-report/reportModel.ts), so they stay loosely
// typed here.

export type EstimateStatus = 'queued' | 'running' | 'done' | 'failed';
export type ReviewDecision = '' | 'accept' | 'correct';

export interface EstimateVersion {
  id: number;
  version: number;
  status: EstimateStatus;
  review_decision?: ReviewDecision | null;
}

/** GET /estimator/estimates/<id>/ (and …/latest/): the full report. */
export interface EstimateReport {
  id: number;
  version: number;
  status: EstimateStatus;
  subject_key?: string;
  subject_kind?: 'job' | 'offer';
  job_no?: string | null;
  offer_id?: number | null;
  title?: string | null;
  customer?: string | null;
  created_at?: string | null;
  created_by_name?: string | null;
  started_at?: string | null;
  review_decision?: ReviewDecision | null;
  review_note?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  usage_usd?: number | string | null;
  model?: string | null;
  error?: string | null;
  inputs?: { weld_schedule_version?: number | null; [key: string]: unknown } | null;
  hours?: { scope?: string; [key: string]: unknown } | null;
  progress?: unknown;
  versions?: EstimateVersion[];
  weld_schedule?: WeldSchedule | null;
  [key: string]: unknown;
}

export interface WeldJoint {
  joint_id?: string;
  sub_id?: string | null;
  description?: string;
  source?: string | null;
  joint_type?: string;
  material?: string;
  size?: string;
  process?: string;
  count_per_unit?: number | null;
  length_m_each?: number | null;
  total_m_per_unit?: number | null;
  ndt?: string | null;
  [key: string]: unknown;
}

export interface WeldSchedule {
  version?: number;
  joints?: WeldJoint[];
  totals?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A slim row of GET /estimator/estimates/. */
export interface EstimateRow {
  id: number;
  version: number;
  status: EstimateStatus;
  subject_key: string;
  subject_kind?: 'job' | 'offer';
  title?: string | null;
  customer?: string | null;
  expected_total_eur?: { in_house?: number | null; subcontract?: number | null } | null;
  eur_per_kg?: { in_house?: number | null; subcontract?: number | null } | null;
  suggested_price_eur?: number | null;
  review_decision?: ReviewDecision | null;
  reviewed_by_name?: string | null;
  usage_usd?: number | string | null;
  created_at?: string | null;
  created_by_name?: string | null;
  [key: string]: unknown;
}

/** A job order or an offer; `reportId` pins one report (no Oluştur for a subject of its own). */
export type EstimateSubject = { jobNo: string } | { offerId: number } | { reportId: number };

export type EstimateScope = 'unit' | 'programme';

export interface EstimatesFilters {
  q?: string;
  customer?: string;
  /** Comma-separated statuses. */
  status?: string;
  reviewed?: string;
  limit?: number;
}

const BASE = '/estimator';

function subjectParams(subject: { jobNo?: string; offerId?: number }) {
  return { job_no: subject.jobNo, offer_id: subject.offerId };
}

export const estimatorKeys = {
  all: ['estimator'] as const,
  list: (filters: EstimatesFilters) => ['estimator', 'estimates', 'list', filters] as const,
  report: (id: number) => ['estimator', 'estimates', 'detail', id] as const,
  latest: (subject: { jobNo?: string; offerId?: number }) => ['estimator', 'estimates', 'latest', subjectParams(subject)] as const,
  weld: (subject: { jobNo?: string; offerId?: number }) => ['estimator', 'weld-schedules', subjectParams(subject)] as const,
  method: ['estimator', 'method'] as const,
};

/** Slim rows, newest first. */
export function estimatesQueryOptions(filters: EstimatesFilters) {
  return queryOptions({
    queryKey: estimatorKeys.list(filters),
    queryFn: async ({ signal }) => {
      const data = await apiFetch<{ count?: number; results?: EstimateRow[] }>(`${BASE}/estimates/`, {
        params: { ...filters },
        signal,
      });
      return data?.results ?? [];
    },
  });
}

export function getEstimate(id: number, signal?: AbortSignal): Promise<EstimateReport> {
  return apiFetch<EstimateReport>(`${BASE}/estimates/${id}/`, { signal });
}

/** The subject's newest report (any status), or null when it has none (404). */
export async function getLatestEstimate(
  subject: { jobNo?: string; offerId?: number },
  signal?: AbortSignal,
): Promise<EstimateReport | null> {
  try {
    return await apiFetch<EstimateReport>(`${BASE}/estimates/latest/`, { params: subjectParams(subject), signal });
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

/** The subject's latest weld list, or null when it has none (404). */
export async function getWeldSchedule(
  subject: { jobNo?: string; offerId?: number },
  signal?: AbortSignal,
): Promise<WeldSchedule | null> {
  const path =
    'jobNo' in subject && subject.jobNo
      ? `${BASE}/weld-schedules/${encodeURIComponent(subject.jobNo)}/`
      : `${BASE}/weld-schedules/offer/${subject.offerId}/`;
  try {
    return await apiFetch<WeldSchedule>(path, { signal });
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

/** Queue a new version; a 409 carries the running one's id in `data.id`. */
export function createEstimate(subject: { jobNo?: string; offerId?: number }, scope: EstimateScope): Promise<EstimateReport> {
  const body: Record<string, unknown> = subject.jobNo ? { job_no: subject.jobNo } : { offer_id: subject.offerId };
  if (scope === 'programme') body.scope = 'programme';
  return apiFetch<EstimateReport>(`${BASE}/estimates/`, { method: 'POST', body });
}

export function reviewEstimate(id: number, decision: 'accept' | 'correct', note = ''): Promise<EstimateReport> {
  return apiFetch<EstimateReport>(`${BASE}/estimates/${id}/review/`, { method: 'POST', body: { decision, note } });
}

/** Durdur; a 409 means the run had already finished. */
export function cancelEstimate(id: number): Promise<EstimateReport> {
  return apiFetch<EstimateReport>(`${BASE}/estimates/${id}/cancel/`, { method: 'POST' });
}

/** GET /estimator/method/: the "Nasıl çalışır?" markdown, built by the backend from the live constants. */
export function getEstimatorMethod(signal?: AbortSignal): Promise<string> {
  return apiFetch<{ markdown?: string }>(`${BASE}/method/`, { signal }).then((data) => data?.markdown ?? '');
}

/** The method text, fetched once per page (legacy loadMethodHtml cache); override `staleTime: 0` to refetch. */
export function estimatorMethodQueryOptions() {
  return queryOptions({
    queryKey: estimatorKeys.method,
    queryFn: ({ signal }) => getEstimatorMethod(signal),
    staleTime: Infinity,
  });
}

// ------------------------------------------------------------ labels (apis/estimator.js)

/** A label with its status-pill family (`status-*`, the legacy badges.css class). */
export interface BadgeLabel {
  label: string;
  badge: string;
  title?: string;
}

export const ESTIMATE_STATUS: Record<string, BadgeLabel & { icon: string }> = {
  queued: { label: 'Sırada', badge: 'status-grey', icon: 'fa-clock' },
  running: { label: 'Çalışıyor', badge: 'status-blue', icon: 'fa-spinner fa-spin' },
  done: { label: 'Hazır', badge: 'status-green', icon: 'fa-check' },
  failed: { label: 'Hata', badge: 'status-red', icon: 'fa-triangle-exclamation' },
};

export const REVIEW_LABELS: Record<string, BadgeLabel> = {
  '': { label: 'İncelenmedi', badge: 'status-grey' },
  accept: { label: 'Kabul', badge: 'status-green' },
  correct: { label: 'Düzeltme', badge: 'status-orange' },
};

export const REFERENCE_REVIEW: Record<string, BadgeLabel> = {
  unreviewed: { label: 'İncelenmedi', badge: 'status-grey' },
  verified: { label: 'Doğrulandı', badge: 'status-green' },
  excluded: { label: 'Hariç', badge: 'status-red' },
};

export const REFERENCE_ROUTE: Record<string, BadgeLabel> = {
  in_house: { label: 'İç imalat', badge: 'status-blue' },
  subcontract: { label: 'Taşeron', badge: 'status-purple' },
  mixed: { label: 'Karma', badge: 'status-orange' },
  unknown: { label: 'Bilinmiyor', badge: 'status-grey' },
};

export const REFERENCE_RELIABILITY: Record<string, BadgeLabel> = {
  ok: { label: 'Güvenilir', badge: 'status-green' },
  unreliable: { label: '≤ 10 h', badge: 'status-orange' },
  none: { label: 'Kayıt yok', badge: 'status-grey' },
};

export const REFERENCE_FAMILY: Record<string, string> = {
  copper_panel: 'Bakır panel',
  ebt: 'EBT',
  roof: 'Çatı',
  panel: 'Panel',
  duct: 'Kanal / dirsek',
  ladle: 'Pota',
  shell: 'Gövde',
  spare_parts: 'Yedek parça',
  other: 'Diğer',
};

// Manufacturing plan (schema 2, hours method `plan_v5`): labels of the codes
// the backend sends (estimator plan_hours / weld_extraction). Shared by the
// Tahmin card and the Referanslar page.

/** Structure class of a plan (plan_hours.STRUCTURE_CLASSES); the summary endpoint also sends `class_labels`. */
export const STRUCTURE_CLASS_LABELS: Record<string, string> = {
  boru_panel: 'Boru paneli',
  sac_yapi: 'Sac yapı',
  agir_sac_yapi: 'Ağır sac yapı',
  mekanik_parca: 'Mekanik parça',
  kucuk_parca: 'Küçük parça',
  other: 'Diğer',
};

/** Work centres of the plan (plan_hours.WORK_CENTRES), in the server's order. */
export const WORK_CENTRE_LABELS: Record<string, string> = {
  shop: 'Kaynak atölyesi',
  mach: 'Talaşlı imalat',
  cnc: 'CNC kesim ve ağız açma',
  bend: 'Büküm / hadde',
  qc: 'Kalite kontrol (NDT)',
};
export const WORK_CENTRE_SHORT: Record<string, string> = { shop: 'atölye', mach: 'talaşlı', cnc: 'CNC', bend: 'büküm', qc: 'KK' };

/** Machining feature kinds (MachiningFeatureSchema.kind). */
export const MACHINING_KIND_LABELS: Record<string, string> = {
  face: 'Yüzey frezeleme',
  turn: 'Tornalama',
  from_solid: "Solid'den işleme",
  bore: 'Hassas delik',
  drill: 'Delik',
  tap: 'Diş',
  slot: 'Kanal / oval delik',
  bevel: 'Talaşlı ağız',
  grind: 'Taşlama',
  contour: 'Kontur',
  op_default: 'Ölçüsüz operasyon',
};

/** Machine classes (plan_hours.MACHINE_CODES). */
export const MACHINE_LABELS: Record<string, string> = {
  lathe: 'Torna',
  vmc: 'Dik işleme merkezi',
  hmc: 'Yatay işleme merkezi',
  boring_mill: 'Borwerk',
  drill: 'Matkap',
  grinder: 'Taşlama',
};

export const TOLERANCE_LABELS: Record<string, string> = { general: 'genel', fine: 'hassas (IT7)', ground: 'taşlanmış (IT6)' };

/** Where a joint / part / feature came from: drawn on a sheet, deduced by the model, or a Python rule. */
export const SOURCE_LABELS: Record<string, BadgeLabel & { title: string }> = {
  drawn: { label: 'çizim', badge: 'status-grey', title: "Çizimde / BOM'da var" },
  deduced: { label: 'çıkarım', badge: 'status-purple', title: 'Çizimde yok; model yapının gerektirdiğini çıkardı' },
  rule: { label: 'kural', badge: 'status-orange', title: 'Model vermedi; sunucu kuralı ekledi' },
};

/** Weld-list schema: 1 = joint list, 2 = manufacturing plan (sub-assemblies, parts, machining). */
export const SCHEMA_LABELS: Record<number, BadgeLabel & { title: string }> = {
  1: { label: 'v1 liste', badge: 'status-grey', title: 'Kaynak listesi (şema 1): parça ve talaşlı özellikleri yok' },
  2: { label: 'plan v2', badge: 'status-blue', title: 'İmalat planı (şema 2): alt montajlar, parçalar, talaşlı özellikler' },
};

/** Why a reference cannot calibrate the machining centre (calibration.machining_exclusion_reason). */
export const MACHINING_EXCLUSION_LABELS: Record<string, string> = {
  'no recorded machining hours': 'Kayıtlı talaşlı saati yok',
  'unreliable (<= 10 h machining recorded)': 'Güvenilmez talaşlı saat kaydı (≤ 10 h)',
  'v1 weld list (no machining features)': 'v1 kaynak listesi (talaşlı özellik yok)',
  'no machining in the plan': 'Planda talaşlı imalat yok',
  'excluded by review': 'İnceleme ile hariç',
  'no plan': 'Plan yok',
};

export function machiningExclusionLabel(reason: string | null | undefined): string {
  if (!reason) return '';
  const known = MACHINING_EXCLUSION_LABELS[reason];
  if (known) return known;
  if (String(reason).startsWith('unreliable')) return 'Güvenilmez talaşlı saat kaydı (≤ 10 h)';
  return String(reason);
}

/** Verdict of the plan's hours per tonne against the class band (calibration.band_check). */
export const BAND_STATUS: Record<string, BadgeLabel> = {
  below: { label: 'altında', badge: 'status-orange' },
  inside: { label: 'içinde', badge: 'status-green' },
  above: { label: 'üstünde', badge: 'status-orange' },
  unknown: { label: 'bilinmiyor', badge: 'status-grey' },
};

export const SUB_ASSEMBLY_KIND_LABELS: Record<string, string> = {
  built_up_beam: 'Kaynaklı kiriş',
  box_section: 'Kutu kesit',
  frame: 'Çerçeve',
  box_foot: 'Kutu ayak',
  bracket_support: 'Konsol / mesnet',
  shell_course: 'Gövde halkası',
  ring: 'Halka',
  plate_panel: 'Sac panel',
  pipe_panel: 'Boru paneli',
  pipe_spool: 'Boru hattı',
  machined_assembly: 'İşlenmiş montaj',
  bolted_only: 'Cıvatalı (kaynaksız)',
  other: 'Diğer',
};

export const PART_KIND_LABELS: Record<string, string> = {
  plate: 'Sac',
  profile: 'Profil',
  pipe: 'Boru',
  bent_plate: 'Bükülmüş sac',
  rolled_shell: 'Haddelenmiş gövde',
  machined: 'İşlenmiş parça',
  forging: 'Dövme',
  casting: 'Döküm',
  purchased: 'Satın alınan',
  fastener: 'Bağlantı elemanı',
};
