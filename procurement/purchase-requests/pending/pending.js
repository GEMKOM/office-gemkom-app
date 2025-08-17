import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';

import { FiltersComponent } from '../../../components/filters/filters.js';
import { 
    getPurchaseRequests, 
    getPurchaseRequest, 
    approvePurchaseRequest, 
    rejectPurchaseRequest 
} from '../../../generic/procurement.js';
import { fetchCurrencyRates } from '../../../generic/formatters.js';

// State management
let currentPage = 1;
let currentFilter = 'all';
let currentOrdering = 'request_number';
let currentSortField = 'request_number';
let currentSortDirection = 'asc';
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
        title: 'Bekleyen Satın Alma Talepleri',
        subtitle: 'Onay bekleyen taleplerin yönetimi ve karşılaştırması',
        icon: 'clock',
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
                { title: 'Taslak', value: '0', icon: 'fas fa-edit', color: 'secondary', id: 'draft-requests-count' },
                { title: 'Gönderildi', value: '0', icon: 'fas fa-paper-plane', color: 'warning', id: 'submitted-requests-count' },
                { title: 'Onaylandı', value: '0', icon: 'fas fa-check', color: 'success', id: 'approved-requests-count' }
            ],
            compact: true,
            animation: true
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
        initializeFiltersComponent();
        initializeSortableHeaders();
        
        await loadRequests();
        updateRequestCounts();
    } catch (error) {
        console.error('Error initializing requests:', error);
        showNotification('Talepler yüklenirken hata oluştu', 'error');
    }
}

function initializeFiltersComponent() {
    // Initialize filters component
    requestFilters = new FiltersComponent('filters-placeholder', {
        filters: [
            {
                id: 'search-filter',
                type: 'search',
                placeholder: 'Talep ara...',
                icon: 'fas fa-search'
            },
            {
                id: 'status-filter',
                type: 'select',
                label: 'Durum',
                options: [
                    { value: '', label: 'Tüm Durumlar' },
                    { value: 'draft', label: 'Taslak' },
                    { value: 'submitted', label: 'Gönderildi' },
                    { value: 'approved', label: 'Onaylandı' },
                    { value: 'rejected', label: 'Reddedildi' }
                ]
            },
            {
                id: 'priority-filter',
                type: 'select',
                label: 'Öncelik',
                options: [
                    { value: '', label: 'Tüm Öncelikler' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'urgent', label: 'Acil' },
                    { value: 'critical', label: 'Kritik' }
                ]
            }
        ],
        onFilterChange: (filters) => {
            currentFilter = 'filtered';
            currentPage = 1;
            loadRequests();
        },
        onClearFilters: () => {
            currentFilter = 'all';
            currentPage = 1;
            loadRequests();
        }
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
}

async function loadRequests() {
    if (isLoading) return;
    
    try {
        isLoading = true;
        showLoading(true);
        
        const response = await getPurchaseRequests();
        
        console.log('API Response:', response);
        
        // Ensure we have an array of requests
        if (Array.isArray(response)) {
            requests = response;
        } else if (response && Array.isArray(response.results)) {
            requests = response.results;
        } else {
            requests = [];
        }
        
        console.log('Processed requests:', requests);
        
        // Apply filters
        const filteredRequests = applyFilters(requests);
        
        // Apply sorting
        const sortedRequests = applySorting(filteredRequests);
        
        // Apply pagination
        const paginatedRequests = applyPagination(sortedRequests);
        
        // Update the table
        renderRequestsTable(paginatedRequests);
        renderPagination();
        updateRequestCounts();
        
    } catch (error) {
        console.error('Error loading requests:', error);
        showNotification('Talepler yüklenirken hata oluştu: ' + error.message, 'error');
        requests = [];
        renderRequestsTable([]);
        renderPagination();
        updateRequestCounts();
    } finally {
        isLoading = false;
        showLoading(false);
    }
}

function applyFilters(requests) {
    if (!requestFilters) return requests;
    
    const filters = requestFilters.getFilterValues();
    let filtered = requests;
    
    // Search filter
    if (filters['search-filter']) {
        const searchTerm = filters['search-filter'].toLowerCase();
        filtered = filtered.filter(request => 
            request.request_number?.toLowerCase().includes(searchTerm) ||
            request.title?.toLowerCase().includes(searchTerm) ||
            request.description?.toLowerCase().includes(searchTerm) ||
            request.requestor?.toLowerCase().includes(searchTerm)
        );
    }
    
    // Status filter
    if (filters['status-filter']) {
        filtered = filtered.filter(request => request.status === filters['status-filter']);
    }
    
    // Priority filter
    if (filters['priority-filter']) {
        filtered = filtered.filter(request => request.priority === filters['priority-filter']);
    }
    
    return filtered;
}

function applySorting(requests) {
    if (!currentSortField) return requests;
    
    return requests.sort((a, b) => {
        let aValue = a[currentSortField];
        let bValue = b[currentSortField];
        
        // Handle null/undefined values
        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';
        
        // Convert to strings for comparison
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
        
        if (currentSortDirection === 'asc') {
            return aValue.localeCompare(bValue);
        } else {
            return bValue.localeCompare(aValue);
        }
    });
}

function applyPagination(requests) {
    const itemsPerPage = 20;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    
    totalRequests = requests.length;
    return requests.slice(startIndex, endIndex);
}

function renderRequestsTable(requests) {
    const tbody = document.getElementById('requests-table-body');
    
    if (!requests || requests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center">
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <h5>Henüz talep bulunmuyor</h5>
                        <p>Bekleyen satın alma talebi bulunmamaktadır.</p>
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
                    ${request.requestor || 'Bilinmiyor'}
                </div>
            </td>
            <td class="text-center">${getStatusBadge(request.status)}</td>
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
                loadRequests();
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
        3: requests.filter(r => r.status === 'approved').length.toString()
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
    loadRequests();
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
}



async function viewRequestDetails(requestId) {
    try {
        showLoading(true);
        currentRequest = await getPurchaseRequest(requestId);
        showRequestDetailsModal();
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
    
    if (currentRequest.offers && currentRequest.offers.length > 0) {
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
    }
    
    // Display the total recommended amount
    const currencyDisplay = Object.entries(currencyTotals)
        .map(([currency, amount]) => `${formatCurrencyDisplay(amount, currency)}`)
        .join(' + ');
    
    container.innerHTML = `
        <div class="row mb-4">
            <div class="col-12">
                <div class="card bg-success text-white">
                    <div class="card-body text-center">
                        <h5 class="card-title">
                            <i class="fas fa-star me-2"></i>
                            Önerilen Teklifler Toplam Tutarı
                        </h5>
                        <div class="row">
                            <div class="col-md-6">
                                <h3>${formatCurrencyDisplay(totalRecommendedAmountEUR, 'EUR')}</h3>
                                <small>Euro Karşılığı</small>
                            </div>
                            <div class="col-md-6">
                                <h3>${currencyDisplay}</h3>
                                <small>Orijinal Para Birimleri</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

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
        await loadRequests();
    } catch (error) {
        console.error('Error rejecting request:', error);
        showNotification('Talep reddedilirken hata oluştu: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function exportRequests() {
    // Implementation for exporting requests
    showNotification('Dışa aktarma özelliği yakında eklenecek', 'info');
}

// Utility functions
function getStatusBadge(status) {
    const statusMap = {
        'draft': { text: 'Taslak', class: 'status-draft' },
        'submitted': { text: 'Gönderildi', class: 'status-submitted' },
        'approved': { text: 'Onaylandı', class: 'status-approved' },
        'rejected': { text: 'Reddedildi', class: 'status-rejected' },
        'completed': { text: 'Tamamlandı', class: 'status-completed' }
    };

    const statusInfo = statusMap[status] || { text: status, class: 'status-draft' };
    return `<span class="status-badge ${statusInfo.class}">${statusInfo.text}</span>`;
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
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(btn => {
        if (show) {
            btn.disabled = true;
            if (btn.innerHTML.includes('Yenile')) {
                btn.innerHTML = '<span class="loading-spinner"></span> Yükleniyor...';
            }
        } else {
            btn.disabled = false;
            if (btn.innerHTML.includes('Yükleniyor')) {
                btn.innerHTML = '<i class="fas fa-sync-alt me-1"></i>Yenile';
            }
        }
    });
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
