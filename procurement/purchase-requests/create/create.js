import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { ItemsManager } from './itemsManager.js';
import { SuppliersManager } from './suppliersManager.js';
import { ComparisonManager } from './comparisonManager.js';
import { DataManager } from './dataManager.js';
import { ValidationManager } from './validationManager.js';
import { fetchCurrencyRates } from '../../../generic/formatters.js';
import { createPurchaseRequest, updatePurchaseRequest, submitPurchaseRequest, getPurchaseRequest, getPurchaseRequests } from '../../../generic/procurement.js';

// Global state
let headerComponent;
let itemsManager;
let suppliersManager;
let comparisonManager;
let dataManager;
let validationManager;

let requestData = {
    requestNumber: '',
    requestDate: '',
    requestor: '',
    title: '',
    description: '',
    priority: 'normal',
    items: [],
    suppliers: [],
    offers: {},
    recommendations: {},
    itemRecommendations: {}
};

// Edit mode state
let isEditMode = false;
let editingRequestId = null;

// Currency conversion rates - will be fetched from backend
let currencyRates = null;

// Currency symbols
const currencySymbols = {
    TRY: '₺',
    USD: '$',
    EUR: '€',
    GBP: '£'
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    
    if (!guardRoute()) {
        return;
    }

    initNavbar();
    
    initializeManagers();
    
    initializeHeader();
    
    // Load draft before rendering to ensure we don't double-attach
    const draftLoaded = dataManager.loadDraftData();
    
    // Fetch currency rates and then render everything
    currencyRates = await fetchCurrencyRates();
    updateComparisonManagerRates();
    
    // Initialize form field listeners
    initializeFormFieldListeners();
    
    // Now render all components with proper currency rates
    renderAll();
    
});



function initializeHeader() {
    const headerConfig = {
        title: isEditMode ? 'Satın Alma Talebi Düzenle' : 'Satın Alma Talebi Oluştur',
        subtitle: isEditMode ? 'Mevcut talebi düzenleyin ve gönderin' : 'Malzeme ve tedarikçi bilgilerini girin',
        icon: 'file-invoice',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'block',
        showExportButton: 'block',
        showRefreshButton: 'none',
        createButtonText: 'Taslak Kaydet',
        bulkCreateButtonText: 'Taslakları Görüntüle',
        exportButtonText: isEditMode ? 'Güncelle ve Gönder' : 'Gönder',
        onBackClick: () => {
            window.history.back();
        },
        onCreateClick: () => {
            saveDraftToBackend();
        },
        onBulkCreateClick: () => {
            showDraftRequestsModal();
        },
        onExportClick: () => {
            if (isEditMode) {
                updateAndSubmitRequest();
            } else {
                submitRequest();
            }
        }
    };
    
    headerComponent = new HeaderComponent(headerConfig);
}

function initializeManagers() {
    // Initialize data manager first
    dataManager = new DataManager(requestData);
    
    // Initialize validation manager
    validationManager = new ValidationManager();
    
    // Initialize other managers
    itemsManager = new ItemsManager(requestData, () => {
        dataManager.autoSave();
        renderAll();
    });
    
    suppliersManager = new SuppliersManager(requestData, () => {
        dataManager.autoSave();
        renderAll();
    }, currencySymbols);
    
    comparisonManager = new ComparisonManager(requestData, () => {
        dataManager.autoSave();
        renderAll();
    }, currencyRates, currencySymbols);
    
    // Make managers globally accessible for onclick handlers
    window.itemsManager = itemsManager;
    window.suppliersManager = suppliersManager;
    window.comparisonManager = comparisonManager;
    window.validationManager = validationManager;
}



async function populateRequestData(request) {
    // Populate request data
    requestData.requestNumber = request.request_number;
    requestData.requestDate = request.created_at;
    requestData.requestor = request.requestor;
    requestData.title = request.title || '';
    requestData.description = request.description || '';
    requestData.priority = request.priority || 'normal';
    
    // Load items
    requestData.items = request.request_items.map(item => ({
        id: item.item.id,
        purchase_request_item_id: item.id, // Add the purchase_request_item.id
        code: item.item.code,
        name: item.item.name,
        job_no: item.item.job_no || '',
        quantity: parseFloat(item.quantity),
        unit: item.item.unit,
        priority: item.priority,
        specifications: item.specifications || '',
        order: item.order
    }));
    
    // Load suppliers and offers
    requestData.suppliers = [];
    requestData.offers = {};
    requestData.recommendations = {};
    
    request.offers.forEach(offer => {
        const supplier = {
            id: offer.supplier.id,
            name: offer.supplier.name,
            contact_person: offer.supplier.contact_person || '',
            phone: offer.supplier.phone || '',
            email: offer.supplier.email || '',
            currency: offer.supplier.currency || 'TRY'
        };
        
        requestData.suppliers.push(supplier);
        
        // Load item offers for this supplier
        const supplierOffers = {};
        offer.item_offers.forEach(itemOffer => {
            // Find the item by matching the purchase_request_item.id
            const itemIndex = requestData.items.findIndex(item => 
                item.purchase_request_item_id === itemOffer.purchase_request_item
            );
            
            if (itemIndex !== -1) {
                supplierOffers[itemIndex] = {
                    unitPrice: parseFloat(itemOffer.unit_price),
                    totalPrice: parseFloat(itemOffer.total_price),
                    deliveryDays: itemOffer.delivery_days,
                    notes: itemOffer.notes || ''
                };
                
                // Check if this item is recommended for this supplier
                if (itemOffer.is_recommended) {
                    if (!requestData.itemRecommendations) {
                        requestData.itemRecommendations = {};
                    }
                    requestData.itemRecommendations[itemIndex] = supplier.id;
                }
            }
        });
        
        requestData.offers[supplier.id] = supplierOffers;
    });
    
    // Update the UI
    renderAll();
}

async function showDraftRequestsModal() {
    let requests = [];
    try {
        // Get current user for filtering
        let currentUser = null;
        try {
            const { getUser } = await import('../../../authService.js');
            currentUser = await getUser();
        } catch (error) {
            console.error('Error fetching current user:', error);
        }
        
        // Build API filters for current user and draft status
        const apiFilters = {
            status: 'draft'
        };
        
        // Add user filter (send user ID)
        if (currentUser && currentUser.id) {
            apiFilters.requestor = currentUser.id;
        }
        
        // Load draft requests with backend filtering
        const response = await getPurchaseRequests(apiFilters);
        // Ensure we have an array of requests
        if (Array.isArray(response)) {
            requests = response;
        } else if (response && Array.isArray(response.results)) {
            requests = response.results;
        } else {
            requests = [];
        }
        
        const tbody = document.getElementById('draft-requests-tbody');
        const emptyDiv = document.getElementById('draft-requests-empty');
        const table = document.getElementById('draft-requests-table');
        
        if (!requests || requests.length === 0) {
            table.style.display = 'none';
            emptyDiv.style.display = 'block';
        } else {
            table.style.display = 'table';
            emptyDiv.style.display = 'none';
            
            tbody.innerHTML = requests.map(request => `
                <tr>
                    <td>
                        <span class="fw-bold text-primary">${request.request_number}</span>
                    </td>
                    <td>${request.title || 'Başlıksız'}</td>
                    <td>${formatDate(request.created_at)}</td>
                    <td>${request.request_items?.length || 0}</td>
                    <td>${request.offers?.length || 0}</td>
                    <td>
                        <button class="btn btn-primary btn-sm" onclick="loadDraftRequest(${request.id})">
                            <i class="fas fa-edit me-1"></i>Düzenle
                        </button>
                    </td>
                </tr>
            `).join('');
        }
        
        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('draftRequestsModal'));
        modal.show();
        
    } catch (error) {
        console.error('Error loading draft requests:', error);
        showNotification('Taslak talepler yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

async function loadDraftRequest(requestId) {
    try {
        // Close the modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('draftRequestsModal'));
        modal.hide();
        
        // Set edit mode
        isEditMode = true;
        editingRequestId = requestId;
        
        // Update header
        initializeHeader();
        
        // Load the request data
        const request = await getPurchaseRequest(requestId);
        await populateRequestData(request);
        
        showNotification('Taslak talep yüklendi', 'success');
        
    } catch (error) {
        console.error('Error loading draft request:', error);
        showNotification('Taslak talep yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

function updateComparisonManagerRates() {
    if (comparisonManager && currencyRates) {
        comparisonManager.currencyRates = currencyRates;
        comparisonManager.renderComparisonTable();
        comparisonManager.updateSummary();
    }
}

function renderAll() {
    renderFormFields();
    itemsManager.renderItemsTable();
    suppliersManager.renderSuppliersContainer();
    
    // Only render comparison if currency rates are available
    if (currencyRates) {
        comparisonManager.renderComparisonTable();
        comparisonManager.updateSummary();
    }
    
    // Clear any existing validation states when re-rendering
    if (validationManager) {
        validationManager.clearAllFieldValidations();
    }
}

function renderFormFields() {
    // Set form field values from requestData
    const titleField = document.getElementById('request-title');
    const descriptionField = document.getElementById('request-description');
    const priorityField = document.getElementById('request-priority');
    
    if (titleField) titleField.value = requestData.title || '';
    if (descriptionField) descriptionField.value = requestData.description || '';
    if (priorityField) priorityField.value = requestData.priority || 'normal';
}

// Initialize form field event listeners (called only once)
function initializeFormFieldListeners() {
    const titleField = document.getElementById('request-title');
    const descriptionField = document.getElementById('request-description');
    const priorityField = document.getElementById('request-priority');
    
    if (titleField) {
        titleField.addEventListener('input', (e) => {
            requestData.title = e.target.value;
            dataManager.autoSave();
            // Show validation feedback on input
            const validation = validationManager.validateField('request-title', e.target.value);
            if (validation.isValid && e.target.value.trim() !== '') {
                validationManager.showFieldValidation('request-title', true, '');
            } else {
                validationManager.clearFieldValidation('request-title');
            }
        });
    }
    
    if (descriptionField) {
        descriptionField.addEventListener('input', (e) => {
            requestData.description = e.target.value;
            dataManager.autoSave();
            // Show validation feedback on input
            const validation = validationManager.validateField('request-description', e.target.value);
            if (validation.isValid && e.target.value.trim() !== '') {
                validationManager.showFieldValidation('request-description', true, '');
            } else {
                validationManager.clearFieldValidation('request-description');
            }
        });
    }
    
    if (priorityField) {
        priorityField.addEventListener('change', (e) => {
            requestData.priority = e.target.value;
            dataManager.autoSave();
        });
    }
    
    // Setup validation for form fields
    validationManager.setupAllFieldValidations();
    
    // Add blur validation for immediate feedback
    if (titleField) {
        titleField.addEventListener('blur', () => {
            const validation = validationManager.validateField('request-title', titleField.value);
            validationManager.showFieldValidation('request-title', validation.isValid, validation.message);
        });
    }
    
    if (descriptionField) {
        descriptionField.addEventListener('blur', () => {
            const validation = validationManager.validateField('request-description', descriptionField.value);
            validationManager.showFieldValidation('request-description', validation.isValid, validation.message);
        });
    }
}

async function updateAndSubmitRequest() {
    // Disable submit button to prevent multiple submissions
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Gönderiliyor...';
    }
    
    try {
        // Validate form fields using validation manager
        const formData = {
            'request-title': requestData.title || '',
            'request-description': requestData.description || ''
        };
        
        // Comprehensive validation using validation manager
        const validation = validationManager.validateAllData(
            formData, 
            requestData.items, 
            requestData.suppliers, 
            requestData.itemRecommendations,
            requestData.offers
        );
        
        if (!validation.isValid) {
            // Show field-specific validation errors for form fields
            const formErrorField = validationManager.showAllFieldValidations(formData);
            
            // Mark items without recommendations and offers visually and show errors on table
            const tableErrorElement = validationManager.markItemsWithoutRecommendations(requestData.items, requestData.itemRecommendations, requestData.offers, requestData.suppliers);
            
            // Scroll to the first error
            validationManager.scrollToFirstError(formErrorField, tableErrorElement);
            
            // Re-enable submit button after validation failure
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Gönder';
            }
            return;
        }
        
        // Convert itemRecommendations to recommendations format
        const recommendations = {};
        if (requestData.itemRecommendations) {
            Object.keys(requestData.itemRecommendations).forEach(itemIndex => {
                const recommendedSupplierId = requestData.itemRecommendations[itemIndex];
                if (recommendedSupplierId) {
                    recommendations[itemIndex] = recommendedSupplierId;
                }
            });
        }
        
        // Prepare data for backend
        const submitData = {
            title: requestData.title.trim(),
            description: requestData.description.trim(),
            priority: requestData.priority || 'normal',
            items: requestData.items,
            suppliers: requestData.suppliers,
            offers: requestData.offers,
            recommendations: recommendations
        };
        
        // Update the existing purchase request
        const result = await updatePurchaseRequest(editingRequestId, submitData);
        
        // Submit the request (change status from draft to submitted)
        await submitPurchaseRequest(editingRequestId);
        
        showNotification('Talep başarıyla güncellendi ve gönderildi!', 'success');
        
        // Redirect back to the pending requests page
        setTimeout(() => {
            window.location.href = '/procurement/purchase-requests/pending/';
        }, 1500);
        
    } catch (error) {
        console.error('Update and submission error:', error);
        showNotification('Talep güncellenirken hata oluştu: ' + error.message, 'error');
        
        // Re-enable submit button on error
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Gönder';
        }
    }
}

async function saveDraftToBackend() {
    // Basic validation for draft saving
    const formData = {
        'request-title': requestData.title || '',
        'request-description': requestData.description || ''
    };
    
    // Validate form fields and basic requirements for draft
    const formValidation = validationManager.validateAllFields(formData);
    const itemsValidation = validationManager.validateItems(requestData.items);
    const suppliersValidation = validationManager.validateSuppliers(requestData.suppliers);
    
    if (!formValidation.isValid) {
        validationManager.showAllFieldValidations(formData);
        showNotification('Lütfen form alanlarındaki hataları düzeltin', 'error');
        return;
    }
    
    if (!itemsValidation.isValid) {
        showNotification('Lütfen malzeme bilgilerindeki hataları düzeltin:\n' + itemsValidation.errors.join('\n'), 'error');
        return;
    }
    
    if (!suppliersValidation.isValid) {
        showNotification('Lütfen tedarikçi bilgilerindeki hataları düzeltin:\n' + suppliersValidation.errors.join('\n'), 'error');
        return;
    }
    
    try {
        // Convert itemRecommendations to recommendations format
        const recommendations = {};
        if (requestData.itemRecommendations) {
            Object.keys(requestData.itemRecommendations).forEach(itemIndex => {
                const recommendedSupplierId = requestData.itemRecommendations[itemIndex];
                if (recommendedSupplierId) {
                    recommendations[itemIndex] = recommendedSupplierId;
                }
            });
        }
        
        // Prepare data for backend
        const draftData = {
            title: requestData.title || 'Malzeme Satın Alma Talebi',
            description: requestData.description || 'Proje için gerekli malzemeler',
            priority: requestData.priority || 'normal',
            items: requestData.items,
            suppliers: requestData.suppliers,
            offers: requestData.offers,
            recommendations: recommendations
        };
        
        // Create purchase request as draft (no submit call)
        const result = await createPurchaseRequest(draftData);
        
        showNotification('Taslak başarıyla kaydedildi!', 'success');
        
        // Clear local draft after successful backend save
        dataManager.clearDraft();
        
    } catch (error) {
        console.error('Draft save error:', error);
        showNotification('Taslak kaydedilirken hata oluştu: ' + error.message, 'error');
    }
}

async function submitRequest() {
    // Disable submit button to prevent multiple submissions
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Gönderiliyor...';
    }
    
    try {
        // Validate form fields using validation manager
        const formData = {
            'request-title': requestData.title || '',
            'request-description': requestData.description || ''
        };
        
        // Comprehensive validation using validation manager
        const validation = validationManager.validateAllData(
            formData, 
            requestData.items, 
            requestData.suppliers, 
            requestData.itemRecommendations,
            requestData.offers
        );
        
        if (!validation.isValid) {
            console.log(validation);
            // Show field-specific validation errors for form fields
            const formErrorField = validationManager.showAllFieldValidations(formData);
            
            // Mark items without recommendations and offers visually and show errors on table
            const tableErrorElement = validationManager.markItemsWithoutRecommendations(requestData.items, requestData.itemRecommendations, requestData.offers, requestData.suppliers);
            
            // Scroll to the first error
            validationManager.scrollToFirstError(formErrorField, tableErrorElement);
            
            // Re-enable submit button after validation failure
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Gönder';
            }
            return;
        }
        
        // Convert itemRecommendations to recommendations format
        const recommendations = {};
        if (requestData.itemRecommendations) {
            Object.keys(requestData.itemRecommendations).forEach(itemIndex => {
                const recommendedSupplierId = requestData.itemRecommendations[itemIndex];
                if (recommendedSupplierId) {
                    recommendations[itemIndex] = recommendedSupplierId;
                }
            });
        }
        
        // Prepare data for backend
        const submitData = {
            title: requestData.title.trim(),
            description: requestData.description.trim(),
            priority: requestData.priority || 'normal',
            items: requestData.items,
            suppliers: requestData.suppliers,
            offers: requestData.offers,
            recommendations: recommendations
        };
        
        // Create purchase request using generic function
        const result = await createPurchaseRequest(submitData);
        
        // Submit the request (change status from draft to submitted)
        await submitPurchaseRequest(result.id);
        
        showNotification('Talep başarıyla gönderildi!', 'success');
        
        // Clear draft after successful submission
        dataManager.clearDraft();
        
        // Reset the form
        requestData = {
            requestNumber: '',
            requestDate: '',
            requestor: '',
            title: '',
            description: '',
            priority: 'normal',
            items: [],
            suppliers: [],
            offers: {},
            recommendations: {},
            itemRecommendations: {}
        };
        
        renderAll();
        
        // Clear validation states after successful submission
        if (validationManager) {
            validationManager.clearAllFieldValidations();
        }
        
    } catch (error) {
        console.error('Submission error:', error);
        showNotification('Talep gönderilirken hata oluştu: ' + error.message, 'error');
        
        // Re-enable submit button on error
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Gönder';
        }
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
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

// Export functions for potential external use
window.purchaseRequestApp = {
    getData: () => requestData,
    exportData: () => dataManager.exportData(),
    importData: (file) => dataManager.importData(file),
    clearData: () => {
        requestData = {
            requestNumber: '',
            requestDate: '',
            requestor: '',
            title: '',
            description: '',
            priority: 'normal',
            items: [],
            suppliers: [],
            offers: {},
            recommendations: {},
            itemRecommendations: {}
        };
        renderAll();
        dataManager.clearDraft();
        // Clear validation states when clearing data
        if (validationManager) {
            validationManager.clearAllFieldValidations();
        }
    }
};

// Make functions globally available for onclick handlers
window.loadDraftRequest = loadDraftRequest;
