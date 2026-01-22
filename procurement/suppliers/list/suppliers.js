import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { 
    getSuppliers, 
    getSupplier, 
    createSupplier,
    updateSupplier,
    deleteSupplier,
    toggleSupplierStatus,
    getPaymentTerms
} from '../../../apis/procurement.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { showNotification } from '../../../components/notification/notification.js';

// State management
let currentPage = 1;
let currentFilter = 'all';
let currentOrdering = 'id';
let currentSortField = 'id';
let currentSortDirection = 'desc';
let suppliers = [];
let currentSupplier = null;
let totalSuppliers = 0;
let isLoading = false;
let suppliersStats = null; // Statistics Cards component instance
let supplierFilters = null; // Filters component instance
let isEditMode = false; // Track if we're editing an existing supplier
let paymentTerms = []; // Payment terms for dropdown

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Tedarikçiler',
        subtitle: 'Tedarikçi yönetimi ve takibi',
        icon: 'building',
        showBackButton: 'block',
        showCreateButton: 'none',
        showBulkCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'none',
        onBackClick: () => window.location.href = '/procurement/'
    });
    
    // Initialize Statistics Cards component
    try {
        suppliersStats = new StatisticsCards('suppliers-statistics', {
            cards: [
                { title: 'Tüm Tedarikçiler', value: '0', icon: 'fas fa-building', color: 'primary', id: 'all-suppliers-count' },
                { title: 'Aktif', value: '0', icon: 'fas fa-check-circle', color: 'success', id: 'active-suppliers-count' },
                { title: 'Pasif', value: '0', icon: 'fas fa-times-circle', color: 'danger', id: 'inactive-suppliers-count' },
                { title: 'Toplam', value: '0', icon: 'fas fa-chart-bar', color: 'info', id: 'total-suppliers-count' },
            ],
            compact: true,
            animation: true,
            columns: 4
        });
        console.log('StatisticsCards initialized successfully');
    } catch (error) {
        console.error('Error initializing StatisticsCards:', error);
    }
    
    await initializeSuppliers();
    setupEventListeners();
});

async function initializeSuppliers() {
    try {
        await initializeFiltersComponent();
        initializeSortableHeaders();
        
        // Load payment terms first, then suppliers
        await loadPaymentTerms();
        await loadSuppliers();
        updateSupplierCounts();
    } catch (error) {
        console.error('Error initializing suppliers:', error);
        showNotification('Tedarikçiler yüklenirken hata oluştu', 'error');
    }
}

async function initializeFiltersComponent() {
    // Initialize filters component
    supplierFilters = new FiltersComponent('filters-placeholder', {
        title: 'Tedarikçi Filtreleri',
        showApplyButton: true,
        showClearButton: true,
        applyButtonText: 'Filtrele',
        clearButtonText: 'Temizle',
        onApply: () => {
            currentFilter = 'filtered';
            currentPage = 1;
            loadSuppliers();
        },
        onClear: () => {
            currentFilter = 'all';
            currentPage = 1;
            loadSuppliers();
        }
    });

    // Add Name filter
    supplierFilters.addTextFilter({
        id: 'name-filter',
        label: 'Tedarikçi Adı',
        placeholder: 'Tedarikçi adı girin...',
        colSize: 4
    });

    // Add Contact Person filter
    supplierFilters.addTextFilter({
        id: 'contact-filter',
        label: 'İletişim Kişisi',
        placeholder: 'İletişim kişisi girin...',
        colSize: 4
    });

    // Add Status filter
    supplierFilters.addDropdownFilter({
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

    // Add Currency filter
    supplierFilters.addDropdownFilter({
        id: 'currency-filter',
        label: 'Para Birimi',
        placeholder: 'Para birimi seçin...',
        options: [
            { value: '', label: 'Tüm Para Birimleri' },
            { value: 'TRY', label: 'TRY - Türk Lirası' },
            { value: 'USD', label: 'USD - Amerikan Doları' },
            { value: 'EUR', label: 'EUR - Euro' },
            { value: 'GBP', label: 'GBP - İngiliz Sterlini' }
        ],
        colSize: 4
    });

    // Add Created At filter
    supplierFilters.addDateFilter({
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
    try {
        const response = await getPaymentTerms({ page_size: 100 }); // Load all payment terms
        
        if (response && response.results) {
            paymentTerms = response.results;
        } else if (Array.isArray(response)) {
            paymentTerms = response;
        } else {
            paymentTerms = [];
        }
        
        console.log('Loaded payment terms:', paymentTerms);
    } catch (error) {
        console.error('Error loading payment terms:', error);
        paymentTerms = [];
    }
}

async function loadSuppliers() {
    if (isLoading) return;
    
    try {
        isLoading = true;
        showLoading(true);
        showLoadingState();
        
        // Build API filters and ordering
        const apiFilters = {};
        
        // Get current filter values to apply server-side filtering
        if (supplierFilters) {
            const filterValues = supplierFilters.getFilterValues();
            
            // Add name filter to API call
            if (filterValues['name-filter']) {
                apiFilters.name = filterValues['name-filter'];
            }
            
            // Add contact person filter to API call
            if (filterValues['contact-filter']) {
                apiFilters.contact_person = filterValues['contact-filter'];
            }
            
            // Add status filter to API call
            if (filterValues['status-filter']) {
                apiFilters.is_active = filterValues['status-filter'];
            }
            
            // Add currency filter to API call
            if (filterValues['currency-filter']) {
                apiFilters.default_currency = filterValues['currency-filter'];
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
        
        const response = await getSuppliers(apiFilters);
        
        console.log('API Response:', response);
        
        // Handle paginated response
        if (response && response.results) {
            suppliers = response.results;
            totalSuppliers = response.count || response.results.length;
        } else if (Array.isArray(response)) {
            suppliers = response;
            totalSuppliers = response.length;
        } else {
            suppliers = [];
            totalSuppliers = 0;
        }
        
        console.log('Processed suppliers:', suppliers);
        
        // Update the table
        renderSuppliersTable(suppliers);
        renderPagination();
        updateSupplierCounts();
        
    } catch (error) {
        console.error('Error loading suppliers:', error);
        showNotification('Tedarikçiler yüklenirken hata oluştu: ' + error.message, 'error');
        suppliers = [];
        totalSuppliers = 0;
        renderSuppliersTable([]);
        renderPagination();
        updateSupplierCounts();
    } finally {
        isLoading = false;
        showLoading(false);
    }
}

function renderSuppliersTable(suppliers) {
    const tbody = document.getElementById('suppliers-table-body');
    
    if (!suppliers || suppliers.length === 0) {
                 tbody.innerHTML = `
             <tr>
                 <td colspan="11" class="text-center">
                    <div class="empty-state">
                        <i class="fas fa-building"></i>
                        <h5>Henüz tedarikçi bulunmuyor</h5>
                        <p>Tedarikçi bulunmamaktadır.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = suppliers.map(supplier => `
                        <tr data-supplier-id="${supplier.id}">
            <td>
                <span class="supplier-id">${supplier.id}</span>
            </td>
            <td>
                <div class="supplier-name">${supplier.name || 'İsimsiz'}</div>
            </td>
            <td>
                <div class="contact-person">
                    <i class="fas fa-user-circle me-2 text-muted"></i>
                    ${supplier.contact_person || '-'}
                </div>
            </td>
            <td>
                <div class="phone-number">
                    <i class="fas fa-phone me-2 text-muted"></i>
                    ${supplier.phone || '-'}
                </div>
            </td>
            <td>
                <div class="email-address">
                    <i class="fas fa-envelope me-2 text-muted"></i>
                    ${supplier.email || '-'}
                </div>
            </td>
            <td class="text-center">
                <span class="currency-badge">${supplier.default_currency || 'TRY'}</span>
            </td>
            <td class="text-center">
                <span class="tax-rate-badge">${supplier.default_tax_rate || '18.00'}%</span>
            </td>
            <td class="text-center">
                ${getStatusBadge(supplier.is_active)}
            </td>
            <td>
                <div class="payment-terms">${getPaymentTermName(supplier.default_payment_terms)}</div>
            </td>
            <td class="text-center">
                ${getDbsStatusBadge(supplier.has_dbs)}
            </td>
            <td class="text-center">
                <div class="dbs-limit">${formatDbsLimit(supplier.dbs_limit, supplier.default_currency)}</div>
            </td>
             <td class="text-center">
                <div class="action-buttons">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="event.stopPropagation(); editSupplier(${supplier.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); deleteSupplierConfirm(${supplier.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderPagination() {
    const pagination = document.getElementById('suppliers-pagination');
    const itemsPerPage = 20;
    const totalPages = Math.ceil(totalSuppliers / itemsPerPage);
    
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
                loadSuppliers();
            }
        });
    });
}

function updateSupplierCounts() {
    if (!suppliersStats) return;
    
    const activeCount = suppliers.filter(s => s.is_active).length;
    const inactiveCount = suppliers.filter(s => !s.is_active).length;
    
    const counts = {
        0: suppliers.length.toString(),
        1: activeCount.toString(),
        2: inactiveCount.toString(),
        3: totalSuppliers.toString()
    };
    
    suppliersStats.updateValues(counts);
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
    loadSuppliers();
    
    // Update sort indicators
    updateSortIndicators();
}

function setupEventListeners() {
    // Add supplier button
    const addBtn = document.getElementById('add-supplier-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            isEditMode = false;
            showSupplierFormModal();
        });
    }
    
    // Export suppliers
    const exportBtn = document.getElementById('export-suppliers');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportSuppliers);
    }
    
    // Refresh suppliers
    const refreshBtn = document.getElementById('refresh-suppliers');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadSuppliers);
    }
    
    // Save supplier button
    const saveBtn = document.getElementById('save-supplier-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveSupplier);
    }
    
    // DBS checkbox change handler
    const hasDbsCheckbox = document.getElementById('supplier-has-dbs');
    const dbsLimitInput = document.getElementById('supplier-dbs-limit');
    if (hasDbsCheckbox && dbsLimitInput) {
        hasDbsCheckbox.addEventListener('change', (e) => {
            dbsLimitInput.disabled = !e.target.checked;
            if (!e.target.checked) {
                dbsLimitInput.value = '';
            }
        });
    }
}



function showSupplierFormModal() {
    const modal = document.getElementById('supplierFormModal');
    const title = document.getElementById('supplierFormModalLabel');
    const form = document.getElementById('supplier-form');
    
    // Always populate payment terms dropdown
    populatePaymentTermsDropdown();
    
    if (isEditMode && currentSupplier) {
        // Edit existing supplier
        title.innerHTML = '<i class="fas fa-edit me-2"></i>Tedarikçi Düzenle';
        populateSupplierForm();
    } else {
        // Add new supplier
        title.innerHTML = '<i class="fas fa-plus me-2"></i>Yeni Tedarikçi';
        form.reset();
        currentSupplier = null;
        
        // Ensure DBS limit field starts disabled
        const dbsLimitInput = document.getElementById('supplier-dbs-limit');
        if (dbsLimitInput) {
            dbsLimitInput.disabled = true;
        }
    }
    
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
}

function populateSupplierForm() {
    if (!currentSupplier) return;
    
    document.getElementById('supplier-name').value = currentSupplier.name || '';
    document.getElementById('supplier-contact').value = currentSupplier.contact_person || '';
    document.getElementById('supplier-phone').value = currentSupplier.phone || '';
    document.getElementById('supplier-email').value = currentSupplier.email || '';
    document.getElementById('supplier-currency').value = currentSupplier.default_currency || 'TRY';
    document.getElementById('supplier-tax-rate').value = currentSupplier.default_tax_rate || '18.00';
    
    // Populate DBS fields
    const hasDbsCheckbox = document.getElementById('supplier-has-dbs');
    const dbsLimitInput = document.getElementById('supplier-dbs-limit');
    hasDbsCheckbox.checked = currentSupplier.has_dbs || false;
    dbsLimitInput.value = currentSupplier.dbs_limit || '';
    dbsLimitInput.disabled = !hasDbsCheckbox.checked;
    
    // Populate payment terms dropdown
    populatePaymentTermsDropdown();
    
    // Set selected payment term
    const paymentTermsSelect = document.getElementById('supplier-payment-terms');
    if (currentSupplier.default_payment_terms) {
        // Try to find the payment term by name or ID
        const selectedTerm = paymentTerms.find(pt => 
            pt.id === currentSupplier.default_payment_terms || 
            pt.name === currentSupplier.default_payment_terms
        );
        if (selectedTerm) {
            paymentTermsSelect.value = selectedTerm.id;
        } else {
            paymentTermsSelect.value = '';
        }
    } else {
        paymentTermsSelect.value = '';
    }
}

function populatePaymentTermsDropdown() {
    const paymentTermsSelect = document.getElementById('supplier-payment-terms');
    if (!paymentTermsSelect) return;
    
    // Clear existing options except the first placeholder
    paymentTermsSelect.innerHTML = '<option value="">Ödeme koşulu seçin...</option>';
    
    // Add payment terms options
    paymentTerms.forEach(paymentTerm => {
        const option = document.createElement('option');
        option.value = paymentTerm.id;
        option.textContent = paymentTerm.name;
        paymentTermsSelect.appendChild(option);
    });
}

function getPaymentTermName(paymentTermId) {
    if (!paymentTermId) return '-';
    const paymentTerm = paymentTerms.find(pt => pt.id === paymentTermId);
    return paymentTerm ? paymentTerm.name : '-';
}

async function saveSupplier() {
    const form = document.getElementById('supplier-form');
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Validate tax rate
    const taxRateInput = document.getElementById('supplier-tax-rate');
    const taxRate = parseFloat(taxRateInput.value);
    
    if (!taxRateInput.value || isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
        showNotification('Geçerli bir vergi oranı giriniz (0-100 arası)', 'error');
        taxRateInput.focus();
        return;
    }
    
    // Get DBS limit value and validate if has_dbs is checked
    const hasDbs = document.getElementById('supplier-has-dbs').checked;
    const dbsLimitInput = document.getElementById('supplier-dbs-limit');
    const dbsLimit = dbsLimitInput.value.trim();
    
    // Validate DBS limit if has_dbs is checked
    if (hasDbs && dbsLimit && (isNaN(parseFloat(dbsLimit)) || parseFloat(dbsLimit) < 0)) {
        showNotification('Geçerli bir DBS limiti giriniz (0 veya daha büyük bir sayı)', 'error');
        dbsLimitInput.focus();
        return;
    }
    
    const supplierData = {
        name: document.getElementById('supplier-name').value.trim(),
        contact_person: document.getElementById('supplier-contact').value.trim(),
        phone: document.getElementById('supplier-phone').value.trim(),
        email: document.getElementById('supplier-email').value.trim(),
        default_currency: document.getElementById('supplier-currency').value,
        default_payment_terms: document.getElementById('supplier-payment-terms').value || null,
        default_tax_rate: taxRate,
        has_dbs: hasDbs,
        dbs_limit: hasDbs && dbsLimit ? parseFloat(dbsLimit) : null
    };
    
    try {
        showLoading(true);
        
        if (isEditMode && currentSupplier) {
            // Update existing supplier
            await updateSupplier(currentSupplier.id, supplierData);
            showNotification('Tedarikçi başarıyla güncellendi', 'success');
        } else {
            // Create new supplier
            await createSupplier(supplierData);
            showNotification('Tedarikçi başarıyla oluşturuldu', 'success');
        }
        
        // Close modal and refresh list
        const modal = bootstrap.Modal.getInstance(document.getElementById('supplierFormModal'));
        modal.hide();
        
        await loadSuppliers();
        updateSupplierCounts();
        
    } catch (error) {
        console.error('Error saving supplier:', error);
        showNotification('Tedarikçi kaydedilirken hata oluştu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function handleToggleStatus() {
    if (!currentSupplier) {
        showNotification('Tedarikçi bilgisi bulunamadı', 'error');
        return;
    }

    const action = currentSupplier.is_active ? 'pasif' : 'aktif';
    const confirmed = confirm(`"${currentSupplier.name}" tedarikçisini ${action} yapmak istediğinizden emin misiniz?`);
    
    if (!confirmed) {
        return;
    }

    try {
        showLoading(true);
        
        await toggleSupplierStatus(currentSupplier.id);
        
        showNotification(`Tedarikçi başarıyla ${action} yapıldı`, 'success');
        
        // Close the modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('supplierDetailsModal'));
        if (modal) {
            modal.hide();
        }
        
        // Refresh the suppliers list
        await loadSuppliers();
        updateSupplierCounts();
        
    } catch (error) {
        console.error('Error toggling supplier status:', error);
        showNotification('Tedarikçi durumu değiştirilirken hata oluştu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function handleDeleteSupplier() {
    if (!currentSupplier) {
        showNotification('Tedarikçi bilgisi bulunamadı', 'error');
        return;
    }

    const confirmed = confirm(`"${currentSupplier.name}" tedarikçisini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`);
    
    if (!confirmed) {
        return;
    }

    try {
        showLoading(true);
        
        await deleteSupplier(currentSupplier.id);
        
        showNotification('Tedarikçi başarıyla silindi', 'success');
        
        // Close the modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('supplierDetailsModal'));
        if (modal) {
            modal.hide();
        }
        
        // Refresh the suppliers list
        await loadSuppliers();
        updateSupplierCounts();
        
    } catch (error) {
        console.error('Error deleting supplier:', error);
        showNotification('Tedarikçi silinirken hata oluştu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Action functions
function exportSuppliers() {
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

function getDbsStatusBadge(hasDbs) {
    if (hasDbs) {
        return '<span class="status-badge status-active">Evet</span>';
    } else {
        return '<span class="status-badge status-inactive">Hayır</span>';
    }
}

function formatDbsLimit(dbsLimit, currency) {
    if (!dbsLimit) return '-';
    const currencySymbol = currency || 'TRY';
    return `${parseFloat(dbsLimit).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}`;
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
    const tableBody = document.getElementById('suppliers-table-body');
    if (tableBody) {
        const loadingRows = [];
        for (let i = 0; i < 5; i++) {
            loadingRows.push(`
                                 <tr class="loading-row">
                     <td><div class="loading-skeleton" style="width: 50px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 150px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 120px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 150px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 80px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 60px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 80px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 120px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 80px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                 </tr>
            `);
        }
        tableBody.innerHTML = loadingRows.join('');
    }
}


// Make functions globally available for onclick handlers
window.editSupplier = async (supplierId) => {
    try {
        showLoading(true);
        isEditMode = true;
        currentSupplier = await getSupplier(supplierId);
        populateSupplierForm();
        showSupplierFormModal();
    } catch (error) {
        console.error('Error loading supplier for edit:', error);
        showNotification('Tedarikçi bilgileri yüklenirken hata oluştu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
};
window.deleteSupplierConfirm = (supplierId) => {
    currentSupplier = suppliers.find(s => s.id === supplierId);
    if (currentSupplier) {
        handleDeleteSupplier();
    }
};
