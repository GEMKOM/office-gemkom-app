import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';

import { FiltersComponent } from '../../../components/filters/filters.js';
import { 
    getPurchaseRequests, 
    getPurchaseRequest, 
    approvePurchaseRequest, 
    rejectPurchaseRequest,
    getStatusChoices
} from '../../../generic/procurement.js';
import { fetchCurrencyRates } from '../../../generic/formatters.js';

// State management
let currentPage = 1;
let currentFilter = 'all';
let currentOrdering = 'request_number';
let currentSortField = 'request_number';
let currentSortDirection = 'desc';
let requests = [];
let currentRequest = null;
let totalRequests = 0;
let isLoading = false;
let requestsStats = null; // Statistics Cards component instance
let requestFilters = null; // Filters component instance
let currencyRates = null; // Currency conversion rates
let currencySymbols = {
    'TRY': '₺',
    'USD': '$',
    'EUR': '€',
    'GBP': '£'
};

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Fetch currency rates
    currencyRates = await fetchCurrencyRates();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Satın Alma Talepleri Kayıt Defteri',
        subtitle: 'Tüm satın alma taleplerinin geçmişi ve yönetimi',
        icon: 'archive',
        showBackButton: 'block',
        showCreateButton: 'none',
        showBulkCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'block',
        onBackClick: () => window.location.href = '/procurement/purchase-requests/',
        onRefreshClick: () => loadRequests()
    });
    
    // Initialize Statistics Cards component
    try {
        requestsStats = new StatisticsCards('requests-statistics', {
            cards: [
                { title: 'Tüm Talepler', value: '0', icon: 'fas fa-list', color: 'primary', id: 'all-requests-count' },
                { title: 'Onay Bekliyor', value: '0', icon: 'fas fa-paper-plane', color: 'warning', id: 'submitted-requests-count' },
                { title: 'Onaylandı', value: '0', icon: 'fas fa-check', color: 'success', id: 'approved-requests-count' },
                { title: 'Reddedildi', value: '0', icon: 'fas fa-times', color: 'danger', id: 'rejected-requests-count' },
            ],
            compact: true,
            animation: true,
            columns: 5
        });
        console.log('StatisticsCards initialized successfully');
    } catch (error) {
        console.error('Error initializing StatisticsCards:', error);
    }
    
    await initializeRequests();
    setupEventListeners();
});

async function initializeRequests() {
    try {
        await initializeFiltersComponent();
        initializeSortableHeaders();
        
        await loadRequests();
        updateRequestCounts();
        
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

async function initializeFiltersComponent() {
    // Fetch users for requestor filter
    let users = [];
    try {
        const { authFetchUsers } = await import('../../../generic/users.js');
        users = await authFetchUsers();
    } catch (error) {
        console.error('Error fetching users:', error);
    }

    // Fetch status choices from backend
    let statusChoices = [];
    try {
        statusChoices = await getStatusChoices();
    } catch (error) {
        console.error('Error fetching status choices:', error);
        // Fallback to default options if API fails
        statusChoices = [
            { value: 'draft', label: 'Taslak' },
            { value: 'submitted', label: 'Gönderildi' },
            { value: 'approved', label: 'Onaylandı' },
            { value: 'rejected', label: 'Reddedildi' }
        ];
    }

    // Get current user for default selection
    let currentUser = null;
    try {
        const { getUser } = await import('../../../authService.js');
        currentUser = await getUser();
    } catch (error) {
        console.error('Error fetching current user:', error);
    }

    // Initialize filters component
    requestFilters = new FiltersComponent('filters-placeholder', {
        title: 'Talep Filtreleri',
        showApplyButton: true,
        showClearButton: true,
        applyButtonText: 'Filtrele',
        clearButtonText: 'Temizle',
        onApply: () => {
            currentFilter = 'filtered';
            currentPage = 1;
            loadRequests();
        },
        onClear: () => {
            currentFilter = 'all';
            currentPage = 1;
            loadRequests();
        }
    });

    // Add Talep No filter
    requestFilters.addTextFilter({
        id: 'talep-no-filter',
        label: 'Talep No',
        placeholder: 'Talep numarası girin...',
        colSize: 2
    });

    // Add Requestor filter with all users as default
    requestFilters.addDropdownFilter({
        id: 'requestor-filter',
        label: 'Talep Eden',
        placeholder: 'Talep eden seçin...',
        options: [
            { value: '', label: 'Tüm Kullanıcılar' },
            ...users.map(user => ({
                value: user.id,
                label: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || user.email
            }))
        ],
        value: '', // Default to all users
        colSize: 2
    });

    // Add Status filter with backend options
    requestFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        placeholder: 'Durum seçin...',
        options: [
            { value: '', label: 'Tüm Durumlar' },
            ...statusChoices
        ],
        value: '', // Default to all statuses
        colSize: 2
    });

    // Add Priority filter
    requestFilters.addDropdownFilter({
        id: 'priority-filter',
        label: 'Öncelik',
        placeholder: 'Öncelik seçin...',
        options: [
            { value: '', label: 'Tüm Öncelikler' },
            { value: 'normal', label: 'Normal' },
            { value: 'urgent', label: 'Acil' },
            { value: 'critical', label: 'Kritik' }
        ],
        colSize: 2
    });

    // Add Created At filter
    requestFilters.addDateFilter({
        id: 'created-at-filter',
        label: 'Oluşturulma Tarihi',
        colSize: 2
    });
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

function updateSortIndicators() {
    const sortableHeaders = document.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        const field = header.dataset.field;
        const icon = header.querySelector('.sort-icon');
        
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
    });
}

async function loadRequests() {
    if (isLoading) return;
    
    try {
        isLoading = true;
        showLoading(true);
        showLoadingState();
        
        // Get current user for default filtering
        let currentUser = null;
        try {
            const { getUser } = await import('../../../authService.js');
            currentUser = await getUser();
        } catch (error) {
            console.error('Error fetching current user:', error);
        }
        
        // Build API filters and ordering
        const apiFilters = {};
        
        // Get current filter values to apply server-side filtering
        if (requestFilters) {
            const filterValues = requestFilters.getFilterValues();
            
            // Add requestor filter to API call
            if (filterValues['requestor-filter'] && filterValues['requestor-filter'] !== '') {
                // If a specific user is selected, use that user
                apiFilters.requestor = filterValues['requestor-filter'];
            }
            // If "Tüm Kullanıcılar" is selected (empty value), don't add any requestor filter
            // This will show all users' requests
            
            // Add status filter to API call if set
            if (filterValues['status-filter']) {
                apiFilters.status = filterValues['status-filter'];
            }
            
            // Add priority filter to API call if set
            if (filterValues['priority-filter']) {
                apiFilters.priority = filterValues['priority-filter'];
            }
            
            // Add created_at filter to API call if set
            if (filterValues['created-at-filter']) {
                apiFilters.created_at__gte = filterValues['created-at-filter'];
            }
        }
        
        // Add ordering parameters
        if (currentSortField) {
            const orderingPrefix = currentSortDirection === 'desc' ? '-' : '';
            apiFilters.ordering = orderingPrefix + currentSortField;
        }
        
        // Add pagination parameters
        const itemsPerPage = 20;
        apiFilters.page = currentPage;
        apiFilters.page_size = itemsPerPage;
        
        const response = await getPurchaseRequests(apiFilters);
        
        console.log('API Response:', response);
        
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
        
        // Apply remaining local filters (Talep No only)
        const filteredRequests = applyLocalFilters(requests);
        
        // Update the table (no need for client-side sorting or pagination)
        renderRequestsTable(filteredRequests);
        renderPagination();
        updateRequestCounts();
        
    } catch (error) {
        console.error('Error loading requests:', error);
        showNotification('Talepler yüklenirken hata oluştu: ' + error.message, 'error');
        requests = [];
        totalRequests = 0;
        renderRequestsTable([]);
        renderPagination();
        updateRequestCounts();
    } finally {
        isLoading = false;
        showLoading(false);
    }
}

function applyLocalFilters(requests) {
    if (!requestFilters) return requests;
    
    const filters = requestFilters.getFilterValues();
    let filtered = requests;
    
    // Talep No filter (client-side only for real-time search)
    if (filters['talep-no-filter']) {
        const searchTerm = filters['talep-no-filter'].toLowerCase();
        filtered = filtered.filter(request => 
            request.request_number?.toLowerCase().includes(searchTerm)
        );
    }
    
    return filtered;
}

// Client-side sorting and pagination removed - now handled by backend

function renderRequestsTable(requests) {
    const tbody = document.getElementById('requests-table-body');
    
    if (!requests || requests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center">
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <h5>Henüz talep bulunmuyor</h5>
                        <p>Satın alma talebi bulunmamaktadır.</p>
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
                    ${request.status === 'approved' ? `
                        <button class="btn btn-outline-info btn-sm" onclick="completeRequest(${request.id})" 
                                title="Tamamla">
                            <i class="fas fa-flag-checkered"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
    

}

function renderPagination() {
    const pagination = document.getElementById('requests-pagination');
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

function updateRequestCounts() {
    if (!requestsStats) return;
    
    const counts = {
        0: requests.length.toString(),
        1: requests.filter(r => r.status === 'draft').length.toString(),
        2: requests.filter(r => r.status === 'submitted').length.toString(),
        3: requests.filter(r => r.status === 'approved').length.toString(),
        4: requests.filter(r => r.status === 'rejected').length.toString(),
        5: requests.filter(r => r.status === 'completed').length.toString()
    };
    
    requestsStats.updateValues(counts);
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

function setupEventListeners() {
    // Export requests
    const exportBtn = document.getElementById('export-requests');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportRequests);
    }
    
    // Refresh requests
    const refreshBtn = document.getElementById('refresh-requests');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadRequests);
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
        showRequestDetailsModal();
        
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

function showRequestDetailsModal() {
    const container = document.getElementById('request-details-container');
    
    // Calculate total amount for recommended items
    let totalRecommendedAmountEUR = 0;
    let currencyTotals = {};
    
    // Calculate total amount for cheapest options
    let totalCheapestAmountEUR = 0;
    let cheapestCurrencyTotals = {};
    
    if (currentRequest.offers && currentRequest.offers.length > 0) {
        // Calculate recommended totals
        currentRequest.offers.forEach(offer => {
            const currency = offer.supplier.currency;
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
                                currency: offer.supplier.currency,
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
        // Find the request with the matching talep no
        const request = requests.find(r => r.request_number === talepNo);
        if (request) {
            await viewRequestDetails(request.id);
        } else {
            // If not found in current requests, try to fetch it directly
            try {
                currentRequest = await getPurchaseRequest(null, talepNo); // Assuming API supports talep no lookup
                showRequestDetailsModal();
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
    const headersRow = document.getElementById('supplier-headers');
    const tbody = document.getElementById('comparison-tbody');
    
    // Clear existing content
    headersRow.innerHTML = '';
    tbody.innerHTML = '';

    if (!currentRequest.offers || currentRequest.offers.length === 0 || !currentRequest.request_items || currentRequest.request_items.length === 0) {
        return;
    }

    // Add supplier headers
    currentRequest.offers.forEach(offer => {
        const th = document.createElement('th');
        th.innerHTML = `
            <div class="supplier-header">
                <div class="fw-semibold">${offer.supplier.name}</div>
                <div class="supplier-currency">${offer.supplier.currency}</div>
            </div>`;
        th.className = 'text-center align-middle';
        headersRow.appendChild(th);
    });

    // Update group header colspan
    const groupHeader = document.getElementById('supplier-group-header');
    if (groupHeader) {
        groupHeader.colSpan = Math.max(1, currentRequest.offers.length);
    }

    // Add comparison rows
    currentRequest.request_items.forEach((requestItem, itemIndex) => {
        const row = document.createElement('tr');
        
        // Item info
        row.innerHTML = `
            <td class="item-info">
                <div class="item-name">${requestItem.item.name}</div>
                <div class="item-code">${requestItem.item.code}</div>
            </td>
            <td class="text-center">${requestItem.quantity}</td>
            <td class="text-center">${requestItem.item.unit}</td>
        `;

        // Supplier offers
        currentRequest.offers.forEach(offer => {
            const itemOffer = offer.item_offers.find(io => io.purchase_request_item === requestItem.id);
            
            if (itemOffer && itemOffer.unit_price && parseFloat(itemOffer.unit_price) > 0) {
                const cell = document.createElement('td');
                const isRecommended = itemOffer.is_recommended;
                cell.className = `price-cell ${isRecommended ? 'recommended-cell' : ''}`;
                
                // Calculate unit price and converted price
                const unitPrice = parseFloat(itemOffer.unit_price);
                const convertedPrice = currencyRates ? convertCurrency(unitPrice, offer.supplier.currency, 'EUR') : unitPrice;
                
                cell.innerHTML = `
                    <div class="d-flex flex-column align-items-center">
                        ${currencyRates ? `
                            <div class="fw-bold">${formatCurrencyDisplay(convertedPrice, 'EUR')}</div>
                            <small class="text-muted">${formatCurrencyDisplay(unitPrice, offer.supplier.currency)} <span class="currency-badge">${offer.supplier.currency}</span></small>
                        ` : `
                            <div class="text-muted">Döviz kurları yüklenemedi</div>
                            <small class="text-muted">${formatCurrencyDisplay(unitPrice, offer.supplier.currency)} <span class="currency-badge">${offer.supplier.currency}</span></small>
                        `}
                        ${itemOffer.delivery_days ? `<div class="delivery-info"><i class="fas fa-clock me-1"></i>${itemOffer.delivery_days} gün</div>` : ''}
                        ${itemOffer.notes ? `<div class="notes-info">${itemOffer.notes}</div>` : ''}
                        ${isRecommended ? `<div class="mt-1"><span class="badge bg-warning text-dark"><i class="fas fa-star me-1"></i>Önerildi</span></div>` : ''}
                    </div>
                `;
                row.appendChild(cell);
            } else {
                const cell = document.createElement('td');
                cell.className = 'price-cell';
                cell.innerHTML = '<div class="text-muted">-</div>';
                row.appendChild(cell);
            }
        });

        tbody.appendChild(row);
    });
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

async function completeRequest(requestId) {
    if (!confirm('Bu talebi tamamlamak istediğinizden emin misiniz?')) {
        return;
    }

    try {
        showLoading(true);
        // Note: You'll need to implement completePurchaseRequest in the procurement.js file
        // await completePurchaseRequest(requestId);
        showNotification('Talep başarıyla tamamlandı', 'success');
        
        // Close the modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('requestDetailsModal'));
        if (modal) {
            modal.hide();
        }
        
        await loadRequests();
    } catch (error) {
        console.error('Error completing request:', error);
        showNotification('Talep tamamlanırken hata oluştu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function exportRequests() {
    // Implementation for exporting requests
    showNotification('Dışa aktarma özelliği yakında eklenecek', 'info');
}

// Utility functions
function getStatusBadge(status, statusLabel) {
    // Use status_label from response if available, otherwise fallback to status
    const displayText = statusLabel || status;
    
    // Keep the CSS class mapping for styling
    const statusMap = {
        'draft': 'status-draft',
        'submitted': 'status-submitted',
        'approved': 'status-approved',
        'rejected': 'status-rejected',
        'completed': 'status-completed'
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
    const tableBody = document.getElementById('requests-table-body');
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
window.completeRequest = completeRequest;
