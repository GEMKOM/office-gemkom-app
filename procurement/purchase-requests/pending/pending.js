import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { ComparisonTable } from '../../../components/comparison-table/comparison-table.js';


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
        initializeSortableHeaders();
        initializeApprovedSortableHeaders();
        
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



function initializeSortableHeaders() {
    const sortableHeaders = document.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault();
            const field = header.dataset.field;
            handleSort(field);
        });
    });
    
    // Update sort indicators for initial state
    updateSortIndicators();
}

function initializeApprovedSortableHeaders() {
    const sortableHeaders = document.querySelectorAll('.sortable-approved');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            e.preventDefault();
            const field = header.dataset.field;
            handleApprovedSort(field);
        });
    });
    
    // Update sort indicators for initial state
    updateApprovedSortIndicators();
}

function updateSortIndicators() {
    const sortableHeaders = document.querySelectorAll('.sortable');
    const hasRequests = requests && requests.length > 0;
    
    sortableHeaders.forEach(header => {
        const field = header.dataset.field;
        const icon = header.querySelector('.sort-icon');
        
        if (!hasRequests) {
            // Disable sorting when no requests
            header.style.pointerEvents = 'none';
            header.style.opacity = '0.5';
            icon.className = 'fas fa-sort sort-icon text-muted';
        } else {
            // Enable sorting when there are requests
            header.style.pointerEvents = 'auto';
            header.style.opacity = '1';
            
            if (field === currentSortField) {
                // Show active sort indicator
                if (currentSortDirection === 'asc') {
                    icon.className = 'fas fa-sort-up sort-icon text-primary';
                } else {
                    icon.className = 'fas fa-sort-down sort-icon text-primary';
                }
            } else {
                // Show inactive sort indicator
                icon.className = 'fas fa-sort sort-icon text-muted';
            }
        }
    });
}

function updateApprovedSortIndicators() {
    const sortableHeaders = document.querySelectorAll('.sortable-approved');
    const hasRequests = approvedRequests && approvedRequests.length > 0;
    
    sortableHeaders.forEach(header => {
        const field = header.dataset.field;
        const icon = header.querySelector('.sort-icon');
        
        if (!hasRequests) {
            // Disable sorting when no requests
            header.style.pointerEvents = 'none';
            header.style.opacity = '0.5';
            icon.className = 'fas fa-sort sort-icon text-muted';
        } else {
            // Enable sorting when there are requests
            header.style.pointerEvents = 'auto';
            header.style.opacity = '1';
            
            if (field === approvedCurrentSortField) {
                // Show active sort indicator
                if (approvedCurrentSortDirection === 'asc') {
                    icon.className = 'fas fa-sort-up sort-icon text-primary';
                } else {
                    icon.className = 'fas fa-sort-down sort-icon text-primary';
                }
            } else {
                // Show inactive sort indicator
                icon.className = 'fas fa-sort sort-icon text-muted';
            }
        }
    });
}

async function loadRequests() {
    if (isLoading) return;
    
    try {
        isLoading = true;
        showLoading(true);
        showLoadingState();
        
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
        
        // Update the table (no need for client-side sorting or pagination)
        renderRequestsTable(requests);
        renderPagination();
        updateSortIndicators();
        
    } catch (error) {
        console.error('Error loading requests:', error);
        showNotification('Onay bekleyen talepler yüklenirken hata oluştu: ' + error.message, 'error');
        requests = [];
        totalRequests = 0;
        renderRequestsTable([]);
        renderPagination();
        updateSortIndicators();
    } finally {
        isLoading = false;
        showLoading(false);
    }
}

async function loadApprovedRequests() {
    if (isLoadingApproved) return;
    
    try {
        isLoadingApproved = true;
        showLoading(true);
        showApprovedLoadingState();
        
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
        
        // Update the table
        renderApprovedRequestsTable(approvedRequests);
        renderApprovedPagination();
        updateApprovedSortIndicators();
        
    } catch (error) {
        console.error('Error loading approved requests:', error);
        showNotification('Onayladığınız talepler yüklenirken hata oluştu: ' + error.message, 'error');
        approvedRequests = [];
        totalApprovedRequests = 0;
        renderApprovedRequestsTable([]);
        renderApprovedPagination();
        updateApprovedSortIndicators();
    } finally {
        isLoadingApproved = false;
        showLoading(false);
    }
}



// Client-side sorting and pagination removed - now handled by backend

function renderRequestsTable(requests) {
    const tbody = document.getElementById('pending-requests-table-body');
    
    if (!requests || requests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">
                    <div class="empty-state">
                        <i class="fas fa-check-circle"></i>
                        <h5>Onay bekleyen talep bulunmuyor</h5>
                        <p>Onayınızı bekleyen satın alma talebi bulunmamaktadır.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = requests.map(request => `
        <tr data-request-id="${request.id}">
            <td>
                <span class="request-number">${request.request_number || 'N/A'}</span>
            </td>
            <td>
                <div class="request-title">${request.title || 'Başlıksız'}</div>
                <small>${request.description || 'Açıklama yok'}</small>
            </td>
            <td>
                <div class="requestor-name">
                    <i class="fas fa-user-circle me-2 text-muted"></i>
                    ${request.requestor_username || 'Bilinmiyor'}
                </div>
            </td>
            <td class="text-center">${getStatusBadge(request.status, request.status_label)}</td>
            <td class="text-center">${getPriorityBadge(request.priority)}</td>
            <td>
                <div class="total-amount">${request.total_amount_eur ? formatCurrency(request.total_amount_eur, 'EUR') : '-'}</div>
            </td>
            <td>
                <div class="created-date">${formatDate(request.created_at)}</div>
            </td>
            <td>
                <div class="approval-info">
                    ${getApprovalInfo(request)}
                </div>
            </td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button class="btn btn-outline-primary btn-sm" onclick="viewRequestDetails(${request.id})" 
                            title="Detayları Görüntüle">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${request.status === 'submitted' ? `
                        <button class="btn btn-outline-success btn-sm" onclick="approveRequest(${request.id})" 
                                title="Onayla">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="rejectRequest(${request.id})" 
                                title="Reddet">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
    

}

function renderApprovedRequestsTable(requests) {
    const tbody = document.getElementById('approved-requests-table-body');
    
    if (!requests || requests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">
                    <div class="empty-state">
                        <i class="fas fa-check-circle"></i>
                        <h5>Onayladığınız talep bulunmuyor</h5>
                        <p>Henüz onayladığınız satın alma talebi bulunmamaktadır.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = requests.map(request => `
        <tr data-request-id="${request.id}">
            <td>
                <span class="request-number">${request.request_number || 'N/A'}</span>
            </td>
            <td>
                <div class="request-title">${request.title || 'Başlıksız'}</div>
                <small>${request.description || 'Açıklama yok'}</small>
            </td>
            <td>
                <div class="requestor-name">
                    <i class="fas fa-user-circle me-2 text-muted"></i>
                    ${request.requestor_username || 'Bilinmiyor'}
                </div>
            </td>
            <td class="text-center">${getStatusBadge(request.status, request.status_label)}</td>
            <td class="text-center">${getPriorityBadge(request.priority)}</td>
            <td>
                <div class="total-amount">${request.total_amount_eur ? formatCurrency(request.total_amount_eur, 'EUR') : '-'}</div>
            </td>
            <td>
                <div class="created-date">${formatDate(request.created_at)}</div>
            </td>
            <td>
                <div class="approval-info">
                    ${getApprovalInfo(request)}
                </div>
            </td>
            <td>
                <div class="btn-group btn-group-sm" role="group">
                    <button class="btn btn-outline-primary btn-sm" onclick="viewRequestDetails(${request.id})" 
                            title="Detayları Görüntüle">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderPagination() {
    const pagination = document.getElementById('pending-requests-pagination');
    const itemsPerPage = 20;
    const totalPages = Math.ceil(totalRequests / itemsPerPage);
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // Previous button
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage - 1}">
                <i class="fas fa-chevron-left"></i>
            </a>
        </li>
    `;
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `;
    }
    
    // Next button
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage + 1}">
                <i class="fas fa-chevron-right"></i>
            </a>
        </li>
    `;
    
    pagination.innerHTML = html;
    
    // Add event listeners
    const paginationLinks = pagination.querySelectorAll('.page-link[data-page]');
    paginationLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = parseInt(link.dataset.page);
            if (page >= 1 && page <= totalPages) {
                currentPage = page;
                loadRequests(); // This will now fetch the specific page from backend
            }
        });
    });
}

function renderApprovedPagination() {
    const pagination = document.getElementById('approved-requests-pagination');
    const itemsPerPage = 20;
    const totalPages = Math.ceil(totalApprovedRequests / itemsPerPage);
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // Previous button
    html += `
        <li class="page-item ${approvedCurrentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${approvedCurrentPage - 1}">
                <i class="fas fa-chevron-left"></i>
            </a>
        </li>
    `;
    
    // Page numbers
    const startPage = Math.max(1, approvedCurrentPage - 2);
    const endPage = Math.min(totalPages, approvedCurrentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === approvedCurrentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `;
    }
    
    // Next button
    html += `
        <li class="page-item ${approvedCurrentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${approvedCurrentPage + 1}">
                <i class="fas fa-chevron-right"></i>
            </a>
        </li>
    `;
    
    pagination.innerHTML = html;
    
    // Add event listeners
    const paginationLinks = pagination.querySelectorAll('.page-link[data-page]');
    paginationLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = parseInt(link.dataset.page);
            if (page >= 1 && page <= totalPages) {
                approvedCurrentPage = page;
                loadApprovedRequests();
            }
        });
    });
}

function handleSort(field) {
    if (currentSortField === field) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortDirection = 'asc';
    }
    
    currentOrdering = field;
    currentPage = 1; // Reset to first page when sorting changes
    loadRequests(); // This will now fetch sorted data from backend
    
    // Update sort indicators
    updateSortIndicators();
}

function handleApprovedSort(field) {
    if (approvedCurrentSortField === field) {
        approvedCurrentSortDirection = approvedCurrentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        approvedCurrentSortField = field;
        approvedCurrentSortDirection = 'asc';
    }
    
    approvedCurrentPage = 1; // Reset to first page when sorting changes
    loadApprovedRequests(); // This will now fetch sorted data from backend
    
    // Update sort indicators
    updateApprovedSortIndicators();
}

function setupEventListeners() {
    // Refresh pending requests
    const refreshPendingBtn = document.getElementById('refresh-pending-requests');
    if (refreshPendingBtn) {
        refreshPendingBtn.addEventListener('click', loadRequests);
    }
    
    // Refresh approved requests
    const refreshApprovedBtn = document.getElementById('refresh-approved-requests');
    if (refreshApprovedBtn) {
        refreshApprovedBtn.addEventListener('click', loadApprovedRequests);
    }
    
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
        showLoading(true);
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
        showLoading(false);
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

    const modal = new bootstrap.Modal(document.getElementById('requestDetailsModal'));
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
        unit: item.item.unit
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
        showLoading(true);
        await approvePurchaseRequest(requestId);
        showNotification('Talep başarıyla onaylandı', 'success');
        
        // Close the modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('requestDetailsModal'));
        if (modal) {
            modal.hide();
        }
        
        await loadRequests();
    } catch (error) {
        console.error('Error approving request:', error);
        showNotification('Talep onaylanırken hata oluştu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function rejectRequest(requestId) {
    if (!confirm('Bu talebi reddetmek istediğinizden emin misiniz?')) {
        return;
    }

    try {
        showLoading(true);
        await rejectPurchaseRequest(requestId);
        showNotification('Talep başarıyla reddedildi', 'success');
        
        // Close the modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('requestDetailsModal'));
        if (modal) {
            modal.hide();
        }
        
        await loadRequests();
    } catch (error) {
        console.error('Error rejecting request:', error);
        showNotification('Talep reddedilirken hata oluştu: ' + error.message, 'error');
    } finally {
        showLoading(false);
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
        return '<span class="text-muted">-</span>';
    }

    const { stage_instances } = request.approval;
    
    // Find the current stage (first incomplete stage)
    const currentStage = stage_instances.find(stage => !stage.is_complete && !stage.is_rejected);
    
    if (!currentStage) {
        return '<span class="text-success"><i class="fas fa-check-circle me-1"></i>Tamamlandı</span>';
    }

    const { name, required_approvals, approved_count, approvers } = currentStage;
    const remainingApprovals = required_approvals - approved_count;
    
    if (remainingApprovals <= 0) {
        return `<span class="text-success"><i class="fas fa-check-circle me-1"></i>${name}</span>`;
    }

    // Get the names of remaining approvers
    const remainingApprovers = approvers.slice(approved_count);
    const approverNames = remainingApprovers.map(approver => approver.full_name || approver.username).join(', ');
    
    return `
        <div class="approval-status">
            <div class="stage-name text-primary fw-semibold">${name}</div>
            <div class="approval-count text-muted small">
                <i class="fas fa-users me-1"></i>
                ${remainingApprovals} onay bekleniyor
            </div>
            ${approverNames ? `
                <div class="approver-names text-muted small">
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

function showLoading(show) {
    // Simple loading state - just disable/enable buttons
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        btn.disabled = show;
    });
}

function showLoadingState() {
    const tableBody = document.getElementById('pending-requests-table-body');
    if (tableBody) {
        // Create loading rows that maintain table structure
        const loadingRows = [];
        for (let i = 0; i < 5; i++) { // Show 5 loading rows
            loadingRows.push(`
                <tr class="loading-row">
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 200px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 150px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 80px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 80px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 120px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 150px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                </tr>
            `);
        }
        tableBody.innerHTML = loadingRows.join('');
    }
}

function showApprovedLoadingState() {
    const tableBody = document.getElementById('approved-requests-table-body');
    if (tableBody) {
        // Create loading rows that maintain table structure
        const loadingRows = [];
        for (let i = 0; i < 5; i++) { // Show 5 loading rows
            loadingRows.push(`
                <tr class="loading-row">
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 200px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 150px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 80px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 80px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 120px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 150px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                </tr>
            `);
        }
        tableBody.innerHTML = loadingRows.join('');
    }
}

function hideLoadingState() {
    // Loading state is cleared when table is rendered
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
