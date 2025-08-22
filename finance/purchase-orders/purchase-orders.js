import { initNavbar } from '../../components/navbar.js';
import { 
    getPurchaseOrders, 
    getPurchaseOrderById, 
    exportPurchaseOrders,
    markSchedulePaid
} from '../../generic/purchaseOrders.js';
import { HeaderComponent } from '../../components/header/header.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../components/filters/filters.js';

// Global variables
let currentPurchaseOrders = [];
let currentFilters = {};
let currentPage = 1;
let itemsPerPage = 20;
let selectedPurchaseOrder = null;
let selectedPaymentSchedule = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    initNavbar();
    
    // Initialize header component
    new HeaderComponent({
        title: 'Satın Alma Siparişleri',
        subtitle: 'Finansal takip ve fatura yönetimi',
        icon: 'shopping-cart',
        showBackButton: 'block',
        showExportButton: 'block',
        showRefreshButton: 'block',
        exportButtonText: 'Dışa Aktar',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/finance',
        onExportClick: exportPurchaseOrdersData,
        onRefreshClick: loadPurchaseOrders
    });
    
    // Initialize statistics cards component
    window.purchaseOrdersStats = new StatisticsCards('purchase-orders-statistics', {
        cards: [
            {
                title: 'Toplam Sipariş',
                value: '0',
                icon: 'shopping-cart',
                color: 'primary',
                trend: null
            },
            {
                title: 'Toplam Tutar',
                value: '₺0,00',
                icon: 'lira-sign',
                color: 'success',
                trend: null
            },
            {
                title: 'Proforma Bekleyen',
                value: '0',
                icon: 'file-invoice-dollar',
                color: 'warning',
                trend: null
            },
            {
                title: 'Tamamlanan',
                value: '0',
                icon: 'check-circle',
                color: 'success',
                trend: null
            }
        ]
    });
    
    // Initialize filters component
    new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        onApply: (filters) => {
            currentFilters = filters;
            currentPage = 1;
            loadPurchaseOrders();
        },
        onClear: () => {
            currentFilters = {};
            currentPage = 1;
            loadPurchaseOrders();
        }
    }).addSelectFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'awaiting_invoice', label: 'Proforma Bekliyor' },
            { value: 'completed', label: 'Tamamlandı' },
            { value: 'cancelled', label: 'İptal Edildi' },
            { value: 'pending', label: 'Beklemede' },
            { value: 'approved', label: 'Onaylandı' }
        ],
        colSize: 2
    }).addSelectFilter({
        id: 'priority-filter',
        label: 'Öncelik',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'high', label: 'Yüksek' },
            { value: 'normal', label: 'Normal' },
            { value: 'low', label: 'Düşük' }
        ],
        colSize: 2
    }).addSelectFilter({
        id: 'currency-filter',
        label: 'Para Birimi',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'TRY', label: 'Türk Lirası' },
            { value: 'USD', label: 'Amerikan Doları' },
            { value: 'EUR', label: 'Euro' }
        ],
        colSize: 2
    }).addDateFilter({
        id: 'start-date-filter',
        label: 'Başlangıç Tarihi',
        colSize: 2
    }).addDateFilter({
        id: 'end-date-filter',
        label: 'Bitiş Tarihi',
        colSize: 2
    });
    

    
    // Load initial data
    loadPurchaseOrders();
    
    // Add event listeners
    addEventListeners();
});

// Add event listeners
function addEventListeners() {
    // Refresh button
    document.getElementById('refresh-purchase-orders').addEventListener('click', loadPurchaseOrders);
    
    // Export button
    document.getElementById('export-purchase-orders').addEventListener('click', exportPurchaseOrdersData);
    

    
    // Mark payment as paid
    document.getElementById('confirm-mark-paid').addEventListener('click', confirmMarkPaid);
    
    // Handle paid with tax checkbox change
    document.getElementById('paid-with-tax').addEventListener('change', updatePaymentAmountDisplay);
}

// Load purchase orders
async function loadPurchaseOrders() {
    try {
        showLoadingState();
        
        const data = await getPurchaseOrders(currentFilters);
        currentPurchaseOrders = data.results || data;
        
        renderPurchaseOrdersTable();
        renderStatistics();
        renderPagination();
        
    } catch (error) {
        console.error('Error loading purchase orders:', error);
        showErrorMessage('Satın alma siparişleri yüklenirken hata oluştu.');
    } finally {
        hideLoadingState();
    }
}

// Render purchase orders table
function renderPurchaseOrdersTable() {
    const tbody = document.getElementById('purchase-orders-table-body');
    
    if (!currentPurchaseOrders || currentPurchaseOrders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-3"></i>
                    <p>Henüz satın alma siparişi bulunmamaktadır.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = currentPurchaseOrders.slice(startIndex, endIndex);
    
    tbody.innerHTML = pageData.map(order => `
        <tr>
            <td>
                <strong>${order.id}</strong>
            </td>
            <td>${order.supplier_name || 'N/A'}</td>
            <td>
                <span class="status-badge ${getStatusBadgeClass(order.status)}">
                    ${order.status_label || getStatusText(order.status)}
                </span>
            </td>
            <td>
                <div>
                    <strong>${formatCurrency(order.total_amount, order.currency)}</strong>
                    ${order.tax_outstanding > 0 ? `
                        <br><small class="text-${order.tax_outstanding > 0}">
                            + ${formatCurrency(order.tax_outstanding, order.currency)} (KDV)
                        </small>
                    ` : ''}
                </div>
            </td>
            <td>
                <span class="currency-badge">${order.currency || 'TRY'}</span>
            </td>
            <td>
                <span class="priority-badge ${getPriorityBadgeClass(order.priority)}">
                    ${getPriorityText(order.priority)}
                </span>
            </td>
            <td>${formatDate(order.created_at)}</td>
            <td class="text-center payment-schedule-column">
                ${renderPaymentSchedules(order)}
            </td>
            <td class="text-center">
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-primary" onclick="viewPurchaseOrderDetails(${order.id})" title="Detayları Görüntüle">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Render statistics
function renderStatistics() {
    const totalOrders = currentPurchaseOrders.length;
    const totalAmount = currentPurchaseOrders.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0);
    const awaitingInvoices = currentPurchaseOrders.filter(order => order.status === 'awaiting_invoice').length;
    const completedOrders = currentPurchaseOrders.filter(order => order.status === 'completed').length;
    
    // Update statistics cards
    const statsComponent = window.purchaseOrdersStats;
    if (statsComponent) {
        statsComponent.updateValues({
            0: totalOrders.toString(),
            1: formatCurrency(totalAmount, 'TRY'),
            2: awaitingInvoices.toString(),
            3: completedOrders.toString()
        });
    }
}

// Render payment schedules
function renderPaymentSchedules(order) {
    const schedules = order.payment_schedules || [];
    
    if (schedules.length === 0) {
        return '<span class="text-muted">Ödeme planı yok</span>';
    }
    
    return schedules.map(schedule => {
        const isPaid = schedule.is_paid;
        const isOverdue = new Date(schedule.due_date) < new Date() && !isPaid;
        const statusClass = isPaid ? 'success' : isOverdue ? 'danger' : 'warning';
        const statusIcon = isPaid ? 'check-circle' : isOverdue ? 'exclamation-triangle' : 'clock';
        
        return `
            <div class="payment-schedule-item mb-1">
                <div class="d-flex align-items-center justify-content-between">
                    <div class="flex-grow-1">
                        <small class="text-muted">${schedule.label}</small>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-${statusClass}">
                                <i class="fas fa-${statusIcon} me-1"></i>
                                ${isPaid ? 'Ödendi' : isOverdue ? 'Gecikmiş' : 'Bekliyor'}
                            </span>
                            <span class="text-${statusClass}">
                                <strong>${formatCurrency(schedule.amount, schedule.currency)}</strong>
                            </span>
                            ${schedule.effective_tax_due > 0 ? `
                                <span class="text-${order.tax_outstanding > 0 ? 'danger' : 'success'}">
                                    <small>+ ${formatCurrency(schedule.effective_tax_due, schedule.currency)} (KDV)</small>
                                </span>
                            ` : ''}
                        </div>
                        <small class="text-muted">Vade: ${formatDate(schedule.due_date)}</small>
                    </div>
                    ${!isPaid ? `
                        <button class="btn btn-sm btn-outline-success" 
                                onclick="showMarkPaidModal(${order.id}, ${schedule.id})" 
                                title="Ödeme İşaretle">
                            <i class="fas fa-check"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Show mark paid modal
function showMarkPaidModal(orderId, scheduleId) {
    const order = currentPurchaseOrders.find(o => o.id === orderId);
    const schedule = order.payment_schedules.find(s => s.id === scheduleId);
    
    if (!order || !schedule) {
        showErrorMessage('Ödeme planı bulunamadı.');
        return;
    }
    
    selectedPaymentSchedule = { orderId, scheduleId, schedule };
    
    // Check if this is the last sequence
    const unpaidSchedules = order.payment_schedules.filter(s => !s.is_paid);
    const isLastSequence = unpaidSchedules.length === 1 && unpaidSchedules[0].id === scheduleId;
    
    // Populate modal
    document.getElementById('schedule-label').textContent = schedule.label;
    document.getElementById('payment-amount').value = formatCurrency(schedule.amount, schedule.currency);
    document.getElementById('payment-currency').textContent = schedule.currency;
    document.getElementById('payment-due-date').value = formatDate(schedule.due_date);
    
    // Handle checkbox based on whether it's the last sequence
    const paidWithTaxCheckbox = document.getElementById('paid-with-tax');
    if (isLastSequence) {
        // Last sequence: force KDV to be selected and disabled
        paidWithTaxCheckbox.checked = true;
        paidWithTaxCheckbox.disabled = true;
        paidWithTaxCheckbox.parentElement.classList.add('text-muted');
    } else {
        // Not last sequence: allow user to choose
        paidWithTaxCheckbox.checked = true;
        paidWithTaxCheckbox.disabled = false;
        paidWithTaxCheckbox.parentElement.classList.remove('text-muted');
    }
    
    // Update payment amount display
    updatePaymentAmountDisplay();
    
    const modal = new bootstrap.Modal(document.getElementById('markPaidModal'));
    modal.show();
}

// Update payment amount display based on checkbox
function updatePaymentAmountDisplay() {
    if (!selectedPaymentSchedule) return;
    
    const { schedule } = selectedPaymentSchedule;
    const paidWithTaxCheckbox = document.getElementById('paid-with-tax');
    const paidWithTax = paidWithTaxCheckbox.checked;
    const paymentAmountField = document.getElementById('payment-amount');
    
    // Check if this is the last sequence
    const order = currentPurchaseOrders.find(o => o.id === selectedPaymentSchedule.orderId);
    const unpaidSchedules = order.payment_schedules.filter(s => !s.is_paid);
    const isLastSequence = unpaidSchedules.length === 1 && unpaidSchedules[0].id === selectedPaymentSchedule.scheduleId;
    
    if (isLastSequence) {
        // Last sequence: always show total with tax and disable checkbox
        const totalWithTax = parseFloat(schedule.amount || 0) + parseFloat(schedule.effective_tax_due || 0);
        paymentAmountField.value = formatCurrency(totalWithTax, schedule.currency);
        paymentAmountField.classList.add('text-success', 'fw-bold');
        paidWithTaxCheckbox.checked = true;
        paidWithTaxCheckbox.disabled = true;
        paidWithTaxCheckbox.parentElement.classList.add('text-muted');
    } else {
        // Not last sequence: allow user choice
        if (paidWithTax) {
            // Show total amount with tax
            const totalWithTax = parseFloat(schedule.amount || 0) + parseFloat(schedule.effective_tax_due || 0);
            paymentAmountField.value = formatCurrency(totalWithTax, schedule.currency);
            paymentAmountField.classList.add('text-success', 'fw-bold');
        } else {
            // Show only base amount
            paymentAmountField.value = formatCurrency(schedule.amount || 0, schedule.currency);
            paymentAmountField.classList.remove('text-success', 'fw-bold');
        }
        paidWithTaxCheckbox.disabled = false;
        paidWithTaxCheckbox.parentElement.classList.remove('text-muted');
    }
}

// Confirm mark as paid
async function confirmMarkPaid() {
    if (!selectedPaymentSchedule) {
        showErrorMessage('Ödeme planı seçilmedi.');
        return;
    }
    
    try {
        const { orderId, scheduleId, schedule } = selectedPaymentSchedule;
        const paidWithTax = document.getElementById('paid-with-tax').checked;
        
        // The checkbox is already handled in updatePaymentAmountDisplay for last sequence
        
        await markSchedulePaid(orderId, scheduleId, paidWithTax);
        
        showSuccessMessage('Ödeme başarıyla işaretlendi.');
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('markPaidModal'));
        modal.hide();
        
        // Refresh data
        loadPurchaseOrders();
        
    } catch (error) {
        console.error('Error marking payment as paid:', error);
        showErrorMessage(error.message || 'Ödeme işaretlenirken hata oluştu.');
    }
}

// Render pagination
function renderPagination() {
    const paginationContainer = document.getElementById('purchase-orders-pagination');
    const totalPages = Math.ceil(currentPurchaseOrders.length / itemsPerPage);
    
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">
                <i class="fas fa-chevron-left"></i>
            </a>
        </li>
    `;
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `
                <li class="page-item ${i === currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
                </li>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }
    
    // Next button
    paginationHTML += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">
                <i class="fas fa-chevron-right"></i>
            </a>
        </li>
    `;
    
    paginationContainer.innerHTML = paginationHTML;
}

// View purchase order details
async function viewPurchaseOrderDetails(orderId) {
    try {
        const order = await getPurchaseOrderById(orderId);
        selectedPurchaseOrder = order;
        
        const modal = new bootstrap.Modal(document.getElementById('purchaseOrderDetailsModal'));
        const content = document.getElementById('purchase-order-details-content');
        
        content.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6 class="text-primary">Sipariş Bilgileri</h6>
                    <table class="table table-sm">
                        <tr><td><strong>Sipariş No:</strong></td><td>${order.id}</td></tr>
                        <tr><td><strong>Tedarikçi:</strong></td><td>${order.supplier_name}</td></tr>
                        <tr><td><strong>Durum:</strong></td><td><span class="status-badge ${getStatusBadgeClass(order.status)}">${order.status_label || getStatusText(order.status)}</span></td></tr>
                        <tr><td><strong>Öncelik:</strong></td><td><span class="priority-badge ${getPriorityBadgeClass(order.priority)}">${getPriorityText(order.priority)}</span></td></tr>
                        <tr><td><strong>Para Birimi:</strong></td><td><span class="currency-badge">${order.currency}</span></td></tr>
                        <tr><td><strong>Toplam Tutar:</strong></td><td><strong>${formatCurrency(order.total_amount, order.currency)}</strong></td></tr>
                        <tr><td><strong>KDV Oranı:</strong></td><td>${order.tax_rate}%</td></tr>
                        <tr><td><strong>KDV Tutarı:</strong></td><td><strong>${formatCurrency(order.total_tax_amount, order.currency)}</strong></td></tr>
                        <tr><td><strong>KDV Borcu:</strong></td><td><span class="text-${order.tax_outstanding > 0 ? 'danger' : 'success'}"><strong>${formatCurrency(order.tax_outstanding, order.currency)}</strong></span></td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6 class="text-primary">Tarih Bilgileri</h6>
                    <table class="table table-sm">
                        <tr><td><strong>Oluşturulma Tarihi:</strong></td><td>${formatDate(order.created_at)}</td></tr>
                        <tr><td><strong>Sipariş Tarihi:</strong></td><td>${formatDate(order.ordered_at)}</td></tr>
                        <tr><td><strong>PR No:</strong></td><td>${order.pr || 'N/A'}</td></tr>
                        <tr><td><strong>Tedarikçi Teklifi:</strong></td><td>${order.supplier_offer || 'N/A'}</td></tr>
                        <tr><td><strong>Kalem Sayısı:</strong></td><td>${order.line_count || 0}</td></tr>
                    </table>
                </div>
            </div>
            <div class="row mt-3">
                <div class="col-12">
                    <h6 class="text-primary">Ödeme Planı</h6>
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead class="table-light">
                                <tr>
                                    <th>Sıra</th>
                                    <th>Ödeme Türü</th>
                                    <th class="text-end">Yüzde</th>
                                    <th class="text-end">Tutar</th>
                                    <th>Vade Tarihi</th>
                                    <th>Durum</th>
                                    <th class="text-end">KDV Tutarı</th>
                                    <th class="text-center">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(order.payment_schedules || []).map((schedule, index) => {
                                    const isPaid = schedule.is_paid;
                                    const isOverdue = new Date(schedule.due_date) < new Date() && !isPaid;
                                    const statusClass = isPaid ? 'success' : isOverdue ? 'danger' : 'warning';
                                    const statusText = isPaid ? 'Ödendi' : isOverdue ? 'Gecikmiş' : 'Bekliyor';
                                    
                                    return `
                                        <tr>
                                            <td>${schedule.sequence}</td>
                                            <td>${schedule.label}</td>
                                            <td class="text-end">${schedule.percentage}%</td>
                                            <td class="text-end"><strong>${formatCurrency(schedule.amount, schedule.currency)}</strong></td>
                                            <td>${formatDate(schedule.due_date)}</td>
                                            <td>
                                                <span class="badge bg-${statusClass}">
                                                    ${statusText}
                                                </span>
                                            </td>
                                            <td class="text-end">${formatCurrency(schedule.effective_tax_due, schedule.currency)}</td>
                                            <td class="text-center">
                                                ${!isPaid ? `
                                                    <button class="btn btn-sm btn-outline-success" 
                                                            onclick="showMarkPaidModal(${order.id}, ${schedule.id})" 
                                                            title="Ödeme İşaretle">
                                                        <i class="fas fa-check"></i>
                                                    </button>
                                                ` : `
                                                    <span class="text-success">
                                                        <i class="fas fa-check-circle"></i>
                                                    </span>
                                                `}
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            ${(order.lines || []).length > 0 ? `
            <div class="row mt-3">
                <div class="col-12">
                    <h6 class="text-primary">Sipariş Kalemleri</h6>
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead class="table-light">
                                <tr>
                                    <th>#</th>
                                    <th>Malzeme Kodu</th>
                                    <th>Malzeme Adı</th>
                                    <th class="text-end">Miktar</th>
                                    <th class="text-end">Birim Fiyat</th>
                                    <th class="text-end">Toplam</th>
                                    <th class="text-center">Teslimat (Gün)</th>
                                    <th>Notlar</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(order.lines || []).map((line, index) => `
                                    <tr>
                                        <td>${index + 1}</td>
                                        <td><code>${line.item_code}</code></td>
                                        <td>${line.item_name}</td>
                                        <td class="text-end">${parseFloat(line.quantity).toLocaleString('tr-TR')}</td>
                                        <td class="text-end">${formatCurrency(line.unit_price, order.currency)}</td>
                                        <td class="text-end"><strong>${formatCurrency(line.total_price, order.currency)}</strong></td>
                                        <td class="text-center">
                                            ${line.delivery_days > 0 ? line.delivery_days : '-'}
                                        </td>
                                        <td>
                                            ${line.notes ? `<small class="text-muted">${line.notes}</small>` : '-'}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot class="table-light">
                                <tr>
                                    <td colspan="5" class="text-end"><strong>Genel Toplam:</strong></td>
                                    <td class="text-end"><strong>${formatCurrency(order.total_amount, order.currency)}</strong></td>
                                    <td colspan="2"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
            ` : ''}
        `;
        
        modal.show();
        
    } catch (error) {
        console.error('Error loading purchase order details:', error);
        showErrorMessage('Sipariş detayları yüklenirken hata oluştu.');
    }
}



// Export purchase orders
async function exportPurchaseOrdersData() {
    try {
        const blob = await exportPurchaseOrders(currentFilters, 'excel');
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `purchase-orders-${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting purchase orders:', error);
        showErrorMessage('Dışa aktarma sırasında hata oluştu.');
    }
}



// Utility functions
function getStatusBadgeClass(status) {
    const statusClasses = {
        'awaiting_invoice': 'status-draft',
        'awaiting_payment': 'status-submitted',
        'paid': 'status-approved',
        'cancelled': 'status-cancelled'
    };
    return statusClasses[status] || 'status-draft';
}

function getStatusText(status) {
    const statusTexts = {
        'awaiting_invoice': 'Proforma Bekliyor',
        'completed': 'Tamamlandı',
        'cancelled': 'İptal Edildi',
        'pending': 'Beklemede',
        'approved': 'Onaylandı'
    };
    return statusTexts[status] || status;
}

function getPriorityBadgeClass(priority) {
    const priorityClasses = {
        'critical': 'priority-critical',
        'high': 'priority-urgent',
        'normal': 'priority-normal',
        'low': 'priority-normal'
    };
    return priorityClasses[priority] || 'priority-normal';
}

function getPriorityText(priority) {
    const priorityTexts = {
        'critical': 'Kritik',
        'high': 'Yüksek',
        'normal': 'Normal',
        'low': 'Düşük'
    };
    return priorityTexts[priority] || priority;
}


function getPaymentStatusText(status) {
    const statusTexts = {
        'paid': 'Ödendi',
        'pending': 'Beklemede',
        'overdue': 'Gecikmiş',
        'partial': 'Kısmi Ödeme'
    };
    return statusTexts[status] || status;
}

function formatCurrency(amount, currency = 'TRY') {
    if (!amount) return '₺0,00';
    return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('tr-TR');
}

function showLoadingState() {
    const tbody = document.getElementById('purchase-orders-table-body');
    tbody.innerHTML = `
        <tr>
            <td colspan="9" class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Yükleniyor...</span>
                </div>
                <p class="mt-2">Yükleniyor...</p>
            </td>
        </tr>
    `;
}

function hideLoadingState() {
    // Loading state is handled by renderPurchaseOrdersTable
}

function showSuccessMessage(message) {
    // You can implement a toast notification system here
    alert(message);
}

function showErrorMessage(message) {
    // You can implement a toast notification system here
    alert('Hata: ' + message);
}

// Global functions for onclick handlers
window.viewPurchaseOrderDetails = viewPurchaseOrderDetails;

window.changePage = function(page) {
    currentPage = page;
    renderPurchaseOrdersTable();
    renderPagination();
};
window.showMarkPaidModal = showMarkPaidModal;
