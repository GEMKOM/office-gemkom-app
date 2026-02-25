import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import {
    getProcurementPendingJobOrders,
    getJobOrdersHasProcurement,
    getProcurementLines,
    getProcurementLinesPreview,
    submitProcurementLines
} from '../../../apis/projects/cost.js';
import { extractResultsFromResponse } from '../../../apis/paginationHelper.js';

// State
let pendingJobOrders = [];
let totalCount = 0;
let currentPage = 1;
let currentPageSize = 20;
let currentFilters = { status: '', search: '' };
let pendingTable = null;
let hasEntriesTable = null;
let hasEntriesFiltersComponent = null;
let hasEntriesFilters = { status: '', search: '' };
let hasEntriesData = [];
let hasEntriesTotal = 0;
let hasEntriesPage = 1;
let hasEntriesPageSize = 20;
let filtersComponent = null;
let confirmationModal = null;
let linesModal = null;
let linesModalBootstrap = null;
let currentJobOrderForLines = null;
/** @type {Array<{ id?: number, item?: number|null, item_code?: string|null, item_name?: string|null, item_description?: string, quantity: string, unit_price: string, amount_eur?: string, planning_request_item?: number|null, order: number, price_source?: string }>} */
let editingLines = [];
let linesTableContainerId = 'procurement-lines-table-body';

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) return;
    await initNavbar();

    const header = new HeaderComponent({
        title: 'Malzeme Maliyeti Satırları',
        subtitle: 'Satın alma bekleyen ve satır girilmiş iş emirleri',
        icon: 'project-diagram',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onRefreshClick: refreshAll,
        backUrl: '/planning/'
    });

    initPendingFilters();
    initPendingTable();
    initHasEntriesFilters();
    initHasEntriesTable();
    initConfirmationModal();
    initLinesModal();

    await loadPendingJobOrders();
});

function refreshAll() {
    currentPage = 1;
    hasEntriesPage = 1;
    loadPendingJobOrders();
    loadHasEntries();
}

function initPendingFilters() {
    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler (Bekleyen)',
        onApply: (values) => {
            currentPage = 1;
            currentFilters = {
                status: values['status-filter'] ?? '',
                search: values['search-filter'] ?? ''
            };
            loadPendingJobOrders();
        },
        onClear: () => {
            currentPage = 1;
            currentFilters = { status: '', search: '' };
            loadPendingJobOrders();
        }
    });
    filtersComponent.addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'İş emri no, başlık, müşteri...',
        colSize: 3
    });
    filtersComponent.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'active', label: 'Aktif' },
            { value: 'draft', label: 'Taslak' },
            { value: 'on_hold', label: 'Beklemede' },
            { value: 'completed', label: 'Tamamlandı' }
        ],
        placeholder: 'Tümü',
        colSize: 2
    });
}

function initHasEntriesFilters() {
    hasEntriesFiltersComponent = new FiltersComponent('has-entries-filters-placeholder', {
        title: 'Filtreler (Satır Girilmiş)',
        onApply: (values) => {
            hasEntriesPage = 1;
            hasEntriesFilters = {
                status: values['has-status-filter'] ?? '',
                search: values['has-search-filter'] ?? ''
            };
            loadHasEntries();
        },
        onClear: () => {
            hasEntriesPage = 1;
            hasEntriesFilters = { status: '', search: '' };
            loadHasEntries();
        }
    });
    hasEntriesFiltersComponent.addTextFilter({
        id: 'has-search-filter',
        label: 'Arama',
        placeholder: 'İş emri no, başlık, müşteri...',
        colSize: 3
    });
    hasEntriesFiltersComponent.addDropdownFilter({
        id: 'has-status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'active', label: 'Aktif' },
            { value: 'draft', label: 'Taslak' },
            { value: 'on_hold', label: 'Beklemede' },
            { value: 'completed', label: 'Tamamlandı' }
        ],
        placeholder: 'Tümü',
        colSize: 2
    });
}

function initPendingTable() {
    pendingTable = new TableComponent('procurement-pending-table-container', {
        title: 'Satın Alma Bekleyen İş Emirleri',
        icon: 'fas fa-shopping-cart',
        columns: [
            { field: 'job_no', label: 'İş Emri No', sortable: true },
            { field: 'title', label: 'Başlık', sortable: true },
            { field: 'customer_name', label: 'Müşteri', sortable: false },
            { field: 'status', label: 'Durum', sortable: true, formatter: formatStatus },
            { field: 'target_completion_date', label: 'Hedef Bitiş', sortable: true, formatter: formatDate }
        ],
        data: [],
        sortable: true,
        currentSortField: 'job_no',
        currentSortDirection: 'asc',
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        onPageChange: (page) => { currentPage = page; loadPendingJobOrders(); },
        onSort: (field, direction) => {
            const ordering = direction === 'desc' ? `-${field}` : field;
            loadPendingJobOrders({ ordering });
        },
        actions: [
            {
                key: 'open-lines',
                label: 'Satırları Aç',
                icon: 'fas fa-list',
                class: 'btn-outline-primary',
                onClick: (row) => openLinesModal(row.job_no)
            }
        ],
        emptyMessage: 'Listeyi yüklemek veya güncellemek için Filtrele veya Yenile butonuna tıklayın.',
        emptyIcon: 'fas fa-inbox',
        refreshable: true,
        onRefresh: () => { currentPage = 1; loadPendingJobOrders(); }
    });
}

function initHasEntriesTable() {
    hasEntriesTable = new TableComponent('procurement-has-entries-table-container', {
        title: 'Malzeme Maliyeti Girilmiş İş Emirleri',
        icon: 'fas fa-check-double',
        columns: [
            { field: 'job_no', label: 'İş Emri No', sortable: true },
            { field: 'title', label: 'Başlık', sortable: true },
            { field: 'customer_name', label: 'Müşteri', sortable: false },
            { field: 'status', label: 'Durum', sortable: true, formatter: formatStatus },
            { field: 'target_completion_date', label: 'Hedef Bitiş', sortable: true, formatter: formatDate }
        ],
        data: [],
        sortable: true,
        currentSortField: 'job_no',
        currentSortDirection: 'asc',
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        onPageChange: (page) => { hasEntriesPage = page; loadHasEntries(); },
        onSort: (field, direction) => {
            hasEntriesPage = 1;
            loadHasEntries({ ordering: direction === 'desc' ? `-${field}` : field });
        },
        actions: [
            { key: 'open-lines', label: 'Satırları Aç', icon: 'fas fa-list', class: 'btn-outline-primary', onClick: (row) => openLinesModal(row.job_no) }
        ],
        emptyMessage: 'Listeyi yüklemek için Filtrele veya Yenile butonuna tıklayın.',
        emptyIcon: 'fas fa-filter',
        refreshable: true,
        onRefresh: () => { hasEntriesPage = 1; loadHasEntries(); }
    });
}

function formatStatus(value) {
    const labels = { active: 'Aktif', draft: 'Taslak', on_hold: 'Beklemede', completed: 'Tamamlandı', cancelled: 'İptal' };
    const label = labels[value] || value || '–';
    const colorClass = value === 'active' ? 'status-green' : value === 'completed' ? 'status-blue' : value === 'on_hold' ? 'status-yellow' : value === 'cancelled' ? 'status-red' : 'status-grey';
    return `<span class="status-badge ${colorClass}">${label}</span>`;
}

function formatDate(value) {
    if (!value) return '–';
    try {
        return new Date(value).toLocaleDateString('tr-TR');
    } catch {
        return value;
    }
}

function initConfirmationModal() {
    confirmationModal = new ConfirmationModal('confirmation-modal-container', {
        title: 'Onay',
        message: '',
        confirmText: 'Evet',
        cancelText: 'İptal',
        onConfirm: () => {},
        onCancel: () => {}
    });
}

function initLinesModal() {
    const container = document.getElementById('procurement-lines-modal-container');
    if (!container) return;
    container.innerHTML = `
        <div class="modal fade" id="procurement-lines-modal" tabindex="-1">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-list me-2"></i>
                            <span id="procurement-lines-modal-title">Malzeme Maliyeti Satırları</span>
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Kapat"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3 d-flex justify-content-between align-items-center">
                            <button type="button" class="btn btn-sm btn-primary" id="procurement-lines-add-row">
                                <i class="fas fa-plus me-1"></i>Satır Ekle
                            </button>
                            <span class="text-muted small" id="procurement-lines-summary"></span>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-bordered table-sm">
                                <thead>
                                    <tr>
                                        <th>Malzeme Kodu</th>
                                        <th>Malzeme Adı</th>
                                        <th>Açıklama</th>
                                        <th style="width:100px;">Miktar</th>
                                        <th style="width:100px;">Birim Fiyat (EUR)</th>
                                        <th style="width:100px;">Tutar (EUR)</th>
                                        <th>Fiyat Kaynağı</th>
                                        <th>Fiyat Tarihi</th>
                                        <th style="width:60px;"></th>
                                    </tr>
                                </thead>
                                <tbody id="${linesTableContainerId}"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Kapat</button>
                        <button type="button" class="btn btn-primary" id="procurement-lines-save">
                            <i class="fas fa-save me-1"></i>Kaydet
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    linesModal = document.getElementById('procurement-lines-modal');
    linesModalBootstrap = new bootstrap.Modal(linesModal);

    document.getElementById('procurement-lines-add-row').addEventListener('click', addLineRow);
    document.getElementById('procurement-lines-save').addEventListener('click', saveLines);

    linesModal.addEventListener('shown.bs.modal', () => renderLinesTable());
}

/**
 * Open the lines modal for a job order. Load saved lines or preview.
 * @param {string} jobNo
 */
async function openLinesModal(jobNo) {
    currentJobOrderForLines = jobNo;
    const titleEl = document.getElementById('procurement-lines-modal-title');
    if (titleEl) titleEl.textContent = `Malzeme Maliyeti Satırları — ${jobNo}`;

    editingLines = [];
    const tbody = document.getElementById(linesTableContainerId);
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Yükleniyor...</td></tr>';

    linesModalBootstrap.show();

    try {
        const saved = await getProcurementLines(jobNo);
        if (saved && saved.length > 0) {
            editingLines = saved.map((line, idx) => ({
                id: line.id,
                item: line.item ?? null,
                item_code: line.item_code ?? '',
                item_name: line.item_name ?? '',
                item_unit: line.item_unit ?? '',
                item_description: line.item_description ?? '',
                quantity: line.quantity ?? '0',
                unit_price: line.unit_price ?? '0',
                amount_eur: line.amount_eur ?? '0',
                planning_request_item: line.planning_request_item ?? null,
                order: line.order ?? idx,
                price_source: line.price_source ?? null,
                price_date: line.price_date ?? null
            }));
        } else {
            const preview = await getProcurementLinesPreview(jobNo);
            if (preview && preview.length > 0) {
                editingLines = preview.map((p, idx) => ({
                    item: p.item ?? null,
                    item_code: p.item_code ?? '',
                    item_name: p.item_name ?? '',
                    item_unit: p.item_unit ?? '',
                    item_description: p.item_description ?? '',
                    quantity: p.quantity ?? '0',
                    unit_price: p.unit_price_eur != null && p.unit_price_eur !== '' ? String(p.unit_price_eur) : '0',
                    amount_eur: '0',
                    planning_request_item: p.planning_request_item ?? null,
                    order: p.order ?? idx,
                    price_source: p.price_source ?? null,
                    price_date: p.price_date ?? null
                }));
                editingLines.forEach((line, i) => {
                    const q = parseFloat(line.quantity) || 0;
                    const u = parseFloat(line.unit_price) || 0;
                    line.amount_eur = (q * u).toFixed(2);
                });
            } else {
                editingLines = [{ item: null, item_code: '', item_name: '', item_unit: '', item_description: '', quantity: '0', unit_price: '0', amount_eur: '0', planning_request_item: null, order: 0, price_source: null, price_date: null }];
            }
        }
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Satırlar yüklenemedi', 'error');
        editingLines = [];
    }

    renderLinesTable();
}

function addLineRow() {
    const order = editingLines.length;
    editingLines.push({
        item: null,
        item_code: '',
        item_name: '',
        item_unit: '',
        item_description: '',
        quantity: '0',
        unit_price: '0',
        amount_eur: '0',
        planning_request_item: null,
        order,
        price_source: null,
        price_date: null
    });
    renderLinesTable();
}

function removeLineRow(index) {
    editingLines.splice(index, 1);
    editingLines.forEach((line, i) => { line.order = i; });
    renderLinesTable();
}

function renderLinesTable() {
    const tbody = document.getElementById(linesTableContainerId);
    if (!tbody) return;

    tbody.innerHTML = editingLines.map((line, index) => {
        const amount = (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0);
        const amountStr = amount.toFixed(2);
        return `
            <tr data-index="${index}">
                <td class="text-muted">${escapeHtml(line.item_code || '–')}</td>
                <td class="text-muted">${escapeHtml(line.item_name || '–')}</td>
                <td><input type="text" class="form-control form-control-sm" data-field="item_description" data-index="${index}" value="${escapeHtml(line.item_description || '')}" placeholder="Açıklama"></td>
                <td><input type="text" class="form-control form-control-sm d-inline-block" data-field="quantity" data-index="${index}" value="${escapeHtml(line.quantity)}" placeholder="0" style="width:5rem"> <span class="text-muted small ms-1">${escapeHtml(line.item_unit || '–')}</span></td>
                <td><input type="text" class="form-control form-control-sm" data-field="unit_price" data-index="${index}" value="${escapeHtml(line.unit_price)}" placeholder="0"></td>
                <td class="align-middle">${amountStr}</td>
                <td class="text-muted small">${escapeHtml(formatPriceSource(line.price_source))}</td>
                <td class="text-muted small">${escapeHtml(formatPriceDate(line.price_date))}</td>
                <td>
                    <button type="button" class="btn btn-outline-danger btn-sm" data-remove-index="${index}" title="Satırı sil">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Totals
    const total = editingLines.reduce((sum, line) => {
        return sum + (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0);
    }, 0);
    const summaryEl = document.getElementById('procurement-lines-summary');
    if (summaryEl) summaryEl.textContent = `Toplam: ${editingLines.length} satır, Toplam tutar: ${total.toFixed(2)} EUR`;

    // Bind input and delete
    tbody.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            const field = e.target.dataset.field;
            if (editingLines[index] == null) return;
            editingLines[index][field] = field === 'order' ? String(parseInt(e.target.value, 10) || 0) : e.target.value;
            if (field === 'quantity' || field === 'unit_price') {
                const q = parseFloat(editingLines[index].quantity) || 0;
                const u = parseFloat(editingLines[index].unit_price) || 0;
                editingLines[index].amount_eur = (q * u).toFixed(2);
            }
            renderLinesTable();
        });
    });
    tbody.querySelectorAll('[data-remove-index]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.removeIndex, 10);
            removeLineRow(index);
        });
    });
}

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

/** Turkish labels for price_source (read-only info in modal) */
const PRICE_SOURCE_LABELS = {
    po_line: 'PO satırı (bu planlama kalemi)',
    recommended_offer: 'Önerilen tedarikçi teklifi',
    any_offer: 'Herhangi bir tedarikçi teklifi',
    historical_po: 'Aynı katalog kalemi, son PO (herhangi bir iş)',
    none: 'Fiyat yok (serbest metin veya hiç satın alınmamış)'
};

function formatPriceSource(value) {
    if (value == null || value === '') return '–';
    return PRICE_SOURCE_LABELS[value] || value;
}

function formatPriceDate(value) {
    if (value == null || value === '') return '–';
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return value;
        return d.toLocaleDateString('tr-TR');
    } catch {
        return value;
    }
}

function syncLinesFromDom() {
    const tbody = document.getElementById(linesTableContainerId);
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-index]').forEach(tr => {
        const index = parseInt(tr.dataset.index, 10);
        if (editingLines[index] == null) return;
        tr.querySelectorAll('input').forEach(input => {
            const field = input.dataset.field;
            const val = input.value;
            editingLines[index][field] = field === 'order' ? String(parseInt(val, 10) || 0) : val;
        });
        const q = parseFloat(editingLines[index].quantity) || 0;
        const u = parseFloat(editingLines[index].unit_price) || 0;
        editingLines[index].amount_eur = (q * u).toFixed(2);
    });
}

async function saveLines() {
    if (!currentJobOrderForLines) return;
    syncLinesFromDom();

    const payload = editingLines.map((line, idx) => {
        const itemDesc = (line.item_description || '').trim();
        const quantity = (line.quantity != null && line.quantity !== '') ? String(line.quantity) : '0';
        const unitPrice = (line.unit_price != null && line.unit_price !== '') ? String(line.unit_price) : '0';
        const order = typeof line.order === 'number' ? line.order : parseInt(line.order, 10) || idx;
        const item = line.item ?? null;
        const planningRequestItem = line.planning_request_item ?? null;
        if (!item && !itemDesc) {
            return null; // skip invalid line; we'll filter
        }
        return {
            item: item || undefined,
            item_description: itemDesc || undefined,
            quantity,
            unit_price: unitPrice,
            planning_request_item: planningRequestItem || undefined,
            order
        };
    }).filter(Boolean);

    // Validate: at least one line must have item or item_description
    const valid = payload.every(p => p.item != null || (p.item_description != null && p.item_description !== ''));
    if (payload.length > 0 && !valid) {
        showNotification('Her satırda malzeme veya açıklama girilmelidir.', 'error');
        return;
    }

    try {
        await submitProcurementLines(currentJobOrderForLines, payload);
        showNotification('Satırlar kaydedildi.', 'success');
        linesModalBootstrap.hide();
        await loadPendingJobOrders();
        loadHasEntries();
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Kaydetme başarısız', 'error');
    }
}

async function loadPendingJobOrders(options = {}) {
    const params = {
        page: options.page ?? currentPage,
        page_size: options.page_size ?? currentPageSize,
        ...currentFilters
    };
    if (params.status) params.status = params.status;
    if (params.search) params.search = params.search;
    params.ordering = options.ordering ?? 'job_no';

    try {
        const response = await getProcurementPendingJobOrders(params);
        const results = extractResultsFromResponse(response);
        pendingJobOrders = Array.isArray(results) ? results : (response.results || []);
        totalCount = response.count ?? pendingJobOrders.length;

        if (pendingTable) {
            pendingTable.options.data = pendingJobOrders;
            pendingTable.options.totalItems = totalCount;
            pendingTable.options.currentPage = currentPage;
            pendingTable.render();
        }
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Liste yüklenemedi', 'error');
        if (pendingTable) {
            pendingTable.options.data = [];
            pendingTable.options.totalItems = 0;
            pendingTable.render();
        }
    }
}

async function loadHasEntries(options = {}) {
    const params = {
        page: options.page ?? hasEntriesPage,
        page_size: options.page_size ?? hasEntriesPageSize,
        status: hasEntriesFilters.status,
        search: hasEntriesFilters.search,
        ordering: options.ordering ?? 'job_no'
    };
    try {
        const response = await getJobOrdersHasProcurement(params);
        const results = extractResultsFromResponse(response);
        hasEntriesData = Array.isArray(results) ? results : (response.results || []);
        hasEntriesTotal = response.count ?? hasEntriesData.length;
        if (hasEntriesTable) {
            hasEntriesTable.options.data = hasEntriesData;
            hasEntriesTable.options.totalItems = hasEntriesTotal;
            hasEntriesTable.options.currentPage = hasEntriesPage;
            hasEntriesTable.render();
        }
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Satır girilmiş liste yüklenemedi', 'error');
        if (hasEntriesTable) {
            hasEntriesTable.options.data = [];
            hasEntriesTable.options.totalItems = 0;
            hasEntriesTable.render();
        }
    }
}
