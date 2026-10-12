import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { showNotification } from '../../../components/notification/notification.js';
import { getJobOrderDropdown } from '../../../apis/projects/jobOrders.js';
import {
    fetchDailyStatus, fetchSubmission, updateSubmission, approveSubmission, sendBackSubmission, approveCleanSubmissions,
} from '../../../apis/welding/timesheets.js';

// Puantaj Onayı: one row per rostered welder for the chosen day. Pending
// submissions open inline for correction and approval; approval writes the
// welding time entries. Cell layout mirrors welding/timesheet_layout.py.
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
const BUCKET_LABEL = { regular: 'N', after_hours: 'FM', holiday: 'T' };
const STATE_BADGE = {
    none: ['status-grey', 'Girilmedi'],
    pending: ['status-orange', 'Kontrol bekliyor'],
    approved: ['status-green', 'Onaylandı'],
    blank: ['status-grey', 'Çalışmadı'],
};
const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

const $ = (id) => document.getElementById(id);

const state = {
    date: null,
    data: null,            // daily-status payload
    open: {},              // submission id -> { detail, draft, dirty }
    jobOptions: [],
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

function fromIso(value) {
    const [y, m, d] = String(value || '').split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
}

function formatTime(value) {
    if (!value) return '';
    try {
        return new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function fmtHours(h) {
    const n = Number(h) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

function hoursText(hours) {
    const parts = Object.entries(hours || {}).filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => `${BUCKET_LABEL[k] || k} ${fmtHours(v)}`);
    return parts.length ? parts.join(' · ') : '–';
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

const short = (t) => (t.endsWith(':00') ? t.slice(0, 2) : t);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();
    new HeaderComponent({
        title: 'Puantaj Onayı',
        subtitle: 'Kaynakçıların telefondan gönderdiği günlük puantajları kontrol edin, düzeltin ve zaman kayıtlarına aktarın',
        icon: 'clipboard-check',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/manufacturing/welding/',
        onRefreshClick: () => loadDay(),
    });

    const params = new URLSearchParams(window.location.search);
    state.date = params.get('date') || toIso(new Date());
    $('ts-date').value = state.date;
    $('ts-date').addEventListener('change', () => { state.date = $('ts-date').value; loadDay(); });
    $('ts-prev').addEventListener('click', () => shiftDay(-1));
    $('ts-next').addEventListener('click', () => shiftDay(1));
    $('ts-today').addEventListener('click', () => { state.date = toIso(new Date()); $('ts-date').value = state.date; loadDay(); });
    $('ts-approve-clean').addEventListener('click', onApproveClean);
    $('ts-filter').addEventListener('input', renderList);
    $('ts-state-filter').addEventListener('change', renderList);
    $('ts-list').addEventListener('click', onListClick);
    $('ts-list').addEventListener('change', onListChange);
    $('ts-list').addEventListener('input', onListInput);

    loadJobOptions();
    await loadDay();
});

async function loadJobOptions() {
    try {
        state.jobOptions = await getJobOrderDropdown(true);
    } catch (error) {
        console.error('Job order options failed', error);
        state.jobOptions = [];
    }
    $('ts-job-datalist').innerHTML = state.jobOptions
        .map((j) => `<option value="${esc(j.job_no)}">${esc(j.title || '')}</option>`).join('');
}

function shiftDay(delta) {
    const d = fromIso(state.date) || new Date();
    d.setDate(d.getDate() + delta);
    state.date = toIso(d);
    $('ts-date').value = state.date;
    loadDay();
}

async function loadDay() {
    const d = fromIso(state.date);
    $('ts-day-label').textContent = d ? `${DAY_NAMES[d.getDay()]}` : '';
    state.open = {};
    try {
        state.data = await fetchDailyStatus(state.date);
        history.replaceState(null, '', `?date=${state.date}`);
        renderCounts();
        renderList();
    } catch (error) {
        console.error('Daily status failed', error);
        $('ts-list').innerHTML = `<div class="p-3"><div class="alert alert-danger mb-0">${esc(error.message)}</div></div>`;
    }
}

function renderCounts() {
    const c = (state.data && state.data.counts) || {};
    $('ts-counts').innerHTML = `
        <span class="status-badge status-orange">${c.pending || 0} kontrol bekliyor</span>
        <span class="status-badge status-green">${c.approved || 0} onaylandı</span>
        <span class="status-badge status-grey">${c.none || 0} girilmedi</span>
        ${c.blank ? `<span class="status-badge status-grey">${c.blank} çalışmadı</span>` : ''}`;
    const clean = (state.data.results || []).filter((r) => r.state === 'pending' && r.scan_status === 'clean').length;
    $('ts-approve-clean').disabled = clean === 0;
    $('ts-approve-clean').innerHTML = `<i class="fas fa-check-double me-1"></i>Uyarısız girişleri onayla${clean ? ` (${clean})` : ''}`;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function visibleRows() {
    const q = ($('ts-filter').value || '').trim().toLocaleLowerCase('tr-TR');
    const st = $('ts-state-filter').value;
    return (state.data.results || []).filter((r) => {
        if (st && r.state !== st) return false;
        if (!q) return true;
        const hay = `${r.full_name} ${(r.team_names || []).join(' ')}`.toLocaleLowerCase('tr-TR');
        return hay.includes(q);
    });
}

function jobsSummary(r) {
    if (r.blank_day) return '<span class="text-muted">Bugün çalışmadım</span>';
    if (!r.rows || !r.rows.length) return '';
    return `<div class="ts-jobs">${r.rows.map((row) => `
        <span class="ts-job"><strong>${esc(row.job_no === '1000' ? 'GENEL' : row.job_no)}</strong> ${esc(hoursText(row.hours))}</span>`).join('')}</div>`;
}

function flagsSummary(r) {
    const flags = r.flags || [];
    if (!flags.length) return r.state === 'pending' ? '<span class="text-success small"><i class="fas fa-check me-1"></i>Uyarı yok</span>' : '';
    return `<div class="ts-flags">${flags.slice(0, 2).map((f) => `<span class="ts-flag level-${esc(f.level)} d-inline-block me-1 mb-1 py-0">${esc(f.text)}</span>`).join('')}${flags.length > 2 ? `<span class="text-muted">+${flags.length - 2}</span>` : ''}</div>`;
}

function renderList() {
    const container = $('ts-list');
    if (!state.data) return;
    const rows = visibleRows();
    $('ts-count').textContent = `(${rows.length}/${(state.data.results || []).length})`;
    if (!rows.length) {
        container.innerHTML = '<div class="p-3 text-muted">Bu filtreyle eşleşen kaynakçı yok.</div>';
        return;
    }
    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm table-hover ts-table mb-0">
                <thead>
                    <tr>
                        <th>Kaynakçı</th><th>Durum</th><th>Gönderim</th><th class="text-end">Saat</th>
                        <th>İşler</th><th>Uyarılar</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((r) => {
                        const [cls, label] = STATE_BADGE[r.state] || ['status-grey', r.state];
                        const open = r.scan_id && state.open[r.scan_id];
                        const pending = r.state === 'pending';
                        const actions = [];
                        if (pending) {
                            actions.push(`<button type="button" class="btn btn-success" data-action="approve" data-id="${r.scan_id}" ${r.has_errors ? 'disabled title="Hata işaretli satırlar var"' : ''}><i class="fas fa-check"></i> Onayla</button>`);
                            actions.push(`<button type="button" class="btn btn-outline-primary" data-action="toggle" data-id="${r.scan_id}"><i class="fas fa-pen"></i> ${open ? 'Kapat' : 'Düzelt'}</button>`);
                            actions.push(`<button type="button" class="btn btn-outline-danger" data-action="send-back" data-id="${r.scan_id}" title="Kaynakçıya geri gönder"><i class="fas fa-rotate-left"></i></button>`);
                        } else if (r.scan_id) {
                            actions.push(`<button type="button" class="btn btn-outline-secondary" data-action="toggle" data-id="${r.scan_id}"><i class="fas fa-eye"></i> ${open ? 'Kapat' : 'Görüntüle'}</button>`);
                        }
                        const when = r.state === 'approved' && r.approved_at
                            ? `<span class="text-muted small">onay ${esc(formatTime(r.approved_at))}${r.approved_by ? ' · ' + esc(r.approved_by) : ''}</span>`
                            : (r.submitted_at ? esc(formatTime(r.submitted_at)) : '');
                        return `
                        <tr class="ts-row-${esc(r.state)}" data-row="${r.scan_id || ''}">
                            <td>${esc(r.full_name)}<br><span class="text-muted small">${esc((r.team_names || [])[0] || '')}</span></td>
                            <td><span class="status-badge ${cls}">${esc(label)}</span></td>
                            <td>${when}</td>
                            <td class="text-end">${r.blank_day ? '' : (r.total_hours ? esc(fmtHours(r.total_hours)) : '')}</td>
                            <td>${jobsSummary(r)}${r.note ? `<div class="text-muted small"><i class="fas fa-comment me-1"></i>${esc(r.note)}</div>` : ''}</td>
                            <td>${flagsSummary(r)}</td>
                            <td class="text-end text-nowrap"><div class="btn-group btn-group-sm">${actions.join('')}</div></td>
                        </tr>
                        ${open ? `<tr class="ts-editor-row" data-editor="${r.scan_id}"><td colspan="7" class="p-0">${renderEditor(r.scan_id)}</td></tr>` : ''}`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

// ---------------------------------------------------------------------------
// Inline editor
// ---------------------------------------------------------------------------

async function toggleEditor(id) {
    if (state.open[id]) {
        if (state.open[id].dirty && !window.confirm('Kaydedilmemiş değişiklikler var. Kapatılsın mı?')) return;
        delete state.open[id];
        renderList();
        return;
    }
    try {
        const detail = await fetchSubmission(id);
        state.open[id] = { detail, draft: JSON.parse(JSON.stringify(detail.parsed || {})), dirty: false };
        renderList();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function renderEditor(id) {
    const r = state.open[id];
    const d = r.draft;
    const locked = r.detail.status === 'approved' || r.detail.status === 'discarded';
    const kind = d.kind || 'weekday';
    let total = 0;

    const headerCells = CELLS.map((cell, i) => {
        const cls = [i === REGULAR_CELLS ? 'ts-ot-start' : '', i === LUNCH_AFTER ? 'ts-lunch-after' : ''].filter(Boolean).join(' ');
        return `<th class="ts-hour ${cls}">${short(cell.start)}–${short(cell.end)}</th>`;
    }).join('');

    const rowsHtml = (d.rows || []).map((row) => {
        const hours = hoursFor(row.cells || [], kind);
        const rowTotal = Object.values(hours).reduce((a, b) => a + b, 0);
        total += rowTotal;
        const empty = row.kind === 'blank' && !row.job_no && !(row.cells || []).some(Boolean);
        if (empty && locked) return '';
        let jobCell;
        if (row.kind === 'blank') {
            jobCell = `
                <input type="text" class="form-control form-control-sm" list="ts-job-datalist" data-job="${esc(row.key)}" data-sub="${id}"
                       value="${esc(row.job_no || '')}" placeholder="İş emri no" ${locked ? 'disabled' : ''}>
                <small>${esc(row.title || '')}${row.job_status === 'unknown' ? ' <span class="status-badge status-red">bulunamadı</span>' : ''}${row.job_status === 'corrected' ? ' <span class="status-badge status-blue">düzeltildi</span>' : ''}</small>`;
        } else if (row.kind === 'general') {
            jobCell = `<strong>GENEL (1000)</strong><small>${esc(row.title || '')}</small>`;
        } else {
            jobCell = `<strong>${esc(row.job_no)}</strong><small>${esc(row.title || '')}</small>`;
        }
        const cellsHtml = CELLS.map((cell, i) => {
            const on = !!(row.cells || [])[i];
            const classes = ['ts-cell', cell.hours < 1 ? 'half' : '', i >= REGULAR_CELLS ? 'ot' : '', on ? 'on' : ''].filter(Boolean).join(' ');
            const tdClass = [i === REGULAR_CELLS ? 'ts-ot-start' : '', i === LUNCH_AFTER ? 'ts-lunch-after' : ''].filter(Boolean).join(' ');
            return `<td class="${tdClass}"><button type="button" class="${classes}" data-cell="${i}" data-key="${esc(row.key)}" data-sub="${id}" title="${cell.start}–${cell.end}" ${locked ? 'disabled' : ''}>${on ? 'X' : ''}</button></td>`;
        }).join('');
        return `
            <tr class="${row.kind === 'general' ? 'ts-general' : ''} ${empty ? 'ts-empty-row' : ''}">
                <td class="ts-job-cell">${jobCell}</td>
                ${cellsHtml}
                <td class="ts-hours">${esc(hoursText(hours))}</td>
            </tr>`;
    }).join('');

    const flagsHtml = (d.flags || []).length
        ? d.flags.map((f) => `<div class="ts-flag level-${esc(f.level)}">${esc(f.text)}</div>`).join('')
        : '';

    return `
        <div class="ts-editor">
            <div class="d-flex flex-wrap align-items-center gap-3 mb-2">
                <span class="ts-code">${esc(d.code || '')}</span>
                <span class="text-muted small">${esc(d.kind_label || '')}</span>
                <div class="form-check mb-0">
                    <input type="checkbox" class="form-check-input" id="ts-blank-${id}" data-blank="${id}" ${d.blank_day ? 'checked' : ''} ${locked ? 'disabled' : ''}>
                    <label class="form-check-label" for="ts-blank-${id}">Bugün çalışmadım (izin / rapor)</label>
                </div>
                <div class="ms-auto d-flex gap-2">
                    ${locked ? '' : `
                        <button type="button" class="btn btn-outline-primary btn-sm" data-action="save" data-id="${id}" ${r.dirty ? '' : 'disabled'}><i class="fas fa-save me-1"></i>Kaydet</button>
                        <button type="button" class="btn btn-success btn-sm" data-action="approve" data-id="${id}"><i class="fas fa-check me-1"></i>${r.dirty ? 'Kaydet ve onayla' : 'Onayla'}</button>`}
                </div>
            </div>
            ${flagsHtml ? `<div class="mb-2">${flagsHtml}</div>` : ''}
            <div class="table-responsive">
                <table class="ts-rows">
                    <thead><tr><th>İş emri</th>${headerCells}<th class="ts-hours">Saat</th></tr></thead>
                    <tbody>${rowsHtml}</tbody>
                    <tfoot><tr><td colspan="${CELLS.length + 1}" class="text-end text-muted small">N = normal, FM = fazla mesai, T = tatil · toplam</td><td class="ts-hours"><strong>${fmtHours(total)}</strong></td></tr></tfoot>
                </table>
            </div>
            <div class="mt-2 d-flex gap-2 align-items-center">
                <label class="small text-muted mb-0" for="ts-note-${id}">Not</label>
                <input type="text" class="form-control form-control-sm" id="ts-note-${id}" data-note="${id}" value="${esc(d.note || '')}" ${locked ? 'disabled' : ''} style="max-width: 480px;">
            </div>
        </div>`;
}

function markDirty(id) {
    if (state.open[id]) state.open[id].dirty = true;
}

function buildEdits(id) {
    const d = state.open[id].draft;
    return {
        blank_day: !!d.blank_day,
        note: d.note || '',
        rows: (d.rows || []).map((row) => {
            const item = { key: row.key, cells: (row.cells || []).map(Boolean) };
            if (row.kind === 'blank') item.job_no = row.job_no || '';
            return item;
        }),
    };
}

async function saveEditor(id, { silent = false } = {}) {
    const r = state.open[id];
    if (!r) return null;
    try {
        const detail = await updateSubmission(id, buildEdits(id));
        r.detail = detail;
        r.draft = JSON.parse(JSON.stringify(detail.parsed || {}));
        r.dirty = false;
        await refreshRow(id, { keepOpen: true });
        if (!silent) showNotification('Kaydedildi', 'success');
        return detail;
    } catch (error) {
        showNotification(error.message, 'error');
        return null;
    }
}

async function refreshRow(id, { keepOpen = false } = {}) {
    const open = keepOpen ? state.open[id] : null;
    try {
        state.data = await fetchDailyStatus(state.date);
    } catch (error) {
        showNotification(error.message, 'error');
        return;
    }
    state.open = open ? { [id]: open } : {};
    renderCounts();
    renderList();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

async function onListClick(ev) {
    const cellBtn = ev.target.closest('[data-cell]');
    if (cellBtn && !cellBtn.disabled) {
        const r = state.open[cellBtn.dataset.sub];
        const row = r && r.draft.rows.find((x) => x.key === cellBtn.dataset.key);
        if (!row) return;
        row.cells = row.cells || CELLS.map(() => false);
        const i = Number(cellBtn.dataset.cell);
        row.cells[i] = !row.cells[i];
        markDirty(cellBtn.dataset.sub);
        renderList();
        return;
    }
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;
    if (action === 'toggle') {
        toggleEditor(id);
        return;
    }
    if (action === 'save') {
        await saveEditor(id);
        return;
    }
    btn.disabled = true;
    try {
        if (action === 'approve') {
            if (state.open[id] && state.open[id].dirty) {
                const saved = await saveEditor(id, { silent: true });
                if (!saved) return;
            }
            const res = await approveSubmission(id);
            showNotification(res.created_count ? `${res.created_count} zaman kaydı oluşturuldu` : 'Boş gün olarak onaylandı', 'success');
            delete state.open[id];
            await refreshRow(id);
        } else if (action === 'send-back') {
            const reason = window.prompt('Kaynakçıya iletilecek açıklama (telefonunda görünür):', '');
            if (reason === null) { btn.disabled = false; return; }
            await sendBackSubmission(id, reason);
            showNotification('Giriş kaynakçıya geri gönderildi', 'success');
            delete state.open[id];
            await refreshRow(id);
        }
    } catch (error) {
        showNotification(error.message, 'error');
        btn.disabled = false;
    }
}

function onListChange(ev) {
    if (ev.target.dataset.blank !== undefined) {
        const r = state.open[ev.target.dataset.blank];
        if (!r) return;
        r.draft.blank_day = ev.target.checked;
        markDirty(ev.target.dataset.blank);
        renderList();
    } else if (ev.target.dataset.job !== undefined) {
        const r = state.open[ev.target.dataset.sub];
        const row = r && r.draft.rows.find((x) => x.key === ev.target.dataset.job);
        if (!row) return;
        row.job_no = ev.target.value.trim() || null;
        row.job_status = row.job_no ? 'manual' : 'empty';
        const option = state.jobOptions.find((j) => j.job_no === row.job_no);
        row.title = option ? option.title : '';
        markDirty(ev.target.dataset.sub);
        renderList();
    }
}

function onListInput(ev) {
    if (ev.target.dataset.note !== undefined) {
        const r = state.open[ev.target.dataset.note];
        if (!r) return;
        r.draft.note = ev.target.value;
        if (!r.dirty) {
            markDirty(ev.target.dataset.note);
            const save = document.querySelector(`[data-action="save"][data-id="${ev.target.dataset.note}"]`);
            if (save) save.disabled = false;
        }
    }
}

async function onApproveClean() {
    const clean = (state.data.results || []).filter((r) => r.state === 'pending' && r.scan_status === 'clean');
    if (!clean.length) return;
    if (!window.confirm(`${clean.length} uyarısız giriş onaylanacak ve zaman kayıtları oluşturulacak. Devam edilsin mi?`)) return;
    const btn = $('ts-approve-clean');
    btn.disabled = true;
    try {
        const res = await approveCleanSubmissions({ date: state.date, submission_ids: clean.map((r) => r.scan_id) });
        const failed = (res.failed || []).length;
        showNotification(`${res.approved.length} giriş onaylandı${failed ? `, ${failed} giriş onaylanamadı` : ''}`, failed ? 'warning' : 'success');
        await loadDay();
    } catch (error) {
        showNotification(error.message, 'error');
        btn.disabled = false;
    }
}
