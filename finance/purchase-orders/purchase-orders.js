import { initNavbar } from '../../components/navbar.js';
import { 
    getPurchaseOrders, 
    getPurchaseOrderById, 
    exportPurchaseOrders,
    markSchedulePaid,
    deletePurchaseOrder
} from '../../apis/purchaseOrders.js';
import {
    getSuppliers,
    getSupplier,
    listDbsPayments,
    createDbsPayment,
    deleteDbsPayment
} from '../../apis/procurement.js';
import { isAdmin } from '../../authService.js';
import { HeaderComponent } from '../../components/header/header.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { ConfirmationModal } from '../../components/confirmation-modal/confirmation-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { backendBase } from '../../base.js';

// Global variables
let currentPurchaseOrders = [];
let currentFilters = { status: 'awaiting_payment' };
let currentPage = 1;
let itemsPerPage = 20;
let selectedPurchaseOrder = null;
let selectedPaymentSchedule = null;
let actionConfirmModal = null;
let pageHeader = null;
let financeActiveTab = 'po';
let dbsSuppliers = [];
let dbsPaySupplier = null;
let poDetailsDisplayModal = null;
let markPaidEditModal = null;
let dbsPayEditModal = null;
let dbsPaymentsDisplayModal = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async function() {
    actionConfirmModal = new ConfirmationModal('action-confirm-modal-container', {
        title: 'Onay',
        icon: 'fas fa-exclamation-triangle',
        message: 'Bu işlemi yapmak istediğinize emin misiniz?',
        confirmText: 'Evet',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-danger'
    });
    initFinancePurchaseOrderModals();
    initNavbar();
    pageHeader = new HeaderComponent({
        title: 'Satın Alma Siparişleri',
        subtitle: 'Finansal takip ve fatura yönetimi',
        icon: 'shopping-cart',
        showBackButton: 'block',
        showExportButton: 'block',
        showRefreshButton: 'block',
        exportButtonText: 'Dışa Aktar',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/finance',
        onExportClick: () => {
            if (financeActiveTab === 'dbs') {
                showErrorMessage('DBS sekmesinde dışa aktarma kullanılamaz.');
                return;
            }
            exportPurchaseOrdersData();
        },
        onRefreshClick: () => {
            if (financeActiveTab === 'dbs') {
                loadDbsSuppliers();
            } else {
                loadPurchaseOrders();
            }
        }
    });

    // Build actions, include delete only for admins
    const tableActions = [
        {
            key: 'view',
            label: 'Detayları Görüntüle',
            icon: 'fas fa-eye',
            class: 'btn-outline-primary',
            onClick: (row) => viewPurchaseOrderDetails(row.id)
        }
    ];
    if (isAdmin()) {
        tableActions.push({
            key: 'delete',
            label: 'Sil',
            icon: 'fas fa-trash',
            class: 'btn-outline-danger',
            onClick: (row) => confirmAndDeletePurchaseOrder(row.id)
        });
    }

    // Initialize table component
    window.purchaseOrdersTable = new TableComponent('purchase-orders-table-container', {
        title: 'Satın Alma Siparişleri',
        icon: 'shopping-cart',
        iconColor: 'text-primary',
        loading: true, // Show loading state initially
        pagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        serverSidePagination: true,
        onPageChange: handlePageChange,
        onPageSizeChange: handlePageSizeChange,
        columns: [
            { 
                field: 'id', 
                label: 'Sipariş No', 
                sortable: true, 
                type: 'text',
                formatter: (value) => `<strong>${value}</strong>`
            },
            { 
                field: 'supplier_name', 
                label: 'Tedarikçi', 
                sortable: true, 
                type: 'text',
                formatter: (value) => value || '-'
            },
            { 
                field: 'status', 
                label: 'Durum', 
                sortable: true, 
                type: 'text',
                formatter: (value, row) => `<span class="status-badge ${getStatusBadgeClass(value)}">${row.status_label || getStatusText(value)}</span>`
            },
            { 
                field: 'total_amount', 
                label: 'Toplam Tutar', 
                sortable: true, 
                type: 'number',
                formatter: (value, row) => {
                    const amount = formatCurrency(value, row.currency);
                    const taxInfo = row.tax_outstanding > 0 ? `<br><small class="text-danger">+ ${formatCurrency(row.tax_outstanding, row.currency)} (KDV)</small>` : '';
                    return `<div>${amount}${taxInfo}</div>`;
                }
            },
            { 
                field: 'currency', 
                label: 'Para Birimi', 
                sortable: true, 
                type: 'text',
                formatter: (value) => `<span class="currency-badge">${value || 'TRY'}</span>`
            },
            { 
                field: 'priority', 
                label: 'Öncelik', 
                sortable: true, 
                type: 'text',
                formatter: (value) => `<span class="status-badge ${getPriorityBadgeClass(value)}">${getPriorityText(value)}</span>`
            },
            { 
                field: 'created_at', 
                label: 'Oluşturulma Tarihi', 
                sortable: true, 
                type: 'date'
            },
            { 
                field: 'payment_schedules', 
                label: 'Ödeme Planı', 
                sortable: false, 
                type: 'text',
                formatter: (value, row) => renderPaymentSchedules(row)
            }
        ],
        actions: tableActions,
        onSort: handleSort,
        onRowClick: handleRowClick,
        refreshable: true,
        onRefresh: loadPurchaseOrders,
        exportable: true,
        onExport: exportPurchaseOrdersData,
        skeleton: true,
        emptyMessage: 'Henüz satın alma siparişi bulunmamaktadır.',
        emptyIcon: 'fas fa-inbox'
    });

    initDbsSuppliersTable();
    setupFinanceMainTabs();
    
    // Check for order ID in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('order');
    
    if (orderId) {
        // Load the specific order directly instead of all orders
        await loadSpecificPurchaseOrder(orderId);
    }
    
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
                title: 'Ödeme Bekleyen',
                value: '0',
                icon: 'clock',
                color: 'warning',
                trend: null
            },
            {
                title: 'Ödenen',
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
            // Update table current page
            if (window.purchaseOrdersTable) {
                window.purchaseOrdersTable.options.currentPage = 1;
            }
            loadPurchaseOrders();
        },
        onClear: () => {
            currentFilters = { status: 'awaiting_payment' };
            currentPage = 1;
            // Update table current page
            if (window.purchaseOrdersTable) {
                window.purchaseOrdersTable.options.currentPage = 1;
            }
            loadPurchaseOrders();
        }
    }).addSelectFilter({
        id: 'status',
        label: 'Durum',
        value: 'awaiting_payment',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'awaiting_payment', label: 'Ödeme Bekliyor' },
            { value: 'paid', label: 'Ödendi' },
            { value: 'cancelled', label: 'İptal Edildi' }
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
    

    
    // Load initial data only if no specific order is requested
    if (!orderId) {
        loadPurchaseOrders();
    }
    
    // Add event listeners
    addEventListeners();
});

function initFinancePurchaseOrderModals() {
    poDetailsDisplayModal = new DisplayModal('purchase-order-details-modal-container', {
        title: 'Sipariş Detayları',
        icon: 'fas fa-shopping-cart',
        size: 'xl',
        showEditButton: false
    });
    poDetailsDisplayModal.onCloseCallback(() => {
        const url = new URL(window.location);
        url.searchParams.delete('order');
        window.history.pushState({}, '', url);
    });

    markPaidEditModal = new EditModal('mark-paid-modal-container', {
        title: 'Ödeme İşaretle',
        icon: 'fas fa-check-circle text-success',
        saveButtonText: 'Ödeme İşaretle',
        size: 'lg'
    });
    markPaidEditModal.addSection({
        id: 'mark-paid-section',
        title: null,
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'schedule_label_ro',
                name: 'schedule_label_ro',
                label: 'Ödeme planı',
                type: 'text',
                readonly: true,
                colSize: 12
            },
            {
                id: 'payment_display_amount',
                name: 'payment_display_amount',
                label: 'Ödeme tutarı',
                type: 'text',
                readonly: true,
                colSize: 6
            },
            {
                id: 'payment_currency_ro',
                name: 'payment_currency_ro',
                label: 'Para birimi',
                type: 'text',
                readonly: true,
                colSize: 6
            },
            {
                id: 'payment_due_date_ro',
                name: 'payment_due_date_ro',
                label: 'Vade tarihi',
                type: 'text',
                readonly: true,
                colSize: 12
            },
            {
                id: 'paid_with_tax',
                name: 'paid_with_tax',
                label: 'KDV dahil ödeme yapıldı',
                type: 'checkbox',
                value: true,
                colSize: 12,
                help: 'İşaretliyse ödeme KDV dahil olarak işaretlenir.'
            }
        ]
    });
    markPaidEditModal.render();
    markPaidEditModal.onSaveCallback(handleMarkPaidSave);
    markPaidEditModal.modal.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'paid_with_tax') {
            updatePaymentAmountDisplay();
        }
    });

    dbsPayEditModal = new EditModal('dbs-pay-modal-container', {
        title: 'DBS Ödemesi',
        icon: 'fas fa-money-bill-wave',
        saveButtonText: 'Ödemeyi Kaydet',
        size: 'md'
    });
    dbsPayEditModal.addSection({
        id: 'dbs-pay-section',
        title: null,
        icon: 'fas fa-university',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'dbs_supplier_display',
                name: 'dbs_supplier_display',
                label: 'Tedarikçi',
                type: 'text',
                readonly: true,
                colSize: 12
            },
            {
                id: 'dbs_pay_amount',
                name: 'amount',
                label: 'Tutar',
                type: 'number',
                required: true,
                min: 0.01,
                step: 0.01,
                placeholder: '0,00',
                colSize: 8
            },
            {
                id: 'dbs_currency_ro',
                name: 'dbs_currency_ro',
                label: 'Para birimi',
                type: 'text',
                readonly: true,
                colSize: 4
            },
            {
                id: 'dbs_pay_note',
                name: 'note',
                label: 'Not',
                type: 'textarea',
                rows: 2,
                placeholder: 'İsteğe bağlı',
                required: false,
                colSize: 12
            }
        ]
    });
    dbsPayEditModal.render();
    dbsPayEditModal.onSaveCallback(handleDbsPaySave);
    dbsPayEditModal.modal.addEventListener('input', () => {
        updateDbsPayOverpaymentWarning();
    });

    const amountGroup = dbsPayEditModal.container.querySelector('[data-field-id="dbs_pay_amount"]');
    if (amountGroup && !amountGroup.querySelector('#dbs-pay-over-warning')) {
        const warn = document.createElement('div');
        warn.id = 'dbs-pay-over-warning';
        warn.className = 'alert alert-warning py-2 px-3 mt-2 mb-0 d-none';
        warn.setAttribute('role', 'alert');
        warn.innerHTML =
            '<i class="fas fa-exclamation-triangle me-1"></i>Girilen tutar kullanılan krediden büyük. Sunucu fazla tutarı yok sayabilir; tutarı kontrol edin.';
        amountGroup.appendChild(warn);
    }

    dbsPaymentsDisplayModal = new DisplayModal('dbs-payments-display-modal-container', {
        title: 'DBS Ödeme Geçmişi',
        icon: 'fas fa-list',
        size: 'lg',
        showEditButton: false
    });
    setupDbsPaymentsCancelDelegation();
}

function setupFinanceMainTabs() {
    const tabBar = document.getElementById('finance-po-main-tabs');
    if (!tabBar) return;
    tabBar.querySelectorAll('[data-finance-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-finance-tab');
            if (tab) switchFinanceMainTab(tab);
        });
    });
    tabBarActiveClasses(financeActiveTab);
}

function relocateFinanceViewSwitcher(tab) {
    const card = document.getElementById('finance-po-view-switcher-card');
    const anchorPo = document.getElementById('finance-view-switcher-anchor-po');
    const anchorDbs = document.getElementById('finance-view-switcher-anchor-dbs');
    if (!card || !anchorPo || !anchorDbs) return;
    const target = tab === 'dbs' ? anchorDbs : anchorPo;
    target.appendChild(card);
}

function switchFinanceMainTab(tab) {
    financeActiveTab = tab;
    const poPane = document.getElementById('finance-tab-pane-po');
    const dbsPane = document.getElementById('finance-tab-pane-dbs');
    if (poPane) poPane.classList.toggle('d-none', tab !== 'po');
    if (dbsPane) dbsPane.classList.toggle('d-none', tab !== 'dbs');

    relocateFinanceViewSwitcher(tab);
    tabBarActiveClasses(tab);

    if (pageHeader) {
        pageHeader.updateConfig({
            showExportButton: tab === 'po' ? 'block' : 'none'
        });
    }

    if (tab === 'dbs') {
        loadDbsSuppliers();
    }
}

function tabBarActiveClasses(activeTab) {
    document.querySelectorAll('#finance-po-main-tabs [data-finance-tab]').forEach((btn) => {
        const t = btn.getAttribute('data-finance-tab');
        const isActive = t === activeTab;
        btn.classList.toggle('btn-primary', isActive);
        btn.classList.toggle('btn-outline-primary', !isActive);
    });
}

function initDbsSuppliersTable() {
    if (!document.getElementById('dbs-suppliers-table-container')) return;

    window.dbsSuppliersTable = new TableComponent('dbs-suppliers-table-container', {
        title: 'DBS Tedarikçileri',
        icon: 'university',
        iconColor: 'text-primary',
        sortable: false,
        loading: false,
        pagination: false,
        refreshable: true,
        onRefresh: loadDbsSuppliers,
        columns: [
            {
                field: 'name',
                label: 'Tedarikçi',
                sortable: true,
                formatter: (value) => (value ? `<strong>${escapeHtml(String(value))}</strong>` : '—')
            },
            {
                field: 'dbs_bank',
                label: 'Banka',
                sortable: true,
                formatter: (value) => (value ? escapeHtml(String(value)) : '—')
            },
            {
                field: 'dbs_currency',
                label: 'Para birimi',
                sortable: true,
                formatter: (value) => (value ? `<span class="currency-badge">${escapeHtml(String(value))}</span>` : '—')
            },
            {
                field: 'dbs_limit',
                label: 'Limit',
                sortable: true,
                formatter: (value, row) => formatDbsMoneyCell(value, row.dbs_currency)
            },
            {
                field: 'dbs_used',
                label: 'Kullanılan',
                sortable: true,
                formatter: (value, row) => formatDbsMoneyCell(value, row.dbs_currency)
            },
            {
                field: '_available',
                label: 'Kullanılabilir',
                sortable: false,
                formatter: (_v, row) => formatDbsAvailable(row)
            },
            {
                field: 'dbs_expiry_date',
                label: 'Vade',
                sortable: true,
                formatter: (value) => formatDbsExpiryCell(value)
            },
            {
                field: '_actions',
                label: 'İşlemler',
                sortable: false,
                formatter: (_v, row) => {
                    const id = row.id;
                    return `
                        <div class="btn-group btn-group-sm" role="group">
                            <button type="button" class="btn btn-outline-primary" onclick="window.openDbsPayModal(${id})" title="Öde">
                                <i class="fas fa-money-bill-wave me-1"></i>Öde
                            </button>
                            <button type="button" class="btn btn-outline-secondary" onclick="window.openDbsPaymentsDrawer(${id})" title="Ödemeleri görüntüle">
                                <i class="fas fa-list me-1"></i>Ödemeler
                            </button>
                        </div>`;
                }
            }
        ],
        data: [],
        skeleton: false,
        emptyMessage: 'DBS kaydı olan tedarikçi bulunmamaktadır.',
        emptyIcon: 'fas fa-university'
    });
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function parseMoneyNumber(val) {
    if (val === null || val === undefined || val === '') return NaN;
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
    return n;
}

function formatDbsMoneyCell(amount, currency) {
    const c = currency || 'TRY';
    const n = parseMoneyNumber(amount);
    if (Number.isNaN(n)) return '—';
    return formatCurrency(n, c);
}

function formatDbsAvailable(row) {
    const limit = parseMoneyNumber(row.dbs_limit);
    if (Number.isNaN(limit)) return '—';
    const used = parseMoneyNumber(row.dbs_used);
    const u = Number.isNaN(used) ? 0 : used;
    const cur = row.dbs_currency || 'TRY';
    return formatCurrency(limit - u, cur);
}

function formatDbsExpiryCell(dateStr) {
    if (!dateStr) return '—';
    const cls = getDbsExpiryAlertClass(dateStr);
    const label = formatDate(dateStr);
    return cls ? `<span class="${cls}">${label}</span>` : label;
}

function getDbsExpiryAlertClass(dateStr) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const msPerDay = 86400000;
    const daysUntil = (d.getTime() - now.getTime()) / msPerDay;
    if (daysUntil < 0) return 'text-danger fw-semibold';
    if (daysUntil <= 30) return 'text-danger';
    return '';
}

function normalizeApiList(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
}

async function loadDbsSuppliers() {
    if (!window.dbsSuppliersTable) return;
    try {
        window.dbsSuppliersTable.setLoading(true);
        const raw = await getSuppliers({ has_dbs: true });
        dbsSuppliers = normalizeApiList(raw);
        window.dbsSuppliersTable.setLoading(false);
        window.dbsSuppliersTable.updateData(dbsSuppliers, dbsSuppliers.length, 1);
    } catch (error) {
        console.error('Error loading DBS suppliers:', error);
        showErrorMessage(error.message || 'DBS tedarikçileri yüklenirken hata oluştu.');
        if (window.dbsSuppliersTable) {
            window.dbsSuppliersTable.setLoading(false);
            window.dbsSuppliersTable.updateData([]);
        }
    }
}

async function refreshDbsSupplierRow(supplierId) {
    try {
        const updated = await getSupplier(supplierId);
        const idx = dbsSuppliers.findIndex((s) => Number(s.id) === Number(supplierId));
        if (idx >= 0) {
            dbsSuppliers[idx] = { ...dbsSuppliers[idx], ...updated };
        } else {
            dbsSuppliers.push(updated);
        }
        if (window.dbsSuppliersTable) {
            window.dbsSuppliersTable.updateData([...dbsSuppliers], dbsSuppliers.length, 1);
        }
    } catch (e) {
        console.error(e);
        await loadDbsSuppliers();
    }
}

function openDbsPayModal(supplierId) {
    const row = dbsSuppliers.find((s) => Number(s.id) === Number(supplierId));
    if (!row || !dbsPayEditModal) {
        showErrorMessage('Tedarikçi bulunamadı.');
        return;
    }
    dbsPaySupplier = row;
    dbsPayEditModal.setFormData({
        dbs_supplier_display: row.name || `Tedarikçi #${supplierId}`,
        dbs_pay_amount: '',
        dbs_currency_ro: row.dbs_currency || 'TRY',
        dbs_pay_note: ''
    });
    updateDbsPayOverpaymentWarning();
    dbsPayEditModal.show();
}

function updateDbsPayOverpaymentWarning() {
    const warn = dbsPayEditModal?.container.querySelector('#dbs-pay-over-warning');
    if (!warn || !dbsPaySupplier) return;
    const raw = String(dbsPayEditModal.getFieldValue('dbs_pay_amount') ?? '').trim().replace(',', '.');
    const amt = parseFloat(raw);
    const used = parseMoneyNumber(dbsPaySupplier.dbs_used);
    const show = Number.isFinite(amt) && Number.isFinite(used) && amt > used;
    warn.classList.toggle('d-none', !show);
}

function setupDbsPaymentsCancelDelegation() {
    if (!dbsPaymentsDisplayModal?.modal) return;
    const root = dbsPaymentsDisplayModal.modal;
    if (root.dataset.dbsCancelDelegBound === '1') return;
    root.dataset.dbsCancelDelegBound = '1';
    root.addEventListener('click', (e) => {
        const btn = e.target.closest('.dbs-payment-cancel-btn');
        if (!btn) return;
        const paymentId = parseInt(btn.dataset.paymentId, 10);
        const supplierId = parseInt(btn.dataset.supplierId, 10);
        const amount = parseFloat(btn.dataset.amount);
        const currency = btn.dataset.currency || 'TRY';
        if (!Number.isFinite(paymentId) || !Number.isFinite(supplierId)) return;
        confirmCancelDbsPayment(paymentId, supplierId, amount, currency);
    });
}

async function handleDbsPaySave(formData) {
    if (!dbsPaySupplier) return;
    const raw = String(formData.amount ?? '').trim().replace(',', '.');
    const amt = parseFloat(raw);
    if (!Number.isFinite(amt) || amt <= 0) {
        showErrorMessage('Geçerli pozitif bir tutar girin.');
        return;
    }
    const noteVal = String(formData.note ?? '').trim();
    const payload = {
        supplier: dbsPaySupplier.id,
        amount: amt.toFixed(2)
    };
    if (noteVal) payload.note = noteVal;
    try {
        await createDbsPayment(payload);
        showSuccessMessage('DBS ödemesi kaydedildi.');
        dbsPayEditModal.hide();
        await refreshDbsSupplierRow(dbsPaySupplier.id);
    } catch (error) {
        console.error(error);
        showErrorMessage(error.message || 'Ödeme kaydedilirken hata oluştu.');
    }
}

async function openDbsPaymentsDrawer(supplierId) {
    const row = dbsSuppliers.find((s) => Number(s.id) === Number(supplierId));
    const name = row?.name || `Tedarikçi #${supplierId}`;
    if (!dbsPaymentsDisplayModal) return;

    dbsPaymentsDisplayModal.clearData();
    dbsPaymentsDisplayModal.addCustomSection({
        id: 'dbs-payments-section',
        customContent: `<p class="text-muted small mb-2">${escapeHtml(name)}</p><div id="dbs-payments-list-host"><div class="text-center text-muted py-4">Yükleniyor…</div></div>`
    });
    dbsPaymentsDisplayModal.render();
    dbsPaymentsDisplayModal.show();

    const host = document.getElementById('dbs-payments-list-host');
    try {
        const raw = await listDbsPayments(supplierId);
        const payments = normalizeApiList(raw);
        renderDbsPaymentsListIntoHost(host, payments, supplierId);
    } catch (error) {
        console.error(error);
        if (host) {
            host.innerHTML = `<div class="alert alert-danger m-0">${escapeHtml(error.message || 'Liste yüklenemedi.')}</div>`;
        }
    }
}

function renderDbsPaymentsListIntoHost(host, payments, supplierId) {
    if (!host) return;
    if (!payments.length) {
        host.innerHTML = '<p class="text-muted text-center py-4 mb-0">Kayıtlı ödeme yok.</p>';
        return;
    }
    const rowsHtml = payments.map((p) => {
        const dateLabel = formatDate(p.paid_at || p.created_at);
        const amountStr = formatCurrency(parseMoneyNumber(p.amount), p.currency || 'TRY');
        const by = p.paid_by_username ? escapeHtml(String(p.paid_by_username)) : '—';
        const note = p.note ? escapeHtml(String(p.note)) : '—';
        const amtNum = parseMoneyNumber(p.amount);
        const safeAmt = Number.isFinite(amtNum) ? amtNum : 0;
        const cur = p.currency || 'TRY';
        return `
            <tr data-payment-id="${p.id}">
                <td>${escapeHtml(dateLabel)}</td>
                <td><strong>${amountStr}</strong></td>
                <td>${by}</td>
                <td class="small text-muted">${note}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-outline-danger dbs-payment-cancel-btn"
                        data-payment-id="${p.id}"
                        data-supplier-id="${supplierId}"
                        data-amount="${safeAmt}"
                        data-currency="${escapeHtml(String(cur))}">
                        İptal
                    </button>
                </td>
            </tr>`;
    }).join('');

    host.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm table-striped align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th>Tarih</th>
                        <th>Tutar</th>
                        <th>Ödeyen</th>
                        <th>Not</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>`;
}

function confirmCancelDbsPayment(paymentId, supplierId, amount, currency) {
    const cur = currency || 'TRY';
    const formatted = formatCurrency(amount, cur);
    actionConfirmModal.show({
        message: `Bu işlem tedarikçinin kullanılan kredisine ${formatted} geri ekler. Devam etmek istiyor musunuz?`,
        onConfirm: async () => {
            try {
                await deleteDbsPayment(paymentId);
                showSuccessMessage('Ödeme iptal edildi.');
                const row = document.querySelector(`#dbs-payments-list-host tr[data-payment-id="${paymentId}"]`);
                if (row) row.remove();
                const tbody = document.querySelector('#dbs-payments-list-host tbody');
                if (tbody && !tbody.querySelector('tr')) {
                    const host = document.getElementById('dbs-payments-list-host');
                    if (host) {
                        host.innerHTML = '<p class="text-muted text-center py-4 mb-0">Kayıtlı ödeme yok.</p>';
                    }
                }
                await refreshDbsSupplierRow(supplierId);
            } catch (error) {
                console.error(error);
                showErrorMessage(error.message || 'İptal sırasında hata oluştu.');
            }
        }
    });
}

// Add event listeners
function addEventListeners() {
    // PO detayı, ödeme işaretleme ve DBS formları DisplayModal / EditModal üzerinden (initFinancePurchaseOrderModals).
}

// Load purchase orders
async function loadPurchaseOrders() {
    try {
        // Set loading state on table
        if (window.purchaseOrdersTable) {
            window.purchaseOrdersTable.setLoading(true);
        }
        
        // Add pagination parameters to filters
        const filtersWithPagination = {
            ...currentFilters,
            page: currentPage,
            // Get page size from table component if available, otherwise use local variable
            // This ensures we always use the most up-to-date page size
            page_size: window.purchaseOrdersTable ? window.purchaseOrdersTable.options.itemsPerPage : itemsPerPage
        };
        
        const data = await getPurchaseOrders(filtersWithPagination);
        
        // Handle both paginated and non-paginated responses
        if (data.results) {
            // Paginated response
            currentPurchaseOrders = data.results;
            const totalItems = data.count || data.total || data.results.length;
            
            // Update table with paginated data
            if (window.purchaseOrdersTable) {
                window.purchaseOrdersTable.setLoading(false);
                window.purchaseOrdersTable.updateData(currentPurchaseOrders, totalItems, currentPage);
            }
        } else {
            // Non-paginated response (fallback)
            currentPurchaseOrders = data;
            
            // Update table with all data
            if (window.purchaseOrdersTable) {
                window.purchaseOrdersTable.setLoading(false);
                window.purchaseOrdersTable.updateData(currentPurchaseOrders, currentPurchaseOrders.length, currentPage);
            }
        }
        
        renderStatistics();
        
    } catch (error) {
        console.error('Error loading purchase orders:', error);
        showErrorMessage('Satın alma siparişleri yüklenirken hata oluştu.');
        
        // Update table with empty data on error
        if (window.purchaseOrdersTable) {
            window.purchaseOrdersTable.setLoading(false);
            window.purchaseOrdersTable.updateData([]);
        }
    }
}

// Load specific purchase order directly
async function loadSpecificPurchaseOrder(orderId) {
    try {
        // Set loading state on table
        if (window.purchaseOrdersTable) {
            window.purchaseOrdersTable.setLoading(true);
        }
        
        // Fetch the specific order
        const order = await getPurchaseOrderById(orderId);
        
        // Update table with just this order
        if (window.purchaseOrdersTable) {
            window.purchaseOrdersTable.setLoading(false);
            window.purchaseOrdersTable.updateData([order]);
        }
        
        // Update statistics with just this order
        currentPurchaseOrders = [order];
        renderStatistics();
        
        // Show the modal for the specific order
        await viewPurchaseOrderDetails(orderId);
        
    } catch (error) {
        console.error('Error loading specific purchase order:', error);
        showErrorMessage('Belirtilen sipariş bulunamadı.');
        
        // Update table with empty data on error
        if (window.purchaseOrdersTable) {
            window.purchaseOrdersTable.setLoading(false);
            window.purchaseOrdersTable.updateData([]);
        }
    }
}

// Event handlers for table
function handleSort(field, direction) {
    // Handle sorting if needed
    console.log('Sort:', field, direction);
    loadPurchaseOrders();
}

function handleRowClick(row) {
    // Handle row click if needed
    console.log('Row clicked:', row);
}

function handlePageChange(page) {
    console.log('Page changed to:', page);
    currentPage = page;
    loadPurchaseOrders();
}

function handlePageSizeChange(newPageSize) {
    console.log('Page size changed to:', newPageSize);
    // Update local variable to keep in sync
    itemsPerPage = newPageSize;
    // Ensure table component also has the correct value (should already be set, but ensure sync)
    if (window.purchaseOrdersTable) {
        window.purchaseOrdersTable.options.itemsPerPage = newPageSize;
    }
    // Reset to page 1 and load with new page size
    currentPage = 1;
    loadPurchaseOrders();
}

// Render statistics
function renderStatistics() {
    const totalOrders = currentPurchaseOrders.length;
    const totalAmount = currentPurchaseOrders.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0);
    const awaitingPayment = currentPurchaseOrders.filter(order => order.status === 'awaiting_payment').length;
    const paidOrders = currentPurchaseOrders.filter(order => order.status === 'paid').length;
    
    // Update statistics cards
    const statsComponent = window.purchaseOrdersStats;
    if (statsComponent) {
        statsComponent.updateValues({
            0: totalOrders.toString(),
            1: formatCurrency(totalAmount, 'TRY'),
            2: awaitingPayment.toString(),
            3: paidOrders.toString()
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
                            ${isPaid ? 
                                // For paid items, show the tax amount that was actually paid
                                (schedule.paid_with_tax ? `
                                    <span class="text-success">
                                        <small>+ ${formatCurrency(schedule.base_tax || 0, schedule.currency)} (KDV Ödendi)</small>
                                    </span>
                                ` : `
                                    <span class="text-muted">
                                        <small>+ ${formatCurrency(0, schedule.currency)} (KDV Ödendi)</small>
                                    </span>
                                `) :
                                // For unpaid items, show the tax amount due
                                (schedule.effective_tax_due > 0 ? `
                                    <span class="text-${order.tax_outstanding > 0 ? 'danger' : 'success'}">
                                        <small>+ ${formatCurrency(schedule.effective_tax_due, schedule.currency)} (KDV)</small>
                                    </span>
                                ` : '')
                            }
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
    const order = currentPurchaseOrders.find((o) => Number(o.id) === Number(orderId));
    const schedule = order?.payment_schedules?.find((s) => Number(s.id) === Number(scheduleId));

    if (!order || !schedule || !markPaidEditModal) {
        showErrorMessage('Ödeme planı bulunamadı.');
        return;
    }

    selectedPaymentSchedule = { orderId, scheduleId, schedule };

    const unpaidSchedules = order.payment_schedules.filter((s) => !s.is_paid);
    const isLastSequence = unpaidSchedules.length === 1 && unpaidSchedules[0].id === scheduleId;

    markPaidEditModal.setFormData({
        schedule_label_ro: schedule.label,
        payment_currency_ro: schedule.currency,
        payment_due_date_ro: formatDate(schedule.due_date),
        paid_with_tax: true
    });

    const cb = markPaidEditModal.container.querySelector('#paid_with_tax');
    if (cb) {
        cb.disabled = isLastSequence;
        const wrap = cb.closest('.checkbox-field') || cb.parentElement;
        if (wrap) wrap.classList.toggle('text-muted', isLastSequence);
    }

    updatePaymentAmountDisplay();
    markPaidEditModal.show();
}

async function handleMarkPaidSave(formData) {
    if (!selectedPaymentSchedule) {
        showErrorMessage('Ödeme planı seçilmedi.');
        return;
    }
    const { orderId, scheduleId } = selectedPaymentSchedule;
    const paidWithTax = !!formData.paid_with_tax;
    try {
        await markSchedulePaid(orderId, scheduleId, paidWithTax);
        showSuccessMessage('Ödeme başarıyla işaretlendi.');
        markPaidEditModal.hide();
        loadPurchaseOrders();
    } catch (error) {
        console.error('Error marking payment as paid:', error);
        showErrorMessage(error.message || 'Ödeme işaretlenirken hata oluştu.');
    }
}

// Update payment amount display based on checkbox
function updatePaymentAmountDisplay() {
    if (!selectedPaymentSchedule || !markPaidEditModal) return;

    const { schedule } = selectedPaymentSchedule;
    const paidWithTaxCheckbox = markPaidEditModal.container.querySelector('#paid_with_tax');
    const paidWithTax = paidWithTaxCheckbox ? paidWithTaxCheckbox.checked : true;

    const order = currentPurchaseOrders.find((o) => Number(o.id) === Number(selectedPaymentSchedule.orderId));
    if (!order) return;
    const unpaidSchedules = order.payment_schedules.filter((s) => !s.is_paid);
    const isLastSequence =
        unpaidSchedules.length === 1 && unpaidSchedules[0].id === selectedPaymentSchedule.scheduleId;

    let displayAmount;
    if (isLastSequence) {
        const totalWithTax = parseFloat(schedule.amount || 0) + parseFloat(schedule.effective_tax_due || 0);
        displayAmount = formatCurrency(totalWithTax, schedule.currency);
        if (paidWithTaxCheckbox) {
            paidWithTaxCheckbox.checked = true;
            paidWithTaxCheckbox.disabled = true;
            const wrap = paidWithTaxCheckbox.closest('.checkbox-field') || paidWithTaxCheckbox.parentElement;
            if (wrap) wrap.classList.add('text-muted');
        }
    } else {
        if (paidWithTax) {
            const totalWithTax = parseFloat(schedule.amount || 0) + parseFloat(schedule.effective_tax_due || 0);
            displayAmount = formatCurrency(totalWithTax, schedule.currency);
        } else {
            displayAmount = formatCurrency(schedule.amount || 0, schedule.currency);
        }
        if (paidWithTaxCheckbox) {
            paidWithTaxCheckbox.disabled = false;
            const wrap = paidWithTaxCheckbox.closest('.checkbox-field') || paidWithTaxCheckbox.parentElement;
            if (wrap) wrap.classList.remove('text-muted');
        }
    }

    markPaidEditModal.setFieldValue('payment_display_amount', displayAmount);
}


// Delete purchase order (admin only)
function confirmAndDeletePurchaseOrder(orderId) {
    if (!isAdmin()) {
        showErrorMessage('Bu işlem için yetkiniz yok.');
        return;
    }
    actionConfirmModal.show({
        message: 'Bu satın alma siparişini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
        onConfirm: async () => {
            try {
                await deletePurchaseOrder(orderId);
                if (selectedPurchaseOrder && selectedPurchaseOrder.id === orderId) {
                    poDetailsDisplayModal?.hide();
                    selectedPurchaseOrder = null;
                }
                showSuccessMessage('Satın alma siparişi silindi.');
                loadPurchaseOrders();
            } catch (error) {
                console.error('Error deleting purchase order:', error);
                showErrorMessage(error.message || 'Sipariş silinirken hata oluştu.');
            }
        }
    });
}

// View purchase order details
async function viewPurchaseOrderDetails(orderId) {
    try {
        const order = await getPurchaseOrderById(orderId);
        selectedPurchaseOrder = order;

        // Update URL to include the order ID
        const url = new URL(window.location);
        url.searchParams.set('order', orderId);
        window.history.pushState({}, '', url);

        const detailsHtml = `
            <div class="row">
                <div class="col-md-6">
                    <h6 class="text-primary">Genel</h6>
                    <table class="table table-sm">
                        <tr><td><strong>Sipariş No:</strong></td><td>${order.id}</td></tr>
                        <tr><td><strong>Tedarikçi:</strong></td><td>${order.supplier_name}</td></tr>
                        <tr><td><strong>Durum:</strong></td><td><span class="status-badge ${getStatusBadgeClass(order.status)}">${order.status_label || getStatusText(order.status)}</span></td></tr>
                        <tr><td><strong>Öncelik:</strong></td><td><span class="status-badge ${getPriorityBadgeClass(order.priority)}">${getPriorityText(order.priority)}</span></td></tr>
                        <tr><td><strong>Oluşturulma Tarihi:</strong></td><td>${formatDate(order.created_at)}</td></tr>
                        <tr><td><strong>PR No:</strong></td><td><a href="${backendBase}procurement/purchase-requests/registry/?talep=${order.purchase_request_number}" target="_blank" class="text-primary">${order.purchase_request_number || 'N/A'}</a></td></tr>
                        <tr><td><strong>Kalem Sayısı:</strong></td><td>${(order.lines || []).length}</td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6 class="text-primary">Fiyat Bilgileri</h6>
                                         <table class="table table-sm">
                         <tr><td><strong>Para Birimi:</strong></td><td><span class="currency-badge">${order.currency}</span></td></tr>
                         <tr><td><strong>Toplam Tutar:</strong></td><td><strong>${formatCurrency(order.total_amount, order.currency)}</strong></td></tr>
                         <tr><td><strong>KDV Tutarı:</strong></td><td><strong>${formatCurrency(order.total_tax_amount, order.currency)}</strong></td></tr>
                         <tr><td><strong>KDV Oranı:</strong></td><td>${order.tax_rate}%</td></tr>
                         <tr><td><strong>Kalan Tutar:</strong></td><td><span class="text-${(order.payment_schedules || []).filter(s => !s.is_paid).reduce((sum, s) => sum + parseFloat(s.amount), 0) > 0 ? 'danger' : 'success'}"><strong>${formatCurrency((order.payment_schedules || []).filter(s => !s.is_paid).reduce((sum, s) => sum + parseFloat(s.amount), 0), order.currency)}</strong></span></td></tr>
                         <tr><td><strong>Kalan KDV Borcu:</strong></td><td><span class="text-${order.tax_outstanding > 0 ? 'danger' : 'success'}"><strong>${formatCurrency(order.tax_outstanding, order.currency)}</strong></span></td></tr>
                     </table>
                </div>
            </div>
            <div class="row mt-3">
                <div class="col-12">
                    <div id="payment-schedule-table-container"></div>
                </div>
            </div>
            ${(order.lines || []).length > 0 ? `
            <div class="row mt-3">
                <div class="col-12">
                    <div id="order-lines-table-container"></div>
                </div>
            </div>
            ` : ''}
        `;

        poDetailsDisplayModal.clearData();
        poDetailsDisplayModal.addCustomSection({
            id: 'po-detail-main',
            customContent: detailsHtml
        });
        poDetailsDisplayModal.render();

        // Create payment schedule table using the table component
        if (order.payment_schedules && order.payment_schedules.length > 0) {
            new TableComponent('payment-schedule-table-container', {
                title: 'Ödeme Planı',
                columns: [
                    { field: 'sequence', label: 'Sıra', sortable: false, formatter: (value) => `<span class="text-center">${value}</span>` },
                    { field: 'label', label: 'Ödeme Türü', sortable: false },
                    { field: 'percentage', label: 'Yüzde', sortable: false, formatter: (value) => `<span class="text-end">${value}%</span>` },
                    { field: 'due_date', label: 'Vade Tarihi', sortable: false, formatter: (value) => `<span class="text-center">${formatDate(value)}</span>` },
                    { field: 'amount', label: 'Tutar', sortable: false, formatter: (value, row) => `<span class="text-end"><strong>${formatCurrency(value, row.currency)}</strong></span>` },
                    { field: 'tax_amount', label: 'KDV Tutarı', sortable: false, formatter: (value, row) => {
                        const isPaid = row.is_paid;
                        const taxAmount = isPaid ?
                            (row.paid_with_tax ? (row.base_tax || 0) : 0) :
                            row.effective_tax_due;
                        return `<span class="text-end">${formatCurrency(taxAmount, row.currency)}</span>`;
                    }},
                    { field: 'status', label: 'Durum', sortable: false, formatter: (value, row) => {
                        const isPaid = row.is_paid;
                        const isOverdue = new Date(row.due_date) < new Date() && !isPaid;
                        const statusClass = isPaid ? 'success' : isOverdue ? 'danger' : 'warning';
                        const statusText = isPaid ? 'Ödendi' : isOverdue ? 'Gecikmiş' : 'Bekliyor';
                        return `<span class="text-center"><span class="badge bg-${statusClass}">${statusText}</span></span>`;
                    }},
                    { field: 'actions', label: 'İşlemler', sortable: false, formatter: (value, row) => {
                        if (!row.is_paid) {
                            return `<span class="text-center"><button class="btn btn-sm btn-outline-success" onclick="showMarkPaidModal(${order.id}, ${row.id})" title="Ödeme İşaretle"><i class="fas fa-check"></i></button></span>`;
                        } else {
                            return `<span class="text-center"><span class="text-success"><i class="fas fa-check-circle"></i></span></span>`;
                        }
                    }}
                ],
                data: order.payment_schedules.map(schedule => ({
                    ...schedule,
                    tax_amount: schedule.effective_tax_due // Add this field for the formatter
                })),
                tableClass: 'table table-sm table-striped',
                responsive: true,
                striped: true,
                small: true,
                sortable: false,
                pagination: false
            });
        }

        // Create order lines table using the table component
        if (order.lines && order.lines.length > 0) {
            new TableComponent('order-lines-table-container', {
                title: 'Sipariş Kalemleri',
                columns: [
                    { field: 'item_code', label: 'Malzeme Kodu', sortable: false, formatter: (value) => `<code>${value}</code>` },
                    { field: 'item_name', label: 'Malzeme Adı', sortable: false },
                    { field: 'job_no', label: 'İş Emri No', sortable: false, formatter: (value, row) => {
                        if (row.allocations && row.allocations.length > 0) {
                            return row.allocations.map(allocation => allocation.job_no).join(', ');
                        }
                        return '-';
                    }},
                    { field: 'quantity', label: 'Miktar', sortable: false, formatter: (value) => `<span class="text-end">${parseFloat(value).toLocaleString('tr-TR')}</span>` },
                    { field: 'unit_price', label: 'Birim Fiyat', sortable: false, formatter: (value) => `<span class="text-end">${formatCurrency(value, order.currency)}</span>` },
                    { field: 'total_price', label: 'Toplam', sortable: false, formatter: (value) => `<span class="text-end"><strong>${formatCurrency(value, order.currency)}</strong></span>` },
                    { field: 'delivery_days', label: 'Teslimat (Gün)', sortable: false, formatter: (value) => `<span class="text-center">${value > 0 ? value : '-'}</span>` },
                    { field: 'notes', label: 'Notlar', sortable: false, formatter: (value) => value ? `<small class="text-muted">${value}</small>` : '-' }
                ],
                data: order.lines,
                tableClass: 'table table-sm table-striped',
                responsive: true,
                striped: true,
                small: true,
                sortable: false,
                pagination: false
            });
        }

        poDetailsDisplayModal.show();

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
        'awaiting_payment': 'status-yellow',
        'paid': 'status-green',
        'cancelled': 'status-red'
    };
    return statusClasses[status] || 'status-grey';
}

function getStatusText(status) {
    const statusTexts = {
        'awaiting_payment': 'Ödeme Bekliyor',
        'paid': 'Ödendi',
        'cancelled': 'İptal Edildi'
    };
    return statusTexts[status] || status;
}

function getPriorityBadgeClass(priority) {
    const priorityClasses = {
        'critical': 'status-red',
        'high': 'status-yellow',
        'normal': 'status-grey',
        'low': 'status-grey'
    };
    return priorityClasses[priority] || 'status-grey';
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
    const cur = currency || 'TRY';
    if (amount === null || amount === undefined || amount === '') {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur }).format(0);
    }
    const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(',', '.'));
    if (Number.isNaN(num)) {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: cur }).format(0);
    }
    return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: cur
    }).format(num);
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('tr-TR');
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
window.showMarkPaidModal = showMarkPaidModal;
window.openDbsPayModal = openDbsPayModal;
window.openDbsPaymentsDrawer = openDbsPaymentsDrawer;
