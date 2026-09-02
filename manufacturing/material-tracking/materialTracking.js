import { guardRoute, getUser, isAdmin } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import {
    getPlanningItems,
    markPlanningRequestItemCritical,
    unmarkPlanningRequestItemCritical
} from '../../../apis/planning/planningRequestItems.js';
import {
    getMaterialPullRequest,
    createMaterialPullRequest,
    cancelMaterialPullRequest
} from '../../../apis/warehouse/pullRequests.js';
import { fetchSubcontractors } from '../../../apis/subcontracting/subcontractors.js';
import { fetchTeams } from '../../../apis/welding/teams.js';
import { extractResultsFromResponse } from '../../../apis/paginationHelper.js';
import { showNotification } from '../../../components/notification/notification.js';

// State
let currentPage = 1;
let currentPageSize = 20;
let currentOrdering = '-id';
let isLoading = false;
let currentUser = null;

/** @type {import('../../../components/table/table.js').TableComponent | null} */
let table = null;
let filtersComponent = null;

// Pull request state
let selectedItemsForPull = [];
let pullModalItems = [];
let destinationOptions = null;
let detailModal = null;
let createModal = null;
let cancelConfirmModal = null;
let pullRequestToCancel = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();

    currentUser = await getUser().catch(() => null);

    new HeaderComponent({
        title: 'Planlama Kalemleri',
        subtitle: 'Planlama taleplerindeki ürün/kalem listesini filtreleyin ve takip edin',
        icon: 'list',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onRefreshClick: () => {
            currentPage = 1;
            loadItems();
        },
        backUrl: '/planning/'
    });

    initFilters();
    initTable();
    bindCriticalToggle();
    initPullRequestSection();
    initCreatePullRequestModal();

    await loadItems();
});

// Kritik = imalat bu kalem teslim edilmeden devam edemez: the production
// forecast holds Üretim's projected start until every critical item of the
// job is delivered.
//
// Delegate on the container's PARENT, not the container itself. TableComponent
// re-renders on every load and its removeEventListeners() clones + replaces the
// container node (cloneNode(true) does NOT copy addEventListener handlers), so a
// listener bound to the container is destroyed on the first render. The parent
// node is never replaced, and change events bubble up to it.
function bindCriticalToggle() {
    const container = document.getElementById('planning-items-table-container');
    if (!container || !container.parentNode) return;
    container.parentNode.addEventListener('change', async (e) => {
        const box = e.target.closest('.mt-crit-toggle');
        if (!box) return;
        const itemId = Number(box.dataset.itemId);
        const makeCritical = box.checked;
        box.disabled = true;
        try {
            if (makeCritical) await markPlanningRequestItemCritical(itemId);
            else await unmarkPlanningRequestItemCritical(itemId);
            // Write the new value into the cached row so tbody re-renders
            // don't visually revert the checkbox.
            const row = table?.options?.data?.find((r) => r.id === itemId);
            if (row) row.is_critical = makeCritical;
            showNotification(makeCritical
                ? 'Kalem kritik olarak işaretlendi — imalat öngörüsü bu teslimatı bekleyecek'
                : 'Kritik işareti kaldırıldı', 'success');
        } catch (error) {
            box.checked = !makeCritical;
            showNotification(error?.message || 'Kritik işareti güncellenemedi', 'danger');
        } finally {
            box.disabled = false;
        }
    });
}

function renderCriticalToggle(value, row) {
    if (!row || row.id === undefined) return '-';
    return `<input type="checkbox" class="mt-crit-toggle" data-item-id="${row.id}" ${value ? 'checked' : ''}
        title="Kritik: imalat bu kalem teslim edilmeden devam edemez">`;
}

function renderBoolIcon(value) {
    if (value === true) return '<i class="fas fa-check text-success" title="Evet"></i>';
    if (value === false) return '<i class="fas fa-times text-danger" title="Hayır"></i>';
    return '-';
}

function renderRequestNumberBadge(value) {
    if (!value) return '-';
    return `<span class="status-badge status-blue" style="min-width: auto;">${value}</span>`;
}

function renderJobNoBadge(value) {
    if (!value) return '-';
    return `<span class="status-badge status-grey" style="min-width: auto;">${value}</span>`;
}

function renderPurchaseRequestNumberBadge(value) {
    if (!value) return '-';
    return `<span class="status-badge status-green" style="min-width: auto;">${value}</span>`;
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function initFilters() {
    filtersComponent = new FiltersComponent('items-filters-placeholder', {
        title: 'Filtreler',
        onApply: () => {
            currentPage = 1;
            loadItems();
        },
        onClear: () => {
            currentPage = 1;
            currentOrdering = '-id';
            loadItems();
            showNotification('Filtreler temizlendi', 'info');
        }
    });

    filtersComponent
        .addTextFilter({ id: 'search', label: 'Arama', placeholder: 'Ürün kodu veya adı...', colSize: 3 })
        .addTextFilter({ id: 'planning_request', label: 'Planlama Talep ID', placeholder: 'örn. 5', type: 'number', colSize: 2 })
        .addTextFilter({ id: 'planning_request_number', label: 'Talep No', placeholder: 'Talep numarası...', colSize: 2 })
        .addDropdownFilter({
            id: 'item_type',
            label: 'Kalem Tipi',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'stock', label: 'Stok' },
                { value: 'expenditure', label: 'Masraf' },
                { value: 'subcontracting', label: 'Alt Yüklenici' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        })
        .addDropdownFilter({
            id: 'planning_request_status',
            label: 'Talep Durumu',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'draft', label: 'Taslak' },
                { value: 'ready', label: 'Satın Almaya Hazır' },
                { value: 'converted', label: 'Onaya Gönderildi' },
                { value: 'completed', label: 'Tamamlandı' },
                { value: 'cancelled', label: 'İptal' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        })
        .addTextFilter({ id: 'job_no', label: 'İş No', placeholder: 'İş no...', colSize: 2 })
        .addTextFilter({ id: 'item_code', label: 'Ürün Kodu', placeholder: 'Ürün kodu...', colSize: 2 })
        .addTextFilter({ id: 'item_name', label: 'Ürün Adı', placeholder: 'Ürün adı...', colSize: 2 })
        .addDropdownFilter({
            id: 'is_delivered',
            label: 'Teslim',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'true', label: 'Teslim Edildi' },
                { value: 'false', label: 'Teslim Edilmedi' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        })
        .addDropdownFilter({
            id: 'is_critical',
            label: 'Kritik',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'true', label: 'Kritik' },
                { value: 'false', label: 'Kritik Değil' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        })
        .addDropdownFilter({
            id: 'from_inventory',
            label: 'Stoktan Karşılandı',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'true', label: 'Evet (stok ayrıldı)' },
                { value: 'false', label: 'Hayır (stok ayrılmadı)' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        })
        .addDropdownFilter({
            id: 'is_available',
            label: 'Kalan (Satın Alma)',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'true', label: 'Var' },
                { value: 'false', label: 'Yok' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        })
        .addDropdownFilter({
            id: 'ordering',
            label: 'Sıralama',
            options: [
                { value: '-id', label: 'Yeni → Eski' },
                { value: 'id', label: 'Eski → Yeni' },
                { value: 'order', label: 'Sıra (Artan)' },
                { value: 'job_no', label: 'İş No (A→Z)' },
                { value: '-job_no', label: 'İş No (Z→A)' },
                { value: 'item_code', label: 'Ürün Kodu (A→Z)' },
                { value: '-item_code', label: 'Ürün Kodu (Z→A)' },
                { value: 'item_name', label: 'Ürün Adı (A→Z)' },
                { value: '-item_name', label: 'Ürün Adı (Z→A)' }
            ],
            placeholder: 'Yeni → Eski',
            colSize: 2
        });
}

function initTable() {
    table = new TableComponent('planning-items-table-container', {
        title: 'Kalemler',
        icon: 'fas fa-list',
        exportable: true,
        exportFilename: () => `malzeme_takip_${new Date().toISOString().slice(0, 10)}.xlsx`,
        columns: [
            { field: 'id', label: 'ID', sortable: true, formatter: (v) => v ?? '-' },
            { field: 'item_code', label: 'Ürün Kodu', sortable: true, formatter: (v) => v || '-' },
            { field: 'item_name', label: 'Ürün Adı', sortable: true, formatter: (v) => v || '-' },
            { field: 'planning_request_number', label: 'Talep No', sortable: false, formatter: (v) => renderRequestNumberBadge(v) },
            { field: 'job_no', label: 'İş No', sortable: true, formatter: (v) => renderJobNoBadge(v) },
            { field: 'quantity', label: 'Miktar', sortable: false, formatter: (v) => (v ?? '-') },
            { field: 'quantity_from_inventory', label: 'Stoktan', sortable: false, formatter: (v) => (v ?? '-') },
            { field: 'quantity_to_purchase', label: 'Satın Alınacak', sortable: false, formatter: (v) => (v ?? '-') },
            { field: 'item_unit', label: 'Birim', sortable: false, formatter: (v) => v || '-' },
            { field: 'is_delivered', label: 'Teslim', type: 'boolean', sortable: false, formatter: (v) => renderBoolIcon(v) },
            { field: 'pull_requests', label: 'Depo Çekme', sortable: false, formatter: (v) => renderPullRequestChips(v) },
            { field: 'is_critical', label: 'Kritik', sortable: false, formatter: (v, row) => renderCriticalToggle(v, row) },
            { field: 'purchase_request_number', label: 'Satın Alma PR No', sortable: false, formatter: (v) => renderPurchaseRequestNumberBadge(v) }
        ],
        selectable: true,
        // Only material that is physically in the warehouse can be pulled.
        isRowSelectable: (row) => row.is_delivered === true,
        onSelectionChange: (selectedRows) => {
            selectedItemsForPull = selectedRows;
            updateBulkActionBar();
        },
        pagination: true,
        itemsPerPage: currentPageSize,
        serverSidePagination: true,
        refreshable: true,
        onRefresh: () => loadItems(),
        onSort: (field, direction) => {
            // Backend ordering keys (supports -prefix for desc)
            const orderable = new Set(['id', 'job_no', 'item_code', 'item_name']);
            if (!orderable.has(field)) return;

            currentOrdering = `${direction === 'desc' ? '-' : ''}${field}`;
            // Keep dropdown in sync so table header clicks always take effect
            if (filtersComponent) {
                filtersComponent.setFilterValues({ ordering: currentOrdering });
            }
            currentPage = 1;
            loadItems();
        },
        onPageChange: (page) => {
            table?.clearSelection();
            currentPage = page;
            loadItems();
        },
        onPageSizeChange: (pageSize) => {
            currentPageSize = pageSize;
            currentPage = 1;
            loadItems();
        },
        emptyMessage: 'Kalem bulunamadı.',
        emptyIcon: 'fas fa-inbox'
    });
}

async function loadItems() {
    if (isLoading || !table || !filtersComponent) return;
    try {
        isLoading = true;
        table.setLoading(true);

        const values = filtersComponent.getFilterValues();
        const orderingFromFilter = values.ordering ?? '';

        const filters = {
            search: values.search || undefined,
            item_code: values.item_code || undefined,
            item_name: values.item_name || undefined,
            item_type: values.item_type || undefined,
            planning_request: values.planning_request || undefined,
            planning_request_number: values.planning_request_number || undefined,
            planning_request_status: values.planning_request_status || undefined,
            job_no: values.job_no || undefined,
            is_delivered: values.is_delivered || undefined,
            is_critical: values.is_critical || undefined,
            from_inventory: values.from_inventory || undefined,
            is_available: values.is_available || undefined,
            include_price: false,
            ordering: orderingFromFilter || currentOrdering,
            page: currentPage,
            page_size: currentPageSize
        };

        const response = await getPlanningItems(filters);
        const results = extractResultsFromResponse(response).map((item) => ({ ...item, key: item.id }));
        const total = typeof response?.count === 'number' ? response.count : results.length;

        table.updateData(results, total, currentPage);
        // updateData prunes selections for rows no longer on the page without
        // firing onSelectionChange — resync the module state and bulk bar.
        selectedItemsForPull = table.getSelectedRows();
        updateBulkActionBar();
    } catch (error) {
        console.error('Error loading planning items:', error);
        table.updateData([], 0, 1);
        showNotification(error?.message || 'Kalemler yüklenirken hata oluştu', 'danger');
    } finally {
        isLoading = false;
        table.setLoading(false);
    }
}

// --- Warehouse material pull requests ---

function updateBulkActionBar() {
    const bar = document.getElementById('pull-request-bulk-actions');
    const countEl = document.getElementById('pull-request-selected-count');
    if (!bar || !countEl) return;
    const count = selectedItemsForPull.length;
    if (count > 0) {
        bar.classList.remove('d-none');
        countEl.textContent = `${count} kalem seçildi`;
    } else {
        bar.classList.add('d-none');
    }
}

function renderPullStatusBadge(status, label) {
    const labels = { pending: 'Beklemede', transferred: 'Teslim Edildi', cancelled: 'İptal Edildi' };
    const classes = { pending: 'status-orange', transferred: 'status-green', cancelled: 'status-grey' };
    const text = label || labels[status] || status || '-';
    return `<span class="status-badge ${classes[status] || 'status-grey'}" style="min-width: auto;">${escapeHtml(text)}</span>`;
}

// Depo Çekme column: one chip per (non-cancelled) pull request the line is
// on — the destination name, orange while pending, green once handed over.
// Clicking a chip opens the request detail.
function renderPullRequestChips(pulls) {
    if (!Array.isArray(pulls) || pulls.length === 0) return '-';
    return pulls.map((p) => {
        const cls = p.status === 'transferred' ? 'status-green' : 'status-orange';
        const title = `${p.number} · ${p.status_label} · ${p.quantity}`;
        return `<span class="status-badge ${cls} mt-pull-chip" data-pull-request-id="${p.id}"
            style="min-width: auto; cursor: pointer;" title="${escapeHtml(title)}">${escapeHtml(p.destination_name || '-')}</span>`;
    }).join(' ');
}

function renderDestinationCell(row) {
    const chip = row.destination_type === 'subcontractor'
        ? '<span class="status-badge status-purple" style="min-width: auto;">Taşeron</span>'
        : '<span class="status-badge status-blue" style="min-width: auto;">Ekip</span>';
    return `${escapeHtml(row.destination_name || '-')} ${chip}`;
}

function canCancelPullRequest(row) {
    if (row.status !== 'pending') return false;
    return isAdmin() || (currentUser && currentUser.id === row.requested_by);
}

function initPullRequestSection() {
    // Depo Çekme chips live inside the items table; delegate on the
    // container's parent for the same re-render reason as the crit toggle.
    const container = document.getElementById('planning-items-table-container');
    if (container && container.parentNode) {
        container.parentNode.addEventListener('click', (e) => {
            const chip = e.target.closest('.mt-pull-chip');
            if (!chip) return;
            showPullRequestDetail(Number(chip.dataset.pullRequestId));
        });
    }

    detailModal = new DisplayModal('pull-request-detail-modal-container', {
        title: 'Depo Çekme Talebi',
        icon: 'fas fa-dolly',
        size: 'lg',
        showEditButton: false
    });

    createModal = new EditModal('pull-request-create-modal-container', {
        title: 'Depodan Çekme Talebi Oluştur',
        icon: 'fas fa-dolly',
        size: 'lg',
        saveButtonText: 'Talep Gönder'
    });
    // The form element survives clearAll()/render() cycles, so one delegated
    // listener covers every rebuild of the destination radio group.
    createModal.form.addEventListener('change', (e) => {
        if (e.target?.name === 'destination_type') toggleDestinationFields();
    });

    cancelConfirmModal = new ConfirmationModal('pull-request-cancel-confirmation-container', {
        title: 'Depo Çekme Talebini İptal Et',
        icon: 'fas fa-ban',
        message: 'Bu depo çekme talebini iptal etmek istediğinize emin misiniz?',
        confirmText: 'Evet, İptal Et',
        cancelText: 'Vazgeç',
        confirmButtonClass: 'btn-danger'
    });
    cancelConfirmModal.setOnConfirm(async () => {
        if (!pullRequestToCancel) return;
        try {
            await cancelMaterialPullRequest(pullRequestToCancel.id);
            showNotification('Depo çekme talebi iptal edildi', 'success');
            pullRequestToCancel = null;
            await loadItems();
        } catch (error) {
            showNotification(error?.message || 'Talep iptal edilirken hata oluştu', 'danger');
        }
    });
}

async function showPullRequestDetail(requestId) {
    try {
        const request = await getMaterialPullRequest(requestId);

        detailModal.clearData();
        detailModal.setTitle(`Depo Çekme Talebi — ${request.number}`);
        detailModal.addSection({ title: 'Genel Bilgiler', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
        detailModal.addField({
            id: 'pr-number',
            label: 'Talep No',
            type: 'text',
            value: request.number || '-',
            colSize: 4
        });
        detailModal.addField({
            id: 'pr-status',
            label: 'Durum',
            type: 'text',
            value: request.status,
            format: () => renderPullStatusBadge(request.status, request.status_label),
            colSize: 4
        });
        detailModal.addField({
            id: 'pr-destination',
            label: 'Hedef',
            type: 'text',
            value: request.destination_name || '-',
            format: () => renderDestinationCell(request),
            colSize: 4
        });
        detailModal.addField({
            id: 'pr-requested-by',
            label: 'Talep Eden',
            type: 'text',
            value: `${request.requested_by_name || '-'} — ${formatDateTime(request.requested_at)}`,
            colSize: 6
        });
        if (request.confirmed_by) {
            detailModal.addField({
                id: 'pr-confirmed-by',
                label: 'Teslim Eden',
                type: 'text',
                value: `${request.confirmed_by_name || '-'} — ${formatDateTime(request.confirmed_at)}`,
                colSize: 6
            });
        }
        if (request.cancelled_by) {
            detailModal.addField({
                id: 'pr-cancelled-by',
                label: 'İptal Eden',
                type: 'text',
                value: `${request.cancelled_by_name || '-'} — ${formatDateTime(request.cancelled_at)}`,
                colSize: 6
            });
        }
        detailModal.addField({
            id: 'pr-note',
            label: 'Not',
            type: 'text',
            value: request.note || '-',
            colSize: 12
        });

        const items = request.items || [];
        const itemRows = items.map((item) => `
            <tr>
                <td>${escapeHtml(item.item_code || '-')}</td>
                <td>${escapeHtml(item.item_name || '-')}</td>
                <td>${escapeHtml(item.job_no || '-')}</td>
                <td>${escapeHtml(item.quantity ?? '-')}</td>
                <td>${escapeHtml(item.item_unit || '-')}</td>
                <td>${renderBoolIcon(item.is_delivered)}</td>
            </tr>
        `).join('');
        detailModal.addCustomSection({
            title: 'Kalemler',
            icon: 'fas fa-list',
            iconColor: 'text-primary',
            customContent: `
                <div class="table-responsive">
                    <table class="table table-sm align-middle">
                        <thead>
                            <tr>
                                <th>Ürün Kodu</th>
                                <th>Ürün Adı</th>
                                <th>İş No</th>
                                <th>Miktar</th>
                                <th>Birim</th>
                                <th>Teslim Alındı mı</th>
                            </tr>
                        </thead>
                        <tbody>${itemRows || '<tr><td colspan="6" class="text-center text-muted">Kalem yok</td></tr>'}</tbody>
                    </table>
                </div>
            `
        });

        if (canCancelPullRequest(request)) {
            detailModal.addCustomSection({
                customContent: `
                    <div class="text-end">
                        <button type="button" id="pull-request-detail-cancel-btn" class="btn btn-sm btn-outline-danger">
                            <i class="fas fa-ban me-1"></i>Talebi İptal Et
                        </button>
                    </div>
                `
            });
        }

        detailModal.render();
        detailModal.show();
        document.getElementById('pull-request-detail-cancel-btn')?.addEventListener('click', () => {
            detailModal.hide();
            cancelPullRequest(request);
        });
    } catch (error) {
        showNotification(error?.message || 'Talep detayı yüklenemedi', 'danger');
    }
}

function cancelPullRequest(row) {
    pullRequestToCancel = row;
    cancelConfirmModal.show({
        message: `${row.number} numaralı depo çekme talebini iptal etmek istediğinize emin misiniz?`
    });
}

// --- Create pull request modal ---

function initCreatePullRequestModal() {
    document.getElementById('pull-request-create-btn')?.addEventListener('click', () => {
        openCreatePullRequestModal();
    });
    document.getElementById('pull-request-clear-selection-btn')?.addEventListener('click', () => {
        table?.clearSelection();
    });
}

async function ensureDestinationOptions() {
    if (destinationOptions) return destinationOptions;
    try {
        const [subResponse, teamResponse] = await Promise.all([
            fetchSubcontractors({ page_size: 1000, ordering: 'name' }),
            fetchTeams({ is_active: true, ordering: 'name', page_size: 1000 })
        ]);

        destinationOptions = {
            subcontractors: extractResultsFromResponse(subResponse)
                .filter((s) => s.is_active !== false)
                .map((s) => ({ value: s.id, label: s.name || s.short_name || `#${s.id}` })),
            teams: extractResultsFromResponse(teamResponse)
                .map((t) => ({ value: t.id, label: t.name || `#${t.id}` }))
        };
        return destinationOptions;
    } catch (error) {
        console.error('Error loading destinations:', error);
        showNotification(error?.message || 'Hedef listeleri yüklenirken hata oluştu', 'danger');
        return null;
    }
}

function getSelectedDestinationType() {
    return createModal?.form?.querySelector('input[name="destination_type"]:checked')?.value || 'subcontractor';
}

function toggleDestinationFields() {
    const isSubcontractor = getSelectedDestinationType() === 'subcontractor';
    const subCol = createModal?.container?.querySelector('[data-field-id="subcontractor"]')?.parentElement;
    const teamCol = createModal?.container?.querySelector('[data-field-id="team"]')?.parentElement;
    if (subCol) subCol.style.display = isSubcontractor ? '' : 'none';
    if (teamCol) teamCol.style.display = isSubcontractor ? 'none' : '';
}

async function openCreatePullRequestModal() {
    const selected = table?.getSelectedRows() ?? [];
    if (!selected.length) {
        showNotification('Lütfen en az bir kalem seçin', 'warning');
        return;
    }

    const options = await ensureDestinationOptions();
    if (!options) return;

    pullModalItems = selected.map((row) => ({
        id: row.id,
        item_code: row.item_code,
        item_name: row.item_name,
        job_no: row.job_no,
        item_unit: row.item_unit,
        quantity: row.quantity ?? ''
    }));

    createModal.clearAll();

    createModal.addSection({
        title: 'Hedef',
        icon: 'fas fa-truck',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'destination_type',
                name: 'destination_type',
                label: 'Hedef Tipi',
                type: 'radio',
                value: 'subcontractor',
                options: [
                    { value: 'subcontractor', label: 'Taşeron' },
                    { value: 'team', label: 'Kaynak Ekibi' }
                ],
                colSize: 12
            },
            {
                id: 'subcontractor',
                name: 'subcontractor',
                label: 'Taşeron',
                type: 'dropdown',
                placeholder: 'Taşeron seçin...',
                searchable: true,
                required: true,
                options: options.subcontractors,
                colSize: 6
            },
            {
                id: 'team',
                name: 'team',
                label: 'Kaynak Ekibi',
                type: 'dropdown',
                placeholder: 'Ekip seçin...',
                searchable: true,
                required: true,
                options: options.teams,
                colSize: 6
            }
        ]
    });

    createModal.addSection({
        title: `Kalemler (${pullModalItems.length})`,
        icon: 'fas fa-list',
        iconColor: 'text-primary',
        fields: pullModalItems.map((item) => ({
            id: `item_qty_${item.id}`,
            name: `item_qty_${item.id}`,
            label: `${item.item_code || '-'} — ${item.item_name || '-'}`,
            help: `İş No: ${item.job_no || '-'} · Birim: ${item.item_unit || '-'}`,
            type: 'number',
            value: item.quantity,
            min: 0.01,
            step: 0.01,
            required: true,
            colSize: 12
        }))
    });

    createModal.addSection({
        title: 'Not',
        icon: 'fas fa-sticky-note',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'note',
                name: 'note',
                label: 'Not (opsiyonel)',
                type: 'textarea',
                placeholder: 'Depoya iletmek istediğiniz not...',
                colSize: 12
            }
        ]
    });

    createModal.onSaveCallback(submitPullRequest);
    createModal.render();
    toggleDestinationFields();
    createModal.show();
}

async function submitPullRequest(formData) {
    const destinationType = formData.destination_type || 'subcontractor';
    const destinationId = destinationType === 'subcontractor' ? formData.subcontractor : formData.team;

    if (!destinationId) {
        showNotification(destinationType === 'subcontractor' ? 'Lütfen bir taşeron seçin' : 'Lütfen bir ekip seçin', 'warning');
        return;
    }
    if (pullModalItems.length === 0) {
        showNotification('Lütfen en az bir kalem ekleyin', 'warning');
        return;
    }

    const items = pullModalItems.map((item) => ({
        planning_item: item.id,
        quantity: parseFloat(formData[`item_qty_${item.id}`])
    }));
    if (items.some((item) => !isFinite(item.quantity) || item.quantity <= 0)) {
        showNotification('Tüm kalemlerin miktarı 0\'dan büyük olmalıdır', 'warning');
        return;
    }

    const payload = {
        note: (formData.note || '').trim(),
        items
    };
    payload[destinationType] = destinationId;

    try {
        const result = await createMaterialPullRequest(payload);
        showNotification(`Malzeme çekme talebi oluşturuldu: ${result.number}`, 'success');
        createModal.hide();
        table?.clearSelection();
        await loadItems();
    } catch (error) {
        console.error('Error creating pull request:', error);
        showNotification(error?.message || 'Depo çekme talebi oluşturulurken hata oluştu', 'danger');
    }
}
