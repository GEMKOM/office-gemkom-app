/**
 * Görev Planlama — the "Görev Ekle" modal on a top-level job order.
 *
 * After a sales offer becomes a job order, planning has to give every job
 * order in the tree its department tasks, and a tree can hold hundreds of
 * children. This modal shows the whole subtree at once: tick children and
 * apply a template to all of them, copy one child's plan to others, or edit
 * rows by hand. Nothing is written until Kaydet, which sends every plan in one
 * atomic request (POST /department-tasks/bulk_plan/).
 *
 * Plan state and its rules live in taskPlannerModel.js; this file is the DOM.
 */
import { ModernDropdown } from '../../components/dropdown/dropdown.js';
import { showNotification } from '../../components/notification/notification.js';
import { escapeHtml } from '../../utils/text.js';
import { getJobOrderTaskPlanner } from '../../apis/projects/jobOrders.js';
import { bulkPlanDepartmentTasks, getDepartmentChoices } from '../../apis/projects/departmentTasks.js';
import { listTaskTemplates, getTaskTemplateById, TASK_TYPE_OPTIONS } from '../../apis/projects/taskTemplates.js';
import {
    buildBulkPlanPayload,
    cloneRows,
    displayOrder,
    newMainRow,
    newSubRow,
    nextSequenceBase,
    planHasTemplate,
    removeRow,
    rowKeyForTempId,
    rowsFromTemplate,
    setRowDepartment,
    summarizePlans,
    validatePlan,
} from './taskPlannerModel.js';

const MODAL_ID = 'task-planner-modal';

const FILTERS = [
    { value: 'all', label: 'Tüm iş emirleri' },
    { value: 'unplanned', label: 'Planlanmamış' },
    { value: 'no_tasks', label: 'Kayıtlı görevi olmayanlar' },
    { value: 'planned', label: 'Yeni görev eklenenler' },
];

const TASK_STATUS_CLASS = {
    completed: 'status-green',
    in_progress: 'status-blue',
    blocked: 'status-red',
    on_hold: 'status-orange',
    skipped: 'status-grey',
    cancelled: 'status-grey',
    pending: 'status-grey',
};

const JOB_STATUS_CLASS = {
    draft: 'status-grey',
    on_hold: 'status-orange',
    completed: 'status-green',
    cancelled: 'status-grey',
};

const SERVER_FIELD_LABELS = {
    department: 'Departman',
    title: 'Başlık',
    weight: 'Ağırlık',
    sequence: 'Sıra',
    task_type: 'Görev tipi',
    description: 'Açıklama',
};

let modalEl = null;
let modal = null;
let state = null;
let depDropdowns = [];

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

/**
 * Open the planner for a top-level job order.
 * @param {string} jobNo
 * @param {{onSaved?: Function}} options - called after a successful save
 */
export async function openTaskPlanner(jobNo, { onSaved } = {}) {
    ensureModal();
    state = {
        rootJobNo: jobNo,
        onSaved,
        loading: true,
        loadError: null,
        jobs: [],
        jobByNo: new Map(),
        plans: new Map(),
        selected: new Set(),
        focused: null,
        search: '',
        filter: 'all',
        templates: [],
        templateCache: new Map(),
        departments: [],
        bulkTemplateId: '',
        detailTemplateId: '',
        pendingBulk: null,
        confirmClose: false,
        saving: false,
        error: null,
        allowClose: false,
        lastCheckedIndex: null,
    };
    const opened = state;
    renderAll();
    modal.show();

    try {
        const [tree, departments, templates] = await Promise.all([
            getJobOrderTaskPlanner(jobNo),
            getDepartmentChoices(),
            listTaskTemplates({ is_active: true })
                .then((res) => res.results || res || [])
                .catch(() => []),
        ]);
        if (state !== opened) return; // closed or reopened while loading
        state.jobs = tree.job_orders || [];
        state.jobByNo = new Map(state.jobs.map((j) => [j.job_no, j]));
        state.departments = departments || [];
        state.templates = templates;
        const firstOpen = state.jobs.find((j) => j.can_plan && j.tasks.length === 0);
        state.focused = (firstOpen || state.jobs[0] || {}).job_no || null;
    } catch (error) {
        if (state !== opened) return;
        console.error('Error loading task planner:', error);
        state.loadError = 'İş emri ağacı yüklenemedi.';
    }
    state.loading = false;
    renderAll();
}

function ensureModal() {
    if (modalEl) return;
    modalEl = document.createElement('div');
    modalEl.className = 'modal fade tp-modal';
    modalEl.id = MODAL_ID;
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-labelledby', `${MODAL_ID}-title`);
    modalEl.innerHTML = `
        <div class="modal-dialog modal-fullscreen">
            <div class="modal-content">
                <div class="modal-header tp-header">
                    <div class="tp-header-text">
                        <h5 class="modal-title" id="${MODAL_ID}-title">
                            <i class="fas fa-tasks me-2 text-primary"></i>Görev Planlama
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
                                <span class="tp-col-counts">Kayıtlı / Yeni</span>
                            </div>
                            <div class="tp-job-list" role="list"></div>
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
        if (summarizePlans(state.plans).taskCount > 0) {
            event.preventDefault();
            state.confirmClose = true;
            renderFooter();
        }
    });
    modalEl.addEventListener('hidden.bs.modal', () => {
        destroyDependencyDropdowns();
        state = null;
    });

    modalEl.addEventListener('click', onClick);
    modalEl.addEventListener('input', onInput);
    modalEl.addEventListener('change', onChange);
    modalEl.addEventListener('keydown', (event) => {
        const row = event.target.closest('.tp-job-row');
        if (row && event.target === row && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            focusJob(row.dataset.job);
        }
    });
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

function rowsOf(jobNo) {
    return state.plans.get(jobNo) || [];
}

function setRows(jobNo, rows) {
    state.plans.set(jobNo, rows);
    if (state.error && state.error.jobNo === jobNo) state.error = null;
}

function departmentLabel(value) {
    return (state.departments.find((d) => d.value === value) || {}).label || value || '';
}

function taskTypeLabel(value) {
    return (TASK_TYPE_OPTIONS.find((t) => t.value === value) || {}).label || value;
}

function templateName(id) {
    const template = state.templates.find((t) => String(t.id) === String(id));
    return template ? template.name : '';
}

async function loadTemplate(id) {
    const key = String(id);
    if (!state.templateCache.has(key)) {
        state.templateCache.set(key, await getTaskTemplateById(parseInt(key, 10)));
    }
    return state.templateCache.get(key);
}

function normalize(text) {
    return (text || '').toLocaleLowerCase('tr');
}

function visibleJobs() {
    const term = normalize(state.search.trim());
    return state.jobs.filter((job) => {
        if (term && !normalize(job.job_no).includes(term) && !normalize(job.title).includes(term)) return false;
        const pending = rowsOf(job.job_no).length;
        switch (state.filter) {
            case 'unplanned': return job.can_plan && job.tasks.length === 0 && pending === 0;
            case 'no_tasks': return job.tasks.length === 0;
            case 'planned': return pending > 0;
            default: return true;
        }
    });
}

function selectedPlannable() {
    return state.jobs.filter((j) => j.can_plan && state.selected.has(j.job_no)).map((j) => j.job_no);
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
        ${state.templates.map((t) => `
            <option value="${t.id}" ${String(t.id) === String(selectedId) ? 'selected' : ''}>
                ${escapeHtml(t.name)}${t.is_default ? ' (Varsayılan)' : ''}
            </option>`).join('')}
    `;
}

function renderBulkBar() {
    const bar = modalEl.querySelector('.tp-bulkbar');
    if (state.loading || state.loadError) {
        bar.innerHTML = '';
        return;
    }
    const selected = selectedPlannable();
    const pendingInSelection = selected.filter((no) => rowsOf(no).length > 0).length;
    const confirm = state.pendingBulk;
    bar.innerHTML = `
        <div class="tp-bulk-row">
            <span class="tp-sel-count">${selected.length
                ? `<strong>${selected.length}</strong> iş emri seçili`
                : 'Toplu işlem için iş emri seçin'}</span>
            <span class="tp-bulk-links">
                <button type="button" class="btn btn-link btn-sm" data-tp-action="select-no-tasks">Görevsizleri seç</button>
                ${selected.length ? '<button type="button" class="btn btn-link btn-sm" data-tp-action="clear-selection">Seçimi kaldır</button>' : ''}
            </span>
        </div>
        <div class="tp-bulk-row">
            <select class="form-select form-select-sm" data-tp-field="bulk-template" aria-label="Şablon">
                ${templateOptions(state.bulkTemplateId, 'Şablon seçin…')}
            </select>
            <button type="button" class="btn btn-sm btn-primary text-nowrap" data-tp-action="bulk-apply"
                    ${selected.length && state.bulkTemplateId ? '' : 'disabled'}>
                <i class="fas fa-layer-group me-1"></i>Seçililere uygula
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-tp-action="bulk-clear"
                    title="Seçililere eklenen yeni görevleri temizle" aria-label="Seçililere eklenen yeni görevleri temizle"
                    ${pendingInSelection ? '' : 'disabled'}>
                <i class="fas fa-eraser"></i>
            </button>
        </div>
        ${confirm ? `
            <div class="tp-inline-confirm" role="alert">
                <div>
                    Seçili ${confirm.targets.length} iş emrinin <strong>${confirm.withTasks.length}</strong> tanesinde
                    zaten kayıtlı görev var. «${escapeHtml(templateName(confirm.templateId))}» nereye uygulansın?
                </div>
                <div class="tp-inline-confirm-actions">
                    <button type="button" class="btn btn-sm btn-primary" data-tp-action="bulk-confirm-empty"
                            ${confirm.targets.length - confirm.withTasks.length ? '' : 'disabled'}>
                        Yalnızca görevsizlere (${confirm.targets.length - confirm.withTasks.length})
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-tp-action="bulk-confirm-all">
                        Hepsine (${confirm.targets.length})
                    </button>
                    <button type="button" class="btn btn-sm btn-link" data-tp-action="bulk-confirm-cancel">Vazgeç</button>
                </div>
            </div>` : ''}
    `;
}

function jobBadges(job) {
    const pending = rowsOf(job.job_no).length;
    const existing = job.tasks.length
        ? `<span class="status-badge status-grey tp-badge" title="Kayıtlı görev">${job.tasks.length}</span>`
        : `<span class="status-badge ${job.can_plan ? 'status-orange' : 'status-grey'} tp-badge" title="Kayıtlı görev yok">0</span>`;
    const added = pending
        ? `<span class="status-badge status-blue tp-badge" title="Eklenecek görev">+${pending}</span>`
        : '<span class="tp-badge-empty">–</span>';
    return `${existing}${added}`;
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
        const classes = ['tp-job-row'];
        if (job.job_no === state.focused) classes.push('is-active');
        if (!job.can_plan) classes.push('is-disabled');
        if (job.job_no === errorJob) classes.push('has-error');
        const statusBadge = job.status !== 'active'
            ? `<span class="status-badge ${JOB_STATUS_CLASS[job.status] || 'status-grey'} tp-badge">${escapeHtml(job.status_display)}</span>`
            : '';
        return `
            <div class="${classes.join(' ')}" role="listitem" data-job="${escapeHtml(job.job_no)}" data-index="${index}"
                 style="--tp-depth:${Math.min(job.depth, 6)}" tabindex="0" aria-current="${job.job_no === state.focused}">
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
                <div class="tp-job-badges">${jobBadges(job)}</div>
            </div>
        `;
    }).join('');
}

function renderExistingTasks(job) {
    if (job.tasks.length === 0) {
        return '<div class="tp-muted">Bu iş emrinde kayıtlı görev yok.</div>';
    }
    return `
        <div class="tp-existing">
            ${job.tasks.map((t) => {
                const title = t.title || t.department_display;
                const meta = [
                    title === t.department_display ? null : t.department_display,
                    t.subtask_count ? `${t.subtask_count} alt görev` : null,
                ].filter(Boolean).join(' · ');
                return `
                <div class="tp-existing-item">
                    <span class="tp-existing-seq">${t.sequence}</span>
                    <span class="tp-existing-title">
                        ${escapeHtml(title)}${meta ? ` <span class="tp-muted">· ${escapeHtml(meta)}</span>` : ''}
                    </span>
                    <span class="status-badge ${TASK_STATUS_CLASS[t.status] || 'status-grey'} tp-badge">${escapeHtml(t.status_display)}</span>
                </div>`;
            }).join('')}
        </div>
    `;
}

function renderRowsTable(job, rows) {
    if (rows.length === 0) {
        return `
            <div class="tp-empty tp-empty-plan">
                Bu iş emrine eklenecek görev yok.<br>
                Yukarıdan bir şablon ekleyin, görev ekleyin ya da soldan seçip toplu uygulayın.
            </div>`;
    }
    const errorKey = state.error && state.error.jobNo === job.job_no ? state.error.rowKey : null;
    const departmentOptions = (selected) => state.departments.map((d) => `
        <option value="${escapeHtml(d.value)}" ${d.value === selected ? 'selected' : ''}>${escapeHtml(d.label)}</option>`).join('');
    const typeOptions = (selected) => `
        <option value="">—</option>
        ${TASK_TYPE_OPTIONS.map((t) => `
            <option value="${t.value}" ${t.value === selected ? 'selected' : ''}>${escapeHtml(t.label)}</option>`).join('')}`;

    return `
        <div class="table-responsive tp-rows-wrap">
            <table class="table table-sm align-middle tp-rows">
                <colgroup>
                    <col style="width:64px"><col><col style="width:130px"><col style="width:130px">
                    <col style="width:72px"><col style="width:200px"><col style="width:80px">
                </colgroup>
                <thead>
                    <tr>
                        <th>Sıra</th><th>Başlık</th><th>Departman</th><th>Görev tipi</th>
                        <th>Ağırlık</th><th>Bağımlılıklar</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    ${displayOrder(rows).map(({ row, depth }) => {
                        const isSub = depth > 0;
                        const key = escapeHtml(row.key);
                        return `
                        <tr class="${isSub ? 'tp-subrow' : ''} ${row.key === errorKey ? 'tp-row-error' : ''}" data-key="${key}">
                            <td>
                                <input type="number" min="0" class="form-control form-control-sm" data-tp-field="row-sequence"
                                       data-key="${key}" value="${escapeHtml(row.sequence)}" aria-label="Sıra">
                            </td>
                            <td>
                                <div class="tp-title-cell" style="--tp-depth:${depth}">
                                    ${isSub ? '<span class="tp-sub-mark" aria-hidden="true">↳</span>' : ''}
                                    <input type="text" class="form-control form-control-sm" data-tp-field="row-title"
                                           data-key="${key}" value="${escapeHtml(row.title)}" maxlength="255"
                                           placeholder="${isSub ? 'Alt görev başlığı' : 'Boş bırakılırsa iş emri başlığı'}"
                                           aria-label="Başlık">
                                </div>
                            </td>
                            <td>
                                <select class="form-select form-select-sm" data-tp-field="row-department" data-key="${key}"
                                        aria-label="Departman" ${isSub ? 'disabled title="Alt görev üst görevin departmanındadır"' : ''}>
                                    ${departmentOptions(row.department)}
                                </select>
                            </td>
                            <td>
                                <select class="form-select form-select-sm" data-tp-field="row-type" data-key="${key}" aria-label="Görev tipi">
                                    ${typeOptions(row.task_type)}
                                </select>
                            </td>
                            <td>
                                <input type="number" min="1" step="1" class="form-control form-control-sm" data-tp-field="row-weight"
                                       data-key="${key}" value="${escapeHtml(row.weight)}" aria-label="Ağırlık">
                            </td>
                            <td>
                                ${isSub
                                    ? '<span class="tp-muted small">—</span>'
                                    : `<div class="tp-deps" data-deps-for="${key}"></div>`}
                            </td>
                            <td class="text-end text-nowrap">
                                ${isSub ? '' : `
                                <button type="button" class="btn btn-sm btn-outline-secondary" data-tp-action="add-subrow" data-key="${key}"
                                        title="Alt görev ekle" aria-label="Alt görev ekle"><i class="fas fa-level-down-alt"></i></button>`}
                                <button type="button" class="btn btn-sm btn-outline-danger" data-tp-action="remove-row" data-key="${key}"
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
    destroyDependencyDropdowns();
    if (state.loading || state.loadError) {
        detail.innerHTML = '';
        return;
    }
    const job = state.jobByNo.get(state.focused);
    if (!job) {
        detail.innerHTML = '<div class="tp-empty">Soldan bir iş emri seçin.</div>';
        return;
    }

    // Keep the caret where it was across the re-render.
    const active = document.activeElement;
    const refocus = active && detail.contains(active) && active.dataset.tpField
        ? { field: active.dataset.tpField, key: active.dataset.key }
        : null;
    const scrollTop = detail.scrollTop;

    const rows = rowsOf(job.job_no);
    const selected = selectedPlannable().filter((no) => no !== job.job_no);
    const error = state.error && state.error.jobNo === job.job_no ? state.error : null;

    detail.innerHTML = `
        <div class="tp-detail-head">
            <div class="min-w-0">
                <div class="tp-detail-no">
                    ${escapeHtml(job.job_no)}
                    ${job.is_phase ? '<span class="status-badge status-purple tp-badge">Faz</span>' : ''}
                    ${job.status !== 'active' ? `<span class="status-badge ${JOB_STATUS_CLASS[job.status] || 'status-grey'} tp-badge">${escapeHtml(job.status_display)}</span>` : ''}
                </div>
                <div class="tp-detail-title">${escapeHtml(job.title || '')}</div>
            </div>
        </div>
        ${error ? `<div class="alert alert-danger py-2 mb-3"><i class="fas fa-exclamation-circle me-1"></i>${escapeHtml(error.message)}</div>` : ''}

        <div class="tp-section">
            <div class="tp-section-title">Kayıtlı görevler <span class="tp-muted">(${job.tasks.length})</span></div>
            ${renderExistingTasks(job)}
        </div>

        <div class="tp-section">
            <div class="tp-section-head">
                <div class="tp-section-title">Eklenecek görevler <span class="tp-muted">(${rows.length})</span></div>
                ${job.can_plan ? `
                <div class="tp-section-actions">
                    <div class="input-group input-group-sm tp-template-add">
                        <select class="form-select" data-tp-field="detail-template" aria-label="Şablon">
                            ${templateOptions(state.detailTemplateId, 'Şablon…')}
                        </select>
                        <button type="button" class="btn btn-outline-primary" data-tp-action="detail-apply-template"
                                ${state.detailTemplateId ? '' : 'disabled'}>
                            <i class="fas fa-file-import me-1"></i>Şablonu ekle
                        </button>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-primary" data-tp-action="add-row">
                        <i class="fas fa-plus me-1"></i>Görev ekle
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-tp-action="copy-to-selected"
                            ${rows.length && selected.length ? '' : 'disabled'}
                            title="${selected.length ? 'Bu listeyi seçili iş emirlerine ekle' : 'Önce soldan hedef iş emirlerini seçin'}">
                        <i class="fas fa-copy me-1"></i>Seçililere kopyala${selected.length ? ` (${selected.length})` : ''}
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger" data-tp-action="clear-plan"
                            ${rows.length ? '' : 'disabled'}>
                        <i class="fas fa-eraser me-1"></i>Temizle
                    </button>
                </div>` : ''}
            </div>
            ${job.can_plan
                ? renderRowsTable(job, rows)
                : `<div class="tp-muted">Bu iş emri ${job.status === 'cancelled' ? 'iptal edilmiş' : 'tamamlanmış'}; görev eklenemez.</div>`}
        </div>
    `;

    if (job.can_plan) mountDependencyDropdowns(job, rows);

    detail.scrollTop = scrollTop;
    if (refocus) {
        const selector = `[data-tp-field="${refocus.field}"]${refocus.key ? `[data-key="${CSS.escape(refocus.key)}"]` : ''}`;
        const target = detail.querySelector(selector);
        if (target) target.focus();
    }
}

function mountDependencyDropdowns(job, rows) {
    const mains = rows.filter((r) => !r.parentKey);
    modalEl.querySelectorAll('.tp-deps').forEach((container) => {
        const row = rows.find((r) => r.key === container.dataset.depsFor);
        if (!row) return;
        const dropdown = new ModernDropdown(container, {
            placeholder: 'Yok',
            multiple: true,
            searchable: mains.length > 8,
        });
        dropdown.setItems(mains
            .filter((m) => m.key !== row.key)
            .map((m) => ({
                value: m.key,
                text: `${m.sequence}. ${m.title || departmentLabel(m.department)}`,
            })));
        dropdown.setValue((row.dependsOn || []).filter((k) => mains.some((m) => m.key === k)));
        container.addEventListener('dropdown:select', () => {
            row.dependsOn = dropdown.getValue().slice();
            if (state.error && state.error.jobNo === job.job_no) state.error = null;
        });
        depDropdowns.push(dropdown);
    });
}

function destroyDependencyDropdowns() {
    depDropdowns.forEach((dropdown) => dropdown.destroy());
    depDropdowns = [];
}

function renderFooter() {
    const footer = modalEl.querySelector('.tp-footer');
    const { jobCount, taskCount } = summarizePlans(state.plans);
    const summary = taskCount
        ? `<strong>${jobCount}</strong> iş emrine toplam <strong>${taskCount}</strong> görev eklenecek`
        : 'Henüz eklenecek görev yok';
    footer.innerHTML = `
        <div class="tp-summary">${summary}</div>
        ${state.confirmClose ? `
            <div class="tp-close-confirm" role="alert">
                <span>Kaydedilmemiş ${taskCount} görev silinecek.</span>
                <button type="button" class="btn btn-sm btn-link" data-tp-action="close-cancel">Vazgeç</button>
                <button type="button" class="btn btn-sm btn-danger" data-tp-action="close-discard">Kaydetmeden kapat</button>
            </div>` : ''}
        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" ${state.saving ? 'disabled' : ''}>İptal</button>
        <button type="button" class="btn btn-primary" data-tp-action="save" ${taskCount && !state.saving ? '' : 'disabled'}>
            ${state.saving
                ? '<span class="spinner-border spinner-border-sm me-1"></span>Kaydediliyor…'
                : `<i class="fas fa-save me-1"></i>Kaydet${taskCount ? ` (${taskCount})` : ''}`}
        </button>
    `;
}

/** Re-render after a plan change: list counts, bulk bar, detail, footer. */
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
    if (!state.jobByNo.has(jobNo) || state.focused === jobNo) return;
    state.focused = jobNo;
    renderJobList();
    renderDetail();
}

async function applyTemplate(jobNos, templateId, { skipDuplicates }) {
    let template;
    try {
        template = await loadTemplate(templateId);
    } catch (error) {
        console.error('Error loading template:', error);
        showNotification('Şablon yüklenemedi', 'error');
        return;
    }
    if (!state) return;
    if (!(template.items || []).length) {
        showNotification('Seçilen şablonda görev yok', 'warning');
        return;
    }
    let applied = 0;
    let skipped = 0;
    jobNos.forEach((jobNo) => {
        const rows = rowsOf(jobNo);
        if (skipDuplicates && planHasTemplate(rows, templateId)) {
            skipped += 1;
            return;
        }
        const job = state.jobByNo.get(jobNo);
        const base = nextSequenceBase(rows, job.tasks);
        setRows(jobNo, [...rows, ...rowsFromTemplate(template, { sequenceBase: base })]);
        applied += 1;
    });
    refreshAfterPlanChange();
    const name = template.name || templateName(templateId);
    if (applied) {
        showNotification(
            jobNos.length === 1
                ? `«${name}» eklendi`
                : `«${name}» ${applied} iş emrine eklendi${skipped ? `, ${skipped} iş emrinde zaten vardı` : ''}`,
            'success');
    } else if (skipped) {
        showNotification(`«${name}» seçili iş emirlerinin hepsinde zaten var`, 'info');
    }
}

function startBulkApply() {
    const templateId = state.bulkTemplateId;
    const targets = selectedPlannable();
    if (!templateId || targets.length === 0) return;
    const withTasks = targets.filter((no) => state.jobByNo.get(no).tasks.length > 0);
    if (withTasks.length > 0) {
        state.pendingBulk = { templateId, targets, withTasks };
        renderBulkBar();
        return;
    }
    applyTemplate(targets, templateId, { skipDuplicates: true });
}

function finishBulkApply(onlyEmpty) {
    const confirm = state.pendingBulk;
    state.pendingBulk = null;
    if (!confirm) return;
    const targets = onlyEmpty
        ? confirm.targets.filter((no) => !confirm.withTasks.includes(no))
        : confirm.targets;
    if (targets.length === 0) {
        renderBulkBar();
        return;
    }
    applyTemplate(targets, confirm.templateId, { skipDuplicates: true });
}

function copyFocusedPlanToSelected() {
    const source = rowsOf(state.focused);
    const targets = selectedPlannable().filter((no) => no !== state.focused);
    if (!source.length || !targets.length) return;
    targets.forEach((jobNo) => {
        const rows = rowsOf(jobNo);
        const base = nextSequenceBase(rows, state.jobByNo.get(jobNo).tasks);
        setRows(jobNo, [...rows, ...cloneRows(source, { sequenceBase: base })]);
    });
    refreshAfterPlanChange();
    showNotification(`${source.length} görev ${targets.length} iş emrine kopyalandı`, 'success');
}

function updateRow(key, patch) {
    const rows = rowsOf(state.focused);
    const row = rows.find((r) => r.key === key);
    if (!row) return null;
    Object.assign(row, patch);
    if (state.error && state.error.jobNo === state.focused) state.error = null;
    return row;
}

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
    const order = state.jobs.map((j) => j.job_no);
    for (const jobNo of order) {
        const problems = validatePlan(rowsOf(jobNo));
        if (problems.length) {
            state.error = { jobNo, rowKey: problems[0].key, message: `${jobNo}: ${problems[0].message}` };
            state.focused = jobNo;
            refreshAfterPlanChange();
            showNotification(state.error.message, 'error');
            return;
        }
    }

    const payload = buildBulkPlanPayload(state.plans, order);
    if (payload.plans.length === 0) return;
    const current = state;
    current.saving = true;
    current.confirmClose = false;
    renderFooter();

    try {
        const response = await bulkPlanDepartmentTasks(payload);
        current.allowClose = true;
        modal.hide();
        showNotification(response.message || 'Görevler oluşturuldu', 'success');
        if (typeof current.onSaved === 'function') current.onSaved(response);
    } catch (error) {
        console.error('Error saving task plans:', error);
        if (state !== current) return;
        const data = error.data || {};
        const jobNo = data.job_order && state.jobByNo.has(data.job_order) ? data.job_order : null;
        const rowKey = jobNo && data.temp_id !== undefined && data.temp_id !== null
            ? rowKeyForTempId(rowsOf(jobNo), data.temp_id)
            : null;
        const message = formatServerError(data) || 'Görevler kaydedilemedi';
        state.error = { jobNo, rowKey, message };
        if (jobNo) state.focused = jobNo;
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
        case 'select-no-tasks':
            visibleJobs().forEach((j) => { if (j.can_plan && j.tasks.length === 0) state.selected.add(j.job_no); });
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
            const targets = selectedPlannable().filter((no) => rowsOf(no).length > 0);
            const count = targets.reduce((sum, no) => sum + rowsOf(no).length, 0);
            targets.forEach((no) => setRows(no, []));
            refreshAfterPlanChange();
            if (count) showNotification(`${targets.length} iş emrinden ${count} yeni görev kaldırıldı`, 'info');
            break;
        }
        case 'detail-apply-template':
            if (state.detailTemplateId) applyTemplate([state.focused], state.detailTemplateId, { skipDuplicates: false });
            break;
        case 'add-row': {
            const rows = rowsOf(state.focused);
            const job = state.jobByNo.get(state.focused);
            const department = (state.departments[0] || {}).value || '';
            setRows(state.focused, [...rows, newMainRow(rows, job.tasks, department, departmentLabel(department))]);
            refreshAfterPlanChange();
            break;
        }
        case 'add-subrow': {
            const rows = rowsOf(state.focused);
            setRows(state.focused, [...rows, newSubRow(rows, key)]);
            refreshAfterPlanChange();
            break;
        }
        case 'remove-row':
            setRows(state.focused, removeRow(rowsOf(state.focused), key));
            refreshAfterPlanChange();
            break;
        case 'copy-to-selected':
            copyFocusedPlanToSelected();
            break;
        case 'clear-plan':
            setRows(state.focused, []);
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

function onInput(event) {
    if (!state) return;
    const field = event.target.dataset.tpField;
    if (field === 'search') {
        state.search = event.target.value;
        renderJobList();
    } else if (field === 'row-title') {
        updateRow(event.target.dataset.key, { title: event.target.value });
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
            renderJobList();
            break;
        case 'check-visible': {
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
        }
        case 'bulk-template':
            state.bulkTemplateId = el.value;
            state.pendingBulk = null;
            renderBulkBar();
            break;
        case 'detail-template':
            state.detailTemplateId = el.value;
            renderDetail();
            break;
        case 'row-department': {
            const rows = rowsOf(state.focused);
            const row = rows.find((r) => r.key === key);
            if (!row) break;
            // A title still reading the old department's name follows the new one.
            const retitle = !row.title || row.title === departmentLabel(row.department);
            let next = setRowDepartment(rows, key, el.value);
            if (retitle) next = next.map((r) => (r.key === key ? { ...r, title: departmentLabel(el.value) } : r));
            setRows(state.focused, next);
            renderDetail();
            break;
        }
        case 'row-type':
            updateRow(key, { task_type: el.value || null });
            break;
        case 'row-weight': {
            const weight = parseInt(el.value, 10);
            if (!Number.isInteger(weight) || weight < 1) {
                showNotification('Ağırlık en az 1 olmalıdır', 'warning');
                const row = rowsOf(state.focused).find((r) => r.key === key);
                el.value = row ? row.weight : 10;
                break;
            }
            updateRow(key, { weight });
            break;
        }
        case 'row-sequence': {
            const sequence = parseInt(el.value, 10);
            updateRow(key, { sequence: Number.isInteger(sequence) && sequence >= 0 ? sequence : 1 });
            renderDetail();
            break;
        }
        default:
            break;
    }
}
