import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { 
    getPaymentTerms, 
    createPaymentTerm,
    deletePaymentTerm,
    togglePaymentTermStatus,
    getBasisChoices
} from '../../../apis/procurement.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { showNotification } from '../../../components/notification/notification.js';

// State management
let currentPage = 1;
let currentFilter = 'all';
let currentOrdering = 'id';
let currentSortField = 'id';
let currentSortDirection = 'desc';
let paymentTerms = [];
let currentPaymentTerm = null;
let totalPaymentTerms = 0;
let isLoading = false;
let paymentTermsStats = null; // Statistics Cards component instance
let paymentTermFilters = null; // Filters component instance
let basisChoices = {}; // Store basis choices from API
// No edit mode needed - only create and delete functionality

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Ödeme Koşulları',
        subtitle: 'Ödeme koşulları yönetimi ve takibi',
        icon: 'credit-card',
        showBackButton: 'block',
        showCreateButton: 'none',
        showBulkCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'none',
        onBackClick: () => window.location.href = '/procurement/'
    });
    
    // Initialize Statistics Cards component
    try {
        paymentTermsStats = new StatisticsCards('payment-terms-statistics', {
            cards: [
                { title: 'Tüm Ödeme Koşulları', value: '0', icon: 'fas fa-credit-card', color: 'primary', id: 'all-payment-terms-count' },
                { title: 'Aktif', value: '0', icon: 'fas fa-check-circle', color: 'success', id: 'active-payment-terms-count' },
                { title: 'Pasif', value: '0', icon: 'fas fa-times-circle', color: 'danger', id: 'inactive-payment-terms-count' },
                { title: 'Özel', value: '0', icon: 'fas fa-cog', color: 'warning', id: 'custom-payment-terms-count' },
            ],
            compact: true,
            animation: true,
            columns: 4
        });
        console.log('StatisticsCards initialized successfully');
    } catch (error) {
        console.error('Error initializing StatisticsCards:', error);
    }
    
    await initializePaymentTerms();
    setupEventListeners();
});

async function initializePaymentTerms() {
    try {
        await initializeFiltersComponent();
        initializeSortableHeaders();
        
        // Load basis choices first
        basisChoices = await getBasisChoices();
        
        await loadPaymentTerms();
        updatePaymentTermCounts();
    } catch (error) {
        console.error('Error initializing payment terms:', error);
        showNotification('Ödeme koşulları yüklenirken hata oluştu', 'error');
    }
}

async function initializeFiltersComponent() {
    // Initialize filters component
    paymentTermFilters = new FiltersComponent('filters-placeholder', {
        title: 'Ödeme Koşulları Filtreleri',
        showApplyButton: true,
        showClearButton: true,
        applyButtonText: 'Filtrele',
        clearButtonText: 'Temizle',
        onApply: () => {
            currentFilter = 'filtered';
            currentPage = 1;
            loadPaymentTerms();
        },
        onClear: () => {
            currentFilter = 'all';
            currentPage = 1;
            loadPaymentTerms();
        }
    });

    // Add Name filter
    paymentTermFilters.addTextFilter({
        id: 'name-filter',
        label: 'Ödeme Koşulu Adı',
        placeholder: 'Ödeme koşulu adı girin...',
        colSize: 4
    });

    // Add Code filter
    paymentTermFilters.addTextFilter({
        id: 'code-filter',
        label: 'Kod',
        placeholder: 'Kod girin...',
        colSize: 4
    });

    // Add Type filter
    paymentTermFilters.addDropdownFilter({
        id: 'type-filter',
        label: 'Tür',
        placeholder: 'Tür seçin...',
        options: [
            { value: '', label: 'Tüm Türler' },
            { value: 'false', label: 'Standart' },
            { value: 'true', label: 'Özel' }
        ],
        value: '',
        colSize: 4
    });

    // Add Status filter
    paymentTermFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        placeholder: 'Durum seçin...',
        options: [
            { value: '', label: 'Tüm Durumlar' },
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        value: '',
        colSize: 4
    });

    // Add Created At filter
    paymentTermFilters.addDateFilter({
        id: 'created-at-filter',
        label: 'Oluşturulma Tarihi',
        colSize: 4
    });
}

function initializeSortableHeaders() {
    const sortableHeaders = document.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault();
            const field = header.dataset.field;
            handleSort(field);
        });
    });
    
    // Update sort indicators for initial state
    updateSortIndicators();
}

function updateSortIndicators() {
    const sortableHeaders = document.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        const field = header.dataset.field;
        const icon = header.querySelector('.sort-icon');
        
        if (field === currentSortField) {
            // Show active sort indicator
            if (currentSortDirection === 'asc') {
                icon.className = 'fas fa-sort-up sort-icon text-primary';
            } else {
                icon.className = 'fas fa-sort-down sort-icon text-primary';
            }
        } else {
            // Show inactive sort indicator
            icon.className = 'fas fa-sort sort-icon text-muted';
        }
    });
}

async function loadPaymentTerms() {
    if (isLoading) return;
    
    try {
        isLoading = true;
        showLoading(true);
        showLoadingState();
        
        // Build API filters and ordering
        const apiFilters = {};
        
        // Get current filter values to apply server-side filtering
        if (paymentTermFilters) {
            const filterValues = paymentTermFilters.getFilterValues();
            
            // Add name filter to API call
            if (filterValues['name-filter']) {
                apiFilters.name = filterValues['name-filter'];
            }
            
            // Add code filter to API call
            if (filterValues['code-filter']) {
                apiFilters.code = filterValues['code-filter'];
            }
            
            // Add type filter to API call
            if (filterValues['type-filter']) {
                apiFilters.is_custom = filterValues['type-filter'];
            }
            
            // Add status filter to API call
            if (filterValues['status-filter']) {
                apiFilters.active = filterValues['status-filter'];
            }
            
            // Add created_at filter to API call
            if (filterValues['created-at-filter']) {
                apiFilters.created_at__gte = filterValues['created-at-filter'];
            }
        }
        
        // Add ordering parameters
        if (currentSortField) {
            const orderingPrefix = currentSortDirection === 'desc' ? '-' : '';
            apiFilters.ordering = orderingPrefix + currentSortField;
        }
        
        // Add pagination parameters
        const itemsPerPage = 20;
        apiFilters.page = currentPage;
        apiFilters.page_size = itemsPerPage;
        
        const response = await getPaymentTerms(apiFilters);
        
        console.log('API Response:', response);
        
        // Handle paginated response
        if (response && response.results) {
            paymentTerms = response.results;
            totalPaymentTerms = response.count || response.results.length;
        } else if (Array.isArray(response)) {
            paymentTerms = response;
            totalPaymentTerms = response.length;
        } else {
            paymentTerms = [];
            totalPaymentTerms = 0;
        }
        
        console.log('Processed payment terms:', paymentTerms);
        
        // Update the table
        renderPaymentTermsTable(paymentTerms);
        renderPagination();
        updatePaymentTermCounts();
        
    } catch (error) {
        console.error('Error loading payment terms:', error);
        showNotification('Ödeme koşulları yüklenirken hata oluştu: ' + error.message, 'error');
        paymentTerms = [];
        totalPaymentTerms = 0;
        renderPaymentTermsTable([]);
        renderPagination();
        updatePaymentTermCounts();
    } finally {
        isLoading = false;
        showLoading(false);
    }
}

function renderPaymentTermsTable(paymentTerms) {
    const tbody = document.getElementById('payment-terms-table-body');
    
    if (!paymentTerms || paymentTerms.length === 0) {
                 tbody.innerHTML = `
             <tr>
                 <td colspan="7" class="text-center">
                    <div class="empty-state">
                        <i class="fas fa-credit-card"></i>
                        <h5>Henüz ödeme koşulu bulunmuyor</h5>
                        <p>Ödeme koşulu bulunmamaktadır.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
         tbody.innerHTML = paymentTerms.map(paymentTerm => `
         <tr data-payment-term-id="${paymentTerm.id}">
             <td>
                 <span class="payment-term-id">${paymentTerm.id}</span>
             </td>
             <td>
                 <div class="payment-term-name">${paymentTerm.name || 'İsimsiz'}</div>
             </td>
             <td class="text-center">
                 ${getTypeBadge(paymentTerm.is_custom)}
             </td>
             <td>
                 <div class="payment-details">
                     ${renderPaymentDetails(paymentTerm.default_lines)}
                 </div>
             </td>
             <td class="text-center">
                 ${getStatusBadge(paymentTerm.active)}
             </td>
             <td>
                 <div class="created-date">${formatDate(paymentTerm.created_at)}</div>
             </td>
             <td class="text-center">
                 <div class="action-buttons">
                     ${paymentTerm.is_custom ? 
                         `<button class="btn btn-sm btn-outline-danger" onclick="deletePaymentTermConfirm(${paymentTerm.id})">
                             <i class="fas fa-trash"></i>
                         </button>` : 
                         `<span class="text-muted small"></span>`
                     }
                 </div>
             </td>
         </tr>
     `).join('');
}

function renderPaymentDetails(defaultLines) {
    if (!defaultLines || defaultLines.length === 0) {
        return '<span class="text-muted">Özel</span>';
    }
    
    return defaultLines.map(line => `
        <div class="payment-line">
            <span class="payment-label">${line.label}</span>
            <span class="payment-percentage">${line.percentage}%</span>
            <span class="payment-basis">(${getBasisText(line.basis)})</span>
        </div>
    `).join('');
}

function getBasisText(basis) {
    const choice = basisChoices.find(choice => choice.value === basis);
    return choice ? choice.label : basis;
}

function renderPagination() {
    const pagination = document.getElementById('payment-terms-pagination');
    const itemsPerPage = 20;
    const totalPages = Math.ceil(totalPaymentTerms / itemsPerPage);
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // Previous button
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage - 1}">
                <i class="fas fa-chevron-left"></i>
            </a>
        </li>
    `;
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `;
    }
    
    // Next button
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage + 1}">
                <i class="fas fa-chevron-right"></i>
            </a>
        </li>
    `;
    
    pagination.innerHTML = html;
    
    // Add event listeners
    const paginationLinks = pagination.querySelectorAll('.page-link[data-page]');
    paginationLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = parseInt(link.dataset.page);
            if (page >= 1 && page <= totalPages) {
                currentPage = page;
                loadPaymentTerms();
            }
        });
    });
}

function updatePaymentTermCounts() {
    if (!paymentTermsStats) return;
    
    const activeCount = paymentTerms.filter(pt => pt.active).length;
    const inactiveCount = paymentTerms.filter(pt => !pt.active).length;
    const customCount = paymentTerms.filter(pt => pt.is_custom).length;
    
    const counts = {
        0: paymentTerms.length.toString(),
        1: activeCount.toString(),
        2: inactiveCount.toString(),
        3: customCount.toString()
    };
    
    paymentTermsStats.updateValues(counts);
}

function handleSort(field) {
    if (currentSortField === field) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortDirection = 'asc';
    }
    
    currentOrdering = field;
    currentPage = 1; // Reset to first page when sorting changes
    loadPaymentTerms();
    
    // Update sort indicators
    updateSortIndicators();
}

function setupEventListeners() {
    // Add payment term button
    const addBtn = document.getElementById('add-payment-term-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            showPaymentTermFormModal();
        });
    }
    
    // Export payment terms
    const exportBtn = document.getElementById('export-payment-terms');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportPaymentTerms);
    }
    
    // Refresh payment terms
    const refreshBtn = document.getElementById('refresh-payment-terms');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadPaymentTerms);
    }
    
    // Save payment term button
    const saveBtn = document.getElementById('save-payment-term-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', savePaymentTerm);
    }
    
    
    
    // Add payment line button
    const addLineBtn = document.getElementById('add-payment-line-btn');
    if (addLineBtn) {
        addLineBtn.addEventListener('click', addPaymentLine);
    }
}



function showPaymentTermFormModal() {
    const modal = document.getElementById('paymentTermFormModal');
    const title = document.getElementById('paymentTermFormModalLabel');
    const form = document.getElementById('payment-term-form');
    
    // Only create new payment terms - no editing
    title.innerHTML = '<i class="fas fa-plus me-2"></i>Yeni Ödeme Koşulu';
    form.reset();
    currentPaymentTerm = null;
    clearPaymentLines();
    
    // Set default values for type and status
    document.getElementById('payment-term-custom').value = 'true'; // Always custom
    document.getElementById('payment-term-active').value = 'true'; // Always active
    document.getElementById('payment-term-custom').disabled = true; // Disable type selection
    document.getElementById('payment-term-active').disabled = true; // Disable status selection
    
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
}

// Removed populatePaymentTermForm function - no editing functionality

function clearPaymentLines() {
    const container = document.getElementById('payment-lines-container');
    container.innerHTML = '';
}

function addPaymentLine() {
    const container = document.getElementById('payment-lines-container');
    const lineId = Date.now() + Math.random();
    
    // Generate basis options from API data (array of objects with value and label)
    const basisOptions = basisChoices.map(choice => 
        `<option value="${choice.value}">${choice.label}</option>`
    ).join('');
    
    const lineHtml = `
        <div class="payment-line-item border rounded p-3 mb-2" data-line-id="${lineId}">
            <div class="row">
                <div class="col-md-3">
                    <label class="form-label">Etiket</label>
                    <input type="text" class="form-control form-control-sm" name="label" value="" required>
                </div>
                <div class="col-md-2">
                    <label class="form-label">Yüzde (%)</label>
                    <input type="number" class="form-control form-control-sm" name="percentage" min="0" max="100" step="0.01" value="" required>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Temel</label>
                    <select class="form-select form-select-sm" name="basis" required>
                        ${basisOptions}
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label">Gecikme (Gün)</label>
                    <input type="number" class="form-control form-control-sm" name="offset_days" min="0" value="0">
                </div>
                <div class="col-md-2 d-flex align-items-end">
                    <button type="button" class="btn btn-outline-danger btn-sm" onclick="removePaymentLine('${lineId}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', lineHtml);
}

function removePaymentLine(lineId) {
    const lineElement = document.querySelector(`[data-line-id="${lineId}"]`);
    if (lineElement) {
        lineElement.remove();
    }
}

async function savePaymentTerm() {
    const form = document.getElementById('payment-term-form');
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Collect payment lines
    const paymentLines = [];
    const lineElements = document.querySelectorAll('.payment-line-item');
    lineElements.forEach(element => {
        const label = element.querySelector('[name="label"]').value.trim();
        const percentage = parseFloat(element.querySelector('[name="percentage"]').value);
        const basis = element.querySelector('[name="basis"]').value;
        const offsetDays = parseInt(element.querySelector('[name="offset_days"]').value) || 0;
        
        if (label && !isNaN(percentage)) {
            paymentLines.push({
                label,
                percentage,
                basis,
                offset_days: offsetDays
            });
        }
    });
    
    // Validate that payment lines exist
    if (paymentLines.length === 0) {
        showNotification('En az bir ödeme satırı eklemelisiniz', 'error');
        return;
    }
    
    // Validate that the sum of percentages equals exactly 100
    const totalPercentage = paymentLines.reduce((sum, line) => sum + line.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) { // Using 0.01 tolerance for floating point precision
        showNotification(`Ödeme satırlarının yüzde toplamı tam olarak 100 olmalıdır. Mevcut toplam: ${totalPercentage.toFixed(2)}%`, 'error');
        return;
    }
    
    const paymentTermData = {
        name: document.getElementById('payment-term-name').value.trim(),
        code: document.getElementById('payment-term-code').value.trim(),
        is_custom: true, // Always custom for new payment terms
        active: true, // Always active for new payment terms
        default_lines: paymentLines
    };
    
    try {
        showLoading(true);
        
        // Only create new payment terms - no editing
        await createPaymentTerm(paymentTermData);
        showNotification('Ödeme koşulu başarıyla oluşturuldu', 'success');
        
        // Close modal and refresh list
        const modal = bootstrap.Modal.getInstance(document.getElementById('paymentTermFormModal'));
        modal.hide();
        
        await loadPaymentTerms();
        updatePaymentTermCounts();
        
    } catch (error) {
        console.error('Error saving payment term:', error);
        showNotification('Ödeme koşulu kaydedilirken hata oluştu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}



async function handleDeletePaymentTerm() {
    if (!currentPaymentTerm) {
        showNotification('Ödeme koşulu bilgisi bulunamadı', 'error');
        return;
    }

    // Check if payment term is custom (deletable)
    if (!currentPaymentTerm.is_custom) {
        showNotification('Standart ödeme koşulları silinemez', 'error');
        return;
    }

    const confirmed = confirm(`"${currentPaymentTerm.name}" ödeme koşulunu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`);
    
    if (!confirmed) {
        return;
    }

    try {
        showLoading(true);
        
        await deletePaymentTerm(currentPaymentTerm.id);
        
        showNotification('Ödeme koşulu başarıyla silindi', 'success');
        
        // Refresh the payment terms list
        await loadPaymentTerms();
        updatePaymentTermCounts();
        
    } catch (error) {
        console.error('Error deleting payment term:', error);
        showNotification('Ödeme koşulu silinirken hata oluştu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Action functions
function exportPaymentTerms() {
    showNotification('Dışa aktarma özelliği yakında eklenecek', 'info');
}

// Utility functions
function getStatusBadge(isActive) {
    if (isActive) {
        return '<span class="status-badge status-active">Aktif</span>';
    } else {
        return '<span class="status-badge status-inactive">Pasif</span>';
    }
}

function getTypeBadge(isCustom) {
    if (isCustom) {
        return '<span class="type-badge type-custom">Özel</span>';
    } else {
        return '<span class="type-badge type-standard">Standart</span>';
    }
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showLoading(show) {
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        btn.disabled = show;
    });
}

function showLoadingState() {
    const tableBody = document.getElementById('payment-terms-table-body');
    if (tableBody) {
        const loadingRows = [];
        for (let i = 0; i < 5; i++) {
            loadingRows.push(`
                                 <tr class="loading-row">
                     <td><div class="loading-skeleton" style="width: 50px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 150px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 80px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 150px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 60px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 120px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                 </tr>
            `);
        }
        tableBody.innerHTML = loadingRows.join('');
    }
}


// Make functions globally available for onclick handlers
window.deletePaymentTermConfirm = (paymentTermId) => {
    currentPaymentTerm = paymentTerms.find(pt => pt.id === paymentTermId);
    if (currentPaymentTerm) {
        handleDeletePaymentTerm();
    }
};
window.removePaymentLine = removePaymentLine;
