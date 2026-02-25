import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { showNotification } from '../../../components/notification/notification.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import {
    getQcPendingJobOrders,
    getJobOrdersHasQc,
    getQcCostLines,
    submitQcCostLines
} from '../../../apis/projects/cost.js';
import { extractResultsFromResponse } from '../../../apis/paginationHelper.js';

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

let linesModal = null;
let linesModalBootstrap = null;
let currentJobOrderForLines = null;
let linesTableBodyId = 'qc-lines-tbody';
/** @type {Array<{ description: string, amount_eur: string, date: string, notes: string }>} */
let editingLines = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'KK Maliyet Satırları',
        subtitle: 'Kalite kontrol maliyeti girilmemiş ve girilmiş iş emirleri',
        icon: 'project-diagram',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onRefreshClick: refreshAll,
        backUrl: '/quality-control/'
    });

    initPendingFilters();
    initPendingTable();
    initHasEntriesFilters();
    initHasEntriesTable();
    initLinesModal();
    await loadPending();
});

function refreshAll() {
    currentPage = 1;
    hasEntriesPage = 1;
    loadPending();
    loadHasEntries();
}

function initPendingFilters() {
    const filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler (Bekleyen)',
        onApply: (values) => {
            currentPage = 1;
            currentFilters = { status: values['status-filter'] ?? '', search: values['search-filter'] ?? '' };
            loadPending();
        },
        onClear: () => {
            currentPage = 1;
            currentFilters = { status: '', search: '' };
            loadPending();
        }
    });
    filtersComponent.addTextFilter({ id: 'search-filter', label: 'Arama', placeholder: 'İş emri no, başlık, müşteri...', colSize: 3 });
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
            hasEntriesFilters = { status: values['has-status-filter'] ?? '', search: values['has-search-filter'] ?? '' };
            loadHasEntries();
        },
        onClear: () => {
            hasEntriesPage = 1;
            hasEntriesFilters = { status: '', search: '' };
            loadHasEntries();
        }
    });
    hasEntriesFiltersComponent.addTextFilter({ id: 'has-search-filter', label: 'Arama', placeholder: 'İş emri no, başlık, müşteri...', colSize: 3 });
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
    pendingTable = new TableComponent('pending-table-container', {
        title: 'KK Maliyeti Girilmemiş İş Emirleri',
        icon: 'fas fa-clipboard-check',
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
        onPageChange: (page) => { currentPage = page; loadPending(); },
        onSort: (field, direction) => loadPending({ ordering: direction === 'desc' ? `-${field}` : field }),
        actions: [{ key: 'open', label: 'Satırları Aç', icon: 'fas fa-list', class: 'btn-outline-primary', onClick: (row) => openLinesModal(row.job_no) }],
        emptyMessage: 'Listeyi yüklemek veya güncellemek için Filtrele veya Yenile butonuna tıklayın.',
        emptyIcon: 'fas fa-inbox',
        refreshable: true,
        onRefresh: () => { currentPage = 1; loadPending(); }
    });
}

function initHasEntriesTable() {
    hasEntriesTable = new TableComponent('has-entries-table-container', {
        title: 'KK Maliyeti Girilmiş İş Emirleri',
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
        onSort: (field, direction) => loadHasEntries({ ordering: direction === 'desc' ? `-${field}` : field }),
        actions: [{ key: 'open', label: 'Satırları Aç', icon: 'fas fa-list', class: 'btn-outline-primary', onClick: (row) => openLinesModal(row.job_no) }],
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
    try { return new Date(value).toLocaleDateString('tr-TR'); } catch { return value; }
}

function initLinesModal() {
    const container = document.getElementById('lines-modal-container');
    if (!container) return;
    container.innerHTML = `
        <div class="modal fade" id="qc-lines-modal" tabindex="-1">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="fas fa-clipboard-check me-2"></i><span id="lines-modal-title">KK Maliyet Satırları</span></h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Kapat"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <button type="button" class="btn btn-sm btn-primary" id="lines-add-line-btn"><i class="fas fa-plus me-1"></i>Satır Ekle</button>
                            <span class="text-muted small" id="lines-summary"></span>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-bordered table-sm">
                                <thead><tr><th>Açıklama</th><th>Tutar (EUR)</th><th>Tarih</th><th>Notlar</th><th style="width:60px;"></th></tr></thead>
                                <tbody id="${linesTableBodyId}"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Kapat</button>
                        <button type="button" class="btn btn-primary" id="lines-save-btn"><i class="fas fa-save me-1"></i>Kaydet</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    linesModal = document.getElementById('qc-lines-modal');
    linesModalBootstrap = new bootstrap.Modal(linesModal);

    document.getElementById('lines-add-line-btn').addEventListener('click', () => {
        editingLines.push({ description: '', amount_eur: '0.00', date: '', notes: '' });
        renderLinesTable();
    });
    document.getElementById('lines-save-btn').addEventListener('click', saveLines);
    linesModal.addEventListener('shown.bs.modal', () => renderLinesTable());
}

async function openLinesModal(jobNo) {
    currentJobOrderForLines = jobNo;
    const titleEl = document.getElementById('lines-modal-title');
    if (titleEl) titleEl.textContent = `KK Maliyet Satırları — ${jobNo}`;
    const tbody = document.getElementById(linesTableBodyId);
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Yükleniyor...</td></tr>';
    linesModalBootstrap.show();

    try {
        const lines = await getQcCostLines(jobNo);
        editingLines = (Array.isArray(lines) ? lines : []).map((line) => ({
            description: line.description ?? '',
            amount_eur: line.amount_eur != null ? String(line.amount_eur) : '0.00',
            date: line.date ? (line.date.slice ? line.date.slice(0, 10) : line.date) : '',
            notes: line.notes ?? ''
        }));
        if (editingLines.length === 0) {
            editingLines = [{ description: '', amount_eur: '0.00', date: '', notes: '' }];
        }
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Satırlar yüklenemedi', 'error');
        editingLines = [{ description: '', amount_eur: '0.00', date: '', notes: '' }];
    }
    renderLinesTable();
}

function removeLineRow(index) {
    editingLines.splice(index, 1);
    if (editingLines.length === 0) editingLines = [{ description: '', amount_eur: '0.00', date: '', notes: '' }];
    renderLinesTable();
}

function renderLinesTable() {
    const tbody = document.getElementById(linesTableBodyId);
    if (!tbody) return;

    tbody.innerHTML = editingLines.map((line, index) => `
        <tr data-index="${index}">
            <td><input type="text" class="form-control form-control-sm" data-field="description" data-index="${index}" value="${escapeHtml(line.description)}" placeholder="Açıklama"></td>
            <td><input type="text" class="form-control form-control-sm" data-field="amount_eur" data-index="${index}" value="${escapeHtml(line.amount_eur)}" placeholder="0.00" style="width:6rem"></td>
            <td><input type="date" class="form-control form-control-sm" data-field="date" data-index="${index}" value="${escapeHtml(line.date)}" style="width:10rem"></td>
            <td><input type="text" class="form-control form-control-sm" data-field="notes" data-index="${index}" value="${escapeHtml(line.notes)}" placeholder="Notlar"></td>
            <td><button type="button" class="btn btn-outline-danger btn-sm" data-remove-index="${index}" title="Satırı sil"><i class="fas fa-trash"></i></button></td>
        </tr>
    `).join('');

    const total = editingLines.reduce((sum, line) => sum + (parseFloat(line.amount_eur) || 0), 0);
    const summaryEl = document.getElementById('lines-summary');
    if (summaryEl) summaryEl.textContent = `${editingLines.length} satır, Toplam: €${total.toFixed(2)}`;

    tbody.querySelectorAll('input').forEach((input) => {
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index, 10);
            const field = e.target.dataset.field;
            if (editingLines[index] != null) editingLines[index][field] = e.target.value;
        });
    });
    tbody.querySelectorAll('[data-remove-index]').forEach((btn) => {
        btn.addEventListener('click', () => {
            removeLineRow(parseInt(btn.dataset.removeIndex, 10));
        });
    });
}

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function syncLinesFromDom() {
    const tbody = document.getElementById(linesTableBodyId);
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-index]').forEach((tr) => {
        const index = parseInt(tr.dataset.index, 10);
        if (editingLines[index] == null) return;
        tr.querySelectorAll('input').forEach((input) => {
            editingLines[index][input.dataset.field] = input.value;
        });
    });
}

async function saveLines() {
    if (!currentJobOrderForLines) return;
    syncLinesFromDom();

    const lines = editingLines
        .map((line) => ({
            description: (line.description || '').trim(),
            amount_eur: (line.amount_eur != null && line.amount_eur !== '') ? String(line.amount_eur) : '0.00',
            date: (line.date || '').trim() || undefined,
            notes: (line.notes || '').trim() || undefined
        }))
        .filter((l) => l.description !== '');

    try {
        await submitQcCostLines(currentJobOrderForLines, lines);
        showNotification('Satırlar kaydedildi.', 'success');
        linesModalBootstrap.hide();
        await loadPending();
        loadHasEntries();
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Kaydetme başarısız', 'error');
    }
}

async function loadPending(options = {}) {
    const params = {
        page: options.page ?? currentPage,
        page_size: options.page_size ?? currentPageSize,
        ...currentFilters,
        ordering: options.ordering ?? 'job_no'
    };
    try {
        const response = await getQcPendingJobOrders(params);
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
        if (pendingTable) { pendingTable.options.data = []; pendingTable.options.totalItems = 0; pendingTable.render(); }
    }
}

async function loadHasEntries(options = {}) {
    const params = {
        page: options.page ?? hasEntriesPage,
        page_size: options.page_size ?? hasEntriesPageSize,
        ...hasEntriesFilters,
        ordering: options.ordering ?? 'job_no'
    };
    try {
        const response = await getJobOrdersHasQc(params);
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
