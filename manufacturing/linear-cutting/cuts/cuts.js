import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { showNotification } from '../../../components/notification/notification.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ModernDropdown } from '../../../components/dropdown/dropdown.js';
import { searchItemsBySearch } from '../../../apis/procurement.js';
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
    createLinearCuttingPartsBulk,
    patchLinearCuttingPart,
    deleteLinearCuttingPart
} from '../../../apis/linear_cutting/parts.js';
import { getLinearCuttingTask } from '../../../apis/linear_cutting/tasks.js';
import {
    drawBarCanvas, buildPassTableHtml, piecePictogramSVG, formatAngleTr,
    angleFromSetback, setbackFromAngle, ANGLE_TOL_DEG, MAX_ANGLE_DEG
} from '../lc-geometry.js';

// ─────────────────────────── STATE ────────────────────────────
let currentSessionKey = null;
let currentSession    = null;
let currentParts      = [];
let partsTable        = null;
let partsTableRows    = [];
let inlineEditRowId   = null;
let confirmModal      = null;
let confirmResultModal = null;
let deletePartModal   = null;
let createPlanModal   = null;
let stockBarsModal    = null;
let jobNoDropdowns    = new Map(); // rowId -> ModernDropdown
let partItemDropdowns = new Map(); // rowId -> ModernDropdown
let newRowSeq         = 0;
let jobNoSyncHandle   = null;
let stockColExpanded  = false; // Stok (mm) override column — rarely used, collapsed by default
let expandedGeomRows  = new Set(); // rowIds whose "kenar ölçüsü" panel is open

// ─────────────────────────── HELPERS ──────────────────────────
const $ = id => document.getElementById(id);

function normalizePaginated(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
}

function escapeAttr(v) {
    // Full HTML escaper — used for both attribute values and text content
    // (user-entered labels/job numbers must never reach innerHTML raw).
    return String(v ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
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
    // Do not disable confirm button; backend handles repeats (409)
    const indicator = $('lc-confirm-indicator');
    if (indicator) indicator.style.display = confirmed ? '' : 'none';
    $('lc-plan-status-pill').innerHTML = confirmed
        ? `<span class="lc-opt-pill"><i class="fas fa-check-circle"></i> Görevler Oluşturuldu</span>`
        : '';
    return confirmed;
}

function setSessionInputs(session) {
    $('lc-session-key').value         = session.key || '';
    const sub = $('lc-session-sub');
    if (sub) sub.textContent = session.title || '';
    $('lc-title').value               = session.title || '';
    $('lc-stock').value               = session.stock_length_mm ?? '';
    $('lc-kerf').value                = Number(session.kerf_mm ?? 0) || '';
    $('lc-notes').value               = session.notes || '';
    setConfirmState(session);
    updateStockBarsButton(session);
}

function showSessionArea(show) {
    $('lc-session-area').style.display  = show ? '' : 'none';
    $('lc-no-plan-state').style.display = show ? 'none' : '';
}

function updateStockBarsButton(session) {
    const btn = $('lc-stock-bars-btn');
    if (!btn) return;
    const bars = Array.isArray(session?.stock_bars) ? session.stock_bars : [];
    const totalDeclared = bars.reduce((acc, bar) => acc + (Number(bar?.quantity ?? 0) || 0), 0);
    const hasBars = bars.length > 0;
    btn.disabled = !hasBars;
    btn.innerHTML = `<i class="fas fa-bars-staggered me-1"></i>Stok Barlar${hasBars ? ` (${totalDeclared})` : ''}`;
}

// ─────────────────────────── PARTS TABLE ──────────────────────
function inputHtml({ rowId, field, type = 'text', value = '', placeholder = '', min = null, step = null }) {
    const minAttr = min !== null ? ` min="${min}"` : '';
    // Whole-millimetre fields carry step="1" so the browser rejects a decimal
    // before the request goes out (see INTEGER_MM_FIELDS).
    const stepAttr = step !== null ? ` step="${step}"`
        : (type === 'number' && INTEGER_MM_FIELDS.some(([f]) => f === field) ? ' step="1"' : '');
    return `<input class="form-control form-control-sm" style="min-width:60px"
        data-lc-row="${escapeAttr(rowId)}" data-lc-field="${escapeAttr(field)}"
        type="${type}" value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}"${minAttr}${stepAttr}>`;
}

function checkboxHtml({ rowId, field, checked = false, title = '' }) {
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
    return `<div class="text-center"><input class="form-check-input" type="checkbox"
        data-lc-row="${escapeAttr(rowId)}" data-lc-field="${escapeAttr(field)}"${checked ? ' checked' : ''}${titleAttr}></div>`;
}

function boolBadgeHtml(value) {
    return value
        ? '<div class="text-center text-success fw-bold">✓</div>'
        : '<div class="text-center text-muted">—</div>';
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
        <div id="lc-jobno-dd-${escapeAttr(rowId)}" style="min-width:120px;"></div>
    `;
}

function partItemDropdownHtml({ rowId, itemPk = '', itemText = '' }) {
    return `
        <input type="hidden" data-lc-row="${escapeAttr(rowId)}" data-lc-field="item" value="${escapeAttr(itemPk || '')}">
        <div id="lc-partitem-dd-${escapeAttr(rowId)}" style="min-width:160px;"></div>
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
            item: p.item ?? null,
            item_code: p.item_code ?? '',
            item_name: p.item_name ?? '',
            item_unit: p.item_unit ?? '',
            stock_length_mm: p.stock_length_mm ?? null,
            label: p.label ?? '',
            image_no: p.image_no ?? '',
            nominal_length_mm: p.nominal_length_mm ?? null,
            quantity: p.quantity ?? null,
            angle_left_deg: p.angle_left_deg ?? 0,
            angle_right_deg: p.angle_right_deg ?? 0,
            profile_height_mm: p.profile_height_mm ?? 0,
            setback_left_mm: p.setback_left_mm != null ? Number(p.setback_left_mm) : null,
            setback_right_mm: p.setback_right_mm != null ? Number(p.setback_right_mm) : null,
            allow_rotation: p.allow_rotation ?? true,
            requires_bending: p.requires_bending ?? false,
            job_no: p.job_no ?? '',
            order: p.order ?? null
        }));
}

// ───────────────── PART GEOMETRY (şekil + kenar ölçüsünden açı) ─────────────
// The drawing must always show what is on screen right now, so every read goes
// through the live input when the row is being edited and falls back to the
// row model otherwise.

const SIDES = [
    { side: 'left',  label: 'Sol', angleField: 'angle_left_deg',  setbackField: 'setback_left_mm' },
    { side: 'right', label: 'Sağ', angleField: 'angle_right_deg', setbackField: 'setback_right_mm' },
];

// Stored as IntegerField on LinearCuttingPart — a decimal here 400s.
// (nominal_length_mm is NOT one of these: cut lengths are fractional.)
const INTEGER_MM_FIELDS = [
    ['profile_height_mm', 'Kesit'],
    ['stock_length_mm', 'Stok boyu'],
    ['quantity', 'Adet'],
];

function rowInput(rowId, field) {
    return document.querySelector(
        `[data-lc-row="${CSS.escape(rowId)}"][data-lc-field="${CSS.escape(field)}"]`);
}

function liveValue(rowId, field, fallback = null) {
    const el = rowInput(rowId, field);
    if (!el) return fallback;
    const t = `${el.value ?? ''}`.trim();
    return t === '' ? null : castNumber(t, fallback);
}

function ownHeight(row) {
    return Number(liveValue(row.__rowId, 'profile_height_mm', row?.profile_height_mm)) || 0;
}

/** Kesit is a material property — a row with none inherits it from a sibling
 *  row of the same item, exactly as the backend does at optimize time. */
function effectiveHeight(row) {
    const own = ownHeight(row);
    if (own > 0) return own;
    if (row?.item == null) return 0;
    const sibling = partsTableRows.find(
        r => r !== row && Number(r.item) === Number(row.item) && ownHeight(r) > 0);
    return sibling ? ownHeight(sibling) : 0;
}

function shapeSpec(row) {
    return {
        nominal_length_mm: liveValue(row.__rowId, 'nominal_length_mm', row.nominal_length_mm),
        profile_height_mm: effectiveHeight(row),
        angle_left_deg: liveValue(row.__rowId, 'angle_left_deg', row.angle_left_deg) ?? 0,
        angle_right_deg: liveValue(row.__rowId, 'angle_right_deg', row.angle_right_deg) ?? 0,
    };
}

function round2(v) {
    return Math.round((Number(v) || 0) * 100) / 100;
}

function shapeCellHtml(row) {
    const open = expandedGeomRows.has(row.__rowId);
    const derived = row.setback_left_mm != null || row.setback_right_mm != null;
    return `<div class="text-center">
        <button type="button" class="lc-geom-toggle${open ? ' open' : ''}"
                data-lc-geom-toggle="${escapeAttr(row.__rowId)}"
                title="Ölçü panelini aç/kapat — resimde açı yerine köşe farkı verilmişse buradan girin">
            <span class="lc-shape" data-lc-shape="${escapeAttr(row.__rowId)}"
                  >${piecePictogramSVG(shapeSpec(row), { width: 116, height: 42 })}</span>
            <i class="fas fa-chevron-down lc-geom-caret"></i>
            ${derived ? '<i class="fas fa-ruler-combined lc-geom-flag" title="Açılar kenar ölçüsünden hesaplandı"></i>' : ''}
        </button>
    </div>`;
}

function geomReadoutHtml(row, side) {
    const cfg = SIDES.find(s => s.side === side);
    const h = effectiveHeight(row);
    const angle = liveValue(row.__rowId, cfg.angleField, row[cfg.angleField]) ?? 0;
    if (h <= 0) {
        return `<span class="text-warning-emphasis"><i class="fas fa-triangle-exclamation me-1"></i>Kesit girin</span>`;
    }
    if (Math.abs(angle) > MAX_ANGLE_DEG) {
        return `<span class="text-danger fw-semibold">${round2(angle)}° — en fazla ±${MAX_ANGLE_DEG}°</span>`;
    }
    return `<span class="fw-semibold">${formatAngleTr(angle)}</span>`;
}

function geomSideHtml(row, cfg, editable) {
    const rowId = row.__rowId;
    const h = effectiveHeight(row);
    const stored = row[cfg.setbackField];
    const hasStored = stored != null && `${stored}` !== '';
    const angle = Number(liveValue(rowId, cfg.angleField, row[cfg.angleField]) ?? 0);
    const magnitude = hasStored ? round2(Math.abs(Number(stored))) : '';
    const sign = hasStored
        ? (Number(stored) >= 0 ? 'near' : 'far')
        : (angle >= 0 ? 'near' : 'far');
    // With no stored measurement, show what the current angle works out to —
    // as a placeholder, so nothing is persisted unless it is actually typed.
    const equivalent = (!hasStored && h > 0 && Math.abs(angle) >= ANGLE_TOL_DEG)
        ? `≈ ${round2(Math.abs(setbackFromAngle(angle, h)))}` : '—';

    if (!editable) {
        return `<div class="lc-geom-side">
            <span class="lc-geom-side-label">${cfg.label} uç</span>
            <span class="lc-geom-static">${hasStored ? `${magnitude} mm · ${sign === 'near' ? 'alt uzun' : 'üst uzun'}` : `<span class="text-muted">açı doğrudan girilmiş</span>`}</span>
            <span class="lc-geom-arrow">→</span>
            <span data-lc-geom-out="${cfg.side}">${geomReadoutHtml(row, cfg.side)}</span>
        </div>`;
    }

    return `<div class="lc-geom-side">
        <span class="lc-geom-side-label">${cfg.label} uç</span>
        <input type="hidden" data-lc-row="${escapeAttr(rowId)}" data-lc-field="${cfg.setbackField}"
               value="${hasStored ? escapeAttr(stored) : ''}">
        <input class="form-control form-control-sm lc-geom-mag" type="number" min="0" step="0.01"
               data-lc-geom-mag="${cfg.side}" value="${escapeAttr(magnitude)}"
               placeholder="${escapeAttr(equivalent)}"
               title="Uçtaki iki köşe arasındaki boy farkı (mm) — açı = atan(fark ÷ kesit)">
        <select class="form-select form-select-sm lc-geom-sign" data-lc-geom-sign="${cfg.side}"
                title="Hangi kenar daha uzun kalıyor?">
            <option value="near"${sign === 'near' ? ' selected' : ''}>alt uzun</option>
            <option value="far"${sign === 'far' ? ' selected' : ''}>üst uzun</option>
        </select>
        <span class="lc-geom-arrow">→</span>
        <span data-lc-geom-out="${cfg.side}">${geomReadoutHtml(row, cfg.side)}</span>
    </div>`;
}

function geomPanelHtml(row) {
    const editable = isRowEditable(row);
    const h = effectiveHeight(row);
    const inherited = h > 0 && ownHeight(row) <= 0;
    return `
        <div class="lc-geom-panel">
            <div class="lc-geom-drawing" data-lc-geom-drawing
                >${piecePictogramSVG(shapeSpec(row), { width: 392, height: 136, dimensions: true })}</div>
            <div class="lc-geom-form">
                <div class="lc-geom-head">
                    <i class="fas fa-ruler-combined me-1"></i>Kenar ölçüsünden açı
                    <span class="lc-geom-kesit" data-lc-geom-height>${
                        h > 0
                            ? `Kesit: <strong>${round2(h)} mm</strong>${inherited ? ' <span class="text-muted">(malzemeden)</span>' : ''}`
                            : '<span class="text-warning-emphasis">Kesit (mm) girilmedi</span>'
                    }</span>
                </div>
                ${SIDES.map(cfg => geomSideHtml(row, cfg, editable)).join('')}
                <div class="lc-geom-hint">
                    Resimde açı yoksa, o uçtaki <strong>iki köşe arasındaki boy farkını</strong> girin —
                    açı kesitten hesaplanır ve şekil anında güncellenir. Açıyı doğrudan yazarsanız
                    buradaki ölçü temizlenir.
                </div>
            </div>
        </div>`;
}

function geomPanelEl(rowId) {
    return document.querySelector(`tr[data-lc-geom-row="${CSS.escape(rowId)}"]`);
}

/** Redraw everything derived from kesit / uzunluk / açılar for one row. */
function refreshRowGeometry(rowId) {
    const row = getRowModel(rowId);
    if (!row) return;
    const shapeEl = document.querySelector(`[data-lc-shape="${CSS.escape(rowId)}"]`);
    if (shapeEl) shapeEl.innerHTML = piecePictogramSVG(shapeSpec(row), { width: 116, height: 42 });

    const panel = geomPanelEl(rowId);
    if (!panel) return;
    const drawing = panel.querySelector('[data-lc-geom-drawing]');
    if (drawing) {
        drawing.innerHTML = piecePictogramSVG(shapeSpec(row), { width: 392, height: 136, dimensions: true });
    }
    SIDES.forEach(cfg => {
        const out = panel.querySelector(`[data-lc-geom-out="${cfg.side}"]`);
        if (out) out.innerHTML = geomReadoutHtml(row, cfg.side);
    });
    const hEl = panel.querySelector('[data-lc-geom-height]');
    if (hEl) {
        const h = effectiveHeight(row);
        const inherited = h > 0 && ownHeight(row) <= 0;
        hEl.innerHTML = h > 0
            ? `Kesit: <strong>${round2(h)} mm</strong>${inherited ? ' <span class="text-muted">(malzemeden)</span>' : ''}`
            : '<span class="text-warning-emphasis">Kesit (mm) girilmedi</span>';
    }
}

/** Corner offset → angle for one end of one part. */
function applyGeomSide(rowId, side) {
    const row = getRowModel(rowId);
    const cfg = SIDES.find(s => s.side === side);
    if (!row || !cfg) return;
    const panel = geomPanelEl(rowId);
    const magEl = panel?.querySelector(`[data-lc-geom-mag="${side}"]`);
    const signEl = panel?.querySelector(`[data-lc-geom-sign="${side}"]`);
    const hidden = rowInput(rowId, cfg.setbackField);
    const angleInput = rowInput(rowId, cfg.angleField);

    const raw = `${magEl?.value ?? ''}`.trim();
    if (raw === '') {
        if (hidden) hidden.value = '';
        row[cfg.setbackField] = null;
        refreshRowGeometry(rowId);
        return;
    }

    // Stored at 0.01 mm — round here so the angle shown is the one the
    // backend re-derives from the saved measurement.
    const h = effectiveHeight(row);
    const signed = round2(Math.abs(castNumber(raw, 0)) * (signEl?.value === 'far' ? -1 : 1));
    if (hidden) hidden.value = String(signed);
    row[cfg.setbackField] = signed;

    const angle = angleFromSetback(signed, h);
    if (angle != null) {
        const rounded = round2(angle);
        row[cfg.angleField] = rounded;
        if (angleInput) angleInput.value = rounded;
    }
    refreshRowGeometry(rowId);
}

/** A hand-typed angle drops the measurement it no longer matches. */
function clearGeomSide(rowId, side) {
    const row = getRowModel(rowId);
    const cfg = SIDES.find(s => s.side === side);
    if (!row || !cfg) return;
    const hidden = rowInput(rowId, cfg.setbackField);
    if (hidden) hidden.value = '';
    row[cfg.setbackField] = null;
    const magEl = geomPanelEl(rowId)?.querySelector(`[data-lc-geom-mag="${side}"]`);
    if (magEl) magEl.value = '';
}

/** Kesit changed → every angle derived from a measurement on that row moves. */
function reapplyGeomForRow(rowId) {
    const row = getRowModel(rowId);
    if (!row) return;
    SIDES.forEach(cfg => {
        if (row[cfg.setbackField] == null) return;
        const angle = angleFromSetback(row[cfg.setbackField], effectiveHeight(row));
        if (angle == null) return;
        const rounded = round2(angle);
        row[cfg.angleField] = rounded;
        const angleInput = rowInput(rowId, cfg.angleField);
        if (angleInput) angleInput.value = rounded;
    });
    refreshRowGeometry(rowId);
    // Rows that borrow this material's kesit are drawn from it too.
    if (row.item != null) {
        partsTableRows
            .filter(r => r !== row && Number(r.item) === Number(row.item) && ownHeight(r) <= 0)
            .forEach(r => refreshRowGeometry(r.__rowId));
    }
}

/** Keep the open panels attached under their row across table re-renders. */
function syncGeomPanels() {
    document.querySelectorAll('tr[data-lc-geom-row]').forEach(tr => {
        const rowId = tr.getAttribute('data-lc-geom-row');
        if (!expandedGeomRows.has(rowId) || !getRowModel(rowId)) tr.remove();
    });

    [...expandedGeomRows].forEach(rowId => {
        const row = getRowModel(rowId);
        if (!row) { expandedGeomRows.delete(rowId); return; }
        const toggle = document.querySelector(`[data-lc-geom-toggle="${CSS.escape(rowId)}"]`);
        const hostTr = toggle?.closest('tr');
        if (!hostTr) return;

        const existing = geomPanelEl(rowId);
        // Already in place — leave it alone so in-progress typing survives.
        if (existing && existing.previousElementSibling === hostTr) return;
        existing?.remove();

        const panelTr = document.createElement('tr');
        panelTr.className = 'lc-geom-row';
        panelTr.setAttribute('data-lc-geom-row', rowId);
        panelTr.innerHTML =
            `<td colspan="${hostTr.children.length}" class="lc-geom-cell">${geomPanelHtml(row)}</td>`;
        hostTr.after(panelTr);
    });
}

function renderPartsTable() {
    const columns = [
        {
            key: 'order', label: '<div class="text-center">#</div>', sortable: false, width: '52px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'order', type: 'number', value: row.order ?? '', min: 0 })
                : `<div class="text-center text-muted fw-bold">${row.order ?? '—'}</div>`
        },
        {
            key: 'job_no', label: 'İş No', sortable: false, width: '120px',
            formatter: (v, row) => isRowEditable(row)
                ? jobNoDropdownHtml({ rowId: row.__rowId, value: row.job_no ?? '' })
                : (row.job_no
                    ? `<div class="text-truncate" style="max-width:120px;" title="${escapeAttr(row.job_no)}"><span class="fw-semibold">${escapeAttr(row.job_no)}</span></div>`
                    : '<span class="text-muted">—</span>')
        },
        {
            key: 'item', label: 'Malzeme', sortable: false, width: '170px',
            formatter: (v, row) => {
                // Title first, then code — the title is what people recognize.
                const serverTxt = [row.item_name, row.item_code].filter(Boolean).join(' — ') + (row.item_unit ? ` (${row.item_unit})` : '');
                const txt = serverTxt || row.item_display || '';
                if (isRowEditable(row)) {
                    return partItemDropdownHtml({
                        rowId: row.__rowId,
                        itemPk: row.item != null ? String(row.item) : '',
                        itemText: txt
                    });
                }
                if (txt.trim()) return `<div class="text-truncate" style="max-width:170px;" title="${escapeAttr(txt)}">${escapeAttr(txt)}</div>`;
                return '<span class="text-muted">—</span>';
            }
        },
        {
            key: 'profile_height_mm',
            label: '<div class="text-center"><span title="Malzemenin açı düzlemindeki kesit ölçüsü: boru için dış çap, kutu profil için açı yönündeki kenar. Malzeme başına BİR satırda girilmesi yeterli — aynı malzemenin diğer satırlarına otomatik uygulanır. Düz kesimlerde gerekmez.">Kesit (mm)</span></div>',
            sortable: false, width: '90px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'profile_height_mm', type: 'number', value: row.profile_height_mm ?? 0, min: 0 })
                : (row.profile_height_mm ? `<div class="text-center">${row.profile_height_mm}</div>` : '<div class="text-center text-muted">—</div>')
        },
        {
            key: 'label', label: 'Parça Adı', sortable: false, width: '150px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'label', value: row.label, placeholder: 'Parça adı' })
                : (row.label
                    ? `<div class="text-truncate" style="max-width:150px;" title="${escapeAttr(row.label)}">${escapeAttr(row.label)}</div>`
                    : '<span class="text-muted">—</span>')
        },
        {
            key: 'image_no', label: 'Resim No', sortable: false, width: '120px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'image_no', value: row.image_no ?? '', placeholder: 'Resim no' })
                : (row.image_no
                    ? `<div class="text-truncate" style="max-width:120px;" title="${escapeAttr(row.image_no)}">${escapeAttr(row.image_no)}</div>`
                    : '<span class="text-muted">—</span>')
        },
        {
            key: 'stock_length_mm',
            label: stockColExpanded
                ? `<div class="text-center">Stok (mm) <button class="btn btn-link btn-sm p-0 ms-1 align-baseline" data-lc-toggle-stock
                       title="Sütunu daralt"><i class="fas fa-compress"></i></button></div>`
                : `<div class="text-center"><button class="btn btn-link btn-sm p-0" data-lc-toggle-stock
                       title="Stok boyu (mm) sütununu genişlet — özel durumlarda bar boyu satır bazında değiştirilebilir"><i class="fas fa-ruler-horizontal"></i></button></div>`,
            sortable: false, width: stockColExpanded ? '110px' : '40px',
            formatter: (v, row) => {
                if (!stockColExpanded) {
                    return row.stock_length_mm != null
                        ? `<div class="text-center small" title="Stok boyu: ${row.stock_length_mm} mm">${row.stock_length_mm}</div>`
                        : '<div class="text-center text-muted">·</div>';
                }
                const ph = currentSession?.stock_length_mm ? `Varsayılan: ${currentSession.stock_length_mm}` : '';
                return isRowEditable(row)
                    ? inputHtml({ rowId: row.__rowId, field: 'stock_length_mm', type: 'number', value: row.stock_length_mm ?? '', placeholder: ph, min: 0 })
                    : (row.stock_length_mm != null ? `<div class="text-center">${row.stock_length_mm}</div>` : '<div class="text-center text-muted">—</div>');
            }
        },
        {
            key: 'nominal_length_mm', label: '<div class="text-center">Uzunluk (mm)</div>', sortable: false, width: '120px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'nominal_length_mm', type: 'number', value: row.nominal_length_mm ?? '', min: 0, step: '0.01' })
                : (row.nominal_length_mm != null ? `<div class="text-center fw-bold">${row.nominal_length_mm}</div>` : '<div class="text-center">—</div>')
        },
        {
            key: 'quantity', label: '<div class="text-center">Adet</div>', sortable: false, width: '80px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'quantity', type: 'number', value: row.quantity ?? '', min: 1 })
                : (row.quantity != null ? `<div class="text-center">${row.quantity}</div>` : '<div class="text-center">—</div>')
        },
        {
            key: 'angle_left_deg', label: '<div class="text-center">Sol Açı</div>', sortable: false, width: '90px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'angle_left_deg', type: 'number', value: row.angle_left_deg ?? 0 })
                : `<div class="text-center">${formatAngleTr(row.angle_left_deg)}</div>`
        },
        {
            key: 'angle_right_deg', label: '<div class="text-center">Sağ Açı</div>', sortable: false, width: '90px',
            formatter: (v, row) => isRowEditable(row)
                ? inputHtml({ rowId: row.__rowId, field: 'angle_right_deg', type: 'number', value: row.angle_right_deg ?? 0 })
                : `<div class="text-center">${formatAngleTr(row.angle_right_deg)}</div>`
        },
        {
            key: 'shape',
            label: '<div class="text-center"><span title="Parçanın ölçekli görünümü — açılar birebir, boy kesite göre ölçekli. Tıklayınca kenar ölçüsü paneli açılır.">Şekil</span></div>',
            sortable: false, width: '132px',
            formatter: (v, row) => shapeCellHtml(row)
        },
        {
            key: 'allow_rotation',
            label: '<div class="text-center"><span title="Döndür — optimizasyon parçayı 180° döndürerek ortak kesim oluşturabilir. Simetrik profillerde açık bırakın."><i class="fas fa-arrows-rotate"></i></span></div>',
            sortable: false, width: '44px',
            formatter: (v, row) => isRowEditable(row)
                ? checkboxHtml({ rowId: row.__rowId, field: 'allow_rotation', checked: row.allow_rotation ?? true, title: 'Döndür — optimizasyon parçayı 180° döndürerek ortak kesim oluşturabilir' })
                : boolBadgeHtml(row.allow_rotation ?? true)
        },
        {
            key: 'requires_bending',
            label: '<div class="text-center"><span title="Büküm — parça kesimden sonra bükülür; boy olarak açınım (düz) boyu girilmelidir."><i class="fas fa-wave-square"></i></span></div>',
            sortable: false, width: '44px',
            formatter: (v, row) => isRowEditable(row)
                ? checkboxHtml({ rowId: row.__rowId, field: 'requires_bending', checked: row.requires_bending ?? false, title: 'Büküm — parça kesimden sonra bükülür; boy olarak açınım (düz) boyu girilmelidir' })
                : boolBadgeHtml(row.requires_bending ?? false)
        },
        {
            key: 'actions', label: '', sortable: false, width: '100px',
            formatter: (v, row) => {
                if (!row.id) {
                    return `<div class="d-flex gap-1 justify-content-start flex-nowrap">
                        <button class="btn btn-sm btn-outline-secondary" data-lc-dup-row="${row.__rowId}" title="Kopyala">
                            <i class="fas fa-clone"></i></button>
                        <button class="btn btn-sm btn-outline-danger" data-lc-remove-new-row="${row.__rowId}" title="Satırı Kaldır">
                            <i class="fas fa-trash"></i></button>
                    </div>`;
                }
                if (isRowEditing(row)) {
                    return `<div class="d-flex gap-1 justify-content-start flex-nowrap">
                        <button class="btn btn-sm btn-success" data-lc-save-row="${row.__rowId}" title="Kaydet">
                            <i class="fas fa-check"></i></button>
                        <button class="btn btn-sm btn-outline-secondary" data-lc-cancel-row="${row.__rowId}" title="İptal">
                            <i class="fas fa-times"></i></button>
                    </div>`;
                }
                return `<div class="d-flex gap-1 justify-content-start flex-nowrap">
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
    inputs.forEach(inp => {
        const field = inp.getAttribute('data-lc-field');
        data[field] = (inp.type === 'checkbox') ? inp.checked : inp.value;
    });
    return data;
}

function getRowModel(rowId) {
    return partsTableRows.find(r => r.__rowId === rowId) || null;
}

function mergeRowFromDom(rowId) {
    const row = getRowModel(rowId);
    if (!row) return;
    const raw = readRowInputs(rowId);
    if (raw.job_no != null) row.job_no = raw.job_no;
    if (raw.item != null) row.item = raw.item ? Number(raw.item) : null;
    if (raw.stock_length_mm != null) {
        row.stock_length_mm = (`${raw.stock_length_mm}`.trim() === '') ? null : castNumber(raw.stock_length_mm, null);
    }
    if (raw.label != null) row.label = raw.label;
    if (raw.image_no != null) row.image_no = raw.image_no;
    if (raw.nominal_length_mm != null) row.nominal_length_mm = castNumber(raw.nominal_length_mm, row.nominal_length_mm);
    if (raw.quantity != null) row.quantity = castNumber(raw.quantity, row.quantity);
    if (raw.angle_left_deg != null) row.angle_left_deg = castNumber(raw.angle_left_deg, row.angle_left_deg);
    if (raw.angle_right_deg != null) row.angle_right_deg = castNumber(raw.angle_right_deg, row.angle_right_deg);
    if (raw.profile_height_mm != null) row.profile_height_mm = castNumber(raw.profile_height_mm, row.profile_height_mm);
    SIDES.forEach(cfg => {
        if (raw[cfg.setbackField] == null) return;
        row[cfg.setbackField] = (`${raw[cfg.setbackField]}`.trim() === '')
            ? null : castNumber(raw[cfg.setbackField], null);
    });
    if (raw.allow_rotation != null) row.allow_rotation = !!raw.allow_rotation;
    if (raw.requires_bending != null) row.requires_bending = !!raw.requires_bending;
    if (raw.order != null) row.order = castNumber(raw.order, row.order);

    // Capture dropdown display texts (so rerenders/duplication preserve visuals)
    const itemDd = document.getElementById(`lc-partitem-dd-${rowId}`);
    const itemTxt = itemDd?.querySelector?.('.selected-text')?.textContent?.trim();
    if (itemTxt) row.item_display = itemTxt;

    const jobDd = document.getElementById(`lc-jobno-dd-${rowId}`);
    const jobTxt = jobDd?.querySelector?.('.selected-text')?.textContent?.trim();
    if (jobTxt && jobTxt !== 'İş no seçin…') row.job_no_display = jobTxt;
}

function mergeAllEditableRowsFromDom() {
    // Persist in-progress user input before any re-render that would replace DOM.
    try {
        partsTableRows
            .filter(isRowEditable)
            .forEach(r => mergeRowFromDom(r.__rowId));
    } catch { /* ignore */ }
}

function buildPartPayloadFromRowId(rowId) {
    const raw = readRowInputs(rowId);
    const row = getRowModel(rowId) || {};
    const stockOverride = `${raw.stock_length_mm ?? ''}`.trim();
    // The setback inputs only exist while the panel is open — fall back to the
    // model so collapsing the panel never wipes a stored measurement. Sending
    // an explicit null is what tells the backend the angle was typed by hand.
    const setback = (field) => {
        if (raw[field] == null) return row[field] ?? null;
        const t = `${raw[field]}`.trim();
        return t === '' ? null : castNumber(t, null);
    };
    return {
        session: currentSessionKey,
        item: raw.item ? Number(raw.item) : null,
        stock_length_mm: stockOverride === '' ? null : castNumber(stockOverride, null),
        label: raw.label || '',
        image_no: `${raw.image_no ?? ''}`.trim(),
        job_no: raw.job_no || '',
        nominal_length_mm: castNumber(raw.nominal_length_mm, 0),
        quantity: castNumber(raw.quantity, 1),
        angle_left_deg: castNumber(raw.angle_left_deg, 0),
        angle_right_deg: castNumber(raw.angle_right_deg, 0),
        profile_height_mm: castNumber(raw.profile_height_mm, 0),
        setback_left_mm: setback('setback_left_mm'),
        setback_right_mm: setback('setback_right_mm'),
        allow_rotation: (raw.allow_rotation != null) ? !!raw.allow_rotation : true,
        requires_bending: (raw.requires_bending != null) ? !!raw.requires_bending : false,
        order: castNumber(raw.order, 1)
    };
}

function validatePartPayload(payload, rowLabelForError = '') {
    const prefix = rowLabelForError ? `${rowLabelForError}: ` : '';
    if (!payload.item) {
        showNotification(`${prefix}Malzeme seçilmelidir.`, 'warning');
        return false;
    }
    if (!(payload.nominal_length_mm > 0) || !(payload.quantity > 0)) {
        showNotification(`${prefix}Uzunluk ve Adet sıfırdan büyük olmalı.`, 'warning');
        return false;
    }
    // These are whole millimetres in the model; catch it here rather than
    // letting DRF answer with "A valid integer is required."
    for (const [field, label] of INTEGER_MM_FIELDS) {
        const v = payload[field];
        if (v == null || Number.isInteger(v)) continue;
        showNotification(
            `${prefix}${label} tam sayı (mm) olmalı — ${v} yerine ${Math.round(v)} girin.`,
            'warning');
        return false;
    }
    // Geometry that cannot be cut is rejected by the optimizer anyway; say so
    // at save time, while the drawing that shows it is still on screen.
    if (payload.profile_height_mm > 0) {
        const h = payload.profile_height_mm;
        const tL = Math.abs(setbackFromAngle(payload.angle_left_deg, h));
        const tR = Math.abs(setbackFromAngle(payload.angle_right_deg, h));
        const needed = Math.max(
            (payload.angle_left_deg < 0 ? tL : 0) + (payload.angle_right_deg < 0 ? tR : 0),
            (payload.angle_left_deg > 0 ? tL : 0) + (payload.angle_right_deg > 0 ? tR : 0),
        );
        if (payload.nominal_length_mm < needed) {
            showNotification(
                `${prefix}Açılar bu boya sığmıyor — ${h} mm kesitte bu açılar için `
                + `en az ${round2(needed)} mm gerekir (girilen: ${payload.nominal_length_mm} mm).`,
                'warning');
            return false;
        }
    }
    for (const cfg of SIDES) {
        const ang = Number(payload[cfg.angleField]) || 0;
        if (Math.abs(ang) > MAX_ANGLE_DEG) {
            showNotification(
                `${prefix}${cfg.label} açı ${round2(ang)}° — en fazla ±${MAX_ANGLE_DEG}° olabilir.`
                + (payload[cfg.setbackField] != null
                    ? ' Köşe farkı kesite göre çok büyük.' : ''),
                'warning');
            return false;
        }
    }
    if ((payload.angle_left_deg || payload.angle_right_deg) && !(payload.profile_height_mm > 0)) {
        // Profile size is a material property: entering it once on ANY row of
        // the same material is enough (the backend inherits it).
        const siblingHasHeight = partsTableRows.some(r =>
            r.item != null && Number(r.item) === Number(payload.item)
            && Number(r.profile_height_mm) > 0);
        if (!siblingHasHeight) {
            showNotification(`${prefix}Açılı kesim için Kesit (mm) girin — malzeme başına bir satırda girilmesi yeterlidir.`, 'warning');
            return false;
        }
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

function destroyPartItemDropdown(rowId) {
    const dd = partItemDropdowns.get(rowId);
    if (dd) {
        try { dd.destroy?.(); } catch { /* ignore */ }
        partItemDropdowns.delete(rowId);
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
        const rowModel = getRowModel(rowId);
        const seedText = rowModel?.job_no_display || currentValue;

        const dropdown = new ModernDropdown(container, {
            placeholder: 'İş no seçin…',
            searchable: true,
            menuMinWidth: 280,
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
            dropdown.setItems([{ value: currentValue, text: seedText || currentValue }]);
            dropdown.setValue(currentValue);
        } else {
            dropdown.setItems([]);
        }

        container.addEventListener('dropdown:select', (e) => {
            const val = e.detail?.value ?? '';
            if (hidden) hidden.value = val;
            const row = getRowModel(rowId);
            if (row) {
                row.job_no = val;
                const txt = e.detail?.item?.text;
                if (txt) row.job_no_display = txt;
            }
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
            syncPartItemDropdowns();
            syncGeomPanels();
        });
    });
}

function syncPartItemDropdowns() {
    const editableRowIds = new Set(
        partsTableRows.filter(isRowEditable).map(r => r.__rowId)
    );

    [...partItemDropdowns.keys()].forEach(rowId => {
        if (!editableRowIds.has(rowId)) destroyPartItemDropdown(rowId);
    });

    editableRowIds.forEach(rowId => {
        const container = document.getElementById(`lc-partitem-dd-${rowId}`);
        if (!container) {
            destroyPartItemDropdown(rowId);
            return;
        }
        if (partItemDropdowns.has(rowId)) {
            const hasUi = !!container.querySelector('.modern-dropdown');
            if (hasUi) return;
            destroyPartItemDropdown(rowId);
        }

        const hidden = document.querySelector(`[data-lc-row="${CSS.escape(rowId)}"][data-lc-field="item"]`);
        const currentValue = hidden?.value || '';
        const rowModel = getRowModel(rowId);
        const seedText = rowModel?.item_display || rowModel?.item_name || rowModel?.item_code || '';

        const dropdown = new ModernDropdown(container, {
            placeholder: 'Malzeme seçin…',
            searchable: true,
            menuMinWidth: 560,
            remoteSearch: async (term) => {
                const t = (term || '').trim();
                if (t.length < 2) return [];
                const data = await searchItemsBySearch(t, { page_size: 20, item_type: 'stock' });
                const items = normalizePaginated(data);
                return items.map(it => ({
                    value: it.id,
                    // Title first — that is what people recognize; code after.
                    text: `${it.item_name || it.name || '-'} — ${it.item_code || it.code || '-'}${it.item_unit || it.unit ? ` • ${it.item_unit || it.unit}` : ''}`
                }));
            },
            minSearchLength: 2,
            remoteSearchPlaceholder: 'En az 2 karakter yazın'
        });

        if (currentValue) {
            dropdown.setItems([{ value: currentValue, text: seedText || currentValue }]);
            dropdown.setValue(currentValue);
        } else {
            dropdown.setItems([]);
        }

        container.addEventListener('dropdown:select', (e) => {
            const val = e.detail?.value ?? '';
            if (hidden) hidden.value = val;
            const row = getRowModel(rowId);
            if (row) {
                row.item = val ? Number(val) : null;
                row.item_display = e.detail?.item?.text || row.item_display || '';
                // Profile size is a material property — inherit it from any
                // sibling row of the same material so it is entered only once.
                if (row.item != null && !(Number(row.profile_height_mm) > 0)) {
                    const sibling = partsTableRows.find(r =>
                        r !== row && Number(r.item) === row.item
                        && Number(r.profile_height_mm) > 0);
                    if (sibling) {
                        row.profile_height_mm = sibling.profile_height_mm;
                        const hInput = document.querySelector(
                            `[data-lc-row="${CSS.escape(rowId)}"][data-lc-field="profile_height_mm"]`);
                        if (hInput && !(Number(hInput.value) > 0)) {
                            hInput.value = sibling.profile_height_mm;
                        }
                    }
                }
                // Kesit was set programmatically, so no input event fires —
                // redraw here or the şekil keeps the old (or missing) kesit.
                reapplyGeomForRow(rowId);
            }
        });

        partItemDropdowns.set(rowId, dropdown);
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
    mergeAllEditableRowsFromDom();
    const row = partsTableRows.find(r => r.__rowId === rowId);
    if (!row) return;
    if (!row.id) {
        expandedGeomRows.delete(rowId);
        partsTableRows = partsTableRows.filter(r => r.__rowId !== rowId);
    }
    inlineEditRowId = null;
    renderPartsTable();
}

function addNewPartRow() {
    if (!currentSessionKey) { showNotification('Önce bir plan seçin.', 'warning'); return; }
    mergeAllEditableRowsFromDom();
    const tempId    = makeNewRowId();
    const nextOrder = (Math.max(0, ...partsTableRows.filter(r => r.order != null).map(r => Number(r.order) || 0)) + 1) || 1;
    partsTableRows  = [{
        __rowId: tempId,
        id: null,
        item: null,
        item_code: '',
        item_name: '',
        item_unit: '',
        stock_length_mm: null,
        label: '',
        image_no: '',
        nominal_length_mm: null,
        quantity: 1,
        angle_left_deg: 0,
        angle_right_deg: 0,
        profile_height_mm: 0,
        setback_left_mm: null,
        setback_right_mm: null,
        allow_rotation: true,
        requires_bending: false,
        job_no: '',
        order: nextOrder
    }, ...partsTableRows];
    renderPartsTable();
    $('lc-parts-table')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function duplicateRow(rowId) {
    const row = partsTableRows.find(r => r.__rowId === rowId);
    if (!row) return;
    if (!currentSessionKey) { showNotification('Önce bir plan seçin.', 'warning'); return; }

    // Persist any in-progress edits before copying/rerendering
    mergeAllEditableRowsFromDom();

    const tempId    = makeNewRowId();
    const nextOrder = (Math.max(0, ...partsTableRows.filter(r => r.order != null).map(r => Number(r.order) || 0)) + 1) || 1;
    partsTableRows  = [{
        __rowId: tempId,
        id: null,
        item: row.item ?? null,
        item_code: row.item_code ?? '',
        item_name: row.item_name ?? '',
        item_unit: row.item_unit ?? '',
        item_display: row.item_display ?? '',
        stock_length_mm: row.stock_length_mm ?? null,
        label: row.label ?? '',
        image_no: row.image_no ?? '',
        nominal_length_mm: row.nominal_length_mm ?? null,
        quantity: row.quantity ?? 1,
        angle_left_deg: row.angle_left_deg ?? 0,
        angle_right_deg: row.angle_right_deg ?? 0,
        profile_height_mm: row.profile_height_mm ?? 0,
        setback_left_mm: row.setback_left_mm ?? null,
        setback_right_mm: row.setback_right_mm ?? null,
        allow_rotation: row.allow_rotation ?? true,
        requires_bending: row.requires_bending ?? false,
        job_no: row.job_no ?? '',
        job_no_display: row.job_no_display ?? '',
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
const barCanvasDrawMap = new WeakMap(); // canvas -> { bar, kerfMm, referenceStockMm }

function scheduleDrawBar(canvas, tooltipEl) {
    const payload = barCanvasDrawMap.get(canvas);
    if (!payload) return;
    let tries = 0;
    const run = () => {
        const w = canvas.clientWidth || canvas.getBoundingClientRect?.().width || 0;
        if (w < 50 && tries < 10) {
            tries += 1;
            requestAnimationFrame(run);
            return;
        }
        drawBarCanvas(canvas, payload.bar, {
            kerfMm: payload.kerfMm,
            referenceStockMm: payload.referenceStockMm,
            tooltipEl
        });
    };
    requestAnimationFrame(run);
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

    // Data-quality warnings from the backend (e.g. implausible Profil (mm))
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    if (warnings.length) {
        const warnBox = document.createElement('div');
        warnBox.className = 'alert alert-warning py-2 mb-3';
        warnBox.innerHTML = warnings.map(w =>
            `<div><i class="fas fa-triangle-exclamation me-1"></i>${escapeAttr(w)}</div>`
        ).join('');
        barsEl.appendChild(warnBox);
        warnings.forEach(w => showNotification(w, 'warning'));
    }

    const groups = Array.isArray(result.groups) ? result.groups : [];
    const totalBarsNeeded = groups.reduce((s, g) => s + (Number(g.bars_needed ?? 0) || 0), 0);
    const totalWaste = groups.reduce((s, g) => s + (Number(g.total_waste_mm ?? 0) || 0), 0);
    const effValues = groups.map(g => Number(g.efficiency_pct)).filter(v => Number.isFinite(v));
    const avgEff = effValues.length ? Math.round((effValues.reduce((a, b) => a + b, 0) / effValues.length) * 10) / 10 : null;

    if (summaryEl) {
        summaryEl.className = 'lc-opt-summary';
        summaryEl.innerHTML = `
            <div class="lc-opt-metric">
                <div class="k"><i class="fas fa-ruler-horizontal text-primary"></i> Bar Sayısı</div>
                <div class="v">${totalBarsNeeded || '—'}</div>
                <div class="s">${groups.length ? `${groups.length} profil grubu` : '—'}</div>
            </div>
            <div class="lc-opt-metric">
                <div class="k"><i class="fas fa-chart-line text-success"></i> Verim</div>
                <div class="v">${avgEff != null ? `${avgEff}%` : '—'}</div>
                <div class="s">Gruplar ortalaması</div>
            </div>
            <div class="lc-opt-metric">
                <div class="k"><i class="fas fa-trash-alt text-warning"></i> Toplam Fire</div>
                <div class="v">${groups.length ? `${totalWaste} mm` : '—'}</div>
                <div class="s">Tüm profiller</div>
            </div>
        `;
    }

    if (!groups.length) {
        barsEl.innerHTML = `<div class="lc-empty-state">
            <i class="fas fa-inbox"></i>
            <p>Optimizasyon sonucu boş döndü.</p>
        </div>`;
        return;
    }

    // Tabs per group
    const tabsId = `lc-opt-tabs-${Date.now()}`;
    const frame = document.createElement('div');
    frame.className = 'lc-opt-tabs-frame';

    const nav = document.createElement('ul');
    nav.className = 'nav nav-tabs lc-opt-tabs';
    nav.id = `${tabsId}-nav`;
    nav.setAttribute('role', 'tablist');

    const content = document.createElement('div');
    content.className = 'tab-content';
    content.id = `${tabsId}-content`;

    groups.forEach((g, idx) => {
        const gid = `${tabsId}-g-${idx}`;
        const label = (g.item_name || g.item_code || `Grup ${idx + 1}`).toString();
        const pill = document.createElement('li');
        pill.className = 'nav-item';
        pill.setAttribute('role', 'presentation');
        pill.innerHTML = `
            <button class="nav-link ${idx === 0 ? 'active' : ''}" id="${gid}-tab"
                    data-bs-toggle="tab" data-bs-target="#${gid}" type="button" role="tab"
                    aria-controls="${gid}" aria-selected="${idx === 0 ? 'true' : 'false'}">
                ${escapeAttr(label)}
            </button>
        `;
        nav.appendChild(pill);

        const pane = document.createElement('div');
        pane.className = `tab-pane fade ${idx === 0 ? 'show active' : ''}`;
        pane.id = gid;
        pane.setAttribute('role', 'tabpanel');
        pane.setAttribute('aria-labelledby', `${gid}-tab`);

        const groupKerf = Number(g.kerf_mm ?? 0) || 0;
        const groupStock = Number(g.stock_length_mm ?? 0) || 0;
        const groupBars = Array.isArray(g.bars) ? g.bars : [];
        const maxStockInGroup = Math.max(
            1,
            ...groupBars.map(b => Number(b?.stock_length_mm ?? groupStock ?? 0) || 0)
        );

        pane.innerHTML = `
            <div class="mb-3">
                <div class="d-flex flex-wrap gap-2 align-items-center">
                    <span class="badge bg-light text-dark border">
                        <i class="fas fa-ruler-horizontal me-1 text-muted"></i>${groupStock || '—'} mm
                    </span>
                    <span class="badge bg-light text-dark border">
                        <i class="fas fa-cut me-1 text-muted"></i>Kerf ${groupKerf}
                    </span>
                    <span class="badge bg-light text-dark border">
                        <i class="fas fa-layer-group me-1 text-muted"></i>${g.bars_needed ?? '—'} bar
                    </span>
                    <span class="badge bg-light text-dark border">
                        <i class="fas fa-chart-line me-1 text-muted"></i>${g.efficiency_pct != null ? `${g.efficiency_pct}%` : '—'}
                    </span>
                    <span class="badge bg-light text-dark border">
                        <i class="fas fa-trash-alt me-1 text-muted"></i>${g.total_waste_mm ?? '—'} mm fire
                    </span>
                    ${g.total_pass_count != null ? `
                    <span class="badge bg-light text-dark border">
                        <i class="fas fa-list-ol me-1 text-muted"></i>${g.total_pass_count} kesim
                    </span>` : ''}
                    ${(Number(g.material_saved_by_nesting_mm) || 0) > 0 ? `
                    <span class="badge bg-light text-dark border">
                        <i class="fas fa-compress-arrows-alt me-1 text-success"></i>Ortak kesim kazancı: ${g.material_saved_by_nesting_mm} mm
                    </span>` : ''}
                </div>
                <div class="text-muted mt-2" style="font-size:.9rem;">
                    ${escapeAttr(g.item_name || '')}
                </div>
            </div>
        `;

        const list = document.createElement('div');
        list.className = 'lc-opt-bars';
        pane.appendChild(list);

        groupBars.forEach(bar => {
            const stock = Number(bar.stock_length_mm ?? groupStock ?? 0) || 0;
            const wasteMm = Number(bar.waste_mm ?? 0) || 0;
            const cutsCount = Array.isArray(bar.cuts) ? bar.cuts.length : 0;
            const displayBarNo = bar.global_bar_index ?? bar.bar_index;
            const isRemnant = !!bar.is_remnant;
            const remnantBadge = isRemnant
                ? `<span class="lc-bar-badge lc-bar-badge-remnant">
                        <i class="fas fa-recycle me-1"></i>Stoktan
                   </span>`
                : '';

            const card = document.createElement('div');
            card.className = 'lc-bar-card';
            card.innerHTML = `
                <div class="head">
                    <div class="title">
                        <i class="fas fa-grip-lines-vertical text-primary"></i>
                        Bar #${displayBarNo}
                    </div>
                    <div class="meta">
                        ${remnantBadge}
                        <span><i class="fas fa-cut text-muted me-1"></i>${cutsCount} kesim</span>
                        <span><i class="fas fa-ruler-horizontal text-muted me-1"></i>${stock} mm</span>
                        <span><i class="fas fa-trash-alt text-muted me-1"></i>${wasteMm} mm fire</span>
                    </div>
                </div>
                <div class="body"></div>
            `;
            const body = card.querySelector('.body');
            const canvasWrap = document.createElement('div');
            canvasWrap.className = 'lc-canvas-wrap';
            const canvas = document.createElement('canvas');
            canvas.style.width = '100%';
            canvasWrap.appendChild(canvas);
            body.appendChild(canvasWrap);

            // Pass table (operator contract) — collapsed by default
            const passes = Array.isArray(bar.passes) ? bar.passes : [];
            if (passes.length) {
                const passToggle = document.createElement('button');
                passToggle.type = 'button';
                passToggle.className = 'btn btn-sm btn-outline-secondary lc-pass-toggle';
                passToggle.innerHTML = `<i class="fas fa-list-ol me-1"></i>Kesim sırası (${passes.length})`;
                const passWrap = document.createElement('div');
                passWrap.className = 'lc-pass-table-wrap mt-2';
                passWrap.style.display = 'none';
                passWrap.innerHTML = buildPassTableHtml(passes);
                passToggle.addEventListener('click', () => {
                    const hidden = passWrap.style.display === 'none';
                    passWrap.style.display = hidden ? '' : 'none';
                    passToggle.classList.toggle('active', hidden);
                });
                body.appendChild(passToggle);
                body.appendChild(passWrap);
            }

            list.appendChild(card);
            barCanvasDrawMap.set(canvas, { bar, kerfMm: groupKerf, referenceStockMm: maxStockInGroup });
            // Only draw immediately for the initially visible (active) group
            if (idx === 0) {
                scheduleDrawBar(canvas, tooltipEl);
            }
        });

        content.appendChild(pane);
    });

    frame.appendChild(nav);
    frame.appendChild(content);
    barsEl.appendChild(frame);

    // Draw canvases only when their tab becomes visible (prevents blur/distortion)
    setTimeout(() => {
        try {
            frame.querySelectorAll('button[data-bs-toggle="tab"]').forEach(btn => {
                btn.addEventListener('shown.bs.tab', (e) => {
                    const targetSel = e.target?.getAttribute?.('data-bs-target');
                    const pane = targetSel ? document.querySelector(targetSel) : null;
                    if (!pane) return;
                    pane.querySelectorAll('canvas').forEach(c => scheduleDrawBar(c, tooltipEl));
                });
            });
        } catch { /* ignore */ }
    }, 0);
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
        const sum = Array.isArray(s.optimization_summary) ? s.optimization_summary : [];
        const totalBars = sum.reduce((acc, g) => acc + (Number(g.bars_needed ?? 0) || 0), 0);
        const stockStatus = s.stock_entry_complete ? 'Stok: Tamam' : 'Stok: Eksik';
        opt.textContent = `${s.key}  —  ${s.title || ''}${totalBars ? ` · ${totalBars} bar` : ''} · ${stockStatus}`;
        select.appendChild(opt);
    });
    if (selectKey) select.value = selectKey;
}

function renderStockBarsHtml(stockBars = []) {
    if (!stockBars.length) {
        return `
            <div class="text-muted py-2">
                Bu planda tanımlı stok bar bulunmuyor.
            </div>
        `;
    }

    const rows = stockBars.map((bar, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td>${escapeAttr(bar.item_code || '-')}</td>
            <td>${escapeAttr(bar.item_name || '-')}</td>
            <td class="text-end">${bar.length_mm ?? '-'}</td>
            <td class="text-end">${bar.quantity ?? '-'}</td>
            <td>${escapeAttr(bar.item_unit || '-')}</td>
            <td>${escapeAttr(bar.declared_by_username || '-')}</td>
        </tr>
    `).join('');

    return `
        <div class="table-responsive">
            <table class="table table-sm table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th>#</th>
                        <th>Malzeme Kodu</th>
                        <th>Malzeme</th>
                        <th class="text-end">Boy (mm)</th>
                        <th class="text-end">Adet</th>
                        <th>Birim</th>
                        <th>Beyan Eden</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function onShowStockBars() {
    const bars = Array.isArray(currentSession?.stock_bars) ? currentSession.stock_bars : [];
    stockBarsModal?.reset();
    stockBarsModal
        ?.addCustomSection({
            id: 'stock-bars-list',
            title: 'Stok Bar Listesi',
            icon: 'fas fa-bars-staggered',
            iconColor: 'text-primary',
            customContent: renderStockBarsHtml(bars)
        })
        ?.render()
        ?.show();
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
    if (hasNewRows()) {
        showNotification('Önce yeni parçaları "Toplu Kaydet" ile kaydedin.', 'warning');
        return;
    }
    if (!currentParts.length) {
        showNotification('Önce en az bir parça ekleyin.', 'warning');
        return;
    }
    if (currentParts.some(p => !p.item)) {
        showNotification('Optimizasyon için tüm parçalarda profil (malzeme kartı) seçilmelidir.', 'warning');
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
                const tasks = Array.isArray(res.created_tasks) ? res.created_tasks : [];
                const prNo  = res.planning_request_number || '';

                const tasksHtml = tasks.length
                    ? `<ul class="list-group list-group-flush">
                        ${tasks.map(k => `
                            <li class="list-group-item d-flex justify-content-between align-items-center">
                                <span class="fw-semibold">${escapeAttr(k)}</span>
                                <a class="btn btn-sm btn-outline-primary" target="_blank" rel="noopener"
                                   href="/manufacturing/linear-cutting/cuts/?task=${encodeURIComponent(k)}">
                                    Aç
                                </a>
                            </li>
                        `).join('')}
                    </ul>`
                    : `<div class="text-muted">—</div>`;

                const prHtml = prNo
                    ? `<div class="d-flex align-items-center justify-content-between gap-2">
                        <div class="fw-semibold">${escapeAttr(prNo)}</div>
                        <a class="btn btn-sm btn-outline-primary" target="_blank" rel="noopener"
                           href="/planning/department-requests/?talep=${encodeURIComponent(prNo)}">
                            Aç
                        </a>
                    </div>`
                    : `<div class="text-muted">—</div>`;

                // Rebuild modal content each time
                confirmResultModal.reset();
                confirmResultModal
                    .addCustomSection({
                        id: 'result-summary',
                        title: 'Oluşturulan Kayıtlar',
                        icon: 'fas fa-check',
                        iconColor: 'text-success',
                        customContent: `
                            <div class="row g-3">
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6 class="mb-0"><i class="fas fa-tasks me-2"></i>Görevler</h6>
                                        </div>
                                        <div class="card-body p-0">
                                            ${tasksHtml}
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6 class="mb-0"><i class="fas fa-clipboard-list me-2"></i>Planlama Talebi</h6>
                                        </div>
                                        <div class="card-body">
                                            ${prHtml}
                                            <div class="text-muted mt-2" style="font-size:.85rem;">
                                                Not: Linkler yeni sekmede açılır.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `
                    })
                    .render()
                    .show();

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
    confirmResultModal = new DisplayModal('lc-confirm-result-modal-container', {
        title: 'Onay Sonucu',
        icon: 'fas fa-check-circle',
        showEditButton: false,
        size: 'lg'
    });
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
    stockBarsModal = new DisplayModal('lc-stock-bars-modal-container', {
        title: 'Stok Barlar',
        icon: 'fas fa-bars-staggered',
        showEditButton: false,
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
    $('lc-stock-bars-btn').addEventListener('click', onShowStockBars);

    $('lc-bulk-save-parts-btn')?.addEventListener('click', bulkSaveNewParts);
    $('lc-add-part-btn').addEventListener('click', addNewPartRow);

    // Live geometry: the şekil must always match kesit / uzunluk / açılar.
    document.body.addEventListener('input', e => {
        const el = e.target;
        const magSide = el?.getAttribute?.('data-lc-geom-mag');
        if (magSide) {
            applyGeomSide(el.closest('tr[data-lc-geom-row]')?.getAttribute('data-lc-geom-row'), magSide);
            return;
        }
        const rowId = el?.getAttribute?.('data-lc-row');
        const field = el?.getAttribute?.('data-lc-field');
        if (!rowId || !field || !getRowModel(rowId)) return;

        const angleSide = SIDES.find(s => s.angleField === field);
        if (angleSide) {
            clearGeomSide(rowId, angleSide.side);
            mergeRowFromDom(rowId);
            refreshRowGeometry(rowId);
            return;
        }
        if (field === 'profile_height_mm') {
            mergeRowFromDom(rowId);
            reapplyGeomForRow(rowId);
            return;
        }
        if (field === 'nominal_length_mm') {
            mergeRowFromDom(rowId);
            refreshRowGeometry(rowId);
        }
    });

    document.body.addEventListener('change', e => {
        const signSide = e.target?.getAttribute?.('data-lc-geom-sign');
        if (!signSide) return;
        applyGeomSide(e.target.closest('tr[data-lc-geom-row]')?.getAttribute('data-lc-geom-row'), signSide);
    });

    // Delegated: parts table actions
    document.body.addEventListener('click', async e => {
        // Kenar ölçüsü panel toggle
        const geomToggle = e.target.closest('[data-lc-geom-toggle]');
        if (geomToggle) {
            const rowId = geomToggle.getAttribute('data-lc-geom-toggle');
            mergeAllEditableRowsFromDom();
            if (expandedGeomRows.has(rowId)) expandedGeomRows.delete(rowId);
            else expandedGeomRows.add(rowId);
            geomToggle.classList.toggle('open', expandedGeomRows.has(rowId));
            syncGeomPanels();
            return;
        }
        // Stok (mm) column collapse/expand toggle
        const stockToggle = e.target.closest('[data-lc-toggle-stock]');
        if (stockToggle) {
            mergeAllEditableRowsFromDom();
            stockColExpanded = !stockColExpanded;
            renderPartsTable();
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
            mergeAllEditableRowsFromDom();
            destroyJobNoDropdown(rowId);
            destroyPartItemDropdown(rowId);
            expandedGeomRows.delete(rowId);
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
    await bootstrapFromQuery();
}

document.addEventListener('DOMContentLoaded', init);
