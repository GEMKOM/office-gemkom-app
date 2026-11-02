import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ModernDropdown } from '../../../components/dropdown/dropdown.js';
import { showNotification } from '../../../components/notification/notification.js';
import { getJobOrderDropdown } from '../../../apis/projects/jobOrders.js';
import {
    fetchDailyStatus, fetchSubmission, updateSubmission, approveSubmission, sendBackSubmission, approveCleanSubmissions,
} from '../../../apis/welding/timesheets.js';
import { buildSubmissionEdits, padCells } from './editPayload.js';

// Puantaj Onayı: one row per rostered welder for the chosen day; the editor
// shows the day exactly as the welder sees it on the phone (job cards with
// hour cells). Cell layout mirrors welding/timesheet_layout.py.
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
const NOON_CELL = 5;
const GENERAL = '1000';
const BUCKET_WORD = { regular: 'normal', after_hours: 'fazla mesai', holiday: 'tatil' };
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
    jobOptions: [],        // [{value: job_no, text, title}]
    modal: null,
    edit: null,            // the open editor
    dropdown: null,
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

function formatTr(iso) {
    const d = fromIso(iso);
    return d ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${DAY_NAMES[d.getDay()]}` : '';
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

function hoursWords(hours) {
    const parts = Object.entries(hours || {}).filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => `${BUCKET_WORD[k] || k} ${fmtHours(v)} sa`);
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

function sumHours(hours) {
    return Object.values(hours || {}).reduce((a, b) => a + Number(b), 0);
}

/** "07:30–12:00, 12:30–15:00" from the marked cells (the lunch gap splits a run). */
function rangesText(cells) {
    const runs = [];
    let start = null;
    CELLS.forEach((cell, idx) => {
        const on = !!(cells || [])[idx];
        const continues = on && start !== null && CELLS[idx - 1] && CELLS[idx - 1].end === cell.start && (cells || [])[idx - 1];
        if (on && !continues) {
            if (start !== null) runs.push([start, idx - 1]);
            start = idx;
        } else if (!on && start !== null) {
            runs.push([start, idx - 1]);
            start = null;
        }
    });
    if (start !== null) runs.push([start, CELLS.length - 1]);
    return runs.map(([a, b]) => `${CELLS[a].start}–${CELLS[b].end}`).join(', ');
}

const short = (t) => (t.endsWith(':00') ? t.slice(0, 2) : t);
const jobLabel = (jobNo) => (jobNo === GENERAL ? 'GENEL' : jobNo);
const jobTitle = (jobNo, title) => (jobNo === GENERAL ? 'İş emri dışı genel işler' : (title || ''));

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

    // The modal markup is rebuilt by DisplayModal on every open; the
    // container persists, so listen there.
    const modalContainer = $('ts-edit-modal-container');
    modalContainer.addEventListener('click', (ev) => {
        if (ev.target.closest('#ts-edit-save')) { saveEdit(); return; }
        if (ev.target.closest('#ts-edit-approve')) { onEditApprove(); return; }
        if (ev.target.closest('#ts-edit-send-back')) { onEditSendBack(); return; }
        if (ev.target.closest('#ts-edit-body')) onEditClick(ev);
    });
    modalContainer.addEventListener('input', onEditInput);

    loadJobOptions();
    await loadDay();
});

async function loadJobOptions() {
    try {
        const rows = await getJobOrderDropdown(false, { weldingOnly: true });
        state.jobOptions = rows.map((j) => ({
            value: j.job_no,
            title: j.title || '',
            text: j.job_no === GENERAL ? 'GENEL (1000) — İş emri dışı genel işler' : `${j.job_no} — ${j.title || ''}`,
        }));
    } catch (error) {
        console.error('Job order options failed', error);
        state.jobOptions = [];
    }
    if (state.edit) renderAddSection();
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
    $('ts-day-label').textContent = d ? DAY_NAMES[d.getDay()] : '';
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
    if (r.blank_day) return '<span class="text-muted"><i class="fas fa-bed me-1"></i>Bugün çalışmadım (izin / rapor)</span>';
    if (!r.rows || !r.rows.length) return '';
    return `
        <table class="ts-jobs">
            <tbody>
                ${r.rows.map((row) => `
                    <tr>
                        <td class="ts-job-no">${esc(jobLabel(row.job_no))}</td>
                        <td class="ts-job-title" title="${esc(jobTitle(row.job_no, row.title))}">${esc(jobTitle(row.job_no, row.title))}</td>
                        <td class="ts-job-ranges">${esc(rangesText(row.cells))}</td>
                        <td class="ts-job-hours">${esc(hoursWords(row.hours))}</td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
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
                        <th>Kaynakçı</th><th>Durum</th><th>Gönderim</th><th class="text-end">Toplam</th>
                        <th>İşler ve saatler</th><th>Uyarılar</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((r) => {
                        const [cls, label] = STATE_BADGE[r.state] || ['status-grey', r.state];
                        const pending = r.state === 'pending';
                        const actions = [];
                        if (pending) {
                            actions.push(`<button type="button" class="btn btn-success" data-action="approve" data-id="${r.scan_id}" ${r.has_errors ? 'disabled title="Hata işaretli satırlar var"' : ''}><i class="fas fa-check"></i> Onayla</button>`);
                            actions.push(`<button type="button" class="btn btn-outline-primary" data-action="edit" data-id="${r.scan_id}"><i class="fas fa-pen"></i> Düzelt</button>`);
                        } else if (r.scan_id) {
                            actions.push(`<button type="button" class="btn btn-outline-secondary" data-action="edit" data-id="${r.scan_id}"><i class="fas fa-eye"></i> Görüntüle</button>`);
                        }
                        const when = r.state === 'approved' && r.approved_at
                            ? `<span class="text-muted small">onay ${esc(formatTime(r.approved_at))}${r.approved_by ? ' · ' + esc(r.approved_by) : ''}</span>`
                            : (r.submitted_at ? esc(formatTime(r.submitted_at)) : '');
                        return `
                        <tr class="ts-row-${esc(r.state)}">
                            <td>${esc(r.full_name)}<br><span class="text-muted small">${esc((r.team_names || [])[0] || '')}</span></td>
                            <td><span class="status-badge ${cls}">${esc(label)}</span></td>
                            <td>${when}</td>
                            <td class="text-end">${r.blank_day || !r.total_hours ? '' : `<strong>${esc(fmtHours(r.total_hours))} sa</strong>`}</td>
                            <td>${jobsSummary(r)}${r.note ? `<div class="text-muted small"><i class="fas fa-comment me-1"></i>${esc(r.note)}</div>` : ''}</td>
                            <td>${flagsSummary(r)}</td>
                            <td class="text-end text-nowrap"><div class="btn-group btn-group-sm">${actions.join('')}</div></td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

async function onListClick(ev) {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === 'edit') {
        openEditor(id);
        return;
    }
    if (btn.dataset.action === 'approve') {
        btn.disabled = true;
        try {
            const res = await approveSubmission(id);
            showNotification(res.created_count ? `${res.created_count} zaman kaydı oluşturuldu` : 'Boş gün olarak onaylandı', 'success');
            await loadDay();
        } catch (error) {
            showNotification(error.message, 'error');
            btn.disabled = false;
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

// ---------------------------------------------------------------------------
// Editor (the day as on the phone)
// ---------------------------------------------------------------------------

function rowsFromParsed(parsed) {
    return (parsed.rows || []).map((r) => ({
        key: r.key,
        kind: r.kind,
        job_no: r.job_no,
        title: r.title || '',
        cells: padCells(r.cells, CELLS.length),
    }));
}

function hydrateEdit(edit, detail) {
    const parsed = detail.parsed || {};
    const rows = rowsFromParsed(parsed);
    edit.status = detail.status;
    edit.locked = detail.status === 'approved' || detail.status === 'discarded';
    edit.kind = parsed.kind || edit.kind || 'weekday';
    edit.kindLabel = parsed.kind_label || edit.kindLabel || '';
    edit.code = parsed.code || detail.sheet_code || edit.code;
    edit.sourceRows = rows.map((r) => ({ key: r.key, kind: r.kind, job_no: r.job_no, cells: r.cells.slice() }));
    edit.offered = rows.filter((r) => r.kind === 'preprinted').map((r) => ({ job_no: r.job_no, title: r.title }));
    edit.jobs = rows.filter((r) => r.cells.some(Boolean) && r.job_no)
        .map((r) => ({ key: r.key, kind: r.kind, job_no: r.job_no, title: r.title, cells: r.cells.slice() }));
    edit.blankDay = !!parsed.blank_day;
    edit.note = parsed.note || '';
    edit.flags = (parsed.flags || []).filter((f) => f.level !== 'info');
    edit.dirty = false;
}

async function openEditor(id) {
    try {
        const detail = await fetchSubmission(id);
        const parsed = detail.parsed || {};
        const edit = {
            id,
            name: detail.employee_name,
            date: parsed.date || detail.date,
        };
        hydrateEdit(edit, detail);
        state.edit = edit;
        buildModal();
        renderEditor();
        state.modal.show();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function buildModal() {
    const e = state.edit;
    const modal = new DisplayModal('ts-edit-modal-container', {
        title: `${e.name} · ${formatTr(e.date)}`,
        icon: 'fas fa-clipboard-check',
        size: 'lg',
        backdropStatic: true,          // the job dropdown's menu sits outside the dialog
        showEditButton: false,
    });
    modal.addCustomSection({
        id: 'ts-edit-section',
        title: 'Günün puantajı',
        icon: 'fas fa-fire',
        iconColor: 'text-danger',
        customContent: '<div class="small text-muted mb-2" id="ts-edit-subtitle"></div><div id="ts-edit-body"></div>',
    });
    modal.render();
    modal.setFooterContent(`
        <div class="d-flex w-100 align-items-center gap-3 flex-wrap">
            <div>
                <div class="small text-muted">Toplam</div>
                <div class="fw-bold fs-5" id="ts-edit-total">0 saat</div>
            </div>
            <button type="button" class="btn btn-outline-danger btn-sm" id="ts-edit-send-back"><i class="fas fa-rotate-left me-1"></i>Kaynakçıya geri gönder</button>
            <div class="ms-auto d-flex gap-2">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal"><i class="fas fa-times me-1"></i>Kapat</button>
                <button type="button" class="btn btn-sm btn-outline-primary" id="ts-edit-save"><i class="fas fa-save me-1"></i>Kaydet</button>
                <button type="button" class="btn btn-sm btn-success" id="ts-edit-approve"><i class="fas fa-check me-1"></i>Kaydet ve onayla</button>
            </div>
        </div>`);
    modal.onCloseCallback(() => { state.edit = null; state.dropdown = null; loadDay(); });
    const dialog = modal.modal.querySelector('.modal-dialog');
    if (dialog) dialog.classList.add('modal-dialog-scrollable');
    // No focus trap: the dropdown's search box lives in a portal outside the dialog.
    bootstrap.Modal.getOrCreateInstance(modal.modal, { backdrop: 'static', focus: false });
    state.modal = modal;
}

function cellOwner(idx, exceptJob) {
    const row = state.edit.jobs.find((j) => j.job_no !== exceptJob && j.cells[idx]);
    return row ? row.job_no : null;
}

function renderEditor() {
    const e = state.edit;
    if (!e || !$('ts-edit-body')) return;
    $('ts-edit-subtitle').textContent = [e.kindLabel, e.code].filter(Boolean).join(' · ');

    const flags = e.flags.length ? `<div class="mb-2">${e.flags.map((f) => `<div class="ts-flag level-${esc(f.level)}">${esc(f.text)}</div>`).join('')}</div>` : '';
    const jobs = e.jobs.map((job) => renderJobCard(job)).join('');

    $('ts-edit-body').innerHTML = `
        <div class="${e.locked ? 'ts-edit-locked' : ''}">
            ${flags}
            <button type="button" class="ts-toggle ${e.blankDay ? 'on' : ''}" data-toggle-blank>
                <span class="ts-check">${e.blankDay ? '<i class="fas fa-check"></i>' : ''}</span>
                <span>Bugün çalışmadım <small class="text-muted">(izin / rapor / görevli değil)</small></span>
            </button>
            ${e.blankDay ? '' : `
                ${e.jobs.length ? '<div class="ts-section-title">Günün işleri</div>' : ''}
                ${jobs}
                <div class="ts-section-title">${e.jobs.length ? 'İş ekle' : 'Hangi işte çalıştı?'}</div>
                <div id="ts-edit-add"></div>
            `}
            <div class="ts-section-title">Not <small class="text-muted">(isteğe bağlı)</small></div>
            <input type="text" class="form-control" id="ts-edit-note" maxlength="200" value="${esc(e.note)}" ${e.locked ? 'disabled' : ''}>
        </div>`;
    if (!e.blankDay) renderAddSection();

    const total = e.blankDay ? 0 : e.jobs.reduce((sum, j) => sum + sumHours(hoursFor(j.cells, e.kind)), 0);
    $('ts-edit-total').textContent = e.blankDay ? 'Çalışılmadı' : `${fmtHours(total)} saat`;
    const canSend = e.blankDay || total > 0;
    $('ts-edit-save').hidden = e.locked;
    $('ts-edit-approve').hidden = e.locked;
    $('ts-edit-send-back').hidden = e.locked;
    $('ts-edit-save').disabled = !e.dirty || !canSend;
    $('ts-edit-approve').disabled = !canSend;
    $('ts-edit-approve').innerHTML = `<i class="fas fa-check me-1"></i>${e.dirty ? 'Kaydet ve onayla' : 'Onayla'}`;
}

function renderJobCard(job) {
    const e = state.edit;
    const grid = CELLS.map((cell, idx) => {
        const on = job.cells[idx];
        const owner = on ? null : cellOwner(idx, job.job_no);
        const classes = ['ts-cell', idx >= REGULAR_CELLS ? 'ot' : '', cell.hours < 1 ? 'half' : '', on ? 'on' : '', owner ? 'used' : ''].filter(Boolean).join(' ');
        const sub = owner ? jobLabel(owner) : (cell.hours < 1 ? '½ saat' : (idx >= REGULAR_CELLS ? 'mesai' : ''));
        return `<button type="button" class="${classes}" data-job="${esc(job.job_no)}" data-cell="${idx}" title="${cell.start}–${cell.end}${owner ? ' · ' + esc(jobLabel(owner)) + ' işinde' : ''}">${short(cell.start)}–${short(cell.end)}<small>${esc(sub)}</small></button>`;
    }).join('');
    return `
        <div class="ts-edit-job" data-row="${esc(job.job_no)}">
            <div class="ts-edit-head">
                <div class="ts-edit-no">${esc(jobLabel(job.job_no))}</div>
                <div class="ts-edit-title" title="${esc(jobTitle(job.job_no, job.title))}">${esc(jobTitle(job.job_no, job.title))}</div>
                <button type="button" class="ts-edit-remove" data-remove="${esc(job.job_no)}" aria-label="Kaldır"><i class="fas fa-xmark"></i></button>
            </div>
            <div class="ts-quick">
                <button type="button" data-quick="day" data-job="${esc(job.job_no)}">Gündüz 07:30–17:00</button>
                <button type="button" data-quick="evening" data-job="${esc(job.job_no)}">Akşam 17–21</button>
                <button type="button" class="clear" data-quick="clear" data-job="${esc(job.job_no)}" title="Temizle"><i class="fas fa-eraser"></i></button>
            </div>
            <div class="ts-grid">${grid}</div>
            <div class="ts-edit-hours">${esc(rangesText(job.cells) || '–')} <span class="text-muted">·</span> ${esc(hoursWords(hoursFor(job.cells, e.kind)))}</div>
        </div>`;
}

function renderAddSection() {
    const e = state.edit;
    const box = $('ts-edit-add');
    if (!e || !box) return;
    const added = new Set(e.jobs.map((j) => j.job_no));
    const offered = [...e.offered, { job_no: GENERAL, title: '' }].filter((j) => !added.has(j.job_no));
    box.innerHTML = `
        ${offered.length ? `<div class="ts-add-list">${offered.map((j) => `
            <button type="button" class="ts-add" data-add="${esc(j.job_no)}" data-title="${esc(j.title || '')}">
                <span class="ts-add-no">${esc(jobLabel(j.job_no))}</span>
                <span class="ts-add-title">${esc(jobTitle(j.job_no, j.title))}</span>
                <i class="fas fa-plus"></i>
            </button>`).join('')}</div>` : ''}
        <div id="ts-edit-dropdown"></div>`;
    if (e.locked) return;
    const container = $('ts-edit-dropdown');
    state.dropdown = new ModernDropdown(container, {
        placeholder: 'Listede yoksa iş emri ara ve ekle...',
        searchable: true,
        maxHeight: 260,
        width: '100%',
    });
    state.dropdown.setItems(state.jobOptions.filter((o) => !added.has(o.value)).map((o) => ({ value: o.value, text: o.text })));
    container.addEventListener('dropdown:select', (ev) => {
        const value = ev.detail && ev.detail.value;
        if (!value) return;
        const option = state.jobOptions.find((o) => o.value === value);
        addJob(value, option ? option.title : '');
    });
}

function addJob(jobNo, title) {
    const e = state.edit;
    if (!e || e.jobs.some((j) => j.job_no === jobNo)) return;
    e.jobs.push({ job_no: jobNo, title, cells: padCells([], CELLS.length) });
    e.dirty = true;
    renderEditor();
    const card = document.querySelector(`#ts-edit-body .ts-edit-job[data-row="${CSS.escape(jobNo)}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function onEditClick(ev) {
    const e = state.edit;
    if (!e || e.locked) return;
    if (ev.target.closest('[data-toggle-blank]')) {
        e.blankDay = !e.blankDay;
        e.dirty = true;
        renderEditor();
        return;
    }
    const add = ev.target.closest('[data-add]');
    if (add) {
        addJob(add.dataset.add, add.dataset.title || '');
        return;
    }
    const remove = ev.target.closest('[data-remove]');
    if (remove) {
        e.jobs = e.jobs.filter((j) => j.job_no !== remove.dataset.remove);
        e.dirty = true;
        renderEditor();
        return;
    }
    const quick = ev.target.closest('[data-quick]');
    if (quick) {
        const job = e.jobs.find((j) => j.job_no === quick.dataset.job);
        if (!job) return;
        if (quick.dataset.quick === 'clear') {
            job.cells = job.cells.map(() => false);
        } else {
            const range = quick.dataset.quick === 'day' ? [0, REGULAR_CELLS] : [REGULAR_CELLS, CELLS.length];
            for (let i = range[0]; i < range[1]; i += 1) {
                if (!cellOwner(i, job.job_no)) job.cells[i] = true;
            }
        }
        e.dirty = true;
        renderEditor();
        return;
    }
    const cell = ev.target.closest('[data-cell]');
    if (cell) {
        const job = e.jobs.find((j) => j.job_no === cell.dataset.job);
        if (!job) return;
        const idx = Number(cell.dataset.cell);
        if (job.cells[idx]) {
            job.cells[idx] = false;
        } else {
            const owner = cellOwner(idx, job.job_no);
            if (owner) {
                const other = e.jobs.find((j) => j.job_no === owner);
                if (other) other.cells[idx] = false;          // the hour moves to this job
            }
            job.cells[idx] = true;
        }
        e.dirty = true;
        renderEditor();
    }
}

function onEditInput(ev) {
    if (!state.edit || ev.target.id !== 'ts-edit-note') return;
    state.edit.note = ev.target.value;
    if (!state.edit.dirty) {
        state.edit.dirty = true;
        $('ts-edit-save').disabled = false;
        $('ts-edit-approve').innerHTML = '<i class="fas fa-check me-1"></i>Kaydet ve onayla';
    }
}

function editPayload() {
    const e = state.edit;
    return buildSubmissionEdits({
        blankDay: e.blankDay,
        note: e.note,
        jobs: e.jobs,
        sourceRows: e.sourceRows,
        cellCount: CELLS.length,
    });
}

async function saveEdit({ silent = false } = {}) {
    const e = state.edit;
    if (!e) return null;
    const payload = editPayload();
    if (!payload.blank_day && !(payload.rows || []).some((row) => (row.cells || []).some(Boolean))) {
        showNotification('Saat işaretleyin veya günü boş işaretleyin', 'error');
        return null;
    }
    try {
        const detail = await updateSubmission(e.id, payload);
        hydrateEdit(e, detail);
        renderEditor();
        if (!silent) showNotification('Kaydedildi', 'success');
        return detail;
    } catch (error) {
        showNotification(error.message, 'error');
        return null;
    }
}

async function onEditApprove() {
    const e = state.edit;
    if (!e) return;
    const btn = $('ts-edit-approve');
    btn.disabled = true;
    try {
        if (e.dirty) {
            const saved = await saveEdit({ silent: true });
            if (!saved) return;
        }
        const res = await approveSubmission(e.id);
        showNotification(res.created_count ? `${res.created_count} zaman kaydı oluşturuldu` : 'Boş gün olarak onaylandı', 'success');
        state.modal.hide();
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

async function onEditSendBack() {
    const e = state.edit;
    if (!e) return;
    const reason = window.prompt('Kaynakçıya iletilecek açıklama (telefonunda görünür):', '');
    if (reason === null) return;
    try {
        await sendBackSubmission(e.id, reason);
        showNotification('Giriş kaynakçıya geri gönderildi', 'success');
        state.modal.hide();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}
