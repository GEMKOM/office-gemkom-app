import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { ItemsManager } from './itemsManager.js';
import { SuppliersManager } from './suppliersManager.js';
import { ComparisonTable } from '../../../components/comparison-table/comparison-table.js';
import { DataManager } from './dataManager.js';
import { ValidationManager } from './validationManager.js';
import { fetchCurrencyRates } from '../../../apis/formatters.js';
import { createPurchaseRequest, submitPurchaseRequest, savePurchaseRequestDraft, getPurchaseRequestDrafts, deletePurchaseRequestDraft, getPurchaseRequestDraft } from '../../../apis/procurement.js';

// Global state
let headerComponent;
let itemsManager;
let suppliersManager;
let comparisonTable;
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
                    if (supplier && supplier.default_currency) {
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
    
    // Load payment terms before rendering to ensure proper display
    await suppliersManager.loadAvailablePaymentTerms();
    
    initializeHeader();
    
    // Fetch currency rates and then render everything
    currencyRates = await fetchCurrencyRates();
    updateComparisonTableRates();
    
    // Initialize form field listeners
    initializeFormFieldListeners();
    
    // Initialize modal cleanup
    initializeModalCleanup();
    
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
    
    comparisonTable = new ComparisonTable('comparison-table-container', {
        currencyRates: currencyRates,
        currencySymbols: currencySymbols,
        showEuroTotal: false, // Hide Euro Total column specifically for create page
        columnOrder: ['unitPrice', 'deliveryDays', 'originalTotal', 'recommendations'], // Custom column order for create page
        autoSave: async () => {
            dataManager.autoSave();
            await renderAll();
        },
        onRecommendationChange: (itemIndex, supplierId, recommendations) => {
            requestData.itemRecommendations = recommendations;
            // Re-validate ALL items to restore error states after table re-render
            if (window.validationManager) {
                requestData.items.forEach((_, idx) => {
                    window.validationManager.revalidateItem(
                        idx, 
                        requestData.items, 
                        requestData.itemRecommendations, 
                        requestData.offers, 
                        requestData.suppliers
                    );
                });
            }
        },
        onSupplierRecommendAll: (supplierId, recommendations) => {
            requestData.itemRecommendations = recommendations;
            // Re-validate ALL items to restore error states after table re-render
            if (window.validationManager) {
                requestData.items.forEach((_, idx) => {
                    window.validationManager.revalidateItem(
                        idx, 
                        requestData.items, 
                        requestData.itemRecommendations, 
                        requestData.offers, 
                        requestData.suppliers
                    );
                });
            }
        }
    });
    
    // Make managers globally accessible for onclick handlers
    window.itemsManager = itemsManager;
    window.suppliersManager = suppliersManager;
    window.comparisonTable = comparisonTable;
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
        
        // Check for problematic items that would cause backend issues
        if (formattedData.error) {
            console.log('Problematic items detected in draft:', formattedData.error);
            
            // Show detailed error message to user
            let errorMessage = formattedData.error.message + '\n\n';
            formattedData.error.items.forEach((problematicItem, index) => {
                errorMessage += `${index + 1}. Kod: ${problematicItem.code}\n`;
                errorMessage += `   Ad: ${problematicItem.name}\n`;
                errorMessage += `   İş No: ${problematicItem.job_no}\n`;
                errorMessage += `   Teknik Özellikler: ${problematicItem.specs}\n`;
                errorMessage += `   Tekrarlanan satırlar: ${problematicItem.items.map(item => `Satır ${item.index} (${item.quantity} ${item.unit})`).join(', ')}\n\n`;
            });
            
            errorMessage += 'Bu malzemeler aynı kod, ad, iş numarası ve teknik özelliklere sahip olduğu için backend sorunlarına neden olur.\n';
            errorMessage += 'Lütfen bu malzemeleri düzenleyin veya silin.';
            
            showNotification(errorMessage, 'error');
            return;
        }
        
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
        
        // Check if any item has job_no starting with "RM" in allocations
        const isRollingMill = formattedData.items.some(item => 
            item.allocations && item.allocations.some(allocation => 
                allocation.job_no && allocation.job_no.toString().toUpperCase().startsWith('RM')
            )
        );

        // Prepare data for backend (same format as submission)
        const submissionData = {
            title: requestData.title || 'Malzeme Satın Alma Talebi',
            description: requestData.description,
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
        
        // Show the modal - check for existing instance first
        const modalElement = document.getElementById('draftRequestsModal');
        let modal = bootstrap.Modal.getInstance(modalElement);
        
        // If no existing instance, create a new one
        if (!modal) {
            modal = new bootstrap.Modal(modalElement);
        }
        
        // Ensure any existing backdrop is removed
        const existingBackdrop = document.querySelector('.modal-backdrop');
        if (existingBackdrop) {
            existingBackdrop.remove();
        }
        
        // Remove any modal-open class from body
        document.body.classList.remove('modal-open');
        
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
        console.log('Loading draft data:', draft);
        
        // Set flag to prevent auto-save during draft loading
        if (dataManager) {
            dataManager.isLoadingDraft = true;
        }
        
        // Clear all localStorage data to ensure clean state
        if (dataManager) {
            dataManager.clearDraft();
            // Also clear any other localStorage data that might be present
            localStorage.removeItem('purchaseRequestDraft');
            localStorage.removeItem('purchaseRequestData');
            localStorage.removeItem('purchaseRequestItems');
            localStorage.removeItem('purchaseRequestSuppliers');
            localStorage.removeItem('purchaseRequestOffers');
            localStorage.removeItem('purchaseRequestRecommendations');
            console.log('Cleared all localStorage data');
        }
        
        // Clear the current data without re-rendering
        requestData = {
            requestNumber: '',
            requestDate: '',
            requestor: '',
            title: '',
            description: '',
            priority: 'normal',
            needed_date: new Date().toISOString().split('T')[0],
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
        if (comparisonTable) {
            comparisonTable.setData({
                items: requestData.items,
                suppliers: requestData.suppliers,
                offers: requestData.offers,
                itemRecommendations: requestData.itemRecommendations
            });
        }
        
        // Clear validation states
        if (validationManager) {
            validationManager.clearAllFieldValidations();
        }
        
        // Load basic form data
        requestData.title = draft.title || '';
        requestData.description = draft.description || '';
        requestData.priority = draft.priority || 'normal';
        requestData.needed_date = draft.needed_date || '';
        
        console.log('Initial needed_date from draft:', draft.needed_date);
        console.log('Initial requestData.needed_date:', requestData.needed_date);
        
        // Load data from the JSON field
        if (draft.data) {
            // Also check if needed_date is in the data object (for backend drafts)
            if (draft.data.needed_date && !requestData.needed_date) {
                requestData.needed_date = draft.data.needed_date;
                console.log('Updated needed_date from draft.data:', draft.data.needed_date);
            }
            
            // Load items and check if they need to be ungrouped
            let items = draft.data.items || [];
            
            // Check if items have allocations (indicating they were grouped during save)
            // If so, ungroup them back to separate items
            if (items.length > 0 && items[0].allocations && Array.isArray(items[0].allocations)) {
                console.log('Detected grouped items in draft, ungrouping...');
                const ungroupedItems = [];
                
                items.forEach((groupedItem, groupIndex) => {
                    if (groupedItem.allocations && Array.isArray(groupedItem.allocations)) {
                        // This is a grouped item, split it into separate items
                        groupedItem.allocations.forEach((allocation, allocationIndex) => {
                            const separateItem = {
                                id: `item_${Date.now()}_${Math.random()}`,
                                code: groupedItem.code,
                                name: groupedItem.name,
                                unit: groupedItem.unit,
                                job_no: allocation.job_no,
                                quantity: allocation.quantity,
                                specs: groupedItem.specifications || '',
                                originalGroupIndex: groupIndex,
                                allocationIndex: allocationIndex
                            };
                            ungroupedItems.push(separateItem);
                        });
                    } else {
                        // This is already a separate item
                        const separateItem = {
                            ...groupedItem,
                            originalGroupIndex: groupIndex,
                            allocationIndex: 0
                        };
                        ungroupedItems.push(separateItem);
                    }
                });
                
                                             items = ungroupedItems;
                 console.log('Ungrouped items:', items);
                 
                // If we ungrouped items, we need to handle offers and recommendations
                // that were indexed by the grouped item indices
                if (draft.data.offers && Object.keys(draft.data.offers).length > 0) {
                    console.log('Handling offers for ungrouped items...');
                    const newOffers = {};
                    
                    Object.keys(draft.data.offers).forEach(supplierId => {
                        newOffers[supplierId] = {};
                        Object.keys(draft.data.offers[supplierId]).forEach(groupedIndex => {
                            const groupedIndexNum = parseInt(groupedIndex);
                            const originalGroupedItem = draft.data.items[groupedIndexNum];
                            
                            if (originalGroupedItem && originalGroupedItem.allocations) {
                                // Find the ungrouped items that came from this specific grouped item
                                // Use the originalGroupIndex to match exactly
                                items.forEach((item, newIndex) => {
                                    if (item.originalGroupIndex === groupedIndexNum) {
                                        newOffers[supplierId][newIndex] = draft.data.offers[supplierId][groupedIndex];
                                    }
                                });
                            } else {
                                // This was already a separate item, keep the same index
                                newOffers[supplierId][groupedIndex] = draft.data.offers[supplierId][groupedIndex];
                            }
                        });
                    });
                    
                    requestData.offers = newOffers;
                } else {
                    requestData.offers = draft.data.offers || {};
                }
                 
                // Handle recommendations similarly
                if (draft.data.recommendations && Object.keys(draft.data.recommendations).length > 0) {
                    console.log('Handling recommendations for ungrouped items...');
                    const newRecommendations = {};
                    
                    Object.keys(draft.data.recommendations).forEach(groupedIndex => {
                        const groupedIndexNum = parseInt(groupedIndex);
                        const originalGroupedItem = draft.data.items[groupedIndexNum];
                        
                        if (originalGroupedItem && originalGroupedItem.allocations) {
                            // Find the ungrouped items that came from this specific grouped item
                            // Use the originalGroupIndex to match exactly
                            items.forEach((item, newIndex) => {
                                if (item.originalGroupIndex === groupedIndexNum) {
                                    newRecommendations[newIndex] = draft.data.recommendations[groupedIndex];
                                }
                            });
                        } else {
                            // This was already a separate item, keep the same index
                            newRecommendations[groupedIndex] = draft.data.recommendations[groupedIndex];
                        }
                    });
                    
                    requestData.recommendations = newRecommendations;
                } else {
                    requestData.recommendations = draft.data.recommendations || {};
                }
                 
                // Clean up temporary properties and assign the ungrouped items to requestData.items
                requestData.items = items.map(item => {
                    const { originalGroupIndex, allocationIndex, ...cleanItem } = item;
                    return cleanItem;
                });
                requestData.suppliers = draft.data.suppliers || [];
             } else {
                 // No ungrouping needed, load items and data as is
                 requestData.items = items;
                 requestData.suppliers = draft.data.suppliers || [];
                 requestData.offers = draft.data.offers || {};
                 requestData.recommendations = draft.data.recommendations || {};
             }
         } else {
             // No draft.data, keep empty arrays/objects
             requestData.items = [];
             requestData.suppliers = [];
             requestData.offers = {};
             requestData.recommendations = {};
         }
        
        // Convert recommendations back to itemRecommendations format
        requestData.itemRecommendations = {};
        if (requestData.recommendations) {
            Object.keys(requestData.recommendations).forEach(itemIndex => {
                const supplierId = requestData.recommendations[itemIndex];
                if (supplierId) {
                    requestData.itemRecommendations[itemIndex] = supplierId;
                }
            });
        }
        
        // Migrate supplier data from backend format to frontend format
        if (dataManager) {
            dataManager.migrateSupplierData(draft.data);
        }
        
        // Update managers with the loaded data
        console.log('Final requestData.items before updating managers:', requestData.items);
        console.log('Final requestData.suppliers before updating managers:', requestData.suppliers);
        
        if (itemsManager) {
            itemsManager.requestData = requestData;
        }
        if (suppliersManager) {
            suppliersManager.requestData = requestData;
        }
        if (comparisonTable) {
            comparisonTable.setData({
                items: requestData.items,
                suppliers: requestData.suppliers,
                offers: requestData.offers,
                itemRecommendations: requestData.itemRecommendations
            });
        }
        
        // Ensure payment terms are loaded before rendering
        if (suppliersManager && suppliersManager.availablePaymentTerms.length === 0) {
            await suppliersManager.loadAvailablePaymentTerms();
        }
        
        // Re-render everything first
        await renderAll();
        
        // Save the loaded draft data to localStorage as the new current state
        if (dataManager) {
            dataManager.saveDraft();
            console.log('Saved loaded draft to localStorage as new current state');
        }
        
        // Reset the loading flag
        if (dataManager) {
            dataManager.isLoadingDraft = false;
        }
        
        console.log('Draft loading completed successfully');
        console.log('Final items count:', requestData.items.length);
        console.log('Final suppliers count:', requestData.suppliers.length);
        
    } catch (error) {
        console.error('Error loading draft data:', error);
        // Reset the loading flag even on error
        if (dataManager) {
            dataManager.isLoadingDraft = false;
        }
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
        // First, close the current modal instance if it exists
        const modalElement = document.getElementById('draftRequestsModal');
        const existingModal = bootstrap.Modal.getInstance(modalElement);
        if (existingModal) {
            existingModal.hide();
        }
        
        // Wait a bit for the modal to close, then refresh
        setTimeout(async () => {
            await showDraftRequestsModal();
        }, 150);
        
    } catch (error) {
        console.error('Error deleting draft request:', error);
        showNotification('Taslak silinirken hata oluştu: ' + error.message, 'error');
    }
}

function updateComparisonTableRates() {
    if (comparisonTable && currencyRates) {
        comparisonTable.setCurrencyRates(currencyRates);
    }
}

async function renderAll() {
    console.log('renderAll - requestData.items:', requestData.items);
    console.log('renderAll - requestData.suppliers:', requestData.suppliers);
    
    renderFormFields();
    itemsManager.renderItemsTable();
    
    // Wait for payment terms to be loaded before rendering suppliers
    if (suppliersManager.availablePaymentTerms.length === 0) {
        await suppliersManager.loadAvailablePaymentTerms();
    }
    suppliersManager.renderSuppliersContainer();
    
    // Only render comparison if currency rates are available
    if (currencyRates && comparisonTable) {
        comparisonTable.setData({
            items: requestData.items,
            suppliers: requestData.suppliers,
            offers: requestData.offers,
            itemRecommendations: requestData.itemRecommendations
        });
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
    
    console.log('renderFormFields - requestData.needed_date:', requestData.needed_date);
    
    if (titleField) titleField.value = requestData.title || '';
    if (descriptionField) descriptionField.value = requestData.description || '';
    if (priorityField) priorityField.value = requestData.priority || 'normal';
    if (neededDateField) {
        neededDateField.value = requestData.needed_date || '';
        console.log('Setting neededDateField.value to:', requestData.needed_date || '');
    }
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
            // Save immediately when needed_date changes
            dataManager.saveDraft();
            dataManager.showAutoSaveIndicator();
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
            
            // Display validation errors to user
            validation.errors.forEach(error => {
                showNotification(error, 'error');
            });
            
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
        
        // Check for problematic items that would cause backend issues
        if (formattedData.error) {
            console.log('Problematic items detected:', formattedData.error);
            
            // Show detailed error message to user
            let errorMessage = formattedData.error.message + '\n\n';
            formattedData.error.items.forEach((problematicItem, index) => {
                errorMessage += `${index + 1}. Kod: ${problematicItem.code}\n`;
                errorMessage += `   Ad: ${problematicItem.name}\n`;
                errorMessage += `   İş No: ${problematicItem.job_no}\n`;
                errorMessage += `   Teknik Özellikler: ${problematicItem.specs}\n`;
                errorMessage += `   Tekrarlanan satırlar: ${problematicItem.items.map(item => `Satır ${item.index} (${item.quantity} ${item.unit})`).join(', ')}\n\n`;
            });
            
            errorMessage += 'Bu malzemeler aynı kod, ad, iş numarası ve teknik özelliklere sahip olduğu için backend sorunlarına neden olur.\n';
            errorMessage += 'Lütfen bu malzemeleri düzenleyin veya silin.';
            
            showNotification(errorMessage, 'error');
            
            // Re-enable submit button
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Gönder';
            }
            return;
        }
        
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
        
        // Check if any item has job_no starting with "RM" in allocations
        const isRollingMill = formattedData.items.some(item => 
            item.allocations && item.allocations.some(allocation => 
                allocation.job_no && allocation.job_no.toString().toUpperCase().startsWith('RM')
            )
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
        
        // Create purchase request using apis function
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
        if (comparisonTable) {
            comparisonTable.setData({
                items: requestData.items,
                suppliers: requestData.suppliers,
                offers: requestData.offers,
                itemRecommendations: requestData.itemRecommendations
            });
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
    if (comparisonTable) {
        comparisonTable.setData({
            items: requestData.items,
            suppliers: requestData.suppliers,
            offers: requestData.offers,
            itemRecommendations: requestData.itemRecommendations
        });
    }
    
    // Clear all localStorage data
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

function initializeModalCleanup() {
    const draftModal = document.getElementById('draftRequestsModal');
    if (draftModal) {
        draftModal.addEventListener('hidden.bs.modal', function() {
            // Clean up any remaining backdrop
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
            // Remove modal-open class from body
            document.body.classList.remove('modal-open');
        });
    }
}
