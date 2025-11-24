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
import { getPlanningRequests, getPlanningRequest } from '../../../apis/planning/planningRequests.js';
import { getPlanningRequestItems } from '../../../apis/planning/planningRequestItems.js';
import { TableComponent } from '../../../components/table/table.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { FileAttachments } from '../../../components/file-attachments/file-attachments.js';
import { FileViewer } from '../../../components/file-viewer/file-viewer.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';

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
    itemRecommendations: {},
    planning_request_item_ids: [] // Track selected planning request item IDs
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
    
    // Initialize planning request items modal
    initializePlanningRequestItemsModal();
    
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
            is_rolling_mill: isRollingMill,
            planning_request_item_ids: requestData.planning_request_item_ids || []
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
            is_rolling_mill: isRollingMill,
            planning_request_item_ids: requestData.planning_request_item_ids || []
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

// Planning Request Items Modal Management
let planningItemsTable = null;
let planningItemsFilters = null;
let selectedPlanningItems = new Set();
let allPlanningItems = [];
let planningItemsEventListenersSetup = false;
let planningItemFilesModal = null;
let planningRequestDetailsModal = null;

function initializePlanningRequestItemsModal() {
    const attachBtn = document.getElementById('attach-planning-items-btn');
    if (attachBtn) {
        attachBtn.addEventListener('click', () => showPlanningRequestItemsModal());
    }
    
    const addSelectedBtn = document.getElementById('add-selected-items-btn');
    if (addSelectedBtn) {
        addSelectedBtn.addEventListener('click', () => addSelectedPlanningItems());
    }
    
    // Initialize modal event listeners
    const modal = document.getElementById('planningRequestItemsModal');
    if (modal) {
        modal.addEventListener('hidden.bs.modal', () => {
            // Clear selections when modal is closed
            selectedPlanningItems.clear();
            if (planningItemsTable) {
                updateSelectedItemsCount();
            }
        });
    }
    
    // Setup event listeners for table items
    setupPlanningItemsEventListeners();
}

async function showPlanningRequestItemsModal() {
    const modalElement = document.getElementById('planningRequestItemsModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    
    // Reset selections
    selectedPlanningItems.clear();
    updateSelectedItemsCount();
    
    // Initialize filters
    if (!planningItemsFilters) {
        initializePlanningItemsFilters();
    }
    
    // Initialize table
    if (!planningItemsTable) {
        initializePlanningItemsTable();
    }
    
    // Load data
    await loadPlanningRequestItems();
    
    modal.show();
}

function initializePlanningItemsFilters() {
    const container = document.getElementById('planning-items-filters-container');
    if (!container) return;
    
    planningItemsFilters = new FiltersComponent('planning-items-filters-container', {
        title: 'Filtreler',
        showClearButton: true,
        showApplyButton: true,
        applyButtonText: 'Filtrele',
        clearButtonText: 'Temizle',
        onApply: () => {
            loadPlanningRequestItems();
        },
        onClear: () => {
            loadPlanningRequestItems();
        }
    });
    
    // Add filters
    planningItemsFilters.addTextFilter({
        id: 'item-code-filter',
        label: 'Malzeme Kodu',
        placeholder: 'Malzeme kodu ara...',
        colSize: 2
    });
    
    planningItemsFilters.addTextFilter({
        id: 'item-name-filter',
        label: 'Malzeme Adı',
        placeholder: 'Malzeme adı ara...',
        colSize: 2
    });
    
    planningItemsFilters.addTextFilter({
        id: 'job-no-filter',
        label: 'İş No',
        placeholder: 'İş numarası ara...',
        colSize: 2
    });
}

function initializePlanningItemsTable() {
    const container = document.getElementById('planning-items-table-container');
    if (!container) return;
    
    planningItemsTable = new TableComponent('planning-items-table-container', {
        title: 'Planlama Talebi Malzemeleri',
        columns: [
            {
                field: 'selected',
                label: '',
                formatter: (value, row) => {
                    const isSelected = selectedPlanningItems.has(row.id);
                    return `<input type="checkbox" class="planning-item-checkbox" data-item-id="${row.id}" ${isSelected ? 'checked' : ''}>`;
                },
                sortable: false
            },
            {
                field: 'planning_request_number',
                label: 'Planlama Talebi No',
                formatter: (value, row) => {
                    if (!value) return '-';
                    return `<button type="button" class="btn btn-link btn-sm p-0 view-planning-request-btn" data-planning-request-id="${row.planning_request}" data-request-number="${value}">
                        ${value}
                    </button>`;
                },
                sortable: true
            },
            {
                field: 'item_code',
                label: 'Malzeme Kodu',
                formatter: (value) => value || '-',
                sortable: true
            },
            {
                field: 'item_name',
                label: 'Malzeme Adı',
                formatter: (value) => value || '-',
                sortable: true
            },
            {
                field: 'job_no',
                label: 'İş No',
                formatter: (value) => value || '-',
                sortable: true
            },
            {
                field: 'quantity',
                label: 'Miktar',
                formatter: (value) => value || '-',
                sortable: true
            },
            {
                field: 'item_unit',
                label: 'Birim',
                formatter: (value) => value || '-',
                sortable: true
            },
            {
                field: 'specifications',
                label: 'Teknik Özellikler',
                formatter: (value) => {
                    if (!value) return '-';
                    return value.length > 50 ? value.substring(0, 50) + '...' : value;
                },
                sortable: false
            },
            {
                field: 'files',
                label: 'Dosyalar',
                formatter: (value, row) => {
                    const fileCount = Array.isArray(value) ? value.length : 0;
                    if (fileCount === 0) return '-';
                    return `<button type="button" class="btn btn-sm btn-outline-info view-item-files-btn" data-item-id="${row.id}" data-item-name="${row.item_name || 'Malzeme'}">
                        <i class="fas fa-paperclip me-1"></i>${fileCount} dosya
                    </button>`;
                },
                sortable: false
            }
        ],
        data: [],
        pagination: true,
        itemsPerPage: 20,
        sortable: true,
        responsive: true,
        striped: true
    });
    
}

// Setup event listeners for planning items table (using document-level delegation)
function setupPlanningItemsEventListeners() {
    // Only setup once to avoid duplicate listeners
    if (planningItemsEventListenersSetup) return;
    planningItemsEventListenersSetup = true;
    
    // Add event listener for checkboxes (document-level to ensure it works)
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('planning-item-checkbox')) {
            const itemId = parseInt(e.target.dataset.itemId);
            if (e.target.checked) {
                selectedPlanningItems.add(itemId);
            } else {
                selectedPlanningItems.delete(itemId);
            }
            updateSelectedItemsCount();
        }
    });
    
    // Add event listener for view files buttons
    document.addEventListener('click', (e) => {
        const filesBtn = e.target.closest('.view-item-files-btn');
        if (filesBtn) {
            const itemId = parseInt(filesBtn.dataset.itemId);
            const itemName = filesBtn.dataset.itemName;
            showPlanningItemFilesModal(itemId, itemName);
        }
        
        // Add event listener for planning request number buttons
        const planningRequestBtn = e.target.closest('.view-planning-request-btn');
        if (planningRequestBtn) {
            const planningRequestId = parseInt(planningRequestBtn.dataset.planningRequestId);
            const requestNumber = planningRequestBtn.dataset.requestNumber;
            showPlanningRequestDetailsModal(planningRequestId, requestNumber);
        }
    });
}

async function loadPlanningRequestItems() {
    if (!planningItemsTable) return;
    
    try {
        planningItemsTable.setLoading(true);
        
        // Get filter values
        const filterValues = planningItemsFilters ? planningItemsFilters.getFilterValues() : {};
        
        // Get all planning request items
        const itemsResponse = await getPlanningRequestItems({ page_size: 1000 });
        allPlanningItems = itemsResponse.results || [];
        
        // Apply text filters
        let filteredItems = allPlanningItems;
        if (filterValues['item-code-filter']) {
            const searchTerm = filterValues['item-code-filter'].toLowerCase();
            filteredItems = filteredItems.filter(item => 
                item.item_code?.toLowerCase().includes(searchTerm)
            );
        }
        if (filterValues['item-name-filter']) {
            const searchTerm = filterValues['item-name-filter'].toLowerCase();
            filteredItems = filteredItems.filter(item => 
                item.item_name?.toLowerCase().includes(searchTerm)
            );
        }
        if (filterValues['job-no-filter']) {
            const searchTerm = filterValues['job-no-filter'].toLowerCase();
            filteredItems = filteredItems.filter(item => 
                item.job_no?.toLowerCase().includes(searchTerm)
            );
        }
        
        // Update table with filtered data
        planningItemsTable.updateData(filteredItems, filteredItems.length);
        planningItemsTable.setLoading(false);
        
        // Re-render checkboxes to reflect current selection state
        setTimeout(() => {
            const checkboxes = document.querySelectorAll('.planning-item-checkbox');
            checkboxes.forEach(cb => {
                const itemId = parseInt(cb.dataset.itemId);
                cb.checked = selectedPlanningItems.has(itemId);
            });
            // Update button state after checkboxes are restored
            updateSelectedItemsCount();
        }, 100);
        
    } catch (error) {
        console.error('Error loading planning request items:', error);
        showNotification('Planlama talebi malzemeleri yüklenirken hata oluştu: ' + error.message, 'error');
        planningItemsTable.setLoading(false);
    }
}

function updateSelectedItemsCount() {
    const countElement = document.getElementById('selected-items-count');
    const addBtn = document.getElementById('add-selected-items-btn');
    
    const count = selectedPlanningItems.size;
    if (countElement) {
        countElement.textContent = `${count} malzeme seçildi`;
    }
    if (addBtn) {
        addBtn.disabled = count === 0;
    }
}

function showPlanningItemFilesModal(itemId, itemName) {
    // Find the item in allPlanningItems
    const item = allPlanningItems.find(i => i.id === itemId);
    if (!item || !item.files || item.files.length === 0) {
        showNotification('Bu malzeme için dosya bulunmuyor', 'info');
        return;
    }
    
    // Initialize DisplayModal if not already created
    if (!planningItemFilesModal) {
        // Create container element if it doesn't exist
        let container = document.getElementById('planning-item-files-modal-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'planning-item-files-modal-container';
            document.body.appendChild(container);
        }
        
        planningItemFilesModal = new DisplayModal('planning-item-files-modal-container', {
            title: 'Malzeme Dosyaları',
            icon: 'fas fa-paperclip',
            size: 'lg',
            showEditButton: false
        });
    }
    
    // Clear previous data
    planningItemFilesModal.clearData();
    
    // Update title
    planningItemFilesModal.setTitle(`${itemName} - Dosyalar`);
    
    // Add files section
    planningItemFilesModal.addCustomSection({
        id: 'files-section',
        title: '',
        customContent: `
            <div class="row g-2">
                <div class="col-12">
                    <div id="planning-item-files-display-container"></div>
                </div>
            </div>
        `
    });
    
    // Render the modal
    planningItemFilesModal.render();
    
    // Initialize FileAttachments component after modal is rendered
    setTimeout(() => {
        const container = document.getElementById('planning-item-files-display-container');
        if (container) {
            const fileAttachments = new FileAttachments('planning-item-files-display-container', {
                title: '',
                layout: 'grid',
                showTitle: false,
                onFileClick: (file) => {
                    const fileName = file.file_name ? file.file_name.split('/').pop() : 'Dosya';
                    const fileExtension = fileName.split('.').pop().toLowerCase();
                    const viewer = new FileViewer();
                    viewer.setDownloadCallback(async () => {
                        await viewer.downloadFile(file.file_url, fileName);
                    });
                    viewer.openFile(file.file_url, fileName, fileExtension);
                }
            });
            fileAttachments.setFiles(item.files);
        }
    }, 100);
    
    // Show the modal
    planningItemFilesModal.show();
}

async function showPlanningRequestDetailsModal(planningRequestId, requestNumber) {
    try {
        // Show loading notification
        showNotification('Planlama talebi detayları yükleniyor...', 'info', 2000);
        
        // Fetch planning request details
        const planningRequest = await getPlanningRequest(planningRequestId);
        
        // Initialize DisplayModal if not already created
        if (!planningRequestDetailsModal) {
            // Create container element if it doesn't exist
            let container = document.getElementById('planning-request-details-modal-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'planning-request-details-modal-container';
                document.body.appendChild(container);
            }
            
            planningRequestDetailsModal = new DisplayModal('planning-request-details-modal-container', {
                title: 'Planlama Talebi Detayları',
                icon: 'fas fa-clipboard-list',
                size: 'xl',
                showEditButton: false
            });
        }
        
        // Clear previous data
        planningRequestDetailsModal.clearData();
        
        // Update title with request number
        planningRequestDetailsModal.setTitle(`Planlama Talebi - ${requestNumber}`);
        
        // Add basic information section
        planningRequestDetailsModal.addSection({
            title: 'Genel Bilgiler',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });
        
        planningRequestDetailsModal.addField({
            label: 'Talep No',
            value: planningRequest.request_number || '-',
            colSize: 4
        });
        
        planningRequestDetailsModal.addField({
            label: 'Durum',
            value: planningRequest.status_label || planningRequest.status || '-',
            colSize: 4
        });
        
        planningRequestDetailsModal.addField({
            label: 'Öncelik',
            value: getPriorityLabel(planningRequest.priority),
            colSize: 4
        });
        
        if (planningRequest.title) {
            planningRequestDetailsModal.addField({
                label: 'Başlık',
                value: planningRequest.title,
                colSize: 12
            });
        }
        
        if (planningRequest.description) {
            planningRequestDetailsModal.addField({
                label: 'Açıklama',
                value: planningRequest.description,
                colSize: 12
            });
        }
        
        planningRequestDetailsModal.addField({
            label: 'İhtiyaç Tarihi',
            value: planningRequest.needed_date ? formatDate(planningRequest.needed_date) : '-',
            colSize: 6
        });
        
        planningRequestDetailsModal.addField({
            label: 'Oluşturulma',
            value: planningRequest.created_at ? formatDateTime(planningRequest.created_at) : '-',
            colSize: 6
        });
        
        if (planningRequest.created_by_full_name || planningRequest.created_by_username) {
            planningRequestDetailsModal.addField({
                label: 'Oluşturan',
                value: planningRequest.created_by_full_name || planningRequest.created_by_username,
                colSize: 6
            });
        }
        
        // Add items section if items exist
        if (planningRequest.items && planningRequest.items.length > 0) {
            planningRequestDetailsModal.addCustomSection({
                id: 'items-section',
                title: 'Talep Edilen Malzemeler',
                icon: 'fas fa-boxes',
                iconColor: 'text-success',
                customContent: `
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead class="table-light">
                                <tr>
                                    <th>#</th>
                                    <th>Malzeme Kodu</th>
                                    <th>Malzeme Adı</th>
                                    <th>İş No</th>
                                    <th>Miktar</th>
                                    <th>Birim</th>
                                    <th>Teknik Özellikler</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${planningRequest.items.map((item, index) => `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td><strong>${item.item_code || '-'}</strong></td>
                                        <td>${item.item_name || '-'}</td>
                                        <td>${item.job_no || '-'}</td>
                                        <td>${item.quantity || '-'}</td>
                                        <td>${item.item_unit || '-'}</td>
                                        <td>${item.specifications || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `
            });
        }
        
        // Add files section if files exist
        if (planningRequest.files && planningRequest.files.length > 0) {
            planningRequestDetailsModal.addCustomSection({
                id: 'files-section',
                title: 'Dosya Ekleri',
                icon: 'fas fa-paperclip',
                iconColor: 'text-info',
                customContent: `
                    <div class="row g-2">
                        <div class="col-12">
                            <div id="planning-request-files-display-container"></div>
                        </div>
                    </div>
                `
            });
        }
        
        // Render the modal
        planningRequestDetailsModal.render();
        
        // Initialize FileAttachments component if files exist
        if (planningRequest.files && planningRequest.files.length > 0) {
            setTimeout(() => {
                const container = document.getElementById('planning-request-files-display-container');
                if (container) {
                    const fileAttachments = new FileAttachments('planning-request-files-display-container', {
                        title: '',
                        layout: 'grid',
                        showTitle: false,
                        onFileClick: (file) => {
                            const fileName = file.file_name ? file.file_name.split('/').pop() : 'Dosya';
                            const fileExtension = fileName.split('.').pop().toLowerCase();
                            const viewer = new FileViewer();
                            viewer.setDownloadCallback(async () => {
                                await viewer.downloadFile(file.file_url, fileName);
                            });
                            viewer.openFile(file.file_url, fileName, fileExtension);
                        }
                    });
                    fileAttachments.setFiles(planningRequest.files);
                }
            }, 100);
        }
        
        // Show the modal
        planningRequestDetailsModal.show();
        
    } catch (error) {
        console.error('Error showing planning request details:', error);
        showNotification('Planlama talebi detayları yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

// Helper function to get priority label
function getPriorityLabel(priority) {
    const priorityMap = {
        'low': 'Düşük',
        'normal': 'Normal',
        'high': 'Yüksek',
        'urgent': 'Acil'
    };
    return priorityMap[priority] || priority || 'Normal';
}

// Helper function to format date
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('tr-TR');
    } catch (error) {
        return dateString;
    }
}

// Helper function to format datetime
function formatDateTime(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleString('tr-TR');
    } catch (error) {
        return dateString;
    }
}

async function addSelectedPlanningItems() {
    if (selectedPlanningItems.size === 0) {
        showNotification('Lütfen en az bir malzeme seçin', 'warning');
        return;
    }
    
    try {
        let addedCount = 0;
        
        for (const itemId of selectedPlanningItems) {
            const planningItem = allPlanningItems.find(item => item.id === itemId);
            if (!planningItem) continue;
            
            // Check if item is already added (by planning_request_item_id)
            const existingItem = requestData.items.find(item => 
                item.source_planning_request_item_id === itemId
            );
            
            if (existingItem) {
                continue; // Skip if already added
            }
            
            // Convert planning request item to purchase request item
            const newItem = {
                id: window.itemsManager ? window.itemsManager.generateItemId() : 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                code: planningItem.item_code || '',
                name: planningItem.item_name || '',
                job_no: planningItem.job_no || '',
                quantity: parseFloat(planningItem.quantity) || 1,
                unit: planningItem.item_unit || 'adet',
                specs: planningItem.specifications || '',
                source_planning_request_item_id: itemId // Track source
            };
            
            requestData.items.push(newItem);
            
            // Add to planning_request_item_ids for submission
            if (!requestData.planning_request_item_ids.includes(itemId)) {
                requestData.planning_request_item_ids.push(itemId);
            }
            
            addedCount++;
        }
        
        if (addedCount > 0) {
            // Re-render items table
            if (itemsManager) {
                itemsManager.renderItemsTable();
            }
            
            // Auto-save
            if (dataManager) {
                dataManager.autoSave();
            }
            
            // Re-render comparison table
            await renderAll();
            
            showNotification(`${addedCount} malzeme eklendi`, 'success');
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('planningRequestItemsModal'));
            if (modal) {
                modal.hide();
            }
        } else {
            showNotification('Seçilen malzemeler zaten eklenmiş', 'info');
        }
    } catch (error) {
        console.error('Error adding planning request items:', error);
        showNotification('Malzemeler eklenirken hata oluştu: ' + error.message, 'error');
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
