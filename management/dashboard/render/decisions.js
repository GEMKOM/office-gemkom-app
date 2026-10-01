/**
 * Karar kuyruğu: badge rows per subject (count by subject status, zombie-proof),
 * the viewer's own 'Sizi bekleyen' chip and the purple housekeeping footnote.
 */
import { escapeHtml, n0, num, stamp, chip, sbadge, dots, skeleton, moneyFmt } from './util.js';
import { SUBJECT_META, SUBJECT_ORDER, ALWAYS_VISIBLE_SUBJECTS } from './labels.js';

function rowColor(key, row) {
    const oldest = n0(row.oldest_days);
    if (key === 'vacation_request') {
        if (n0(row.urgent) >= 1) return 'red';
        return oldest > 3 ? 'orange' : 'blue';
    }
    if (key === 'overtime_request') {
        if (n0(row.starts_2d) >= 1) return 'red';
        return oldest > 3 ? 'orange' : 'blue';
    }
    if (oldest > 14) return 'red';
    if (oldest > 3) return 'orange';
    return 'blue';
}

function rowDetail(key, row, money) {
    const parts = [];
    if (row.oldest_days !== null && row.oldest_days !== undefined && n0(row.count) > 0) parts.push(`en eski ${num(row.oldest_days)} gün`);
    if (key === 'purchase_request') {
        if (n0(row.critical) > 0) parts.push(`<span class="pp-num-red">${num(row.critical)} kritik</span>`);
        if (money(row.value_eur)) parts.push(money(row.value_eur));
    } else if (key === 'subcontractor_statement' || key === 'sales_offer') {
        if (money(row.value_eur)) parts.push(money(row.value_eur));
    } else if (key === 'overtime_request') {
        if (n0(row.starts_2d) > 0) parts.push(`<span class="pp-num-red">${num(row.starts_2d)} tanesi 2 gün içinde</span>`);
    } else if (key === 'vacation_request') {
        const sub = [];
        if (n0(row.urgent) > 0) sub.push(`<span class="pp-num-red">${num(row.urgent)} acil</span>`);
        if (n0(row.past_dated) > 0) sub.push(`${num(row.past_dated)} tarihi geçmiş`);
        if (n0(row.cancellation_requested) > 0) sub.push(`${num(row.cancellation_requested)} iptal talebi`);
        if (sub.length) parts.unshift(`→ ${sub.join(' · ')}`);
    } else if (key === 'qc_review') {
        if (n0(row.reviews) > 0) parts.push(`${num(row.reviews)} inceleme`);
    }
    return parts.join(' · ');
}

/** 'Sizi bekleyen' chip HTML ('' when 0 / null). */
export function mineChip(mine) {
    if (!mine || n0(mine.count) <= 0) return '';
    const color = n0(mine.oldest_days) > 7 ? 'red' : 'blue';
    const by = Object.entries(mine.by_type || {}).filter(([, v]) => n0(v) > 0)
        .map(([k, v]) => `${(SUBJECT_META[k] || {}).label || k} ${num(v)}`);
    const text = dots(`Sizi bekleyen ${num(mine.count)}`, mine.oldest_days !== null && mine.oldest_days !== undefined ? `en eski ${num(mine.oldest_days)} gün` : '');
    return `<div class="dash-mine" data-mine-count="${n0(mine.count)}">${sbadge(color, text, by.join(' · '))}${by.length ? `<span class="dash-mine-by">${escapeHtml(by.join(' · '))}</span>` : ''}</div>`;
}

export function patchMine(host, mine) {
    const slot = host && host.querySelector('[data-mine-slot]');
    if (slot) slot.innerHTML = mineChip(mine);
}

export function renderDecisions(host, decisions, { meta = {}, errors = {}, loading = false } = {}) {
    if (!host) return;
    const head = `<div class="card-header dash-card-head"><h5><i class="fas fa-clipboard-check text-primary"></i> Karar Kuyruğu</h5><span class="dash-card-stamp" data-stamp>${decisions && decisions.generated_at ? `Veri ${escapeHtml(stamp(decisions.generated_at))}` : ''}</span></div>`;
    if (loading) {
        host.dataset.state = 'loading';
        host.innerHTML = `${head}<div class="card-body">${skeleton(5)}</div>`;
        return;
    }
    if (!decisions) {
        host.dataset.state = 'error';
        host.innerHTML = `${head}<div class="card-body"><div class="dash-empty">${escapeHtml(errors.decisions ? `Bu blok yüklenemedi (${stamp(meta.generated_at)})` : 'Karar verisi yok')}</div></div>`;
        return;
    }
    host.dataset.state = 'ready';
    const money = moneyFmt(meta);
    const byType = decisions.by_type || {};
    const rows = [];
    for (const key of SUBJECT_ORDER) {
        const row = byType[key];
        if (row === null || row === undefined) continue; // crane_request null = table empty → hidden
        const count = n0(row.count);
        if (count === 0 && !ALWAYS_VISIBLE_SUBJECTS.has(key)) continue;
        const metaRow = SUBJECT_META[key] || { label: key, url: '#', icon: 'circle' };
        const url = row.url || metaRow.url;
        const color = count === 0 ? 'grey' : rowColor(key, row);
        const detail = count === 0 ? '<span class="text-muted">bekleyen yok</span>' : rowDetail(key, row, money);
        rows.push(`<a class="dash-dec-row" href="${escapeHtml(url)}" data-subject="${key}" data-count="${count}">
            <span class="dash-dec-icon"><i class="fas fa-${metaRow.icon}"></i></span>
            <span class="dash-dec-label">${escapeHtml(metaRow.label)}</span>
            <span class="dash-dec-detail">${detail}</span>
            ${sbadge(color, String(count))}
            <i class="fas fa-chevron-right dash-dec-chev"></i>
        </a>`);
    }
    const z = decisions.zombies || null;
    const zombieNote = z && (n0(z.pr_workflows) > 0 || n0(z.no_approver_stages) > 0)
        ? `<a class="dash-zombie" href="/it/approvals">${sbadge('purple', 'Onay sistemi')} ${escapeHtml(dots(
            n0(z.pr_workflows) > 0 ? `${num(z.pr_workflows)} iptal edilmiş satın alma talebinin onay akışı hâlâ açık` : '',
            n0(z.no_approver_stages) > 0 ? `${num(z.no_approver_stages)} aşamada onaylayıcı yok` : '',
        ))}</a>`
        : '';
    host.innerHTML = `${head}
        <div class="card-body dash-dec-body">
            <div data-mine-slot>${mineChip(decisions.mine)}</div>
            ${rows.length ? `<div class="dash-dec-rows">${rows.join('')}</div>` : '<div class="dash-empty">Karar bekleyen talep yok</div>'}
            ${zombieNote}
        </div>`;
}
