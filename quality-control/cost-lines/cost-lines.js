import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { showNotification } from '../../../components/notification/notification.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import {
    getQcPendingJobOrders,
    getQcCostLines,
    createQcCostLine,
    COST_SUMMARY_CURRENCIES
} from '../../../apis/projects/cost.js';
import { extractResultsFromResponse } from '../../../apis/paginationHelper.js';

let pendingJobOrders = [];
let totalCount = 0;
let currentPage = 1;
let currentPageSize = 20;
let currentFilters = { status: '', search: '' };
let pendingTable = null;
let linesModal = null;
let linesModalBootstrap = null;
let currentJobOrderForLines = null;
let linesTableBodyId = 'qc-lines-tbody';

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'KK Maliyet Satırları',
        subtitle: 'Kalite kontrol maliyeti girilmemiş iş emirleri',
        icon: 'project-diagram',
        showBackButton: 'block',
        showCreateButton: 'none',
        backUrl: '/quality-control/'
    });

    initFilters();
    initPendingTable();
    initLinesModal();
    await loadPending();
});

function initFilters() {
    const filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
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
        emptyMessage: 'KK maliyeti bekleyen iş emri yok.',
        emptyIcon: 'fas fa-inbox'
    });
}

function formatStatus(value) {
    const map = { active: 'Aktif', draft: 'Taslak', on_hold: 'Beklemede', completed: 'Tamamlandı', cancelled: 'İptal' };
    const label = map[value] || value;
    const cls = value === 'active' ? 'success' : value === 'completed' ? 'info' : value === 'on_hold' ? 'warning' : 'secondary';
    return `<span class="badge bg-${cls}">${label}</span>`;
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
                            <button type="button" class="btn btn-sm btn-primary" id="lines-add-line-btn"><i class="fas fa-plus me-1"></i>Yeni Satır Ekle</button>
                            <span class="text-muted small" id="lines-summary"></span>
                        </div>
                        <div id="add-line-form-container" style="display:none;" class="mb-3 p-3 border rounded bg-light">
                            <h6 class="mb-3">Yeni satır</h6>
                            <div class="row g-2">
                                <div class="col-12"><label class="form-label">Açıklama <span class="text-danger">*</span></label><input type="text" class="form-control form-control-sm" id="line-description" placeholder="Örn: Üçüncü taraf muayene"></div>
                                <div class="col-md-2"><label class="form-label">Tutar <span class="text-danger">*</span></label><input type="text" class="form-control form-control-sm" id="line-amount" placeholder="0.00"></div>
                                <div class="col-md-2"><label class="form-label">Para birimi <span class="text-danger">*</span></label><select class="form-select form-select-sm" id="line-currency">${COST_SUMMARY_CURRENCIES.map(c => `<option value="${c}">${c}</option>`).join('')}</select></div>
                                <div class="col-md-2"><label class="form-label">Tutar (EUR) <span class="text-danger">*</span></label><input type="text" class="form-control form-control-sm" id="line-amount-eur" placeholder="0.00"></div>
                                <div class="col-md-2"><label class="form-label">Tarih</label><input type="date" class="form-control form-control-sm" id="line-date"></div>
                                <div class="col-md-2"><label class="form-label">Notlar</label><input type="text" class="form-control form-control-sm" id="line-notes" placeholder="Opsiyonel"></div>
                                <div class="col-md-2 d-flex align-items-end gap-1"><button type="button" class="btn btn-sm btn-primary" id="line-submit-btn">Kaydet</button><button type="button" class="btn btn-sm btn-outline-secondary" id="line-cancel-btn">İptal</button></div>
                            </div>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-bordered table-sm">
                                <thead><tr><th>Açıklama</th><th>Tutar</th><th>Birim</th><th>Tutar (EUR)</th><th>Tarih</th><th>Notlar</th></tr></thead>
                                <tbody id="${linesTableBodyId}"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Kapat</button></div>
                </div>
            </div>
        </div>
    `;
    linesModal = document.getElementById('qc-lines-modal');
    linesModalBootstrap = new bootstrap.Modal(linesModal);

    document.getElementById('lines-add-line-btn').addEventListener('click', () => {
        document.getElementById('add-line-form-container').style.display = 'block';
        document.getElementById('line-description').value = '';
        document.getElementById('line-amount').value = '';
        document.getElementById('line-currency').value = 'EUR';
        document.getElementById('line-amount-eur').value = '';
        document.getElementById('line-date').value = '';
        document.getElementById('line-notes').value = '';
    });
    document.getElementById('line-currency').addEventListener('change', () => {
        if (document.getElementById('line-currency').value === 'EUR' && document.getElementById('line-amount').value) {
            document.getElementById('line-amount-eur').value = document.getElementById('line-amount').value;
        }
    });
    document.getElementById('line-amount').addEventListener('input', () => {
        if (document.getElementById('line-currency').value === 'EUR') {
            document.getElementById('line-amount-eur').value = document.getElementById('line-amount').value;
        }
    });
    document.getElementById('line-cancel-btn').addEventListener('click', () => { document.getElementById('add-line-form-container').style.display = 'none'; });
    document.getElementById('line-submit-btn').addEventListener('click', submitNewLine);
    linesModal.addEventListener('shown.bs.modal', () => renderLinesTable());
}

async function openLinesModal(jobNo) {
    currentJobOrderForLines = jobNo;
    const titleEl = document.getElementById('lines-modal-title');
    if (titleEl) titleEl.textContent = `KK Maliyet Satırları — ${jobNo}`;
    document.getElementById('add-line-form-container').style.display = 'none';
    const tbody = document.getElementById(linesTableBodyId);
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Yükleniyor...</td></tr>';
    linesModalBootstrap.show();
    await loadLines();
}

async function loadLines() {
    const tbody = document.getElementById(linesTableBodyId);
    if (!tbody || !currentJobOrderForLines) return;
    try {
        const lines = await getQcCostLines(currentJobOrderForLines);
        window._currentLines = Array.isArray(lines) ? lines : [];
        renderLinesTable();
    } catch (err) {
        console.error(err);
        showNotification(err.message || 'Satırlar yüklenemedi', 'error');
        window._currentLines = [];
        renderLinesTable();
    }
}

function renderLinesTable() {
    const tbody = document.getElementById(linesTableBodyId);
    const lines = window._currentLines || [];
    if (!tbody) return;
    if (lines.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Henüz satır yok. Yeni satır ekleyin.</td></tr>';
    } else {
        tbody.innerHTML = lines.map(line => `
            <tr>
                <td>${escapeHtml(line.description || '–')}</td>
                <td>${escapeHtml(line.amount != null ? line.amount : '–')}</td>
                <td>${escapeHtml(line.currency || '–')}</td>
                <td>${escapeHtml(line.amount_eur != null ? line.amount_eur : '–')}</td>
                <td>${line.date ? formatDate(line.date) : '–'}</td>
                <td>${escapeHtml(line.notes || '–')}</td>
            </tr>
        `).join('');
    }
    const summaryEl = document.getElementById('lines-summary');
    if (summaryEl) summaryEl.textContent = `${lines.length} satır`;
}

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

async function submitNewLine() {
    if (!currentJobOrderForLines) return;
    const description = (document.getElementById('line-description').value || '').trim();
    const amount = (document.getElementById('line-amount').value || '').trim();
    const currency = document.getElementById('line-currency').value;
    let amountEur = (document.getElementById('line-amount-eur').value || '').trim();
    const date = (document.getElementById('line-date').value || '').trim();
    const notes = (document.getElementById('line-notes').value || '').trim();

    if (!description) { showNotification('Açıklama zorunludur.', 'error'); return; }
    if (!amount) { showNotification('Tutar zorunludur.', 'error'); return; }
    if (currency === 'EUR' && !amountEur) amountEur = amount;

    if (!amountEur) { showNotification('Tutar (EUR) zorunludur.', 'error'); return; }
    if (isNaN(parseFloat(amount)) || isNaN(parseFloat(amountEur))) { showNotification('Geçerli sayı girin.', 'error'); return; }

    try {
        await createQcCostLine({
            job_order: currentJobOrderForLines,
            description,
            amount,
            currency,
            amount_eur: amountEur,
            date: date || undefined,
            notes: notes || undefined
        });
        showNotification('Satır eklendi.', 'success');
        document.getElementById('add-line-form-container').style.display = 'none';
        await loadLines();
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
