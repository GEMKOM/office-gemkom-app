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
    setSupplierStatus,
    getSupplierEvaluations,
    getSupplierStatusHistory,
    getPaymentTerms
} from '../../../apis/procurement.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import { hasPerm, isSuperuser } from '../../../authService.js';
import {
    renderSupplierStatusBadge,
    renderStarRating,
    renderOnTimePct,
    escapeHtml,
    SUPPLIER_STATUS_META,
} from '../../../components/supplier-badges/supplier-badges.js';

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
let actionConfirmModal = null;
let supplierFormModal = null;
let statusChangeModal = null; // dedicated status-change modal (needs a reason)

// Whether the current user may write procurement data (rate / blacklist).
// Superusers always qualify (matches the backend's user_has_role_perm).
const canWriteSuppliers = isSuperuser() || hasPerm('access_procurement_write');

const CURRENCY_DROPDOWN_OPTIONS = [
    { value: 'TRY', label: 'TRY — Türk Lirası' },
    { value: 'USD', label: 'USD — Amerikan Doları' },
    { value: 'EUR', label: 'EUR — Euro' },
    { value: 'GBP', label: 'GBP — İngiliz Sterlini' },
];

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }
    actionConfirmModal = new ConfirmationModal('action-confirm-modal-container', {
        title: 'Onay',
        icon: 'fas fa-exclamation-triangle',
        message: 'Bu işlemi yapmak istediğinize emin misiniz?',
        confirmText: 'Evet',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-danger'
    });
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
        
        await loadPaymentTerms();
        initSupplierFormModal();
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

    // Add Supplier lifecycle status filter (approved/watch/blacklisted)
    supplierFilters.addDropdownFilter({
        id: 'supplier-status-filter',
        label: 'Tedarikçi Durumu',
        placeholder: 'Durum seçin...',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'approved', label: 'Onaylı' },
            { value: 'watch', label: 'İzlemede' },
            { value: 'blacklisted', label: 'Kara Liste' }
        ],
        value: '',
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

            // Add supplier lifecycle status filter (approved/watch/blacklisted)
            if (filterValues['supplier-status-filter']) {
                apiFilters.supplier_status = filterValues['supplier-status-filter'];
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

function currencyBadge(code) {
    const c = code || 'TRY';
    return `<span class="status-badge status-grey">${c}</span>`;
}

function taxRateBadge(rate) {
    const n = rate != null && rate !== '' ? Number(rate) : null;
    const t =
        n != null && Number.isFinite(n)
            ? n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
            : '—';
    return `<span class="status-badge status-blue">${t}%</span>`;
}

function statusBadge(isActive) {
    return isActive
        ? '<span class="status-badge status-green">Aktif</span>'
        : '<span class="status-badge status-red">Pasif</span>';
}

function dbsYesNoBadge(hasDbs) {
    return hasDbs
        ? '<span class="status-badge status-blue">Evet</span>'
        : '<span class="status-badge status-grey">Hayır</span>';
}

function renderSuppliersTable(suppliers) {
    const tbody = document.getElementById('suppliers-table-body');
    
    if (!suppliers || suppliers.length === 0) {
                 tbody.innerHTML = `
             <tr>
                 <td colspan="14" class="text-center">
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
                <div class="supplier-name">${escapeHtml(supplier.name) || 'İsimsiz'}</div>
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
                ${currencyBadge(supplier.default_currency)}
            </td>
            <td class="text-center">
                ${taxRateBadge(supplier.default_tax_rate)}
            </td>
            <td class="text-center">
                ${statusBadge(supplier.is_active)}
            </td>
            <td>
                <div class="payment-terms">${getPaymentTermName(supplier.default_payment_terms)}</div>
            </td>
            <td class="text-center">
                ${dbsYesNoBadge(supplier.has_dbs)}
            </td>
            <td class="text-center">
                <div class="dbs-limit">${formatDbsLimit(supplier.dbs_limit, supplier.dbs_currency || supplier.default_currency)}</div>
            </td>
            <td class="text-center">
                ${renderSupplierStatusBadge(supplier)}
            </td>
            <td class="text-center">
                ${renderStarRating(supplier.rating_score, { compact: true })}
                ${supplier.rating_count ? `<div class="small text-muted">(${supplier.rating_count})</div>` : ''}
            </td>
             <td class="text-center">
                <div class="action-buttons">
                    <button class="btn btn-sm btn-outline-warning me-1" title="Değerlendirmeler" onclick="event.stopPropagation(); viewSupplierRatings(${supplier.id})">
                        <i class="fas fa-star"></i>
                    </button>
                    ${canWriteSuppliers ? `
                    <button class="btn btn-sm btn-outline-secondary me-1" title="Durum Değiştir" onclick="event.stopPropagation(); changeSupplierStatus(${supplier.id})">
                        <i class="fas fa-shield-halved"></i>
                    </button>` : ''}
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
            openSupplierFormForCreate();
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
}



function initSupplierFormModal() {
    if (supplierFormModal) {
        supplierFormModal.destroy();
        supplierFormModal = null;
    }

    const paymentTermOptions = [
        { value: '', label: 'Ödeme koşulu seçin...' },
        ...paymentTerms.map((pt) => ({ value: String(pt.id), label: pt.name })),
    ];

    supplierFormModal = new EditModal('supplier-form-modal-container', {
        title: 'Yeni Tedarikçi',
        icon: 'fas fa-handshake',
        saveButtonText: 'Kaydet',
        size: 'xl',
    });

    supplierFormModal.addSection({
        id: 'supplier-basic',
        title: 'Temel Bilgiler',
        icon: 'fas fa-id-card',
        iconColor: 'text-primary',
        fields: [
            { id: 'code', name: 'code', label: 'Kod', type: 'text', placeholder: 'Opsiyonel', help: 'Tedarikçi kodu (opsiyonel)', colSize: 4 },
            {
                id: 'name',
                name: 'name',
                label: 'Tedarikçi Adı',
                type: 'text',
                required: true,
                placeholder: 'Firma unvanı',
                icon: 'fas fa-building',
                colSize: 8,
            },
            { id: 'contact_person', name: 'contact_person', label: 'İletişim Kişisi', type: 'text', colSize: 6, icon: 'fas fa-user' },
            { id: 'phone', name: 'phone', label: 'Telefon', type: 'text', colSize: 6, icon: 'fas fa-phone' },
            { id: 'email', name: 'email', label: 'E-posta', type: 'email', colSize: 6, icon: 'fas fa-envelope' },
            {
                id: 'is_active',
                name: 'is_active',
                label: 'Aktif kayıt',
                type: 'checkbox',
                colSize: 6,
                value: true,
                help: 'Pasif tedarikçiler listelerde pasif olarak görünür',
            },
            { id: 'address', name: 'address', label: 'Adres', type: 'textarea', rows: 2, colSize: 12 },
            {
                id: 'bank_info',
                name: 'bank_info',
                label: 'Banka / IBAN bilgisi',
                type: 'textarea',
                rows: 2,
                colSize: 12,
                help: 'Ödeme için banka hesabı, IBAN vb.',
            },
        ],
    });

    supplierFormModal.addSection({
        id: 'supplier-commercial',
        title: 'Para Birimi ve Ödeme',
        icon: 'fas fa-coins',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'default_currency',
                name: 'default_currency',
                label: 'Varsayılan para birimi',
                type: 'dropdown',
                options: CURRENCY_DROPDOWN_OPTIONS,
                placeholder: 'Seçiniz...',
                colSize: 4,
            },
            {
                id: 'default_payment_terms',
                name: 'default_payment_terms',
                label: 'Varsayılan ödeme koşulları',
                type: 'dropdown',
                options: paymentTermOptions,
                placeholder: 'Seçiniz...',
                colSize: 5,
            },
            {
                id: 'default_tax_rate',
                name: 'default_tax_rate',
                label: 'Varsayılan vergi oranı (%)',
                type: 'number',
                min: 0,
                max: 100,
                step: 0.01,
                value: '20',
                required: true,
                colSize: 3,
                help: '0–100 arası yüzde',
            },
        ],
    });

    supplierFormModal.addSection({
        id: 'supplier-dbs',
        title: 'DBS (Doğrudan Borçlanma Sistemi)',
        icon: 'fas fa-landmark',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'has_dbs',
                name: 'has_dbs',
                label: 'DBS kullanıyor',
                type: 'checkbox',
                colSize: 12,
                value: false,
                help: 'İşaretliyse aşağıdaki DBS alanları kullanılır',
            },
            {
                id: 'dbs_bank',
                name: 'dbs_bank',
                label: 'DBS bankası',
                type: 'text',
                placeholder: 'Örn: İşbank, Garanti...',
                colSize: 6,
            },
            {
                id: 'dbs_limit',
                name: 'dbs_limit',
                label: 'DBS limiti',
                type: 'number',
                min: 0,
                step: 0.01,
                placeholder: '0',
                colSize: 6,
                help: 'Onaylı DBS limit tutarı',
            },
            {
                id: 'dbs_used',
                name: 'dbs_used',
                label: 'Kullanılan DBS',
                type: 'number',
                min: 0,
                step: 0.01,
                value: '0',
                readonly: true,
                colSize: 4,
                help: 'Sunucu tarafından güncellenir (salt okunur)',
            },
            {
                id: 'dbs_currency',
                name: 'dbs_currency',
                label: 'DBS para birimi',
                type: 'dropdown',
                options: CURRENCY_DROPDOWN_OPTIONS,
                placeholder: 'Seçiniz...',
                colSize: 4,
            },
            { id: 'dbs_agreement_no', name: 'dbs_agreement_no', label: 'Sözleşme no', type: 'text', colSize: 4 },
            { id: 'dbs_expiry_date', name: 'dbs_expiry_date', label: 'Limit bitiş tarihi', type: 'date', colSize: 6 },
            { id: 'dbs_details', name: 'dbs_details', label: 'DBS notları', type: 'textarea', rows: 2, colSize: 12 },
        ],
    });

    supplierFormModal.render();
    supplierFormModal.onSaveCallback(handleSupplierModalSave);
    supplierFormModal.onCancelCallback(() => {
        currentSupplier = null;
        isEditMode = false;
    });
}

function toDateInputValue(value) {
    if (value == null || value === '') return '';
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return '';
}

function normalizePaymentTermId(ref) {
    if (ref == null || ref === '') return '';
    if (typeof ref === 'object' && ref !== null && 'id' in ref) return String(ref.id);
    return String(ref);
}

function openSupplierFormForCreate() {
    if (!supplierFormModal) initSupplierFormModal();
    isEditMode = false;
    currentSupplier = null;
    supplierFormModal.setIcon('fas fa-plus');
    supplierFormModal.setTitle('Yeni Tedarikçi');
    supplierFormModal.setSaveButtonText('Kaydet');
    supplierFormModal.clearForm();
    supplierFormModal.setFormData({
        code: '',
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        bank_info: '',
        default_currency: 'TRY',
        default_payment_terms: '',
        default_tax_rate: '20',
        is_active: true,
        has_dbs: false,
        dbs_bank: '',
        dbs_limit: '',
        dbs_used: '0',
        dbs_currency: 'TRY',
        dbs_agreement_no: '',
        dbs_expiry_date: '',
        dbs_details: '',
    });
    supplierFormModal.show();
}

function openSupplierFormForEdit() {
    if (!supplierFormModal) initSupplierFormModal();
    if (!currentSupplier) return;
    supplierFormModal.setIcon('fas fa-edit');
    supplierFormModal.setTitle('Tedarikçi Düzenle');
    supplierFormModal.setSaveButtonText('Güncelle');
    supplierFormModal.clearForm();
    supplierFormModal.setFormData({
        code: currentSupplier.code || '',
        name: currentSupplier.name || '',
        contact_person: currentSupplier.contact_person || '',
        phone: currentSupplier.phone || '',
        email: currentSupplier.email || '',
        address: currentSupplier.address || '',
        bank_info: currentSupplier.bank_info || '',
        default_currency: currentSupplier.default_currency || 'TRY',
        default_payment_terms: normalizePaymentTermId(currentSupplier.default_payment_terms),
        default_tax_rate:
            currentSupplier.default_tax_rate != null ? String(currentSupplier.default_tax_rate) : '20',
        is_active: currentSupplier.is_active !== false,
        has_dbs: !!currentSupplier.has_dbs,
        dbs_bank: currentSupplier.dbs_bank || '',
        dbs_limit: currentSupplier.dbs_limit != null ? String(currentSupplier.dbs_limit) : '',
        dbs_used: currentSupplier.dbs_used != null ? String(currentSupplier.dbs_used) : '0',
        dbs_currency: currentSupplier.dbs_currency || 'TRY',
        dbs_agreement_no: currentSupplier.dbs_agreement_no || '',
        dbs_expiry_date: toDateInputValue(currentSupplier.dbs_expiry_date),
        dbs_details: currentSupplier.dbs_details || '',
    });
    supplierFormModal.show();
}

async function handleSupplierModalSave(formData) {
    const taxRate = parseFloat(formData.default_tax_rate);
    if (
        formData.default_tax_rate === '' ||
        formData.default_tax_rate == null ||
        Number.isNaN(taxRate) ||
        taxRate < 0 ||
        taxRate > 100
    ) {
        showNotification('Geçerli bir vergi oranı giriniz (0–100 arası)', 'error');
        throw new Error('validation');
    }

    const hasDbs = !!formData.has_dbs;
    if (hasDbs && formData.dbs_limit !== '' && formData.dbs_limit != null) {
        const lim = parseFloat(formData.dbs_limit);
        if (Number.isNaN(lim) || lim < 0) {
            showNotification('Geçerli bir DBS limiti giriniz (0 veya daha büyük)', 'error');
            throw new Error('validation');
        }
    }

    const name = (formData.name || '').trim();
    if (!name) {
        showNotification('Tedarikçi adı zorunludur', 'error');
        throw new Error('validation');
    }

    const supplierData = {
        code: (formData.code || '').trim(),
        name,
        contact_person: (formData.contact_person || '').trim(),
        phone: (formData.phone || '').trim(),
        email: (formData.email || '').trim(),
        address: (formData.address || '').trim(),
        bank_info: (formData.bank_info || '').trim(),
        default_currency: formData.default_currency || 'TRY',
        default_payment_terms: formData.default_payment_terms ? Number(formData.default_payment_terms) : null,
        default_tax_rate: taxRate,
        is_active: !!formData.is_active,
        has_dbs: hasDbs,
        dbs_bank: hasDbs ? (formData.dbs_bank || '').trim() : '',
        dbs_limit:
            hasDbs && formData.dbs_limit !== '' && formData.dbs_limit != null ? parseFloat(formData.dbs_limit) : null,
        dbs_currency: hasDbs ? formData.dbs_currency || 'TRY' : 'TRY',
        dbs_agreement_no: hasDbs ? (formData.dbs_agreement_no || '').trim() : '',
        dbs_expiry_date: hasDbs && formData.dbs_expiry_date ? formData.dbs_expiry_date : null,
        dbs_details: hasDbs ? (formData.dbs_details || '').trim() : '',
    };

    try {
        showLoading(true);
        if (isEditMode && currentSupplier) {
            await updateSupplier(currentSupplier.id, supplierData);
            showNotification('Tedarikçi başarıyla güncellendi', 'success');
        } else {
            await createSupplier(supplierData);
            showNotification('Tedarikçi başarıyla oluşturuldu', 'success');
        }
        supplierFormModal.hide();
        currentSupplier = null;
        isEditMode = false;
        await loadSuppliers();
        updateSupplierCounts();
    } catch (error) {
        console.error('Error saving supplier:', error);
        showNotification('Tedarikçi kaydedilirken hata oluştu: ' + error.message, 'error');
        throw error;
    } finally {
        showLoading(false);
    }
}

function getPaymentTermName(paymentTermRef) {
    if (paymentTermRef == null || paymentTermRef === '') return '-';
    if (typeof paymentTermRef === 'object' && paymentTermRef !== null) {
        return paymentTermRef.name || '-';
    }
    const paymentTerm = paymentTerms.find(
        (pt) => pt.id === paymentTermRef || String(pt.id) === String(paymentTermRef),
    );
    return paymentTerm ? paymentTerm.name : '-';
}

async function handleToggleStatus() {
    if (!currentSupplier) {
        showNotification('Tedarikçi bilgisi bulunamadı', 'error');
        return;
    }

    const action = currentSupplier.is_active ? 'pasif' : 'aktif';
    const name = currentSupplier.name;
    const id = currentSupplier.id;
    actionConfirmModal.show({
        message: `"${name}" tedarikçisini ${action} yapmak istediğinizden emin misiniz?`,
        onConfirm: async () => {
            try {
                showLoading(true);
                await toggleSupplierStatus(id);
                showNotification(`Tedarikçi başarıyla ${action} yapıldı`, 'success');
                await loadSuppliers();
                updateSupplierCounts();
            } catch (error) {
                console.error('Error toggling supplier status:', error);
                showNotification('Tedarikçi durumu değiştirilirken hata oluştu: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    });
}

async function handleDeleteSupplier() {
    if (!currentSupplier) {
        showNotification('Tedarikçi bilgisi bulunamadı', 'error');
        return;
    }

    const name = currentSupplier.name;
    const id = currentSupplier.id;
    actionConfirmModal.show({
        message: `"${name}" tedarikçisini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
        onConfirm: async () => {
            try {
                showLoading(true);
                await deleteSupplier(id);
                showNotification('Tedarikçi başarıyla silindi', 'success');
                await loadSuppliers();
                updateSupplierCounts();
            } catch (error) {
                console.error('Error deleting supplier:', error);
                showNotification('Tedarikçi silinirken hata oluştu: ' + error.message, 'error');
            } finally {
                showLoading(false);
            }
        }
    });
}

// Action functions
function exportSuppliers() {
    showNotification('Dışa aktarma özelliği yakında eklenecek', 'info');
}

// Utility functions
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
                     <td><div class="loading-skeleton" style="width: 90px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 90px;"></div></td>
                     <td><div class="loading-skeleton" style="width: 72px;"></div></td>
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
        openSupplierFormForEdit();
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

// --- Supplier status change (approved / watch / blacklisted) with a reason ---

function initStatusChangeModal() {
    if (statusChangeModal) return;
    statusChangeModal = new EditModal('status-change-modal-container', {
        title: 'Tedarikçi Durumu Değiştir',
        icon: 'fas fa-shield-halved',
        saveButtonText: 'Kaydet',
        size: 'md',
    });
    statusChangeModal.addSection({
        id: 'status-change',
        title: 'Durum',
        icon: 'fas fa-shield-halved',
        iconColor: 'text-secondary',
        fields: [
            {
                id: 'status', name: 'status', label: 'Durum', type: 'select', required: true, colSize: 12,
                options: Object.entries(SUPPLIER_STATUS_META).map(([value, meta]) => ({ value, label: meta.label })),
            },
            {
                id: 'reason', name: 'reason', label: 'Gerekçe', type: 'textarea', rows: 3, colSize: 12,
                placeholder: 'Durum değişikliği gerekçesi (özellikle kara liste için önerilir)',
            },
        ],
    });
    statusChangeModal.render();
    statusChangeModal.onSaveCallback(handleStatusChangeSave);
}

async function handleStatusChangeSave(formData) {
    if (!currentSupplier) return;
    const newStatus = formData.status;
    const reason = (formData.reason || '').trim();
    if (!newStatus) {
        showNotification('Lütfen bir durum seçin', 'error');
        throw new Error('validation');
    }
    try {
        showLoading(true);
        await setSupplierStatus(currentSupplier.id, { status: newStatus, reason });
        showNotification('Tedarikçi durumu güncellendi', 'success');
        statusChangeModal.hide();
        currentSupplier = null;
        await loadSuppliers();
    } catch (error) {
        console.error('Error changing supplier status:', error);
        showNotification('Durum güncellenirken hata oluştu: ' + error.message, 'error');
        throw error;
    } finally {
        showLoading(false);
    }
}

window.changeSupplierStatus = (supplierId) => {
    if (!canWriteSuppliers) return;
    currentSupplier = suppliers.find(s => s.id === supplierId);
    if (!currentSupplier) return;
    initStatusChangeModal();
    statusChangeModal.clearForm();
    statusChangeModal.setFormData({ status: currentSupplier.status || 'approved', reason: '' });
    statusChangeModal.show();
};

// --- Read-only drill-down: evaluations + status history ---

let ratingsDisplayModal = null;

function fmtDate(value) {
    if (!value) return '-';
    try { return new Date(value).toLocaleDateString('tr-TR'); } catch (_) { return '-'; }
}

function statusLabel(key) {
    return (SUPPLIER_STATUS_META[key] && SUPPLIER_STATUS_META[key].label) || key || '-';
}

window.viewSupplierRatings = async (supplierId) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!ratingsDisplayModal) {
        ratingsDisplayModal = new DisplayModal('supplier-ratings-modal-container', {
            title: 'Tedarikçi Değerlendirmeleri',
            icon: 'fas fa-star',
            size: 'lg',
        });
    }
    ratingsDisplayModal.clearData?.();
    ratingsDisplayModal.setTitle?.(`Değerlendirmeler — ${supplier ? supplier.name : ''}`);
    ratingsDisplayModal.addCustomSection({ id: 'ratings-loading', customContent: '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Yükleniyor...</div>' });
    ratingsDisplayModal.render();
    ratingsDisplayModal.show();

    try {
        const [evals, history] = await Promise.all([
            getSupplierEvaluations(supplierId),
            getSupplierStatusHistory(supplierId),
        ]);

        const summary = supplier ? `
            <div class="mb-3">
                ${renderStarRating(supplier.rating_score, { compact: true })}
                <span class="ms-2">${renderSupplierStatusBadge(supplier)}</span>
                <span class="ms-2 small text-muted">Zamanında Teslimat: ${renderOnTimePct(supplier.on_time_delivery_pct)}</span>
            </div>` : '';

        const evalRows = (evals || []).map(e => `
            <tr>
                <td>${escapeHtml(e.po_number || ('PO-' + e.purchase_order))}</td>
                <td class="text-center">${e.quality_score}</td>
                <td class="text-center">${e.delivery_score}</td>
                <td class="text-center">${e.price_score}</td>
                <td class="text-center">${e.service_score}</td>
                <td class="text-center"><strong>${Number(e.composite_score).toFixed(2)}</strong></td>
                <td>${escapeHtml(e.comment || '')}</td>
                <td class="small text-muted">${escapeHtml(e.evaluated_by_username || '')} · ${fmtDate(e.created_at)}</td>
            </tr>`).join('');

        const evalTable = (evals && evals.length) ? `
            <h6 class="text-primary mt-2">Değerlendirmeler</h6>
            <div class="table-responsive"><table class="table table-sm table-striped">
                <thead><tr>
                    <th>Sipariş</th><th class="text-center">Kalite</th><th class="text-center">Teslimat</th>
                    <th class="text-center">Fiyat</th><th class="text-center">Servis</th><th class="text-center">Puan</th>
                    <th>Yorum</th><th>Değerlendiren</th>
                </tr></thead><tbody>${evalRows}</tbody>
            </table></div>` : '<p class="text-muted">Henüz değerlendirme yok.</p>';

        const histRows = (history || []).map(h => `
            <tr>
                <td>${statusLabel(h.previous_status)} → <strong>${statusLabel(h.new_status)}</strong></td>
                <td>${escapeHtml(h.reason || '')}</td>
                <td class="small text-muted">${escapeHtml(h.changed_by_username || '')} · ${fmtDate(h.changed_at)}</td>
            </tr>`).join('');

        const histTable = (history && history.length) ? `
            <h6 class="text-primary mt-3">Durum Geçmişi</h6>
            <div class="table-responsive"><table class="table table-sm table-striped">
                <thead><tr><th>Değişiklik</th><th>Gerekçe</th><th>Değiştiren</th></tr></thead>
                <tbody>${histRows}</tbody>
            </table></div>` : '';

        ratingsDisplayModal.clearData?.();
        ratingsDisplayModal.addCustomSection({ id: 'ratings-content', customContent: summary + evalTable + histTable });
        ratingsDisplayModal.render();
    } catch (error) {
        console.error('Error loading supplier ratings:', error);
        ratingsDisplayModal.clearData?.();
        ratingsDisplayModal.addCustomSection({ id: 'ratings-error', customContent: `<div class="text-danger">Yüklenirken hata oluştu: ${escapeHtml(error.message)}</div>` });
        ratingsDisplayModal.render();
    }
};
