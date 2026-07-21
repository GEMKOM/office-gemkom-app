import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
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

/** @type {EditModal|null} */
let linesModal = null;
let currentJobOrderForLines = null;
/** @type {Array<{ description: string, amount_eur: string, date: string, notes: string }>} */
let editingLines = [];
let linesLoading = false;
let linesRequestSeq = 0;

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
    await Promise.all([loadPending(), loadHasEntries()]);
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
            { field: 'target_completion_date', label: 'Hedef Bitiş', sortable: true, formatter: formatDate },
            { field: 'qc_total_eur', label: 'Toplam (EUR)', sortable: false, formatter: formatEur }
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

function formatEur(value) {
    const num = parseFloat(value);
    if (value == null || isNaN(num)) return '–';
    return `€${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function initLinesModal() {
    linesModal = new EditModal('lines-modal-container', {
        title: 'KK Maliyet Satırları',
        icon: 'fas fa-clipboard-check',
        saveButtonText: 'Kaydet',
        size: 'xl'
    });
    linesModal.onSaveCallback(saveLines);

    const footer = linesModal.container.querySelector('.modal-footer');
    if (footer) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-sm btn-outline-primary me-auto';
        addBtn.id = 'lines-add-line-btn';
        addBtn.innerHTML = '<i class="fas fa-plus me-1"></i>Satır Ekle';
        addBtn.addEventListener('click', () => {
            if (linesLoading) return;
            syncLinesFromForm();
            editingLines.push({ description: '', amount_eur: '0.00', date: '', notes: '' });
            rebuildLinesForm();
        });
        footer.insertBefore(addBtn, footer.firstChild);
    }
}

function emptyLine() {
    return { description: '', amount_eur: '0.00', date: '', notes: '' };
}

function syncLinesFromForm() {
    if (!linesModal) return;
    const data = linesModal.getFormData();
    editingLines = editingLines.map((_, index) => ({
        description: data[`description_${index}`] != null ? String(data[`description_${index}`]) : '',
        amount_eur: data[`amount_eur_${index}`] != null && data[`amount_eur_${index}`] !== ''
            ? String(data[`amount_eur_${index}`])
            : '0.00',
        date: data[`date_${index}`] != null ? String(data[`date_${index}`]) : '',
        notes: data[`notes_${index}`] != null ? String(data[`notes_${index}`]) : ''
    }));
}

function rebuildLinesForm() {
    if (!linesModal) return;

    linesModal.clearAll();

    const total = editingLines.reduce((sum, line) => sum + (parseFloat(line.amount_eur) || 0), 0);
    linesModal.addSection({
        title: `${editingLines.length} satır, Toplam: €${total.toFixed(2)}`,
        icon: 'fas fa-calculator',
        iconColor: 'text-muted',
        fields: []
    });

    editingLines.forEach((line, index) => {
        linesModal.addSection({
            title: `Satır ${index + 1}`,
            icon: 'fas fa-list',
            iconColor: 'text-primary',
            fields: [
                {
                    id: `description_${index}`,
                    name: `description_${index}`,
                    label: 'Açıklama',
                    type: 'text',
                    value: line.description,
                    placeholder: 'Açıklama',
                    colSize: 4
                },
                {
                    id: `amount_eur_${index}`,
                    name: `amount_eur_${index}`,
                    label: 'Tutar (EUR)',
                    type: 'number',
                    value: line.amount_eur,
                    step: '0.01',
                    min: 0,
                    colSize: 2
                },
                {
                    id: `date_${index}`,
                    name: `date_${index}`,
                    label: 'Tarih',
                    type: 'date',
                    value: line.date,
                    colSize: 3
                },
                {
                    id: `notes_${index}`,
                    name: `notes_${index}`,
                    label: 'Notlar',
                    type: 'text',
                    value: line.notes,
                    placeholder: 'Notlar',
                    colSize: 2
                },
                {
                    id: `remove_${index}`,
                    name: `remove_${index}`,
                    label: ' ',
                    type: 'text',
                    value: '',
                    colSize: 1
                }
            ]
        });
    });

    linesModal.render();

    editingLines.forEach((_, index) => {
        const fieldGroup = linesModal.container.querySelector(`[data-field-id="remove_${index}"]`);
        if (!fieldGroup) return;
        fieldGroup.innerHTML = `
            <label class="field-label">&nbsp;</label>
            <button type="button" class="btn btn-outline-danger btn-sm w-100" data-remove-index="${index}" title="Satırı sil">
                <i class="fas fa-trash"></i>
            </button>
        `;
        fieldGroup.querySelector('button')?.addEventListener('click', () => {
            syncLinesFromForm();
            editingLines.splice(index, 1);
            if (editingLines.length === 0) editingLines = [emptyLine()];
            rebuildLinesForm();
        });
    });
}

async function openLinesModal(jobNo) {
    currentJobOrderForLines = jobNo;
    editingLines = [];
    linesLoading = true;
    const requestId = ++linesRequestSeq;

    linesModal.setTitle(`KK Maliyet Satırları — ${jobNo}`);
    linesModal.clearAll();
    linesModal.setLoading(true);
    linesModal.show();

    try {
        const lines = await getQcCostLines(jobNo);
        if (requestId !== linesRequestSeq) return;
        editingLines = (Array.isArray(lines) ? lines : []).map((line) => ({
            description: line.description ?? '',
            amount_eur: line.amount_eur != null ? String(line.amount_eur) : '0.00',
            date: line.date ? (line.date.slice ? line.date.slice(0, 10) : line.date) : '',
            notes: line.notes ?? ''
        }));
        if (editingLines.length === 0) {
            editingLines = [emptyLine()];
        }
    } catch (err) {
        if (requestId !== linesRequestSeq) return;
        console.error(err);
        showNotification(err.message || 'Satırlar yüklenemedi', 'error');
        editingLines = [emptyLine()];
    }

    if (requestId !== linesRequestSeq) return;
    linesLoading = false;
    linesModal.setLoading(false);
    rebuildLinesForm();
}

async function saveLines(formData) {
    if (!currentJobOrderForLines || linesLoading) return;

    const lines = editingLines
        .map((_, index) => ({
            description: String(formData[`description_${index}`] ?? '').trim(),
            amount_eur: (formData[`amount_eur_${index}`] != null && formData[`amount_eur_${index}`] !== '')
                ? String(formData[`amount_eur_${index}`])
                : '0.00',
            date: String(formData[`date_${index}`] ?? '').trim() || undefined,
            notes: String(formData[`notes_${index}`] ?? '').trim() || undefined
        }))
        .filter((l) => l.description !== '');

    try {
        await submitQcCostLines(currentJobOrderForLines, lines);
        showNotification('Satırlar kaydedildi.', 'success');
        linesModal.hide();
        await Promise.all([loadPending(), loadHasEntries()]);
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Kaydetme başarısız', 'error');
        throw err;
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
            pendingTable.updateData(pendingJobOrders, totalCount, currentPage);
        }
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Liste yüklenemedi', 'error');
        if (pendingTable) pendingTable.updateData([], 0, currentPage);
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
            hasEntriesTable.updateData(hasEntriesData, hasEntriesTotal, hasEntriesPage);
        }
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Satır girilmiş liste yüklenemedi', 'error');
        if (hasEntriesTable) {
            hasEntriesTable.updateData([], 0, hasEntriesPage);
        }
    }
}
