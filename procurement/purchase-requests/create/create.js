import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { ItemsManager } from './itemsManager.js';
import { SuppliersManager } from './suppliersManager.js';
import { ComparisonTable } from '../../../components/comparison-table/comparison-table.js';
import { DataManager } from './dataManager.js';
import { ValidationManager } from './validationManager.js';
import { fetchCurrencyRates } from '../../../apis/formatters.js';
import { createPurchaseRequest, submitPurchaseRequest, savePurchaseRequestDraft, getPurchaseRequestDrafts, deletePurchaseRequestDraft, getPurchaseRequestDraft, attachPlanningItemsToPurchaseRequest, getPurchaseRequests } from '../../../apis/procurement.js';
import { getPlanningRequest } from '../../../apis/planning/planningRequests.js';
import { getPlanningRequestItems, getNumberOfAvailablePlanningRequestItems, getPlanningRequestItem, getPlanningRequestItemsFiles } from '../../../apis/planning/planningRequestItems.js';
import { TableComponent } from '../../../components/table/table.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { FileAttachments } from '../../../components/file-attachments/file-attachments.js';
import { FileViewer } from '../../../components/file-viewer/file-viewer.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { ITEM_CODE_NAMES, UNIT_CHOICES } from '../../../apis/constants.js';
import { showNotification } from '../../../components/notification/notification.js';

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

/**
 * Sync planning_request_item_ids with actual items in the list
 * This ensures planning_request_item_ids always reflects the current state of items
 */
function syncPlanningRequestItemIds() {
    if (!requestData.items || !Array.isArray(requestData.items)) {
        requestData.planning_request_item_ids = [];
        return;
    }
    
    // Extract all source_planning_request_item_id values from items
    // This includes both single source_planning_request_item_id and arrays from merged items
    const itemIds = new Set();
    requestData.items.forEach(item => {
        if (!item) return;
        
        // Add single source_planning_request_item_id (for non-merged items)
        if (item.source_planning_request_item_id) {
            itemIds.add(item.source_planning_request_item_id);
        }
        
        // Add all IDs from source_planning_request_item_ids array (for merged items)
        if (item.source_planning_request_item_ids && Array.isArray(item.source_planning_request_item_ids)) {
            item.source_planning_request_item_ids.forEach(id => {
                if (id) {
                    itemIds.add(id);
                }
            });
        }
    });
    
    // Update planning_request_item_ids to match actual items
    requestData.planning_request_item_ids = Array.from(itemIds);
}

// Make sync function globally available for itemsManager and dataManager
window.syncPlanningRequestItemIds = syncPlanningRequestItemIds;



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

// Initialize unit dropdown from constants
function initializeUnitDropdown() {
    const unitSelect = document.getElementById('item-unit');
    if (unitSelect) {
        // Clear existing options except the first placeholder
        unitSelect.innerHTML = '<option value="">Birim Seçin</option>';
        
        // Populate from UNIT_CHOICES
        UNIT_CHOICES.forEach(unit => {
            const option = document.createElement('option');
            option.value = unit.value;
            option.textContent = unit.label;
            unitSelect.appendChild(option);
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    
    if (!guardRoute()) {
        return;
    }

    initNavbar();
    
    // Initialize unit dropdown from constants
    initializeUnitDropdown();
    
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
    
    // Initialize attach to purchase request modal
    initializeAttachToPurchaseRequestModal();
    
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
                errorMessage += `   Malzeme Açıklaması: ${problematicItem.item_description}\n`;
                errorMessage += `   Tekrarlanan satırlar: ${problematicItem.items.map(item => `Satır ${item.index} (${item.quantity} ${item.unit})`).join(', ')}\n\n`;
            });
            
            errorMessage += 'Bu malzemeler aynı kod, ad, iş numarası, teknik özellikler ve malzeme açıklamasına sahip olduğu için backend sorunlarına neden olur.\n';
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

        // Sync planning_request_item_ids before saving draft
        syncPlanningRequestItemIds();
        
        // Prepare data for backend (same format as submission)
        // For drafts, save the original ungrouped items to preserve source_planning_request_item_id
        const submissionData = {
            title: requestData.title || 'Malzeme Satın Alma Talebi',
            description: requestData.description,
            priority: requestData.priority || 'normal',
            needed_date: requestData.needed_date || '',
            items: formattedData.items, // Grouped items for submission format
            suppliers: transformedSuppliers,
            offers: transformedOffers,
            recommendations: transformedRecommendations,
            total_amount_eur: totalAmountEUR,
            is_rolling_mill: isRollingMill,
            planning_request_item_ids: requestData.planning_request_item_ids || [],
            // Store original ungrouped items to preserve source_planning_request_item_id
            original_items: requestData.items.map(item => ({
                ...item,
                // Ensure all necessary fields are preserved
                id: item.id,
                code: item.code,
                name: item.name,
                job_no: item.job_no,
                quantity: item.quantity,
                unit: item.unit,
                specs: item.specs,
                specifications: item.specifications,
                item_description: item.item_description,
                source_planning_request_item_id: item.source_planning_request_item_id,
                source_planning_request_item_ids: item.source_planning_request_item_ids, // Preserve array for merged items
                file_asset_ids: item.file_asset_ids
            }))
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
            itemRecommendations: {},
            planning_request_item_ids: [] // Track selected planning request item IDs
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
        
        // Load data from the JSON field
        if (draft.data) {
            // Also check if needed_date is in the data object (for backend drafts)
            if (draft.data.needed_date && !requestData.needed_date) {
                requestData.needed_date = draft.data.needed_date;
            }
            
            // Load items - prefer original_items if available (preserves source_planning_request_item_id)
            // Otherwise fall back to ungrouping the grouped items
            let items = [];
            let usingOriginalItems = false;
            if (draft.data.original_items && Array.isArray(draft.data.original_items) && draft.data.original_items.length > 0) {
                // Use original ungrouped items if available
                items = draft.data.original_items;
                usingOriginalItems = true;
            } else {
                // Fall back to grouped items and ungroup them
                items = draft.data.items || [];
            }
            
            // Check if items have allocations (indicating they were grouped during save)
            // If so, ungroup them back to separate items
            // Skip this if we're using original_items (they're already ungrouped)
            if (!usingOriginalItems && items.length > 0 && items[0].allocations && Array.isArray(items[0].allocations)) {
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
                                specifications: groupedItem.specifications || '',
                                item_description: groupedItem.item_description || '',
                                // Preserve planning request item IDs from merged items
                                source_planning_request_item_id: groupedItem.source_planning_request_item_id || null,
                                source_planning_request_item_ids: groupedItem.source_planning_request_item_ids || null,
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
                 
                // If we ungrouped items, we need to handle offers and recommendations
                // that were indexed by the grouped item indices
                if (draft.data.offers && Object.keys(draft.data.offers).length > 0) {
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
                 // If using original_items, they're already ungrouped and have source_planning_request_item_id
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
        
        // Restore planning_request_item_ids from draft data (if available)
        // But then sync with actual items to ensure accuracy
        if (draft.data && draft.data.planning_request_item_ids) {
            requestData.planning_request_item_ids = Array.isArray(draft.data.planning_request_item_ids) 
                ? draft.data.planning_request_item_ids 
                : [];
        } else {
            requestData.planning_request_item_ids = [];
        }
        
        // Sync planning_request_item_ids with actual items after loading draft
        // This ensures accuracy even if draft data is inconsistent
        syncPlanningRequestItemIds();
        
        // Migrate supplier data from backend format to frontend format
        if (dataManager) {
            dataManager.migrateSupplierData(draft.data);
        }
        
        // Update managers with the loaded data
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
        }
        
        // Reset the loading flag
        if (dataManager) {
            dataManager.isLoadingDraft = false;
        }
        
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
    
    if (titleField) titleField.value = requestData.title || '';
    if (descriptionField) descriptionField.value = requestData.description || '';
    if (priorityField) priorityField.value = requestData.priority || 'normal';
    if (neededDateField) {
        neededDateField.value = requestData.needed_date || '';
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
            // Show detailed error message to user
            let errorMessage = formattedData.error.message + '\n\n';
            formattedData.error.items.forEach((problematicItem, index) => {
                errorMessage += `${index + 1}. Kod: ${problematicItem.code}\n`;
                errorMessage += `   Ad: ${problematicItem.name}\n`;
                errorMessage += `   İş No: ${problematicItem.job_no}\n`;
                errorMessage += `   Teknik Özellikler: ${problematicItem.specs}\n`;
                errorMessage += `   Malzeme Açıklaması: ${problematicItem.item_description}\n`;
                errorMessage += `   Tekrarlanan satırlar: ${problematicItem.items.map(item => `Satır ${item.index} (${item.quantity} ${item.unit})`).join(', ')}\n\n`;
            });
            
            errorMessage += 'Bu malzemeler aynı kod, ad, iş numarası, teknik özellikler ve malzeme açıklamasına sahip olduğu için backend sorunlarına neden olur.\n';
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
        
        // Sync planning_request_item_ids with actual items before submission
        syncPlanningRequestItemIds();
        
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
let selectedPlanningItemsData = new Map(); // Map<id, full item object> to preserve info across pages
let allPlanningItems = []; // Keep for backward compatibility, but will only contain current page items
let planningItemsEventListenersSetup = false;
let planningItemFilesModal = null;
let planningRequestDetailsModal = null;
// Pagination state
let planningItemsCurrentPage = 1;
let planningItemsPageSize = 20;
let planningItemsCurrentSortField = null;
let planningItemsCurrentSortDirection = null;

function initializePlanningRequestItemsModal() {
    const attachBtn = document.getElementById('attach-planning-items-btn');
    if (attachBtn) {
        attachBtn.addEventListener('click', () => showPlanningRequestItemsModal());
    }
    
    const addSelectedBtn = document.getElementById('add-selected-items-btn');
    if (addSelectedBtn) {
        addSelectedBtn.addEventListener('click', () => addSelectedPlanningItems());
    }
    
    const downloadFilesBtn = document.getElementById('download-selected-files-btn');
    if (downloadFilesBtn) {
        downloadFilesBtn.addEventListener('click', () => downloadSelectedItemsFiles());
    }
    
    const attachToPrBtn = document.getElementById('attach-to-pr-btn');
    if (attachToPrBtn) {
        attachToPrBtn.addEventListener('click', () => showAttachToPurchaseRequestModal());
    }
    
    // Initialize modal event listeners
    const modal = document.getElementById('planningRequestItemsModal');
    if (modal) {
        modal.addEventListener('hidden.bs.modal', () => {
            // Clear selections when modal is closed
            selectedPlanningItems.clear();
            selectedPlanningItemsData.clear();
            if (planningItemsTable) {
                updateSelectedItemsCount();
            }
            // Refresh count after modal closes
            loadAvailableItemsCount();
        });
    }
    
    // Setup event listeners for table items
    setupPlanningItemsEventListeners();
    
    // Load available items count on initialization
    loadAvailableItemsCount();
}

async function loadAvailableItemsCount() {
    try {
        const response = await getNumberOfAvailablePlanningRequestItems();
        const count = response.count || response.available_count || 0;
        updatePlanningItemsButtonCount(count);
    } catch (error) {
        console.error('Error loading available items count:', error);
        // Don't show error notification, just set count to 0
        updatePlanningItemsButtonCount(0);
    }
}

function updatePlanningItemsButtonCount(count) {
    const attachBtn = document.getElementById('attach-planning-items-btn');
    if (!attachBtn) return;
    
    // Remove existing badge if any
    const existingBadge = attachBtn.querySelector('.planning-items-count-badge');
    if (existingBadge) {
        existingBadge.remove();
    }
    
    // Add count badge
    if (count > 0) {
        const badge = document.createElement('span');
        badge.className = 'planning-items-count-badge badge bg-success ms-2';
        badge.textContent = count;
        badge.style.cssText = 'font-size: 0.75rem; padding: 0.25rem 0.5rem;';
        attachBtn.appendChild(badge);
    }
}

async function showPlanningRequestItemsModal() {
    const modalElement = document.getElementById('planningRequestItemsModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
    
    // Reset selections
    selectedPlanningItems.clear();
    updateSelectedItemsCount();
    
    // Reset pagination to first page
    planningItemsCurrentPage = 1;
    planningItemsCurrentSortField = null;
    planningItemsCurrentSortDirection = null;
    
    // Initialize filters
    if (!planningItemsFilters) {
        initializePlanningItemsFilters();
    }
    
    // Initialize table
    if (!planningItemsTable) {
        initializePlanningItemsTable();
    } else {
        // Reset table pagination state
        planningItemsTable.options.currentPage = 1;
        planningItemsTable.options.itemsPerPage = planningItemsPageSize;
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
            planningItemsCurrentPage = 1; // Reset to first page on filter apply
            loadPlanningRequestItems();
        },
        onClear: () => {
            planningItemsCurrentPage = 1; // Reset to first page on filter clear
            loadPlanningRequestItems();
        }
    });
    
    // Add filters
    planningItemsFilters.addTextFilter({
        id: 'planning-request-number-filter',
        label: 'Planlama Talebi No',
        placeholder: 'Planlama talebi no ara... (örn: PLR-2025-0001, PLR-2025, 0001)',
        colSize: 2
    });
    
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
                field: 'item_description',
                label: 'Malzeme Açıklaması',
                formatter: (value) => value || '-',
                sortable: false
            },
            {
                field: 'job_no',
                label: 'İş No',
                formatter: (value) => value || '-',
                sortable: true
            },
            {
                field: 'quantity_to_purchase',
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
                field: 'files_count',
                label: 'Dosyalar',
                formatter: (value, row) => {
                    const fileCount = Number(value) || 0;
                    if (fileCount === 0) return '-';
                    return `<button type="button" class="btn btn-sm btn-outline-primary view-item-files-btn" data-item-id="${row.id}" data-item-name="${row.item_name || 'Malzeme'}">
                        <i class="fas fa-paperclip me-1"></i>${fileCount} dosya
                    </button>`;
                },
                sortable: false
            }
        ],
        data: [],
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: planningItemsPageSize,
        currentPage: planningItemsCurrentPage,
        totalItems: 0,
        sortable: true,
        responsive: true,
        striped: true,
        onPageChange: async (page) => {
            planningItemsCurrentPage = page;
            await loadPlanningRequestItems();
        },
        onPageSizeChange: async (newPageSize) => {
            planningItemsPageSize = newPageSize;
            planningItemsTable.options.itemsPerPage = newPageSize;
            planningItemsCurrentPage = 1;
            await loadPlanningRequestItems();
        },
        onSort: async (field, direction) => {
            planningItemsCurrentSortField = field;
            planningItemsCurrentSortDirection = direction;
            planningItemsCurrentPage = 1;
            await loadPlanningRequestItems();
        }
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
                const item = allPlanningItems.find(i => i.id === itemId);
                if (item) {
                    selectedPlanningItemsData.set(itemId, { ...item });
                }
            } else {
                selectedPlanningItems.delete(itemId);
                selectedPlanningItemsData.delete(itemId);
            }
            updateSelectedItemsCount();
            // Highlight row immediately
            const row = e.target.closest('tr');
            if (row) {
                if (e.target.checked) {
                    row.classList.add('table-success');
                } else {
                    row.classList.remove('table-success');
                }
            }
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

        // Remove from selected via summary badge
        const removeSelectedBtn = e.target.closest('.remove-selected-item-btn');
        if (removeSelectedBtn) {
            const itemId = parseInt(removeSelectedBtn.dataset.itemId);
            selectedPlanningItems.delete(itemId);
            selectedPlanningItemsData.delete(itemId);
            const checkbox = document.querySelector(`.planning-item-checkbox[data-item-id="${itemId}"]`);
            if (checkbox) {
                checkbox.checked = false;
            }
            updateSelectedItemsCount();
        }
    });
}

async function loadPlanningRequestItems() {
    if (!planningItemsTable) return;
    
    try {
        planningItemsTable.setLoading(true);
        
        // Get filter values
        const filterValues = planningItemsFilters ? planningItemsFilters.getFilterValues() : {};
        
        // Build backend filter parameters
        const filters = {
            available_for_procurement: true,
            page: planningItemsCurrentPage,
            page_size: planningItemsPageSize
        };
        
        // Map frontend filter IDs to backend filter names
        if (filterValues['planning-request-number-filter']) {
            filters.planning_request_number = filterValues['planning-request-number-filter'];
        }
        if (filterValues['item-code-filter']) {
            filters.item_code = filterValues['item-code-filter'];
        }
        if (filterValues['item-name-filter']) {
            filters.item_name = filterValues['item-name-filter'];
        }
        if (filterValues['job-no-filter']) {
            filters.job_no = filterValues['job-no-filter'];
        }
        
        // Add sorting if specified
        if (planningItemsCurrentSortField) {
            const sortPrefix = planningItemsCurrentSortDirection === 'desc' ? '-' : '';
            filters.ordering = `${sortPrefix}${planningItemsCurrentSortField}`;
        }
        
        // Fetch items from backend with filters and pagination
        const itemsResponse = await getPlanningRequestItems(filters);
        
        // Extract results and count from paginated response
        const items = itemsResponse.results || [];
        const totalCount = itemsResponse.count || items.length;
        
        // Store current page items (for backward compatibility and checkbox restoration)
        allPlanningItems = items;

        // Build display data: pinned selected items (from stored selection data), then current page items (excluding duplicates)
        const pinnedItems = Array.from(selectedPlanningItemsData.values());
        const pageItems = items.filter(item => !selectedPlanningItems.has(item.id));
        const displayItems = [...pinnedItems, ...pageItems];
        
        // Update table with paginated data + pinned items (pinned are extra rows, pagination counts stay backend-based)
        planningItemsTable.updateData(displayItems, totalCount);
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
            // Highlight selected rows
            const rows = document.querySelectorAll('#planning-items-table-container tbody tr');
            rows.forEach(row => {
                const cb = row.querySelector('.planning-item-checkbox');
                if (!cb) return;
                const itemId = parseInt(cb.dataset.itemId);
                if (selectedPlanningItems.has(itemId)) {
                    row.classList.add('table-success');
                } else {
                    row.classList.remove('table-success');
                }
            });
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
    const downloadBtn = document.getElementById('download-selected-files-btn');
    const attachToPrBtn = document.getElementById('attach-to-pr-btn');
    
    const count = selectedPlanningItems.size;
    if (countElement) {
        countElement.textContent = `${count} malzeme seçildi`;
    }
    if (addBtn) {
        addBtn.disabled = count === 0;
    }
    if (downloadBtn) {
        // For download button, we'll check files when actually downloading
        // since selected items might not be on current page
        downloadBtn.disabled = count === 0;
    }
    if (attachToPrBtn) {
        attachToPrBtn.disabled = count === 0;
    }
}

async function showPlanningItemFilesModal(itemId, itemName) {
    try {
        const response = await getPlanningRequestItemsFiles([itemId]);
        const itemData = response.items ? response.items.find(entry => entry.item_id === itemId) : null;

        if (!itemData || !itemData.files || itemData.files.length === 0) {
            showNotification('Bu malzeme için dosya bulunmuyor', 'info');
            return;
        }

        const displayName = itemData.item_name || itemName || 'Malzeme';

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
        planningItemFilesModal.setTitle(`${displayName} - Dosyalar`);
        
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
                fileAttachments.setFiles(itemData.files);
            }
        }, 100);
        
        // Show the modal
        planningItemFilesModal.show();
    } catch (error) {
        console.error('Error fetching planning item files:', error);
        showNotification('Malzeme dosyaları yüklenirken hata oluştu: ' + error.message, 'error');
    }
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
                                    <th>Malzeme Açıklaması</th>
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
                                        <td>${item.item_description || '-'}</td>
                                        <td>${item.job_no || '-'}</td>
                                        <td>${item.quantity_to_purchase || '-'}</td>
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

// Function to sanitize Turkish characters for file/folder names
function sanitizeFileName(name) {
    if (!name) return 'Unknown';
    
    // Map Turkish characters to English equivalents
    const turkishCharMap = {
        'ç': 'c', 'Ç': 'C',
        'ğ': 'g', 'Ğ': 'G',
        'ı': 'i', 'İ': 'I',
        'ö': 'o', 'Ö': 'O',
        'ş': 's', 'Ş': 'S',
        'ü': 'u', 'Ü': 'U'
    };
    
    // Replace Turkish characters
    let sanitized = name.split('').map(char => turkishCharMap[char] || char).join('');
    
    // Remove or replace invalid characters for file/folder names
    sanitized = sanitized.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    
    // Replace spaces with underscores
    sanitized = sanitized.replace(/\s+/g, '_');
    
    // Remove multiple consecutive underscores
    sanitized = sanitized.replace(/_+/g, '_');
    
    // Remove leading/trailing underscores
    sanitized = sanitized.replace(/^_+|_+$/g, '');
    
    // Limit length to avoid issues
    if (sanitized.length > 100) {
        sanitized = sanitized.substring(0, 100);
    }
    
    return sanitized || 'Unknown';
}

async function downloadSelectedItemsFiles() {
    if (selectedPlanningItems.size === 0) {
        showNotification('Lütfen en az bir malzeme seçin', 'warning');
        return;
    }
    
    // Check if JSZip is available
    if (typeof JSZip === 'undefined') {
        showNotification('Zip indirme özelliği yüklenemedi. Lütfen sayfayı yenileyin.', 'error');
        return;
    }
    
    try {
        const itemIds = Array.from(selectedPlanningItems);
        const itemMetaMap = new Map();
        // First use stored selection metadata (persists across pages)
        selectedPlanningItemsData.forEach((meta, id) => {
            itemMetaMap.set(id, meta);
        });
        // Then supplement with current page data (may have newer values)
        allPlanningItems.forEach(item => {
            if (item && item.id && !itemMetaMap.has(item.id)) {
                itemMetaMap.set(item.id, item);
            }
        });

        const response = await getPlanningRequestItemsFiles(itemIds);
        const itemsWithFiles = response.items || [];

        // Collect all files from selected items
        const fileMap = new Map(); // To avoid duplicates

        for (const item of itemsWithFiles) {
            const files = Array.isArray(item.files) ? item.files : [];
            if (files.length === 0) continue;

            const meta = itemMetaMap.get(item.item_id) || {};
            const itemName = item.item_name || meta.item_name || 'Bilinmeyen Malzeme';
            const planningRequestNumber = meta.planning_request_number || item.planning_request_number || '';
            const itemCode = item.item_code || meta.item_code || '';

            files.forEach(file => {
                // Use file URL as key to avoid duplicates
                const fileKey = file.file_url || file.id;
                if (!fileMap.has(fileKey)) {
                    fileMap.set(fileKey, {
                        ...file,
                        itemName,
                        itemCode,
                        planningRequestNumber
                    });
                }
            });
        }

        if (fileMap.size === 0) {
            showNotification('Seçilen malzemelerde dosya bulunmuyor', 'info');
            return;
        }

        // Convert map to array
        const filesToDownload = Array.from(fileMap.values());

        // Show notification
        showNotification(`${filesToDownload.length} dosya zip dosyasına ekleniyor...`, 'info', 3000);

        // Create zip file
        const zip = new JSZip();
        const downloadPromises = [];

        // Fetch and add each file to zip
        for (const file of filesToDownload) {
            try {
                const fileName = file.file_name ? file.file_name.split('/').pop() : `file_${file.id || Date.now()}`;
                // Create folder name using planning request number and item name
                const planningRequestNum = sanitizeFileName(file.planningRequestNumber || 'Unknown');
                const itemName = sanitizeFileName(file.itemName || 'Bilinmeyen Malzeme');
                const itemFolder = `${planningRequestNum}_${itemName}`;
                const zipPath = `${itemFolder}/${sanitizeFileName(fileName)}`;
                
                // Fetch file as blob
                const fetchPromise = fetch(file.file_url)
                    .then(response => {
                        if (!response.ok) throw new Error(`Failed to fetch ${fileName}`);
                        return response.blob();
                    })
                    .then(blob => {
                        zip.file(zipPath, blob);
                    })
                    .catch(error => {
                        console.error(`Error fetching file ${fileName}:`, error);
                    });
                
                downloadPromises.push(fetchPromise);
            } catch (error) {
                console.error(`Error processing file ${file.file_name}:`, error);
            }
        }
        
        // Wait for all files to be fetched
        await Promise.all(downloadPromises);
        
        // Generate zip file
        showNotification('Zip dosyası oluşturuluyor...', 'info', 2000);
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        // Create zip file name with request title and date
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}_${hours}-${minutes}`;
        
        // Use request title if available, otherwise use default
        const title = requestData.title && requestData.title.trim() 
            ? sanitizeFileName(requestData.title.trim())
            : 'planlama_talebi_dosyalari';
        
        const zipFileName = `${title}_${dateStr}.zip`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = zipFileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
        showNotification(`${filesToDownload.length} dosya zip dosyası olarak indirildi`, 'success');
        
    } catch (error) {
        console.error('Error downloading files:', error);
        showNotification('Dosyalar indirilirken hata oluştu: ' + error.message, 'error');
    }
}

async function addSelectedPlanningItems() {
    if (selectedPlanningItems.size === 0) {
        showNotification('Lütfen en az bir malzeme seçin', 'warning');
        return;
    }
    
    try {
        let addedCount = 0;
        
        // Fetch items that are not on current page
        const itemsToFetch = Array.from(selectedPlanningItems).filter(itemId => 
            !allPlanningItems.find(i => i.id === itemId)
        );
        
        // Fetch missing items from backend
        const fetchedItems = [];
        if (itemsToFetch.length > 0) {
            showNotification(`${itemsToFetch.length} malzeme yükleniyor...`, 'info', 2000);
            for (const itemId of itemsToFetch) {
                try {
                    const item = await getPlanningRequestItem(itemId);
                    fetchedItems.push(item);
                } catch (error) {
                    console.error(`Error fetching item ${itemId}:`, error);
                }
            }
        }
        
        // Combine current page items and fetched items
        const allSelectedItems = [
            ...allPlanningItems.filter(item => selectedPlanningItems.has(item.id)),
            ...fetchedItems
        ];
        
        for (const planningItem of allSelectedItems) {
            if (!planningItem) continue;
            
            // Check if item is already added (by planning_request_item_id)
            const existingItem = requestData.items.find(item => 
                item.source_planning_request_item_id === planningItem.id
            );
            
            if (existingItem) {
                continue; // Skip if already added
            }
            
            // Convert planning request item to purchase request item
            // For special item codes, move description to name and specifications to specs
            const isSpecialItemCode = planningItem.item_code && ITEM_CODE_NAMES.hasOwnProperty(planningItem.item_code);
            
            // Extract file asset IDs from planning item files
            const fileAssetIds = [];
            if (planningItem.files && Array.isArray(planningItem.files)) {
                planningItem.files.forEach(file => {
                    // Use asset_id field as FileAsset ID
                    if (file.asset_id) {
                        fileAssetIds.push(file.asset_id);
                    }
                });
            }
            
            const newItem = {
                id: window.itemsManager ? window.itemsManager.generateItemId() : 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                code: planningItem.item_code || '',
                name: isSpecialItemCode ? (planningItem.item_description || '') : (planningItem.item_name || ''),
                job_no: planningItem.job_no || '',
                quantity: parseFloat(planningItem.quantity_to_purchase) || 1,
                unit: planningItem.item_unit || 'adet',
                specs: planningItem.specifications || '', // Keep for backward compatibility
                item_description: planningItem.item_description || '', // Original item description from PlanningRequestItem
                specifications: planningItem.specifications || '', // Technical specifications
                source_planning_request_item_id: planningItem.id, // Track source
                file_asset_ids: fileAssetIds // Store file asset IDs
            };
            
            requestData.items.push(newItem);
            
            addedCount++;
        }
        
        // Sync planning_request_item_ids with actual items after adding
        // This ensures accuracy and removes any inconsistencies
        syncPlanningRequestItemIds();
        
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
            
            // Refresh available items count
            loadAvailableItemsCount();
            
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

// Attach to Purchase Request Modal
let attachToPrModal = null;

function initializeAttachToPurchaseRequestModal() {
    if (!attachToPrModal) {
        attachToPrModal = new EditModal('attach-to-pr-modal-container', {
            title: 'Mevcut Satın Alma Talebine Ekle',
            icon: 'fas fa-link',
            size: 'md',
            saveButtonText: 'Ekle',
            showEditButton: false
        });
        
        attachToPrModal.onSaveCallback(async (formData) => {
            await handleAttachToPurchaseRequest(formData);
        });
    }
}

async function showAttachToPurchaseRequestModal() {
    if (selectedPlanningItems.size === 0) {
        showNotification('Lütfen en az bir malzeme seçin', 'warning');
        return;
    }
    
    // Initialize modal if not already done
    if (!attachToPrModal) {
        initializeAttachToPurchaseRequestModal();
    }
    
    // Clear and configure the modal
    attachToPrModal.clearAll();
    
    attachToPrModal.addSection({
        title: 'Satın Alma Talebi Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });
    
    attachToPrModal.addField({
        id: 'purchase_request_number',
        name: 'purchase_request_number',
        label: 'Satın Alma Talebi No',
        type: 'text',
        placeholder: 'PR-2025-0347',
        required: true,
        icon: 'fas fa-hashtag',
        colSize: 12,
        help: 'Satın alma talebi numarasını girin (örn: PR-2025-0347)'
    });
    
    attachToPrModal.addField({
        id: 'selected_items_info',
        name: 'selected_items_info',
        label: 'Seçilen Malzemeler',
        type: 'text',
        value: `${selectedPlanningItems.size} malzeme seçildi`,
        icon: 'fas fa-list',
        colSize: 12,
        readonly: true
    });
    
    attachToPrModal.render();
    attachToPrModal.show();
}

async function handleAttachToPurchaseRequest(formData) {
    const purchaseRequestNumber = formData.purchase_request_number?.trim();
    
    if (!purchaseRequestNumber) {
        showNotification('Satın alma talebi numarası gereklidir', 'error');
        return;
    }
    
    // Validate format (basic check for PR-YYYY-####)
    const prPattern = /^PR-\d{4}-\d+$/i;
    if (!prPattern.test(purchaseRequestNumber)) {
        showNotification('Geçersiz satın alma talebi numarası formatı. Format: PR-YYYY-#### (örn: PR-2025-0347)', 'error');
        return;
    }
    
    try {
        // Show loading state
        if (attachToPrModal) {
            attachToPrModal.setLoading(true);
        }
        
        // Search for purchase request by request_number
        const purchaseRequest = await findPurchaseRequestByNumber(purchaseRequestNumber);
        
        if (!purchaseRequest) {
            showNotification(`Satın alma talebi bulunamadı: ${purchaseRequestNumber}`, 'error');
            if (attachToPrModal) {
                attachToPrModal.setLoading(false);
            }
            return;
        }
        
        // Get selected planning request item IDs
        const planningRequestItemIds = Array.from(selectedPlanningItems);
        
        if (planningRequestItemIds.length === 0) {
            showNotification('Seçilen malzeme bulunamadı', 'error');
            if (attachToPrModal) {
                attachToPrModal.setLoading(false);
            }
            return;
        }
        
        // Call the attach API
        const response = await attachPlanningItemsToPurchaseRequest(
            purchaseRequest.id,
            planningRequestItemIds
        );
        
        // Handle response
        if (response && response.detail) {
            showNotification(response.detail, 'success');
            
            // Close modals
            if (attachToPrModal) {
                attachToPrModal.hide();
            }
            
            const planningModal = bootstrap.Modal.getInstance(document.getElementById('planningRequestItemsModal'));
            if (planningModal) {
                planningModal.hide();
            }
            
            // Clear selections
            selectedPlanningItems.clear();
            selectedPlanningItemsData.clear();
            updateSelectedItemsCount();
            
            // Refresh available items count
            loadAvailableItemsCount();
        } else {
            showNotification('Malzemeler başarıyla eklendi', 'success');
            
            // Close modals
            if (attachToPrModal) {
                attachToPrModal.hide();
            }
            
            const planningModal = bootstrap.Modal.getInstance(document.getElementById('planningRequestItemsModal'));
            if (planningModal) {
                planningModal.hide();
            }
            
            // Clear selections
            selectedPlanningItems.clear();
            selectedPlanningItemsData.clear();
            updateSelectedItemsCount();
            
            // Refresh available items count
            loadAvailableItemsCount();
        }
        
    } catch (error) {
        console.error('Error attaching items to purchase request:', error);
        
        // Handle detailed error messages from backend
        let errorMessage = 'Malzemeler eklenirken hata oluştu';
        
        // Check if error has detailed error data attached
        if (error.errorData) {
            const errorData = error.errorData;
            if (errorData.detail) {
                errorMessage = errorData.detail;
                // Add errors array if available
                if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
                    errorMessage += '\n\n' + errorData.errors.join('\n');
                }
                // Add note if available
                if (errorData.note) {
                    errorMessage += '\n\n' + errorData.note;
                }
            }
        } else if (error.errors && Array.isArray(error.errors)) {
            // If errors array is directly attached
            errorMessage = error.message || errorMessage;
            if (error.errors.length > 0) {
                errorMessage += '\n\n' + error.errors.join('\n');
            }
            if (error.note) {
                errorMessage += '\n\n' + error.note;
            }
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        // Show error with longer duration for detailed messages
        const duration = errorMessage.includes('\n') ? 10000 : 5000;
        showNotification(errorMessage, 'error', duration);
    } finally {
        if (attachToPrModal) {
            attachToPrModal.setLoading(false);
        }
    }
}

async function findPurchaseRequestByNumber(requestNumber) {
    try {
        // Search for purchase request by request_number
        const filters = {
            request_number: requestNumber,
            page_size: 1
        };
        
        const response = await getPurchaseRequests(filters);
        
        // Handle paginated response
        if (response.results && response.results.length > 0) {
            return response.results[0];
        }
        
        // Handle non-paginated response (array)
        if (Array.isArray(response) && response.length > 0) {
            // Find exact match
            const exactMatch = response.find(pr => 
                pr.request_number && pr.request_number.toUpperCase() === requestNumber.toUpperCase()
            );
            return exactMatch || null;
        }
        
        return null;
    } catch (error) {
        console.error('Error finding purchase request:', error);
        throw error;
    }
}

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
            itemRecommendations: {},
            planning_request_item_ids: []
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
        itemRecommendations: {},
        planning_request_item_ids: []
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
