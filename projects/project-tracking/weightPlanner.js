/**
 * Ağırlık ve Fiyat Kademeleri — weights and subcontracting price tiers for a
 * top-level job order's whole subtree, on one screen.
 *
 * Planning used to open each child job order, type its kg into the Fiyat
 * Kademeleri tab, save, and add its tiers one by one. Here the weights are a
 * column: type one and press Enter to go down, or paste a column straight
 * from Excel. Tiers come from templates (managed in this modal too) and are
 * sized as a share of each job's weight. Nothing is written until Kaydet,
 * which sends everything in one atomic request
 * (POST /subcontracting/price-tiers/bulk_plan/).
 *
 * Plan state and its rules live in weightPlannerModel.js; this file is the DOM.
 * Layout and list styles are shared with the Görev Planlama modal
 * (plannerModal.css, .tp-modal).
 */
import { showNotification } from '../../components/notification/notification.js';
import { escapeHtml } from '../../utils/text.js';
import { getPriceTierPlanner, bulkPlanPriceTiers } from '../../apis/subcontracting/priceTiers.js';
import {
    listPriceTierTemplates,
    createPriceTierTemplate,
    updatePriceTierTemplate,
    deletePriceTierTemplate,
} from '../../apis/subcontracting/priceTierTemplates.js';
import {
    PAINT,
    WELDING,
    addedWeldingKg,
    allocatedKg,
    awaitsManualKg,
    buildBulkPayload,
    changedJobs,
    cloneTiers,
    effectiveShare,
    emptyChange,
    existingTiers,
    existingWeldingKg,
    hasExistingChanges,
    finalWeight,
    formatDecimal,
    formatKg,
    isWeightChanged,
    newTierKey,
    newTierRow,
    offerWeight,
    parseDecimal,
    parsePastedColumn,
    planHasTemplate,
    roundTo,
    savedWeight,
    setExistingField,
    summarize,
    templateItemsFromRows,
    tiersFromTemplate,
    validateJob,
    weightEdit,
} from './weightPlannerModel.js';

const MODAL_ID = 'weight-planner-modal';
const CURRENCIES = ['TRY', 'EUR', 'USD', 'GBP'];
const TIER_TYPES = [
    { value: WELDING, label: 'Kaynak' },
    { value: PAINT, label: 'Boya' },
];

const FILTERS = [
    { value: 'all', label: 'Tüm iş emirleri' },
    { value: 'no_weight', label: 'Ağırlığı olmayanlar' },
    { value: 'no_tiers', label: 'Kademesi olmayanlar' },
    { value: 'needs_kg', label: 'Kg bekleyenler' },
    { value: 'changed', label: 'Değiştirilenler' },
];

const JOB_STATUS_CLASS = {
    draft: 'status-grey',
    on_hold: 'status-orange',
    completed: 'status-green',
    cancelled: 'status-grey',
};

const SERVER_FIELD_LABELS = {
    total_weight_kg: 'Ağırlık',
    name: 'Ad',
    price_per_kg: 'Fiyat/kg',
    allocated_weight_kg: 'Ayrılan ağırlık',
    currency: 'Para birimi',
    tier_type: 'Tip',
};

let modalEl = null;
let modal = null;
let state = null;

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

/**
 * Open the planner on a job order's whole tree (from its top-level root).
 * @param {string} jobNo - any job order of the tree; it is selected on open
 *   unless it is the root
 * @param {{onSaved?: Function}} options - called after a successful save
 */
export async function openWeightPlanner(jobNo, { onSaved } = {}) {
    ensureModal();
    state = {
        rootJobNo: jobNo,
        onSaved,
        loading: true,
        loadError: null,
        jobs: [],
        jobByNo: new Map(),
        edits: new Map(),
        tiers: new Map(),
        changes: new Map(),
        selected: new Set(),
        focused: null,
        search: '',
        filter: 'all',
        templates: [],
        bulkTemplateId: '',
        detailTemplateId: '',
        pendingBulk: null,
        confirmClose: false,
        saving: false,
        error: null,
        allowClose: false,
        lastCheckedIndex: null,
        view: 'detail',
        draft: null,
        draftSaving: false,
        draftConfirmDelete: false,
    };
    const opened = state;
    renderAll();
    modal.show();

    try {
        const [tree, templates] = await Promise.all([
            getPriceTierPlanner(jobNo),
            listPriceTierTemplates().catch(() => []),
        ]);
        if (state !== opened) return;
        state.rootJobNo = tree.root || jobNo;
        state.jobs = tree.job_orders || [];
        state.jobByNo = new Map(state.jobs.map((j) => [j.job_no, j]));
        state.templates = templates;
        const firstOpen = state.jobs.find((j) => j.can_plan && savedWeight(j) === null);
        state.focused = jobNo !== state.rootJobNo && state.jobByNo.has(jobNo)
            ? jobNo
            : (firstOpen || state.jobs[0] || {}).job_no || null;
    } catch (error) {
        if (state !== opened) return;
        console.error('Error loading weight planner:', error);
        state.loadError = 'İş emri ağacı yüklenemedi.';
    }
    state.loading = false;
    renderAll();
    if (state.focused) rowEl(state.focused)?.scrollIntoView({ block: 'center' });
}

function ensureModal() {
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.className = 'modal fade tp-modal wp-modal';
    modalEl.id = MODAL_ID;
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-labelledby', `${MODAL_ID}-title`);
    modalEl.innerHTML = `
        <div class="modal-dialog modal-fullscreen">
            <div class="modal-content">
                <div class="modal-header tp-header">
                    <div class="tp-header-text">
                        <h5 class="modal-title" id="${MODAL_ID}-title">
                            <i class="fas fa-weight-hanging me-2 text-primary"></i>Ağırlık ve Fiyat Kademeleri
                            <span class="tp-root-no"></span>
                        </h5>
                        <div class="tp-root-title"></div>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Kapat"></button>
                </div>
                <div class="modal-body tp-body">
                    <div class="tp-layout">
                        <aside class="tp-jobs">
                            <div class="tp-jobs-toolbar">
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text"><i class="fas fa-search"></i></span>
                                    <input type="search" class="form-control" data-tp-field="search"
                                           placeholder="İş emri no veya başlık ara" autocomplete="off">
                                </div>
                                <select class="form-select form-select-sm" data-tp-field="filter" aria-label="Filtre">
                                    ${FILTERS.map((f) => `<option value="${f.value}">${f.label}</option>`).join('')}
                                </select>
                            </div>
                            <div class="tp-bulkbar"></div>
                            <div class="tp-job-list-head">
                                <input type="checkbox" class="form-check-input" data-tp-field="check-visible"
                                       aria-label="Görünenleri seç">
                                <span>İş Emri</span>
                                <span class="wp-col-weight">Ağırlık (kg)</span>
                                <span class="wp-col-tiers">Kademe</span>
                            </div>
                            <div class="tp-job-list" role="list"></div>
                            <div class="wp-list-hint">
                                <i class="fas fa-keyboard me-1"></i>Enter / ↓ ile alttaki satıra geçin. Excel'den bir sütun
                                (ya da "iş emri no + ağırlık" sütunları) yapıştırabilirsiniz.
                            </div>
                        </aside>
                        <section class="tp-detail"></section>
                    </div>
                </div>
                <div class="modal-footer tp-footer"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modalEl);
    modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: true });

    modalEl.addEventListener('hide.bs.modal', (event) => {
        if (!state || state.allowClose) return;
        if (state.saving) {
            event.preventDefault();
            return;
        }
        const { jobCount } = summarize(state.jobs, state.edits, state.tiers, state.changes);
        if (jobCount > 0) {
            event.preventDefault();
            state.confirmClose = true;
            renderFooter();
        }
    });
    modalEl.addEventListener('hidden.bs.modal', () => {
        state = null;
    });

    modalEl.addEventListener('click', onClick);
    modalEl.addEventListener('input', onInput);
    modalEl.addEventListener('change', onChange);
    // Capture phase: Bootstrap's own keydown listener on this element closes
    // the modal on Escape, and here Escape only undoes the weight cell.
    modalEl.addEventListener('keydown', onKeydown, true);
    modalEl.addEventListener('paste', onPaste);
    modalEl.addEventListener('focusin', (event) => {
        if (state && event.target.dataset.tpField === 'weight') focusJob(event.target.dataset.job);
    });
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

function tiersOf(jobNo) {
    return state.tiers.get(jobNo) || [];
}

function setTiers(jobNo, rows) {
    state.tiers.set(jobNo, rows);
    if (state.error && state.error.jobNo === jobNo) state.error = null;
}

/** Pending edits/deletes of the job's existing tiers (created on demand). */
function changeOf(jobNo, create = false) {
    if (create && !state.changes.has(jobNo)) state.changes.set(jobNo, emptyChange());
    return state.changes.get(jobNo) || null;
}

function weightOf(jobNo) {
    return finalWeight(state.jobByNo.get(jobNo), state.edits.get(jobNo));
}

function setWeightText(jobNo, text) {
    const job = state.jobByNo.get(jobNo);
    const edit = weightEdit(text);
    if (isWeightChanged(job, edit)) state.edits.set(jobNo, edit);
    else state.edits.delete(jobNo);
    if (state.error && state.error.jobNo === jobNo) state.error = null;
}

function templateName(id) {
    const template = state.templates.find((t) => String(t.id) === String(id));
    return template ? template.name : '';
}

function activeTemplates() {
    return state.templates.filter((t) => t.is_active);
}

function normalize(text) {
    return (text || '').toLocaleLowerCase('tr');
}

function visibleJobs() {
    const term = normalize(state.search.trim());
    return state.jobs.filter((job) => {
        if (term && !normalize(job.job_no).includes(term) && !normalize(job.title).includes(term)) return false;
        switch (state.filter) {
            case 'no_weight': return weightOf(job.job_no) === null;
            case 'no_tiers': return job.tiers.length === 0 && tiersOf(job.job_no).length === 0;
            case 'needs_kg': {
                const weight = weightOf(job.job_no);
                return tiersOf(job.job_no).some((r) => allocatedKg(r, weight) === null);
            }
            case 'changed': return isWeightChanged(job, state.edits.get(job.job_no)) || tiersOf(job.job_no).length > 0
                || hasExistingChanges(changeOf(job.job_no));
            default: return true;
        }
    });
}

function selectedPlannable() {
    return state.jobs.filter((j) => j.can_plan && state.selected.has(j.job_no)).map((j) => j.job_no);
}

function rowEl(jobNo) {
    return modalEl.querySelector(`.tp-job-row[data-job="${CSS.escape(jobNo)}"]`);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderAll() {
    renderHeader();
    renderBulkBar();
    renderJobList();
    renderDetail();
    renderFooter();
}

function renderHeader() {
    const root = state.jobByNo.get(state.rootJobNo);
    modalEl.querySelector('.tp-root-no').textContent = `— ${state.rootJobNo}`;
    const count = state.jobs.length;
    modalEl.querySelector('.tp-root-title').textContent = root
        ? `${root.title || ''}${count > 1 ? ` · ${count} iş emri` : ''}`
        : '';
    const search = modalEl.querySelector('[data-tp-field="search"]');
    if (search.value !== state.search) search.value = state.search;
    modalEl.querySelector('[data-tp-field="filter"]').value = state.filter;
}

function templateOptions(selectedId, placeholder) {
    return `
        <option value="">${placeholder}</option>
        ${activeTemplates().map((t) => `
            <option value="${t.id}" ${String(t.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
    `;
}

function renderBulkBar() {
    const bar = modalEl.querySelector('.tp-bulkbar');
    if (state.loading || state.loadError) {
        bar.innerHTML = '';
        return;
    }
    const selected = selectedPlannable();
    const tiersInSelection = selected.filter((no) => tiersOf(no).length > 0).length;
    const confirm = state.pendingBulk;
    bar.innerHTML = `
        <div class="tp-bulk-row">
            <span class="tp-sel-count">${selected.length
                ? `<strong>${selected.length}</strong> iş emri seçili`
                : 'Toplu kademe için iş emri seçin'}</span>
            <span class="tp-bulk-links">
                <button type="button" class="btn btn-link btn-sm" data-tp-action="select-no-tiers">Kademesizleri seç</button>
                ${selected.length ? '<button type="button" class="btn btn-link btn-sm" data-tp-action="clear-selection">Seçimi kaldır</button>' : ''}
            </span>
        </div>
        <div class="tp-bulk-row">
            <select class="form-select form-select-sm" data-tp-field="bulk-template" aria-label="Kademe şablonu">
                ${templateOptions(state.bulkTemplateId, activeTemplates().length ? 'Kademe şablonu seçin…' : 'Henüz şablon yok')}
            </select>
            <button type="button" class="btn btn-sm btn-primary text-nowrap" data-tp-action="bulk-apply"
                    ${selected.length && state.bulkTemplateId ? '' : 'disabled'}>
                <i class="fas fa-layer-group me-1"></i>Seçililere uygula
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-tp-action="bulk-clear"
                    title="Seçililere eklenen yeni kademeleri temizle" aria-label="Seçililere eklenen yeni kademeleri temizle"
                    ${tiersInSelection ? '' : 'disabled'}>
                <i class="fas fa-eraser"></i>
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary text-nowrap" data-tp-action="open-templates"
                    title="Kademe şablonlarını yönet">
                <i class="fas fa-cog me-1"></i>Şablonlar
            </button>
        </div>
        ${confirm ? `
            <div class="tp-inline-confirm" role="alert">
                <div>
                    Seçili ${confirm.targets.length} iş emrinin <strong>${confirm.withTiers.length}</strong> tanesinde
                    zaten kayıtlı kademe var. «${escapeHtml(templateName(confirm.templateId))}» nereye uygulansın?
                </div>
                <div class="tp-inline-confirm-actions">
                    <button type="button" class="btn btn-sm btn-primary" data-tp-action="bulk-confirm-empty"
                            ${confirm.targets.length - confirm.withTiers.length ? '' : 'disabled'}>
                        Yalnızca kademesizlere (${confirm.targets.length - confirm.withTiers.length})
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-tp-action="bulk-confirm-all">
                        Hepsine (${confirm.targets.length})
                    </button>
                    <button type="button" class="btn btn-sm btn-link" data-tp-action="bulk-confirm-cancel">Vazgeç</button>
                </div>
            </div>` : ''}
    `;
}

function weightInputState(job) {
    const edit = state.edits.get(job.job_no);
    const rows = tiersOf(job.job_no);
    const problems = validateJob(job, edit, rows, changeOf(job.job_no));
    return {
        changed: isWeightChanged(job, edit),
        invalid: problems.some((p) => p.field === 'weight'),
        // Share-sized tiers are waiting for this weight.
        missing: finalWeight(job, edit) === null && rows.some((r) => r.kg === null && r.share !== null),
    };
}

function tierBadges(job) {
    const rows = tiersOf(job.job_no);
    const added = rows.length;
    const edited = hasExistingChanges(changeOf(job.job_no));
    const existing = job.tiers.length
        ? `<span class="status-badge ${edited ? 'status-blue' : 'status-grey'} tp-badge"
                 title="${edited ? 'Kayıtlı kademelerde düzenleme var' : 'Kayıtlı kademe'}">${job.tiers.length}${edited ? '*' : ''}</span>`
        : `<span class="status-badge ${job.can_plan && !added ? 'status-orange' : 'status-grey'} tp-badge" title="Kayıtlı kademe yok">0</span>`;
    // Orange while a hand-sized tier still has no kg.
    const waiting = rows.some(awaitsManualKg);
    const pending = added
        ? `<span class="status-badge ${waiting ? 'status-orange' : 'status-blue'} tp-badge"
                 title="${waiting ? 'Kg girilmesi bekleniyor' : 'Eklenecek kademe'}">+${added}</span>`
        : '<span class="tp-badge-empty">–</span>';
    return `${existing}${pending}`;
}

function renderJobList() {
    const list = modalEl.querySelector('.tp-job-list');
    const headCheck = modalEl.querySelector('[data-tp-field="check-visible"]');
    if (state.loading) {
        list.innerHTML = '<div class="tp-empty"><div class="spinner-border spinner-border-sm me-2"></div>Yükleniyor…</div>';
        headCheck.disabled = true;
        return;
    }
    if (state.loadError) {
        list.innerHTML = `<div class="tp-empty text-danger">${escapeHtml(state.loadError)}</div>`;
        headCheck.disabled = true;
        return;
    }
    // Put the caret back only into the focused job's own cell: refocusing any
    // other cell would fire focusin and switch the detail panel to that job.
    const active = document.activeElement;
    const refocusJob = active && list.contains(active) && active.dataset.tpField === 'weight'
        && active.dataset.job === state.focused ? active.dataset.job : null;

    const jobs = visibleJobs();
    const plannable = jobs.filter((j) => j.can_plan);
    const checkedCount = plannable.filter((j) => state.selected.has(j.job_no)).length;
    headCheck.disabled = plannable.length === 0;
    headCheck.checked = plannable.length > 0 && checkedCount === plannable.length;
    headCheck.indeterminate = checkedCount > 0 && checkedCount < plannable.length;

    if (jobs.length === 0) {
        list.innerHTML = '<div class="tp-empty">Filtreye uyan iş emri yok.</div>';
        return;
    }
    const errorJob = state.error && state.error.jobNo;
    list.innerHTML = jobs.map((job, index) => {
        const { changed, invalid, missing } = weightInputState(job);
        const edit = state.edits.get(job.job_no);
        const classes = ['tp-job-row', 'wp-row'];
        if (job.job_no === state.focused) classes.push('is-active');
        if (!job.can_plan) classes.push('is-disabled');
        if (job.job_no === errorJob) classes.push('has-error');
        const offer = offerWeight(job);
        const statusBadge = job.status !== 'active'
            ? `<span class="status-badge ${JOB_STATUS_CLASS[job.status] || 'status-grey'} tp-badge">${escapeHtml(job.status_display)}</span>`
            : '';
        const inputClasses = ['form-control', 'form-control-sm', 'wp-weight'];
        if (changed) inputClasses.push('is-changed');
        if (invalid) inputClasses.push('is-invalid');
        if (missing) inputClasses.push('is-missing');
        return `
            <div class="${classes.join(' ')}" role="listitem" data-job="${escapeHtml(job.job_no)}" data-index="${index}"
                 style="--tp-depth:${Math.min(job.depth, 6)}">
                <input type="checkbox" class="form-check-input tp-job-check" data-tp-field="job-check"
                       data-job="${escapeHtml(job.job_no)}" data-index="${index}"
                       aria-label="${escapeHtml(job.job_no)} seç"
                       ${state.selected.has(job.job_no) && job.can_plan ? 'checked' : ''} ${job.can_plan ? '' : 'disabled'}>
                <div class="tp-job-main">
                    <div class="tp-job-no">
                        ${escapeHtml(job.job_no)}
                        ${job.is_phase ? '<span class="status-badge status-purple tp-badge">Faz</span>' : ''}
                        ${statusBadge}
                    </div>
                    <div class="tp-job-title" title="${escapeHtml(job.title)}">${escapeHtml(job.title || '–')}</div>
                </div>
                <input type="text" inputmode="decimal" autocomplete="off" class="${inputClasses.join(' ')}"
                       data-tp-field="weight" data-job="${escapeHtml(job.job_no)}" data-index="${index}"
                       value="${escapeHtml(edit ? edit.text : formatDecimal(savedWeight(job)))}"
                       placeholder="kg" aria-label="${escapeHtml(job.job_no)} ağırlık (kg)"
                       title="${offer !== null ? `Teklif: ${escapeHtml(formatKg(offer))}` : ''}"
                       ${job.can_plan ? '' : 'disabled'}>
                <div class="tp-job-badges wp-tier-badges">${tierBadges(job)}</div>
            </div>
        `;
    }).join('');

    if (refocusJob) {
        const input = list.querySelector(`[data-tp-field="weight"][data-job="${CSS.escape(refocusJob)}"]`);
        if (input) input.focus();
    }
}

/** Refresh one row in place, so the input being typed in keeps its caret. */
function refreshJobRow(jobNo) {
    const row = rowEl(jobNo);
    if (!row) return;
    const job = state.jobByNo.get(jobNo);
    const { changed, invalid, missing } = weightInputState(job);
    const input = row.querySelector('[data-tp-field="weight"]');
    input.classList.toggle('is-changed', changed);
    input.classList.toggle('is-invalid', invalid);
    input.classList.toggle('is-missing', missing);
    row.classList.toggle('has-error', !!(state.error && state.error.jobNo === jobNo));
    row.querySelector('.wp-tier-badges').innerHTML = tierBadges(job);
}

function setActiveRow(jobNo) {
    modalEl.querySelectorAll('.tp-job-row.is-active').forEach((el) => el.classList.remove('is-active'));
    const row = rowEl(jobNo);
    if (row) row.classList.add('is-active');
}

function renderWeightCard(job) {
    const edit = state.edits.get(job.job_no);
    const weight = finalWeight(job, edit);
    const changed = isWeightChanged(job, edit);
    const offer = offerWeight(job);
    const children = state.jobs.filter((j) => j.parent === job.job_no);
    const childWeights = children.map((c) => weightOf(c.job_no)).filter((w) => typeof w === 'number' && !Number.isNaN(w));
    const childSum = childWeights.reduce((sum, w) => sum + w, 0);
    const existing = existingWeldingKg(job, changeOf(job.job_no) || emptyChange());
    const added = addedWeldingKg(tiersOf(job.job_no), weight);
    const welding = existing + added;
    const capacity = typeof weight === 'number' && !Number.isNaN(weight) ? weight : 0;
    const over = welding > capacity + 0.001;

    return `
        <div class="wp-weight-card">
            <div class="wp-weight-main">
                <span class="wp-weight-label">Toplam ağırlık</span>
                <span class="wp-weight-value">${Number.isNaN(weight) ? '<span class="text-danger">okunamadı</span>' : escapeHtml(formatKg(weight))}</span>
                ${changed ? `
                    <span class="status-badge status-blue tp-badge">Değişti</span>
                    <span class="tp-muted">önce ${escapeHtml(formatKg(savedWeight(job)))}</span>
                    <button type="button" class="btn btn-link btn-sm p-0" data-tp-action="revert-weight">Geri al</button>` : ''}
            </div>
            <div class="wp-weight-facts">
                ${offer !== null ? `<span>Teklif: ${escapeHtml(formatKg(Number(job.offer_weight_kg)))} × ${job.quantity || 1} adet ≈ <strong>${escapeHtml(formatKg(offer))}</strong></span>` : ''}
                ${children.length ? `<span>Alt iş emirleri: ${escapeHtml(formatKg(childSum))} (${childWeights.length}/${children.length} girilmiş)</span>` : ''}
                ${welding > 0 ? `<span class="${over ? 'text-danger fw-semibold' : ''}">Kaynak kademeleri: ${escapeHtml(formatKg(welding))} / ${escapeHtml(formatKg(capacity))}</span>` : ''}
            </div>
            ${job.can_plan ? '<div class="tp-muted small mt-1">Ağırlığı soldaki listeden girin.</div>' : ''}
        </div>
    `;
}

function renderExistingTiers(job, problems) {
    if (job.tiers.length === 0) {
        return '<div class="tp-muted">Bu iş emrinde kayıtlı fiyat kademesi yok.</div>';
    }
    if (job.can_plan) return renderEditableExistingTiers(job, problems);
    return `
        <div class="table-responsive">
            <table class="table table-sm align-middle wp-existing mb-0">
                <thead><tr><th>Ad</th><th>Tip</th><th class="text-end">Fiyat/kg</th>
                    <th class="text-end">Ayrılan</th><th class="text-end">Kullanılan</th><th class="text-end">Kalan</th></tr></thead>
                <tbody>
                    ${job.tiers.map((t) => `
                        <tr>
                            <td>${escapeHtml(t.name)}</td>
                            <td>${escapeHtml(t.tier_type_display)}</td>
                            <td class="text-end">${escapeHtml(formatDecimal(Number(t.price_per_kg), 4))} ${escapeHtml(t.currency)}</td>
                            <td class="text-end">${escapeHtml(formatKg(Number(t.allocated_weight_kg)))}</td>
                            <td class="text-end">${escapeHtml(formatKg(Number(t.used_weight_kg)))}</td>
                            <td class="text-end">${escapeHtml(formatKg(Number(t.remaining_weight_kg)))}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Existing tiers as inputs. Edits stay pending until Kaydet. A tier that
 * assignments point at cannot be deleted or change type (the backend
 * refuses both), so those controls are locked here.
 */
function renderEditableExistingTiers(job, problems) {
    const change = changeOf(job.job_no) || emptyChange();
    const errorKey = state.error && state.error.jobNo === job.job_no ? state.error.key : null;
    const PROBLEM_FIELD = { name: 'name', tier_type: 'type', price_per_kg: 'price', allocated_weight_kg: 'kg' };
    const cls = (t, field) => {
        const key = `e${t.id}`;
        const invalid = problems.some((p) => p.key === key && p.field === PROBLEM_FIELD[field]);
        return `${t.changed.has(field) ? 'is-changed' : ''} ${invalid ? 'is-invalid' : ''}`;
    };
    const number = (value, places) => (value === null || Number.isNaN(value) ? '' : formatDecimal(value, places));

    return `
        <div class="table-responsive">
            <table class="table table-sm align-middle tp-rows wp-tiers wp-existing-edit">
                <colgroup>
                    <col><col style="width:110px"><col style="width:110px"><col style="width:84px">
                    <col style="width:110px"><col style="width:96px"><col style="width:96px"><col style="width:48px">
                </colgroup>
                <thead>
                    <tr><th>Ad</th><th>Tip</th><th>Fiyat/kg</th><th>Para B.</th><th>Ayrılan kg</th>
                        <th class="text-end">Kullanılan</th><th class="text-end">Kalan</th><th></th></tr>
                </thead>
                <tbody>
                    ${existingTiers(job, change).map((t) => {
                        const off = t.deleted ? 'disabled' : '';
                        const locked = t.assignments > 0;
                        const remaining = (Number.isFinite(t.allocated_weight_kg) ? t.allocated_weight_kg : 0) - t.used;
                        return `
                        <tr data-id="${t.id}" class="${t.deleted ? 'wp-deleted' : ''} ${`e${t.id}` === errorKey ? 'tp-row-error' : ''}">
                            <td><input type="text" class="form-control form-control-sm ${cls(t, 'name')}" data-tp-field="ex-name"
                                       data-id="${t.id}" value="${escapeHtml(t.name)}" maxlength="200" aria-label="Kademe adı" ${off}></td>
                            <td><select class="form-select form-select-sm ${cls(t, 'tier_type')}" data-tp-field="ex-type" data-id="${t.id}"
                                        aria-label="Tip" ${off || (locked ? 'disabled title="Ataması olan kademenin tipi değiştirilemez"' : '')}>
                                ${TIER_TYPES.map((o) => `<option value="${o.value}" ${o.value === t.tier_type ? 'selected' : ''}>${o.label}</option>`).join('')}
                            </select></td>
                            <td><input type="text" inputmode="decimal" class="form-control form-control-sm text-end ${cls(t, 'price_per_kg')}"
                                       data-tp-field="ex-price" data-id="${t.id}" aria-label="Fiyat/kg" ${off}
                                       value="${escapeHtml(number(t.price_per_kg, 4))}"></td>
                            <td><select class="form-select form-select-sm ${cls(t, 'currency')}" data-tp-field="ex-currency" data-id="${t.id}"
                                        aria-label="Para birimi" ${off}>
                                ${CURRENCIES.map((c) => `<option value="${c}" ${c === t.currency ? 'selected' : ''}>${c}</option>`).join('')}
                            </select></td>
                            <td><input type="text" inputmode="decimal" class="form-control form-control-sm text-end ${cls(t, 'allocated_weight_kg')}"
                                       data-tp-field="ex-kg" data-id="${t.id}" aria-label="Ayrılan ağırlık (kg)" ${off}
                                       value="${escapeHtml(number(t.allocated_weight_kg, 2))}"></td>
                            <td class="text-end small">${escapeHtml(formatKg(t.used))}</td>
                            <td class="text-end small ${remaining < 0 ? 'text-danger fw-semibold' : ''}">${escapeHtml(formatKg(remaining))}</td>
                            <td class="text-end">
                                ${t.deleted
                                    ? `<button type="button" class="btn btn-sm btn-outline-secondary" data-tp-action="ex-restore" data-id="${t.id}"
                                               title="Silmeyi geri al" aria-label="Silmeyi geri al"><i class="fas fa-undo"></i></button>`
                                    : `<button type="button" class="btn btn-sm btn-outline-danger" data-tp-action="ex-delete" data-id="${t.id}"
                                               ${locked ? 'disabled title="Ataması olan kademe silinemez"' : 'title="Sil"'} aria-label="Sil">
                                           <i class="fas fa-trash"></i></button>`}
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
        ${hasExistingChanges(change) ? '<div class="tp-muted small mt-1">Kayıtlı kademelerdeki değişiklikler Kaydet ile yazılır.</div>' : ''}
    `;
}

function renderNewTiers(job, rows, problems) {
    if (rows.length === 0) {
        return `
            <div class="tp-empty tp-empty-plan">
                Bu iş emrine eklenecek kademe yok.<br>
                Yukarıdan bir şablon ekleyin, kademe ekleyin ya da soldan seçip toplu uygulayın.
            </div>`;
    }
    const weight = weightOf(job.job_no);
    const bad = (key, field) => problems.some((p) => p.key === key && p.field === field)
        || (state.error && state.error.jobNo === job.job_no && state.error.key === key && state.error.field === field);
    const errorKey = state.error && state.error.jobNo === job.job_no ? state.error.key : null;
    return `
        <div class="table-responsive">
            <table class="table table-sm align-middle tp-rows wp-tiers">
                <colgroup>
                    <col><col style="width:110px"><col style="width:110px"><col style="width:84px">
                    <col style="width:84px"><col style="width:120px"><col style="width:48px">
                </colgroup>
                <thead>
                    <tr><th>Ad</th><th>Tip</th><th>Fiyat/kg</th><th>Para B.</th><th>Pay %</th><th>Ayrılan kg</th><th></th></tr>
                </thead>
                <tbody>
                    ${rows.map((r) => {
                        const key = escapeHtml(r.key);
                        const shareDerived = r.share === null || r.share === undefined;
                        const share = effectiveShare(r, weight);
                        const kg = allocatedKg(r, weight);
                        // A hand-sized tier with no kg yet is a to-do, not an error:
                        // orange until a save attempt names it.
                        const waiting = awaitsManualKg(r);
                        const kgClass = waiting
                            ? `is-missing ${state.error && state.error.key === r.key ? 'is-invalid' : ''}`
                            : `${shareDerived ? '' : 'wp-derived'} ${bad(r.key, 'kg') ? 'is-invalid' : ''}`;
                        return `
                        <tr data-key="${key}" class="${r.key === errorKey ? 'tp-row-error' : ''}">
                            <td><input type="text" class="form-control form-control-sm ${bad(r.key, 'name') ? 'is-invalid' : ''}"
                                       data-tp-field="tier-name" data-key="${key}" value="${escapeHtml(r.name)}" maxlength="200"
                                       placeholder="ör. ÇELİK" aria-label="Kademe adı"></td>
                            <td><select class="form-select form-select-sm" data-tp-field="tier-type" data-key="${key}" aria-label="Tip">
                                ${TIER_TYPES.map((t) => `<option value="${t.value}" ${t.value === r.tier_type ? 'selected' : ''}>${t.label}</option>`).join('')}
                            </select></td>
                            <td><input type="text" inputmode="decimal" class="form-control form-control-sm text-end ${bad(r.key, 'price') ? 'is-invalid' : ''}"
                                       data-tp-field="tier-price" data-key="${key}" aria-label="Fiyat/kg"
                                       value="${escapeHtml(r.price_per_kg === null || Number.isNaN(r.price_per_kg) ? '' : formatDecimal(r.price_per_kg, 4))}"></td>
                            <td><select class="form-select form-select-sm" data-tp-field="tier-currency" data-key="${key}" aria-label="Para birimi">
                                ${CURRENCIES.map((c) => `<option value="${c}" ${c === r.currency ? 'selected' : ''}>${c}</option>`).join('')}
                            </select></td>
                            <td><input type="text" inputmode="decimal" class="form-control form-control-sm text-end ${shareDerived ? 'wp-derived' : ''}"
                                       data-tp-field="tier-share" data-key="${key}" aria-label="Ağırlık payı (%)"
                                       value="${escapeHtml(share === null ? '' : formatDecimal(share))}" placeholder="elle"
                                       title="${waiting ? 'Pay yok: kg elle girilir' : shareDerived ? 'Elle girilen kg\'dan hesaplandı' : 'İş emri ağırlığının yüzdesi'}"></td>
                            <td><input type="text" inputmode="decimal" class="form-control form-control-sm text-end ${kgClass}"
                                       data-tp-field="tier-kg" data-key="${key}" aria-label="Ayrılan ağırlık (kg)"
                                       value="${escapeHtml(kg === null ? '' : formatDecimal(kg))}"
                                       placeholder="${waiting ? 'kg girin' : kg === null ? 'ağırlık yok' : ''}"
                                       title="${waiting ? 'Kg girin; Enter sıradaki boş kg\'ya geçer' : shareDerived ? 'Sabit kg' : 'Paydan hesaplandı; ağırlık değişirse güncellenir'}"></td>
                            <td class="text-end">
                                <button type="button" class="btn btn-sm btn-outline-danger" data-tp-action="remove-tier" data-key="${key}"
                                        title="Sil" aria-label="Sil"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderDetail() {
    const detail = modalEl.querySelector('.tp-detail');
    if (state.loading || state.loadError) {
        detail.innerHTML = '';
        return;
    }
    if (state.view === 'templates') {
        renderTemplateManager(detail);
        return;
    }
    const job = state.jobByNo.get(state.focused);
    if (!job) {
        detail.innerHTML = '<div class="tp-empty">Soldan bir iş emri seçin.</div>';
        return;
    }

    const active = document.activeElement;
    const refocus = active && detail.contains(active) && active.dataset.tpField
        ? { field: active.dataset.tpField, key: active.dataset.key }
        : null;
    const scrollTop = detail.scrollTop;

    const rows = tiersOf(job.job_no);
    const edit = state.edits.get(job.job_no);
    const problems = job.can_plan ? validateJob(job, edit, rows, changeOf(job.job_no)) : [];
    const jobProblems = problems.filter((p) => p.key === null);
    const selected = selectedPlannable().filter((no) => no !== job.job_no);
    const error = state.error && state.error.jobNo === job.job_no ? state.error : null;

    detail.innerHTML = `
        <div class="tp-detail-head">
            <div class="tp-detail-no">
                ${escapeHtml(job.job_no)}
                ${job.is_phase ? '<span class="status-badge status-purple tp-badge">Faz</span>' : ''}
                ${job.status !== 'active' ? `<span class="status-badge ${JOB_STATUS_CLASS[job.status] || 'status-grey'} tp-badge">${escapeHtml(job.status_display)}</span>` : ''}
            </div>
            <div class="tp-detail-title">${escapeHtml(job.title || '')}</div>
        </div>
        ${error ? `<div class="alert alert-danger py-2 mb-3"><i class="fas fa-exclamation-circle me-1"></i>${escapeHtml(error.message)}</div>` : ''}
        ${!error && jobProblems.length ? `<div class="alert alert-danger py-2 mb-3"><i class="fas fa-exclamation-circle me-1"></i>${escapeHtml(jobProblems[0].message)}</div>` : ''}

        ${renderWeightCard(job)}

        <div class="tp-section">
            <div class="tp-section-title">Kayıtlı fiyat kademeleri <span class="tp-muted">(${job.tiers.length})</span></div>
            ${renderExistingTiers(job, problems)}
        </div>

        <div class="tp-section">
            <div class="tp-section-head">
                <div class="tp-section-title">Eklenecek fiyat kademeleri <span class="tp-muted">(${rows.length})</span></div>
                ${job.can_plan ? `
                <div class="tp-section-actions">
                    <div class="input-group input-group-sm tp-template-add">
                        <select class="form-select" data-tp-field="detail-template" aria-label="Kademe şablonu">
                            ${templateOptions(state.detailTemplateId, 'Şablon…')}
                        </select>
                        <button type="button" class="btn btn-outline-primary" data-tp-action="detail-apply-template"
                                ${state.detailTemplateId ? '' : 'disabled'}>
                            <i class="fas fa-file-import me-1"></i>Şablonu ekle
                        </button>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-tp-action="add-tier">
                        <i class="fas fa-plus me-1"></i>Kademe ekle
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-tp-action="copy-to-selected"
                            ${rows.length && selected.length ? '' : 'disabled'}
                            title="${selected.length ? 'Bu kademeleri seçili iş emirlerine, kendi ağırlıklarına göre ekle' : 'Önce soldan hedef iş emirlerini seçin'}">
                        <i class="fas fa-copy me-1"></i>Seçililere kopyala${selected.length ? ` (${selected.length})` : ''}
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-tp-action="save-as-template"
                            ${rows.length ? '' : 'disabled'}>
                        <i class="fas fa-bookmark me-1"></i>Şablon olarak kaydet
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" data-tp-action="clear-tiers"
                            ${rows.length ? '' : 'disabled'}>
                        <i class="fas fa-eraser me-1"></i>Temizle
                    </button>
                </div>` : ''}
            </div>
            ${job.can_plan
                ? renderNewTiers(job, rows, problems)
                : `<div class="tp-muted">Bu iş emri ${job.status === 'cancelled' ? 'iptal edilmiş' : 'tamamlanmış'}; ağırlık ve kademe girilemez.</div>`}
        </div>
    `;

    detail.scrollTop = scrollTop;
    if (refocus) {
        const selector = `[data-tp-field="${refocus.field}"]${refocus.key ? `[data-key="${CSS.escape(refocus.key)}"]` : ''}`;
        const target = detail.querySelector(selector);
        if (target) target.focus();
    }
}

function renderTemplateManager(detail) {
    const draft = state.draft;
    detail.innerHTML = `
        <div class="tp-detail-head d-flex align-items-center">
            <div class="tp-detail-no me-auto"><i class="fas fa-layer-group me-2 text-primary"></i>Fiyat Kademesi Şablonları</div>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-tp-action="close-templates">
                <i class="fas fa-arrow-left me-1"></i>İş emrine dön
            </button>
        </div>
        <p class="tp-muted">
            Pay girilen kademe, iş emri ağırlığının o yüzdesini alır (%100 = iş emrinin tamamı).
            Pay boş bırakılırsa kademe uygulanınca kg'ı her iş emrinde elle girilir.
            Kaynak kademelerinin payları toplamı %100'ü geçemez; boya kademeleri sınırsızdır.
        </p>
        <div class="wp-tpl-layout">
            <div class="wp-tpl-list">
                <button type="button" class="btn btn-sm btn-outline-primary w-100 mb-2" data-tp-action="new-template">
                    <i class="fas fa-plus me-1"></i>Yeni şablon
                </button>
                ${state.templates.length ? state.templates.map((t) => `
                    <button type="button" class="wp-tpl-item ${draft && String(draft.id) === String(t.id) ? 'is-active' : ''}"
                            data-tp-action="edit-template" data-id="${t.id}">
                        <span class="wp-tpl-name">${escapeHtml(t.name)}</span>
                        <span class="tp-muted small">${t.items.length} kademe${t.is_active ? '' : ' · pasif'}</span>
                    </button>`).join('') : '<div class="tp-muted small">Henüz şablon yok.</div>'}
            </div>
            <div class="wp-tpl-editor">
                ${draft ? renderTemplateEditor(draft) : '<div class="tp-empty">Soldan bir şablon seçin ya da yeni bir şablon oluşturun.</div>'}
            </div>
        </div>
    `;
}

function renderTemplateEditor(draft) {
    return `
        <div class="row g-2 mb-2">
            <div class="col-md-6">
                <label class="form-label small mb-1">Şablon adı</label>
                <input type="text" class="form-control form-control-sm" data-tp-field="draft-name" maxlength="200"
                       value="${escapeHtml(draft.name)}" placeholder="ör. Çelik + Boya">
            </div>
            <div class="col-md-6">
                <label class="form-label small mb-1">Açıklama</label>
                <input type="text" class="form-control form-control-sm" data-tp-field="draft-description"
                       value="${escapeHtml(draft.description)}">
            </div>
        </div>
        <div class="form-check mb-2">
            <input class="form-check-input" type="checkbox" id="wp-draft-active" data-tp-field="draft-active" ${draft.is_active ? 'checked' : ''}>
            <label class="form-check-label small" for="wp-draft-active">Aktif (pasif şablonlar listede görünmez)</label>
        </div>
        <div class="table-responsive">
            <table class="table table-sm align-middle tp-rows wp-tpl-items">
                <colgroup><col><col style="width:110px"><col style="width:110px"><col style="width:84px"><col style="width:84px"><col style="width:48px"></colgroup>
                <thead><tr><th>Ad</th><th>Tip</th><th>Fiyat/kg</th><th>Para B.</th><th>Pay %</th><th></th></tr></thead>
                <tbody>
                    ${draft.items.map((item) => {
                        const key = escapeHtml(item.key);
                        return `
                        <tr>
                            <td><input type="text" class="form-control form-control-sm" data-tp-field="draft-item-name" data-key="${key}"
                                       value="${escapeHtml(item.name)}" maxlength="200" placeholder="ör. ÇELİK"></td>
                            <td><select class="form-select form-select-sm" data-tp-field="draft-item-type" data-key="${key}">
                                ${TIER_TYPES.map((t) => `<option value="${t.value}" ${t.value === item.tier_type ? 'selected' : ''}>${t.label}</option>`).join('')}
                            </select></td>
                            <td><input type="text" inputmode="decimal" class="form-control form-control-sm text-end" data-tp-field="draft-item-price"
                                       data-key="${key}" value="${escapeHtml(item.price_text)}"></td>
                            <td><select class="form-select form-select-sm" data-tp-field="draft-item-currency" data-key="${key}">
                                ${CURRENCIES.map((c) => `<option value="${c}" ${c === item.currency ? 'selected' : ''}>${c}</option>`).join('')}
                            </select></td>
                            <td><input type="text" inputmode="decimal" class="form-control form-control-sm text-end" data-tp-field="draft-item-share"
                                       data-key="${key}" value="${escapeHtml(item.share_text)}" placeholder="kg elle"
                                       title="Boş bırakılırsa kg her iş emrinde elle girilir"></td>
                            <td class="text-end"><button type="button" class="btn btn-sm btn-outline-danger" data-tp-action="draft-remove-item"
                                       data-key="${key}" aria-label="Sil"><i class="fas fa-trash"></i></button></td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <button type="button" class="btn btn-sm btn-outline-primary mb-3" data-tp-action="draft-add-item">
            <i class="fas fa-plus me-1"></i>Kademe ekle
        </button>
        <div class="d-flex align-items-center gap-2">
            ${draft.id ? `
                <button type="button" class="btn btn-sm ${state.draftConfirmDelete ? 'btn-danger' : 'btn-outline-danger'}" data-tp-action="draft-delete"
                        ${state.draftSaving ? 'disabled' : ''}>
                    <i class="fas fa-trash me-1"></i>${state.draftConfirmDelete ? 'Silmeyi onayla' : 'Şablonu sil'}
                </button>` : ''}
            <span class="me-auto"></span>
            <button type="button" class="btn btn-sm btn-primary wp-draft-save" data-tp-action="draft-save" ${state.draftSaving ? 'disabled' : ''}>
                ${state.draftSaving ? '<span class="spinner-border spinner-border-sm me-1"></span>Kaydediliyor…' : '<i class="fas fa-save me-1"></i>Şablonu kaydet'}
            </button>
        </div>
    `;
}

function renderFooter() {
    const footer = modalEl.querySelector('.tp-footer');
    const { jobCount, weightCount, tierCount, updatedCount, deletedCount } = summarize(
        state.jobs, state.edits, state.tiers, state.changes);
    const parts = [];
    if (weightCount) parts.push(`<strong>${weightCount}</strong> ağırlık`);
    if (tierCount) parts.push(`<strong>${tierCount}</strong> yeni kademe`);
    if (updatedCount) parts.push(`<strong>${updatedCount}</strong> kademe düzenlemesi`);
    if (deletedCount) parts.push(`<strong>${deletedCount}</strong> kademe silme`);
    const summary = jobCount
        ? `<strong>${jobCount}</strong> iş emrinde ${parts.join(', ')} kaydedilecek`
        : 'Henüz değişiklik yok';
    footer.innerHTML = `
        <div class="tp-summary">${summary}</div>
        ${state.confirmClose ? `
            <div class="tp-close-confirm" role="alert">
                <span>Kaydedilmemiş değişiklikler silinecek.</span>
                <button type="button" class="btn btn-sm btn-link" data-tp-action="close-cancel">Vazgeç</button>
                <button type="button" class="btn btn-sm btn-danger" data-tp-action="close-discard">Kaydetmeden kapat</button>
            </div>` : ''}
        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" ${state.saving ? 'disabled' : ''}>İptal</button>
        <button type="button" class="btn btn-primary" data-tp-action="save" ${jobCount && !state.saving ? '' : 'disabled'}>
            ${state.saving
                ? '<span class="spinner-border spinner-border-sm me-1"></span>Kaydediliyor…'
                : '<i class="fas fa-save me-1"></i>Kaydet'}
        </button>
    `;
}

function refreshAfterPlanChange() {
    state.confirmClose = false;
    renderBulkBar();
    renderJobList();
    renderDetail();
    renderFooter();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function focusJob(jobNo) {
    if (!state.jobByNo.has(jobNo)) return;
    if (state.view === 'templates') state.view = 'detail';
    else if (state.focused === jobNo) return;
    state.focused = jobNo;
    setActiveRow(jobNo);
    renderDetail();
}

function applyTemplate(jobNos, templateId, { skipDuplicates }) {
    const template = state.templates.find((t) => String(t.id) === String(templateId));
    if (!template || !(template.items || []).length) {
        showNotification('Seçilen şablonda kademe yok', 'warning');
        return;
    }
    let applied = 0;
    let skipped = 0;
    jobNos.forEach((jobNo) => {
        const rows = tiersOf(jobNo);
        if (skipDuplicates && planHasTemplate(rows, templateId)) {
            skipped += 1;
            return;
        }
        setTiers(jobNo, [...rows, ...tiersFromTemplate(template)]);
        applied += 1;
    });
    refreshAfterPlanChange();
    if (applied) {
        const shared = template.items.some((i) => i.weight_share_pct !== null && i.weight_share_pct !== undefined);
        const manual = template.items.some((i) => i.weight_share_pct === null || i.weight_share_pct === undefined);
        const missing = shared ? jobNos.filter((no) => weightOf(no) === null).length : 0;
        showNotification(
            (jobNos.length === 1 ? `«${template.name}» eklendi` : `«${template.name}» ${applied} iş emrine eklendi`)
            + (skipped ? `, ${skipped} iş emrinde zaten vardı` : '')
            + (missing ? `. ${missing} iş emrinin ağırlığı girilince kademeler boyutlanacak` : '')
            + (manual ? '. Payı boş kademelerin kg\'ını girin (Enter sıradaki boş kg\'ya geçer)' : ''),
            'success');
    } else if (skipped) {
        showNotification(`«${template.name}» seçili iş emirlerinin hepsinde zaten var`, 'info');
    }
}

function startBulkApply() {
    const templateId = state.bulkTemplateId;
    const targets = selectedPlannable();
    if (!templateId || targets.length === 0) return;
    const withTiers = targets.filter((no) => state.jobByNo.get(no).tiers.length > 0);
    if (withTiers.length > 0) {
        state.pendingBulk = { templateId, targets, withTiers };
        renderBulkBar();
        return;
    }
    applyTemplate(targets, templateId, { skipDuplicates: true });
}

function finishBulkApply(onlyEmpty) {
    const confirm = state.pendingBulk;
    state.pendingBulk = null;
    if (!confirm) return;
    const targets = onlyEmpty ? confirm.targets.filter((no) => !confirm.withTiers.includes(no)) : confirm.targets;
    if (targets.length === 0) {
        renderBulkBar();
        return;
    }
    applyTemplate(targets, confirm.templateId, { skipDuplicates: true });
}

function copyFocusedTiersToSelected() {
    const source = tiersOf(state.focused);
    const targets = selectedPlannable().filter((no) => no !== state.focused);
    if (!source.length || !targets.length) return;
    const sourceWeight = weightOf(state.focused);
    targets.forEach((jobNo) => setTiers(jobNo, [...tiersOf(jobNo), ...cloneTiers(source, sourceWeight)]));
    refreshAfterPlanChange();
    showNotification(`${source.length} kademe ${targets.length} iş emrine, kendi ağırlıklarına göre kopyalandı`, 'success');
}

function updateTier(key, patch) {
    const row = tiersOf(state.focused).find((r) => r.key === key);
    if (!row) return null;
    Object.assign(row, patch);
    if (state.error && state.error.jobNo === state.focused) state.error = null;
    return row;
}

function clearJobError(jobNo) {
    if (state.error && state.error.jobNo === jobNo) state.error = null;
}

/** Stage one field of an existing tier of the focused job. */
function updateExisting(id, field, value) {
    const tier = state.jobByNo.get(state.focused).tiers.find((t) => t.id === Number(id));
    if (!tier) return;
    setExistingField(changeOf(state.focused, true), tier, field, value);
    clearJobError(state.focused);
}

function focusTierKg(key) {
    const input = modalEl.querySelector(`[data-tp-field="tier-kg"][data-key="${CSS.escape(key)}"]`);
    if (input) {
        input.focus();
        input.select();
    }
}

/**
 * Enter in a tier's kg cell: commit it, then go to the next tier still
 * waiting for a hand-typed kg: later on this job first, then on the next job
 * order down the list. Typing kg for a whole tree stays on the keyboard.
 */
function advanceToNextManualKg(input) {
    const key = input.dataset.key;
    const jobNo = state.focused;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const rows = tiersOf(jobNo);
    const index = rows.findIndex((r) => r.key === key);
    if (index >= 0 && awaitsManualKg(rows[index])) return; // nothing readable was typed: stay
    const later = rows.slice(index + 1).find(awaitsManualKg);
    if (later) {
        focusTierKg(later.key);
        return;
    }
    const jobs = visibleJobs();
    const start = jobs.findIndex((j) => j.job_no === jobNo);
    const next = [...jobs.slice(start + 1), ...jobs.slice(0, Math.max(start, 0))]
        .find((j) => tiersOf(j.job_no).some(awaitsManualKg));
    if (!next) {
        showNotification('Kg bekleyen kademe kalmadı', 'success');
        return;
    }
    focusJob(next.job_no);
    const row = rowEl(next.job_no);
    if (row) row.scrollIntoView({ block: 'nearest' });
    focusTierKg(tiersOf(next.job_no).find(awaitsManualKg).key);
}

/** Spread a pasted block over the weight column. */
function pasteWeights(startJobNo, entries) {
    const visible = visibleJobs();
    let applied = 0;
    let unknown = 0;
    if (entries.every((e) => e.jobNo)) {
        entries.forEach(({ jobNo, text }) => {
            const job = state.jobByNo.get(jobNo);
            if (!job || !job.can_plan) {
                unknown += 1;
                return;
            }
            setWeightText(jobNo, text);
            applied += 1;
        });
    } else {
        let index = visible.findIndex((j) => j.job_no === startJobNo);
        entries.forEach(({ text }) => {
            while (index < visible.length && !visible[index].can_plan) index += 1;
            if (index >= visible.length) return;
            setWeightText(visible[index].job_no, text);
            applied += 1;
            index += 1;
        });
    }
    refreshAfterPlanChange();
    showNotification(
        `${applied} ağırlık yapıştırıldı${unknown ? `, ${unknown} satır atlandı (iş emri bu ağaçta yok ya da kapalı)` : ''}`,
        unknown ? 'warning' : 'success');
}

function moveWeightFocus(fromInput, step) {
    const inputs = [...modalEl.querySelectorAll('.tp-job-list [data-tp-field="weight"]:not(:disabled)')];
    const next = inputs[inputs.indexOf(fromInput) + step];
    if (next) {
        next.focus();
        next.select();
    }
}

// ---- Templates -------------------------------------------------------------

function draftItem(item = {}) {
    return {
        key: newTierKey(),
        tier_type: item.tier_type || WELDING,
        name: item.name || '',
        currency: item.currency || 'TRY',
        price_text: item.price_per_kg === null || item.price_per_kg === undefined ? '' : formatDecimal(Number(item.price_per_kg), 4),
        // Empty share = the tier's kg is typed per job order.
        share_text: item.weight_share_pct === null || item.weight_share_pct === undefined
            ? '' : formatDecimal(Number(item.weight_share_pct)),
    };
}

function openTemplateManager(draft) {
    state.view = 'templates';
    state.draft = draft;
    state.draftConfirmDelete = false;
    renderDetail();
}

function editTemplate(id) {
    const template = state.templates.find((t) => String(t.id) === String(id));
    if (!template) return;
    openTemplateManager({
        id: template.id,
        name: template.name,
        description: template.description || '',
        is_active: template.is_active,
        items: template.items.map(draftItem),
    });
}

async function saveDraft() {
    const draft = state.draft;
    const items = [];
    for (const item of draft.items) {
        const price = parseDecimal(item.price_text);
        const share = parseDecimal(item.share_text);
        if (!item.name.trim() || price === null || Number.isNaN(price) || price < 0) {
            showNotification('Her kademenin adı ve fiyatı olmalı', 'error');
            return;
        }
        if (share !== null && (Number.isNaN(share) || share <= 0 || share > 100)) {
            showNotification('Pay %0–100 arası olmalı ya da boş bırakılmalı', 'error');
            return;
        }
        items.push({
            tier_type: item.tier_type,
            name: item.name.trim(),
            price_per_kg: roundTo(price, 4).toFixed(4),
            currency: item.currency,
            weight_share_pct: share === null ? null : roundTo(share, 2).toFixed(2),
        });
    }
    if (!draft.name.trim()) {
        showNotification('Şablon adı boş olamaz', 'error');
        return;
    }
    const payload = { name: draft.name.trim(), description: draft.description, is_active: draft.is_active, items };
    const current = state;
    current.draftSaving = true;
    renderDetail();
    try {
        const saved = draft.id
            ? await updatePriceTierTemplate(draft.id, payload)
            : await createPriceTierTemplate(payload);
        if (state !== current) return;
        state.templates = await listPriceTierTemplates();
        state.draft = { ...draft, id: saved.id, items: saved.items.map(draftItem) };
        showNotification(`«${saved.name}» kaydedildi`, 'success');
    } catch (error) {
        console.error('Error saving price tier template:', error);
        showNotification(error.message || 'Şablon kaydedilemedi', 'error');
    } finally {
        if (state === current) {
            current.draftSaving = false;
            renderBulkBar();
            renderDetail();
        }
    }
}

async function deleteDraft() {
    const draft = state.draft;
    if (!draft || !draft.id) return;
    if (!state.draftConfirmDelete) {
        state.draftConfirmDelete = true;
        renderDetail();
        return;
    }
    const current = state;
    current.draftSaving = true;
    renderDetail();
    try {
        await deletePriceTierTemplate(draft.id);
        if (state !== current) return;
        state.templates = state.templates.filter((t) => t.id !== draft.id);
        if (String(state.bulkTemplateId) === String(draft.id)) state.bulkTemplateId = '';
        if (String(state.detailTemplateId) === String(draft.id)) state.detailTemplateId = '';
        state.draft = null;
        showNotification(`«${draft.name}» silindi`, 'success');
    } catch (error) {
        console.error('Error deleting price tier template:', error);
        showNotification(error.message || 'Şablon silinemedi', 'error');
    } finally {
        if (state === current) {
            current.draftSaving = false;
            current.draftConfirmDelete = false;
            renderBulkBar();
            renderDetail();
        }
    }
}

// ---- Save ------------------------------------------------------------------

function formatServerError(data) {
    if (!data || typeof data !== 'object') return '';
    let message = data.message || data.detail || '';
    if (data.errors && typeof data.errors === 'object') {
        const parts = Object.entries(data.errors).map(([field, value]) => {
            const text = Array.isArray(value) ? value.join(' ') : String(value);
            return `${SERVER_FIELD_LABELS[field] || field}: ${text}`;
        });
        if (parts.length) message = `${message} ${parts.join('; ')}`.trim();
    }
    return message;
}

async function save() {
    for (const job of changedJobs(state.jobs, state.edits, state.tiers, state.changes)) {
        const problems = validateJob(job, state.edits.get(job.job_no), tiersOf(job.job_no), changeOf(job.job_no));
        if (problems.length) {
            const [first] = problems;
            state.error = { jobNo: job.job_no, key: first.key, field: first.field, message: `${job.job_no}: ${first.message}` };
            state.focused = job.job_no;
            state.view = 'detail';
            refreshAfterPlanChange();
            showNotification(state.error.message, 'error');
            return;
        }
    }

    const payload = buildBulkPayload(state.jobs, state.edits, state.tiers, state.changes);
    if (payload.plans.length === 0) return;
    const current = state;
    current.saving = true;
    current.confirmClose = false;
    renderFooter();

    try {
        const response = await bulkPlanPriceTiers(payload);
        current.allowClose = true;
        modal.hide();
        showNotification(response.message || 'Kaydedildi', 'success');
        if (typeof current.onSaved === 'function') current.onSaved(response);
    } catch (error) {
        console.error('Error saving weight plans:', error);
        if (state !== current) return;
        const data = error.data || {};
        const jobNo = data.job_order && state.jobByNo.has(data.job_order) ? data.job_order : null;
        const rows = jobNo ? tiersOf(jobNo) : [];
        let key = jobNo && Number.isInteger(data.index) && rows[data.index] ? rows[data.index].key : null;
        if (jobNo && Number.isInteger(data.tier_id)) key = `e${data.tier_id}`;
        const message = formatServerError(data) || 'Kaydedilemedi';
        state.error = { jobNo, key, field: key ? null : 'weight', message };
        if (jobNo) {
            state.focused = jobNo;
            state.view = 'detail';
        }
        showNotification(message, 'error');
    } finally {
        if (state === current) {
            current.saving = false;
            refreshAfterPlanChange();
        }
    }
}

// ---------------------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------------------

function onClick(event) {
    if (!state) return;
    const actionEl = event.target.closest('[data-tp-action]');
    if (actionEl) {
        handleAction(actionEl.dataset.tpAction, actionEl);
        return;
    }
    const check = event.target.closest('[data-tp-field="job-check"]');
    if (check) {
        handleJobCheck(check, event.shiftKey);
        return;
    }
    if (event.target.closest('[data-tp-field="weight"]')) return; // focusin already focused the job
    const row = event.target.closest('.tp-job-row');
    if (row) focusJob(row.dataset.job);
}

function handleJobCheck(check, shiftKey) {
    const jobs = visibleJobs();
    const index = parseInt(check.dataset.index, 10);
    const checked = check.checked;
    if (shiftKey && state.lastCheckedIndex !== null && state.lastCheckedIndex < jobs.length) {
        const [from, to] = [state.lastCheckedIndex, index].sort((a, b) => a - b);
        jobs.slice(from, to + 1).forEach((job) => {
            if (!job.can_plan) return;
            if (checked) state.selected.add(job.job_no);
            else state.selected.delete(job.job_no);
        });
    } else if (checked) {
        state.selected.add(check.dataset.job);
    } else {
        state.selected.delete(check.dataset.job);
    }
    state.lastCheckedIndex = index;
    state.pendingBulk = null;
    renderBulkBar();
    renderJobList();
    renderDetail();
}

function handleAction(action, el) {
    const key = el.dataset.key;
    switch (action) {
        case 'select-no-tiers':
            visibleJobs().forEach((j) => {
                if (j.can_plan && j.tiers.length === 0) state.selected.add(j.job_no);
            });
            state.pendingBulk = null;
            renderBulkBar();
            renderJobList();
            renderDetail();
            break;
        case 'clear-selection':
            state.selected.clear();
            state.pendingBulk = null;
            state.lastCheckedIndex = null;
            renderBulkBar();
            renderJobList();
            renderDetail();
            break;
        case 'bulk-apply':
            startBulkApply();
            break;
        case 'bulk-confirm-empty':
            finishBulkApply(true);
            break;
        case 'bulk-confirm-all':
            finishBulkApply(false);
            break;
        case 'bulk-confirm-cancel':
            state.pendingBulk = null;
            renderBulkBar();
            break;
        case 'bulk-clear': {
            const targets = selectedPlannable().filter((no) => tiersOf(no).length > 0);
            const count = targets.reduce((sum, no) => sum + tiersOf(no).length, 0);
            targets.forEach((no) => setTiers(no, []));
            refreshAfterPlanChange();
            if (count) showNotification(`${targets.length} iş emrinden ${count} yeni kademe kaldırıldı`, 'info');
            break;
        }
        case 'open-templates':
            openTemplateManager(state.draft);
            break;
        case 'close-templates':
            state.view = 'detail';
            state.draftConfirmDelete = false;
            renderDetail();
            break;
        case 'new-template':
            openTemplateManager({ id: null, name: '', description: '', is_active: true, items: [draftItem()] });
            break;
        case 'edit-template':
            editTemplate(el.dataset.id);
            break;
        case 'save-as-template': {
            const rows = tiersOf(state.focused);
            const items = templateItemsFromRows(rows);
            openTemplateManager({ id: null, name: '', description: '', is_active: true, items: items.map(draftItem) });
            showNotification('Şablona bir ad verip kaydedin', 'info');
            break;
        }
        case 'draft-add-item':
            state.draft.items.push(draftItem({ currency: state.draft.items.at(-1)?.currency }));
            renderDetail();
            break;
        case 'draft-remove-item':
            state.draft.items = state.draft.items.filter((item) => item.key !== key);
            renderDetail();
            break;
        case 'draft-save':
            saveDraft();
            break;
        case 'draft-delete':
            deleteDraft();
            break;
        case 'detail-apply-template':
            if (state.detailTemplateId) applyTemplate([state.focused], state.detailTemplateId, { skipDuplicates: false });
            break;
        case 'add-tier': {
            const rows = tiersOf(state.focused);
            setTiers(state.focused, [...rows, newTierRow(rows, weightOf(state.focused))]);
            refreshAfterPlanChange();
            break;
        }
        case 'remove-tier':
            setTiers(state.focused, tiersOf(state.focused).filter((r) => r.key !== key));
            refreshAfterPlanChange();
            break;
        case 'copy-to-selected':
            copyFocusedTiersToSelected();
            break;
        case 'clear-tiers':
            setTiers(state.focused, []);
            refreshAfterPlanChange();
            break;
        case 'revert-weight':
            state.edits.delete(state.focused);
            if (state.error && state.error.jobNo === state.focused) state.error = null;
            refreshAfterPlanChange();
            break;
        case 'ex-delete': {
            const change = changeOf(state.focused, true);
            const id = Number(el.dataset.id);
            change.edits.delete(id);
            change.deletes.add(id);
            clearJobError(state.focused);
            refreshAfterPlanChange();
            break;
        }
        case 'ex-restore':
            changeOf(state.focused, true).deletes.delete(Number(el.dataset.id));
            clearJobError(state.focused);
            refreshAfterPlanChange();
            break;
        case 'save':
            save();
            break;
        case 'close-cancel':
            state.confirmClose = false;
            renderFooter();
            break;
        case 'close-discard':
            state.allowClose = true;
            modal.hide();
            break;
        default:
            break;
    }
}

function findDraftItem(key) {
    return state.draft ? state.draft.items.find((item) => item.key === key) : null;
}

function onInput(event) {
    if (!state) return;
    const el = event.target;
    const field = el.dataset.tpField;
    switch (field) {
        case 'search':
            state.search = el.value;
            state.lastCheckedIndex = null;
            renderJobList();
            break;
        case 'weight':
            setWeightText(el.dataset.job, el.value);
            refreshJobRow(el.dataset.job);
            renderFooter();
            break;
        case 'tier-name':
            updateTier(el.dataset.key, { name: el.value });
            break;
        case 'ex-name': {
            updateExisting(el.dataset.id, 'name', el.value);
            const edit = changeOf(state.focused)?.edits.get(Number(el.dataset.id));
            el.classList.toggle('is-changed', !!(edit && 'name' in edit));
            refreshJobRow(state.focused);
            renderFooter();
            break;
        }
        case 'draft-name':
            state.draft.name = el.value;
            break;
        case 'draft-description':
            state.draft.description = el.value;
            break;
        case 'draft-item-name':
        case 'draft-item-price':
        case 'draft-item-share': {
            const item = findDraftItem(el.dataset.key);
            if (!item) break;
            if (field === 'draft-item-name') item.name = el.value;
            if (field === 'draft-item-price') item.price_text = el.value;
            if (field === 'draft-item-share') item.share_text = el.value;
            break;
        }
        default:
            break;
    }
}

function onChange(event) {
    if (!state) return;
    const el = event.target;
    const field = el.dataset.tpField;
    const key = el.dataset.key;
    switch (field) {
        case 'filter':
            state.filter = el.value;
            state.lastCheckedIndex = null;
            renderJobList();
            break;
        case 'check-visible':
            visibleJobs().forEach((job) => {
                if (!job.can_plan) return;
                if (el.checked) state.selected.add(job.job_no);
                else state.selected.delete(job.job_no);
            });
            state.pendingBulk = null;
            renderBulkBar();
            renderJobList();
            renderDetail();
            break;
        case 'bulk-template':
            state.bulkTemplateId = el.value;
            state.pendingBulk = null;
            renderBulkBar();
            break;
        case 'detail-template':
            state.detailTemplateId = el.value;
            renderDetail();
            break;
        case 'weight': {
            // Committed (blur / Enter): show the number as it was read
            // ("3.250" → "3250"), so a misread is visible at once.
            const edit = state.edits.get(el.dataset.job);
            if (edit && typeof edit.value === 'number' && !Number.isNaN(edit.value)) {
                edit.text = formatDecimal(edit.value);
                el.value = edit.text;
            }
            if (el.dataset.job === state.focused) renderDetail();
            break;
        }
        case 'tier-type':
            updateTier(key, { tier_type: el.value });
            refreshJobRow(state.focused);
            renderDetail();
            break;
        case 'tier-currency':
            updateTier(key, { currency: el.value });
            break;
        case 'tier-price': {
            const price = parseDecimal(el.value);
            updateTier(key, { price_per_kg: price === null || Number.isNaN(price) ? price : roundTo(price, 4) });
            renderDetail();
            break;
        }
        case 'tier-share': {
            const share = parseDecimal(el.value);
            if (share === null) {
                // No share: from now on this tier's kg is typed by hand.
                updateTier(key, { share: null, baseShare: null });
            } else if (Number.isNaN(share) || share <= 0) {
                showNotification('Pay 0\'dan büyük bir yüzde olmalı ya da boş bırakılmalı', 'warning');
            } else {
                updateTier(key, { share: roundTo(share, 2), baseShare: roundTo(share, 2), kg: null });
            }
            refreshJobRow(state.focused);
            renderDetail();
            break;
        }
        case 'tier-kg': {
            const kg = parseDecimal(el.value);
            const row = tiersOf(state.focused).find((r) => r.key === key);
            if (!row) break;
            if (kg === null) {
                // Emptied: back to the share it started from (a hand-sized
                // tier just waits for its kg again).
                updateTier(key, { share: row.baseShare ?? null, kg: null });
            } else if (Number.isNaN(kg) || kg <= 0) {
                showNotification('Ayrılan ağırlık 0\'dan büyük olmalı', 'warning');
            } else {
                updateTier(key, { kg: roundTo(kg, 2), share: null });
            }
            refreshJobRow(state.focused);
            renderDetail();
            break;
        }
        case 'ex-type':
        case 'ex-currency':
            updateExisting(el.dataset.id, field === 'ex-type' ? 'tier_type' : 'currency', el.value);
            refreshJobRow(state.focused);
            renderDetail();
            renderFooter();
            break;
        case 'ex-price':
        case 'ex-kg': {
            const value = parseDecimal(el.value);
            const places = field === 'ex-price' ? 4 : 2;
            updateExisting(el.dataset.id, field === 'ex-price' ? 'price_per_kg' : 'allocated_weight_kg',
                value === null || Number.isNaN(value) ? NaN : roundTo(value, places));
            refreshJobRow(state.focused);
            renderDetail();
            renderFooter();
            break;
        }
        case 'draft-active':
            state.draft.is_active = el.checked;
            break;
        case 'draft-item-type':
        case 'draft-item-currency': {
            const item = findDraftItem(key);
            if (!item) break;
            if (field === 'draft-item-type') item.tier_type = el.value;
            else item.currency = el.value;
            break;
        }
        default:
            break;
    }
}

function onKeydown(event) {
    if (!state) return;
    const el = event.target;
    if (el.dataset.tpField === 'tier-kg' && event.key === 'Enter') {
        event.preventDefault();
        advanceToNextManualKg(el);
        return;
    }
    if (el.dataset.tpField !== 'weight') return;
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
        event.preventDefault();
        moveWeightFocus(el, 1);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveWeightFocus(el, -1);
    } else if (event.key === 'Escape') {
        // Undo this cell instead of closing the modal.
        event.preventDefault();
        event.stopPropagation();
        const job = state.jobByNo.get(el.dataset.job);
        state.edits.delete(job.job_no);
        el.value = formatDecimal(savedWeight(job));
        refreshJobRow(job.job_no);
        renderFooter();
        if (job.job_no === state.focused) renderDetail();
    }
}

function onPaste(event) {
    if (!state) return;
    const el = event.target;
    if (el.dataset.tpField !== 'weight') return;
    const text = (event.clipboardData || window.clipboardData)?.getData('text') || '';
    const entries = parsePastedColumn(text);
    if (entries.length < 2 && !entries.some((e) => e.jobNo)) return; // a single value: let the input take it
    event.preventDefault();
    pasteWeights(el.dataset.job, entries);
}
