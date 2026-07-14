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
    submitProcurementLines,
    patchJobCostSummary
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
/**
 * Active Excel comparison state (null = no comparison shown).
 * @type {null | { fileName: string, byCode: Map<string, object>, byName: Map<string, object[]>, rows: object[] }}
 */
let excelCompare = null;
const EXCEL_PRICE_TOLERANCE = 0.01;

/**
 * Snapshot the as-loaded values on each line so edits (manual or Excel-applied)
 * can be reverted before saving. Lines added in the modal have no snapshot.
 */
function snapshotOriginalLines() {
    editingLines.forEach(line => {
        line._orig = {
            quantity: line.quantity,
            unit_price: line.unit_price,
            item_description: line.item_description || ''
        };
    });
}

function isLineChanged(line) {
    if (!line._orig) return false;
    const numDiff = (a, b) => Math.abs((parseFloat(a) || 0) - (parseFloat(b) || 0)) > 1e-9;
    return numDiff(line.quantity, line._orig.quantity)
        || numDiff(line.unit_price, line._orig.unit_price)
        || (line.item_description || '') !== (line._orig.item_description || '');
}

function restoreLineFromSnapshot(line) {
    if (!line._orig) return false;
    line.quantity = line._orig.quantity;
    line.unit_price = line._orig.unit_price;
    line.item_description = line._orig.item_description;
    const q = parseFloat(line.quantity) || 0;
    line.amount_eur = (q * (parseFloat(line.unit_price) || 0)).toFixed(2);
    return true;
}

function revertLine(index) {
    syncLinesFromDom();
    const line = editingLines[index];
    if (!line || !restoreLineFromSnapshot(line)) return;
    renderLinesTable();
}

function revertAllLines() {
    syncLinesFromDom();
    let reverted = 0;
    for (const line of editingLines) {
        if (isLineChanged(line) && restoreLineFromSnapshot(line)) reverted++;
    }
    renderLinesTable();
    if (reverted > 0) {
        showNotification(`${reverted} satır ilk haline döndürüldü.`, 'success');
    }
}

function mapSavedProcurementLines(lines) {
    if (!Array.isArray(lines)) return [];
    return lines.map((line, idx) => ({
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
}

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
            },
            {
                key: 'mark-cost-na',
                label: 'Maliyet Uygulanamaz',
                title: 'Maliyet Uygulanamaz Olarak İşaretle',
                icon: 'fas fa-ban',
                class: 'btn-outline-danger',
                onClick: (row) => confirmMarkCostNotApplicable(row.job_no)
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
            { key: 'open-lines', label: 'Satırları Aç', icon: 'fas fa-list', class: 'btn-outline-primary', onClick: (row) => openLinesModal(row.job_no) },
            { key: 'preview-lines', label: 'Önizle', title: 'Malzeme Maliyeti Önizlemesi', icon: 'fas fa-eye', class: 'btn-outline-secondary', onClick: (row) => openLinesModal(row.job_no, { usePreview: true }) },
            { key: 'mark-cost-na', label: 'Maliyet Uygulanamaz', title: 'Maliyet Uygulanamaz Olarak İşaretle', icon: 'fas fa-ban', class: 'btn-outline-danger', onClick: (row) => confirmMarkCostNotApplicable(row.job_no) }
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
                        <div class="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <div class="d-flex align-items-center gap-2">
                                <button type="button" class="btn btn-sm btn-primary" id="procurement-lines-add-row">
                                    <i class="fas fa-plus me-1"></i>Satır Ekle
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-warning text-nowrap d-none" id="procurement-lines-revert-all">
                                    <i class="fas fa-undo me-1"></i>Değişiklikleri Geri Al
                                </button>
                            </div>
                            <div class="d-flex align-items-center gap-2">
                                <input type="file" class="form-control form-control-sm" id="procurement-lines-excel-input" accept=".xls,.xlsx" style="max-width:280px;">
                                <button type="button" class="btn btn-sm btn-outline-primary text-nowrap" id="procurement-lines-compare">
                                    <i class="fas fa-file-excel me-1"></i>Excel ile Karşılaştır
                                </button>
                                <button type="button" class="btn btn-sm btn-danger text-nowrap d-none" id="procurement-lines-apply-all">
                                    <i class="fas fa-check-double me-1"></i>Tümünü Uygula
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-secondary text-nowrap d-none" id="procurement-lines-compare-clear">
                                    <i class="fas fa-times me-1"></i>Karşılaştırmayı Kaldır
                                </button>
                            </div>
                            <span class="text-muted small" id="procurement-lines-summary"></span>
                        </div>
                        <div class="small mb-2" id="procurement-lines-compare-info"></div>
                        <div class="table-responsive">
                            <table class="table table-bordered table-sm">
                                <thead>
                                    <tr id="procurement-lines-head-row"></tr>
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
    document.getElementById('procurement-lines-compare').addEventListener('click', compareWithExcel);
    document.getElementById('procurement-lines-compare-clear').addEventListener('click', clearExcelCompare);
    document.getElementById('procurement-lines-apply-all').addEventListener('click', applyExcelPriceAll);
    document.getElementById('procurement-lines-revert-all').addEventListener('click', revertAllLines);

    linesModal.addEventListener('shown.bs.modal', () => renderLinesTable());
}

function confirmMarkCostNotApplicable(jobNo) {
    if (!confirmationModal) return;
    confirmationModal.show({
        title: 'Maliyet Uygulanamaz',
        message: `${jobNo} için maliyet uygulanamaz olarak işaretlensin mi?`,
        description: 'Bu işlem sonrası iş emri tüm departman bekleyen listelerinden ve maliyet tablosundan kaldırılır.',
        confirmText: 'Evet, işaretle',
        confirmButtonClass: 'btn-danger',
        onConfirm: () => markCostNotApplicable(jobNo)
    });
}

async function markCostNotApplicable(jobNo) {
    const confirmBtn = document.querySelector('#confirmationModal #confirm-action-btn');
    const prevHtml = confirmBtn ? confirmBtn.innerHTML : null;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Gönderiliyor...';
    }

    try {
        await patchJobCostSummary(jobNo, { cost_not_applicable: true });
        showNotification('İş emri maliyet uygulanamaz olarak işaretlendi.', 'success');

        // Immediate UI feedback
        removeJobOrderFromLocalLists(jobNo);

        // Ensure counts/pagination are correct
        await Promise.allSettled([loadPendingJobOrders(), loadHasEntries()]);
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'İşlem başarısız', 'error');
        throw err; // keep modal open (ConfirmationModal respects rejected promises)
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            if (prevHtml != null) confirmBtn.innerHTML = prevHtml;
        }
    }
}

function removeJobOrderFromLocalLists(jobNo) {
    let removedPending = 0;
    let removedHas = 0;

    if (Array.isArray(pendingJobOrders) && pendingJobOrders.length) {
        const before = pendingJobOrders.length;
        pendingJobOrders = pendingJobOrders.filter(j => j.job_no !== jobNo);
        removedPending = before - pendingJobOrders.length;
        if (removedPending > 0) {
            totalCount = Math.max(0, (totalCount || 0) - removedPending);
            if (pendingTable) {
                pendingTable.options.data = pendingJobOrders;
                pendingTable.options.totalItems = totalCount;
                pendingTable.render();
            }
        }
    }

    if (Array.isArray(hasEntriesData) && hasEntriesData.length) {
        const before = hasEntriesData.length;
        hasEntriesData = hasEntriesData.filter(j => j.job_no !== jobNo);
        removedHas = before - hasEntriesData.length;
        if (removedHas > 0) {
            hasEntriesTotal = Math.max(0, (hasEntriesTotal || 0) - removedHas);
            if (hasEntriesTable) {
                hasEntriesTable.options.data = hasEntriesData;
                hasEntriesTable.options.totalItems = hasEntriesTotal;
                hasEntriesTable.options.currentPage = hasEntriesPage;
                hasEntriesTable.render();
            }
        }
    }
}

function emptyProcurementLine(order = 0) {
    return {
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
    };
}

async function loadPreviewProcurementLines(jobNo) {
    const preview = await getProcurementLinesPreview(jobNo);
    if (!preview || preview.length === 0) {
        return [emptyProcurementLine()];
    }
    const lines = preview.map((p, idx) => ({
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
    lines.forEach((line) => {
        const q = parseFloat(line.quantity) || 0;
        const u = parseFloat(line.unit_price) || 0;
        line.amount_eur = (q * u).toFixed(2);
    });
    return lines;
}

/**
 * Open the lines modal for a job order. Load saved lines or preview.
 * @param {string} jobNo
 * @param {{ usePreview?: boolean }} [options]
 */
async function openLinesModal(jobNo, { usePreview = false } = {}) {
    currentJobOrderForLines = jobNo;
    const titleEl = document.getElementById('procurement-lines-modal-title');
    if (titleEl) titleEl.textContent = `Malzeme Maliyeti Satırları — ${jobNo}`;

    clearExcelCompare();
    editingLines = [];
    const tbody = document.getElementById(linesTableContainerId);
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Yükleniyor...</td></tr>';

    linesModalBootstrap.show();

    try {
        if (usePreview) {
            editingLines = await loadPreviewProcurementLines(jobNo);
        } else {
            const saved = await getProcurementLines(jobNo);
            if (saved && saved.length > 0) {
                editingLines = mapSavedProcurementLines(saved);
            } else {
                editingLines = await loadPreviewProcurementLines(jobNo);
            }
        }
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Satırlar yüklenemedi', 'error');
        editingLines = [];
    }

    snapshotOriginalLines();
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

/** Normalize a stock code for matching: strip all whitespace, uppercase. */
function normalizeStockCode(value) {
    return String(value ?? '').replace(/\s+/g, '').toLocaleUpperCase('tr-TR');
}

/** Normalize a stock name for matching: collapse whitespace, uppercase (tr). */
function normalizeStockName(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr-TR');
}

/** Normalize a header cell for column detection: uppercase, ASCII-fold Turkish chars, drop non-alphanumerics. */
function normalizeHeader(value) {
    const map = { 'İ': 'I', 'I': 'I', 'Ş': 'S', 'Ğ': 'G', 'Ü': 'U', 'Ö': 'O', 'Ç': 'C', 'ı': 'I' };
    return String(value ?? '')
        .toLocaleUpperCase('tr-TR')
        .replace(/[İIŞĞÜÖÇı]/g, ch => map[ch] || ch)
        .replace(/[^A-Z0-9]/g, '');
}

/** Parse a numeric cell that may be a number or a Turkish-formatted string ("1.234,56"). */
function parseExcelNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (value == null || value === '') return 0;
    let s = String(value).trim();
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Parse the uploaded workbook into comparison rows.
 * Expected columns (matched by header text): STOK KODU, STOK İSMİ,
 * TALEP MİKTARI, SİPARİŞ MİKTARI, Sip. Tutar EUR (line total).
 */
function parseExcelComparisonRows(workbook) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Locate the header row (first row containing a STOK KODU cell)
    let headerRowIdx = -1;
    const colIdx = { code: -1, name: -1, reqQty: -1, orderQty: -1, amountEur: -1 };
    for (let r = 0; r < Math.min(grid.length, 15); r++) {
        const headers = grid[r].map(normalizeHeader);
        const codeIdx = headers.indexOf('STOKKODU');
        if (codeIdx === -1) continue;
        headerRowIdx = r;
        colIdx.code = codeIdx;
        colIdx.name = headers.indexOf('STOKISMI');
        colIdx.reqQty = headers.indexOf('TALEPMIKTARI');
        colIdx.orderQty = headers.indexOf('SIPARISMIKTARI');
        colIdx.amountEur = headers.findIndex(h => h.includes('SIP') && h.includes('TUTAR') && h.includes('EUR'));
        break;
    }
    if (headerRowIdx === -1) {
        throw new Error('Excel dosyasında "STOK KODU" başlıklı sütun bulunamadı.');
    }
    if (colIdx.amountEur === -1) {
        throw new Error('Excel dosyasında "Sip. Tutar EUR" sütunu bulunamadı.');
    }

    const rows = [];
    for (let r = headerRowIdx + 1; r < grid.length; r++) {
        const row = grid[r];
        const code = normalizeStockCode(row[colIdx.code]);
        if (!code) continue; // skips empty rows and the totals row at the bottom
        const orderQty = colIdx.orderQty !== -1 ? parseExcelNumber(row[colIdx.orderQty]) : 0;
        const reqQty = colIdx.reqQty !== -1 ? parseExcelNumber(row[colIdx.reqQty]) : 0;
        rows.push({
            code,
            rawCode: String(row[colIdx.code] ?? '').trim(),
            name: colIdx.name !== -1 ? String(row[colIdx.name] ?? '').trim() : '',
            qty: orderQty > 0 ? orderQty : reqQty,
            amountEur: parseExcelNumber(row[colIdx.amountEur])
        });
    }
    return rows;
}

/** Build lookup maps; duplicate stock codes are aggregated (qty and amount summed). */
function buildExcelCompareState(rows, fileName) {
    const byCode = new Map();
    for (const row of rows) {
        const existing = byCode.get(row.code);
        if (existing) {
            existing.qty += row.qty;
            existing.amountEur += row.amountEur;
        } else {
            byCode.set(row.code, { ...row });
        }
    }
    const byName = new Map();
    for (const row of byCode.values()) {
        row.unitPrice = row.qty > 0 ? row.amountEur / row.qty : null;
        const nameKey = normalizeStockName(row.name);
        if (!nameKey) continue;
        if (!byName.has(nameKey)) byName.set(nameKey, []);
        byName.get(nameKey).push(row);
    }
    return { fileName, byCode, byName, rows: [...byCode.values()] };
}

/** Find a possible Excel row for a line without considering other app lines. */
function getExcelMatchCandidate(line) {
    if (!excelCompare) return null;
    const code = normalizeStockCode(line.item_code);
    if (code && excelCompare.byCode.has(code)) return excelCompare.byCode.get(code);
    const nameKey = normalizeStockName(line.item_name);
    if (nameKey && excelCompare.byName.has(nameKey)) {
        const candidates = excelCompare.byName.get(nameKey);
        const q = parseFloat(line.quantity) || 0;
        return candidates.find(r => Math.abs(r.qty - q) < 1e-9) || candidates[0];
    }
    return null;
}

/**
 * Find the Excel row for a line, but only when that row maps to exactly one
 * app line. Excel rows are aggregated by stock code, so applying one aggregate
 * to multiple app lines would copy the total quantity into every line.
 */
function getExcelMatchForLine(line) {
    const match = getExcelMatchCandidate(line);
    if (!match) return null;
    const matchingLineCount = editingLines.reduce((count, candidateLine) => {
        return count + (getExcelMatchCandidate(candidateLine) === match ? 1 : 0);
    }, 0);
    return matchingLineCount === 1 ? match : null;
}

/**
 * Compare a line against its Excel match. Mismatch is decided on the LINE TOTAL
 * (our qty × unit price vs Excel "Sip. Tutar EUR"); qty/unit flags say which
 * side of the multiplication differs so the culprit can be highlighted/fixed.
 */
function getExcelDiff(line, match) {
    if (!match) return null;
    const ourQty = parseFloat(line.quantity) || 0;
    const ourUnit = parseFloat(line.unit_price) || 0;
    const ourAmount = ourQty * ourUnit;
    return {
        amountMismatch: Math.abs(ourAmount - match.amountEur) > EXCEL_PRICE_TOLERANCE,
        // 0.005 tolerance: backend stores quantity at 2 decimals, so an Excel qty
        // with more decimals rounds on apply and must still count as equal
        qtyDiffers: Math.abs(ourQty - match.qty) > 0.005,
        unitDiffers: match.unitPrice != null && Math.abs(ourUnit - match.unitPrice) > EXCEL_PRICE_TOLERANCE
    };
}

/**
 * Overwrite the differing value(s) of a line with the Excel values so the
 * line total matches Excel. Returns true if anything changed.
 */
function applyExcelToLine(line, match) {
    const diff = getExcelDiff(line, match);
    if (!diff || !diff.amountMismatch) return false;
    // Backend precision: quantity 2 decimals, unit_price 6 decimals
    if (diff.qtyDiffers) {
        line.quantity = String(parseFloat(match.qty.toFixed(2)));
    }
    if (diff.unitDiffers && match.unitPrice != null) {
        line.unit_price = String(parseFloat(match.unitPrice.toFixed(6)));
    }
    const q = parseFloat(line.quantity) || 0;
    let u = parseFloat(line.unit_price) || 0;
    // Residual drift (Excel qty 0, rounding, or a sub-tolerance unit diff over a
    // large quantity): derive the unit price so the line total matches exactly
    if (Math.abs(q * u - match.amountEur) > EXCEL_PRICE_TOLERANCE) {
        if (q <= 0) return false;
        line.unit_price = String(parseFloat((match.amountEur / q).toFixed(6)));
        u = parseFloat(line.unit_price) || 0;
    }
    line.amount_eur = (q * u).toFixed(2);
    return true;
}

function compareWithExcel() {
    const fileInput = document.getElementById('procurement-lines-excel-input');
    const file = fileInput?.files?.[0];
    if (!file) {
        showNotification('Lütfen önce bir Excel dosyası seçin.', 'warning');
        return;
    }
    syncLinesFromDom();
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const rows = parseExcelComparisonRows(workbook);
            if (rows.length === 0) {
                showNotification('Excel dosyasında karşılaştırılacak satır bulunamadı.', 'warning');
                return;
            }
            excelCompare = buildExcelCompareState(rows, file.name);
            document.getElementById('procurement-lines-compare-clear')?.classList.remove('d-none');
            renderLinesTable();
        } catch (err) {
            console.error(err);
            showNotification(err.message || 'Excel dosyası okunamadı.', 'error');
        }
    };
    reader.onerror = () => showNotification('Dosya okunamadı.', 'error');
    reader.readAsArrayBuffer(file);
}

function clearExcelCompare() {
    excelCompare = null;
    const fileInput = document.getElementById('procurement-lines-excel-input');
    if (fileInput) fileInput.value = '';
    document.getElementById('procurement-lines-compare-clear')?.classList.add('d-none');
    document.getElementById('procurement-lines-apply-all')?.classList.add('d-none');
    const infoEl = document.getElementById('procurement-lines-compare-info');
    if (infoEl) infoEl.innerHTML = '';
    // Modal may not be open yet (called from openLinesModal); renderLinesTable is a no-op then
    renderLinesTable();
}

/** Apply the Excel values to one line (frontend only; persisted via the normal save flow). */
function applyExcelPrice(index) {
    syncLinesFromDom();
    const line = editingLines[index];
    if (!line) return;
    const match = getExcelMatchForLine(line);
    if (!match) return;
    if (!applyExcelToLine(line, match)) {
        showNotification('Excel değerleri uygulanamadı (miktar 0).', 'warning');
        return;
    }
    renderLinesTable();
}

/** Apply the Excel values to every mismatched line. */
function applyExcelPriceAll() {
    if (!excelCompare) return;
    syncLinesFromDom();
    let applied = 0;
    for (const line of editingLines) {
        const match = getExcelMatchForLine(line);
        if (match && applyExcelToLine(line, match)) applied++;
    }
    renderLinesTable();
    if (applied > 0) {
        showNotification(`${applied} satıra Excel değerleri uygulandı.`, 'success');
    } else {
        showNotification('Uygulanacak fark bulunamadı.', 'info');
    }
}

function formatCompareNumber(value, digits = 2) {
    if (value == null || !Number.isFinite(value)) return '–';
    return value.toFixed(digits);
}

function renderCompareInfo(stats) {
    const infoEl = document.getElementById('procurement-lines-compare-info');
    if (!infoEl) return;
    const applyAllBtn = document.getElementById('procurement-lines-apply-all');
    if (applyAllBtn) applyAllBtn.classList.toggle('d-none', !excelCompare || stats.mismatched === 0);
    if (!excelCompare) {
        infoEl.innerHTML = '';
        return;
    }
    const parts = [
        `<span class="me-3"><i class="fas fa-file-excel text-success me-1"></i>${escapeHtml(excelCompare.fileName)}</span>`,
        `<span class="me-3 text-success">${stats.matched} satır eşleşti</span>`
    ];
    if (stats.mismatched > 0) {
        parts.push(`<span class="me-3 text-danger fw-semibold">${stats.mismatched} satırda tutar farkı</span>`);
    }
    if (stats.unmatchedLines > 0) {
        parts.push(`<span class="me-3 text-warning">${stats.unmatchedLines} satır Excel'de bulunamadı</span>`);
    }
    if (stats.unmatchedExcelRows.length > 0) {
        const codes = stats.unmatchedExcelRows.map(r => escapeHtml(r.rawCode || r.code)).join(', ');
        parts.push(`<div class="text-muted mt-1">Excel'de olup tabloda eşleşmeyen ${stats.unmatchedExcelRows.length} satır: ${codes}</div>`);
    }
    infoEl.innerHTML = parts.join('');
}

function renderLinesTable() {
    const tbody = document.getElementById(linesTableContainerId);
    if (!tbody) return;

    const headRow = document.getElementById('procurement-lines-head-row');
    if (headRow) {
        headRow.innerHTML = `
            <th>Malzeme Kodu</th>
            <th>Malzeme Adı</th>
            <th>Açıklama</th>
            <th style="width:100px;">Miktar</th>
            <th style="width:100px;">Birim Fiyat (EUR)</th>
            <th style="width:100px;">Tutar (EUR)</th>
            ${excelCompare ? `
            <th style="width:90px;" class="table-info">Excel Miktar</th>
            <th style="width:110px;" class="table-info">Excel Birim Fiyat</th>
            <th style="width:110px;" class="table-info">Excel Tutar (EUR)</th>
            ` : ''}
            <th>Fiyat Kaynağı</th>
            <th>Fiyat Tarihi</th>
            <th style="width:90px;"></th>
        `;
    }

    const stats = { matched: 0, mismatched: 0, unmatchedLines: 0, unmatchedExcelRows: [] };
    const matchedExcelRows = new Set();
    let anyChanged = false;

    tbody.innerHTML = editingLines.map((line, index) => {
        const amount = (parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0);
        const amountStr = amount.toFixed(2);
        const changed = isLineChanged(line);
        if (changed) anyChanged = true;

        let rowClass = '';
        let excelCells = '';
        let qtyInvalid = false;
        let unitInvalid = false;
        if (excelCompare) {
            const match = getExcelMatchForLine(line);
            if (match) {
                matchedExcelRows.add(match);
                const diff = getExcelDiff(line, match);
                if (diff.amountMismatch) {
                    rowClass = 'table-danger';
                    stats.mismatched++;
                } else {
                    rowClass = 'table-success';
                }
                stats.matched++;
                // Flag the culprit field(s) in red on both sides
                qtyInvalid = diff.qtyDiffers;
                unitInvalid = diff.unitDiffers || (diff.amountMismatch && match.unitPrice == null);
                excelCells = `
                    <td class="align-middle ${qtyInvalid ? 'text-danger fw-semibold' : ''}">${formatCompareNumber(match.qty)}</td>
                    <td class="align-middle ${unitInvalid ? 'text-danger fw-semibold' : ''}">${formatCompareNumber(match.unitPrice, 4)}</td>
                    <td class="align-middle ${diff.amountMismatch ? 'text-danger fw-semibold' : ''}">
                        ${formatCompareNumber(match.amountEur)}
                        ${diff.amountMismatch ? `<button type="button" class="btn btn-outline-danger btn-sm py-0 px-1 ms-1" data-apply-excel="${index}" title="Farklı olan değerleri Excel'den al">Uygula</button>` : ''}
                    </td>
                `;
            } else {
                stats.unmatchedLines++;
                excelCells = '<td class="align-middle text-muted" colspan="3"><i class="fas fa-question-circle me-1"></i>Excel\'de bulunamadı</td>';
            }
        }

        return `
            <tr data-index="${index}" class="${rowClass}">
                <td class="text-muted">${escapeHtml(line.item_code || '–')}</td>
                <td class="text-muted">${escapeHtml(line.item_name || '–')}</td>
                <td><input type="text" class="form-control form-control-sm" data-field="item_description" data-index="${index}" value="${escapeHtml(line.item_description || '')}" placeholder="Açıklama"></td>
                <td><input type="text" class="form-control form-control-sm d-inline-block ${qtyInvalid ? 'is-invalid' : ''}" data-field="quantity" data-index="${index}" value="${escapeHtml(line.quantity)}" placeholder="0" style="width:5rem"> <span class="text-muted small ms-1">${escapeHtml(line.item_unit || '–')}</span></td>
                <td><input type="text" class="form-control form-control-sm ${unitInvalid ? 'is-invalid' : ''}" data-field="unit_price" data-index="${index}" value="${escapeHtml(line.unit_price)}" placeholder="0"></td>
                <td class="align-middle">${amountStr}</td>
                ${excelCells}
                <td class="text-muted small">${escapeHtml(formatPriceSource(line.price_source))}</td>
                <td class="text-muted small">${escapeHtml(formatPriceDate(line.price_date))}</td>
                <td class="text-nowrap">
                    ${changed ? `<button type="button" class="btn btn-outline-warning btn-sm me-1" data-revert-index="${index}" title="Satırı ilk haline döndür">
                        <i class="fas fa-undo"></i>
                    </button>` : ''}
                    <button type="button" class="btn btn-outline-danger btn-sm" data-remove-index="${index}" title="Satırı sil">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    const revertAllBtn = document.getElementById('procurement-lines-revert-all');
    if (revertAllBtn) revertAllBtn.classList.toggle('d-none', !anyChanged);

    if (excelCompare) {
        stats.unmatchedExcelRows = excelCompare.rows.filter(r => !matchedExcelRows.has(r));
    }
    renderCompareInfo(stats);

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
    tbody.querySelectorAll('[data-apply-excel]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.applyExcel, 10);
            applyExcelPrice(index);
        });
    });
    tbody.querySelectorAll('[data-revert-index]').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.revertIndex, 10);
            revertLine(index);
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

/**
 * Clamp a clean numeric string to the backend's max decimal places
 * (quantity: 2, unit_price: 6). Non-numeric input is passed through
 * untouched so DRF can report it instead of us silently mangling it.
 */
function clampDecimals(value, places) {
    const s = String(value ?? '').trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
    const decimals = (s.split('.')[1] || '').length;
    if (decimals <= places) return s;
    return String(parseFloat(parseFloat(s).toFixed(places)));
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

    const saveBtn = document.getElementById('procurement-lines-save');
    const prevSaveHtml = saveBtn ? saveBtn.innerHTML : null;
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Kaydediliyor...';
    }

    const payload = editingLines.map((line, idx) => {
        const itemDesc = (line.item_description || '').trim();
        const quantity = (line.quantity != null && line.quantity !== '') ? clampDecimals(line.quantity, 2) : '0';
        const unitPrice = (line.unit_price != null && line.unit_price !== '') ? clampDecimals(line.unit_price, 6) : '0';
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

        // After successful submit, re-fetch the persisted lines (NOT preview)
        const refreshed = await getProcurementLines(currentJobOrderForLines);
        editingLines = mapSavedProcurementLines(refreshed);
        snapshotOriginalLines(); // saved values become the new revert baseline
        renderLinesTable();

        // Refresh both lists (job may move from pending -> has entries)
        await loadPendingJobOrders();
        await loadHasEntries();
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Kaydetme başarısız', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            if (prevSaveHtml != null) saveBtn.innerHTML = prevSaveHtml;
        }
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
