import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { 
    fetchSubcontractors, 
    createSubcontractor, 
    updateSubcontractor, 
    deleteSubcontractor 
} from '../../../../apis/subcontracting/subcontractors.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../../components/table/table.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { EditModal } from '../../../../components/edit-modal/edit-modal.js';
import { initRouteProtection } from '../../../../apis/routeProtection.js';
import { showNotification } from '../../../../components/notification/notification.js';
import { CURRENCY_OPTIONS } from '../../../../apis/projects/customers.js';

// Header component instance
let headerComponent;

// Statistics Cards component instance
let subcontractorsStats = null;

// Filters component instance
let subcontractorsFilters = null;

// Table component instance
let subcontractorsTable = null;

// Modal component instances
let createSubcontractorModal = null;
let editSubcontractorModal = null;
let deleteSubcontractorModal = null;

// State management
let currentPage = 1;
let currentSortField = 'name';
let currentSortDirection = 'asc';
let subcontractors = [];
let totalSubcontractors = 0;
let isLoading = false;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    
    // Initialize header component
    initHeaderComponent();
    
    // Initialize Statistics Cards component
    subcontractorsStats = new StatisticsCards('subcontractors-statistics', {
        cards: [
            { title: 'Toplam Taşeron', value: '0', icon: 'fas fa-building', color: 'primary', id: 'total-subcontractors-count' },
            { title: 'Aktif Taşeron', value: '0', icon: 'fas fa-check-circle', color: 'success', id: 'active-subcontractors-count' }
        ],
        compact: true,
        animation: true
    });
    
    // Initialize modal components
    initializeModalComponents();
    
    await initializeSubcontractors();
});

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Taşeron Yönetimi',
        subtitle: 'Taşeron listesi ve yönetimi',
        icon: 'users',
        showBackButton: 'block',
        showCreateButton: 'block',
        showRefreshButton: 'block',
        createButtonText: 'Yeni Taşeron',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/manufacturing/',
        onCreateClick: () => {
            showCreateSubcontractorModal();
        },
        onRefreshClick: async () => {
            // Reset to first page when refreshing
            currentPage = 1;
            await loadSubcontractors();
        }
    });
}

async function initializeSubcontractors() {
    try {
        initializeFiltersComponent();
        initializeTableComponent();
        
        await loadSubcontractors();
        updateSubcontractorCounts();
    } catch (error) {
        console.error('Error initializing subcontractors:', error);
        showNotification('Taşeronlar yüklenirken hata oluştu', 'error');
    }
}

function initializeTableComponent() {
    subcontractorsTable = new TableComponent('subcontractors-table-container', {
        title: 'Taşeron Listesi',
        columns: [
            {
                field: 'name',
                label: 'Firma Adı',
                sortable: true,
                formatter: (value) => `<strong>${value || '-'}</strong>`
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
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'phone',
                label: 'Telefon',
                sortable: false,
                formatter: (value) => value || '-'
            },
            {
                field: 'email',
                label: 'E-posta',
                sortable: false,
                formatter: (value) => value || '-'
            },
            {
                field: 'default_currency',
                label: 'Para Birimi',
                sortable: true,
                formatter: (value) => value || '-'
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
            currentPage = 1;
            await loadSubcontractors();
        },
        onExport: async (format) => {
            await exportSubcontractors(format);
        },
        onSort: async (field, direction) => {
            currentPage = 1;
            currentSortField = field;
            currentSortDirection = direction;
            await loadSubcontractors();
        },
        onPageSizeChange: async (newPageSize) => {
            if (subcontractorsTable) {
                subcontractorsTable.options.itemsPerPage = newPageSize;
            }
            currentPage = 1;
            await loadSubcontractors();
        },
        onPageChange: async (page) => {
            currentPage = page;
            await loadSubcontractors();
        },
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    editSubcontractor(row.id);
                }
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => showDeleteSubcontractorModal(row.id, row.name)
            }
        ],
        emptyMessage: 'Taşeron bulunamadı',
        emptyIcon: 'fas fa-building'
    });
}

function initializeFiltersComponent() {
    subcontractorsFilters = new FiltersComponent('filters-placeholder', {
        title: 'Taşeron Filtreleri',
        onApply: (values) => {
            currentPage = 1;
            loadSubcontractors();
        },
        onClear: () => {
            currentPage = 1;
            loadSubcontractors();
        }
    });

    subcontractorsFilters.addTextFilter({
        id: 'name-filter',
        label: 'Firma Adı',
        placeholder: 'Firma adı ara...',
        colSize: 4
    });

    subcontractorsFilters.addDropdownFilter({
        id: 'is-active-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        placeholder: 'Tümü',
        colSize: 4
    });
}

// Initialize modal components
function initializeModalComponents() {
    // Create Subcontractor Modal
    createSubcontractorModal = new EditModal('create-subcontractor-modal-container', {
        title: 'Yeni Taşeron Oluştur',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Taşeron Oluştur',
        size: 'lg'
    });

    // Edit Subcontractor Modal
    editSubcontractorModal = new EditModal('edit-subcontractor-modal-container', {
        title: 'Taşeron Düzenle',
        icon: 'fas fa-edit',
        saveButtonText: 'Değişiklikleri Kaydet',
        size: 'lg'
    });

    // Delete Subcontractor Modal
    deleteSubcontractorModal = new DisplayModal('delete-subcontractor-modal-container', {
        title: 'Taşeron Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        size: 'md',
        showEditButton: false
    });

    // Set up modal callbacks
    setupModalCallbacks();
}

function setupModalCallbacks() {
    createSubcontractorModal.onSaveCallback(async (formData) => {
        await createSubcontractorHandler(formData);
    });

    editSubcontractorModal.onSaveCallback(async (formData) => {
        await updateSubcontractorHandler(formData);
    });
}

async function loadSubcontractors() {
    try {
        if (isLoading) return;
        
        isLoading = true;
        if (subcontractorsTable) {
            subcontractorsTable.setLoading(true);
        }
        
        const filterValues = subcontractorsFilters ? subcontractorsFilters.getFilterValues() : {};
        
        const filters = {
            page: currentPage,
            page_size: subcontractorsTable ? subcontractorsTable.options.itemsPerPage : 20
        };
        
        if (filterValues['name-filter']) {
            filters.search = filterValues['name-filter'];
        }
        if (filterValues['is-active-filter']) {
            filters.is_active = filterValues['is-active-filter'] === 'true';
        }
        
        const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
        filters.ordering = orderingParam;
        
        const response = await fetchSubcontractors(filters);
        
        subcontractors = response.results || response || [];
        totalSubcontractors = response.count || response.total || subcontractors.length;
        
        if (subcontractorsTable) {
            subcontractorsTable.updateData(subcontractors, totalSubcontractors, currentPage);
        }
        
        updateSubcontractorCounts();
        
    } catch (error) {
        console.error('Error loading subcontractors:', error);
        showNotification(error.message || 'Taşeronlar yüklenirken hata oluştu', 'error');
        subcontractors = [];
        totalSubcontractors = 0;
        if (subcontractorsTable) {
            subcontractorsTable.updateData([], 0, currentPage);
        }
    } finally {
        isLoading = false;
        if (subcontractorsTable) {
            subcontractorsTable.setLoading(false);
        }
    }
}

function updateSubcontractorCounts() {
    const totalCount = subcontractors.length;
    const activeCount = subcontractors.filter(s => s.is_active === true).length;
    
    if (subcontractorsStats) {
        subcontractorsStats.updateValues({
            0: totalCount.toString(),
            1: activeCount.toString()
        });
    }
}

async function exportSubcontractors(format) {
    try {
        // Get all subcontractors without pagination
        const filters = {};
        const filterValues = subcontractorsFilters ? subcontractorsFilters.getFilterValues() : {};
        
        if (filterValues['name-filter']) {
            filters.search = filterValues['name-filter'];
        }
        if (filterValues['is-active-filter']) {
            filters.is_active = filterValues['is-active-filter'] === 'true';
        }
        
        filters.page_size = 10000; // Get all records
        
        const response = await fetchSubcontractors(filters);
        const allSubcontractors = response.results || response || [];
        
        if (format === 'csv') {
            const headers = ['Firma Adı', 'Kısa Ad', 'İletişim Kişisi', 'Telefon', 'E-posta', 'Adres', 'Vergi No', 'Vergi Dairesi', 'Banka Bilgisi', 'Para Birimi', 'Durum'];
            const rows = allSubcontractors.map(s => [
                s.name || '',
                s.short_name || '',
                s.contact_person || '',
                s.phone || '',
                s.email || '',
                s.address || '',
                s.tax_id || '',
                s.tax_office || '',
                s.bank_info || '',
                s.default_currency || '',
                s.is_active ? 'Aktif' : 'Pasif'
            ]);
            
            const csvContent = [headers, ...rows].map(row => 
                row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
            ).join('\n');
            
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `taseronlar_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
        }
        
        showNotification('Dışa aktarma başarılı', 'success');
    } catch (error) {
        console.error('Error exporting subcontractors:', error);
        showNotification('Dışa aktarma sırasında hata oluştu', 'error');
    }
}

function showCreateSubcontractorModal() {
    createSubcontractorModal.clearAll();
    
    createSubcontractorModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });
    
    createSubcontractorModal.addField({
        id: 'name',
        name: 'name',
        label: 'Firma Adı',
        type: 'text',
        value: '',
        required: true,
        icon: 'fas fa-building',
        colSize: 6
    });
    
    createSubcontractorModal.addField({
        id: 'short_name',
        name: 'short_name',
        label: 'Kısa Ad',
        type: 'text',
        value: '',
        icon: 'fas fa-tag',
        colSize: 6
    });
    
    createSubcontractorModal.addField({
        id: 'contact_person',
        name: 'contact_person',
        label: 'İletişim Kişisi',
        type: 'text',
        value: '',
        icon: 'fas fa-user',
        colSize: 6
    });
    
    createSubcontractorModal.addField({
        id: 'phone',
        name: 'phone',
        label: 'Telefon',
        type: 'text',
        value: '',
        icon: 'fas fa-phone',
        colSize: 6
    });
    
    createSubcontractorModal.addField({
        id: 'email',
        name: 'email',
        label: 'E-posta',
        type: 'email',
        value: '',
        icon: 'fas fa-envelope',
        colSize: 6
    });
    
    createSubcontractorModal.addField({
        id: 'default_currency',
        name: 'default_currency',
        label: 'Varsayılan Para Birimi',
        type: 'dropdown',
        value: 'TRY',
        options: CURRENCY_OPTIONS.map(c => ({ value: c.value, label: c.label })),
        icon: 'fas fa-money-bill-wave',
        colSize: 6
    });
    
    createSubcontractorModal.addSection({
        title: 'Adres ve Vergi Bilgileri',
        icon: 'fas fa-map-marker-alt',
        iconColor: 'text-success'
    });
    
    createSubcontractorModal.addField({
        id: 'address',
        name: 'address',
        label: 'Adres',
        type: 'textarea',
        value: '',
        icon: 'fas fa-map',
        colSize: 12
    });
    
    createSubcontractorModal.addField({
        id: 'tax_id',
        name: 'tax_id',
        label: 'Vergi No',
        type: 'text',
        value: '',
        icon: 'fas fa-id-card',
        colSize: 6
    });
    
    createSubcontractorModal.addField({
        id: 'tax_office',
        name: 'tax_office',
        label: 'Vergi Dairesi',
        type: 'text',
        value: '',
        icon: 'fas fa-landmark',
        colSize: 6
    });
    
    createSubcontractorModal.addSection({
        title: 'Banka ve Sözleşme Bilgileri',
        icon: 'fas fa-file-contract',
        iconColor: 'text-info'
    });
    
    createSubcontractorModal.addField({
        id: 'bank_info',
        name: 'bank_info',
        label: 'Banka Bilgisi',
        type: 'textarea',
        value: '',
        icon: 'fas fa-university',
        colSize: 12
    });
    
    createSubcontractorModal.addField({
        id: 'agreement_details',
        name: 'agreement_details',
        label: 'Sözleşme Detayları',
        type: 'textarea',
        value: '',
        icon: 'fas fa-file-signature',
        colSize: 12
    });
    
    createSubcontractorModal.addSection({
        title: 'Durum',
        icon: 'fas fa-toggle-on',
        iconColor: 'text-warning'
    });
    
    createSubcontractorModal.addField({
        id: 'is_active',
        name: 'is_active',
        label: 'Aktif',
        type: 'checkbox',
        value: true,
        icon: 'fas fa-check-circle',
        colSize: 12
    });
    
    createSubcontractorModal.render();
    createSubcontractorModal.show();
}

async function createSubcontractorHandler(formData) {
    try {
        const subcontractorData = {
            name: formData.name,
            short_name: formData.short_name || '',
            contact_person: formData.contact_person || '',
            phone: formData.phone || '',
            email: formData.email || '',
            address: formData.address || '',
            tax_id: formData.tax_id || '',
            tax_office: formData.tax_office || '',
            bank_info: formData.bank_info || '',
            agreement_details: formData.agreement_details || '',
            default_currency: formData.default_currency || 'TRY',
            is_active: formData.is_active !== undefined ? formData.is_active : true
        };
        
        await createSubcontractor(subcontractorData);
        showNotification('Taşeron başarıyla oluşturuldu', 'success');
        createSubcontractorModal.hide();
        await loadSubcontractors();
    } catch (error) {
        console.error('Error creating subcontractor:', error);
        showNotification(error.message || 'Taşeron oluşturulurken hata oluştu', 'error');
    }
}

async function editSubcontractor(subcontractorId) {
    try {
        const subcontractor = subcontractors.find(s => s.id === subcontractorId);
        if (!subcontractor) {
            showNotification('Taşeron bulunamadı', 'error');
            return;
        }
        
        editSubcontractorModal.clearAll();
        
        editSubcontractorModal.addSection({
            title: 'Temel Bilgiler',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });
        
        editSubcontractorModal.addField({
            id: 'edit-name',
            name: 'name',
            label: 'Firma Adı',
            type: 'text',
            value: subcontractor.name || '',
            required: true,
            icon: 'fas fa-building',
            colSize: 6
        });
        
        editSubcontractorModal.addField({
            id: 'edit-short_name',
            name: 'short_name',
            label: 'Kısa Ad',
            type: 'text',
            value: subcontractor.short_name || '',
            icon: 'fas fa-tag',
            colSize: 6
        });
        
        editSubcontractorModal.addField({
            id: 'edit-contact_person',
            name: 'contact_person',
            label: 'İletişim Kişisi',
            type: 'text',
            value: subcontractor.contact_person || '',
            icon: 'fas fa-user',
            colSize: 6
        });
        
        editSubcontractorModal.addField({
            id: 'edit-phone',
            name: 'phone',
            label: 'Telefon',
            type: 'text',
            value: subcontractor.phone || '',
            icon: 'fas fa-phone',
            colSize: 6
        });
        
        editSubcontractorModal.addField({
            id: 'edit-email',
            name: 'email',
            label: 'E-posta',
            type: 'email',
            value: subcontractor.email || '',
            icon: 'fas fa-envelope',
            colSize: 6
        });
        
        editSubcontractorModal.addField({
            id: 'edit-default_currency',
            name: 'default_currency',
            label: 'Varsayılan Para Birimi',
            type: 'dropdown',
            value: subcontractor.default_currency || 'TRY',
            options: CURRENCY_OPTIONS.map(c => ({ value: c.value, label: c.label })),
            icon: 'fas fa-money-bill-wave',
            colSize: 6
        });
        
        editSubcontractorModal.addSection({
            title: 'Adres ve Vergi Bilgileri',
            icon: 'fas fa-map-marker-alt',
            iconColor: 'text-success'
        });
        
        editSubcontractorModal.addField({
            id: 'edit-address',
            name: 'address',
            label: 'Adres',
            type: 'textarea',
            value: subcontractor.address || '',
            icon: 'fas fa-map',
            colSize: 12
        });
        
        editSubcontractorModal.addField({
            id: 'edit-tax_id',
            name: 'tax_id',
            label: 'Vergi No',
            type: 'text',
            value: subcontractor.tax_id || '',
            icon: 'fas fa-id-card',
            colSize: 6
        });
        
        editSubcontractorModal.addField({
            id: 'edit-tax_office',
            name: 'tax_office',
            label: 'Vergi Dairesi',
            type: 'text',
            value: subcontractor.tax_office || '',
            icon: 'fas fa-landmark',
            colSize: 6
        });
        
        editSubcontractorModal.addSection({
            title: 'Banka ve Sözleşme Bilgileri',
            icon: 'fas fa-file-contract',
            iconColor: 'text-info'
        });
        
        editSubcontractorModal.addField({
            id: 'edit-bank_info',
            name: 'bank_info',
            label: 'Banka Bilgisi',
            type: 'textarea',
            value: subcontractor.bank_info || '',
            icon: 'fas fa-university',
            colSize: 12
        });
        
        editSubcontractorModal.addField({
            id: 'edit-agreement_details',
            name: 'agreement_details',
            label: 'Sözleşme Detayları',
            type: 'textarea',
            value: subcontractor.agreement_details || '',
            icon: 'fas fa-file-signature',
            colSize: 12
        });
        
        editSubcontractorModal.addSection({
            title: 'Durum',
            icon: 'fas fa-toggle-on',
            iconColor: 'text-warning'
        });
        
        editSubcontractorModal.addField({
            id: 'edit-is_active',
            name: 'is_active',
            label: 'Aktif',
            type: 'checkbox',
            value: subcontractor.is_active !== undefined ? subcontractor.is_active : true,
            icon: 'fas fa-check-circle',
            colSize: 12
        });
        
        editSubcontractorModal.render();
        editSubcontractorModal.show();
        
        window.editingSubcontractorId = subcontractorId;
    } catch (error) {
        console.error('Error loading subcontractor for edit:', error);
        showNotification('Taşeron bilgileri yüklenirken hata oluştu', 'error');
    }
}

async function updateSubcontractorHandler(formData) {
    try {
        if (!window.editingSubcontractorId) {
            showNotification('Düzenlenecek taşeron bulunamadı', 'error');
            return;
        }
        
        const updateData = {
            name: formData.name,
            short_name: formData.short_name || '',
            contact_person: formData.contact_person || '',
            phone: formData.phone || '',
            email: formData.email || '',
            address: formData.address || '',
            tax_id: formData.tax_id || '',
            tax_office: formData.tax_office || '',
            bank_info: formData.bank_info || '',
            agreement_details: formData.agreement_details || '',
            default_currency: formData.default_currency || 'TRY',
            is_active: formData.is_active !== undefined ? formData.is_active : true
        };
        
        await updateSubcontractor(window.editingSubcontractorId, updateData);
        showNotification('Taşeron başarıyla güncellendi', 'success');
        editSubcontractorModal.hide();
        window.editingSubcontractorId = null;
        await loadSubcontractors();
    } catch (error) {
        console.error('Error updating subcontractor:', error);
        showNotification(error.message || 'Taşeron güncellenirken hata oluştu', 'error');
    }
}

async function showDeleteSubcontractorModal(subcontractorId, subcontractorName) {
    try {
        deleteSubcontractorModal.clearData();
        deleteSubcontractorModal.setTitle('Taşeron Silme Onayı');
        
        deleteSubcontractorModal.addSection({
            title: 'Onay',
            icon: 'fas fa-exclamation-triangle',
            iconColor: 'text-danger'
        });
        
        deleteSubcontractorModal.addField({
            id: 'delete-message',
            name: 'message',
            label: 'Mesaj',
            type: 'text',
            value: `"${subcontractorName}" adlı taşeronu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
            readonly: true,
            icon: 'fas fa-info-circle',
            colSize: 12
        });
        
        deleteSubcontractorModal.render();
        deleteSubcontractorModal.show();
        
        // Store the ID for deletion
        window.pendingDeleteSubcontractorId = subcontractorId;
        
        // Add delete button handler
        const deleteBtn = deleteSubcontractorModal.container.querySelector('.btn-danger');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                try {
                    await deleteSubcontractor(window.pendingDeleteSubcontractorId);
                    showNotification('Taşeron başarıyla silindi', 'success');
                    deleteSubcontractorModal.hide();
                    window.pendingDeleteSubcontractorId = null;
                    await loadSubcontractors();
                } catch (error) {
                    console.error('Error deleting subcontractor:', error);
                    showNotification(error.message || 'Taşeron silinirken hata oluştu', 'error');
                }
            };
        }
    } catch (error) {
        console.error('Error showing delete confirmation:', error);
        showNotification('Silme onayı gösterilirken hata oluştu', 'error');
    }
}
