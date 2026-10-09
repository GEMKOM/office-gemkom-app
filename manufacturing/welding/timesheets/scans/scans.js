import { guardRoute } from '../../../../../authService.js';
import { initNavbar } from '../../../../../components/navbar.js';
import { initRouteProtection } from '../../../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../../../components/header/header.js';
import { showNotification } from '../../../../../components/notification/notification.js';
import { getJobOrderDropdown } from '../../../../../apis/projects/jobOrders.js';
import {
    uploadTimesheetScans, fetchScans, fetchScan, updateScan, approveScan, discardScan, reparseScan,
    approveCleanScans, fetchScanBatches, fetchMissingTimesheets, fetchTimesheets,
} from '../../../../../apis/welding/timesheets.js';
import { dateInputValue } from './scanForm.js';

// Mirrors welding/timesheet_layout.py — change both together.
const CELLS = [
    { start: '07:30', end: '08:00', hours: 0.5 },
    { start: '08:00', end: '09:00', hours: 1 },
    { start: '09:00', end: '10:00', hours: 1 },
    { start: '10:00', end: '11:00', hours: 1 },
    { start: '11:00', end: '12:00', hours: 1 },
    { start: '12:30', end: '13:00', hours: 0.5 },
    { start: '13:00', end: '14:00', hours: 1 },
    { start: '14:00', end: '15:00', hours: 1 },
    { start: '15:00', end: '16:00', hours: 1 },
    { start: '16:00', end: '17:00', hours: 1 },
    { start: '17:00', end: '18:00', hours: 1 },
    { start: '18:00', end: '19:00', hours: 1 },
    { start: '19:00', end: '20:00', hours: 1 },
    { start: '20:00', end: '21:00', hours: 1 },
];
const REGULAR_CELLS = 10;
const LUNCH_AFTER = 4;
const NOON_CELL = 5;

const STATUS_BADGE = {
    queued: 'status-grey',
    parsing: 'status-blue',
    needs_review: 'status-orange',
    clean: 'status-green',
    approved: 'status-green',
    discarded: 'status-grey',
    failed: 'status-red',
};
const SHEET_STATUS_BADGE = { printed: 'status-blue', scanned: 'status-purple', approved: 'status-green', blank: 'status-grey', void: 'status-red' };
const BUCKET_LABEL = { regular: 'N', after_hours: 'FM', holiday: 'T' };
const POLL_MS = 4000;

const $ = (id) => document.getElementById(id);

const state = {
    scans: [],
    jobOptions: [],
    pollTimer: null,
    review: null,        // { id, detail, draft, dirty, zoom, rotation }
    modal: null,
};

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toIso(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTr(value) {
    if (!value) return '-';
    const [y, m, d] = String(value).split('-').map(Number);
    if (!y || !m || !d) return value;
    return new Date(y, m - 1, d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short' });
}

function formatDateTime(value) {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
        return value;
    }
}

function badge(status, label) {
    return `<span class="status-badge ${STATUS_BADGE[status] || 'status-grey'}">${esc(label || status)}</span>`;
}

function hoursFor(cells, kind) {
    const out = {};
    const add = (bucket, h) => { out[bucket] = (out[bucket] || 0) + h; };
    CELLS.forEach((cell, idx) => {
        if (!cells[idx]) return;
        if (kind === 'sunday' || kind === 'holiday') add('holiday', cell.hours);
        else if (kind === 'saturday') add('after_hours', cell.hours);
        else if (kind === 'half_holiday') add(idx >= NOON_CELL ? 'holiday' : 'regular', cell.hours);
        else add(idx >= REGULAR_CELLS ? 'after_hours' : 'regular', cell.hours);
    });
    return out;
}

function fmtHours(h) {
    return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

function hoursText(hours) {
    const parts = Object.entries(hours).map(([k, v]) => `${BUCKET_LABEL[k] || k} ${fmtHours(Number(v))}`);
    return parts.length ? parts.join(' · ') : '–';
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();
    new HeaderComponent({
        title: 'Puantaj Taramaları',
        subtitle: 'Taranan kağıt puantaj formlarını kontrol edin ve zaman kayıtlarına aktarın',
        icon: 'file-import',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/manufacturing/welding/timesheets/',
        onRefreshClick: () => loadScans(),
    });

    state.modal = new bootstrap.Modal($('sc-review-modal'));

    const today = new Date();
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    $('sc-missing-from').value = toIso(weekAgo);
    $('sc-missing-to').value = toIso(yesterday);

    $('sc-upload').addEventListener('click', onUpload);
    $('sc-refresh').addEventListener('click', () => loadScans());
    $('sc-approve-clean').addEventListener('click', onApproveClean);
    ['sc-filter-status', 'sc-filter-from', 'sc-filter-to', 'sc-filter-batch'].forEach((id) => {
        $(id).addEventListener('change', () => loadScans());
    });
    ['sc-missing-from', 'sc-missing-to'].forEach((id) => $(id).addEventListener('change', loadMissing));

    $('sc-list').addEventListener('click', onListClick);
    $('sc-review-body').addEventListener('click', onReviewClick);
    $('sc-review-body').addEventListener('change', onReviewChange);
    $('sc-review-body').addEventListener('input', onReviewInput);
    $('sc-save').addEventListener('click', () => saveReview());
    $('sc-approve').addEventListener('click', onApproveCurrent);
    $('sc-discard').addEventListener('click', onDiscardCurrent);
    $('sc-reparse').addEventListener('click', onReparseCurrent);
    $('sc-prev').addEventListener('click', () => stepReview(-1));
    $('sc-next').addEventListener('click', () => stepReview(1));
    document.querySelectorAll('.sc-image-tools [data-zoom]').forEach((btn) => btn.addEventListener('click', () => zoomImage(btn.dataset.zoom)));
    document.querySelectorAll('.sc-image-tools [data-rotate]').forEach((btn) => btn.addEventListener('click', () => rotateImage(Number(btn.dataset.rotate))));
    $('sc-review-modal').addEventListener('hidden.bs.modal', () => { state.review = null; loadScans(); });

    loadJobOptions();
    await Promise.all([loadBatches(), loadScans(), loadMissing()]);
});

async function loadJobOptions() {
    try {
        state.jobOptions = await getJobOrderDropdown(true);
    } catch (error) {
        console.error('Job order options failed', error);
        state.jobOptions = [];
    }
    let list = $('sc-job-datalist');
    if (!list) {
        list = document.createElement('datalist');
        list.id = 'sc-job-datalist';
        document.body.appendChild(list);
    }
    list.innerHTML = state.jobOptions.map((j) => `<option value="${esc(j.job_no)}">${esc(j.title || '')}</option>`).join('');
}

async function loadBatches() {
    try {
        const data = await fetchScanBatches({ page_size: 50 });
        const rows = data.results || data;
        const select = $('sc-filter-batch');
        const current = select.value;
        select.innerHTML = '<option value="">Tüm yüklemeler</option>' + rows.map((b) => {
            const c = b.counts || {};
            const summary = Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ');
            return `<option value="${b.id}">#${b.id} ${esc(formatDateTime(b.uploaded_at))} ${esc(b.original_filename || '')} (${b.page_count} sayfa${summary ? '; ' + esc(summary) : ''})</option>`;
        }).join('');
        select.value = current;
    } catch (error) {
        console.error('Batches failed', error);
    }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function currentFilters() {
    return {
        status: $('sc-filter-status').value,
        date_from: $('sc-filter-from').value,
        date_to: $('sc-filter-to').value,
        batch: $('sc-filter-batch').value,
        page_size: 300,
    };
}

async function loadScans() {
    try {
        const data = await fetchScans(currentFilters());
        state.scans = data.results || data;
        renderList();
        schedulePolling();
    } catch (error) {
        console.error('Scans failed', error);
        $('sc-list').innerHTML = `<div class="p-3"><div class="alert alert-danger mb-0">${esc(error.message)}</div></div>`;
    }
}

function schedulePolling() {
    const busy = state.scans.some((s) => s.status === 'queued' || s.status === 'parsing');
    $('sc-polling').innerHTML = busy ? '<i class="fas fa-spinner fa-spin me-1"></i>Sayfalar okunuyor...' : '';
    if (busy && !state.pollTimer) {
        state.pollTimer = setTimeout(async () => { state.pollTimer = null; await loadScans(); await loadBatches(); }, POLL_MS);
    }
}

function flagSummary(scan) {
    const flags = scan.flags || [];
    if (!flags.length) return scan.status === 'failed' ? esc(scan.error || 'Okunamadı') : '';
    const shown = flags.slice(0, 2).map((f) => `<span class="sc-flag level-${esc(f.level)} d-inline-block me-1 mb-0 py-0">${esc(f.text)}</span>`).join('');
    const more = flags.length > 2 ? `<span class="text-muted">+${flags.length - 2}</span>` : '';
    return shown + more;
}

function renderList() {
    const container = $('sc-list');
    $('sc-count').textContent = state.scans.length ? `(${state.scans.length})` : '';
    if (!state.scans.length) {
        container.innerHTML = '<div class="p-3 text-muted">Bu filtreyle eşleşen tarama yok.</div>';
        return;
    }
    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm table-hover sc-table mb-0">
                <thead>
                    <tr>
                        <th></th><th>Yükleme</th><th>Çalışan</th><th>Form tarihi</th><th>Ekip</th>
                        <th class="text-end">Saat</th><th>Durum</th><th>Uyarılar</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    ${state.scans.map((s) => `
                        <tr data-id="${s.id}">
                            <td>${s.image_url ? `<img class="sc-thumb" src="${esc(s.image_url)}" alt="">` : ''}</td>
                            <td><span class="text-muted">#${s.batch}</span> s.${s.page_index}</td>
                            <td>${esc(s.employee_name || '?')}<br><span class="ts-code text-muted">${esc(s.sheet_code || '')}</span></td>
                            <td>${esc(formatTr(s.date))}</td>
                            <td>${esc(s.team_name || '-')}</td>
                            <td class="text-end">${s.blank_day ? '<span class="text-muted">çalışmadı</span>' : esc(s.total_hours)}</td>
                            <td>${badge(s.status, s.status_display)}</td>
                            <td class="sc-flags">${flagSummary(s)}</td>
                            <td class="text-end">
                                <div class="btn-group btn-group-sm">
                                    <button type="button" class="btn btn-outline-primary" data-action="review" data-id="${s.id}"><i class="fas fa-search"></i> İncele</button>
                                    ${s.status === 'clean' ? `<button type="button" class="btn btn-success" data-action="approve" data-id="${s.id}"><i class="fas fa-check"></i></button>` : ''}
                                    ${['queued', 'failed', 'needs_review', 'clean'].includes(s.status) ? `<button type="button" class="btn btn-outline-secondary" data-action="reparse" data-id="${s.id}" title="Yeniden oku"><i class="fas fa-redo"></i></button>` : ''}
                                    ${s.status !== 'approved' && s.status !== 'discarded' ? `<button type="button" class="btn btn-outline-danger" data-action="discard" data-id="${s.id}" title="Sil"><i class="fas fa-trash"></i></button>` : ''}
                                </div>
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

async function onListClick(ev) {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;
    if (action === 'review') {
        openReview(id);
        return;
    }
    btn.disabled = true;
    try {
        if (action === 'approve') {
            const res = await approveScan(id);
            showNotification(`${res.created_count} zaman kaydı oluşturuldu`, 'success');
        } else if (action === 'reparse') {
            await reparseScan(id);
            showNotification('Sayfa yeniden okunuyor', 'info');
        } else if (action === 'discard') {
            if (!window.confirm('Bu tarama silinsin mi?')) { btn.disabled = false; return; }
            await discardScan(id);
            showNotification('Tarama silindi', 'success');
        }
        await loadScans();
    } catch (error) {
        showNotification(error.message, 'error');
        btn.disabled = false;
    }
}

async function onUpload() {
    const input = $('sc-files');
    const files = Array.from(input.files || []);
    if (!files.length) {
        showNotification('Önce dosya seçin', 'warning');
        return;
    }
    const btn = $('sc-upload');
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Yükleniyor...';
    $('sc-upload-status').textContent = `${files.length} dosya yükleniyor...`;
    try {
        const res = await uploadTimesheetScans(files);
        const pages = (res.batches || []).reduce((n, b) => n + (b.page_count || 0), 0);
        $('sc-upload-status').textContent = `${res.batches.length} yükleme, ${pages} sayfa alındı. Sayfalar okunuyor.`;
        showNotification(`${pages} sayfa yüklendi`, 'success');
        input.value = '';
        await loadBatches();
        if (res.batches.length === 1) $('sc-filter-batch').value = String(res.batches[0].id);
        await loadScans();
    } catch (error) {
        $('sc-upload-status').textContent = '';
        showNotification(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

async function onApproveClean() {
    const batch = $('sc-filter-batch').value;
    const clean = state.scans.filter((s) => s.status === 'clean');
    if (!clean.length) {
        showNotification('Listede temiz sayfa yok', 'info');
        return;
    }
    if (!window.confirm(`${clean.length} temiz sayfa onaylanacak ve zaman kayıtları oluşturulacak. Devam edilsin mi?`)) return;
    const btn = $('sc-approve-clean');
    btn.disabled = true;
    try {
        const res = await approveCleanScans({ batch: batch || undefined, scan_ids: clean.map((s) => s.id) });
        const failed = (res.failed || []).length;
        showNotification(`${res.approved.length} sayfa onaylandı${failed ? `, ${failed} sayfa onaylanamadı` : ''}`, failed ? 'warning' : 'success');
        await loadScans();
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function loadMissing() {
    const from = $('sc-missing-from').value;
    const to = $('sc-missing-to').value || from;
    const box = $('sc-missing');
    if (!from) { box.textContent = 'Tarih seçin.'; return; }
    try {
        const data = await fetchMissingTimesheets(from, to);
        if (!data.count) {
            box.innerHTML = '<span class="text-success"><i class="fas fa-check me-1"></i>Seçilen tarihlerde eksik form yok.</span>';
            return;
        }
        box.innerHTML = `
            <div class="mb-1"><strong>${data.count}</strong> form henüz onaylanmadı.</div>
            <div class="table-responsive" style="max-height: 180px; overflow: auto;">
                <table class="table table-sm mb-0">
                    <tbody>
                        ${data.results.map((r) => `
                            <tr>
                                <td>${esc(formatTr(r.date))}</td>
                                <td>${esc(r.employee_full_name)}</td>
                                <td class="ts-code">${esc(r.code)}</td>
                                <td><span class="status-badge ${SHEET_STATUS_BADGE[r.status] || 'status-grey'}">${esc(r.status_display)}</span></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
    } catch (error) {
        box.innerHTML = `<span class="text-danger">${esc(error.message)}</span>`;
    }
}

// ---------------------------------------------------------------------------
// Review modal
// ---------------------------------------------------------------------------

async function openReview(id) {
    try {
        const detail = await fetchScan(id);
        state.review = {
            id,
            detail,
            draft: JSON.parse(JSON.stringify(detail.parsed || {})),
            sheetId: detail.sheet,
            dirty: false,
            zoom: 1,
            rotation: 0,
            sheetOptions: [],
        };
        if (!state.review.draft.rows) state.review.draft.rows = [];
        renderReview();
        state.modal.show();
        const dateValue = dateInputValue(state.review.draft.date);
        if (dateValue) await loadSheetOptions(dateValue);
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function stepReview(delta) {
    if (!state.review) return;
    const ids = state.scans.map((s) => s.id);
    const idx = ids.indexOf(state.review.id);
    const next = ids[idx + delta];
    if (next === undefined) {
        showNotification(delta > 0 ? 'Listenin sonu' : 'Listenin başı', 'info');
        return;
    }
    if (state.review.dirty && !window.confirm('Kaydedilmemiş değişiklikler var. Yine de geçilsin mi?')) return;
    openReview(next);
}

function zoomImage(how) {
    const r = state.review;
    if (!r) return;
    if (how === '+') r.zoom = Math.min(4, r.zoom + 0.25);
    else if (how === '-') r.zoom = Math.max(0.5, r.zoom - 0.25);
    else r.zoom = 1;
    applyImageTransform();
}

function rotateImage(deg) {
    const r = state.review;
    if (!r) return;
    r.rotation = (r.rotation + deg) % 360;
    applyImageTransform();
}

function applyImageTransform() {
    const img = $('sc-image');
    const r = state.review;
    img.style.transform = `scale(${r.zoom}) rotate(${r.rotation}deg)`;
    img.style.transformOrigin = r.rotation ? 'center center' : 'top left';
}

function kindFor(draft) {
    return draft.kind || 'weekday';
}

function renderReview() {
    const r = state.review;
    if (!r) return;
    const d = r.draft;
    const detail = r.detail;
    const ids = state.scans.map((s) => s.id);
    const idx = ids.indexOf(r.id);
    $('sc-review-title').textContent = `Tarama #${r.id} · yükleme #${detail.batch} sayfa ${detail.page_index}`;
    $('sc-position').textContent = idx >= 0 ? `${idx + 1} / ${ids.length}` : '';
    $('sc-image').src = detail.image_url || '';
    $('sc-image-link').href = detail.image_url || '#';
    applyImageTransform();

    const locked = detail.status === 'approved' || detail.status === 'discarded';
    $('sc-save').disabled = locked;
    $('sc-approve').disabled = locked;
    $('sc-discard').disabled = detail.status === 'approved' || detail.status === 'discarded';
    $('sc-reparse').disabled = detail.status === 'approved';

    const kind = kindFor(d);
    let total = 0;
    const rowsHtml = (d.rows || []).map((row) => {
        const hours = hoursFor(row.cells || [], kind);
        const rowTotal = Object.values(hours).reduce((a, b) => a + b, 0);
        total += rowTotal;
        let jobCell;
        if (row.kind === 'blank') {
            const statusBadge = {
                exact: '', printed: '',
                corrected: '<span class="status-badge status-blue">düzeltildi</span>',
                manual: '<span class="status-badge status-purple">elle</span>',
                ambiguous: '<span class="status-badge status-orange">belirsiz</span>',
                unknown: '<span class="status-badge status-red">bulunamadı</span>',
                empty: '',
            }[row.job_status] || '';
            const cands = (row.candidates || []).filter((c) => c !== row.job_no).slice(0, 4)
                .map((c) => `<button type="button" class="btn btn-outline-secondary" data-pick="${esc(c)}" data-key="${esc(row.key)}">${esc(c)}</button>`).join(' ');
            jobCell = `
                <input type="text" class="form-control form-control-sm" list="sc-job-datalist" data-job="${esc(row.key)}"
                       value="${esc(row.job_no || '')}" placeholder="İş emri no" ${locked ? 'disabled' : ''}>
                <small>${row.job_no_raw ? `okunan: <span class="ts-code">${esc(row.job_no_raw)}</span> ` : ''}${statusBadge}</small>
                ${cands ? `<div class="sc-candidates mt-1">${cands}</div>` : ''}`;
        } else if (row.kind === 'general') {
            jobCell = `<strong>GENEL (1000)</strong><small>${esc(row.title || '')}</small>`;
        } else {
            jobCell = `<strong>${esc(row.job_no)}</strong><small>${esc(row.title || '')}</small>`;
        }
        const cellsHtml = CELLS.map((cell, i) => {
            const on = !!(row.cells || [])[i];
            const classes = ['sc-cell', cell.hours < 1 ? 'half' : '', i >= REGULAR_CELLS ? 'ot' : '', on ? 'on' : ''].filter(Boolean).join(' ');
            const tdClass = [i === REGULAR_CELLS ? 'sc-ot-start' : '', i === LUNCH_AFTER ? 'sc-lunch-after' : ''].filter(Boolean).join(' ');
            return `<td class="${tdClass}"><button type="button" class="${classes}" data-cell="${i}" data-key="${esc(row.key)}" title="${cell.start}-${cell.end}" ${locked ? 'disabled' : ''}>${on ? 'X' : ''}</button></td>`;
        }).join('');
        return `
            <tr class="${row.kind === 'general' ? 'sc-general' : ''}">
                <td class="sc-job">${jobCell}</td>
                ${cellsHtml}
                <td class="sc-hours">${hoursText(hours)}</td>
            </tr>`;
    }).join('');

    const headerCells = CELLS.map((cell, i) => {
        const tdClass = [i === REGULAR_CELLS ? 'sc-ot-start' : '', i === LUNCH_AFTER ? 'sc-lunch-after' : ''].filter(Boolean).join(' ');
        return `<th class="sc-hour ${tdClass}">${cell.start.replace(':00', '').replace(':30', '½')}</th>`;
    }).join('');

    const flagsHtml = (d.flags || []).length
        ? d.flags.map((f) => `<div class="sc-flag level-${esc(f.level)}">${esc(f.text)}</div>`).join('')
        : '<div class="sc-flag level-ok text-success"><i class="fas fa-check me-1"></i>Uyarı yok.</div>';

    const bound = !!r.sheetId;
    const sheetBlock = `
        <div class="border rounded p-2 mb-2 ${bound ? '' : 'border-danger'}">
            <div class="d-flex flex-wrap gap-2 align-items-end">
                <div>
                    <label class="form-label mb-0 small">Form tarihi</label>
                    <input type="date" class="form-control form-control-sm" id="sc-sheet-date" value="${esc(dateInputValue(d.date))}" ${locked ? 'disabled' : ''}>
                </div>
                <div class="flex-grow-1">
                    <label class="form-label mb-0 small">Form / çalışan</label>
                    <select class="form-select form-select-sm" id="sc-sheet-select" ${locked ? 'disabled' : ''}>
                        <option value="">${bound ? esc(`${d.code} · ${d.employee_name}`) : 'Seçin...'}</option>
                    </select>
                </div>
            </div>
            ${bound ? '' : '<div class="small text-danger mt-1">Sayfa bir forma bağlanmadı. Tarihi seçip listeden formu seçin.</div>'}
        </div>`;

    $('sc-review-body').innerHTML = `
        <dl class="sc-meta">
            <dt>Form kodu</dt><dd class="ts-code">${esc(d.code || '-')}</dd>
            <dt>Çalışan</dt><dd>${esc(d.employee_name || '-')} ${d.team_name ? `<span class="text-muted">· ${esc(d.team_name)}</span>` : ''}</dd>
            <dt>Tarih</dt><dd>${esc(formatTr(d.date))} ${d.kind_label ? `<span class="text-muted">· ${esc(d.kind_label)}</span>` : ''}</dd>
            <dt>Durum</dt><dd>${badge(detail.status, detail.status_display)} ${detail.error ? `<span class="text-danger small">${esc(detail.error)}</span>` : ''}</dd>
            <dt>Okuma</dt><dd class="small text-muted">${esc(detail.model || '-')} · ${detail.cost_usd ? '$' + Number(detail.cost_usd).toFixed(3) : ''} · ${esc(formatDateTime(detail.parsed_at))}</dd>
        </dl>
        ${sheetBlock}
        <div class="form-check mb-2">
            <input type="checkbox" class="form-check-input" id="sc-blank-day" ${d.blank_day ? 'checked' : ''} ${locked ? 'disabled' : ''}>
            <label class="form-check-label" for="sc-blank-day">Bugün çalışmadım işaretli (izin / rapor)</label>
        </div>
        <div class="mb-2">${flagsHtml}</div>
        <div class="table-responsive">
            <table class="sc-rows">
                <thead>
                    <tr><th>İş emri</th>${headerCells}<th class="sc-hours">Saat</th></tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot>
                    <tr><td colspan="${CELLS.length + 1}" class="text-end text-muted small">N = normal, FM = fazla mesai, T = tatil · toplam</td><td class="sc-hours"><strong>${fmtHours(total)}</strong></td></tr>
                </tfoot>
            </table>
        </div>
        <div class="mt-2">
            <label class="form-label mb-0 small" for="sc-note">Not</label>
            <input type="text" class="form-control form-control-sm" id="sc-note" value="${esc(d.note || '')}" ${locked ? 'disabled' : ''}>
        </div>
        ${d.remarks ? `<div class="small text-muted mt-1">Model notu: ${esc(d.remarks)}</div>` : ''}`;

    if (r.sheetOptions.length) fillSheetSelect();
}

async function loadSheetOptions(dateValue) {
    const r = state.review;
    if (!r || !dateValue) return;
    try {
        const data = await fetchTimesheets({ date: dateValue, page_size: 300 });
        r.sheetOptions = data.results || data;
        fillSheetSelect();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function fillSheetSelect() {
    const r = state.review;
    const select = $('sc-sheet-select');
    if (!select || !r) return;
    const current = r.sheetId;
    select.innerHTML = '<option value="">Seçin...</option>' + r.sheetOptions.map((s) => `
        <option value="${s.id}" ${Number(current) === s.id ? 'selected' : ''}>${esc(s.code)} · ${esc(s.employee_full_name)}${s.team_name ? ' · ' + esc(s.team_name) : ''} (${esc(s.status_display)})</option>`).join('');
}

function markDirty() {
    if (state.review) state.review.dirty = true;
}

function onReviewClick(ev) {
    const r = state.review;
    if (!r) return;
    const cellBtn = ev.target.closest('[data-cell]');
    if (cellBtn && !cellBtn.disabled) {
        const row = r.draft.rows.find((x) => x.key === cellBtn.dataset.key);
        if (!row) return;
        row.cells = row.cells || CELLS.map(() => false);
        const i = Number(cellBtn.dataset.cell);
        row.cells[i] = !row.cells[i];
        markDirty();
        renderReview();
        return;
    }
    const pick = ev.target.closest('[data-pick]');
    if (pick) {
        const row = r.draft.rows.find((x) => x.key === pick.dataset.key);
        if (!row) return;
        row.job_no = pick.dataset.pick;
        row.job_status = 'manual';
        markDirty();
        renderReview();
    }
}

async function onReviewChange(ev) {
    const r = state.review;
    if (!r) return;
    if (ev.target.id === 'sc-blank-day') {
        r.draft.blank_day = ev.target.checked;
        markDirty();
    } else if (ev.target.id === 'sc-sheet-date') {
        await loadSheetOptions(ev.target.value);
    } else if (ev.target.id === 'sc-sheet-select') {
        r.sheetId = ev.target.value ? Number(ev.target.value) : null;
        markDirty();
    } else if (ev.target.dataset.job !== undefined) {
        const row = r.draft.rows.find((x) => x.key === ev.target.dataset.job);
        if (row) {
            row.job_no = ev.target.value.trim() || null;
            row.job_status = row.job_no ? 'manual' : 'empty';
            markDirty();
        }
    }
}

function onReviewInput(ev) {
    if (!state.review) return;
    if (ev.target.id === 'sc-note') {
        state.review.draft.note = ev.target.value;
        markDirty();
    }
}

function buildEdits() {
    const r = state.review;
    const d = r.draft;
    const edits = {
        blank_day: !!d.blank_day,
        note: d.note || '',
        rows: (d.rows || []).map((row) => {
            const item = { key: row.key, cells: (row.cells || []).map(Boolean) };
            if (row.kind === 'blank') item.job_no = row.job_no || '';
            return item;
        }),
    };
    if (r.sheetId !== r.detail.sheet) edits.sheet_id = r.sheetId;
    return edits;
}

async function saveReview({ silent = false } = {}) {
    const r = state.review;
    if (!r) return null;
    try {
        const detail = await updateScan(r.id, buildEdits());
        r.detail = detail;
        r.draft = JSON.parse(JSON.stringify(detail.parsed || {}));
        r.sheetId = detail.sheet;
        r.dirty = false;
        renderReview();
        if (!silent) showNotification('Kaydedildi', 'success');
        return detail;
    } catch (error) {
        showNotification(error.message, 'error');
        return null;
    }
}

async function onApproveCurrent() {
    const r = state.review;
    if (!r) return;
    const btn = $('sc-approve');
    btn.disabled = true;
    try {
        if (r.dirty) {
            const saved = await saveReview({ silent: true });
            if (!saved) return;
        }
        const res = await approveScan(r.id);
        showNotification(res.created_count ? `${res.created_count} zaman kaydı oluşturuldu` : 'Form boş gün olarak onaylandı', 'success');
        const ids = state.scans.map((s) => s.id);
        const idx = ids.indexOf(r.id);
        state.scans = state.scans.filter((s) => s.id !== r.id || $('sc-filter-status').value.includes('approved'));
        const next = ids[idx + 1];
        if (next !== undefined) await openReview(next);
        else state.modal.hide();
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function onDiscardCurrent() {
    const r = state.review;
    if (!r) return;
    if (!window.confirm('Bu tarama silinsin mi?')) return;
    try {
        await discardScan(r.id);
        showNotification('Tarama silindi', 'success');
        state.modal.hide();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function onReparseCurrent() {
    const r = state.review;
    if (!r) return;
    try {
        const res = await reparseScan(r.id);
        showNotification(res.scan && res.scan.status !== 'queued' ? 'Sayfa yeniden okundu' : 'Sayfa yeniden okunmak üzere sıraya alındı', 'info');
        await openReview(r.id);
    } catch (error) {
        showNotification(error.message, 'error');
    }
}
