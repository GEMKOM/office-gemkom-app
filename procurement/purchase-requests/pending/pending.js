import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { ComparisonTable } from '../../../components/comparison-table/comparison-table.js';
import { TableComponent } from '../../../components/table/table.js';


import { 
    getPurchaseRequests, 
    getPendingApprovalRequests,
    getApprovedByMeRequests,
    getPurchaseRequest, 
    approvePurchaseRequest, 
    rejectPurchaseRequest
} from '../../../generic/procurement.js';
import { fetchCurrencyRates } from '../../../generic/formatters.js';

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

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Fetch currency rates
    currencyRates = await fetchCurrencyRates();
    
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
        onSupplierRecommendAll: null // No bulk recommendations needed for pending page
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
    // Modal approve and reject buttons
    const approveBtn = document.getElementById('approve-request');
    if (approveBtn) {
        approveBtn.addEventListener('click', () => {
            if (currentRequest) {
                approveRequest(currentRequest.id);
            }
        });
    }
    
    const rejectBtn = document.getElementById('reject-request');
    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => {
            if (currentRequest) {
                rejectRequest(currentRequest.id);
            }
        });
    }
    
    // Add event listeners for modal close to clean up URL
    const modal = document.getElementById('requestDetailsModal');
    if (modal) {
        modal.addEventListener('hidden.bs.modal', () => {
            // Remove the talep parameter from URL when modal is closed
            const url = new URL(window.location);
            url.searchParams.delete('talep');
            window.history.pushState({}, '', url);
        });
    }
}



async function viewRequestDetails(requestId) {
    try {
        currentRequest = await getPurchaseRequest(requestId);
        await showRequestDetailsModal();
        
        // Update URL to include the talep no (request number)
        const url = new URL(window.location);
        url.searchParams.set('talep', currentRequest.request_number);
        window.history.pushState({}, '', url);
    } catch (error) {
        console.error('Error loading request details:', error);
        showNotification('Talep detayları yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

async function showRequestDetailsModal() {
    const container = document.getElementById('request-details-container');
    
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
    
    // Hide approve/reject buttons if user has already decided or if request is not in submitted status
    const approveBtn = document.getElementById('approve-request');
    const rejectBtn = document.getElementById('reject-request');
    
    if (approveBtn && rejectBtn) {
        const shouldShowButtons = currentRequest.status === 'submitted' && !userHasDecided;
        approveBtn.style.display = shouldShowButtons ? 'inline-block' : 'none';
        rejectBtn.style.display = shouldShowButtons ? 'inline-block' : 'none';
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
    
    // Build the cards HTML
    let cardsHTML = '';
    
    if (hasLowerPrices) {
        // Show both cards when there are lower prices
        cardsHTML = `
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
                                    <div class="bg-secondary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 32px; height: 32px;">
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
        // Show only the recommended offers card when there are no lower prices
        cardsHTML = `
            <div class="row g-3 mb-3">
                <div class="col-md-12">
                    <div class="card h-100 border-primary border-2 shadow">
                        <div class="card-body p-3">
                            <div class="d-flex align-items-center justify-content-between mb-2">
                                <div class="d-flex align-items-center">
                                    <div class="bg-secondary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 32px; height: 32px;">
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
    
    container.innerHTML = cardsHTML;

    // Show comparison table if there are offers
    if (currentRequest.offers && currentRequest.offers.length > 0) {
        updateComparisonTableRates(); // Update currency rates first
        renderComparisonTable();
        document.getElementById('comparison-table-section').style.display = 'block';
    } else {
        document.getElementById('comparison-table-section').style.display = 'none';
    }

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('requestDetailsModal'));
    modal.show();
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
        job_no: item.allocations && item.allocations.length > 0 
            ? item.allocations.map(allocation => allocation.job_no).join(', ')
            : '-'
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
    // "Birim" (Unit) and "Teslim" (Delivery Days) columns should be minimized by default
    comparisonTable.setColumnMinimization('unit', true); // Minimize Unit column
    comparisonTable.setColumnMinimization('deliveryDays', true); // Minimize Delivery Days column
}

// Update comparison table currency rates when they change
function updateComparisonTableRates() {
    if (comparisonTable && currencyRates) {
        comparisonTable.setCurrencyRates(currencyRates);
    }
}

// Action functions
async function approveRequest(requestId) {
    if (!confirm('Bu talebi onaylamak istediğinizden emin misiniz?')) {
        return;
    }

    try {
        await approvePurchaseRequest(requestId);
        showNotification('Talep başarıyla onaylandı', 'success');
        
        // Close the modal
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('requestDetailsModal'));
        if (modal) {
            modal.hide();
        }
        
        await loadRequests();
    } catch (error) {
        console.error('Error approving request:', error);
        showNotification('Talep onaylanırken hata oluştu: ' + error.message, 'error');
    }
}

async function rejectRequest(requestId) {
    if (!confirm('Bu talebi reddetmek istediğinizden emin misiniz?')) {
        return;
    }

    try {
        await rejectPurchaseRequest(requestId);
        showNotification('Talep başarıyla reddedildi', 'success');
        
        // Close the modal
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('requestDetailsModal'));
        if (modal) {
            modal.hide();
        }
        
        await loadRequests();
    } catch (error) {
        console.error('Error rejecting request:', error);
        showNotification('Talep reddedilirken hata oluştu: ' + error.message, 'error');
    }
}



// Utility functions
function getStatusBadge(status, statusLabel) {
    // Use status_label from response if available, otherwise fallback to status
    const displayText = statusLabel || status;
    
    // Keep the CSS class mapping for styling
    const statusMap = {
        'draft': 'status-draft',
        'submitted': 'status-submitted',
        'approved': 'status-completed',
        'rejected': 'status-cancelled'
    };

    const statusClass = statusMap[status] || 'status-draft';
    return `<span class="status-badge ${statusClass}">${displayText}</span>`;
}

function getPriorityBadge(priority) {
    const priorityMap = {
        'normal': { text: 'Normal', class: 'priority-normal' },
        'urgent': { text: 'Acil', class: 'priority-urgent' },
        'critical': { text: 'Kritik', class: 'priority-critical' }
    };

    const priorityInfo = priorityMap[priority] || { text: priority, class: 'priority-normal' };
    return `<span class="priority-badge ${priorityInfo.class}">${priorityInfo.text}</span>`;
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

// Make functions globally available for onclick handlers
window.viewRequestDetails = viewRequestDetails;
window.approveRequest = approveRequest;
window.rejectRequest = rejectRequest;
