import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { ConfirmationModal } from '../../components/confirmation-modal/confirmation-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { showNotification } from '../../components/notification/notification.js';
import { escapeHtml } from '../../utils/text.js';
import {
    getJobCompletionTree,
    forceCompleteJobOrders,
} from '../../apis/projects/jobOrders.js';

// A job order in one of these states has nothing left to force: the backend
// skips them, so the UI refuses the selection instead of pretending otherwise.
const RESOLVED_STATUSES = new Set(['completed', 'cancelled']);

const STATUS_BADGE_CLASS = {
    draft: 'status-grey',
    active: 'status-blue',
    on_hold: 'status-orange',
    completed: 'status-green',
    cancelled: 'status-red',
};

const DEPARTMENT_LABELS = {
    design: 'Dizayn',
    planning: 'Planlama',
    procurement: 'Satın Alma',
    manufacturing: 'İmalat',
    quality_control: 'Kalite Kontrol',
    logistics: 'Lojistik',
    sales: 'Satış',
    finance: 'Finans',
};

const state = {
    nodes: new Map(),      // job_no -> node
    roots: [],
    selected: new Set(),   // job_no of every job order that will be completed
    expanded: new Set(),
    visible: new Set(),
    search: '',
    statusFilter: 'open',
    loading: false,
};

let confirmModal = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();

    new HeaderComponent({
        title: 'İş Emri Tamamlama',
        subtitle: 'Seçilen iş emirlerini ve tüm departman görevlerini kontrolleri atlayarak tamamla',
        icon: 'check-double',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/it',
        onRefreshClick: () => loadTree(),
    });

    confirmModal = new ConfirmationModal('jc-confirm-modal-container', {
        title: 'İş Emirlerini Tamamla',
        icon: 'fas fa-triangle-exclamation',
        confirmText: 'Evet, Tamamla',
        confirmButtonClass: 'btn-danger',
    });

    bindEvents();
    await loadTree();
});

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadTree() {
    state.loading = true;
    renderPlaceholder('<div class="spinner-border spinner-border-sm me-2" role="status"></div>Yükleniyor...');
    try {
        const rows = await getJobCompletionTree();
        buildTree(Array.isArray(rows) ? rows : []);
        state.loading = false;
        // Selections are job numbers, so anything that survived the reload is
        // still meaningful — but a completed job is no longer selectable.
        for (const jobNo of [...state.selected]) {
            const node = state.nodes.get(jobNo);
            if (!node || !isActionable(node)) state.selected.delete(jobNo);
        }
        render();
    } catch (error) {
        state.loading = false;
        console.error('Error loading job completion tree:', error);
        renderPlaceholder(
            '<i class="fas fa-circle-exclamation me-2"></i>İş emirleri yüklenemedi. Sayfayı yenileyin.',
            'text-danger'
        );
    }
}

function buildTree(rows) {
    const nodes = new Map();
    for (const row of rows) {
        nodes.set(row.job_no, {
            ...row,
            children: [],
            parentRef: null,
            depth: 0,
        });
    }

    const roots = [];
    for (const node of nodes.values()) {
        const parent = node.parent ? nodes.get(node.parent) : null;
        if (parent) {
            node.parentRef = parent;
            parent.children.push(node);
        } else {
            // Also covers a parent that the payload does not carry (archived
            // rows are excluded server-side) — the child stands as a root
            // rather than disappearing from the page.
            roots.push(node);
        }
    }

    // Depth by traversal, with a seen-set so a malformed parent cycle cannot
    // hang the page.
    const seen = new Set();
    const stack = roots.map((node) => [node, 0]);
    while (stack.length) {
        const [node, depth] = stack.pop();
        if (seen.has(node.job_no)) continue;
        seen.add(node.job_no);
        node.depth = depth;
        for (const child of node.children) stack.push([child, depth + 1]);
    }

    state.nodes = nodes;
    state.roots = roots;
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

function isActionable(node) {
    return !RESOLVED_STATUSES.has(node.status);
}

function descendantsOf(node, out = []) {
    for (const child of node.children) {
        out.push(child);
        descendantsOf(child, out);
    }
    return out;
}

function ancestorsOf(node) {
    const out = [];
    let current = node.parentRef;
    while (current && !out.includes(current)) {
        out.push(current);
        current = current.parentRef;
    }
    return out;
}

function normalize(value) {
    // Turkish casing: 'İ'.toLowerCase() is not 'i' under the default locale, so
    // both sides of the comparison go through the same tr-TR fold.
    return String(value ?? '').toLocaleLowerCase('tr-TR');
}

function matchesFilter(node) {
    if (state.statusFilter === 'open') {
        if (RESOLVED_STATUSES.has(node.status)) return false;
    } else if (state.statusFilter !== 'all' && node.status !== state.statusFilter) {
        return false;
    }
    if (!state.search) return true;
    return normalize(node.job_no).includes(state.search)
        || normalize(node.title).includes(state.search)
        || normalize(node.customer_name).includes(state.search);
}

/**
 * Rows to show: every match, plus its ancestors (so the hierarchy stays
 * navigable) and its descendants (so a matched job is shown with its subtree).
 */
function computeVisible() {
    if (!state.search && state.statusFilter === 'all') {
        return new Set(state.nodes.keys());
    }
    const visible = new Set();
    for (const node of state.nodes.values()) {
        if (!matchesFilter(node)) continue;
        visible.add(node.job_no);
        for (const ancestor of ancestorsOf(node)) visible.add(ancestor.job_no);
        for (const descendant of descendantsOf(node)) visible.add(descendant.job_no);
    }
    return visible;
}

/** Post-order pass: how many selected job orders sit under each node. */
function computeSelectedCounts() {
    const counts = new Map();
    const walk = (node) => {
        let total = 0;
        for (const child of node.children) total += walk(child);
        counts.set(node.job_no, total);
        return total + (state.selected.has(node.job_no) ? 1 : 0);
    };
    state.roots.forEach(walk);
    return counts;
}

function isExpanded(node) {
    // An active search expands everything it surfaced; otherwise the user's
    // own expand/collapse state wins.
    if (state.search) return true;
    return state.expanded.has(node.job_no);
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function setSelected(node, selected) {
    const subtree = [node, ...descendantsOf(node)];
    for (const item of subtree) {
        if (!isActionable(item)) continue;
        if (selected) state.selected.add(item.job_no);
        else state.selected.delete(item.job_no);
    }
    if (!selected) {
        // A selected parent means "this whole subtree" — so dropping any part
        // of the subtree has to drop the parents too, or the request would
        // silently re-add what was just unchecked.
        for (const ancestor of ancestorsOf(node)) state.selected.delete(ancestor.job_no);
    }
}

function selectedNodes() {
    return [...state.selected]
        .map((jobNo) => state.nodes.get(jobNo))
        .filter(Boolean);
}

function selectedOpenTaskCount() {
    return selectedNodes().reduce((sum, node) => sum + (node.open_task_count || 0), 0);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderPlaceholder(html, extraClass = 'text-muted') {
    const body = document.getElementById('jc-tree-body');
    if (!body) return;
    body.innerHTML = `<tr><td colspan="6" class="text-center ${extraClass} py-5">${html}</td></tr>`;
}

function render() {
    if (state.loading) return;
    state.visible = computeVisible();
    const selectedCounts = computeSelectedCounts();

    const body = document.getElementById('jc-tree-body');
    if (!body) return;

    const html = [];
    const indeterminate = [];
    const walk = (node) => {
        if (!state.visible.has(node.job_no)) return;
        const checked = state.selected.has(node.job_no);
        const partial = !checked && (selectedCounts.get(node.job_no) || 0) > 0;
        if (partial) indeterminate.push(node.job_no);
        html.push(rowHtml(node, checked));
        if (isExpanded(node)) node.children.forEach(walk);
    };
    state.roots.forEach(walk);

    if (!html.length) {
        renderPlaceholder('<i class="fas fa-filter me-2"></i>Filtreye uyan iş emri yok.');
    } else {
        body.innerHTML = html.join('');
        for (const jobNo of indeterminate) {
            const input = body.querySelector(`.jc-check[data-job-no="${cssEscape(jobNo)}"]`);
            if (input) input.indeterminate = true;
        }
    }

    renderSelectionSummary();
}

function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\"');
}

function rowHtml(node, checked) {
    const hasChildren = node.children.length > 0;
    const expanded = isExpanded(node);
    const actionable = isActionable(node);
    const pct = Number(node.completion_percentage || 0);
    const open = Number(node.open_task_count || 0);
    const caretIcon = expanded ? 'fa-chevron-down' : 'fa-chevron-right';

    return `
        <tr class="jc-row${checked ? ' is-selected' : ''}${actionable ? '' : ' is-resolved'}"
            data-job-no="${escapeHtml(node.job_no)}">
            <td class="jc-col-check">
                <input type="checkbox" class="form-check-input jc-check"
                       data-job-no="${escapeHtml(node.job_no)}"
                       ${checked ? 'checked' : ''}
                       ${actionable ? '' : 'disabled title="Tamamlanmış veya iptal edilmiş iş emri"'}>
            </td>
            <td>
                <div class="jc-node" style="padding-left: ${node.depth * 18}px;">
                    <button type="button" class="jc-caret${hasChildren ? '' : ' is-leaf'}"
                            data-job-no="${escapeHtml(node.job_no)}"
                            ${hasChildren ? '' : 'tabindex="-1" aria-hidden="true"'}>
                        <i class="fas ${caretIcon}"></i>
                    </button>
                    <span class="jc-job-no">${escapeHtml(node.job_no)}</span>
                    <span class="jc-title">${escapeHtml(node.title || '')}</span>
                    ${hasChildren ? `<span class="jc-child-count">(${node.children.length} alt iş)</span>` : ''}
                </div>
            </td>
            <td class="jc-cell-customer">${escapeHtml(node.customer_name || '-')}</td>
            <td>
                <span class="status-badge ${STATUS_BADGE_CLASS[node.status] || 'status-grey'}">
                    ${escapeHtml(node.status_display || node.status || '-')}
                </span>
            </td>
            <td>
                <div class="jc-progress">
                    <div class="jc-progress__bar">
                        <div class="jc-progress__fill" style="width: ${Math.min(100, Math.max(0, pct))}%;"></div>
                    </div>
                    <span class="jc-progress__value">${pct.toFixed(0)}%</span>
                </div>
            </td>
            <td class="jc-cell-tasks">
                <span class="jc-open-count${open ? '' : ' is-zero'}">${open}</span>
                <span class="text-muted"> / ${Number(node.task_count || 0)}</span>
            </td>
        </tr>
    `;
}

function renderSelectionSummary() {
    const count = state.selected.size;
    const tasks = selectedOpenTaskCount();
    const summary = document.getElementById('jc-selection-summary');
    const completeBtn = document.getElementById('jc-complete-btn');
    const clearBtn = document.getElementById('jc-clear-selection');

    if (summary) {
        summary.textContent = count
            ? `${count} iş emri • ${tasks} açık görev seçildi`
            : 'Seçim yok';
        summary.classList.toggle('is-active', count > 0);
    }
    if (completeBtn) completeBtn.disabled = count === 0;
    if (clearBtn) clearBtn.disabled = count === 0;

    const selectAll = document.getElementById('jc-select-all');
    if (selectAll) {
        const selectable = visibleSelectableNodes();
        const selectedVisible = selectable.filter((node) => state.selected.has(node.job_no)).length;
        selectAll.checked = selectable.length > 0 && selectedVisible === selectable.length;
        selectAll.indeterminate = selectedVisible > 0 && selectedVisible < selectable.length;
        selectAll.disabled = selectable.length === 0;
    }
}

function visibleSelectableNodes() {
    return [...state.visible]
        .map((jobNo) => state.nodes.get(jobNo))
        .filter((node) => node && isActionable(node));
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function bindEvents() {
    const body = document.getElementById('jc-tree-body');

    body?.addEventListener('change', (event) => {
        const input = event.target.closest('.jc-check');
        if (!input) return;
        const node = state.nodes.get(input.dataset.jobNo);
        if (!node) return;
        setSelected(node, input.checked);
        // Checking a parent pulls in its subtree, so the rows have to be
        // redrawn rather than just this one toggled.
        if (input.checked && node.children.length) state.expanded.add(node.job_no);
        render();
    });

    body?.addEventListener('click', (event) => {
        const caret = event.target.closest('.jc-caret');
        if (!caret || caret.classList.contains('is-leaf')) return;
        const jobNo = caret.dataset.jobNo;
        if (state.search) {
            // Search forces everything open; collapsing would fight the filter.
            return;
        }
        if (state.expanded.has(jobNo)) state.expanded.delete(jobNo);
        else state.expanded.add(jobNo);
        render();
    });

    document.getElementById('jc-select-all')?.addEventListener('change', (event) => {
        const nodes = visibleSelectableNodes();
        if (event.target.checked) {
            for (const node of nodes) state.selected.add(node.job_no);
        } else {
            for (const node of nodes) state.selected.delete(node.job_no);
        }
        render();
    });

    let searchTimer = null;
    document.getElementById('jc-search')?.addEventListener('input', (event) => {
        const value = event.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.search = normalize(value.trim());
            render();
        }, 200);
    });

    document.getElementById('jc-status-filter')?.addEventListener('change', (event) => {
        state.statusFilter = event.target.value;
        render();
    });

    document.getElementById('jc-expand-all')?.addEventListener('click', () => {
        for (const node of state.nodes.values()) {
            if (node.children.length) state.expanded.add(node.job_no);
        }
        render();
    });

    document.getElementById('jc-collapse-all')?.addEventListener('click', () => {
        state.expanded.clear();
        render();
    });

    document.getElementById('jc-clear-selection')?.addEventListener('click', () => {
        state.selected.clear();
        render();
    });

    document.getElementById('jc-complete-btn')?.addEventListener('click', () => {
        askAndComplete();
    });
}

// ---------------------------------------------------------------------------
// Force completion
// ---------------------------------------------------------------------------

function askAndComplete() {
    const nodes = selectedNodes();
    if (!nodes.length) return;

    const jobNos = nodes.map((node) => node.job_no).sort();
    const tasks = selectedOpenTaskCount();
    const hidden = jobNos.filter((jobNo) => !state.visible.has(jobNo)).length;
    const preview = jobNos.slice(0, 25);

    const details = `
        <div class="text-start">
            <div><strong>${jobNos.length}</strong> iş emri ve bunlara bağlı
                 <strong>${tasks}</strong> açık departman görevi tamamlanacak.</div>
            ${hidden ? `<div class="mt-1 text-danger"><i class="fas fa-eye-slash me-1"></i>
                        Bunların ${hidden} tanesi geçerli filtrede görünmüyor.</div>` : ''}
            <ul class="jc-confirm-list">
                ${preview.map((jobNo) => `<li>${escapeHtml(jobNo)}</li>`).join('')}
            </ul>
            ${jobNos.length > preview.length
                ? `<div class="text-muted small">…ve ${jobNos.length - preview.length} iş emri daha</div>`
                : ''}
        </div>
    `;

    confirmModal.show({
        title: 'İş Emirlerini Tamamla',
        message: `${jobNos.length} iş emri tamamlanacak`,
        description: 'Kalite kontrol onayı, ERP ürün girişi, satın alma teslimatı, '
            + 'açık NCR, alt görev ve bağımlılık kontrolleri atlanacak. Bu işlem geri alınamaz.',
        details,
        confirmText: 'Evet, Tamamla',
        onConfirm: () => runCompletion(jobNos),
    });
}

async function runCompletion(jobNos) {
    const button = document.getElementById('jc-complete-btn');
    const original = button ? button.innerHTML : null;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Tamamlanıyor...';
    }

    try {
        // The tree already expanded every selection to its subtree, so the
        // request carries exactly the rows the user saw ticked.
        const summary = await forceCompleteJobOrders(jobNos, { includeDescendants: false });
        state.selected.clear();
        showNotification(buildResultMessage(summary), resultSeverity(summary), 12000);
        await loadTree();
    } catch (error) {
        console.error('Error force-completing job orders:', error);
        showNotification(
            `İşlem başarısız: ${escapeHtml(error.message || 'Bilinmeyen hata')}`,
            'error',
            8000
        );
        throw error; // keeps the confirmation modal open
    } finally {
        if (button) {
            button.innerHTML = original;
            button.disabled = state.selected.size === 0;
        }
    }
}

function resultSeverity(summary) {
    const overridden = summary?.overridden || {};
    const hasWarnings = (summary?.skipped?.length || 0) > 0
        || (summary?.missing?.length || 0) > 0
        || (overridden.open_ncr_job_orders?.length || 0) > 0;
    return hasWarnings ? 'warning' : 'success';
}

function buildResultMessage(summary) {
    const overridden = summary?.overridden || {};
    const lines = [
        `<strong>${summary?.completed_job_orders?.length || 0}</strong> iş emri ve `
        + `<strong>${summary?.tasks_completed || 0}</strong> departman görevi tamamlandı.`,
    ];

    const byDept = Object.entries(summary?.tasks_by_department || {});
    if (byDept.length) {
        const parts = byDept
            .sort((a, b) => b[1] - a[1])
            .map(([dept, count]) => `${escapeHtml(DEPARTMENT_LABELS[dept] || dept)}: ${count}`);
        lines.push(`<div class="small text-muted">${parts.join(' · ')}</div>`);
    }

    if (overridden.qc_missing_approval) {
        lines.push(`<div class="small">KK onayı olmadan tamamlanan görev: `
            + `<strong>${overridden.qc_missing_approval}</strong></div>`);
    }
    if (overridden.erp_entry_unconfirmed) {
        lines.push(`<div class="small">ERP ürün girişi onaylanmadan tamamlanan imalat görevi: `
            + `<strong>${overridden.erp_entry_unconfirmed}</strong></div>`);
    }
    if (overridden.open_ncr_job_orders?.length) {
        lines.push(`<div class="small text-danger">Açık NCR'ı olan iş emirleri kapatılmadı, `
            + `NCR'lar açık kaldı: ${escapeHtml(overridden.open_ncr_job_orders.join(', '))}</div>`);
    }
    if (summary?.already_completed?.length) {
        lines.push(`<div class="small text-muted">Zaten tamamlanmış: `
            + `${escapeHtml(summary.already_completed.join(', '))}</div>`);
    }
    if (summary?.skipped?.length) {
        const nos = summary.skipped.map((entry) => entry.job_no).join(', ');
        lines.push(`<div class="small text-muted">İptal edildiği için atlandı: ${escapeHtml(nos)}</div>`);
    }
    if (summary?.missing?.length) {
        lines.push(`<div class="small text-muted">Bulunamadı: ${escapeHtml(summary.missing.join(', '))}</div>`);
    }

    return lines.join('');
}
