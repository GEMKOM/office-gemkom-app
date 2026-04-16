import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { showNotification } from '../../../components/notification/notification.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { ModernDropdown } from '../../../components/dropdown/dropdown.js';
import { searchItemsBySearch, getItem } from '../../../apis/procurement.js';
import { listJobOrders } from '../../../apis/projects/jobOrders.js';
import {
    listLinearCuttingSessions,
    getLinearCuttingSession,
    createLinearCuttingSession,
    patchLinearCuttingSession,
    optimizeLinearCuttingSession,
    confirmLinearCuttingSession,
    getLinearCuttingSessionPdfUrl,
    downloadLinearCuttingSessionPdf
} from '../../../apis/linear_cutting/sessions.js';
import {
    listLinearCuttingParts,
    createLinearCuttingPart,
    createLinearCuttingPartsBulk,
    patchLinearCuttingPart,
    deleteLinearCuttingPart
} from '../../../apis/linear_cutting/parts.js';
import { getLinearCuttingTask } from '../../../apis/linear_cutting/tasks.js';

// ─────────────────────────── STATE ────────────────────────────
let currentSessionKey = null;
let currentSession    = null;
let currentParts      = [];
let partsTable        = null;
let partsTableRows    = [];
let inlineEditRowId   = null;
let confirmModal      = null;
let deletePartModal   = null;
let createPlanModal   = null;
let jobNoDropdowns    = new Map(); // rowId -> ModernDropdown
let newRowSeq         = 0;
let jobNoSyncHandle   = null;

// ─────────────────────────── HELPERS ──────────────────────────
const $ = id => document.getElementById(id);

function normalizePaginated(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
}

function escapeAttr(v) {
    return String(v ?? '').replaceAll('"', '&quot;');
}

function castNumber(value, fallback = null) {
    const t = `${value ?? ''}`.trim();
    if (t === '') return fallback;
    const n = Number(t);
    return Number.isNaN(n) ? fallback : n;
}

function getQuery() {
    const p = new URLSearchParams(window.location.search);
    return { session: p.get('session'), task: p.get('task') };
}

// ─────────────────────────── PLAN STATUS ──────────────────────
function setConfirmState(session) {
    const confirmed = !!(session?.tasks_created || session?.planning_request_created);
    $('lc-confirm-badge').innerHTML = confirmed
        ? '<span class="badge bg-success"><i class="fas fa-check-circle me-1"></i>Onaylandı</span>'
        : '<span class="badge bg-secondary">Bekliyor</span>';
    $('lc-confirm-btn').disabled = confirmed;
    $('lc-plan-status-pill').innerHTML = confirmed
        ? `<span class="lc-opt-pill"><i class="fas fa-check-circle"></i> Görevler Oluşturuldu</span>`
        : '';
    return confirmed;
}

function setSessionInputs(session) {
    $('lc-session-key').value         = session.key || '';
    $('lc-session-sub').textContent   = session.title || '';
    $('lc-title').value               = session.title || '';
    $('lc-stock').value               = session.stock_length_mm ?? '';
    $('lc-kerf').value                = Number(session.kerf_mm ?? 0) || '';
    $('lc-notes').value               = session.notes || '';
    setConfirmState(session);
}

function showSessionArea(show) {
    $('lc-session-area').style.display  = show ? '' : 'none';
    $('lc-no-plan-state').style.display = show ? 'none' : '';
}

// ─────────────────────────── ITEM SEARCH ──────────────────────
function formatItemLabel(item) {
    if (!item) return 'Seçilmedi';
    const code = item.item_code || item.code || '';
    const name = item.item_name || item.name || '';
    const unit = item.item_unit || item.unit || '';
    const left = [code, name].filter(Boolean).join(' — ') || 'Seçili malzeme';
    return unit ? `${left} (${unit})` : left;
}

function setSelectedItem(item) {
    $('lc-item-id').value = item ? String(item.id) : '';

    const wrapEl = $('lc-item-selected-wrap');
    if (!wrapEl) return;

    if (item) {
        wrapEl.innerHTML = `
            <span class="lc-item-badge">
                <i class="fas fa-box fa-xs"></i>
                ${formatItemLabel(item)}
                <i class="fas fa-times remove-item" data-lc-clear-item="edit"></i>
            </span>`;
    } else {
        wrapEl.innerHTML = `<span id="lc-item-label" class="text-muted" style="font-size:.8rem;">Seçilmedi</span>`;
    }
}

function showItemResults(items) {
    const box = $('lc-item-results');
    if (!box) return;
    box.innerHTML = '';
    if (!items?.length) { box.style.display = 'none'; return; }
    items.slice(0, 10).forEach(it => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'list-group-item list-group-item-action';
        btn.setAttribute('data-lc-item-pk', String(it.id));
        btn.setAttribute('data-lc-item-mode', 'edit');
        btn.innerHTML = `
            <div class="fw-bold" style="font-size:.85rem;">${it.item_code || it.code || '-'}</div>
            <div class="text-muted" style="font-size:.78rem;">${it.item_name || it.name || '-'}${it.item_unit || it.unit ? ` &nbsp;·&nbsp; ${it.item_unit || it.unit}` : ''}</div>`;
        box.appendChild(btn);
    });
    box.style.display = '';
}

function hideItemResults() {
    const box = $('lc-item-results');
    if (!box) return;
    box.style.display = 'none';
}

function makeItemSearchController({ mode }) {
    let timer = null, reqSeq = 0;
    if (mode !== 'edit') return;
    const inputEl = $('lc-item-search');
    if (!inputEl) return;
    const run = async () => {
        const q = (inputEl.value || '').trim();
        if (q.length < 2) { hideItemResults(); return; }
        const seq = ++reqSeq;
        try {
            const data = await searchItemsBySearch(q, { page_size: 10 });
            if (seq !== reqSeq) return;
            showItemResults(normalizePaginated(data));
        } catch { hideItemResults(); }
    };
    const debounced = () => {
        clearTimeout(timer);
        timer = setTimeout(run, 250);
    };
    inputEl.addEventListener('input', debounced);
    inputEl.addEventListener('focus', debounced);

    // Hide results when clicking outside
    document.addEventListener('click', e => {
        const wrap = $('lc-item-results')?.closest?.('.lc-item-wrap');
        if (wrap && !wrap.contains(e.target) && !inputEl.contains(e.target)) {
            hideItemResults();
        }
    }, true);
}

// ─────────────────────────── PARTS TABLE ──────────────────────
function inputHtml({ rowId, field, type = 'text', value = '', placeholder = '', min = null }) {
    const minAttr = min !== null ? ` min="${min}"` : '';
    return `<input class="form-control form-control-sm" style="min-width:60px"
        data-lc-row="${escapeAttr(rowId)}" data-lc-field="${escapeAttr(field)}"
        type="${type}" value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}"${minAttr}>`;
}

function selectHtml({ rowId, field, value = '', options = [], placeholder = 'Seçiniz…' }) {
    const opts = [
        `<option value="">${escapeAttr(placeholder)}</option>`,
        ...options.map(o => {
            const v = String(o.value ?? '');
            const selected = String(value ?? '') === v ? ' selected' : '';
            return `<option value="${escapeAttr(v)}"${selected}>${escapeAttr(o.label ?? v)}</option>`;
        })
    ].join('');
    return `<select class="form-select form-select-sm" style="min-width:120px"
        data-lc-row="${escapeAttr(rowId)}" data-lc-field="${escapeAttr(field)}">${opts}</select>`;
}

function jobNoDropdownHtml({ rowId, value = '' }) {
    // Hidden input is the actual form value read by bulk-save and patch payloads.
    // Dropdown renders into the container and updates the hidden input on selection.
    return `
        <input type="hidden" data-lc-row="${escapeAttr(rowId)}" data-lc-field="job_no" value="${escapeAttr(value || '')}">
        <div id="lc-jobno-dd-${escapeAttr(rowId)}" style="min-width:170px;"></div>
    `;
}

function isRowEditing(row) {
    return row?.__rowId && row.__rowId === inlineEditRowId;
}

function makeNewRowId() {
    // Must be unique even for very fast consecutive clicks (Date.now can collide).
    newRowSeq = (newRowSeq + 1) % 1_000_000;
    return `new-${Date.now()}-${newRowSeq}`;
}

function isRowEditable(row) {
    return !row?.id || isRowEditing(row);
}

function hasNewRows() {
    return partsTableRows.some(r => !r.id);
}

function updateBulkSaveButton() {
    const btn = $('lc-bulk-save-parts-btn');
    if (!btn) return;
    btn.disabled = !currentSessionKey || !hasNewRows();
}

function buildPartsTableRows(parts) {
    return (parts || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(p => ({
            __rowId: `p-${p.id}`,
            id: p.id,
            label: p.label ?? '',
            nominal_length_mm: p.nominal_length_mm ?? null,
            quantity: p.quantity ?? null,
            angle_left_deg: p.angle_left_deg ?? 0,
            angle_right_deg: p.angle_right_deg ?? 0,
            profile_height_mm: p.profile_height_mm ?? 0,
            job_no: p.job_no ?? '',
            order: p.order ?? null
        }));
}

function renderPartsTable() {
    const columns = [
        {
            key: 'order', label: '#', sortable: false, width: '52px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'order', type: 'number', value: row.order ?? '', min: 0 })
                : `<div class="text-center text-muted fw-bold">${row.order ?? '—'}</div>`
        },
        {
            key: 'job_no', label: 'İş No', sortable: false, width: '170px',
            formatter: (v, row) => isRowEditable(row)
                ? jobNoDropdownHtml({ rowId: row.__rowId, value: row.job_no ?? '' })
                : (row.job_no ? `<span class="fw-semibold">${escapeAttr(row.job_no)}</span>` : '<span class="text-muted">—</span>')
        },
        {
            key: 'label', label: 'Parça Adı', sortable: false, width: '220px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'label', value: row.label, placeholder: 'Parça adı' })
                : (row.label
                    ? `<div class="text-truncate" style="max-width:220px;" title="${escapeAttr(row.label)}">${escapeAttr(row.label)}</div>`
                    : '<span class="text-muted">—</span>')
        },
        {
            key: 'nominal_length_mm', label: 'Uzunluk (mm)', sortable: false, width: '120px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'nominal_length_mm', type: 'number', value: row.nominal_length_mm ?? '', min: 0 })
                : (row.nominal_length_mm != null ? `<div class="text-end fw-bold">${row.nominal_length_mm}</div>` : '—')
        },
        {
            key: 'quantity', label: 'Adet', sortable: false, width: '80px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'quantity', type: 'number', value: row.quantity ?? '', min: 1 })
                : (row.quantity != null ? `<div class="text-center">${row.quantity}</div>` : '—')
        },
        {
            key: 'angle_left_deg', label: 'Sol Açı', sortable: false, width: '90px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'angle_left_deg', type: 'number', value: row.angle_left_deg ?? 0 })
                : `<div class="text-center">${row.angle_left_deg ?? 0}°</div>`
        },
        {
            key: 'angle_right_deg', label: 'Sağ Açı', sortable: false, width: '90px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'angle_right_deg', type: 'number', value: row.angle_right_deg ?? 0 })
                : `<div class="text-center">${row.angle_right_deg ?? 0}°</div>`
        },
        {
            key: 'profile_height_mm', label: 'Profil Y.', sortable: false, width: '90px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'profile_height_mm', type: 'number', value: row.profile_height_mm ?? 0, min: 0 })
                : (row.profile_height_mm ? `<div class="text-center">${row.profile_height_mm}</div>` : '<div class="text-center text-muted">—</div>')
        },
        {
            key: 'actions', label: '', sortable: false, width: '90px',
            formatter: (v, row) => {
                if (!row.id) {
                    return `<div class="d-flex gap-1 justify-content-end">
                        <button class="btn btn-sm btn-outline-danger" data-lc-remove-new-row="${row.__rowId}" title="Satırı Kaldır">
                            <i class="fas fa-trash"></i></button>
                    </div>`;
                }
                if (isRowEditing(row)) {
                    return `<div class="d-flex gap-1 justify-content-end">
                        <button class="btn btn-sm btn-success" data-lc-save-row="${row.__rowId}" title="Kaydet">
                            <i class="fas fa-check"></i></button>
                        <button class="btn btn-sm btn-outline-secondary" data-lc-cancel-row="${row.__rowId}" title="İptal">
                            <i class="fas fa-times"></i></button>
                    </div>`;
                }
                return `<div class="d-flex gap-1 justify-content-end">
                    <button class="btn btn-sm btn-outline-secondary" data-lc-dup-row="${row.__rowId}" title="Kopyala">
                        <i class="fas fa-clone"></i></button>
                    <button class="btn btn-sm btn-outline-primary" data-lc-edit-row="${row.__rowId}" title="Düzenle">
                        <i class="fas fa-edit"></i></button>
                    ${row.id ? `<button class="btn btn-sm btn-outline-danger" data-lc-del-row="${row.__rowId}" title="Sil">
                        <i class="fas fa-trash"></i></button>` : ''}
                </div>`;
            }
        }
    ];

    if (!partsTable) {
        partsTable = new TableComponent('lc-parts-table', {
            title: '',
            columns,
            data: partsTableRows,
            pagination: false,
            sortable: false,
            emptyMessage: 'Henüz parça yok — "Parça Ekle" ile başlayın',
            emptyIcon: 'fas fa-puzzle-piece',
            skeleton: false,
            tableClass: 'table table-hover table-sm align-middle mb-0'
        });
        // Hide the card-header that the table component auto-renders (we have our own)
        const cardHeader = $('lc-parts-table')?.querySelector?.('.card-header');
        if (cardHeader) cardHeader.style.display = 'none';
        return;
    }
    partsTable.options.columns = columns;
    partsTable.updateData(partsTableRows);
    scheduleJobNoDropdownSync();
    updateBulkSaveButton();
}

function readRowInputs(rowId) {
    const inputs = document.querySelectorAll(`[data-lc-row="${CSS.escape(rowId)}"][data-lc-field]`);
    const data = {};
    inputs.forEach(inp => { data[inp.getAttribute('data-lc-field')] = inp.value; });
    return data;
}

function buildPartPayloadFromRowId(rowId) {
    const raw = readRowInputs(rowId);
    return {
        session: currentSessionKey,
        label: raw.label || '',
        job_no: raw.job_no || '',
        nominal_length_mm: castNumber(raw.nominal_length_mm, 0),
        quantity: castNumber(raw.quantity, 1),
        angle_left_deg: castNumber(raw.angle_left_deg, 0),
        angle_right_deg: castNumber(raw.angle_right_deg, 0),
        profile_height_mm: castNumber(raw.profile_height_mm, 0),
        order: castNumber(raw.order, 1)
    };
}

function validatePartPayload(payload, rowLabelForError = '') {
    const prefix = rowLabelForError ? `${rowLabelForError}: ` : '';
    if (!(payload.nominal_length_mm > 0) || !(payload.quantity > 0)) {
        showNotification(`${prefix}Uzunluk ve Adet sıfırdan büyük olmalı.`, 'warning');
        return false;
    }
    return true;
}

function destroyJobNoDropdown(rowId) {
    const dd = jobNoDropdowns.get(rowId);
    if (dd) {
        try { dd.destroy?.(); } catch { /* ignore */ }
        jobNoDropdowns.delete(rowId);
    }
}

function syncJobNoDropdowns() {
    // Ensure ModernDropdown exists for each editable row and destroy for non-editable.
    const editableRowIds = new Set(
        partsTableRows.filter(isRowEditable).map(r => r.__rowId)
    );

    // Destroy dropdowns for rows that are no longer editable/present
    [...jobNoDropdowns.keys()].forEach(rowId => {
        if (!editableRowIds.has(rowId)) destroyJobNoDropdown(rowId);
    });

    // Create missing dropdowns
    editableRowIds.forEach(rowId => {
        const container = document.getElementById(`lc-jobno-dd-${rowId}`);
        if (!container) {
            // Table may have re-rendered and removed the container; drop stale instance.
            destroyJobNoDropdown(rowId);
            return;
        }

        // If we already have an instance but the table re-render replaced the DOM,
        // the container will be empty. In that case, recreate the dropdown.
        if (jobNoDropdowns.has(rowId)) {
            const hasUi = !!container.querySelector('.modern-dropdown');
            if (hasUi) return;
            destroyJobNoDropdown(rowId);
        }

        const hidden = document.querySelector(`[data-lc-row="${CSS.escape(rowId)}"][data-lc-field="job_no"]`);
        const currentValue = hidden?.value || '';

        const dropdown = new ModernDropdown(container, {
            placeholder: 'İş no seçin…',
            searchable: true,
            remoteSearch: async (term) => {
                const t = (term || '').trim();
                if (t.length < 2) return [];
                const data = await listJobOrders({ search: t, page_size: 20, ordering: '-created_at', status__in: 'active,draft,on_hold' });
                const items = normalizePaginated(data);
                return items.map(j => ({
                    value: j.job_no,
                    text: `${j.job_no}${j.title ? ` — ${j.title}` : ''}`
                }));
            },
            minSearchLength: 2,
            remoteSearchPlaceholder: 'En az 2 karakter yazın'
        });

        // Seed current value so it can be displayed even before searching
        if (currentValue) {
            dropdown.setItems([{ value: currentValue, text: currentValue }]);
            dropdown.setValue(currentValue);
        } else {
            dropdown.setItems([]);
        }

        container.addEventListener('dropdown:select', (e) => {
            const val = e.detail?.value ?? '';
            if (hidden) hidden.value = val;
        });

        jobNoDropdowns.set(rowId, dropdown);
    });
}

function scheduleJobNoDropdownSync() {
    // TableComponent may update DOM asynchronously; run sync after paint (and one extra frame).
    if (jobNoSyncHandle) return;
    jobNoSyncHandle = true;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            jobNoSyncHandle = null;
            syncJobNoDropdowns();
        });
    });
}

async function saveRow(rowId) {
    const row = partsTableRows.find(r => r.__rowId === rowId);
    if (!row) return;
    if (!row.id) {
        showNotification('Yeni parçaları tek tek kaydetmek yerine "Toplu Kaydet" kullanın.', 'info');
        return;
    }
    const payload = buildPartPayloadFromRowId(rowId);
    if (!validatePartPayload(payload)) return;
    if (!payload.label) payload.label = `Parça ${row.id}`;

    try {
        await patchLinearCuttingPart(row.id, payload);
        showNotification('Parça güncellendi.', 'success');
        inlineEditRowId = null;
        await refreshParts();
    } catch (e) {
        showNotification(e.message || 'Parça kaydedilirken hata oluştu.', 'error');
    }
}

function cancelRow(rowId) {
    const row = partsTableRows.find(r => r.__rowId === rowId);
    if (!row) return;
    if (!row.id) partsTableRows = partsTableRows.filter(r => r.__rowId !== rowId);
    inlineEditRowId = null;
    renderPartsTable();
}

function addNewPartRow() {
    if (!currentSessionKey) { showNotification('Önce bir plan seçin.', 'warning'); return; }
    const tempId    = makeNewRowId();
    const nextOrder = (Math.max(0, ...partsTableRows.filter(r => r.order != null).map(r => Number(r.order) || 0)) + 1) || 1;
    partsTableRows  = [{ __rowId: tempId, id: null, label: '', nominal_length_mm: null, quantity: 1, angle_left_deg: 0, angle_right_deg: 0, profile_height_mm: 0, job_no: '', order: nextOrder }, ...partsTableRows];
    renderPartsTable();
    $('lc-parts-table')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function duplicateRow(rowId) {
    const row = partsTableRows.find(r => r.__rowId === rowId);
    if (!row) return;
    if (!currentSessionKey) { showNotification('Önce bir plan seçin.', 'warning'); return; }

    const tempId    = makeNewRowId();
    const nextOrder = (Math.max(0, ...partsTableRows.filter(r => r.order != null).map(r => Number(r.order) || 0)) + 1) || 1;
    partsTableRows  = [{
        __rowId: tempId,
        id: null,
        label: row.label ?? '',
        nominal_length_mm: row.nominal_length_mm ?? null,
        quantity: row.quantity ?? 1,
        angle_left_deg: row.angle_left_deg ?? 0,
        angle_right_deg: row.angle_right_deg ?? 0,
        profile_height_mm: row.profile_height_mm ?? 0,
        job_no: row.job_no ?? '',
        order: nextOrder
    }, ...partsTableRows];

    renderPartsTable();
    $('lc-parts-table')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function bulkSaveNewParts() {
    if (!currentSessionKey) { showNotification('Önce bir plan seçin.', 'warning'); return; }
    const newRows = partsTableRows.filter(r => !r.id);
    if (!newRows.length) { showNotification('Kaydedilecek yeni satır yok.', 'info'); return; }
    if (inlineEditRowId) {
        showNotification('Önce düzenlenen satırı kaydedin veya iptal edin.', 'warning');
        return;
    }

    const payloadArray = [];
    const blankLabelIdx = new Set();
    for (let i = 0; i < newRows.length; i++) {
        const row = newRows[i];
        const payload = buildPartPayloadFromRowId(row.__rowId);
        const rowLabel = `Satır ${i + 1}`;
        if (!validatePartPayload(payload, rowLabel)) return;
        if (!payload.label) blankLabelIdx.add(i);
        payloadArray.push(payload);
    }

    const btn = $('lc-bulk-save-parts-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Kaydediliyor…';
    }
    try {
        const created = await createLinearCuttingPartsBulk(payloadArray);
        const createdArr = Array.isArray(created) ? created : normalizePaginated(created);

        // If label was left empty, auto-fill it after creation as "Parça {id}"
        const patchPromises = [];
        createdArr.forEach((p, idx) => {
            if (!blankLabelIdx.has(idx)) return;
            if (!p?.id) return;
            patchPromises.push(
                patchLinearCuttingPart(p.id, { label: `Parça ${p.id}` })
            );
        });
        if (patchPromises.length) {
            await Promise.allSettled(patchPromises);
        }
        showNotification(`${payloadArray.length} parça kaydedildi.`, 'success');
        await refreshParts();
    } catch (e) {
        showNotification(e.message || 'Toplu kayıt başarısız.', 'error');
    } finally {
        if (btn) btn.innerHTML = '<i class="fas fa-save me-1"></i>Toplu Kaydet';
        updateBulkSaveButton();
    }
}

async function onDeletePart(rowId) {
    const row = partsTableRows.find(r => r.__rowId === rowId);
    if (!row?.id) return;
    deletePartModal.show({
        title: 'Parçayı Sil',
        message: `"${row.label || row.id}" parçasını silmek istiyor musunuz?`,
        confirmText: 'Evet, Sil',
        confirmButtonClass: 'btn-danger',
        onConfirm: async () => {
            try {
                await deleteLinearCuttingPart(row.id);
                showNotification('Parça silindi.', 'success');
                await refreshParts();
            } catch (e) {
                showNotification(e.message || 'Silinemedi.', 'error');
            }
        }
    });
}

// ─────────────────────────── BAR DIAGRAM ──────────────────────
function colorForIndex(i) {
    const palette = ['#0d6efd','#198754','#fd7e14','#6f42c1','#20c997','#dc3545','#0dcaf0','#ffc107'];
    return palette[i % palette.length];
}

function drawBar(canvas, bar, kerfMm, tooltipEl) {
    const dpr   = window.devicePixelRatio || 1;
    const W     = canvas.clientWidth || 900;
    const H     = 62;
    canvas.width  = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const pad = 8, barY = 22, barH = 22;
    const barX = pad, barW = W - pad * 2;
    ctx.clearRect(0, 0, W, H);
    // Track background + stroke
    ctx.fillStyle = '#f6f7f9';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const scale = barW / (bar.stock_length_mm || 1);
    const hitBoxes = [];

    (bar.cuts || []).forEach((cut, idx) => {
        const x = barX + (cut.offset_mm || 0) * scale;
        const w = Math.max(1, (cut.effective_mm || 0) * scale);
        ctx.fillStyle = colorForIndex(idx);
        ctx.beginPath(); ctx.roundRect(x, barY, w, barH, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (kerfMm > 0) {
            const kx = x + w, kw = Math.max(1, kerfMm * scale);
            ctx.fillStyle = 'rgba(0,0,0,.22)';
            ctx.fillRect(kx, barY, kw, barH);
        }
        hitBoxes.push({ x, y: barY, w, h: barH, cut });

        if (w > 55) {
            ctx.fillStyle = 'rgba(255,255,255,.95)';
            ctx.font = '600 11px system-ui';
            ctx.textBaseline = 'middle';
            const lbl = (cut.label ? `${cut.label} ` : '') + `${cut.nominal_mm ?? ''}mm`;
            ctx.fillText(lbl, x + 6, barY + barH / 2);
        }
    });

    const wasteW = Math.max(0, (bar.waste_mm || 0) * scale);
    if (wasteW > 0.5) {
        const wasteX = barX + barW - wasteW;
        // Waste: hatched pattern
        ctx.save();
        ctx.beginPath(); ctx.roundRect(wasteX, barY, wasteW, barH, 4); ctx.clip();
        ctx.fillStyle = '#c6ccd2';
        ctx.fillRect(wasteX, barY, wasteW, barH);
        ctx.strokeStyle = 'rgba(0,0,0,.12)';
        ctx.lineWidth = 1;
        for (let i = -barH; i < wasteW + barH; i += 7) {
            ctx.beginPath();
            ctx.moveTo(wasteX + i, barY);
            ctx.lineTo(wasteX + i + barH, barY + barH);
            ctx.stroke();
        }
        ctx.restore();
        hitBoxes.push({
            x: wasteX, y: barY, w: wasteW, h: barH,
            cut: { label: 'Fire', nominal_mm: bar.waste_mm, effective_mm: bar.waste_mm, offset_mm: bar.stock_length_mm - bar.waste_mm, job_no: '' }
        });
    }

    // axis labels
    ctx.fillStyle = '#6c757d'; ctx.font = '10px system-ui'; ctx.textBaseline = 'top';
    ctx.fillText('0', barX, 6);
    const endLabel = `${bar.stock_length_mm} mm`;
    ctx.fillText(endLabel, barX + barW - ctx.measureText(endLabel).width, 6);
    const mid = bar.stock_length_mm ? Math.round(bar.stock_length_mm / 2) : 0;
    const midLabel = `${mid}`;
    ctx.fillText(midLabel, barX + (barW / 2) - (ctx.measureText(midLabel).width / 2), 6);

    const fmt = v => (v == null || Number.isNaN(v)) ? '—' : String(v);
    canvas.onmousemove = e => {
        const r = canvas.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const hb = hitBoxes.find(h => mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h);
        if (!hb) { tooltipEl.style.display = 'none'; canvas.style.cursor = 'default'; return; }
        canvas.style.cursor = 'help';
        const c = hb.cut;
        tooltipEl.innerHTML = `
            <div style="font-weight:700;margin-bottom:4px;">${c.label || '—'}</div>
            <div><span style="opacity:.7">Nominal:</span> ${fmt(c.nominal_mm)} mm</div>
            <div><span style="opacity:.7">Efektif:</span> ${fmt(c.effective_mm)} mm</div>
            <div><span style="opacity:.7">Offset:</span> ${fmt(c.offset_mm)} mm</div>
            ${c.job_no ? `<div><span style="opacity:.7">İş No:</span> ${c.job_no}</div>` : ''}`;
        tooltipEl.style.left = `${e.clientX + 14}px`;
        tooltipEl.style.top  = `${e.clientY + 12}px`;
        tooltipEl.style.display = 'block';
    };
    canvas.onmouseleave = () => { tooltipEl.style.display = 'none'; canvas.style.cursor = 'default'; };
}

function renderOptimization(result) {
    const tooltipEl = $('lc-tooltip');
    const barsEl    = $('lc-bars');
    const summaryEl = $('lc-opt-summary');
    barsEl.innerHTML = '';
    if (summaryEl) summaryEl.innerHTML = '';

    if (!result) {
        if (summaryEl) summaryEl.innerHTML = '';
        barsEl.innerHTML = `<div class="lc-empty-state">
            <i class="fas fa-play-circle"></i>
            <p>Optimizasyon henüz çalıştırılmadı.<br>Parçaları ekledikten sonra <strong>Optimize Et</strong> butonuna basın.</p>
        </div>`;
        return;
    }

    const barsNeeded = result.bars_needed ?? '—';
    const eff        = result.efficiency_pct != null ? `${result.efficiency_pct}%` : '—';
    const waste      = result.total_waste_mm != null ? `${result.total_waste_mm} mm` : '—';
    const kerfMm     = Number(result.kerf_mm ?? $('lc-kerf')?.value ?? 0) || 0;

    if (summaryEl) {
        summaryEl.className = 'lc-opt-summary';
        summaryEl.innerHTML = `
            <div class="lc-opt-metric">
                <div class="k"><i class="fas fa-ruler-horizontal text-primary"></i> Bar Sayısı</div>
                <div class="v">${barsNeeded}</div>
                <div class="s">Toplam ihtiyaç</div>
            </div>
            <div class="lc-opt-metric">
                <div class="k"><i class="fas fa-chart-line text-success"></i> Verim</div>
                <div class="v">${eff}</div>
                <div class="s">Kullanım oranı</div>
            </div>
            <div class="lc-opt-metric">
                <div class="k"><i class="fas fa-trash-alt text-warning"></i> Toplam Fire</div>
                <div class="v">${waste}</div>
                <div class="s">Kerf: ${kerfMm} mm</div>
            </div>
        `;
    }

    const bars = Array.isArray(result.bars) ? result.bars : [];
    if (!bars.length) {
        barsEl.innerHTML = `<div class="lc-empty-state">
            <i class="fas fa-inbox"></i>
            <p>Optimizasyon sonucu boş döndü.</p>
        </div>`;
        return;
    }

    const list = document.createElement('div');
    list.className = 'lc-opt-bars';
    barsEl.appendChild(list);

    bars.forEach(bar => {
        const stock = Number(bar.stock_length_mm ?? 0) || 0;
        const wasteMm = Number(bar.waste_mm ?? 0) || 0;
        const cutsCount = Array.isArray(bar.cuts) ? bar.cuts.length : 0;

        const card = document.createElement('div');
        card.className = 'lc-bar-card';
        card.innerHTML = `
            <div class="head">
                <div class="title">
                    <i class="fas fa-grip-lines-vertical text-primary"></i>
                    Bar #${bar.bar_index}
                </div>
                <div class="meta">
                    <span><i class="fas fa-cut text-muted me-1"></i>${cutsCount} kesim</span>
                    <span><i class="fas fa-ruler-horizontal text-muted me-1"></i>${stock} mm</span>
                    <span><i class="fas fa-trash-alt text-muted me-1"></i>${wasteMm} mm fire</span>
                </div>
            </div>
            <div class="body">
            </div>
        `;
        const body = card.querySelector('.body');
        const canvasWrap = document.createElement('div');
        canvasWrap.className = 'lc-canvas-wrap';
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvasWrap.appendChild(canvas);
        body.appendChild(canvasWrap);

        list.appendChild(card);

        // Draw after paint so clientWidth is known
        requestAnimationFrame(() => drawBar(canvas, bar, kerfMm, tooltipEl));
    });
}

// ─────────────────────────── DATA LOADING ─────────────────────
async function refreshParts() {
    if (!currentSessionKey) return;
    const raw = await listLinearCuttingParts(currentSessionKey);
    currentParts = normalizePaginated(raw);
    partsTableRows = buildPartsTableRows(currentParts);
    renderPartsTable();
}

async function loadSession(sessionKey) {
    currentSessionKey = sessionKey;
    currentSession    = await getLinearCuttingSession(sessionKey);
    setSessionInputs(currentSession);
    showSessionArea(true);

    // Item display
    const itemPk = currentSession?.item;
    if (itemPk) {
        try {
            const itemObj = await getItem(itemPk);
            setSelectedItem(itemObj);
        } catch { setSelectedItem(null); }
    } else {
        setSelectedItem(null);
    }

    // Parts
    currentParts = Array.isArray(currentSession.parts) ? currentSession.parts : [];
    if (!currentParts.length) {
        await refreshParts();
    } else {
        partsTableRows = buildPartsTableRows(currentParts);
        renderPartsTable();
    }

    // Optimization
    renderOptimization(currentSession.optimization_result || null);
}

async function refreshSessionsList(selectKey = null) {
    const select = $('lc-session-select');
    const raw    = await listLinearCuttingSessions({ ordering: '-created_at' });
    const sessions = normalizePaginated(raw);
    select.innerHTML = '<option value="">— Seçiniz —</option>';
    sessions.forEach(s => {
        const opt = document.createElement('option');
        opt.value       = s.key;
        opt.textContent = `${s.key}  —  ${s.title || ''}`;
        select.appendChild(opt);
    });
    if (selectKey) select.value = selectKey;
}

// ─────────────────────────── ACTIONS ──────────────────────────
// Create session now handled by EditModal (see initModals).

async function onSaveSession() {
    if (!currentSessionKey) return;
    const btn = $('lc-save-session-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>';
    try {
        const patch = {
            title: $('lc-title').value,
            stock_length_mm: castNumber($('lc-stock').value, 6000),
            kerf_mm: castNumber($('lc-kerf').value, 3),
            notes: $('lc-notes').value
        };
        const itemPk = $('lc-item-id').value;
        patch.item = itemPk ? Number(itemPk) : null;

        currentSession = await patchLinearCuttingSession(currentSessionKey, patch);
        setSessionInputs(currentSession);
        await refreshSessionsList(currentSessionKey);
        showNotification('Plan kaydedildi.', 'success');
    } catch (e) {
        showNotification(e.message || 'Kaydedilemedi.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save me-1"></i>Kaydet';
    }
}

async function onOptimize() {
    if (!currentSessionKey) return;
    if (!currentParts.length) {
        showNotification('Önce en az bir parça ekleyin.', 'warning');
        return;
    }
    const btn = $('lc-optimize-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Optimize…';
    try {
        const result = await optimizeLinearCuttingSession(currentSessionKey, {
            stock_length_mm: castNumber($('lc-stock').value),
            kerf_mm: castNumber($('lc-kerf').value)
        });
        currentSession.optimization_result = result;
        renderOptimization(result);
        showNotification('Optimizasyon tamamlandı.', 'success');
    } catch (e) {
        showNotification(e.message || 'Optimizasyon başarısız.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play me-1"></i>Optimize Et';
    }
}

async function onConfirm() {
    if (!currentSessionKey) return;
    confirmModal.show({
        title: 'Planı Onayla',
        message: 'Bar görevleri ve planlama talebi oluşturulacak. Bu işlem geri alınamaz.',
        confirmText: 'Evet, Onayla',
        confirmButtonClass: 'btn-success',
        onConfirm: async () => {
            const btn = $('lc-confirm-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>';
            try {
                const res = await confirmLinearCuttingSession(currentSessionKey, {});
                const tasks = (res.created_tasks || []).join(', ');
                showNotification(
                    `Onaylandı — Görevler: ${tasks || '—'} · Planlama: ${res.planning_request_number || '—'}`,
                    'success', 8000
                );
                currentSession = await getLinearCuttingSession(currentSessionKey);
                setSessionInputs(currentSession);
            } catch (e) {
                if (e.status === 409) {
                    showNotification('Bu plan zaten onaylanmış.', 'warning');
                    currentSession = await getLinearCuttingSession(currentSessionKey);
                    setSessionInputs(currentSession);
                } else {
                    showNotification(e.message || 'Onaylanamadı.', 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-check-circle me-1"></i>Onayla &amp; Görevler';
                }
            }
        }
    });
}

async function onPdf() {
    if (!currentSessionKey) return;
    const btn = $('lc-pdf-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>PDF';
    }
    try {
        const blob = await downloadLinearCuttingSessionPdf(currentSessionKey);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentSessionKey}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (e) {
        // Fallback: still open direct URL for environments using cookie-based auth
        try { window.open(getLinearCuttingSessionPdfUrl(currentSessionKey), '_blank', 'noopener'); } catch { /* ignore */ }
        showNotification(e.message || 'PDF indirilemedi.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-file-pdf me-1"></i>PDF';
        }
    }
}

// ─────────────────────────── INIT ─────────────────────────────
function initHeader() {
    new HeaderComponent({
        title: 'Lineer Kesim',
        subtitle: 'Kesim planları, parça yönetimi ve optimizasyon',
        icon: 'ruler-horizontal',
        showBackButton: 'block',
        showCreateButton: 'block',
        createButtonText: 'Yeni Kesim Planı',
        onBackClick: () => window.location.href = '/manufacturing/linear-cutting/',
        onCreateClick: () => createPlanModal?.show()
    });
}

function initModals() {
    confirmModal    = new ConfirmationModal('lc-confirm-modal-container');
    deletePartModal = new ConfirmationModal('lc-delete-part-modal-container', {
        icon: 'fas fa-trash-alt',
        confirmText: 'Evet, Sil',
        confirmButtonClass: 'btn-danger'
    });

    createPlanModal = new EditModal('lc-create-plan-modal-container', {
        title: 'Yeni Kesim Planı',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Plan Oluştur',
        size: 'lg'
    });

    createPlanModal
        .addSection({
            title: 'Plan Bilgileri',
            icon: 'fas fa-edit',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'lc-create-title',
                    name: 'title',
                    label: 'Başlık',
                    type: 'text',
                    placeholder: 'Örn: Bina Çelik Çerçeve - Blok A',
                    required: true,
                    icon: 'fas fa-tag',
                    colSize: 12
                },
                {
                    id: 'lc-create-stock',
                    name: 'stock_length_mm',
                    label: 'Stok Boyu (mm)',
                    type: 'number',
                    value: 6000,
                    defaultValue: 6000,
                    min: 1,
                    icon: 'fas fa-ruler-horizontal',
                    colSize: 6
                },
                {
                    id: 'lc-create-kerf',
                    name: 'kerf_mm',
                    label: 'Kerf (mm)',
                    type: 'number',
                    value: 3,
                    defaultValue: 3,
                    min: 0,
                    icon: 'fas fa-cut',
                    colSize: 6
                },
                {
                    id: 'lc-create-item',
                    name: 'item',
                    label: 'Malzeme Kartı',
                    type: 'dropdown',
                    placeholder: 'Kod veya isim ile ara…',
                    searchable: true,
                    remoteSearchPlaceholder: 'En az 2 karakter yazın',
                    minSearchLength: 2,
                    remoteSearch: async (term) => {
                        const data = await searchItemsBySearch(term, { page_size: 10 });
                        const items = normalizePaginated(data);
                        return items.map(it => ({
                            value: it.id,
                            text: `${it.item_code || it.code || '-'} — ${it.item_name || it.name || '-'}${it.item_unit || it.unit ? ` • ${it.item_unit || it.unit}` : ''}`
                        }));
                    },
                    colSize: 12
                },
                {
                    id: 'lc-create-notes',
                    name: 'notes',
                    label: 'Not',
                    type: 'textarea',
                    placeholder: 'Opsiyonel notlar…',
                    rows: 2,
                    icon: 'fas fa-sticky-note',
                    colSize: 12
                }
            ]
        })
        .render()
        .onSaveCallback(async (data) => {
            const title = `${data.title || ''}`.trim();
            if (!title) { showNotification('Başlık zorunludur.', 'warning'); return; }

            const payload = {
                title,
                stock_length_mm: castNumber(data.stock_length_mm, 6000),
                kerf_mm: castNumber(data.kerf_mm, 3),
                notes: data.notes || '',
                parts_data: []
            };
            if (data.item) payload.item = Number(data.item);

            const created = await createLinearCuttingSession(payload);
            createPlanModal.hide();
            createPlanModal.resetForm();
            showNotification(`${created.key} oluşturuldu.`, 'success');
            await refreshSessionsList(created.key);
            await loadSession(created.key);
        })
        .onCancelCallback(() => {
            createPlanModal.resetForm();
        });
}

function wireEvents() {
    $('lc-refresh-sessions').addEventListener('click', () => refreshSessionsList(currentSessionKey));

    $('lc-session-select').addEventListener('change', async e => {
        const key = e.target.value;
        if (!key) { currentSessionKey = null; showSessionArea(false); return; }
        await loadSession(key);
    });

    $('lc-save-session-btn').addEventListener('click', onSaveSession);
    $('lc-optimize-btn').addEventListener('click', onOptimize);
    $('lc-confirm-btn').addEventListener('click', onConfirm);
    $('lc-pdf-btn').addEventListener('click', onPdf);

    $('lc-bulk-save-parts-btn')?.addEventListener('click', bulkSaveNewParts);
    $('lc-add-part-btn').addEventListener('click', addNewPartRow);

    // Delegated: parts table + item search picks + item badge clear
    document.body.addEventListener('click', async e => {
        // Item pick from dropdown
        const itemPick = e.target.closest('[data-lc-item-pk][data-lc-item-mode]');
        if (itemPick) {
            const pk   = Number(itemPick.getAttribute('data-lc-item-pk'));
            try {
                const itemObj = await getItem(pk);
                setSelectedItem(itemObj);
                $('lc-item-search').value = '';
                hideItemResults();
            } catch { showNotification('Malzeme yüklenemedi.', 'error'); }
            return;
        }

        // Clear item badge
        const clearBtn = e.target.closest('[data-lc-clear-item]');
        if (clearBtn) {
            setSelectedItem(null);
            return;
        }

        // Parts table actions
        const editBtn = e.target.closest('[data-lc-edit-row]');
        if (editBtn) {
            inlineEditRowId = editBtn.getAttribute('data-lc-edit-row');
            renderPartsTable();
            return;
        }
        const saveBtn = e.target.closest('[data-lc-save-row]');
        if (saveBtn) {
            await saveRow(saveBtn.getAttribute('data-lc-save-row'));
            return;
        }
        const cancelBtn = e.target.closest('[data-lc-cancel-row]');
        if (cancelBtn) {
            cancelRow(cancelBtn.getAttribute('data-lc-cancel-row'));
            return;
        }
        const dupBtn = e.target.closest('[data-lc-dup-row]');
        if (dupBtn) {
            duplicateRow(dupBtn.getAttribute('data-lc-dup-row'));
            return;
        }
        const removeNewBtn = e.target.closest('[data-lc-remove-new-row]');
        if (removeNewBtn) {
            const rowId = removeNewBtn.getAttribute('data-lc-remove-new-row');
            destroyJobNoDropdown(rowId);
            partsTableRows = partsTableRows.filter(r => r.__rowId !== rowId);
            renderPartsTable();
            return;
        }
        const delBtn = e.target.closest('[data-lc-del-row]');
        if (delBtn) {
            await onDeletePart(delBtn.getAttribute('data-lc-del-row'));
        }
    });
}

async function bootstrapFromQuery() {
    const q = getQuery();
    if (q.task) {
        try {
            const task = await getLinearCuttingTask(q.task);
            if (task?.session) {
                await refreshSessionsList(task.session);
                await loadSession(task.session);
                return;
            }
        } catch { /* fall through */ }
    }
    if (q.session) {
        await refreshSessionsList(q.session);
        await loadSession(q.session);
        return;
    }
    await refreshSessionsList();
}

async function init() {
    await initNavbar();
    initHeader();
    initModals();
    wireEvents();
    makeItemSearchController({ mode: 'edit' });
    await bootstrapFromQuery();
}

document.addEventListener('DOMContentLoaded', init);
