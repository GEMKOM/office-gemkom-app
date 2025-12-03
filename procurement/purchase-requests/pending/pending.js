import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { ComparisonTable } from '../../../components/comparison-table/comparison-table.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { FileAttachments } from '../../../components/file-attachments/file-attachments.js';
import { FileViewer } from '../../../components/file-viewer/file-viewer.js';


import { 
    getPurchaseRequests, 
    getPendingApprovalRequests,
    getApprovedByMeRequests,
    getPurchaseRequest, 
    approvePurchaseRequest, 
    rejectPurchaseRequest
} from '../../../apis/procurement.js';
import { fetchCurrencyRates } from '../../../apis/formatters.js';

// State management
// Pending requests state
let currentPage = 1;
let currentFilter = 'all';
let currentOrdering = 'request_number';
let currentSortField = 'request_number';
let currentSortDirection = 'desc';
let requests = [];
let totalRequests = 0;
let isLoading = false;

// Approved requests state
let approvedCurrentPage = 1;
let approvedCurrentSortField = 'request_number';
let approvedCurrentSortDirection = 'desc';
let approvedRequests = [];
let totalApprovedRequests = 0;
let isLoadingApproved = false;

// Shared state
let currentRequest = null;
let currencyRates = null; // Currency conversion rates
let currencySymbols = {
    'TRY': '₺',
    'USD': '$',
    'EUR': '€',
    'GBP': '£'
};
let comparisonTable = null; // Comparison table component instance
let pendingTable = null; // Pending requests table component instance
let approvedTable = null; // Approved requests table component instance
let displayModal = null; // Display modal component instance
let isModalLoading = false; // Flag to prevent multiple modal openings
let currentApprovalModal = null; // Current approval confirmation modal instance (created fresh each time)
let filesModal = null; // Files modal instance

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Fetch currency rates
    currencyRates = await fetchCurrencyRates();
    
    // Initialize display modal component
    displayModal = new DisplayModal('display-modal-container', {
        title: 'Talep Detayları',
        icon: 'fas fa-file-invoice',
        size: 'xl',
        showEditButton: false
    });
    
    // Initialize comparison table component
    comparisonTable = new ComparisonTable('comparison-table-container', {
        currencyRates: currencyRates,
        currencySymbols: currencySymbols,
        showRecommendations: false, // Hide recommendations column for pending page
        showSummary: false, // Hide summary section (Özet Bilgiler)
        showSummaryRow: true, // Show summary row (totals row in table)
        showEuroTotal: false, // Show Euro Total column for pending page
        columnOrder: ['unitPrice', 'originalTotal', 'deliveryDays'], // Custom column order for pending page (euroTotal removed)
        autoSave: null, // No auto-save needed for pending page
        onRecommendationChange: null, // No recommendation changes needed for pending page
        onSupplierRecommendAll: null, // No bulk recommendations needed for pending page
        onShowFiles: (itemIndex, files, item) => showFilesModal(files, item),
        onShowSpecifications: (itemIndex, specifications, itemDescription, item) => showSpecificationsModal(specifications, itemDescription, item)
    });
    
    // Initialize pending requests table component
    pendingTable = new TableComponent('pending-requests-table-container', {
        title: 'Onay Bekleyen Talepler',
        icon: 'fas fa-clock',
        iconColor: 'text-warning',
        columns: [
            {
                field: 'request_number',
                label: 'Talep No',
                sortable: true,
                formatter: (value) => `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value || '-'}</span>`
            },
            {
                field: 'title',
                label: 'Başlık',
                sortable: true,
                formatter: (value, row) => `
                    <div style="font-weight: 600; color: #343a40;">${value || 'Başlıksız'}</div>
                    <small style="color: #6c757d; font-size: 0.85rem;">${row.description || 'Açıklama yok'}</small>
                `
            },
            {
                field: 'requestor_username',
                label: 'Talep Eden',
                sortable: true,
                formatter: (value) => `
                    <div style="font-weight: 500; color: #495057;">
                        <i class="fas fa-user-circle me-2 text-muted"></i>
                        ${value || 'Bilinmiyor'}
                    </div>
                `
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value, row) => getStatusBadge(value, row.status_label)
            },
            {
                field: 'priority',
                label: 'Öncelik',
                sortable: true,
                formatter: (value) => getPriorityBadge(value)
            },
            {
                field: 'total_amount_eur',
                label: 'Toplam Tutar',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${value ? formatCurrency(value, 'EUR') : '-'}</div>
                `
            },
            {
                field: 'created_at',
                label: 'Oluşturulma',
                sortable: true,
                type: 'date'
            },
            {
                field: 'approval',
                label: 'Onay Durumu',
                sortable: false,
                formatter: (value, row) => `
                    <div style="min-width: 200px; text-align: middle; vertical-align: middle;">
                        ${getApprovalInfo(row)}
                    </div>
                `
            }
        ],
        actions: [
            {
                key: 'view',
                label: 'Detayları Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => viewRequestDetails(row.id)
            },
            {
                key: 'approve',
                label: 'Onayla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                visible: (row) => row.status === 'submitted',
                onClick: (row) => approveRequest(row.id)
            },
            {
                key: 'reject',
                label: 'Reddet',
                icon: 'fas fa-times',
                class: 'btn-outline-danger',
                visible: (row) => row.status === 'submitted',
                onClick: (row) => rejectRequest(row.id)
            }
        ],
        pagination: true,
        itemsPerPage: 20,
        refreshable: true,
        onRefresh: loadRequests,
        onSort: (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            currentPage = 1;
            loadRequests();
        },
        onPageChange: (page) => {
            currentPage = page;
            loadRequests();
        },
        emptyMessage: 'Onayınızı bekleyen satın alma talebi bulunmamaktadır.',
        emptyIcon: 'fas fa-check-circle'
    });
    
    // Initialize approved requests table component
    approvedTable = new TableComponent('approved-requests-table-container', {
        title: 'Onayladığınız Talepler',
        icon: 'fas fa-check-circle',
        iconColor: 'text-success',
        columns: [
            {
                field: 'request_number',
                label: 'Talep No',
                sortable: true,
                formatter: (value) => `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value || '-'}</span>`
            },
            {
                field: 'title',
                label: 'Başlık',
                sortable: true,
                formatter: (value, row) => `
                    <div style="font-weight: 600; color: #343a40;">${value || 'Başlıksız'}</div>
                    <small style="color: #6c757d; font-size: 0.85rem;">${row.description || 'Açıklama yok'}</small>
                `
            },
            {
                field: 'requestor_username',
                label: 'Talep Eden',
                sortable: true,
                formatter: (value) => `
                    <div style="font-weight: 500; color: #495057;">
                        <i class="fas fa-user-circle me-2 text-muted"></i>
                        ${value || 'Bilinmiyor'}
                    </div>
                `
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value, row) => getStatusBadge(value, row.status_label)
            },
            {
                field: 'priority',
                label: 'Öncelik',
                sortable: true,
                formatter: (value) => getPriorityBadge(value)
            },
            {
                field: 'total_amount_eur',
                label: 'Toplam Tutar',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${value ? formatCurrency(value, 'EUR') : '-'}</div>
                `
            },
            {
                field: 'created_at',
                label: 'Oluşturulma',
                sortable: true,
                type: 'date'
            },
            {
                field: 'approval',
                label: 'Onay Durumu',
                sortable: false,
                formatter: (value, row) => `
                    <div style="min-width: 200px; text-align: left; vertical-align: middle;">
                        ${getApprovalInfo(row)}
                    </div>
                `
            }
        ],
        actions: [
            {
                key: 'view',
                label: 'Detayları Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => viewRequestDetails(row.id)
            }
        ],
        pagination: true,
        itemsPerPage: 20,
        refreshable: true,
        onRefresh: loadApprovedRequests,
        onSort: (field, direction) => {
            approvedCurrentSortField = field;
            approvedCurrentSortDirection = direction;
            approvedCurrentPage = 1;
            loadApprovedRequests();
        },
        onPageChange: (page) => {
            approvedCurrentPage = page;
            loadApprovedRequests();
        },
        emptyMessage: 'Henüz onayladığınız satın alma talebi bulunmamaktadır.',
        emptyIcon: 'fas fa-check-circle'
    });
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Onay Bekleyen Satın Alma Talepleri',
        subtitle: 'Onayınızı bekleyen taleplerin yönetimi ve karşılaştırması',
        icon: 'clock',
        showBackButton: 'block',
        showCreateButton: 'none',
        showBulkCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'none',
        onBackClick: () => window.location.href = '/procurement/purchase-requests/'
    });
    

    
    await initializeRequests();
    setupEventListeners();
});

async function initializeRequests() {
    try {
        await loadRequests();
        await loadApprovedRequests();
        
        // Check if there's a talep parameter in the URL to open modal
        const urlParams = new URLSearchParams(window.location.search);
        const talepNo = urlParams.get('talep');
        if (talepNo) {
            await openModalFromTalepNo(talepNo);
        }
    } catch (error) {
        console.error('Error initializing requests:', error);
        showNotification('Talepler yüklenirken hata oluştu', 'error');
    }
}




async function loadRequests() {
    if (isLoading) return;
    
    try {
        isLoading = true;
        pendingTable.setLoading(true);
        
        // Build API filters and ordering
        const apiFilters = {};
        
        // Add ordering parameters
        if (currentSortField) {
            const orderingPrefix = currentSortDirection === 'desc' ? '-' : '';
            apiFilters.ordering = orderingPrefix + currentSortField;
        }
        
        // Add pagination parameters
        const itemsPerPage = 20;
        apiFilters.page = currentPage;
        apiFilters.page_size = itemsPerPage;
        
        const response = await getPendingApprovalRequests(apiFilters);
        
        console.log('Pending Approval API Response:', response);
        
        // Handle paginated response
        if (response && response.results) {
            requests = response.results;
            totalRequests = response.count || response.results.length;
        } else if (Array.isArray(response)) {
            requests = response;
            totalRequests = response.length;
        } else {
            requests = [];
            totalRequests = 0;
        }
        
        console.log('Processed requests:', requests);
        
        // Update the table component
        pendingTable.updateData(requests, totalRequests, currentPage);
        
    } catch (error) {
        console.error('Error loading requests:', error);
        showNotification('Onay bekleyen talepler yüklenirken hata oluştu: ' + error.message, 'error');
        requests = [];
        totalRequests = 0;
        pendingTable.updateData([], 0, 1);
    } finally {
        isLoading = false;
        pendingTable.setLoading(false);
    }
}

async function loadApprovedRequests() {
    if (isLoadingApproved) return;
    
    try {
        isLoadingApproved = true;
        approvedTable.setLoading(true);
        
        // Build API filters and ordering
        const apiFilters = {};
        
        // Add ordering parameters
        if (approvedCurrentSortField) {
            const orderingPrefix = approvedCurrentSortDirection === 'desc' ? '-' : '';
            apiFilters.ordering = orderingPrefix + approvedCurrentSortField;
        }
        
        // Add pagination parameters
        const itemsPerPage = 20;
        apiFilters.page = approvedCurrentPage;
        apiFilters.page_size = itemsPerPage;
        
        const response = await getApprovedByMeRequests(apiFilters);
        
        console.log('Approved Requests API Response:', response);
        
        // Handle paginated response
        if (response && response.results) {
            approvedRequests = response.results;
            totalApprovedRequests = response.count || response.results.length;
        } else if (Array.isArray(response)) {
            approvedRequests = response;
            totalApprovedRequests = response.length;
        } else {
            approvedRequests = [];
            totalApprovedRequests = 0;
        }
        
        console.log('Processed approved requests:', approvedRequests);
        
        // Update the table component
        approvedTable.updateData(approvedRequests, totalApprovedRequests, approvedCurrentPage);
        
    } catch (error) {
        console.error('Error loading approved requests:', error);
        showNotification('Onayladığınız talepler yüklenirken hata oluştu: ' + error.message, 'error');
        approvedRequests = [];
        totalApprovedRequests = 0;
        approvedTable.updateData([], 0, 1);
    } finally {
        isLoadingApproved = false;
        approvedTable.setLoading(false);
    }
}






function setupEventListeners() {
    // No need for complex event listeners since we recreate the modal each time
    // The close callback is set up when the modal is recreated
}

function disableTableActions() {
    // Disable all action buttons in both tables
    const actionButtons = document.querySelectorAll('#pending-requests-table-container .action-buttons button, #approved-requests-table-container .action-buttons button');
    actionButtons.forEach(button => {
        button.disabled = true;
        button.style.opacity = '0.5';
        button.style.cursor = 'not-allowed';
    });
}

function enableTableActions() {
    // Re-enable all action buttons in both tables
    const actionButtons = document.querySelectorAll('#pending-requests-table-container .action-buttons button, #approved-requests-table-container .action-buttons button');
    actionButtons.forEach(button => {
        button.disabled = false;
        button.style.opacity = '1';
        button.style.cursor = 'pointer';
    });
}
    
    // Rejection modal event listeners
    const rejectModal = document.getElementById('rejectRequestModal');
    if (rejectModal) {
        // Character counter for comment textarea
        const commentTextarea = document.getElementById('rejectComment');
        const commentCounter = document.getElementById('commentCounter');
        
        if (commentTextarea && commentCounter) {
            commentTextarea.addEventListener('input', () => {
                const length = commentTextarea.value.length;
                commentCounter.textContent = length;
                
                // Change color based on length
                if (length > 450) {
                    commentCounter.style.color = '#dc3545';
                } else if (length > 400) {
                    commentCounter.style.color = '#fd7e14';
                } else {
                    commentCounter.style.color = '#6c757d';
                }
            });
        }
        
        // Confirm reject button
        const confirmRejectBtn = document.getElementById('confirmRejectRequest');
        if (confirmRejectBtn) {
            confirmRejectBtn.addEventListener('click', async () => {
                const comment = commentTextarea ? commentTextarea.value.trim() : '';
                const requestId = window.currentRejectRequestId;
                
                if (!requestId) {
                    showNotification('Hata: Talep ID bulunamadı', 'error');
                    return;
                }
                
                try {
                    // Disable button during request
                    confirmRejectBtn.disabled = true;
                    confirmRejectBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Reddediliyor...';
                    
                    await rejectPurchaseRequest(requestId, comment);
                    showNotification('Talep başarıyla reddedildi', 'success');
                    
                    // Close both modals
                    const rejectModalInstance = bootstrap.Modal.getOrCreateInstance(rejectModal);
                    rejectModalInstance.hide();
                    
                    if (displayModal) {
                        displayModal.hide();
                    }
                    
                    // Clean up backdrops after closing modals
                    setTimeout(() => {
                        cleanupBackdrops();
                    }, 300);
                    
                    // Clear the form
                    if (commentTextarea) {
                        commentTextarea.value = '';
                        commentCounter.textContent = '0';
                        commentCounter.style.color = '#6c757d';
                    }
                    
                    // Reload data
                    await loadRequests();
                    
                } catch (error) {
                    console.error('Error rejecting request:', error);
                    showNotification('Talep reddedilirken hata oluştu: ' + error.message, 'error');
                } finally {
                    // Re-enable button
                    confirmRejectBtn.disabled = false;
                    confirmRejectBtn.innerHTML = '<i class="fas fa-times-circle me-1"></i>Reddet';
                }
            });
        }
        
        // Clear form when modal is hidden
        rejectModal.addEventListener('hidden.bs.modal', () => {
            const commentTextarea = document.getElementById('rejectComment');
            const commentCounter = document.getElementById('commentCounter');
            
            if (commentTextarea) {
                commentTextarea.value = '';
            }
            if (commentCounter) {
                commentCounter.textContent = '0';
                commentCounter.style.color = '#6c757d';
            }
            
            // Clear stored request ID
            window.currentRejectRequestId = null;
        });
    }



async function viewRequestDetails(requestId) {
    // Prevent multiple clicks while loading
    if (isModalLoading) {
        return;
    }
    
    try {
        isModalLoading = true;
        
        // Disable all action buttons in tables
        disableTableActions();
        
        // Show loading notification
        
        currentRequest = await getPurchaseRequest(requestId);
        await showRequestDetailsModal();
        
        // Update URL to include the talep no (request number)
        const url = new URL(window.location);
        url.searchParams.set('talep', currentRequest.request_number);
        window.history.pushState({}, '', url);
        
    } catch (error) {
        console.error('Error loading request details:', error);
        showNotification('Talep detayları yüklenirken hata oluştu: ' + error.message, 'error');
    } finally {
        isModalLoading = false;
        // Re-enable all action buttons in tables
        enableTableActions();
    }
}

async function showRequestDetailsModal() {
    // Get current user to check if they've already made a decision
    let currentUser = null;
    try {
        const { getUser } = await import('../../../authService.js');
        currentUser = await getUser();
    } catch (error) {
        console.error('Error getting current user:', error);
    }
    
    // Check if current user has already made a decision on this request
    let userHasDecided = false;
    if (currentUser && currentRequest.approval && currentRequest.approval.stage_instances) {
        currentRequest.approval.stage_instances.forEach(stage => {
            if (stage.decisions) {
                stage.decisions.forEach(decision => {
                    if (decision.approver === currentUser.id) {
                        userHasDecided = true;
                    }
                });
            }
        });
    }
    
    // Calculate total amount for recommended items
    let totalRecommendedAmountEUR = 0;
    let currencyTotals = {};
    
    // Calculate total amount for cheapest options
    let totalCheapestAmountEUR = 0;
    let cheapestCurrencyTotals = {};
    
    if (currentRequest.offers && currentRequest.offers.length > 0) {
        // Calculate recommended totals
        currentRequest.offers.forEach(offer => {
            const currency = offer.currency;
            if (!currencyTotals[currency]) {
                currencyTotals[currency] = 0;
            }
            
            offer.item_offers.forEach(itemOffer => {
                if (itemOffer.is_recommended && itemOffer.unit_price && parseFloat(itemOffer.unit_price) > 0) {
                    const unitPrice = parseFloat(itemOffer.unit_price);
                    const quantity = parseFloat(currentRequest.request_items.find(item => item.id === itemOffer.purchase_request_item)?.quantity || 0);
                    const totalPrice = unitPrice * quantity;
                    
                    currencyTotals[currency] += totalPrice;
                    
                    if (currencyRates) {
                        const convertedPrice = convertCurrency(totalPrice, currency, 'EUR');
                        totalRecommendedAmountEUR += convertedPrice;
                    }
                }
            });
        });
        
        // Calculate cheapest totals by finding the cheapest option for each item
        if (currentRequest.request_items && currentRequest.request_items.length > 0) {
            currentRequest.request_items.forEach(requestItem => {
                let cheapestOption = null;
                let cheapestPrice = Infinity;
                
                // Find the cheapest option for this item across all suppliers
                currentRequest.offers.forEach(offer => {
                    const itemOffer = offer.item_offers.find(io => io.purchase_request_item === requestItem.id);
                    if (itemOffer && itemOffer.unit_price && parseFloat(itemOffer.unit_price) > 0) {
                        const unitPrice = parseFloat(itemOffer.unit_price);
                        const quantity = parseFloat(requestItem.quantity || 0);
                        const totalPrice = unitPrice * quantity;
                        
                        if (totalPrice < cheapestPrice) {
                            cheapestPrice = totalPrice;
                            cheapestOption = {
                                price: totalPrice,
                                currency: offer.currency,
                                supplier: offer.supplier.name
                            };
                        }
                    }
                });
                
                // Add the cheapest option to totals
                if (cheapestOption) {
                    const currency = cheapestOption.currency;
                    if (!cheapestCurrencyTotals[currency]) {
                        cheapestCurrencyTotals[currency] = 0;
                    }
                    cheapestCurrencyTotals[currency] += cheapestOption.price;
                    
                    if (currencyRates) {
                        const convertedPrice = convertCurrency(cheapestOption.price, currency, 'EUR');
                        totalCheapestAmountEUR += convertedPrice;
                    }
                }
            });
        }
    }
    
    // Display both totals
    const recommendedCurrencyDisplay = Object.entries(currencyTotals)
        .map(([currency, amount]) => `${formatCurrencyDisplay(amount, currency)}`)
        .join(' + ');
    
    const cheapestCurrencyDisplay = Object.entries(cheapestCurrencyTotals)
        .map(([currency, amount]) => `${formatCurrencyDisplay(amount, currency)}`)
        .join(' + ');
    
    // Check if there are actually lower prices available
    const hasLowerPrices = totalCheapestAmountEUR > 0 && totalCheapestAmountEUR < totalRecommendedAmountEUR;
    const savingsAmount = totalRecommendedAmountEUR - totalCheapestAmountEUR;
    
    // Completely reset the modal by destroying and recreating it
    displayModal.destroy();
    
    // Recreate the modal with fresh state
    displayModal = new DisplayModal('display-modal-container', {
        title: 'Talep Detayları',
        icon: 'fas fa-file-invoice',
        size: 'xl',
        showEditButton: false
    });
    
    // Re-setup the close callback
    displayModal.onCloseCallback(() => {
        // Remove the talep parameter from URL when modal is closed
        const url = new URL(window.location);
        url.searchParams.delete('talep');
        window.history.pushState({}, '', url);
        
        // Clean up any lingering Bootstrap backdrops
        cleanupBackdrops();
    });
    
    // Update modal title to include request number
    displayModal.setTitle(`Talep Detayları - ${currentRequest.request_number || 'Bilinmiyor'}`);
    
    // Show loading state in the modal
    displayModal.setLoading(true);
    
    // Add financial summary section with custom eye-catching design
    if (currentRequest.offers && currentRequest.offers.length > 0) {
        // Create the eye-catching financial summary card HTML
        let financialCardHTML = '';
        
        if (hasLowerPrices) {
            // Show both recommended and cheapest options
            financialCardHTML = `
                <div class="row g-3 mb-3">
                    <div class="col-md-6">
                        <div class="card h-100 border-secondary border-1 shadow-sm bg-light">
                            <div class="card-body p-3">
                                <div class="d-flex align-items-center justify-content-between mb-2">
                                    <div class="d-flex align-items-center">
                                        <div class="bg-secondary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 32px; height: 32px;">
                                            <i class="fas fa-info-circle text-secondary" style="font-size: 14px;"></i>
                                        </div>
                                        <span class="fw-normal text-secondary" style="font-size: 13px;">Daha Düşük Fiyatlar Mevcut</span>
                                    </div>
                                    <div class="text-end">
                                        <div class="fw-normal text-secondary" style="font-size: 16px; line-height: 1;">${formatCurrencyDisplay(totalCheapestAmountEUR, 'EUR')}</div>
                                        <div class="text-muted" style="font-size: 10px;">En Düşük Toplam</div>
                                    </div>
                                </div>
                                <div class="border-top pt-2">
                                    <small class="text-muted" style="font-size: 15px;">
                                        <i class="fas fa-arrow-down text-success me-1"></i>
                                        ${formatCurrencyDisplay(savingsAmount, 'EUR')} tasarruf potansiyeli
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card h-100 border-primary border-2 shadow">
                            <div class="card-body p-3">
                                <div class="d-flex align-items-center justify-content-between mb-2">
                                    <div class="d-flex align-items-center">
                                        <div class="bg-primary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 32px; height: 32px;">
                                            <i class="fas fa-star text-primary" style="font-size: 16px; line-height: 1;"></i>
                                        </div>
                                        <span class="fw-bold text-primary" style="font-size: 15px;">Önerilen Teklifler</span>
                                    </div>
                                    <div class="text-end">
                                        <div class="fw-bold text-primary" style="font-size: 20px; line-height: 1;">${formatCurrencyDisplay(totalRecommendedAmountEUR, 'EUR')}</div>
                                        <div class="text-muted" style="font-size: 11px;">Euro Karşılığı</div>
                                    </div>
                                </div>
                                ${recommendedCurrencyDisplay ? `<div class="border-top pt-2"><small class="text-muted" style="font-size: 15px;">${recommendedCurrencyDisplay}</small></div>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Show only the recommended offers card
            financialCardHTML = `
                <div class="row g-3 mb-3">
                    <div class="col-md-12">
                        <div class="card h-100 border-primary border-2 shadow">
                            <div class="card-body p-3">
                                <div class="d-flex align-items-center justify-content-between mb-2">
                                    <div class="d-flex align-items-center">
                                        <div class="bg-primary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 32px; height: 32px;">
                                            <i class="fas fa-star text-primary" style="font-size: 16px; line-height: 1;"></i>
                                        </div>
                                        <span class="fw-bold text-primary" style="font-size: 15px;">Önerilen Teklifler</span>
                                    </div>
                                    <div class="text-end">
                                        <div class="fw-bold text-primary" style="font-size: 20px; line-height: 1;">${formatCurrencyDisplay(totalRecommendedAmountEUR, 'EUR')}</div>
                                        <div class="text-muted" style="font-size: 11px;">Euro Karşılığı</div>
                                    </div>
                                </div>
                                ${recommendedCurrencyDisplay ? `<div class="border-top pt-2"><small class="text-muted" style="font-size: 15px;">${recommendedCurrencyDisplay}</small></div>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Add the custom financial summary section
        displayModal.addCustomSection({
            id: 'financial-summary',
            title: 'Mali Özet',
            icon: 'fas fa-calculator',
            iconColor: 'text-info',
            customContent: financialCardHTML
        });
    }
    
    // Add rejection comments section if there are any
    const rejectionComments = getRejectionComments(currentRequest);
    if (rejectionComments.length > 0) {
        displayModal.addSection({
            id: 'rejection-comments',
            title: 'Reddetme Gerekçeleri',
            icon: 'fas fa-times-circle',
            iconColor: 'text-danger',
            fields: rejectionComments.map((comment, index) => ({
                id: `rejection_${index}`,
                label: `${comment.approver} - ${comment.stage}`,
                value: comment.comment,
                icon: 'fas fa-comment-alt',
                colSize: 12
            }))
        });
    }
    
    // Add comparison table if there are offers
    if (currentRequest.offers && currentRequest.offers.length > 0) {
        // Add comparison table section using custom content
        displayModal.addCustomSection({
            id: 'comparison-table-section',
            title: 'Teklif Karşılaştırma Tablosu',
            icon: 'fas fa-chart-bar',
            iconColor: 'text-primary',
            customContent: '<div id="modal-comparison-table-container"></div>'
        });
    }
    
    // Render the modal
    displayModal.render();
    
    // Initialize comparison table after rendering if there are offers
    if (currentRequest.offers && currentRequest.offers.length > 0) {
        // Clean up the existing comparison table instance
        if (comparisonTable) {
            comparisonTable = null;
        }
        
        // Create a new comparison table instance for the modal
        comparisonTable = new ComparisonTable('modal-comparison-table-container', {
            currencyRates: currencyRates,
            currencySymbols: currencySymbols,
            showRecommendations: false,
            showSummary: false,
            showSummaryRow: true,
            showEuroTotal: false,
            columnOrder: ['unitPrice', 'originalTotal', 'deliveryDays'],
            autoSave: null,
            onRecommendationChange: null,
            onSupplierRecommendAll: null,
            onShowFiles: (itemIndex, files, item) => showFilesModal(files, item),
            onShowSpecifications: (itemIndex, specifications, itemDescription, item) => showSpecificationsModal(specifications, itemDescription, item)
        });
        
        // Render the comparison table with the current request data
        renderComparisonTableForModal(comparisonTable);
    }
    
    // Add action buttons to modal footer
    const shouldShowButtons = currentRequest.status === 'submitted' && !userHasDecided;
    if (shouldShowButtons) {
        const modalFooter = displayModal.container.querySelector('.modal-footer');
        const actionButtons = document.createElement('div');
        actionButtons.className = 'd-flex gap-2';
        actionButtons.innerHTML = `
            <button type="button" class="btn btn-danger" id="reject-request" style="min-width: 120px; height: 38px;">
                <i class="fas fa-times me-1"></i>Reddet
            </button>
            <button type="button" class="btn btn-success" id="approve-request" style="min-width: 120px; height: 38px;">
                <i class="fas fa-check me-1"></i>Onayla
            </button>
        `;
        modalFooter.appendChild(actionButtons);
        
        // Add event listeners for the action buttons
        const approveBtn = actionButtons.querySelector('#approve-request');
        const rejectBtn = actionButtons.querySelector('#reject-request');
        
        if (approveBtn) {
            approveBtn.addEventListener('click', () => {
                if (currentRequest) {
                    approveRequest(currentRequest.id);
                }
            });
        }
        
        if (rejectBtn) {
            rejectBtn.addEventListener('click', () => {
                if (currentRequest) {
                    rejectRequest(currentRequest.id);
                }
            });
        }
    }
    
    // Turn off loading state and show the modal
    displayModal.setLoading(false);
    displayModal.show();
}

async function openModalFromTalepNo(talepNo) {
    try {
        // Find the request with the matching talep no in current requests
        const request = requests.find(r => r.request_number === talepNo);
        if (request) {
            await viewRequestDetails(request.id);
        } else {
            // If not found in current requests, try to search for it using the API
            try {
                const searchResponse = await getPurchaseRequests({ request_number: talepNo });
                if (searchResponse && searchResponse.results && searchResponse.results.length > 0) {
                    const foundRequest = searchResponse.results[0];
                    await viewRequestDetails(foundRequest.id);
                } else {
                    showNotification(`Talep ${talepNo} bulunamadı`, 'error');
                }
            } catch (error) {
                console.error('Request not found:', error);
                showNotification(`Talep ${talepNo} bulunamadı`, 'error');
            }
        }
    } catch (error) {
        console.error('Error opening modal from talep no:', error);
        showNotification('Talep detayları açılırken hata oluştu', 'error');
    }
}

function renderComparisonTable() {
    if (!currentRequest.offers || currentRequest.offers.length === 0 || !currentRequest.request_items || currentRequest.request_items.length === 0) {
        return;
    }

    // Transform the data to match the component's expected format
    const items = currentRequest.request_items.map(item => ({
        id: item.id,
        name: item.item.name,
        code: item.item.code,
        quantity: item.quantity,
        unit: item.item.unit,
        specifications: item.specifications || '',
        item_description: item.item_description || item.item?.description || '',
        job_no: item.allocations && item.allocations.length > 0 
            ? item.allocations.map(allocation => allocation.job_no).join(', ')
            : '-',
        files: item.files || [] // Include files from the request item
    }));

    const suppliers = currentRequest.offers.map(offer => ({
        id: offer.supplier.id,
        name: offer.supplier.name,
        default_currency: offer.currency
    }));

    // Transform offers to match component format
    const offers = {};
    const itemRecommendations = {};

    currentRequest.offers.forEach(offer => {
        offers[offer.supplier.id] = {};
        
        currentRequest.request_items.forEach((requestItem, itemIndex) => {
            const itemOffer = offer.item_offers.find(io => io.purchase_request_item === requestItem.id);
            
            if (itemOffer && itemOffer.unit_price && parseFloat(itemOffer.unit_price) > 0) {
                offers[offer.supplier.id][itemIndex] = {
                    unitPrice: parseFloat(itemOffer.unit_price),
                    totalPrice: parseFloat(itemOffer.unit_price) * requestItem.quantity,
                    deliveryDays: itemOffer.delivery_days || null,
                    notes: itemOffer.notes || null
                };

                // Track recommendations
                if (itemOffer.is_recommended) {
                    itemRecommendations[itemIndex] = offer.supplier.id;
                }
            }
        });
    });

    // Update the comparison table with the transformed data
    comparisonTable.setData({
        items: items,
        suppliers: suppliers,
        offers: offers,
        itemRecommendations: itemRecommendations
    });
    
    // Make the comparison table instance globally accessible for clickable headers
    window.comparisonTableInstance = comparisonTable;
    
    // Set default column minimization for pending page AFTER data is loaded
    // "Birim" (Unit), "Teslim" (Delivery Days), and "Dosyalar" (Files) columns should be minimized by default
    comparisonTable.setColumnMinimization('unit', true); // Minimize Unit column
    comparisonTable.setColumnMinimization('deliveryDays', true); // Minimize Delivery Days column
    comparisonTable.setColumnMinimization('files', true); // Minimize Files column
}

function renderComparisonTableForModal(modalComparisonTable) {
    if (!currentRequest.offers || currentRequest.offers.length === 0 || !currentRequest.request_items || currentRequest.request_items.length === 0) {
        return;
    }

    // Transform the data to match the component's expected format
    const items = currentRequest.request_items.map(item => ({
        id: item.id,
        name: item.item.name,
        code: item.item.code,
        quantity: item.quantity,
        unit: item.item.unit,
        specifications: item.specifications || '',
        item_description: item.item_description || item.item?.description || '',
        job_no: item.allocations && item.allocations.length > 0 
            ? item.allocations.map(allocation => allocation.job_no).join(', ')
            : '-',
        files: item.files || [] // Include files from the request item
    }));

    const suppliers = currentRequest.offers.map(offer => ({
        id: offer.supplier.id,
        name: offer.supplier.name,
        default_currency: offer.currency
    }));

    // Transform offers to match component format
    const offers = {};
    const itemRecommendations = {};

    currentRequest.offers.forEach(offer => {
        offers[offer.supplier.id] = {};
        
        currentRequest.request_items.forEach((requestItem, itemIndex) => {
            const itemOffer = offer.item_offers.find(io => io.purchase_request_item === requestItem.id);
            
            if (itemOffer && itemOffer.unit_price && parseFloat(itemOffer.unit_price) > 0) {
                offers[offer.supplier.id][itemIndex] = {
                    unitPrice: parseFloat(itemOffer.unit_price),
                    totalPrice: parseFloat(itemOffer.unit_price) * requestItem.quantity,
                    deliveryDays: itemOffer.delivery_days || null,
                    notes: itemOffer.notes || null
                };

                // Track recommendations
                if (itemOffer.is_recommended) {
                    itemRecommendations[itemIndex] = offer.supplier.id;
                }
            }
        });
    });

    // Update the comparison table with the transformed data
    modalComparisonTable.setData({
        items: items,
        suppliers: suppliers,
        offers: offers,
        itemRecommendations: itemRecommendations
    });
    
    // Make the comparison table instance globally accessible for clickable headers
    window.comparisonTableInstance = modalComparisonTable;
    
    // Set default column minimization for pending page AFTER data is loaded
    modalComparisonTable.setColumnMinimization('unit', true);
    modalComparisonTable.setColumnMinimization('deliveryDays', true);
    modalComparisonTable.setColumnMinimization('files', true);
}

// Update comparison table currency rates when they change
function updateComparisonTableRates() {
    if (comparisonTable && currencyRates) {
        comparisonTable.setCurrencyRates(currencyRates);
    }
}

// Action functions
async function approveRequest(requestId) {
    // Clean up any existing approval modal first
    if (currentApprovalModal && currentApprovalModal.modal) {
        const existingModalInstance = bootstrap.Modal.getInstance(currentApprovalModal.modal);
        if (existingModalInstance) {
            existingModalInstance.hide();
        }
        // Find and remove the existing container
        const existingContainers = document.querySelectorAll('[id^="approve-confirmation-modal-"]');
        existingContainers.forEach(container => {
            cleanupApprovalModal(container.id);
        });
    }
    
    // Find the request to show details
    const request = requests.find(r => r.id === parseInt(requestId));
    
    // Build details HTML
    const detailsHtml = request ? `
        <div class="row g-2">
            <div class="col-6">
                <strong>Talep No:</strong> ${request.request_number || '-'}
            </div>
            <div class="col-6">
                <strong>Talep Eden:</strong> ${request.requestor_username || '-'}
            </div>
            ${request.title ? `
                <div class="col-12">
                    <strong>Başlık:</strong> ${request.title}
                </div>
            ` : ''}
            ${request.total_amount_eur ? `
                <div class="col-6">
                    <strong>Toplam Tutar:</strong> ${formatCurrency(request.total_amount_eur, 'EUR')}
                </div>
            ` : ''}
        </div>
    ` : '';
    
    // Create a unique container ID for this modal instance
    const modalId = `approve-confirmation-modal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const containerId = `${modalId}-container`;
    
    // Create a new container element for this modal
    const container = document.createElement('div');
    container.id = containerId;
    document.body.appendChild(container);
    
    // Create a new confirmation modal instance
    const approveConfirmationModal = new ConfirmationModal(containerId, {
        title: 'Talep Onayı',
        icon: 'fas fa-check-circle',
        confirmText: 'Evet, Onayla',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-success'
    });
    
    // Store reference to current modal
    currentApprovalModal = approveConfirmationModal;
    
    // Set up cleanup when modal is hidden
    approveConfirmationModal.modal.addEventListener('hidden.bs.modal', () => {
        cleanupApprovalModal(containerId);
    });
    
    // Show confirmation modal
    approveConfirmationModal.show({
        title: 'Talep Onayı',
        message: 'Bu talebi onaylamak istediğinizden emin misiniz?',
        description: '',
        details: detailsHtml,
        confirmText: 'Evet, Onayla',
        onConfirm: async () => {
            await confirmApproveRequest(requestId, approveConfirmationModal, containerId);
        },
        onCancel: () => {
            cleanupApprovalModal(containerId);
        }
    });
}

// Cleanup function to remove modal
function cleanupApprovalModal(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        // Remove Bootstrap modal instance if it exists
        const modalElement = container.querySelector('.modal');
        if (modalElement) {
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            if (modalInstance) {
                modalInstance.dispose();
            }
        }
        // Remove the container from DOM
        container.remove();
    }
    // Clear reference
    if (currentApprovalModal) {
        currentApprovalModal = null;
    }
}

// Confirm approve request
async function confirmApproveRequest(requestId, approveConfirmationModal, containerId) {
    // Get the button and disable it
    const confirmBtn = approveConfirmationModal.modal.querySelector('#confirm-action-btn');
    const originalContent = confirmBtn ? confirmBtn.innerHTML : '';
    
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Onaylanıyor...';
    }
    
    try {
        await approvePurchaseRequest(requestId);
        showNotification('Talep başarıyla onaylandı', 'success');
        
        // Close the confirmation modal
        if (approveConfirmationModal) {
            approveConfirmationModal.hide();
        }
        
        // Cleanup the modal after a short delay to allow animation to complete
        setTimeout(() => {
            cleanupApprovalModal(containerId);
        }, 300);
        
        // Close the display modal if it's open
        if (displayModal) {
            displayModal.hide();
            // Clean up backdrops after hiding
            setTimeout(() => {
                cleanupBackdrops();
            }, 300);
        }
        
        await loadRequests();
    } catch (error) {
        console.error('Error approving request:', error);
        showNotification('Talep onaylanırken hata oluştu: ' + error.message, 'error');
        
        // Re-enable button on error
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = originalContent;
        }
    }
}

async function rejectRequest(requestId) {
    // Store the request ID for the modal
    window.currentRejectRequestId = requestId;
    
    // Show the rejection modal
    const rejectModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('rejectRequestModal'));
    rejectModal.show();
}



// Utility functions
function getStatusBadge(status, statusLabel) {
    // Use status_label from response if available, otherwise fallback to status
    const displayText = statusLabel || status;
    
    // Keep the CSS class mapping for styling
    const statusMap = {
        'draft': 'status-grey',
        'submitted': 'status-yellow',
        'approved': 'status-green',
        'cancelled': 'status-red'
    };

    const statusClass = statusMap[status] || 'status-grey';
    return `<span class="status-badge ${statusClass}">${displayText}</span>`;
}

function getStatusBadgeClass(status) {
    const statusMap = {
        'draft': 'bg-secondary',
        'submitted': 'bg-warning',
        'approved': 'bg-success',
        'cancelled': 'bg-danger'
    };
    return statusMap[status] || 'bg-secondary';
}

function getPriorityText(priority) {
    const priorityMap = {
        'normal': 'Normal',
        'urgent': 'Acil',
        'critical': 'Kritik'
    };
    return priorityMap[priority] || priority;
}

function getPriorityBadgeClass(priority) {
    const priorityMap = {
        'normal': 'bg-primary',
        'urgent': 'bg-warning',
        'critical': 'bg-danger'
    };
    return priorityMap[priority] || 'bg-primary';
}

function getApprovalStatusText(request) {
    if (!request.approval || request.status !== 'submitted') {
        return '-';
    }

    const { stage_instances } = request.approval;
    
    // Find the current stage (first incomplete stage)
    const currentStage = stage_instances.find(stage => !stage.is_complete && !stage.is_rejected);
    
    if (!currentStage) {
        return 'Tamamlandı';
    }

    const { name, required_approvals, approved_count, approvers } = currentStage;
    const remainingApprovals = required_approvals - approved_count;
    
    if (remainingApprovals <= 0) {
        return name;
    }

    // Get the names of remaining approvers
    const remainingApprovers = approvers.slice(approved_count);
    const approverNames = remainingApprovers.map(approver => approver.full_name || approver.username).join(', ');
    
    return `${name} - ${remainingApprovals} onay bekleniyor (${approverNames})`;
}

function getPriorityBadge(priority) {
    const priorityMap = {
        'normal': { text: 'Normal', class: 'status-grey' },
        'urgent': { text: 'Acil', class: 'status-yellow' },
        'critical': { text: 'Kritik', class: 'status-red' }
    };

    const priorityInfo = priorityMap[priority] || { text: priority, class: 'status-grey' };
    return `<span class="status-badge ${priorityInfo.class}">${priorityInfo.text}</span>`;
}

function getApprovalInfo(request) {
    if (!request.approval || request.status !== 'submitted') {
        return '<span style="color: #6c757d;">-</span>';
    }

    const { stage_instances } = request.approval;
    
    // Find the current stage (first incomplete stage)
    const currentStage = stage_instances.find(stage => !stage.is_complete && !stage.is_rejected);
    
    if (!currentStage) {
        return '<span style="color: #198754;"><i class="fas fa-check-circle me-1"></i>Tamamlandı</span>';
    }

    const { name, required_approvals, approved_count, approvers } = currentStage;
    const remainingApprovals = required_approvals - approved_count;
    
    if (remainingApprovals <= 0) {
        return `<span style="color: #198754;"><i class="fas fa-check-circle me-1"></i>${name}</span>`;
    }

    // Get the names of remaining approvers
    const remainingApprovers = approvers.slice(approved_count);
    const approverNames = remainingApprovers.map(approver => approver.full_name || approver.username).join(', ');
    
    return `
        <div style="line-height: 1.3; text-align: middle;">
            <div style="font-size: 0.85rem; margin-bottom: 0.25rem; color: #0d6efd; font-weight: 600; text-align: middle;">${name}</div>
            <div style="font-size: 0.75rem; margin-bottom: 0.25rem; color: #6c757d; text-align: middle;">
                <i class="fas fa-users me-1"></i>
                ${remainingApprovals} onay bekleniyor
            </div>
            ${approverNames ? `
                <div style="font-size: 0.7rem; line-height: 1.2; word-wrap: break-word; color: #6c757d; text-align: middle;">
                    <i class="fas fa-user-clock me-1"></i>
                    ${approverNames}
                </div>
            ` : ''}
        </div>
    `;
}

function getRejectionComments(request) {
    if (!request.approval || !request.approval.stage_instances) {
        return [];
    }

    const rejectionComments = [];
    
    request.approval.stage_instances.forEach(stage => {
        if (stage.decisions) {
            stage.decisions.forEach(decision => {
                if (decision.decision === "reject" && decision.comment) {
                    rejectionComments.push({
                        stage: stage.name,
                        approver: decision.approver_detail?.full_name || decision.approver_detail?.username || 'Bilinmeyen',
                        comment: decision.comment,
                        date: decision.decided_at
                    });
                }
            });
        }
    });
    
    return rejectionComments;
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

function formatDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('tr-TR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatCurrency(amount, currency) {
    if (!amount) return '-';
    return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

function convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return amount;
    
    if (!currencyRates) return amount;
    
    // Convert amount to number
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return 0;
    
    // Since rates are TRY-based (how much TRY for 1 unit of currency)
    // To convert fromCurrency to toCurrency:
    // 1. Convert fromCurrency to TRY: amount / rate[fromCurrency]
    // 2. Convert TRY to toCurrency: (amount / rate[fromCurrency]) * rate[toCurrency]
    return (numAmount / currencyRates[fromCurrency]) * currencyRates[toCurrency];
}

function formatCurrencyDisplay(amount, currency) {
    if (!amount || isNaN(amount)) return '-';
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return '-';
    
    const symbol = currencySymbols[currency] || currency;
    return `${symbol}${numAmount.toFixed(2)}`;
}


function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

function showFilesModal(files, item) {
    // Create or get the files modal container
    let modalContainer = document.getElementById('files-modal-container');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'files-modal-container';
        document.body.appendChild(modalContainer);
    }
    
    // Destroy existing modal if it exists
    if (filesModal) {
        filesModal.destroy();
    }
    
    // Create a new DisplayModal for files
    filesModal = new DisplayModal('files-modal-container', {
        title: `Dosya Ekleri - ${item.name || item.code || 'Ürün'}`,
        icon: 'fas fa-paperclip',
        size: 'lg',
        showEditButton: false
    });
    
    // Add custom section for file attachments
    filesModal.addCustomSection({
        id: 'files-section',
        title: 'Dosyalar',
        icon: 'fas fa-paperclip',
        iconColor: 'text-info',
        customContent: '<div id="files-attachments-container"></div>'
    });
    
    // Render the modal
    filesModal.render();
    
    // Initialize FileAttachments component after modal is rendered
    setTimeout(() => {
        const filesContainer = document.getElementById('files-attachments-container');
        if (filesContainer) {
            const fileAttachments = new FileAttachments('files-attachments-container', {
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
                },
                onDownloadClick: (fileUrl, fileName) => {
                    // Force download by creating a blob and downloading it
                    fetch(fileUrl)
                        .then(response => response.blob())
                        .then(blob => {
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = fileName;
                            link.style.display = 'none';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(url);
                        })
                        .catch(error => {
                            console.error('Download failed:', error);
                            // Fallback to direct link
                            const link = document.createElement('a');
                            link.href = fileUrl;
                            link.download = fileName;
                            link.target = '_blank';
                            link.click();
                        });
                }
            });
            
            // Set files data
            fileAttachments.setFiles(files || []);
        }
    }, 100);
    
    // Show the modal
    filesModal.show();
    
    // Setup cleanup on close
    filesModal.onCloseCallback(() => {
        setTimeout(() => {
            cleanupBackdrops();
        }, 300);
    });
}

function showSpecificationsModal(specifications, itemDescription, item) {
    // Create or get the specifications modal container
    let modalContainer = document.getElementById('specifications-modal-container');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'specifications-modal-container';
        document.body.appendChild(modalContainer);
    }
    
    // Destroy existing modal if it exists
    let specsModal = null;
    const existingModal = document.querySelector('#specifications-modal-container .modal');
    if (existingModal) {
        const existingInstance = bootstrap.Modal.getInstance(existingModal);
        if (existingInstance) {
            existingInstance.dispose();
        }
    }
    
    // Create a new DisplayModal for specifications
    specsModal = new DisplayModal('specifications-modal-container', {
        title: `Teknik Özellikler - ${item.name || item.code || 'Ürün'}`,
        icon: 'fas fa-comment-dots',
        size: 'lg',
        showEditButton: false
    });
    
    // Add sections for description and specifications
    if (itemDescription && itemDescription.trim()) {
        specsModal.addSection({
            id: 'description-section',
            title: 'Ürün Açıklaması',
            icon: 'fas fa-align-left',
            iconColor: 'text-primary',
            fields: [{
                id: 'item_description',
                label: 'Açıklama',
                value: itemDescription,
                colSize: 12
            }]
        });
    }
    
    if (specifications && specifications.trim()) {
        specsModal.addSection({
            id: 'specifications-section',
            title: 'Özellikler',
            icon: 'fas fa-cogs',
            iconColor: 'text-info',
            fields: [{
                id: 'specifications',
                label: 'Teknik Özellikler',
                value: specifications,
                colSize: 12
            }]
        });
    }
    
    // Render and show the modal
    specsModal.render();
    specsModal.show();
    
    // Setup cleanup on close
    specsModal.onCloseCallback(() => {
        setTimeout(() => {
            cleanupBackdrops();
        }, 300);
    });
}

function cleanupBackdrops() {
    // Remove all Bootstrap modal backdrops that might be lingering
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => {
        backdrop.remove();
    });
    
    // Remove any body classes that Bootstrap modals might have added
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
}

// Make functions globally available for onclick handlers
window.viewRequestDetails = viewRequestDetails;
window.approveRequest = approveRequest;
window.rejectRequest = rejectRequest;
