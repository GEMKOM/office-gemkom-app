import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { ItemsManager } from './itemsManager.js';
import { SuppliersManager } from './suppliersManager.js';
import { ComparisonManager } from './comparisonManager.js';
import { DataManager } from './dataManager.js';
import { ValidationManager } from './validationManager.js';
import { fetchCurrencyRates } from '../../../generic/formatters.js';
import { createPurchaseRequest, submitPurchaseRequest, savePurchaseRequestDraft, getPurchaseRequestDrafts, deletePurchaseRequestDraft, getPurchaseRequestDraft } from '../../../generic/procurement.js';

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
    needed_date: new Date().toISOString().split('T')[0], // Set today's date as default
    items: [],
    suppliers: [],
    offers: {},
    recommendations: {},
    itemRecommendations: {}
};



// Currency conversion rates - will be fetched from backend
let currencyRates = null;

// Currency symbols
const currencySymbols = {
    TRY: '₺',
    USD: '$',
    EUR: '€',
    GBP: '£'
};

// Function to transform suppliers data for backend submission (remove default_ prefix)
function transformSuppliersForSubmission(suppliers) {
    return suppliers.map(supplier => {
        const transformedSupplier = { ...supplier };
        
        // Transform default_currency to currency
        if (transformedSupplier.default_currency) {
            transformedSupplier.currency = transformedSupplier.default_currency;
            delete transformedSupplier.default_currency;
        }
        
        // Transform default_payment_terms to payment_terms_id (integer)
        if (transformedSupplier.default_payment_terms) {
            // Convert to integer if it's a string, or keep as is if it's already a number
            const paymentTermsId = typeof transformedSupplier.default_payment_terms === 'string' 
                ? parseInt(transformedSupplier.default_payment_terms, 10) 
                : transformedSupplier.default_payment_terms;
            
            transformedSupplier.payment_terms_id = paymentTermsId;
            delete transformedSupplier.default_payment_terms;
        }
        
        // Transform default_tax_rate to tax_rate
        if (transformedSupplier.default_tax_rate) {
            transformedSupplier.tax_rate = transformedSupplier.default_tax_rate;
            delete transformedSupplier.default_tax_rate;
        }
        
        return transformedSupplier;
    });
}

// Function to calculate total amount in EUR from recommended suppliers
function calculateTotalAmountEUR() {
    if (!currencyRates) {
        return 0;
    }
    
    let totalAmount = 0;
    if (requestData.itemRecommendations) {
        Object.keys(requestData.itemRecommendations).forEach(itemIndex => {
            const recommendedSupplierId = requestData.itemRecommendations[itemIndex];
            if (recommendedSupplierId) {
                const offer = requestData.offers[recommendedSupplierId]?.[itemIndex];
                if (offer && offer.totalPrice > 0) {
                    const supplier = requestData.suppliers.find(s => s.id === recommendedSupplierId);
                    if (supplier) {
                        // Convert to EUR using the same logic as ComparisonManager
                        const convertedAmount = (offer.totalPrice / currencyRates[supplier.default_currency]) * currencyRates['EUR'];
                        totalAmount += convertedAmount;
                    }
                }
            }
        });
    }
    
    // Return with only 2 decimal places
    return Math.round(totalAmount * 100) / 100;
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    
    if (!guardRoute()) {
        return;
    }

    initNavbar();
    
    // Initialize data manager first and load draft data
    dataManager = new DataManager(requestData);
    const draftLoaded = dataManager.loadDraftData();
    
    initializeManagers();
    
    initializeHeader();
    
    // Fetch currency rates and then render everything
    currencyRates = await fetchCurrencyRates();
    updateComparisonManagerRates();
    
    // Initialize form field listeners
    initializeFormFieldListeners();
    
    // Now render all components with proper currency rates
    await renderAll();
    
});



function initializeHeader() {
    const headerConfig = {
        title: 'Satın Alma Talebi Oluştur',
        subtitle: 'Malzeme ve tedarikçi bilgilerini girin',
        icon: 'file-invoice',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'block',
        showExportButton: 'block',
        showRefreshButton: 'none',
        createButtonText: 'Taslak Kaydet',
        bulkCreateButtonText: 'Taslakları Görüntüle',
        exportButtonText: 'Gönder',
        onBackClick: () => {
            window.history.back();
        },
        onCreateClick: () => {
            saveDraftAsJSON();
        },
        onBulkCreateClick: () => {
            showDraftRequestsModal();
        },
        onExportClick: () => {
                submitRequest();
        }
    };
    
    headerComponent = new HeaderComponent(headerConfig);
}

function initializeManagers() {
    // Data manager is already initialized in the main initialization
    
    // Initialize validation manager
    validationManager = new ValidationManager();
    
    // Initialize other managers
    itemsManager = new ItemsManager(requestData, async () => {
        dataManager.autoSave();
        await renderAll();
    });
    
    suppliersManager = new SuppliersManager(requestData, async () => {
        dataManager.autoSave();
        await renderAll();
    }, currencySymbols);
    
    comparisonManager = new ComparisonManager(requestData, async () => {
        dataManager.autoSave();
        await renderAll();
    }, currencyRates, currencySymbols);
    
    // Load payment terms for suppliers manager to ensure proper display
    suppliersManager.loadAvailablePaymentTerms();
    
    // Make managers globally accessible for onclick handlers
    window.itemsManager = itemsManager;
    window.suppliersManager = suppliersManager;
    window.comparisonManager = comparisonManager;
    window.validationManager = validationManager;
}



async function saveDraftAsJSON() {
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
        
        // Calculate total amount in EUR from recommended suppliers
        const totalAmountEUR = calculateTotalAmountEUR();
        
        // Get formatted items and mapping
        const formattedData = itemsManager.getFormattedItemsForSubmission();
        
        // Transform offers and recommendations using the mapping
        const transformedOffers = {};
        const transformedRecommendations = {};
        
        Object.keys(requestData.offers).forEach(supplierId => {
            transformedOffers[supplierId] = {};
            Object.keys(requestData.offers[supplierId]).forEach(originalIndex => {
                const groupedIndex = formattedData.mapping[originalIndex];
                if (groupedIndex !== undefined) {
                    transformedOffers[supplierId][groupedIndex] = requestData.offers[supplierId][originalIndex];
                }
            });
        });
        
        Object.keys(recommendations).forEach(originalIndex => {
            const groupedIndex = formattedData.mapping[originalIndex];
            if (groupedIndex !== undefined) {
                transformedRecommendations[groupedIndex] = recommendations[originalIndex];
            }
        });
        
        // Transform suppliers for backend submission
        const transformedSuppliers = transformSuppliersForSubmission(requestData.suppliers);
        
        // Check if any item has job_no starting with "RM"
        const isRollingMill = formattedData.items.some(item => 
            item.job_no && item.job_no.toString().toUpperCase().startsWith('RM')
        );

        // Prepare data for backend (same format as submission)
        const submissionData = {
            title: requestData.title || 'Malzeme Satın Alma Talebi',
            description: requestData.description || 'Proje için gerekli malzemeler',
            priority: requestData.priority || 'normal',
            needed_date: requestData.needed_date || '',
            items: formattedData.items,
            suppliers: transformedSuppliers,
            offers: transformedOffers,
            recommendations: transformedRecommendations,
            total_amount_eur: totalAmountEUR,
            is_rolling_mill: isRollingMill
        };
        
        // Prepare draft data according to the model structure
        const draftData = {
            title: requestData.title || 'Malzeme Satın Alma Talebi',
            description: requestData.description || 'Proje için gerekli malzemeler',
            needed_date: requestData.needed_date || new Date().toISOString().split('T')[0],
            priority: requestData.priority || 'normal',
            data: submissionData  // Store the full submission data in the JSON field
        };
        
        // Send to backend
        const result = await savePurchaseRequestDraft(draftData);
        
        // Log the JSON data for debugging
        console.log('Draft Data as JSON:', JSON.stringify(draftData, null, 2));
        console.log('Backend response:', result);
        
        showNotification('Taslak başarıyla kaydedildi!', 'success');
        
        // Clear the page after successful draft save
        await clearPage();
        
    } catch (error) {
        console.error('Draft save error:', error);
        showNotification('Taslak kaydedilirken hata oluştu: ' + error.message, 'error');
    }
}

async function showDraftRequestsModal() {
    let drafts = [];
    try {
        // Load draft requests from the new endpoint
        const response = await getPurchaseRequestDrafts();
        // Ensure we have an array of drafts
        if (Array.isArray(response)) {
            drafts = response;
        } else if (response && Array.isArray(response.results)) {
            drafts = response.results;
        } else {
            drafts = [];
        }
        
        const tbody = document.getElementById('draft-requests-tbody');
        const emptyDiv = document.getElementById('draft-requests-empty');
        const table = document.getElementById('draft-requests-table');
        
        if (!drafts || drafts.length === 0) {
            table.style.display = 'none';
            emptyDiv.style.display = 'block';
        } else {
            table.style.display = 'table';
            emptyDiv.style.display = 'none';
            
            tbody.innerHTML = drafts.map(draft => `
                <tr>
                    <td>
                        <span class="fw-bold text-primary">${draft.id}</span>
                    </td>
                    <td>${draft.title || 'Başlıksız'}</td>
                    <td>${formatDate(draft.created_at)}</td>
                    <td>${draft.data?.items?.length || 0}</td>
                    <td>${draft.data?.suppliers?.length || 0}</td>
                    <td>
                        <div class="btn-group" role="group">
                            <button class="btn btn-primary btn-sm" onclick="loadDraftRequest(${draft.id})">
                            <i class="fas fa-edit me-1"></i>Düzenle
                        </button>
                            <button class="btn btn-danger btn-sm" onclick="deleteDraftRequest(${draft.id})">
                                <i class="fas fa-trash me-1"></i>Sil
                            </button>
                        </div>
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

async function loadDraftRequest(draftId) {
    try {
        // Close the modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('draftRequestsModal'));
        modal.hide();
        
        // Load the specific draft data by ID
        const draft = await getPurchaseRequestDraft(draftId);
        
        if (!draft) {
            showNotification('Taslak bulunamadı', 'error');
            return;
        }
        
        // Load the draft data into the form
        await loadDraftData(draft);
        
        showNotification('Taslak yüklendi', 'success');
        
    } catch (error) {
        console.error('Error loading draft request:', error);
        showNotification('Taslak yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

async function loadDraftData(draft) {
    try {
        // Load basic form data
        requestData.title = draft.title || '';
        requestData.description = draft.description || '';
        requestData.priority = draft.priority || 'normal';
        requestData.needed_date = draft.needed_date || '';
        
        // Load data from the JSON field
        if (draft.data) {
            requestData.items = draft.data.items || [];
            requestData.suppliers = draft.data.suppliers || [];
            requestData.offers = draft.data.offers || {};
            requestData.recommendations = draft.data.recommendations || {};
            
            // Convert recommendations back to itemRecommendations format
            requestData.itemRecommendations = {};
            if (draft.data.recommendations) {
                Object.keys(draft.data.recommendations).forEach(itemIndex => {
                    const supplierId = draft.data.recommendations[itemIndex];
                    if (supplierId) {
                        requestData.itemRecommendations[itemIndex] = supplierId;
                    }
                });
            }
        }
        
        // Update managers with the loaded data
        if (itemsManager) {
            itemsManager.requestData = requestData;
        }
        if (suppliersManager) {
            suppliersManager.requestData = requestData;
        }
        if (comparisonManager) {
            comparisonManager.requestData = requestData;
        }
        
        // Re-render everything
        await renderAll();
        
    } catch (error) {
        console.error('Error loading draft data:', error);
        throw error;
    }
}

async function deleteDraftRequest(draftId) {
    try {
        // Show confirmation dialog
        if (!confirm('Bu taslağı silmek istediğinizden emin misiniz?')) {
            return;
        }
        
        // Delete the draft
        await deletePurchaseRequestDraft(draftId);
        
        // Show success notification
        showNotification('Taslak başarıyla silindi!', 'success');
        
        // Refresh the modal to show updated list
        await showDraftRequestsModal();
        
    } catch (error) {
        console.error('Error deleting draft request:', error);
        showNotification('Taslak silinirken hata oluştu: ' + error.message, 'error');
    }
}

function updateComparisonManagerRates() {
    if (comparisonManager && currencyRates) {
        comparisonManager.currencyRates = currencyRates;
        comparisonManager.renderComparisonTable();
        comparisonManager.updateSummary();
    }
}

async function renderAll() {
    renderFormFields();
    itemsManager.renderItemsTable();
    
    // Wait for payment terms to be loaded before rendering suppliers
    if (suppliersManager.availablePaymentTerms.length === 0) {
        await suppliersManager.loadAvailablePaymentTerms();
    }
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
    const neededDateField = document.getElementById('needed-date');
    
    if (titleField) titleField.value = requestData.title || '';
    if (descriptionField) descriptionField.value = requestData.description || '';
    if (priorityField) priorityField.value = requestData.priority || 'normal';
    if (neededDateField) neededDateField.value = requestData.needed_date || '';
}

// Initialize form field event listeners (called only once)
function initializeFormFieldListeners() {
    const titleField = document.getElementById('request-title');
    const descriptionField = document.getElementById('request-description');
    
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
    
    const priorityField = document.getElementById('request-priority');
    if (priorityField) {
        priorityField.addEventListener('change', (e) => {
            requestData.priority = e.target.value;
            dataManager.autoSave();
        });
    }
    
    const neededDateField = document.getElementById('needed-date');
    if (neededDateField) {
        neededDateField.addEventListener('change', (e) => {
            requestData.needed_date = e.target.value;
            dataManager.autoSave();
            // Show validation feedback on change
            const validation = validationManager.validateField('needed-date', e.target.value);
            if (validation.isValid && e.target.value !== '') {
                validationManager.showFieldValidation('needed-date', true, '');
            } else {
                validationManager.clearFieldValidation('needed-date');
            }
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
    
    if (neededDateField) {
        neededDateField.addEventListener('blur', () => {
            const validation = validationManager.validateField('needed-date', neededDateField.value);
            validationManager.showFieldValidation('needed-date', validation.isValid, validation.message);
        });
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
            'request-description': requestData.description || '',
            'needed-date': requestData.needed_date || ''
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
        
        // Calculate total amount in EUR from recommended suppliers
        const totalAmountEUR = calculateTotalAmountEUR();
        
        // Get formatted items and mapping
        const formattedData = itemsManager.getFormattedItemsForSubmission();
        
        // Transform offers and recommendations using the mapping
        const transformedOffers = {};
        const transformedRecommendations = {};
        
        Object.keys(requestData.offers).forEach(supplierId => {
            transformedOffers[supplierId] = {};
            Object.keys(requestData.offers[supplierId]).forEach(originalIndex => {
                const groupedIndex = formattedData.mapping[originalIndex];
                if (groupedIndex !== undefined) {
                    transformedOffers[supplierId][groupedIndex] = requestData.offers[supplierId][originalIndex];
                }
            });
        });
        
        Object.keys(recommendations).forEach(originalIndex => {
            const groupedIndex = formattedData.mapping[originalIndex];
            if (groupedIndex !== undefined) {
                transformedRecommendations[groupedIndex] = recommendations[originalIndex];
            }
        });
        
        // Transform suppliers for backend submission
        const transformedSuppliers = transformSuppliersForSubmission(requestData.suppliers);
        
        // Check if any item has job_no starting with "RM"
        const isRollingMill = formattedData.items.some(item => 
            item.job_no && item.job_no.toString().toUpperCase().startsWith('RM')
        );
        
        // Prepare data for backend
        const submitData = {
            title: requestData.title.trim(),
            description: requestData.description.trim(),
            priority: requestData.priority || 'normal',
            needed_date: requestData.needed_date,
            items: formattedData.items,
            suppliers: transformedSuppliers,
            offers: transformedOffers,
            recommendations: transformedRecommendations,
            total_amount_eur: totalAmountEUR,
            is_rolling_mill: isRollingMill
        };
        
        // Create purchase request using generic function
        const result = await createPurchaseRequest(submitData);
        
        // Submit the request (change status from draft to submitted)
        await submitPurchaseRequest(result.id);
        
        showNotification('Talep başarıyla gönderildi!', 'success');
        
        // Clear the page after successful submission
        await clearPage();
        
        // Reset submit button to original state after successful submission
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Gönder';
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
    clearData: async () => {
        requestData = {
            requestNumber: '',
            requestDate: '',
            requestor: '',
            title: '',
            description: '',
            priority: 'normal',
            needed_date: new Date().toISOString().split('T')[0], // Set today's date as default
            items: [],
            suppliers: [],
            offers: {},
            recommendations: {},
            itemRecommendations: {}
        };
        
        // Update managers with the cleared data
        if (itemsManager) {
            itemsManager.requestData = requestData;
        }
        if (suppliersManager) {
            suppliersManager.requestData = requestData;
        }
        if (comparisonManager) {
            comparisonManager.requestData = requestData;
        }
        
        await renderAll();
        dataManager.clearDraft();
        // Clear validation states when clearing data
        if (validationManager) {
            validationManager.clearAllFieldValidations();
        }
    }
};

// Function to clear the page data
async function clearPage() {
    // Reset the form data
    requestData = {
        requestNumber: '',
        requestDate: '',
        requestor: '',
        title: '',
        description: '',
        priority: 'normal',
        needed_date: new Date().toISOString().split('T')[0], // Set today's date as default
        items: [],
        suppliers: [],
        offers: {},
        recommendations: {},
        itemRecommendations: {}
    };
    
    // Update managers with the cleared data
    if (itemsManager) {
        itemsManager.requestData = requestData;
    }
    if (suppliersManager) {
        suppliersManager.requestData = requestData;
    }
    if (comparisonManager) {
        comparisonManager.requestData = requestData;
    }
    
    // Clear draft from localStorage
    dataManager.clearDraft();
    
    // Re-render everything
    await renderAll();
    
    // Clear validation states
    if (validationManager) {
        validationManager.clearAllFieldValidations();
    }
}

// Make functions globally available for onclick handlers
window.loadDraftRequest = loadDraftRequest;
window.deleteDraftRequest = deleteDraftRequest;
