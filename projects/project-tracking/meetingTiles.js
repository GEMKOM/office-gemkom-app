/**
 * Section tiles on the meeting slide — one row of headline figures out of
 * the /meeting-brief/ payload (Kalite, Dizayn, Satın Alma, CNC Kesim,
 * Talaşlı, Kaynak, Dosyalar, Finans). Each tile is the door to its section
 * modal; the figure on it is what the old full-size panel led with.
 *
 * House rules: badge/number colours only from the house palette (never
 * yellow), no exclamation marks, "iş günü" for working days.
 */
import { escapeHtml } from '../../utils/text.js';

export const FINANCIAL_META = {
    healthy: { theme: 'green', label: 'Finans · Sağlıklı' },
    risky: { theme: 'orange', label: 'Finans · Riskli' },
    critical: { theme: 'red', label: 'Finans · Kritik' },
    no_price: { theme: 'grey', label: 'Finans · Fiyat Yok' },
    no_data: { theme: 'grey', label: 'Finans · Veri Yok' },
};

export const FILE_GROUP_LABELS = [
    ['job_order', 'İş Emri'],
    ['task', 'Görev'],
    ['discussion', 'Tartışma'],
];

function fmtInt(value) {
    return Math.round(value ?? 0).toLocaleString('tr-TR');
}

function fmtHours(value) {
    return (value ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
}

function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('tr-TR');
}

function fmtWd(value) {
    const abs = Math.abs(Number(value) || 0);
    return (abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1)).replace('.', ',');
}

function tileHtml({ kind, icon, title, big, label, subs = [], theme = 'grey', modal = null, tooltip = '', alert = false }) {
    const link = modal ? ` data-modal="${modal}" role="button" tabindex="0"` : '';
    const hint = modal ? '<span class="pp-tile-hint"><i class="fas fa-expand"></i></span>' : '';
    const subHtml = subs.filter(Boolean).map(s => `<div class="pp-tile-sub">${s}</div>`).join('');
    const tip = tooltip || (modal ? 'Detayı aç' : '');
    return `
        <div class="pp-tile pp-tile-${theme}${modal ? ' pp-tile-click' : ''}${alert ? ' pp-tile-alert' : ''}"
             data-tile="${kind}"${link}${tip ? ` title="${escapeHtml(tip)}"` : ''}>
            <div class="pp-tile-head"><i class="fas fa-${icon}"></i>${title}${hint}</div>
            <div class="pp-tile-big">${big}</div>
            <div class="pp-tile-label">${label}</div>
            ${subHtml}
        </div>`;
}

function qualityTile(quality) {
    if (!quality) return '';
    const open = quality.open || 0;
    const sev = quality.open_by_severity || {};
    const parts = [];
    if (sev.critical) parts.push(`<span class="pp-num-red">Kritik ${fmtInt(sev.critical)}</span>`);
    if (sev.major) parts.push(`<span class="pp-num-orange">Majör ${fmtInt(sev.major)}</span>`);
    if (sev.minor) parts.push(`Minör ${fmtInt(sev.minor)}`);
    const first = (quality.open_list || [])[0];
    return tileHtml({
        kind: 'quality', icon: 'clipboard-check', title: 'Kalite · NCR', modal: 'quality',
        theme: open ? 'red' : 'green', alert: open > 0,
        big: open
            ? `<span class="pp-num-red">${fmtInt(open)}</span>`
            : '<span class="pp-num-green"><i class="fas fa-circle-check"></i></span>',
        label: open ? 'açık NCR' : 'açık NCR yok',
        subs: [
            parts.join(' · ') || `toplam ${fmtInt(quality.total)} NCR`,
            first ? `<strong>${escapeHtml(first.ncr_number)}</strong> ${escapeHtml(first.title || '')}` : '',
        ],
    });
}

function revisionsTile(revisions) {
    if (!revisions) return '';
    const drawing = revisions.drawing || {};
    const targets = revisions.design_targets || {};
    const latest = drawing.latest;
    const theme = drawing.in_revision_count ? 'orange' : (latest ? 'green' : 'grey');
    const revLine = `<span class="${drawing.revision_count ? 'pp-num-orange' : ''}">${fmtInt(drawing.revision_count)} kez revize edildi</span>`
        + (drawing.in_revision_count ? ` · <span class="pp-num-orange">${fmtInt(drawing.in_revision_count)} yayın revizyonda</span>` : '');
    const targetLine = targets.total
        ? `Hedef ${targets.latest ? fmtDate(targets.latest) : '—'} · ${fmtInt(targets.with_target)}/${fmtInt(targets.total)} dizayn görevinde tarih`
        : '';
    return tileHtml({
        kind: 'revisions', icon: 'pen-ruler', title: 'Dizayn', modal: 'revisions', theme,
        big: latest ? fmtDate(latest.released_at) : '—',
        label: latest
            ? `son yayın · Rev ${escapeHtml(latest.revision_code || `R${latest.revision_number}`)}`
            : 'teknik resim yayını yok',
        subs: [revLine, targetLine],
    });
}

function procurementTile(procurement) {
    if (!procurement) return '';
    const waiting = procurement.items_waiting || 0;
    const total = procurement.items_total || 0;
    const pct = procurement.progress_pct;
    const pulls = procurement.material_pulls;
    const theme = procurement.critical_waiting ? 'red' : (waiting ? 'orange' : 'green');
    const pullLine = pulls && pulls.items_pulled > 0
        ? `Depodan çekilen ${fmtInt(pulls.items_pulled)} kalem`
            + (pulls.pending > 0 ? ` · <span class="pp-num-orange">${fmtInt(pulls.pending)} talep bekliyor</span>` : '')
        : '';
    return tileHtml({
        kind: 'procurement', icon: 'cart-shopping', title: 'Satın Alma', modal: 'procurement', theme,
        big: `<span class="${waiting ? 'pp-num-orange' : 'pp-num-green'}">${fmtInt(waiting)}</span><span class="pp-tile-big-dim">/${fmtInt(total)}</span>`,
        label: 'bekleyen kalem',
        subs: [
            `<span class="pp-num-green">%${pct === null || pct === undefined ? 0 : pct.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span> tedarik · talebe dönüşmedi ${fmtInt(procurement.not_yet_requested)}`,
            procurement.critical_waiting
                ? `<span class="pp-num-red">Kritik bekleyen ${fmtInt(procurement.critical_waiting)}: imalatı tutuyor</span>`
                : pullLine,
        ],
    });
}

function cuttingTile(cutting) {
    if (!cutting) return '';
    const waiting = cutting.parts_waiting || 0;
    const material = cutting.parts_waiting_material || 0;
    return tileHtml({
        kind: 'cutting', icon: 'scissors', title: 'CNC Kesim', modal: 'cutting',
        theme: material ? 'orange' : (waiting ? 'blue' : 'green'),
        big: `<span class="${waiting ? 'pp-num-orange' : 'pp-num-green'}">${fmtInt(waiting)}</span>`,
        label: 'parça kesim bekliyor',
        subs: [
            `Kesilen ${fmtInt(cutting.parts_cut)} / ${fmtInt(cutting.parts_total)} parça · ${fmtInt(cutting.weight_cut)} / ${fmtInt(cutting.weight_total)} kg`,
            material
                ? `<span class="pp-num-orange">${fmtInt(material)} parça · ${fmtInt(cutting.weight_waiting_material)} kg malzeme bekliyor</span>`
                : '',
        ],
    });
}

function machiningTile(machining) {
    if (!machining) return '';
    const waiting = machining.operations_waiting || 0;
    return tileHtml({
        kind: 'machining', icon: 'gears', title: 'Talaşlı İmalat', modal: 'machining',
        theme: waiting ? 'blue' : 'green',
        big: `<span class="${waiting ? 'pp-num-orange' : 'pp-num-green'}">${fmtInt(waiting)}</span>`,
        label: 'operasyon bekliyor',
        subs: [
            `${fmtInt(machining.operations_completed)} / ${fmtInt(machining.operations_total)} tamamlandı · ${fmtInt(machining.parts_completed)} / ${fmtInt(machining.parts_total)} parça`,
            `Tahmini ${fmtHours(machining.estimated_hours_total)} s · harcanan ${fmtHours(machining.hours_spent)} s · kalan ~${fmtHours(machining.hours_remaining)} s`,
        ],
    });
}

function weldingTile(welding) {
    if (!welding) return '';
    const resources = welding.resources || [];
    const overall = welding.weighted_progress_pct;
    const taskPct = welding.task_progress_pct;
    const usingTask = (overall === null || overall === undefined) && taskPct !== null && taskPct !== undefined;
    const big = usingTask ? taskPct : overall;
    const wait = welding.material_wait || {};
    const waitParts = [];
    if (wait.pipe_profile_items_pending) waitParts.push(`${fmtInt(wait.pipe_profile_items_pending)} boru/profil`);
    if (wait.critical_items_pending) waitParts.push(`${fmtInt(wait.critical_items_pending)} kritik kalem`);
    const lost = wait.days_lost_wd;
    const hasLoss = typeof lost === 'number' && lost > 0;
    const subs = [resources.length
        ? `${fmtInt(resources.length)} kaynak · ${fmtInt(welding.allocated_kg_total)} kg tahsis`
        : 'Kaynak ataması yok'];
    if (waitParts.length) {
        subs.push(`<span class="pp-num-orange">${waitParts.join(' · ')} malzeme bekliyor${hasLoss ? ` · ${fmtWd(lost)} iş günü kayıp` : ''}</span>`);
    } else if (hasLoss) {
        subs.push(`<span class="pp-num-orange">Malzeme bekleme kaybı ${fmtWd(lost)} iş günü</span>`);
    } else if (resources.length) {
        const names = resources.slice(0, 2).map(r => escapeHtml(r.name));
        subs.push(names.join(' · ') + (resources.length > 2 ? ` +${resources.length - 2}` : ''));
    }
    return tileHtml({
        kind: 'welding', icon: 'fire', title: 'Kaynaklı İmalat', modal: 'welding',
        theme: waitParts.length ? 'orange' : 'blue',
        big: big === null || big === undefined ? '—' : `%${fmtInt(big)}`,
        label: usingTask ? 'görev ilerlemesi' : 'ağırlıklı ilerleme',
        subs,
    });
}

function filesTile(files) {
    if (!files) return '';
    const total = FILE_GROUP_LABELS.reduce((n, [key]) => n + ((files[key] || {}).total || 0), 0);
    const merged = FILE_GROUP_LABELS.flatMap(([key, label]) =>
        ((files[key] || {}).items || []).map(f => ({ ...f, source: label })));
    merged.sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')));
    const newest = merged[0];
    const counts = FILE_GROUP_LABELS.map(([key, label]) => `${label} ${fmtInt((files[key] || {}).total)}`).join(' · ');
    return tileHtml({
        kind: 'files', icon: 'folder-open', title: 'Dosyalar', modal: total ? 'files' : null, theme: 'grey',
        big: fmtInt(total),
        label: 'dosya',
        subs: [counts, newest ? `Son: ${escapeHtml(newest.name || 'dosya')} · ${fmtDate(newest.uploaded_at)}` : 'Dosya yok'],
    });
}

// Verdict word ONLY — the slide is company-public, so no ratios, no amounts
// (user decision 2026-08-04). Cost-permitted users click through to the
// amounts modal; the section endpoint re-checks the permission server-side.
function financialTile(financial) {
    if (!financial) return '';
    const meta = FINANCIAL_META[financial.verdict] || FINANCIAL_META.no_data;
    const clickable = !!financial.can_view_details;
    const reason = (financial.reason || '')
        + (financial.price_is_derived ? ' · satış fiyatı türetilmiş' : '')
        + (clickable ? ' · detay için tıklayın' : '');
    return tileHtml({
        kind: 'financial', icon: 'coins', title: 'Finans', modal: clickable ? 'financial' : null,
        theme: meta.theme,
        big: meta.label.replace('Finans · ', ''),
        label: 'maliyet durumu',
        tooltip: reason,
    });
}

/** The whole tile row for a brief, in slide order. */
export function renderTilesHtml(brief) {
    if (!brief) return tilesSkeletonHtml();
    return [
        qualityTile(brief.quality),
        revisionsTile(brief.revisions),
        procurementTile(brief.procurement),
        cuttingTile(brief.cutting),
        machiningTile(brief.machining),
        weldingTile(brief.welding),
        filesTile(brief.files),
        financialTile(brief.financial),
    ].join('');
}

export function tilesSkeletonHtml(count = 8) {
    return Array.from({ length: count }, () => `
        <div class="pp-tile pp-tile-grey pp-tile-skeleton">
            <div class="pp-skeleton pp-skeleton-title"></div>
            <div class="pp-skeleton pp-skeleton-big"></div>
            <div class="pp-skeleton pp-skeleton-short"></div>
        </div>`).join('');
}
