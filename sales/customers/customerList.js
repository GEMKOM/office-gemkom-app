import { initNavbar } from '../../components/navbar.js';
import { ModernDropdown } from '../../components/dropdown/dropdown.js';
import { 
    listCustomers, 
    getCustomerById, 
    createCustomer as createCustomerAPI, 
    updateCustomer as updateCustomerAPI, 
    patchCustomer as patchCustomerAPI,
    deleteCustomer as deleteCustomerAPI,
    CURRENCY_OPTIONS
} from '../../apis/projects/customers.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';

// State management
let currentPage = 1;
let currentFilter = 'all';
let currentOrdering = 'code'; // Default backend ordering
let currentSortField = 'code'; // Default sort field
let currentSortDirection = 'asc'; // Default sort direction
let customers = [];
let totalCustomers = 0;
let isLoading = false;
let customersStats = null; // Statistics Cards component instance
let customerFilters = null; // Filters component instance
let customersTable = null; // Table component instance

// Modal component instances
let createCustomerModal = null;
let editCustomerModal = null;
let deleteCustomerModal = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Müşteri Yönetimi',
        subtitle: 'Müşteri listesi ve yönetimi',
        icon: 'users',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'none',
        createButtonText: '      Yeni Müşteri',
        onBackClick: () => window.location.href = '/sales/',
        onCreateClick: () => showCreateCustomerModal()
    });
    
    // Initialize Statistics Cards component
    customersStats = new StatisticsCards('customers-statistics', {
        cards: [
            { title: 'Toplam Müşteri', value: '0', icon: 'fas fa-users', color: 'primary', id: 'total-customers-count' },
            { title: 'Aktif Müşteri', value: '0', icon: 'fas fa-check-circle', color: 'success', id: 'active-customers-count' },
            { title: 'Pasif Müşteri', value: '0', icon: 'fas fa-times-circle', color: 'danger', id: 'inactive-customers-count' },
            { title: 'Farklı Para Birimi', value: '0', icon: 'fas fa-coins', color: 'warning', id: 'currencies-count' }
        ],
        compact: true,
        animation: true
    });
    
    await initializeCustomers();
    setupEventListeners();
});

async function initializeCustomers() {
    try {
        initializeFiltersComponent();
        initializeTableComponent();
        initializeModalComponents();
        
        await loadCustomers();
        updateCustomerCounts();
    } catch (error) {
        console.error('Error initializing customers:', error);
        showNotification('Müşteriler yüklenirken hata oluştu', 'error');
    }
}

function initializeTableComponent() {
    customersTable = new TableComponent('customers-table-container', {
        title: 'Müşteri Listesi',
        columns: [
            {
                field: 'code',
                label: 'Müşteri Kodu',
                sortable: true,
                formatter: (value) => `<strong>${value || '-'}</strong>`
            },
            {
                field: 'name',
                label: 'Firma Adı',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'short_name',
                label: 'Kısa Ad',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'contact_person',
                label: 'İletişim Kişisi',
                sortable: false,
                formatter: (value) => value || '-'
            },
            {
                field: 'email',
                label: 'E-posta',
                sortable: false,
                formatter: (value) => value ? `<a href="mailto:${value}">${value}</a>` : '-'
            },
            {
                field: 'phone',
                label: 'Telefon',
                sortable: false,
                formatter: (value) => value || '-'
            },
            {
                field: 'default_currency',
                label: 'Para Birimi',
                sortable: true,
                formatter: (value) => {
                    if (!value) return '-';
                    const currency = CURRENCY_OPTIONS.find(c => c.value === value);
                    return currency ? currency.label : value;
                }
            },
            {
                field: 'is_active',
                label: 'Durum',
                sortable: true,
                formatter: (value) => {
                    if (value === true) {
                        return '<span class="status-badge status-green">Aktif</span>';
                    } else if (value === false) {
                        return '<span class="status-badge status-grey">Pasif</span>';
                    }
                    return '<span class="text-muted">-</span>';
                }
            },
            {
                field: 'created_at',
                label: 'Oluşturulma',
                sortable: true,
                type: 'date',
                formatter: (value) => {
                    if (!value) return '-';
                    const date = new Date(value);
                    return date.toLocaleDateString('tr-TR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                }
            }
        ],
        data: [],
        sortable: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        refreshable: true,
        exportable: true,
        onRefresh: async () => {
            // Reset to first page when refreshing
            currentPage = 1;
            await loadCustomers();
        },
        onExport: async (format) => {
            await exportCustomers(format);
        },
        onSort: async (field, direction) => {
            // Reset to first page when sorting
            currentPage = 1;
            currentSortField = field;
            currentSortDirection = direction;
            await loadCustomers();
        },
        onPageSizeChange: async (newPageSize) => {
            // Update local variable to keep in sync
            let itemsPerPage = newPageSize;
            // Ensure table component also has the correct value (should already be set, but ensure sync)
            if (customersTable) {
                customersTable.options.itemsPerPage = newPageSize;
            }
            // Reset to page 1 and load with new page size
            currentPage = 1;
            await loadCustomers();
        },
        onPageChange: async (page) => {
            currentPage = page;
            await loadCustomers();
        },
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    editCustomer(row.id);
                }
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => deleteCustomer(row.id, row.name || row.code)
            }
        ],
        emptyMessage: 'Müşteri bulunamadı',
        emptyIcon: 'fas fa-users'
    });
}

function initializeFiltersComponent() {
    // Initialize filters component
    customerFilters = new FiltersComponent('filters-placeholder', {
        title: 'Müşteri Filtreleri',
        onApply: (values) => {
            // Reset to first page when applying filters
            currentPage = 1;
            loadCustomers();
        },
        onClear: () => {
            // Reset to first page when clearing filters
            currentPage = 1;
            loadCustomers();
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
        }
    });

    // Add text filters
    customerFilters.addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'Kod, isim, kısa ad, iletişim kişisi, e-posta',
        colSize: 3
    });

    // Add dropdown filters
    customerFilters.addDropdownFilter({
        id: 'is-active-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        placeholder: 'Tümü',
        colSize: 2
    });

    customerFilters.addDropdownFilter({
        id: 'currency-filter',
        label: 'Para Birimi',
        options: [
            { value: '', label: 'Tümü' },
            ...CURRENCY_OPTIONS.map(c => ({ value: c.value, label: c.label }))
        ],
        placeholder: 'Tümü',
        colSize: 2
    });

    customerFilters.addCheckboxFilter({
        id: 'show-inactive-filter',
        label: 'Pasifleri Göster',
        checked: false,
        colSize: 2
    });
}

// Initialize modal components
function initializeModalComponents() {
    // Create Customer Modal
    createCustomerModal = new EditModal('create-customer-modal-container', {
        title: 'Yeni Müşteri Oluştur',
        icon: 'fas fa-plus-circle',
        size: 'lg',
        showEditButton: false
    });

    // Edit Customer Modal
    editCustomerModal = new EditModal('edit-customer-modal-container', {
        title: 'Müşteri Düzenle',
        icon: 'fas fa-edit',
        size: 'lg',
        showEditButton: false
    });

    // Delete Customer Modal
    deleteCustomerModal = new DisplayModal('delete-customer-modal-container', {
        title: 'Müşteri Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        size: 'md',
        showEditButton: false
    });

    // Set up modal callbacks
    setupModalCallbacks();
}

// Set up modal callbacks
function setupModalCallbacks() {
    // Create customer modal callbacks
    createCustomerModal.onSaveCallback(async (formData) => {
        await createCustomer(formData);
    });

    // Edit customer modal callbacks
    editCustomerModal.onSaveCallback(async (formData) => {
        await updateCustomer(formData);
    });

    // Delete customer modal callbacks
    deleteCustomerModal.onCloseCallback(() => {
        // Clear any pending delete data when modal is closed
        window.pendingDeleteCustomerId = null;
    });
}

async function loadCustomers() {
    try {
        if (isLoading) return;
        
        isLoading = true;
        if (customersTable) {
            customersTable.setLoading(true);
        }
        
        // Get filter values
        const filterValues = customerFilters ? customerFilters.getFilterValues() : {};
        
        // Build query options
        const options = {
            page: currentPage,
            ordering: currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`
        };
        
        // Add filters
        if (filterValues['search-filter']) {
            options.search = filterValues['search-filter'];
        }
        if (filterValues['is-active-filter']) {
            options.is_active = filterValues['is-active-filter'] === 'true';
        }
        if (filterValues['currency-filter']) {
            options.default_currency = filterValues['currency-filter'];
        }
        if (filterValues['show-inactive-filter']) {
            options.show_inactive = filterValues['show-inactive-filter'];
        }
        
        // Call API
        const response = await listCustomers(options);
        
        // Extract customers and total count from response
        customers = response.results || [];
        totalCustomers = response.count || 0;
        
        // Update table data with pagination info
        if (customersTable) {
            customersTable.updateData(customers, totalCustomers, currentPage);
        } else {
            console.warn('customersTable is null, cannot update data');
        }
        
        updateCustomerCounts();
        
    } catch (error) {
        console.error('Error loading customers:', error);
        showNotification('Müşteriler yüklenirken hata oluştu', 'error');
        customers = [];
        totalCustomers = 0;
        if (customersTable) {
            customersTable.updateData([], 0, currentPage);
        }
    } finally {
        isLoading = false;
        if (customersTable) {
            customersTable.setLoading(false);
        }
    }
}

function updateCustomerCounts() {
    try {
        const totalCount = totalCustomers;
        const activeCount = customers.filter(c => c.is_active === true).length;
        const inactiveCount = customers.filter(c => c.is_active === false).length;
        
        // Count unique currencies
        const currencies = new Set(customers.map(c => c.default_currency).filter(Boolean));
        const currenciesCount = currencies.size;
        
        // Update statistics cards using the component
        if (customersStats) {
            customersStats.updateValues({
                0: totalCount.toString(),
                1: activeCount.toString(),
                2: inactiveCount.toString(),
                3: currenciesCount.toString()
            });
        }
    } catch (error) {
        console.error('Error updating customer counts:', error);
    }
}

function setupEventListeners() {
    // Use event delegation for dynamically added buttons
    document.addEventListener('click', async (e) => {
        if (e.target && e.target.id === 'confirm-delete-customer-btn') {
            const customerId = window.pendingDeleteCustomerId;
            if (!customerId) return;
            
            try {
                await deleteCustomerAPI(customerId);
                
                showNotification('Müşteri silindi', 'success');
                // Hide the modal
                deleteCustomerModal.hide();
                // Clear the pending delete key
                window.pendingDeleteCustomerId = null;
                // Reload customers
                await loadCustomers();
            } catch (error) {
                console.error('Error deleting customer:', error);
                showNotification(error.message || 'Müşteri silinirken hata oluştu', 'error');
            }
        }
    });
}

// Global functions for actions

window.editCustomer = async function(customerId) {
    // Check if customerId is valid
    if (!customerId || customerId === '') {
        showNotification('Geçersiz müşteri ID', 'error');
        return;
    }
    
    try {
        // Fetch customer detail from API
        const customer = await getCustomerById(customerId);
        
        if (!customer) {
            showNotification('Müşteri bulunamadı', 'error');
            return;
        }
        
        // Store the customer ID for update
        window.editingCustomerId = customerId;
        
        // Clear and configure the edit modal
        editCustomerModal.clearAll();
        
        // Add Basic Information section
        editCustomerModal.addSection({
            title: 'Temel Bilgiler',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });

        // Add form fields with customer data
        editCustomerModal.addField({
            id: 'code',
            name: 'code',
            label: 'Müşteri Kodu',
            type: 'text',
            value: customer.code || '',
            required: true,
            icon: 'fas fa-barcode',
            colSize: 6,
            helpText: 'Benzersiz müşteri kodu'
        });

        editCustomerModal.addField({
            id: 'name',
            name: 'name',
            label: 'Firma Adı',
            type: 'text',
            value: customer.name || '',
            required: true,
            icon: 'fas fa-building',
            colSize: 6,
            helpText: 'Tam firma adı'
        });

        editCustomerModal.addField({
            id: 'short_name',
            name: 'short_name',
            label: 'Kısa Ad',
            type: 'text',
            value: customer.short_name || '',
            icon: 'fas fa-tag',
            colSize: 6,
            helpText: 'Kısa gösterim adı'
        });

        editCustomerModal.addField({
            id: 'default_currency',
            name: 'default_currency',
            label: 'Para Birimi',
            type: 'dropdown',
            value: customer.default_currency || 'TRY',
            icon: 'fas fa-coins',
            colSize: 6,
            helpText: 'Varsayılan para birimi',
            options: CURRENCY_OPTIONS.map(c => ({
                value: c.value,
                label: c.label
            }))
        });

        // Add Contact Information section
        editCustomerModal.addSection({
            title: 'İletişim Bilgileri',
            icon: 'fas fa-address-book',
            iconColor: 'text-success'
        });

        editCustomerModal.addField({
            id: 'contact_person',
            name: 'contact_person',
            label: 'İletişim Kişisi',
            type: 'text',
            value: customer.contact_person || '',
            icon: 'fas fa-user',
            colSize: 6,
            helpText: 'Ana iletişim kişisi'
        });

        editCustomerModal.addField({
            id: 'phone',
            name: 'phone',
            label: 'Telefon',
            type: 'text',
            value: customer.phone || '',
            icon: 'fas fa-phone',
            colSize: 6,
            helpText: 'Telefon numarası'
        });

        editCustomerModal.addField({
            id: 'email',
            name: 'email',
            label: 'E-posta',
            type: 'email',
            value: customer.email || '',
            icon: 'fas fa-envelope',
            colSize: 6,
            helpText: 'E-posta adresi'
        });

        editCustomerModal.addField({
            id: 'address',
            name: 'address',
            label: 'Adres',
            type: 'textarea',
            value: customer.address || '',
            icon: 'fas fa-map-marker-alt',
            colSize: 6,
            helpText: 'Tam adres'
        });

        // Add Tax Information section
        editCustomerModal.addSection({
            title: 'Vergi Bilgileri',
            icon: 'fas fa-file-invoice',
            iconColor: 'text-info'
        });

        editCustomerModal.addField({
            id: 'tax_id',
            name: 'tax_id',
            label: 'Vergi Numarası',
            type: 'text',
            value: customer.tax_id || '',
            icon: 'fas fa-id-card',
            colSize: 6,
            helpText: 'Vergi kimlik numarası'
        });

        editCustomerModal.addField({
            id: 'tax_office',
            name: 'tax_office',
            label: 'Vergi Dairesi',
            type: 'text',
            value: customer.tax_office || '',
            icon: 'fas fa-landmark',
            colSize: 6,
            helpText: 'Bağlı olduğu vergi dairesi'
        });

        // Add Status section
        editCustomerModal.addSection({
            title: 'Durum',
            icon: 'fas fa-toggle-on',
            iconColor: 'text-warning'
        });

        editCustomerModal.addField({
            id: 'is_active',
            name: 'is_active',
            label: 'Aktif',
            type: 'checkbox',
            value: customer.is_active !== false,
            icon: 'fas fa-check-circle',
            colSize: 12,
            helpText: 'Müşterinin aktif durumu'
        });

        editCustomerModal.addField({
            id: 'notes',
            name: 'notes',
            label: 'Notlar',
            type: 'textarea',
            value: customer.notes || '',
            icon: 'fas fa-sticky-note',
            colSize: 12,
            helpText: 'İç notlar'
        });

        // Render and show modal
        editCustomerModal.render();
        editCustomerModal.show();
    } catch (error) {
        console.error('Error loading customer for edit:', error);
        showNotification('Müşteri bilgileri yüklenirken hata oluştu', 'error');
    }
};

window.deleteCustomer = function(customerId, customerName) {
    showDeleteCustomerModal(customerId, customerName);
};

// Show delete customer confirmation modal
function showDeleteCustomerModal(customerId, customerName) {
    // Store the customer ID for deletion
    window.pendingDeleteCustomerId = customerId;

    // Clear and configure the delete modal
    deleteCustomerModal.clearData();
    
    // Add warning section
    deleteCustomerModal.addSection({
        title: 'Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        iconColor: 'text-danger'
    });

    // Add warning message
    deleteCustomerModal.addField({
        id: 'delete-warning',
        name: 'warning',
        label: 'Uyarı',
        type: 'text',
        value: 'Bu müşteriyi silmek istediğinize emin misiniz?',
        icon: 'fas fa-exclamation-triangle',
        colSize: 12
    });

    // Add customer name
    deleteCustomerModal.addField({
        id: 'delete-customer-name',
        name: 'customer_name',
        label: 'Müşteri Adı',
        type: 'text',
        value: customerName,
        icon: 'fas fa-building',
        colSize: 12
    });

    // Add warning about permanent deletion
    deleteCustomerModal.addField({
        id: 'delete-warning-permanent',
        name: 'permanent_warning',
        label: 'Dikkat',
        type: 'text',
        value: 'Bu işlem geri alınamaz ve müşteri kalıcı olarak silinecektir.',
        icon: 'fas fa-trash',
        colSize: 12
    });

    // Render the modal first
    deleteCustomerModal.render();
    
    // Add custom buttons after rendering
    const modalFooter = deleteCustomerModal.container.querySelector('.modal-footer');
    if (modalFooter) {
        modalFooter.innerHTML = `
            <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>İptal
                </button>
                <button type="button" class="btn btn-danger" id="confirm-delete-customer-btn">
                    <i class="fas fa-trash me-1"></i>Evet, Sil
                </button>
            </div>
        `;
    }

    // Show the modal
    deleteCustomerModal.show();
}

function showCreateCustomerModal() {
    // Clear and configure the create modal
    createCustomerModal.clearAll();
    
    // Add Basic Information section
    createCustomerModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    // Add form fields
    createCustomerModal.addField({
        id: 'code',
        name: 'code',
        label: 'Müşteri Kodu',
        type: 'text',
        placeholder: 'Müşteri kodunu girin',
        required: true,
        icon: 'fas fa-barcode',
        colSize: 6,
        helpText: 'Benzersiz müşteri kodu'
    });

    createCustomerModal.addField({
        id: 'name',
        name: 'name',
        label: 'Firma Adı',
        type: 'text',
        placeholder: 'Firma adını girin',
        required: true,
        icon: 'fas fa-building',
        colSize: 6,
        helpText: 'Tam firma adı'
    });

    createCustomerModal.addField({
        id: 'short_name',
        name: 'short_name',
        label: 'Kısa Ad',
        type: 'text',
        placeholder: 'Kısa gösterim adı',
        icon: 'fas fa-tag',
        colSize: 6,
        helpText: 'Kısa gösterim adı'
    });

    createCustomerModal.addField({
        id: 'default_currency',
        name: 'default_currency',
        label: 'Para Birimi',
        type: 'dropdown',
        placeholder: 'Para birimi seçin...',
        value: 'TRY',
        icon: 'fas fa-coins',
        colSize: 6,
        helpText: 'Varsayılan para birimi',
        options: CURRENCY_OPTIONS.map(c => ({
            value: c.value,
            label: c.label
        }))
    });

    // Add Contact Information section
    createCustomerModal.addSection({
        title: 'İletişim Bilgileri',
        icon: 'fas fa-address-book',
        iconColor: 'text-success'
    });

    createCustomerModal.addField({
        id: 'contact_person',
        name: 'contact_person',
        label: 'İletişim Kişisi',
        type: 'text',
        placeholder: 'İletişim kişisi adı',
        icon: 'fas fa-user',
        colSize: 6,
        helpText: 'Ana iletişim kişisi'
    });

    createCustomerModal.addField({
        id: 'phone',
        name: 'phone',
        label: 'Telefon',
        type: 'text',
        placeholder: 'Telefon numarası',
        icon: 'fas fa-phone',
        colSize: 6,
        helpText: 'Telefon numarası'
    });

    createCustomerModal.addField({
        id: 'email',
        name: 'email',
        label: 'E-posta',
        type: 'email',
        placeholder: 'E-posta adresi',
        icon: 'fas fa-envelope',
        colSize: 6,
        helpText: 'E-posta adresi'
    });

    createCustomerModal.addField({
        id: 'address',
        name: 'address',
        label: 'Adres',
        type: 'textarea',
        placeholder: 'Tam adres',
        icon: 'fas fa-map-marker-alt',
        colSize: 6,
        helpText: 'Tam adres'
    });

    // Add Tax Information section
    createCustomerModal.addSection({
        title: 'Vergi Bilgileri',
        icon: 'fas fa-file-invoice',
        iconColor: 'text-info'
    });

    createCustomerModal.addField({
        id: 'tax_id',
        name: 'tax_id',
        label: 'Vergi Numarası',
        type: 'text',
        placeholder: 'Vergi kimlik numarası',
        icon: 'fas fa-id-card',
        colSize: 6,
        helpText: 'Vergi kimlik numarası'
    });

    createCustomerModal.addField({
        id: 'tax_office',
        name: 'tax_office',
        label: 'Vergi Dairesi',
        type: 'text',
        placeholder: 'Vergi dairesi adı',
        icon: 'fas fa-landmark',
        colSize: 6,
        helpText: 'Bağlı olduğu vergi dairesi'
    });

    // Add Status section
    createCustomerModal.addSection({
        title: 'Durum',
        icon: 'fas fa-toggle-on',
        iconColor: 'text-warning'
    });

    createCustomerModal.addField({
        id: 'is_active',
        name: 'is_active',
        label: 'Aktif',
        type: 'checkbox',
        value: true,
        icon: 'fas fa-check-circle',
        colSize: 12,
        helpText: 'Müşterinin aktif durumu'
    });

    createCustomerModal.addField({
        id: 'notes',
        name: 'notes',
        label: 'Notlar',
        type: 'textarea',
        placeholder: 'İç notlar',
        icon: 'fas fa-sticky-note',
        colSize: 12,
        helpText: 'İç notlar'
    });

    // Render and show modal
    createCustomerModal.render();
    createCustomerModal.show();
}

async function createCustomer(formData) {
    try {
        const response = await createCustomerAPI(formData);
        
        if (response && response.id) {
            showNotification('Müşteri başarıyla oluşturuldu', 'success');
            
            // Hide modal
            createCustomerModal.hide();
            
            // Reload customers
            currentPage = 1;
            await loadCustomers();
        } else {
            throw new Error('Müşteri oluşturulamadı');
        }
    } catch (error) {
        console.error('Error creating customer:', error);
        let errorMessage = 'Müşteri oluşturulurken hata oluştu';
        
        // Try to parse error message
        try {
            if (error.message) {
                const errorData = JSON.parse(error.message);
                if (typeof errorData === 'object') {
                    const errors = Object.values(errorData).flat();
                    errorMessage = errors.join(', ') || errorMessage;
                } else {
                    errorMessage = error.message;
                }
            }
        } catch (e) {
            // If parsing fails, use default message
        }
        
        showNotification(errorMessage, 'error');
    }
}

async function updateCustomer(formData) {
    const customerId = window.editingCustomerId;
    if (!customerId) {
        showNotification('Düzenlenecek müşteri bulunamadı', 'error');
        return;
    }
    
    try {
        const response = await patchCustomerAPI(customerId, formData);
        
        if (response && response.id) {
            // Hide modal
            editCustomerModal.hide();
            
            // Clear the editing customer ID
            window.editingCustomerId = null;
            
            // Reload customers
            await loadCustomers();
            
            showNotification('Müşteri başarıyla güncellendi', 'success');
        } else {
            throw new Error('Müşteri güncellenemedi');
        }
    } catch (error) {
        console.error('Error updating customer:', error);
        let errorMessage = 'Müşteri güncellenirken hata oluştu';
        
        // Try to parse error message
        try {
            if (error.message) {
                const errorData = JSON.parse(error.message);
                if (typeof errorData === 'object') {
                    const errors = Object.values(errorData).flat();
                    errorMessage = errors.join(', ') || errorMessage;
                } else {
                    errorMessage = error.message;
                }
            }
        } catch (e) {
            // If parsing fails, use default message
        }
        
        showNotification(errorMessage, 'error');
    }
}

async function exportCustomers(format) {
    try {
        // Show loading state using table component's method
        if (customersTable) {
            customersTable.setExportLoading(true);
        }
        
        // Get filter values
        const filterValues = customerFilters ? customerFilters.getFilterValues() : {};
        
        // Build query options for export (fetch all)
        const options = {
            page: 1,
            ordering: currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`,
            show_inactive: true // Get all for export
        };
        
        // Add filters
        if (filterValues['search-filter']) {
            options.search = filterValues['search-filter'];
        }
        if (filterValues['is-active-filter']) {
            options.is_active = filterValues['is-active-filter'] === 'true';
        }
        if (filterValues['currency-filter']) {
            options.default_currency = filterValues['currency-filter'];
        }
        
        // Fetch all customers for export
        let allCustomers = [];
        let page = 1;
        let hasMore = true;
        
        while (hasMore) {
            const response = await listCustomers({ ...options, page });
            const results = response.results || [];
            allCustomers = [...allCustomers, ...results];
            
            if (response.next && results.length > 0) {
                page++;
            } else {
                hasMore = false;
            }
        }
        
        if (allCustomers.length === 0) {
            alert('Dışa aktarılacak müşteri bulunamadı');
            return;
        }
        
        // Store current table state
        const originalData = customersTable.options.data;
        const originalTotal = customersTable.options.totalItems;
        
        // Temporarily update table with all customers for export
        customersTable.options.data = allCustomers;
        customersTable.options.totalItems = allCustomers.length;
        
        // Use table component's export functionality
        customersTable.exportData('excel');
        
        // Restore original table state
        customersTable.options.data = originalData;
        customersTable.options.totalItems = originalTotal;
        
    } catch (error) {
        // Error exporting customers
        alert('Dışa aktarma sırasında hata oluştu');
        console.error('Export error:', error);
    } finally {
        // Reset loading state using table component's method
        if (customersTable) {
            customersTable.setExportLoading(false);
        }
    }
}

// Helper function for notifications
function showNotification(message, type = 'info') {
    // You can implement your own notification system here
    
    // Simple alert for now
    alert(`${type.toUpperCase()}: ${message}`);
}
