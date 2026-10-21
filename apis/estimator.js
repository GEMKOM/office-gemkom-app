import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

// ============================================================
// Tahmin (estimator) API — drawing-based cost and risk reports.
// Backend: /estimator/estimates/, /estimator/weld-schedules/
// Every call needs the `view_estimates` right; a 403 means "no access"
// and the UI hides the feature rather than showing an error.
// ============================================================

const BASE = `${backendBase}/estimator`;

async function request(url, options, fallback) {
    const response = await authedFetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.detail || data.non_field_errors?.[0] || firstFieldError(data) || fallback);
        error.status = response.status;
        error.data = data;
        throw error;
    }
    return data;
}

function firstFieldError(data) {
    if (!data || typeof data !== 'object') return null;
    const key = Object.keys(data)[0];
    if (!key) return null;
    const value = data[key];
    const message = Array.isArray(value) ? value[0] : value;
    return typeof message === 'string' ? message : null;
}

function query(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') q.append(k, v);
    });
    const s = q.toString();
    return s ? `?${s}` : '';
}

/** Newest report (any status) of a job order or an offer, in full. 404 when none. */
export function getLatestEstimate({ jobNo, offerId }) {
    return request(`${BASE}/estimates/latest/${query({ job_no: jobNo, offer_id: offerId })}`, undefined, 'Tahmin yüklenemedi');
}

export function getEstimate(id) {
    return request(`${BASE}/estimates/${id}/`, undefined, 'Tahmin yüklenemedi');
}

/** Slim rows, newest first: {count, results}. Filters: job_no, offer_id, status, reviewed, customer, q, limit. */
export function listEstimates(filters = {}) {
    return request(`${BASE}/estimates/${query(filters)}`, undefined, 'Tahminler yüklenemedi');
}

/** Queue a new version. Errors carry `status`: 409 one is already running. */
export function createEstimate({ jobNo, offerId }) {
    const body = jobNo ? { job_no: jobNo } : { offer_id: offerId };
    return request(`${BASE}/estimates/`, { method: 'POST', body: JSON.stringify(body) }, 'Tahmin başlatılamadı');
}

export function reviewEstimate(id, decision, note = '') {
    return request(`${BASE}/estimates/${id}/review/`, { method: 'POST', body: JSON.stringify({ decision, note }) }, 'İnceleme kaydedilemedi');
}

/** Durdur: stop a queued or running run. Returns the report (status failed,
 *  error "Kullanıcı tarafından durduruldu (…)"). Errors carry `status`:
 *  409 the run had already finished. What was spent is not refunded. */
export function cancelEstimate(id) {
    return request(`${BASE}/estimates/${id}/cancel/`, { method: 'POST' }, 'Çalıştırma durdurulamadı');
}

/** The latest (or, for a job order, the given `version`) weld list of a job order
 *  or of an offer's customer drawings, with `version_history` (who edited each
 *  version, why, from which one). 404 when none. */
export function getWeldSchedule({ jobNo, offerId, version }) {
    const url = jobNo
        ? `${BASE}/weld-schedules/${encodeURIComponent(jobNo)}/${query({ version })}`
        : `${BASE}/weld-schedules/offer/${offerId}/`;
    return request(url, undefined, 'Kaynak listesi yüklenemedi');
}

/** Save a hand-corrected weld list as the job's next version.
 *  body: {base_version, part_name, unit_mass_kg, mass_basis, mass_by_material, pieces_per_unit,
 *  bends_per_unit, joints[], design_features[], processes[], open_questions[], note}.
 *  Returns {weld_schedule, profile}; a 400 carries `data.errors` = {'joints.3.count_per_unit': msg, note: msg, ...}. */
export function saveWeldScheduleVersion(jobNo, body) {
    return request(`${BASE}/weld-schedules/${encodeURIComponent(jobNo)}/versions/`,
        { method: 'POST', body: JSON.stringify(body) }, 'Kaynak listesi kaydedilemedi');
}

/** Same body, nothing saved, note optional: {totals, bottom_up, joints}. */
export function previewWeldScheduleVersion(jobNo, body) {
    return request(`${BASE}/weld-schedules/${encodeURIComponent(jobNo)}/versions/preview/`,
        { method: 'POST', body: JSON.stringify(body) }, 'Önizleme hesaplanamadı');
}

export const ESTIMATE_STATUS = {
    queued: { label: 'Sırada', badge: 'status-grey', icon: 'fa-clock' },
    running: { label: 'Çalışıyor', badge: 'status-blue', icon: 'fa-spinner fa-spin' },
    done: { label: 'Hazır', badge: 'status-green', icon: 'fa-check' },
    failed: { label: 'Hata', badge: 'status-red', icon: 'fa-triangle-exclamation' },
};

export const REVIEW_LABELS = {
    '': { label: 'İncelenmedi', badge: 'status-grey' },
    accept: { label: 'Kabul', badge: 'status-green' },
    correct: { label: 'Düzeltme', badge: 'status-orange' },
};

// ------------------------------------------------------------
// Referanslar (reference library): profiles, review, unit times, method.
// ------------------------------------------------------------

/** Every reference profile with its factor under the current unit times:
 *  {count, results, families}. Filters (comma-separated allowed): family,
 *  route, reliability, review_status, status (job status), search. */
export function listReferenceProfiles(filters = {}) {
    return request(`${BASE}/reference-profiles/${query(filters)}`, undefined, 'Referanslar yüklenemedi');
}

/** Factor distribution per family over the profiles that calibrate in-house estimates, plus counts. */
export function getReferenceSummary() {
    return request(`${BASE}/reference-profiles/summary/`, undefined, 'Özet yüklenemedi');
}

/** reviewStatus: verified | excluded (note required) | unreviewed. Returns the updated row. */
export function reviewReferenceProfile(jobNo, reviewStatus, note = '') {
    return request(`${BASE}/reference-profiles/${encodeURIComponent(jobNo)}/review/`,
        { method: 'POST', body: JSON.stringify({ review_status: reviewStatus, note }) }, 'İnceleme kaydedilemedi');
}

/** {parameters: [{key, label, unit, group, value, default, is_default, ...}], groups, changes}. */
export function getEstimatorParameters() {
    return request(`${BASE}/parameters/`, undefined, 'Parametreler yüklenemedi');
}

/** values: {key: number}. A 400 carries `data.errors` = {key: message}. */
export function updateEstimatorParameters(values, note = '') {
    return request(`${BASE}/parameters/`, { method: 'PUT', body: JSON.stringify({ values, note }) }, 'Parametreler kaydedilemedi');
}

/** {markdown}: the "Nasıl çalışır?" text, shared by the Referanslar page and the Tahmin tab. */
export function getEstimatorMethod() {
    return request(`${BASE}/method/`, undefined, 'Açıklama yüklenemedi');
}

export const REFERENCE_REVIEW = {
    unreviewed: { label: 'İncelenmedi', badge: 'status-grey' },
    verified: { label: 'Doğrulandı', badge: 'status-green' },
    excluded: { label: 'Hariç', badge: 'status-red' },
};

export const REFERENCE_ROUTE = {
    in_house: { label: 'İç imalat', badge: 'status-blue' },
    subcontract: { label: 'Taşeron', badge: 'status-purple' },
    mixed: { label: 'Karma', badge: 'status-orange' },
    unknown: { label: 'Bilinmiyor', badge: 'status-grey' },
};

export const REFERENCE_RELIABILITY = {
    ok: { label: 'Güvenilir', badge: 'status-green' },
    unreliable: { label: '≤ 10 h', badge: 'status-orange' },
    none: { label: 'Kayıt yok', badge: 'status-grey' },
};

export const REFERENCE_FAMILY = {
    copper_panel: 'Bakır panel', ebt: 'EBT', roof: 'Çatı', panel: 'Panel', duct: 'Kanal / dirsek',
    ladle: 'Pota', shell: 'Gövde', spare_parts: 'Yedek parça', other: 'Diğer',
};

// ------------------------------------------------------------
// Manufacturing plan (schema 2, hours method `plan_v5`): labels of the
// codes the backend sends (estimator plan_hours / weld_extraction). Shared
// by the Tahmin card and the Referanslar page.
// ------------------------------------------------------------

/** Structure class of a plan (plan_hours.STRUCTURE_CLASSES); the summary endpoint also sends `class_labels`. */
export const STRUCTURE_CLASS_LABELS = {
    boru_panel: 'Boru paneli', sac_yapi: 'Sac yapı', agir_sac_yapi: 'Ağır sac yapı',
    mekanik_parca: 'Mekanik parça', kucuk_parca: 'Küçük parça', other: 'Diğer',
};

/** Work centres of the plan (plan_hours.WORK_CENTRES), in the server's order. */
export const WORK_CENTRE_LABELS = {
    shop: 'Kaynak atölyesi', mach: 'Talaşlı imalat', cnc: 'CNC kesim ve ağız açma', bend: 'Büküm / hadde', qc: 'Kalite kontrol (NDT)',
};
export const WORK_CENTRE_SHORT = { shop: 'atölye', mach: 'talaşlı', cnc: 'CNC', bend: 'büküm', qc: 'KK' };

/** Machining feature kinds (MachiningFeatureSchema.kind). */
export const MACHINING_KIND_LABELS = {
    face: 'Yüzey frezeleme', turn: 'Tornalama', from_solid: "Solid'den işleme", bore: 'Hassas delik', drill: 'Delik',
    tap: 'Diş', slot: 'Kanal / oval delik', bevel: 'Talaşlı ağız', grind: 'Taşlama', contour: 'Kontur', op_default: 'Ölçüsüz operasyon',
};

/** Machine classes (plan_hours.MACHINE_CODES). */
export const MACHINE_LABELS = {
    lathe: 'Torna', vmc: 'Dik işleme merkezi', hmc: 'Yatay işleme merkezi', boring_mill: 'Borwerk', drill: 'Matkap', grinder: 'Taşlama',
};

export const TOLERANCE_LABELS = { general: 'genel', fine: 'hassas (IT7)', ground: 'taşlanmış (IT6)' };

/** Where a joint / part / feature came from: drawn on a sheet, deduced by the model, or a Python rule. */
export const SOURCE_LABELS = {
    drawn: { label: 'çizim', badge: 'status-grey', title: 'Çizimde / BOM\'da var' },
    deduced: { label: 'çıkarım', badge: 'status-purple', title: 'Çizimde yok; model yapının gerektirdiğini çıkardı' },
    rule: { label: 'kural', badge: 'status-orange', title: 'Model vermedi; sunucu kuralı ekledi' },
};

/** Weld-list schema: 1 = joint list, 2 = manufacturing plan (sub-assemblies, parts, machining). */
export const SCHEMA_LABELS = {
    1: { label: 'v1 liste', badge: 'status-grey', title: 'Kaynak listesi (şema 1): parça ve talaşlı özellikleri yok' },
    2: { label: 'plan v2', badge: 'status-blue', title: 'İmalat planı (şema 2): alt montajlar, parçalar, talaşlı özellikler' },
};

/** Why a reference cannot calibrate the machining centre (calibration.machining_exclusion_reason). */
export const MACHINING_EXCLUSION_LABELS = {
    'no recorded machining hours': 'Kayıtlı talaşlı saati yok',
    'unreliable (<= 10 h machining recorded)': 'Güvenilmez talaşlı saat kaydı (≤ 10 h)',
    'v1 weld list (no machining features)': 'v1 kaynak listesi (talaşlı özellik yok)',
    'no machining in the plan': 'Planda talaşlı imalat yok',
    'excluded by review': 'İnceleme ile hariç',
    'no plan': 'Plan yok',
};
export function machiningExclusionLabel(reason) {
    if (!reason) return '';
    if (MACHINING_EXCLUSION_LABELS[reason]) return MACHINING_EXCLUSION_LABELS[reason];
    if (String(reason).startsWith('unreliable')) return 'Güvenilmez talaşlı saat kaydı (≤ 10 h)';
    return String(reason);
}

/** Verdict of the plan's hours per tonne against the class band (calibration.band_check). */
export const BAND_STATUS = {
    below: { label: 'altında', badge: 'status-orange' },
    inside: { label: 'içinde', badge: 'status-green' },
    above: { label: 'üstünde', badge: 'status-orange' },
    unknown: { label: 'bilinmiyor', badge: 'status-grey' },
};

export const SUB_ASSEMBLY_KIND_LABELS = {
    built_up_beam: 'Kaynaklı kiriş', box_section: 'Kutu kesit', frame: 'Çerçeve', box_foot: 'Kutu ayak', bracket_support: 'Konsol / mesnet',
    shell_course: 'Gövde halkası', ring: 'Halka', plate_panel: 'Sac panel', pipe_panel: 'Boru paneli', pipe_spool: 'Boru hattı',
    machined_assembly: 'İşlenmiş montaj', bolted_only: 'Cıvatalı (kaynaksız)', other: 'Diğer',
};

export const PART_KIND_LABELS = {
    plate: 'Sac', profile: 'Profil', pipe: 'Boru', bent_plate: 'Bükülmüş sac', rolled_shell: 'Haddelenmiş gövde',
    machined: 'İşlenmiş parça', forging: 'Dövme', casting: 'Döküm', purchased: 'Satın alınan', fastener: 'Bağlantı elemanı',
};
