import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { TableComponent } from '../../../../components/table/table.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { EditModal } from '../../../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../../../components/confirmation-modal/confirmation-modal.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { getItems, updateItem, deleteItem as deleteItemAPI, getItemPurchaseRequests, getItemPlanningRequests } from '../../../../apis/procurement.js';

// State management
let currentPage = 1;
let currentSortField = 'code';
let currentSortDirection = 'asc';
let items = [];
let totalItems = 0;
let isLoading = false;
let inventoryCardsTable = null;
let inventoryCardsFilters = null;
let currentFilters = {};
let editItemModal = null;
let deleteItemModal = null;
let purchaseRequestsModal = null;
let planningRequestsModal = null;
let purchaseRequestsTable = null;
let planningRequestsTable = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();

    // Initialize header component
    const header = new HeaderComponent({
        title: 'Stok Kartları',
        subtitle: 'Stok kartları listesi ve yönetimi',
        icon: 'boxes',
        showBackButton: 'block',
        showCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/planning/inventory',
        onRefreshClick: () => loadItems(1)
    });

    // Initialize filters component
    initializeFilters();

    // Initialize table component
    initializeTable();

    // Initialize modals
    initializeModals();

    // Load initial data - ensure we start at page 1
    currentPage = 1;
    await loadItems(1);
});

// Initialize filters component
function initializeFilters() {
    inventoryCardsFilters = new FiltersComponent('inventory-cards-filters-placeholder', {
        title: 'Stok Kartları Filtreleri',
        onApply: (values) => {
            currentFilters = values;
            loadItems(1);
        },
        onClear: () => {
            currentFilters = {};
            loadItems(1);
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add code filter with type selector
    inventoryCardsFilters.addTextFilter({
        id: 'code-filter',
        label: 'Ürün Kodu',
        placeholder: 'Ürün kodu ara...',
        colSize: 2
    });

    inventoryCardsFilters.addSelectFilter({
        id: 'code-filter-type',
        label: 'Filtre Tipi',
        placeholder: 'Tip seçin',
        options: [
            { value: 'icontains', label: 'İçerir (varsayılan)' },
            { value: 'startswith', label: 'İle Başlar' },
            { value: 'exact', label: 'Tam Eşleşme' }
        ],
        value: 'icontains',
        colSize: 1
    });

    // Add name filter with type selector
    inventoryCardsFilters.addTextFilter({
        id: 'name-filter',
        label: 'Ürün Adı',
        placeholder: 'Ürün adı ara...',
        colSize: 2
    });

    inventoryCardsFilters.addSelectFilter({
        id: 'name-filter-type',
        label: 'Filtre Tipi',
        placeholder: 'Tip seçin',
        options: [
            { value: 'icontains', label: 'İçerir (varsayılan)' },
            { value: 'startswith', label: 'İle Başlar' }
        ],
        value: 'icontains',
        colSize: 1
    });

    // Add item type filter
    inventoryCardsFilters.addSelectFilter({
        id: 'item-type-filter',
        label: 'Ürün Tipi',
        placeholder: 'Tümü',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'stock', label: 'Stok' },
            { value: 'expenditure', label: 'Masraf' },
            { value: 'subcontracting', label: 'Alt Yüklenici' }
        ],
        value: '',
        colSize: 2
    });

}

// Initialize modals
function initializeModals() {
    // Initialize edit item modal
    editItemModal = new EditModal('edit-item-modal-container', {
        title: 'Stok Kartı Düzenle',
        icon: 'fas fa-edit',
        saveButtonText: 'Kaydet',
        size: 'lg'
    });

    // Set up edit modal save callback
    editItemModal.onSaveCallback(async (formData) => {
        try {
            const itemId = window.currentEditingItemId;
            if (!itemId) {
                showNotification('Düzenlenecek stok kartı bulunamadı', 'error');
                return;
            }

            await updateItem(itemId, formData);
            showNotification('Stok kartı başarıyla güncellendi', 'success');
            editItemModal.hide();
            window.currentEditingItemId = null;
            await loadItems(currentPage);
        } catch (error) {
            console.error('Error updating item:', error);
            showNotification('Stok kartı güncellenirken hata oluştu: ' + error.message, 'error');
        }
    });

    // Initialize delete item modal
    deleteItemModal = new ConfirmationModal('delete-item-modal-container', {
        title: 'Stok Kartını Sil',
        icon: 'fas fa-trash-alt',
        message: 'Bu stok kartını silmek istediğinizden emin misiniz?',
        confirmText: 'Evet, Sil',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-danger'
    });

    // Set up delete modal confirm callback
    deleteItemModal.setOnConfirm(async () => {
        try {
            const itemId = window.currentDeletingItemId;
            if (!itemId) {
                showNotification('Silinecek stok kartı bulunamadı', 'error');
                return;
            }

            await deleteItemAPI(itemId);
            showNotification('Stok kartı başarıyla silindi', 'success');
            deleteItemModal.hide();
            window.currentDeletingItemId = null;
            await loadItems(currentPage);
        } catch (error) {
            console.error('Error deleting item:', error);
            showNotification('Stok kartı silinirken hata oluştu: ' + error.message, 'error');
        }
    });

    // Initialize purchase requests modal
    purchaseRequestsModal = new DisplayModal('purchase-requests-modal-container', {
        title: 'Satın Alma Talepleri',
        icon: 'fas fa-shopping-cart',
        showEditButton: false,
        size: 'xl'
    });

    // Initialize planning requests modal
    planningRequestsModal = new DisplayModal('planning-requests-modal-container', {
        title: 'Planlama Talepleri',
        icon: 'fas fa-calendar-alt',
        showEditButton: false,
        size: 'xl'
    });
}

// Initialize table component
function initializeTable() {
    inventoryCardsTable = new TableComponent('inventory-cards-table-container', {
        title: 'Stok Kartları',
        icon: 'fas fa-boxes',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'code',
                label: 'Ürün Kodu',
                sortable: true,
                formatter: (value) => `
                    <div style="font-weight: 600; color: #2c3e50;">
                        <i class="fas fa-barcode me-2 text-muted"></i>
                        ${value || '-'}
                    </div>
                `
            },
            {
                field: 'name',
                label: 'Ürün Adı',
                sortable: true,
                formatter: (value) => `
                    <div style="font-weight: 500; color: #495057;">
                        ${value || '-'}
                    </div>
                `
            },
            {
                field: 'unit_label',
                label: 'Birim',
                sortable: true,
                formatter: (value, row) => {
                    const unitLabel = row.unit_label || row.unit || value || '-';
                    if (unitLabel === '-') return unitLabel;
                    return `<span class="badge bg-secondary">${unitLabel}</span>`;
                }
            },
            {
                field: 'item_type_label',
                label: 'Tip',
                sortable: true,
                formatter: (value, row) => {
                    const typeLabel = row.item_type_label || row.item_type || value || '-';
                    if (typeLabel === '-') return typeLabel;
                    return `<span class="badge bg-info">${typeLabel}</span>`;
                }
            },
            {
                field: 'stock_quantity',
                label: 'Stok Miktarı',
                sortable: true,
                formatter: (value) => {
                    if (value === null || value === undefined) return '-';
                    const numValue = parseFloat(value);
                    return `
                        <div style="font-weight: 500; color: ${numValue > 0 ? '#198754' : '#dc3545'};">
                            ${numValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    `;
                }
            }
        ],
        data: [],
        pagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        serverSidePagination: true,
        sortable: true,
        onPageChange: (page) => {
            currentPage = page;
            loadItems(page);
        },
        onSort: (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            loadItems(currentPage);
        },
        onRowClick: (row) => {
            // Optional: Handle row click
            console.log('Row clicked:', row);
        },
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    editItem(row);
                }
            },
            {
                key: 'purchase-requests',
                label: 'Satın Alma Talepleri',
                icon: 'fas fa-shopping-cart',
                class: 'btn-outline-info',
                onClick: (row) => {
                    showPurchaseRequests(row);
                }
            },
            {
                key: 'planning-requests',
                label: 'Planlama Talepleri',
                icon: 'fas fa-calendar-alt',
                class: 'btn-outline-success',
                onClick: (row) => {
                    showPlanningRequests(row);
                }
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => {
                    deleteItem(row);
                }
            }
        ]
    });
}

// Load items from API
async function loadItems(page = 1) {
    if (isLoading) return;
    
    isLoading = true;
    // Ensure page is at least 1
    currentPage = Math.max(1, page);

    try {
        // Show loading state
        if (inventoryCardsTable) {
            inventoryCardsTable.setLoading(true);
        }

        // Build filters object for API
        const apiFilters = {
            page: currentPage,
            page_size: 20
        };
        
        // Add code filter with appropriate lookup type
        if (currentFilters['code-filter']) {
            const codeFilterType = currentFilters['code-filter-type'] || 'icontains';
            if (codeFilterType === 'exact') {
                apiFilters['code__exact'] = currentFilters['code-filter'];
            } else if (codeFilterType === 'startswith') {
                apiFilters['code__startswith'] = currentFilters['code-filter'];
            } else {
                // icontains (default) - use code parameter
                apiFilters.code = currentFilters['code-filter'];
            }
        }
        
        // Add name filter with appropriate lookup type
        if (currentFilters['name-filter']) {
            const nameFilterType = currentFilters['name-filter-type'] || 'icontains';
            if (nameFilterType === 'startswith') {
                apiFilters['name__startswith'] = currentFilters['name-filter'];
            } else {
                // icontains (default) - use name parameter
                apiFilters.name = currentFilters['name-filter'];
            }
        }
        
        // Add item type filter
        if (currentFilters['item-type-filter']) {
            apiFilters.item_type = currentFilters['item-type-filter'];
        }
        
        // Add ordering
        const sortPrefix = currentSortDirection === 'desc' ? '-' : '';
        apiFilters.ordering = `${sortPrefix}${currentSortField}`;

        // Fetch items using the API function with filters
        const data = await getItems(apiFilters);
        
        // Handle paginated response
        if (data.results) {
            items = data.results;
            totalItems = data.count || 0;
        } else if (Array.isArray(data)) {
            // Handle non-paginated response (fallback)
            items = data;
            totalItems = data.length;
        } else {
            items = [];
            totalItems = 0;
        }

        // Update table - use currentPage which is already validated
        if (inventoryCardsTable) {
            inventoryCardsTable.updateData(items, totalItems, currentPage);
        }

    } catch (error) {
        console.error('Error loading items:', error);
        showNotification('Stok kartları yüklenirken hata oluştu: ' + error.message, 'error');
        
        if (inventoryCardsTable) {
            inventoryCardsTable.updateData([], 0, 1);
        }
    } finally {
        isLoading = false;
        if (inventoryCardsTable) {
            inventoryCardsTable.setLoading(false);
        }
    }
}

// Show notification helper function
function showNotification(message, type = 'info', timeout = 5000) {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.custom-notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `custom-notification alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = `
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 350px;
        backdrop-filter: blur(15px);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 15px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        animation: slideInRight 0.5s ease-out;
    `;
    
    const iconClass = type === 'error' ? 'exclamation-triangle' : 
                     type === 'success' ? 'check-circle' : 
                     type === 'warning' ? 'exclamation-circle' : 'info-circle';
    
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-${iconClass} me-3" style="font-size: 1.2rem;"></i>
            <div class="flex-grow-1">
                <strong>${type === 'error' ? 'Hata' : type === 'success' ? 'Başarılı' : type === 'warning' ? 'Uyarı' : 'Bilgi'}</strong>
                <br>
                <span>${message}</span>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after timeout
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, timeout);
    
    // Return the notification element for manual removal
    return notification;
}

// Edit item handler
function editItem(item) {
    // Store the item ID for the save callback
    window.currentEditingItemId = item.id;

    // Clear and configure the edit modal
    editItemModal.clearAll();

    // Add basic information section
    editItemModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    // Add fields with current values
    editItemModal.addField({
        id: 'edit-item-code',
        name: 'code',
        label: 'Ürün Kodu',
        type: 'text',
        placeholder: 'Ürün kodunu girin',
        required: true,
        icon: 'fas fa-barcode',
        colSize: 6,
        value: item.code || ''
    });

    editItemModal.addField({
        id: 'edit-item-name',
        name: 'name',
        label: 'Ürün Adı',
        type: 'text',
        placeholder: 'Ürün adını girin',
        required: true,
        icon: 'fas fa-box',
        colSize: 6,
        value: item.name || ''
    });

    // Map unit to lowercase for dropdown value (API might return uppercase)
    const unitChoices = [
        { value: 'adet', label: 'Adet' },
        { value: 'kg', label: 'KG' },
        { value: 'metre', label: 'Metre' },
        { value: 'litre', label: 'Litre' },
        { value: 'paket', label: 'Paket' },
        { value: 'kutu', label: 'Kutu' }
    ];
    
    // Find the correct unit value (handle case-insensitive matching)
    const currentUnit = item.unit ? item.unit.toLowerCase() : '';
    const selectedUnitValue = unitChoices.find(choice => choice.value === currentUnit)?.value || currentUnit || '';

    editItemModal.addField({
        id: 'edit-item-unit',
        name: 'unit',
        label: 'Birim',
        type: 'select',
        placeholder: 'Birim seçin...',
        icon: 'fas fa-ruler',
        colSize: 6,
        options: unitChoices,
        value: selectedUnitValue
    });

    // Item type choices
    const itemTypeChoices = [
        { value: 'stock', label: 'Stok' },
        { value: 'expenditure', label: 'Masraf' },
        { value: 'subcontracting', label: 'Alt Yüklenici' }
    ];

    editItemModal.addField({
        id: 'edit-item-type',
        name: 'item_type',
        label: 'Ürün Tipi',
        type: 'select',
        placeholder: 'Ürün tipi seçin...',
        required: true,
        icon: 'fas fa-tags',
        colSize: 6,
        options: itemTypeChoices,
        value: item.item_type || 'stock'
    });

    editItemModal.addField({
        id: 'edit-item-stock-quantity',
        name: 'stock_quantity',
        label: 'Stok Miktarı',
        type: 'number',
        placeholder: 'Stok miktarını girin',
        step: '0.01',
        icon: 'fas fa-cubes',
        colSize: 6,
        value: item.stock_quantity || 0
    });

    // Render and show modal
    editItemModal.render();
    editItemModal.show();
}

// Delete item handler
function deleteItem(item) {
    // Store the item ID for the confirm callback
    window.currentDeletingItemId = item.id;

    // Update the delete modal message with item details
    const itemName = item.name || item.code || 'Bu stok kartı';
    deleteItemModal.updateMessage(`${itemName} adlı stok kartını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz!`);

    // Show the delete confirmation modal
    deleteItemModal.show();
}

// Show purchase requests for an item
async function showPurchaseRequests(item) {
    try {
        purchaseRequestsModal.setLoading(true);
        purchaseRequestsModal.clearData();
        purchaseRequestsModal.setTitle(`Satın Alma Talepleri - ${item.name || item.code}`);
        
        // Add table container to modal
        purchaseRequestsModal.addCustomSection({
            title: 'Satın Alma Talepleri',
            icon: 'fas fa-shopping-cart',
            iconColor: 'text-primary',
            customContent: '<div id="purchase-requests-table-container-modal"></div>'
        });
        
        purchaseRequestsModal.render();
        purchaseRequestsModal.show();

        const requests = await getItemPurchaseRequests(item.id);

        // Destroy existing table if it exists
        if (purchaseRequestsTable) {
            const container = document.getElementById('purchase-requests-table-container-modal');
            if (container) {
                container.innerHTML = '';
            }
        }

        // Initialize table
        purchaseRequestsTable = new TableComponent('purchase-requests-table-container-modal', {
                title: '',
                columns: [
                    {
                        field: 'request_number',
                        label: 'Talep No',
                        sortable: true,
                        formatter: (value) => `
                            <div style="font-weight: 600; color: #2c3e50;">
                                ${value || '-'}
                            </div>
                        `
                    },
                    {
                        field: 'title',
                        label: 'Başlık',
                        sortable: true,
                        formatter: (value) => `
                            <div style="font-weight: 500; color: #495057;">
                                ${value || '-'}
                            </div>
                        `
                    },
                    {
                        field: 'status_label',
                        label: 'Durum',
                        sortable: true,
                        formatter: (value, row) => {
                            const status = value || row.status || '-';
                            return `<span class="badge bg-info">${status}</span>`;
                        }
                    },
                    {
                        field: 'priority',
                        label: 'Öncelik',
                        sortable: true,
                        formatter: (value) => value || '-'
                    },
                    {
                        field: 'requestor',
                        label: 'Talep Eden',
                        sortable: true,
                        formatter: (value) => value || '-'
                    },
                    {
                        field: 'created_at',
                        label: 'Oluşturulma',
                        sortable: true,
                        formatter: (value) => {
                            if (!value) return '-';
                            return new Date(value).toLocaleDateString('tr-TR');
                        }
                    },
                    {
                        field: 'item_details.quantity',
                        label: 'Miktar',
                        sortable: false,
                        formatter: (value, row) => {
                            const quantity = row.item_details?.quantity;
                            return quantity !== undefined && quantity !== null ? quantity : '-';
                        }
                    },
                    {
                        field: 'total_amount_eur',
                        label: 'Toplam Tutar',
                        sortable: true,
                        formatter: (value) => {
                            if (!value) return '-';
                            const amount = parseFloat(value);
                            return `
                                <div style="font-weight: 500; color: #198754;">
                                    ${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                </div>
                            `;
                        }
                    }
                ],
                data: [],
                pagination: true,
                itemsPerPage: 20,
                currentPage: 1,
                totalItems: 0,
                serverSidePagination: false,
                sortable: true,
                emptyMessage: 'Satın alma talebi bulunmamaktadır',
                emptyIcon: 'fas fa-shopping-cart'
            });

        // Update table with data
        purchaseRequestsTable.updateData(requests || [], requests?.length || 0, 1);
        purchaseRequestsModal.setLoading(false);
    } catch (error) {
        console.error('Error loading purchase requests:', error);
        showNotification('Satın alma talepleri yüklenirken hata oluştu: ' + error.message, 'error');
        purchaseRequestsModal.setLoading(false);
        purchaseRequestsModal.hide();
    }
}

// Show planning requests for an item
async function showPlanningRequests(item) {
    try {
        planningRequestsModal.setLoading(true);
        planningRequestsModal.clearData();
        planningRequestsModal.setTitle(`Planlama Talepleri - ${item.name || item.code}`);
        
        // Add table container to modal
        planningRequestsModal.addCustomSection({
            title: 'Planlama Talepleri',
            icon: 'fas fa-calendar-alt',
            iconColor: 'text-success',
            customContent: '<div id="planning-requests-table-container-modal"></div>'
        });
        
        planningRequestsModal.render();
        planningRequestsModal.show();

        const requests = await getItemPlanningRequests(item.id);

        // Destroy existing table if it exists
        if (planningRequestsTable) {
            const container = document.getElementById('planning-requests-table-container-modal');
            if (container) {
                container.innerHTML = '';
            }
        }

        // Initialize table
        planningRequestsTable = new TableComponent('planning-requests-table-container-modal', {
                title: '',
                columns: [
                    {
                        field: 'request_number',
                        label: 'Talep No',
                        sortable: true,
                        formatter: (value) => `
                            <div style="font-weight: 600; color: #2c3e50;">
                                ${value || '-'}
                            </div>
                        `
                    },
                    {
                        field: 'title',
                        label: 'Başlık',
                        sortable: true,
                        formatter: (value) => `
                            <div style="font-weight: 500; color: #495057;">
                                ${value || '-'}
                            </div>
                        `
                    },
                    {
                        field: 'status_label',
                        label: 'Durum',
                        sortable: true,
                        formatter: (value, row) => {
                            const status = value || row.status || '-';
                            return `<span class="badge bg-success">${status}</span>`;
                        }
                    },
                    {
                        field: 'priority',
                        label: 'Öncelik',
                        sortable: true,
                        formatter: (value) => value || '-'
                    },
                    {
                        field: 'requestor',
                        label: 'Talep Eden',
                        sortable: true,
                        formatter: (value) => value || '-'
                    },
                    {
                        field: 'created_at',
                        label: 'Oluşturulma',
                        sortable: true,
                        formatter: (value) => {
                            if (!value) return '-';
                            return new Date(value).toLocaleDateString('tr-TR');
                        }
                    },
                    {
                        field: 'needed_date',
                        label: 'İhtiyaç Tarihi',
                        sortable: true,
                        formatter: (value) => {
                            if (!value) return '-';
                            return new Date(value).toLocaleDateString('tr-TR');
                        }
                    },
                    {
                        field: 'item_details.job_no',
                        label: 'İş No',
                        sortable: false,
                        formatter: (value, row) => {
                            const jobNo = row.item_details?.job_no;
                            return jobNo || '-';
                        }
                    },
                    {
                        field: 'item_details.quantity',
                        label: 'Miktar',
                        sortable: false,
                        formatter: (value, row) => {
                            const quantity = row.item_details?.quantity;
                            return quantity !== undefined && quantity !== null ? quantity : '-';
                        }
                    }
                ],
                data: [],
                pagination: true,
                itemsPerPage: 20,
                currentPage: 1,
                totalItems: 0,
                serverSidePagination: false,
                sortable: true,
                emptyMessage: 'Planlama talebi bulunmamaktadır',
                emptyIcon: 'fas fa-calendar-alt'
            });

        // Update table with data
        planningRequestsTable.updateData(requests || [], requests?.length || 0, 1);
        planningRequestsModal.setLoading(false);
    } catch (error) {
        console.error('Error loading planning requests:', error);
        showNotification('Planlama talepleri yüklenirken hata oluştu: ' + error.message, 'error');
        planningRequestsModal.setLoading(false);
        planningRequestsModal.hide();
    }
}

