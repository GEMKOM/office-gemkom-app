/**
 * Capacity panel copy — pure functions from the /welding/planning/capacity/
 * payload to Turkish sentences, badges and orderings. No DOM, so it runs
 * under node (capacityText.test.mjs).
 *
 * House rules: badge classes only from components/badges/badges.css (never
 * yellow), no exclamation marks, working days are "iş günü", dates are
 * dd.mm.yyyy, kg are formatted like the sheet (tr-TR grouping).
 */

import { compareJobNos } from './jobSort.js';

// ---- verdicts --------------------------------------------------------------

export const RESOURCE_VERDICTS = {
    ok:         { badge: 'status-green',  icon: 'fa-circle-check',         label: 'Yetişiyor' },
    tight:      { badge: 'status-orange', icon: 'fa-hourglass-half',       label: 'Sıkışık' },
    overloaded: { badge: 'status-red',    icon: 'fa-triangle-exclamation', label: 'Dolu' },
    no_rate:    { badge: 'status-grey',   icon: 'fa-hourglass-start',      label: 'Veri yok' },
    idle:       { badge: 'status-grey',   icon: 'fa-circle',               label: 'Boş' },
};

export const BLOCK_VERDICTS = {
    on_track:  { badge: 'status-green',  icon: 'fa-circle-check',         label: 'Zamanında' },
    late_risk: { badge: 'status-red',    icon: 'fa-triangle-exclamation', label: 'Gecikecek' },
    no_target: { badge: 'status-orange', icon: 'fa-circle-question',      label: 'Termin yok' },
    no_data:   { badge: 'status-grey',   icon: 'fa-hourglass-start',      label: 'Veri yok' },
};

const UNKNOWN_VERDICT = { badge: 'status-grey', icon: 'fa-circle-question', label: 'Öngörü yok' };

export function verdictMeta(verdict, scope = 'block') {
    const table = scope === 'resource' ? RESOURCE_VERDICTS : BLOCK_VERDICTS;
    return table[verdict] || UNKNOWN_VERDICT;
}

// ---- formatting ------------------------------------------------------------

function num(value, digits = 0) {
    return Number(value).toLocaleString('tr-TR', {
        minimumFractionDigits: 0, maximumFractionDigits: digits,
    });
}

export function fmtKgText(value) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return num(Math.round(Number(value)));
}

/** 850 -> "850 kg", 1000 -> "1 t", 1250 -> "1,3 t", 166400 -> "166,4 t". */
export function formatTonnes(kg) {
    if (kg == null || Number.isNaN(Number(kg))) return '—';
    const n = Number(kg);
    if (Math.abs(n) < 1000) return `${num(Math.round(n))} kg`;
    return `${num(n / 1000, 1)} t`;
}

export function fmtWd(value) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return `${num(Number(value), 1)} iş günü`;
}

/** Signed chip text like the gantt's target delta: "+12 gün" / "−3 gün". */
export function fmtWdShort(value) {
    if (value == null || Number.isNaN(Number(value))) return '';
    const n = Number(value);
    if (n === 0) return '0 gün';
    return `${n > 0 ? '+' : '−'}${num(Math.abs(n), 1)} gün`;
}

export function fmtFactor(value) {
    if (value == null || Number.isNaN(Number(value))) return '×1';
    return `×${num(Number(value), 2)}`;
}

export function fmtEurPerKg(value) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return `${num(Number(value), 2)} €/kg`;
}

export function fmtDateTr(iso) {
    if (!iso) return '—';
    const s = String(iso).slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    return `${m[3]}.${m[2]}.${m[1]}`;
}

/** kg per working day -> "4,2 t/hafta" (5 working days). */
export function fmtPerWeek(kgPerWd) {
    if (kgPerWd == null || Number.isNaN(Number(kgPerWd))) return '—';
    return `${num(Number(kgPerWd) * 5 / 1000, 1)} t/hafta`;
}

export function fmtRate(kgPerWd) {
    if (kgPerWd == null || Number.isNaN(Number(kgPerWd))) return '—';
    return `≈ ${num(Math.round(Number(kgPerWd)))} kg-eş/iş günü`;
}

// ---- resource sentences ----------------------------------------------------

const RATE_SOURCE_TEXT = {
    manual: 'elle girilen kapasite',
    statements: 'hakedişlerden ölçüldü',
    progress_logs: 'ilerleme kayıtlarından ölçüldü',
    completed_blocks: 'tamamlanan bloklardan ölçüldü',
    plan_entries: 'girilen planlardan türetildi',
};

const CONFIDENCE_TEXT = { high: 'güven yüksek', low: 'güven düşük', manual: 'planlamacının değeri' };

export function rateSentence(res, months = 6) {
    if (!res || res.rate_kg_per_wd == null) {
        return 'Hız ölçülemedi — kapasiteyi elle girin ya da hakediş / ilerleme kaydı birikmesi gerekir.';
    }
    const parts = [fmtRate(res.rate_kg_per_wd), RATE_SOURCE_TEXT[res.rate_source] || res.rate_source];
    const ev = res.evidence || {};
    const details = [];
    if (res.rate_source === 'statements') {
        const spans = (ev.statements?.spans || []).filter(s => s.active && !s.outlier);
        details.push(`son ${months} ayın ${spans.length} hakediş dönemi`);
        if (ev.statements?.per_person_kg_per_wd != null && res.headcount) {
            details.push(`kişi başı ≈ ${num(Math.round(ev.statements.per_person_kg_per_wd))} kg-eş/iş günü × ${res.headcount} kişi`);
        }
    } else if (res.rate_source === 'progress_logs') {
        details.push(`son ${months} ay, ${ev.progress_logs?.blocks || 0} blok`);
    } else if (res.rate_source === 'completed_blocks') {
        details.push(`${(ev.completed_blocks?.samples || []).length} tamamlanan blok; bloklar paralel yürüdüğünde alt sınır`);
    } else if (res.rate_source === 'plan_entries') {
        details.push('planlanan günlük yükün %75 dilimi — ölçüm değil, planlamacının varsayımı');
    }
    if (res.confidence && CONFIDENCE_TEXT[res.confidence]) details.push(CONFIDENCE_TEXT[res.confidence]);
    if (Array.isArray(res.band) && res.band.length === 2 && res.rate_source !== 'manual') {
        details.push(`aralık ${num(Math.round(res.band[0]))}–${num(Math.round(res.band[1]))}`);
    }
    return `${parts.join(' — ')}${details.length ? ` (${details.join(' · ')})` : ''}`;
}

export function headcountSentence(res) {
    if (!res) return '';
    if (res.headcount) {
        const src = res.headcount_source === 'statements' ? 'hakediş, beyan edilen' : 'elle girildi';
        return `${res.headcount} kişi (${src})`;
    }
    return res.resource_type === 'team'
        ? 'Ekip tek birim olarak planlanır'
        : 'Kişi sayısı bilinmiyor (hakedişe girilmemiş)';
}

export function backlogSentence(res) {
    if (!res || !res.open_blocks) return 'Açık iş yok';
    const parts = [`${res.open_blocks} açık blok`];
    let kg = `kalan ${formatTonnes(res.remaining_kg)}`;
    if (res.remaining_eff_kg != null && res.mean_difficulty != null
            && Math.abs(Number(res.mean_difficulty) - 1) >= 0.05) {
        kg += ` (zorluk ağırlıklı ${formatTonnes(res.remaining_eff_kg)}-eş, ort. ${fmtFactor(res.mean_difficulty)})`;
    }
    parts.push(kg);
    if (res.rate_kg_per_wd == null) {
        parts.push('hız bilinmediği için süre hesaplanamıyor');
    } else if (res.backlog_wd != null) {
        const weeks = Math.round(Number(res.backlog_wd) / 5);
        parts.push(`≈ ${fmtWd(res.backlog_wd)} (~${weeks} hafta)${res.backlog_end ? ` → ${fmtDateTr(res.backlog_end)}` : ''}`);
    }
    if (res.overdue_blocks) {
        parts.push(`termini geçmiş ${res.overdue_blocks} blok (${formatTonnes(res.overdue_kg)})`);
    }
    return parts.join(' · ');
}

export function pressureSentence(res) {
    if (!res || res.required_eff_kg_per_wd == null) return '';
    const until = res.peak_deadline ? ` (${fmtDateTr(res.peak_deadline)} tarihine kadar)` : '';
    if (res.rate_kg_per_wd == null) {
        return `Terminler için gerekli hız ${fmtPerWeek(res.required_eff_kg_per_wd)}${until} — mevcut hız bilinmiyor`;
    }
    const ratio = res.pressure != null ? `${num(Number(res.pressure), 1)}×` : '';
    return `Terminler için gerekli ${fmtPerWeek(res.required_eff_kg_per_wd)} — mevcut ${fmtPerWeek(res.rate_kg_per_wd)}${ratio ? ` (${ratio}` : ''}${ratio && until ? `,${until.slice(1, -1) ? ` ${until.slice(2, -1)}` : ''})` : (ratio ? ')' : until)}`;
}

export function resourceVerdictSentence(res) {
    if (!res) return '';
    const lateCount = (res.blocks || []).filter(
        b => b.verdict === 'late_risk' && !(b.flags || []).includes('deadline_passed')).length;
    switch (res.verdict) {
        case 'ok': return 'Açık işler terminlerine yetişiyor.';
        case 'tight': return 'Açık işler termine yakın bitiyor; yeni iş alınırsa gecikme başlar.';
        case 'overloaded':
            return `${lateCount} blok terminine yetişmiyor${res.backlog_end ? `; kaynak ${fmtDateTr(res.backlog_end)} tarihine kadar dolu` : ''}.`;
        case 'no_rate':
            return 'Hız ölçülemedi — öngörü için kapasiteyi elle girin ya da hakediş / ilerleme kaydı gerekir.';
        case 'idle': return 'Bu kaynakta açık iş yok.';
        default: return '';
    }
}

// ---- block sentences -------------------------------------------------------

export function deadlineBasisLabel(basis) {
    return { job_target: 'iş emri hedefi', paint_plan: 'boya planından önce',
             paint_default: 'boyaya 5 iş günü payla' }[basis] || '';
}

export function deadlineText(deadline, basis) {
    if (!deadline) return 'termin girilmemiş';
    const label = deadlineBasisLabel(basis);
    return `termin ${fmtDateTr(deadline)}${label ? ` (${label})` : ''}`;
}

export function difficultySentence(block, params) {
    if (!block) return '';
    if (params && params.difficulty === false) return 'zorluk ağırlığı kapalı';
    if (!block.difficulty_source || block.difficulty_source === 'none') {
        return 'fiyat bilgisi yok, ×1 sayıldı';
    }
    const ref = params?.reference_eur_per_kg != null ? ` (referans ${fmtEurPerKg(params.reference_eur_per_kg)})` : '';
    const clamped = (block.flags || []).includes('difficulty_clamped') ? ', sınırlandı' : '';
    const src = block.difficulty_source === 'job_tiers' ? 'iş emrinin kademelerinden' : 'fiyat kademesinden';
    return `${fmtFactor(block.difficulty)} — ${fmtEurPerKg(block.price_eur_per_kg)} ${src}${ref}${clamped}`;
}

export function blockVerdictLabel(block) {
    if (!block) return UNKNOWN_VERDICT.label;
    const slack = block.relaxed_slack_wd != null ? Number(block.relaxed_slack_wd) : null;
    switch (block.verdict) {
        case 'late_risk':
            if ((block.flags || []).includes('deadline_passed')) return 'Termini geçmiş';
            return slack != null && slack < 0 ? `${num(-slack, 1)} iş günü geç` : 'Gecikecek';
        case 'on_track':
            if (block.late_cause === 'plan_start') return 'Plan başlangıcı geç';
            return slack != null && slack > 0 ? `${num(slack, 1)} iş günü erken` : 'Zamanında';
        case 'no_target': return 'Termin yok';
        case 'no_data': return 'Veri yok';
        default: return UNKNOWN_VERDICT.label;
    }
}

export const SUGGESTION_ICONS = {
    late_on_resource: 'fa-triangle-exclamation',
    start_earlier: 'fa-calendar-day',
    reprioritize: 'fa-arrow-up-wide-short',
    move_to: 'fa-people-arrows',
    no_alternative: 'fa-ban',
    no_plan: 'fa-calendar-plus',
    no_rate_evidence: 'fa-gauge-high',
    placeholder_kg: 'fa-weight-hanging',
    assign_to: 'fa-user-plus',
    no_capacity: 'fa-ban',
    deadline_passed: 'fa-calendar-xmark',
};

// Candidate-level reasons read "<reason> <count>" so no Turkish number
// suffix is needed (4'ü, 2'si, 6'sı…); block-level reasons are one sentence.
const REASON_TEXT = {
    no_rate: 'hız verisi olmayan',
    target_late: 'zaten gecikmeli',
    no_tier: 'fiyat kademesi olmayan',
    late_after_insert: 'eklenince terminleri kaçıran',
};

const BLOCK_REASON_TEXT = {
    move_locked: 'hakedişe girmiş atama taşınamaz',
    started: 'başlamış iş taşınmaz',
    too_small: '500 kg altındaki iş taşınmaz',
};

function reasonsText(reasons) {
    const entries = Object.entries(reasons || {}).filter(([, n]) => n > 0);
    const blockLevel = entries.filter(([k]) => BLOCK_REASON_TEXT[k]);
    if (blockLevel.length) return blockLevel.map(([k]) => BLOCK_REASON_TEXT[k]).join(', ');
    if (!entries.length) return 'uygun kaynak yok';
    const total = entries.reduce((s, [, n]) => s + n, 0);
    return `${total} aday: ${entries.map(([k, n]) => `${REASON_TEXT[k] || k} ${n}`).join(', ')}`;
}

function resourceName(s) {
    return s.resource_name || s.resource_key || 'başka kaynak';
}

/**
 * One plain sentence per suggestion. `ctx` = {block, resource, today, months}.
 */
export function suggestionSentence(s, ctx = {}) {
    if (!s || !s.kind) return '';
    const block = ctx.block || {};
    switch (s.kind) {
        case 'late_on_resource': {
            if (s.deadline_passed) {
                return `Termin ${fmtDateTr(s.deadline)} geçmiş; bu kaynakta sıra geldiğinde ${s.finish ? fmtDateTr(s.finish) : 'ufkun ötesinde'} biter — hedefi güncelleyin ya da işi kapatın.`;
            }
            const finish = s.beyond_horizon || !s.finish ? 'simülasyon ufkunun ötesinde' : `${fmtDateTr(s.finish)} tarihinde`;
            const ahead = s.queued_ahead_kg ? ` (önünde ${formatTonnes(s.queued_ahead_kg)} iş var)` : '';
            return `Bu kaynakta sıra geldiğinde ${finish} biter${ahead} — ${deadlineText(s.deadline, s.deadline_basis)}, ${s.lateness_wd != null ? fmtWd(s.lateness_wd) : 'belirsiz'} geç.`;
        }
        case 'start_earlier':
            return `Plan ${fmtDateTr(s.plan_start)} başlıyor ve ${fmtDateTr(s.finish_if_planned)} biter (${deadlineText(s.deadline, block.deadline_basis)}); ${fmtDateTr(s.proposed_start)} tarihinde başlanırsa ${fmtDateTr(s.finish_if_started)} biter ve yetişir.`;
        case 'reprioritize':
            return `Termin sırası bu işi ${s.ahead_of_job_no} işinin (%${num(s.ahead_of_progress_pct || 0)} tamamlanmış, termin ${fmtDateTr(s.ahead_of_deadline)}) önüne koyuyor — ekip önce bunu bitirmeli.`;
        case 'move_to': {
            const when = s.first_touch && s.finish ? `${fmtDateTr(s.first_touch)} – ${fmtDateTr(s.finish)} arasında` : (s.finish ? `${fmtDateTr(s.finish)} tarihinde` : 'ufkun ötesinde');
            const tier = s.price_tier_name ? `, ${s.price_tier_name} kademesiyle` : '';
            return `${resourceName(s)} kaynağına taşınırsa${tier} ${when} biter (${s.fits_deadline ? 'termine yetişir' : 'termini yine aşar'}).`;
        }
        case 'no_alternative':
            return `Taşınabileceği kaynak yok — ${reasonsText(s.reasons)}.`;
        case 'no_plan': {
            const missing = (s.missing || []).map(m => ({ start: 'başlangıç', duration: 'süre' }[m] || m)).join(' ve ');
            if (!s.informed || !s.proposed_start) {
                return `İmalat planı girilmemiş (${missing || 'başlangıç ve süre'})${s.uninformed_resources?.length ? `; ${s.uninformed_resources.join(', ')} için hız verisi olmadığından öneri üretilemiyor` : ''}.`;
            }
            const fits = s.fits_target == null ? '' : (s.fits_target ? ' — hedefe sığıyor' : ' — hedefe sığmıyor');
            return `İmalat planı girilmemiş (${missing}). Önerilen İmalat başlangıcı ${fmtDateTr(s.proposed_start)}, süre ${fmtWd(s.proposed_imalat_wd)}${s.welding_wd != null ? ` (kaynak işi ≈ ${fmtWd(s.welding_wd)})` : ''}${s.proposed_end ? `, bitiş ${fmtDateTr(s.proposed_end)}` : ''}${fits}.`;
        }
        case 'no_rate_evidence':
            return `Ölçülmüş hız yok — tarih üretilmedi${s.required_eff_kg_per_wd != null ? `; terminler için ${fmtPerWeek(s.required_eff_kg_per_wd)} gerekir` : ''}. Kapasiteyi elle girin.`;
        case 'placeholder_kg':
            return `Yer tutucu blok (${fmtKgText(s.allocated_kg)} kg) — gerçek kg girilmeden hesaba katılmıyor.`;
        case 'assign_to': {
            const when = s.first_touch && s.finish ? `${fmtDateTr(s.first_touch)} – ${fmtDateTr(s.finish)} arasında` : (s.finish ? `${fmtDateTr(s.finish)} tarihine kadar` : 'ufkun ötesinde');
            const tier = s.price_tier_name ? `, ${s.price_tier_name} kademesiyle` : '';
            const fit = s.fits_deadline ? 'termine yetişir' : 'termini aşar';
            return `${resourceName(s)} kaynağına verilirse${tier} ${when} yapılabilir (${fit}${s.best_effort ? '; hiçbir kaynak bütün terminleri tutmuyor, en erken biten bu' : ''}).`;
        }
        case 'no_capacity':
            return `Bu işi alabilecek kaynak yok — ${reasonsText(s.reasons)}.`;
        case 'deadline_passed':
            return `Termin ${fmtDateTr(s.deadline)} geçmiş — hedef güncellenmeden atama önerisi anlamsız.`;
        default:
            return '';
    }
}

// ---- report helpers --------------------------------------------------------

export function indexBlocksByKey(report) {
    const map = new Map();
    for (const res of report?.resources || []) {
        for (const block of res.blocks || []) {
            map.set(`${block.assignment_type}-${block.assignment_id}`, { block, resource: res });
        }
    }
    return map;
}

export function indexResourcesByKey(report) {
    const map = new Map();
    for (const res of report?.resources || []) map.set(res.key, res);
    return map;
}

function isOverdue(block) {
    return (block.flags || []).includes('deadline_passed');
}

/** late_risk blocks with a future deadline, worst first; ties by job number. */
export function lateBlocks(report) {
    const out = [];
    for (const res of report?.resources || []) {
        for (const block of res.blocks || []) {
            if (block.verdict === 'late_risk' && !isOverdue(block)) out.push({ block, resource: res });
        }
    }
    out.sort((a, b) => {
        const la = a.block.relaxed_slack_wd == null ? 0 : Number(a.block.relaxed_slack_wd);
        const lb = b.block.relaxed_slack_wd == null ? 0 : Number(b.block.relaxed_slack_wd);
        if (la !== lb) return la - lb;                 // more negative = later
        return compareJobNos(a.block.job_no, b.block.job_no);
    });
    return out;
}

/** Blocks whose deadline already passed, oldest deadline first. */
export function overdueBlocks(report) {
    const out = [];
    for (const res of report?.resources || []) {
        for (const block of res.blocks || []) {
            if (isOverdue(block)) out.push({ block, resource: res });
        }
    }
    out.sort((a, b) => String(a.block.deadline || '').localeCompare(String(b.block.deadline || ''))
        || compareJobNos(a.block.job_no, b.block.job_no));
    return out;
}

/** Blocks with a plan-start problem (on time if started now). */
export function planStartBlocks(report) {
    const out = [];
    for (const res of report?.resources || []) {
        for (const block of res.blocks || []) {
            if (block.late_cause === 'plan_start') out.push({ block, resource: res });
        }
    }
    return out;
}

/** Simulation order: by first touch, undated last, stable by job number. */
export function planOrder(blocks) {
    return [...(blocks || [])].sort((a, b) => {
        const sa = a.first_touch || null;
        const sb = b.first_touch || null;
        if (sa && sb && sa !== sb) return sa < sb ? -1 : 1;
        if (sa && !sb) return -1;
        if (!sa && sb) return 1;
        return compareJobNos(a.job_no, b.job_no);
    });
}

export function summaryLine(summary) {
    if (!summary) return '';
    const parts = [];
    if (summary.late_blocks) parts.push(`${summary.late_blocks} blok gecikme riskinde`);
    if (summary.plan_start_late_blocks) parts.push(`${summary.plan_start_late_blocks} blokta plan başlangıcı geç`);
    if (summary.overdue_blocks) parts.push(`${summary.overdue_blocks} blokta termin geçmiş`);
    if (summary.overloaded_resources) parts.push(`${summary.overloaded_resources} kaynak dolu`);
    if (summary.no_rate_resources) parts.push(`${summary.no_rate_resources} kaynakta hız verisi yok`);
    if (summary.unplanned_jobs) parts.push(`${summary.unplanned_jobs} iş plansız`);
    if (summary.unassigned_jobs) parts.push(`${summary.unassigned_jobs} işte atanmamış kg`);
    return parts.length ? parts.join(' · ') : 'Açık işlerin tümü terminine yetişiyor.';
}
