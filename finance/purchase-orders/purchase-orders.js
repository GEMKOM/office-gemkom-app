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
import {
    getExpenses,
    createExpense,
    cancelExpense
} from '../../apis/finance/expenses.js';
import {
    getLoans,
    createLoan,
    cancelLoan,
    getLoanInstallments,
    markLoanInstallmentPaid
} from '../../apis/finance/loans.js';
import {
    getTaxes,
    createTax,
    markTaxPaid
} from '../../apis/finance/taxes.js';
import {
    getExpectedReceipts,
    createExpectedReceipt,
    cancelExpectedReceipt,
    getExpectedReceiptInstallments,
    createExpectedReceiptInstallment,
    markExpectedReceiptInstallmentReceived
} from '../../apis/finance/expected-receipts.js';
import { isAdmin } from '../../authService.js';
import { HeaderComponent } from '../../components/header/header.js';
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
let currentExpenses = [];
let currentExpenseFilters = { status: 'active' };
let expenseFormModal = null;
let currentLoans = [];
let currentLoanFilters = { status: 'active' };
let loanFormModal = null;
let loanInstallmentsDisplayModal = null;
let activeLoanContext = null;
let currentTaxes = [];
let currentTaxFilters = { is_paid: 'false' };
let taxFormModal = null;
let currentExpectedReceipts = [];
let currentReceiptFilters = { status: 'expected' };
let expectedReceiptFormModal = null;
let expectedReceiptInstallmentFormModal = null;
let expectedReceiptInstallmentsDisplayModal = null;
let activeReceiptContext = null;

const RECEIPT_STATUS_OPTIONS = [
    { value: 'expected', label: 'Bekleniyor' },
    { value: 'cancelled', label: 'İptal' }
];

const RECEIPT_STATUS_LABELS = Object.fromEntries(RECEIPT_STATUS_OPTIONS.map((o) => [o.value, o.label]));

const TAX_TYPE_OPTIONS = [
    { value: 'vat', label: 'KDV' },
    { value: 'corporate_tax', label: 'Kurumlar Vergisi' },
    { value: 'sgk', label: 'SGK' },
    { value: 'income_tax_withholding', label: 'Gelir Vergisi Stopajı' },
    { value: 'other', label: 'Diğer' }
];

const TAX_TYPE_LABELS = Object.fromEntries(TAX_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const EXPENSE_CATEGORY_OPTIONS = [
    { value: 'catering', label: 'Yemekhane / Catering' },
    { value: 'security', label: 'Güvenlik' },
    { value: 'transport', label: 'Ulaşım' },
    { value: 'rent', label: 'Kira' },
    { value: 'utilities', label: 'Kamu hizmetleri' },
    { value: 'insurance', label: 'Sigorta' },
    { value: 'other', label: 'Diğer' }
];

const EXPENSE_RECURRENCE_OPTIONS = [
    { value: 'once', label: 'Tek seferlik' },
    { value: 'monthly', label: 'Aylık' },
    { value: 'quarterly', label: 'Üç aylık' },
    { value: 'annual', label: 'Yıllık' }
];

const EXPENSE_CATEGORY_LABELS = Object.fromEntries(EXPENSE_CATEGORY_OPTIONS.map((o) => [o.value, o.label]));
const EXPENSE_RECURRENCE_LABELS = Object.fromEntries(EXPENSE_RECURRENCE_OPTIONS.map((o) => [o.value, o.label]));

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
            if (financeActiveTab !== 'po') {
                showErrorMessage('Bu sekmede dışa aktarma kullanılamaz.');
                return;
            }
            exportPurchaseOrdersData();
        },
        onCreateClick: () => handleFinanceCreateClick(),
        onRefreshClick: () => handleFinanceRefreshClick()
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
    initMonthlyExpensesTable();
    initExpenseFormModal();
    initExpensesFilters();
    initLoansFilters();
    initLoansTable();
    initLoanFormModal();
    initTaxesFilters();
    initTaxesTable();
    initTaxFormModal();
    initExpectedReceiptsFilters();
    initExpectedReceiptsTable();
    initExpectedReceiptFormModal();
    initExpectedReceiptInstallmentFormModal();
    setupFinanceMainTabs();
    
    // Check for order ID in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('order');
    
    if (orderId) {
        // Load the specific order directly instead of all orders
        await loadSpecificPurchaseOrder(orderId);
    }
    
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
        if (e.target && e.target.name === 'paid_with_tax' && e.target.type === 'checkbox') {
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

    loanInstallmentsDisplayModal = new DisplayModal('loan-installments-display-modal-container', {
        title: 'Kredi Taksitleri',
        icon: 'fas fa-list-ol',
        size: 'xl',
        showEditButton: false
    });
    setupLoanInstallmentMarkPaidDelegation();

    expectedReceiptInstallmentsDisplayModal = new DisplayModal('expected-receipt-installments-display-modal-container', {
        title: 'Tahsilat Taksitleri',
        icon: 'fas fa-list-ol',
        size: 'xl',
        showEditButton: false
    });
    setupExpectedReceiptInstallmentDelegation();
}

function handleFinanceRefreshClick() {
    if (financeActiveTab === 'dbs') loadDbsSuppliers();
    else if (financeActiveTab === 'expenses') loadExpenses();
    else if (financeActiveTab === 'loans') loadLoans();
    else if (financeActiveTab === 'taxes') loadTaxes();
    else if (financeActiveTab === 'receipts') loadExpectedReceipts();
    else loadPurchaseOrders();
}

function handleFinanceCreateClick() {
    if (financeActiveTab === 'expenses') openCreateExpenseModal();
    else if (financeActiveTab === 'loans') openCreateLoanModal();
    else if (financeActiveTab === 'taxes') openCreateTaxModal();
    else if (financeActiveTab === 'receipts') openCreateExpectedReceiptModal();
}

function updateFinanceHeaderForTab(tab) {
    if (!pageHeader) return;
    let createButtonText = 'Yeni Oluştur';
    if (tab === 'expenses') createButtonText = 'Yeni Gider';
    if (tab === 'loans') createButtonText = 'Yeni Kredi';
    if (tab === 'taxes') createButtonText = 'Yeni Vergi Kaydı';
    if (tab === 'receipts') createButtonText = 'Yeni Tahsilat';
    pageHeader.updateConfig({
        showExportButton: tab === 'po' ? 'block' : 'none',
        showCreateButton: tab === 'expenses' || tab === 'loans' || tab === 'taxes' || tab === 'receipts' ? 'block' : 'none',
        createButtonText,
        onCreateClick: () => handleFinanceCreateClick(),
        onRefreshClick: () => handleFinanceRefreshClick()
    });
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

function switchFinanceMainTab(tab) {
    financeActiveTab = tab;
    const poPane = document.getElementById('finance-tab-pane-po');
    const dbsPane = document.getElementById('finance-tab-pane-dbs');
    const expensesPane = document.getElementById('finance-tab-pane-expenses');
    const loansPane = document.getElementById('finance-tab-pane-loans');
    const taxesPane = document.getElementById('finance-tab-pane-taxes');
    const receiptsPane = document.getElementById('finance-tab-pane-receipts');
    if (poPane) poPane.classList.toggle('d-none', tab !== 'po');
    if (dbsPane) dbsPane.classList.toggle('d-none', tab !== 'dbs');
    if (expensesPane) expensesPane.classList.toggle('d-none', tab !== 'expenses');
    if (loansPane) loansPane.classList.toggle('d-none', tab !== 'loans');
    if (taxesPane) taxesPane.classList.toggle('d-none', tab !== 'taxes');
    if (receiptsPane) receiptsPane.classList.toggle('d-none', tab !== 'receipts');

    tabBarActiveClasses(tab);
    updateFinanceHeaderForTab(tab);

    if (tab === 'dbs') {
        loadDbsSuppliers();
    } else if (tab === 'expenses') {
        loadExpenses();
    } else if (tab === 'loans') {
        loadLoans();
    } else if (tab === 'taxes') {
        loadTaxes();
    } else if (tab === 'receipts') {
        loadExpectedReceipts();
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

function initExpensesFilters() {
    if (!document.getElementById('expenses-filters-placeholder')) return;

    new FiltersComponent('expenses-filters-placeholder', {
        title: 'Filtreler',
        onApply: (filters) => {
            currentExpenseFilters = filters;
            loadExpenses();
        },
        onClear: () => {
            currentExpenseFilters = { status: 'active' };
            loadExpenses();
        }
    })
        .addSelectFilter({
            id: 'status',
            label: 'Durum',
            value: 'active',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'active', label: 'Aktif' },
                { value: 'cancelled', label: 'İptal' }
            ],
            colSize: 2
        })
        .addSelectFilter({
            id: 'category',
            label: 'Kategori',
            options: [{ value: '', label: 'Tümü' }, ...EXPENSE_CATEGORY_OPTIONS],
            colSize: 2
        })
        .addSelectFilter({
            id: 'recurrence',
            label: 'Tekrar',
            options: [{ value: '', label: 'Tümü' }, ...EXPENSE_RECURRENCE_OPTIONS],
            colSize: 2
        })
        .addSelectFilter({
            id: 'currency',
            label: 'Para Birimi',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'TRY', label: 'Türk Lirası' },
                { value: 'USD', label: 'Amerikan Doları' },
                { value: 'EUR', label: 'Euro' }
            ],
            colSize: 2
        });
}

function initMonthlyExpensesTable() {
    if (!document.getElementById('monthly-expenses-table-container')) return;

    window.monthlyExpensesTable = new TableComponent('monthly-expenses-table-container', {
        title: 'Aylık Giderler',
        icon: 'calendar-alt',
        iconColor: 'text-primary',
        loading: false,
        pagination: false,
        refreshable: true,
        onRefresh: loadExpenses,
        columns: [
            {
                field: 'category',
                label: 'Kategori',
                sortable: true,
                formatter: (value) => escapeHtml(getExpenseCategoryLabel(value))
            },
            {
                field: 'description',
                label: 'Açıklama',
                sortable: true,
                formatter: (value) => (value ? `<strong>${escapeHtml(String(value))}</strong>` : '—')
            },
            {
                field: 'amount',
                label: 'Tutar',
                sortable: true,
                formatter: (value, row) => formatCurrency(value, row.currency)
            },
            {
                field: 'currency',
                label: 'Para Birimi',
                sortable: true,
                formatter: (value) => (value ? `<span class="currency-badge">${escapeHtml(String(value))}</span>` : '—')
            },
            {
                field: 'recurrence',
                label: 'Tekrar',
                sortable: true,
                formatter: (value) => escapeHtml(getExpenseRecurrenceLabel(value))
            },
            {
                field: 'start_date',
                label: 'Başlangıç',
                sortable: true,
                formatter: (value) => formatDate(value)
            },
            {
                field: 'end_date',
                label: 'Bitiş',
                sortable: true,
                formatter: (value) => (value ? formatDate(value) : '—')
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value) =>
                    `<span class="status-badge ${getExpenseStatusBadgeClass(value)}">${escapeHtml(getExpenseStatusLabel(value))}</span>`
            },
            {
                field: 'created_by_username',
                label: 'Oluşturan',
                sortable: true,
                formatter: (value) => (value ? escapeHtml(String(value)) : '—')
            }
        ],
        actions: [
            {
                key: 'cancel',
                label: 'İptal Et',
                icon: 'fas fa-ban',
                class: 'btn-outline-danger',
                visible: (row) => row.status === 'active',
                onClick: (row) => confirmCancelExpense(row.id, row.description)
            }
        ],
        data: [],
        skeleton: false,
        emptyMessage: 'Kayıtlı gider bulunmamaktadır.',
        emptyIcon: 'fas fa-calendar-alt'
    });
}

function initExpenseFormModal() {
    if (!document.getElementById('expense-form-modal-container')) return;

    expenseFormModal = new EditModal('expense-form-modal-container', {
        title: 'Yeni Gider',
        icon: 'fas fa-plus',
        saveButtonText: 'Kaydet',
        size: 'lg'
    });
    expenseFormModal.addSection({
        id: 'expense-form-section',
        title: null,
        icon: 'fas fa-receipt',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'expense_category',
                name: 'category',
                label: 'Kategori',
                type: 'select',
                required: true,
                colSize: 6,
                options: EXPENSE_CATEGORY_OPTIONS
            },
            {
                id: 'expense_recurrence',
                name: 'recurrence',
                label: 'Tekrar',
                type: 'select',
                required: true,
                colSize: 6,
                value: 'monthly',
                options: EXPENSE_RECURRENCE_OPTIONS
            },
            {
                id: 'expense_description',
                name: 'description',
                label: 'Açıklama',
                type: 'text',
                required: true,
                placeholder: 'Örn. Yemekhane servisi',
                colSize: 12
            },
            {
                id: 'expense_amount',
                name: 'amount',
                label: 'Tutar',
                type: 'number',
                required: true,
                min: 0.01,
                step: 0.01,
                placeholder: '0,00',
                colSize: 6
            },
            {
                id: 'expense_currency',
                name: 'currency',
                label: 'Para birimi',
                type: 'select',
                required: true,
                value: 'TRY',
                colSize: 6,
                options: [
                    { value: 'TRY', label: 'TRY' },
                    { value: 'USD', label: 'USD' },
                    { value: 'EUR', label: 'EUR' }
                ]
            },
            {
                id: 'expense_start_date',
                name: 'start_date',
                label: 'Başlangıç tarihi',
                type: 'date',
                required: true,
                colSize: 6
            },
            {
                id: 'expense_end_date',
                name: 'end_date',
                label: 'Bitiş tarihi',
                type: 'date',
                required: false,
                colSize: 6,
                help: 'Boş bırakılırsa süresiz geçerlidir.'
            },
            {
                id: 'expense_notes',
                name: 'notes',
                label: 'Notlar',
                type: 'textarea',
                rows: 2,
                required: false,
                colSize: 12
            }
        ]
    });
    expenseFormModal.render();
    expenseFormModal.onSaveCallback(handleCreateExpenseSave);
}

function getExpenseCategoryLabel(value) {
    return EXPENSE_CATEGORY_LABELS[value] || value || '—';
}

function getExpenseRecurrenceLabel(value) {
    return EXPENSE_RECURRENCE_LABELS[value] || value || '—';
}

function getExpenseStatusLabel(status) {
    const labels = { active: 'Aktif', cancelled: 'İptal' };
    return labels[status] || status || '—';
}

function getExpenseStatusBadgeClass(status) {
    const classes = { active: 'status-green', cancelled: 'status-red' };
    return classes[status] || 'status-grey';
}

function openCreateExpenseModal() {
    if (!expenseFormModal) return;
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    expenseFormModal.setFormData({
        category: 'catering',
        recurrence: 'monthly',
        description: '',
        amount: '',
        currency: 'TRY',
        start_date: `${y}-${m}-${d}`,
        end_date: '',
        notes: ''
    });
    expenseFormModal.show();
}

async function handleCreateExpenseSave(formData) {
    const rawAmount = String(formData.amount ?? '').trim().replace(',', '.');
    const amountNum = parseFloat(rawAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
        showErrorMessage('Geçerli pozitif bir tutar girin.');
        return;
    }

    const payload = {
        category: formData.category,
        description: String(formData.description ?? '').trim(),
        amount: amountNum.toFixed(2),
        currency: formData.currency || 'TRY',
        recurrence: formData.recurrence,
        start_date: formData.start_date,
        end_date: formData.end_date ? formData.end_date : null,
        status: 'active',
        notes: String(formData.notes ?? '').trim()
    };

    if (!payload.description) {
        showErrorMessage('Açıklama zorunludur.');
        return;
    }
    if (!payload.start_date) {
        showErrorMessage('Başlangıç tarihi zorunludur.');
        return;
    }

    try {
        await createExpense(payload);
        showSuccessMessage('Gider kaydedildi.');
        expenseFormModal.hide();
        await loadExpenses();
    } catch (error) {
        console.error(error);
        showErrorMessage(error.message || 'Gider kaydedilirken hata oluştu.');
    }
}

async function loadExpenses() {
    if (!window.monthlyExpensesTable) return;
    try {
        window.monthlyExpensesTable.setLoading(true);
        const raw = await getExpenses(currentExpenseFilters);
        currentExpenses = normalizeApiList(raw);
        window.monthlyExpensesTable.setLoading(false);
        window.monthlyExpensesTable.updateData(currentExpenses, currentExpenses.length, 1);
    } catch (error) {
        console.error('Error loading expenses:', error);
        showErrorMessage(error.message || 'Giderler yüklenirken hata oluştu.');
        if (window.monthlyExpensesTable) {
            window.monthlyExpensesTable.setLoading(false);
            window.monthlyExpensesTable.updateData([]);
        }
    }
}

function confirmCancelExpense(expenseId, description) {
    const label = description ? `"${description}"` : `#${expenseId}`;
    actionConfirmModal.show({
        message: `${label} giderini iptal etmek istediğinize emin misiniz?`,
        confirmText: 'İptal Et',
        confirmButtonClass: 'btn-danger',
        onConfirm: async () => {
            try {
                await cancelExpense(expenseId);
                showSuccessMessage('Gider iptal edildi.');
                await loadExpenses();
            } catch (error) {
                console.error(error);
                showErrorMessage(error.message || 'Gider iptal edilirken hata oluştu.');
            }
        }
    });
}

function initTaxesFilters() {
    if (!document.getElementById('taxes-filters-placeholder')) return;

    new FiltersComponent('taxes-filters-placeholder', {
        title: 'Filtreler',
        onApply: (filters) => {
            currentTaxFilters = filters;
            loadTaxes();
        },
        onClear: () => {
            currentTaxFilters = { is_paid: 'false' };
            loadTaxes();
        }
    })
        .addSelectFilter({
            id: 'is_paid',
            label: 'Ödeme durumu',
            value: 'false',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'false', label: 'Ödenmedi' },
                { value: 'true', label: 'Ödendi' }
            ],
            colSize: 2
        })
        .addSelectFilter({
            id: 'tax_type',
            label: 'Vergi türü',
            options: [{ value: '', label: 'Tümü' }, ...TAX_TYPE_OPTIONS],
            colSize: 2
        })
        .addSelectFilter({
            id: 'currency',
            label: 'Para Birimi',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'TRY', label: 'Türk Lirası' },
                { value: 'USD', label: 'Amerikan Doları' },
                { value: 'EUR', label: 'Euro' }
            ],
            colSize: 2
        });
}

function initTaxesTable() {
    if (!document.getElementById('taxes-table-container')) return;

    window.taxesTable = new TableComponent('taxes-table-container', {
        title: 'Vergi Kayıtları',
        icon: 'file-invoice-dollar',
        iconColor: 'text-primary',
        loading: false,
        pagination: false,
        refreshable: true,
        onRefresh: loadTaxes,
        columns: [
            {
                field: 'tax_type',
                label: 'Tür',
                sortable: true,
                formatter: (value) => escapeHtml(getTaxTypeLabel(value))
            },
            {
                field: 'period_label',
                label: 'Dönem',
                sortable: true,
                formatter: (value) => (value ? `<strong>${escapeHtml(String(value))}</strong>` : '—')
            },
            {
                field: 'description',
                label: 'Açıklama',
                sortable: true,
                formatter: (value) => (value ? escapeHtml(String(value)) : '—')
            },
            {
                field: 'amount',
                label: 'Tutar',
                sortable: true,
                formatter: (value, row) => formatCurrency(value, row.currency)
            },
            {
                field: 'currency',
                label: 'Para Birimi',
                sortable: true,
                formatter: (value) => (value ? `<span class="currency-badge">${escapeHtml(String(value))}</span>` : '—')
            },
            {
                field: 'due_date',
                label: 'Son ödeme',
                sortable: true,
                formatter: (value, row) => formatTaxDueDateCell(value, row.is_paid)
            },
            {
                field: 'is_paid',
                label: 'Durum',
                sortable: true,
                formatter: (value) =>
                    `<span class="status-badge ${value ? 'status-green' : 'status-yellow'}">${value ? 'Ödendi' : 'Ödenmedi'}</span>`
            },
            {
                field: 'paid_by_username',
                label: 'Ödeyen',
                sortable: true,
                formatter: (value, row) => (row.is_paid && value ? escapeHtml(String(value)) : '—')
            },
            {
                field: 'created_by_username',
                label: 'Oluşturan',
                sortable: true,
                formatter: (value) => (value ? escapeHtml(String(value)) : '—')
            }
        ],
        actions: [
            {
                key: 'mark-paid',
                label: 'Ödendi İşaretle',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                visible: (row) => !row.is_paid,
                onClick: (row) => confirmMarkTaxPaid(row.id, row.period_label)
            }
        ],
        data: [],
        skeleton: false,
        emptyMessage: 'Kayıtlı vergi bulunmamaktadır.',
        emptyIcon: 'fas fa-file-invoice-dollar'
    });
}

function initTaxFormModal() {
    if (!document.getElementById('tax-form-modal-container')) return;

    taxFormModal = new EditModal('tax-form-modal-container', {
        title: 'Yeni Vergi Kaydı',
        icon: 'fas fa-plus',
        saveButtonText: 'Kaydet',
        size: 'lg'
    });
    taxFormModal.addSection({
        id: 'tax-form-section',
        title: null,
        icon: 'fas fa-file-invoice-dollar',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'tax_type',
                name: 'tax_type',
                label: 'Vergi türü',
                type: 'select',
                required: true,
                value: 'vat',
                colSize: 6,
                options: TAX_TYPE_OPTIONS
            },
            {
                id: 'tax_currency',
                name: 'currency',
                label: 'Para birimi',
                type: 'select',
                required: true,
                value: 'TRY',
                colSize: 6,
                options: [
                    { value: 'TRY', label: 'TRY' },
                    { value: 'USD', label: 'USD' },
                    { value: 'EUR', label: 'EUR' }
                ]
            },
            {
                id: 'tax_period_label',
                name: 'period_label',
                label: 'Dönem etiketi',
                type: 'text',
                required: true,
                placeholder: 'Örn. Nisan 2026 KDV',
                colSize: 12
            },
            {
                id: 'tax_amount',
                name: 'amount',
                label: 'Tutar',
                type: 'number',
                required: true,
                min: 0.01,
                step: 0.01,
                placeholder: '0,00',
                colSize: 6
            },
            {
                id: 'tax_due_date',
                name: 'due_date',
                label: 'Son ödeme tarihi',
                type: 'date',
                required: true,
                colSize: 6
            },
            {
                id: 'tax_description',
                name: 'description',
                label: 'Açıklama',
                type: 'text',
                required: false,
                colSize: 12
            },
            {
                id: 'tax_notes',
                name: 'notes',
                label: 'Notlar',
                type: 'textarea',
                rows: 2,
                required: false,
                colSize: 12
            }
        ]
    });
    taxFormModal.render();
    taxFormModal.onSaveCallback(handleCreateTaxSave);
}

function getTaxTypeLabel(value) {
    return TAX_TYPE_LABELS[value] || value || '—';
}

function formatTaxDueDateCell(dateStr, isPaid) {
    if (!dateStr) return '—';
    const label = formatDate(dateStr);
    if (isPaid) return label;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return label;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    if (d < now) return `<span class="text-danger fw-semibold">${escapeHtml(label)}</span>`;
    const msPerDay = 86400000;
    const daysUntil = (d.getTime() - now.getTime()) / msPerDay;
    if (daysUntil <= 7) return `<span class="text-warning fw-semibold">${escapeHtml(label)}</span>`;
    return label;
}

function openCreateTaxModal() {
    if (!taxFormModal) return;
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    taxFormModal.setFormData({
        tax_type: 'vat',
        period_label: '',
        description: '',
        amount: '',
        currency: 'TRY',
        due_date: `${y}-${m}-${d}`,
        notes: ''
    });
    taxFormModal.show();
}

async function handleCreateTaxSave(formData) {
    const rawAmount = String(formData.amount ?? '').trim().replace(',', '.');
    const amountNum = parseFloat(rawAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
        showErrorMessage('Geçerli pozitif bir tutar girin.');
        return;
    }

    const periodLabel = String(formData.period_label ?? '').trim();
    if (!periodLabel) {
        showErrorMessage('Dönem etiketi zorunludur.');
        return;
    }
    if (!formData.due_date) {
        showErrorMessage('Son ödeme tarihi zorunludur.');
        return;
    }

    const payload = {
        tax_type: formData.tax_type,
        period_label: periodLabel,
        description: String(formData.description ?? '').trim(),
        amount: amountNum.toFixed(2),
        currency: formData.currency || 'TRY',
        due_date: formData.due_date,
        notes: String(formData.notes ?? '').trim()
    };

    try {
        await createTax(payload);
        showSuccessMessage('Vergi kaydı oluşturuldu.');
        taxFormModal.hide();
        await loadTaxes();
    } catch (error) {
        console.error(error);
        showErrorMessage(error.message || 'Vergi kaydı oluşturulurken hata oluştu.');
    }
}

async function loadTaxes() {
    if (!window.taxesTable) return;
    try {
        window.taxesTable.setLoading(true);
        const raw = await getTaxes(currentTaxFilters);
        currentTaxes = normalizeApiList(raw);
        window.taxesTable.setLoading(false);
        window.taxesTable.updateData(currentTaxes, currentTaxes.length, 1);
    } catch (error) {
        console.error('Error loading taxes:', error);
        showErrorMessage(error.message || 'Vergi kayıtları yüklenirken hata oluştu.');
        if (window.taxesTable) {
            window.taxesTable.setLoading(false);
            window.taxesTable.updateData([]);
        }
    }
}

function confirmMarkTaxPaid(taxId, periodLabel) {
    const label = periodLabel ? `"${periodLabel}"` : `#${taxId}`;
    actionConfirmModal.show({
        message: `${label} vergi kaydı ödendi olarak işaretlensin mi?`,
        confirmText: 'Ödendi İşaretle',
        confirmButtonClass: 'btn-success',
        onConfirm: async () => {
            try {
                await markTaxPaid(taxId);
                showSuccessMessage('Vergi ödendi olarak işaretlendi.');
                await loadTaxes();
            } catch (error) {
                console.error(error);
                showErrorMessage(error.message || 'Vergi işaretlenirken hata oluştu.');
            }
        }
    });
}

function initExpectedReceiptsFilters() {
    if (!document.getElementById('receipts-filters-placeholder')) return;

    new FiltersComponent('receipts-filters-placeholder', {
        title: 'Filtreler',
        onApply: (filters) => {
            currentReceiptFilters = filters;
            loadExpectedReceipts();
        },
        onClear: () => {
            currentReceiptFilters = { status: 'expected' };
            loadExpectedReceipts();
        }
    })
        .addSelectFilter({
            id: 'status',
            label: 'Durum',
            value: 'expected',
            options: [{ value: '', label: 'Tümü' }, ...RECEIPT_STATUS_OPTIONS],
            colSize: 2
        })
        .addSelectFilter({
            id: 'currency',
            label: 'Para Birimi',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'TRY', label: 'Türk Lirası' },
                { value: 'USD', label: 'Amerikan Doları' },
                { value: 'EUR', label: 'Euro' }
            ],
            colSize: 2
        });
}

function initExpectedReceiptsTable() {
    if (!document.getElementById('expected-receipts-table-container')) return;

    window.expectedReceiptsTable = new TableComponent('expected-receipts-table-container', {
        title: 'Beklenen Tahsilatlar',
        icon: 'hand-holding-usd',
        iconColor: 'text-primary',
        loading: false,
        pagination: false,
        refreshable: true,
        onRefresh: loadExpectedReceipts,
        columns: [
            {
                field: 'title',
                label: 'Başlık',
                sortable: true,
                formatter: (value) => (value ? `<strong>${escapeHtml(String(value))}</strong>` : '—')
            },
            {
                field: 'customer_name',
                label: 'Müşteri',
                sortable: true,
                formatter: (value) => (value ? escapeHtml(String(value)) : '—')
            },
            {
                field: 'job_no',
                label: 'İş emri',
                sortable: true,
                formatter: (value) => (value ? escapeHtml(String(value)) : '—')
            },
            {
                field: 'reference_no',
                label: 'Referans',
                sortable: true,
                formatter: (value) => (value ? escapeHtml(String(value)) : '—')
            },
            {
                field: 'total_amount',
                label: 'Toplam',
                sortable: true,
                formatter: (value, row) => formatCurrency(value, row.currency)
            },
            {
                field: 'currency',
                label: 'Para Birimi',
                sortable: true,
                formatter: (value) => (value ? `<span class="currency-badge">${escapeHtml(String(value))}</span>` : '—')
            },
            {
                field: '_installment_progress',
                label: 'Taksitler',
                sortable: false,
                formatter: (_v, row) => escapeHtml(formatReceiptInstallmentProgress(row))
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value) =>
                    `<span class="status-badge ${getReceiptStatusBadgeClass(value)}">${escapeHtml(getReceiptStatusLabel(value))}</span>`
            },
            {
                field: 'created_by_username',
                label: 'Oluşturan',
                sortable: true,
                formatter: (value) => (value ? escapeHtml(String(value)) : '—')
            }
        ],
        actions: [
            {
                key: 'installments',
                label: 'Taksitler',
                icon: 'fas fa-list-ol',
                class: 'btn-outline-primary',
                onClick: (row) => openExpectedReceiptInstallmentsDrawer(row.id)
            },
            {
                key: 'cancel',
                label: 'İptal Et',
                icon: 'fas fa-ban',
                class: 'btn-outline-danger',
                visible: (row) => row.status === 'expected',
                onClick: (row) => confirmCancelExpectedReceipt(row.id, row.title)
            }
        ],
        data: [],
        skeleton: false,
        emptyMessage: 'Kayıtlı tahsilat bulunmamaktadır.',
        emptyIcon: 'fas fa-hand-holding-usd'
    });
}

function initExpectedReceiptFormModal() {
    if (!document.getElementById('expected-receipt-form-modal-container')) return;

    expectedReceiptFormModal = new EditModal('expected-receipt-form-modal-container', {
        title: 'Yeni Beklenen Tahsilat',
        icon: 'fas fa-plus',
        saveButtonText: 'Kaydet',
        size: 'lg'
    });
    expectedReceiptFormModal.addSection({
        id: 'expected-receipt-form-section',
        title: null,
        icon: 'fas fa-hand-holding-usd',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'er_title',
                name: 'title',
                label: 'Başlık',
                type: 'text',
                required: true,
                placeholder: 'Örn. Petkim Retention Release',
                colSize: 12
            },
            {
                id: 'er_customer_name',
                name: 'customer_name',
                label: 'Müşteri',
                type: 'text',
                required: true,
                colSize: 6
            },
            {
                id: 'er_reference_no',
                name: 'reference_no',
                label: 'Referans no',
                type: 'text',
                required: false,
                colSize: 6
            },
            {
                id: 'er_total_amount',
                name: 'total_amount',
                label: 'Toplam tutar',
                type: 'number',
                required: true,
                min: 0.01,
                step: 0.01,
                colSize: 6
            },
            {
                id: 'er_currency',
                name: 'currency',
                label: 'Para birimi',
                type: 'select',
                required: true,
                value: 'TRY',
                colSize: 6,
                options: [
                    { value: 'TRY', label: 'TRY' },
                    { value: 'USD', label: 'USD' },
                    { value: 'EUR', label: 'EUR' }
                ]
            },
            {
                id: 'er_job_order',
                name: 'job_order',
                label: 'İş emri ID',
                type: 'number',
                required: false,
                min: 1,
                step: 1,
                colSize: 6,
                help: 'Opsiyonel. Boş bırakılabilir.'
            },
            {
                id: 'er_description',
                name: 'description',
                label: 'Açıklama',
                type: 'text',
                required: false,
                colSize: 6
            },
            {
                id: 'er_notes',
                name: 'notes',
                label: 'Notlar',
                type: 'textarea',
                rows: 2,
                required: false,
                colSize: 12
            }
        ]
    });
    expectedReceiptFormModal.render();
    expectedReceiptFormModal.onSaveCallback(handleCreateExpectedReceiptSave);
}

function initExpectedReceiptInstallmentFormModal() {
    if (!document.getElementById('expected-receipt-installment-form-modal-container')) return;

    expectedReceiptInstallmentFormModal = new EditModal('expected-receipt-installment-form-modal-container', {
        title: 'Taksit Ekle',
        icon: 'fas fa-plus',
        saveButtonText: 'Kaydet',
        size: 'md'
    });
    expectedReceiptInstallmentFormModal.addSection({
        id: 'er-installment-form-section',
        title: null,
        icon: 'fas fa-list-ol',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'er_inst_sequence',
                name: 'sequence',
                label: 'Sıra',
                type: 'number',
                required: true,
                min: 1,
                step: 1,
                colSize: 4
            },
            {
                id: 'er_inst_label',
                name: 'label',
                label: 'Etiket',
                type: 'text',
                required: true,
                placeholder: 'Örn. Avans',
                colSize: 8
            },
            {
                id: 'er_inst_amount',
                name: 'amount',
                label: 'Tutar',
                type: 'number',
                required: true,
                min: 0.01,
                step: 0.01,
                colSize: 6
            },
            {
                id: 'er_inst_due_date',
                name: 'due_date',
                label: 'Vade tarihi',
                type: 'date',
                required: true,
                colSize: 6
            },
            {
                id: 'er_inst_notes',
                name: 'notes',
                label: 'Notlar',
                type: 'textarea',
                rows: 2,
                required: false,
                colSize: 12
            }
        ]
    });
    expectedReceiptInstallmentFormModal.render();
    expectedReceiptInstallmentFormModal.onSaveCallback(handleAddExpectedReceiptInstallmentSave);
}

function getReceiptStatusLabel(status) {
    return RECEIPT_STATUS_LABELS[status] || status || '—';
}

function getReceiptStatusBadgeClass(status) {
    const classes = { expected: 'status-yellow', cancelled: 'status-red' };
    return classes[status] || 'status-grey';
}

function formatReceiptInstallmentProgress(row) {
    const installments = row.installments;
    const currency = row.currency || 'TRY';
    const total = parseMoneyNumber(row.total_amount);
    if (!Array.isArray(installments) || !installments.length) {
        return 'Taksit yok';
    }
    const receivedCount = installments.filter((i) => i.is_received).length;
    const receivedSum = installments
        .filter((i) => i.is_received)
        .reduce((sum, i) => sum + (parseMoneyNumber(i.amount) || 0), 0);
    const totalFmt = Number.isFinite(total) ? formatCurrency(total, currency) : '—';
    const receivedFmt = formatCurrency(receivedSum, currency);
    return `${receivedCount}/${installments.length} · ${receivedFmt} / ${totalFmt}`;
}

function openCreateExpectedReceiptModal() {
    if (!expectedReceiptFormModal) return;
    expectedReceiptFormModal.setFormData({
        title: '',
        customer_name: '',
        reference_no: '',
        total_amount: '',
        currency: 'TRY',
        job_order: '',
        description: '',
        notes: ''
    });
    expectedReceiptFormModal.show();
}

async function handleCreateExpectedReceiptSave(formData) {
    const rawTotal = String(formData.total_amount ?? '').trim().replace(',', '.');
    const totalNum = parseFloat(rawTotal);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
        showErrorMessage('Geçerli pozitif bir tutar girin.');
        return;
    }

    const title = String(formData.title ?? '').trim();
    const customerName = String(formData.customer_name ?? '').trim();
    if (!title) {
        showErrorMessage('Başlık zorunludur.');
        return;
    }
    if (!customerName) {
        showErrorMessage('Müşteri adı zorunludur.');
        return;
    }

    let jobOrder = null;
    const jobRaw = String(formData.job_order ?? '').trim();
    if (jobRaw) {
        const jobId = parseInt(jobRaw, 10);
        if (!Number.isFinite(jobId) || jobId < 1) {
            showErrorMessage('Geçerli bir iş emri ID girin veya boş bırakın.');
            return;
        }
        jobOrder = jobId;
    }

    const payload = {
        title,
        description: String(formData.description ?? '').trim(),
        reference_no: String(formData.reference_no ?? '').trim(),
        customer_name: customerName,
        job_order: jobOrder,
        total_amount: totalNum.toFixed(2),
        currency: formData.currency || 'TRY',
        status: 'expected',
        notes: String(formData.notes ?? '').trim()
    };

    try {
        const created = await createExpectedReceipt(payload);
        showSuccessMessage('Tahsilat kaydı oluşturuldu.');
        expectedReceiptFormModal.hide();
        await loadExpectedReceipts();
        if (created?.id) {
            openExpectedReceiptInstallmentsDrawer(created.id, created);
        }
    } catch (error) {
        console.error(error);
        showErrorMessage(error.message || 'Tahsilat kaydı oluşturulurken hata oluştu.');
    }
}

async function loadExpectedReceipts() {
    if (!window.expectedReceiptsTable) return;
    try {
        window.expectedReceiptsTable.setLoading(true);
        const raw = await getExpectedReceipts(currentReceiptFilters);
        currentExpectedReceipts = normalizeApiList(raw);
        window.expectedReceiptsTable.setLoading(false);
        window.expectedReceiptsTable.updateData(currentExpectedReceipts, currentExpectedReceipts.length, 1);
    } catch (error) {
        console.error('Error loading expected receipts:', error);
        showErrorMessage(error.message || 'Tahsilatlar yüklenirken hata oluştu.');
        if (window.expectedReceiptsTable) {
            window.expectedReceiptsTable.setLoading(false);
            window.expectedReceiptsTable.updateData([]);
        }
    }
}

function confirmCancelExpectedReceipt(receiptId, title) {
    const label = title ? `"${title}"` : `#${receiptId}`;
    actionConfirmModal.show({
        message: `${label} tahsilat kaydını iptal etmek istediğinize emin misiniz?`,
        confirmText: 'İptal Et',
        confirmButtonClass: 'btn-danger',
        onConfirm: async () => {
            try {
                await cancelExpectedReceipt(receiptId);
                showSuccessMessage('Tahsilat iptal edildi.');
                if (activeReceiptContext && Number(activeReceiptContext.id) === Number(receiptId)) {
                    activeReceiptContext.status = 'cancelled';
                }
                await loadExpectedReceipts();
                if (expectedReceiptInstallmentsDisplayModal?.modal?.classList.contains('show')) {
                    await refreshExpectedReceiptInstallmentsList(receiptId);
                }
            } catch (error) {
                console.error(error);
                showErrorMessage(error.message || 'Tahsilat iptal edilirken hata oluştu.');
            }
        }
    });
}

function setupExpectedReceiptInstallmentDelegation() {
    if (!expectedReceiptInstallmentsDisplayModal?.modal) return;
    const root = expectedReceiptInstallmentsDisplayModal.modal;
    if (root.dataset.erInstallmentDelegBound === '1') return;
    root.dataset.erInstallmentDelegBound = '1';
    root.addEventListener('click', (e) => {
        const addBtn = e.target.closest('#er-add-installment-btn');
        if (addBtn) {
            if (activeReceiptContext?.status !== 'expected') {
                showErrorMessage('İptal edilmiş tahsilata taksit eklenemez.');
                return;
            }
            openAddExpectedReceiptInstallmentModal();
            return;
        }
        const markBtn = e.target.closest('.er-installment-mark-received-btn');
        if (!markBtn) return;
        const receiptId = parseInt(markBtn.dataset.receiptId, 10);
        const installmentId = parseInt(markBtn.dataset.installmentId, 10);
        const label = markBtn.dataset.label || '';
        if (!Number.isFinite(receiptId) || !Number.isFinite(installmentId)) return;
        confirmMarkExpectedReceiptInstallmentReceived(receiptId, installmentId, label);
    });
}

async function openExpectedReceiptInstallmentsDrawer(receiptId, receiptRow = null) {
    const row =
        receiptRow ||
        currentExpectedReceipts.find((r) => Number(r.id) === Number(receiptId)) ||
        null;
    const title = row?.title || `Tahsilat #${receiptId}`;
    const currency = row?.currency || 'TRY';
    const status = row?.status || 'expected';
    const customer = row?.customer_name || '';

    activeReceiptContext = {
        id: receiptId,
        title,
        currency,
        status,
        customer_name: customer,
        installments: row?.installments || []
    };

    if (!expectedReceiptInstallmentsDisplayModal) return;

    const addBtnHtml =
        status === 'expected'
            ? `<button type="button" class="btn btn-sm btn-primary" id="er-add-installment-btn"><i class="fas fa-plus me-1"></i>Taksit Ekle</button>`
            : '';

    expectedReceiptInstallmentsDisplayModal.clearData();
    expectedReceiptInstallmentsDisplayModal.addCustomSection({
        id: 'expected-receipt-installments-section',
        customContent: `
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
                <div>
                    <p class="text-muted small mb-0">${escapeHtml(customer)}</p>
                    <p class="mb-0"><strong>${escapeHtml(title)}</strong></p>
                </div>
                ${addBtnHtml}
            </div>
            <div id="expected-receipt-installments-list-host"><div class="text-center text-muted py-4">Yükleniyor…</div></div>`
    });
    expectedReceiptInstallmentsDisplayModal.render();
    expectedReceiptInstallmentsDisplayModal.show();

    await refreshExpectedReceiptInstallmentsList(receiptId);
}

async function refreshExpectedReceiptInstallmentsList(receiptId) {
    const host = document.getElementById('expected-receipt-installments-list-host');
    if (!host) return;

    try {
        const installments = await getExpectedReceiptInstallments(receiptId);
        const cached = currentExpectedReceipts.find((r) => Number(r.id) === Number(receiptId));
        if (cached) cached.installments = installments;
        if (activeReceiptContext && Number(activeReceiptContext.id) === Number(receiptId)) {
            activeReceiptContext.installments = installments;
            activeReceiptContext.status = cached?.status || activeReceiptContext.status;
        }
        renderExpectedReceiptInstallmentsListIntoHost(host, installments, receiptId);
    } catch (error) {
        console.error(error);
        host.innerHTML = `<div class="alert alert-danger m-0">${escapeHtml(error.message || 'Taksitler yüklenemedi.')}</div>`;
    }
}

function renderExpectedReceiptInstallmentsListIntoHost(host, installments, receiptId) {
    if (!host) return;
    if (!installments.length) {
        host.innerHTML = '<p class="text-muted text-center py-4 mb-0">Henüz taksit eklenmemiş.</p>';
        return;
    }

    const currency = activeReceiptContext?.currency || 'TRY';
    const receiptActive = activeReceiptContext?.status === 'expected';

    const rowsHtml = installments
        .slice()
        .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
        .map((inst) => {
            const isReceived = !!inst.is_received;
            const statusClass = isReceived ? 'success' : 'warning';
            const statusLabel = isReceived ? 'Tahsil edildi' : 'Bekliyor';
            const dueLabel = formatDate(inst.due_date);
            const amountStr = formatCurrency(inst.amount, currency);
            const receivedBy = inst.received_by_username ? escapeHtml(String(inst.received_by_username)) : '—';
            const receivedAt = inst.received_at ? escapeHtml(formatDate(inst.received_at)) : '—';
            const markBtn =
                receiptActive && !isReceived
                    ? `<button type="button" class="btn btn-sm btn-outline-success er-installment-mark-received-btn"
                        data-receipt-id="${receiptId}"
                        data-installment-id="${inst.id}"
                        data-label="${escapeHtml(String(inst.label || ''))}">
                        Tahsil edildi
                    </button>`
                    : isReceived
                      ? '<span class="text-success"><i class="fas fa-check-circle"></i></span>'
                      : '—';

            return `
            <tr data-installment-id="${inst.id}">
                <td class="text-center">${escapeHtml(String(inst.sequence ?? '—'))}</td>
                <td>${escapeHtml(String(inst.label || '—'))}</td>
                <td>${escapeHtml(dueLabel)}</td>
                <td class="text-end"><strong>${amountStr}</strong></td>
                <td class="text-center"><span class="badge bg-${statusClass}">${statusLabel}</span></td>
                <td class="small">${receivedAt}</td>
                <td class="small">${receivedBy}</td>
                <td class="text-center">${markBtn}</td>
            </tr>`;
        })
        .join('');

    host.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm table-striped align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th class="text-center">#</th>
                        <th>Etiket</th>
                        <th>Vade</th>
                        <th class="text-end">Tutar</th>
                        <th class="text-center">Durum</th>
                        <th>Tahsilat tarihi</th>
                        <th>Tahsil eden</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>`;
}

function openAddExpectedReceiptInstallmentModal() {
    if (!expectedReceiptInstallmentFormModal || !activeReceiptContext) return;

    const installments = activeReceiptContext.installments || [];
    const maxSeq = installments.reduce((max, i) => Math.max(max, Number(i.sequence) || 0), 0);
    const nextSeq = maxSeq + 1;

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');

    expectedReceiptInstallmentFormModal.setFormData({
        sequence: String(nextSeq),
        label: '',
        amount: '',
        due_date: `${y}-${m}-${d}`,
        notes: ''
    });
    expectedReceiptInstallmentFormModal.show();
}

async function handleAddExpectedReceiptInstallmentSave(formData) {
    if (!activeReceiptContext) return;

    const receiptId = activeReceiptContext.id;
    const sequence = parseInt(String(formData.sequence ?? '').trim(), 10);
    const rawAmount = String(formData.amount ?? '').trim().replace(',', '.');
    const amountNum = parseFloat(rawAmount);

    if (!Number.isFinite(sequence) || sequence < 1) {
        showErrorMessage('Geçerli bir sıra numarası girin.');
        return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
        showErrorMessage('Geçerli pozitif bir tutar girin.');
        return;
    }
    const label = String(formData.label ?? '').trim();
    if (!label) {
        showErrorMessage('Etiket zorunludur.');
        return;
    }
    if (!formData.due_date) {
        showErrorMessage('Vade tarihi zorunludur.');
        return;
    }

    const payload = {
        sequence,
        label,
        amount: amountNum.toFixed(2),
        due_date: formData.due_date,
        notes: String(formData.notes ?? '').trim()
    };

    try {
        await createExpectedReceiptInstallment(receiptId, payload);
        showSuccessMessage('Taksit eklendi.');
        expectedReceiptInstallmentFormModal.hide();
        await loadExpectedReceipts();
        await refreshExpectedReceiptInstallmentsList(receiptId);
    } catch (error) {
        console.error(error);
        showErrorMessage(error.message || 'Taksit eklenirken hata oluştu.');
    }
}

function confirmMarkExpectedReceiptInstallmentReceived(receiptId, installmentId, label) {
    const seqLabel = label ? `"${label}"` : 'Bu taksit';
    actionConfirmModal.show({
        message: `${seqLabel} tahsil edildi olarak işaretlensin mi?`,
        confirmText: 'Tahsil Edildi',
        confirmButtonClass: 'btn-success',
        onConfirm: async () => {
            try {
                const updated = await markExpectedReceiptInstallmentReceived(receiptId, installmentId);
                showSuccessMessage('Taksit tahsil edildi olarak işaretlendi.');
                const receipt = currentExpectedReceipts.find((r) => Number(r.id) === Number(receiptId));
                if (receipt?.installments) {
                    const idx = receipt.installments.findIndex((i) => Number(i.id) === Number(installmentId));
                    if (idx >= 0) receipt.installments[idx] = { ...receipt.installments[idx], ...updated };
                }
                if (window.expectedReceiptsTable) {
                    window.expectedReceiptsTable.updateData([...currentExpectedReceipts], currentExpectedReceipts.length, 1);
                }
                await refreshExpectedReceiptInstallmentsList(receiptId);
            } catch (error) {
                console.error(error);
                showErrorMessage(error.message || 'Taksit işaretlenirken hata oluştu.');
            }
        }
    });
}

function initLoansFilters() {
    if (!document.getElementById('loans-filters-placeholder')) return;

    new FiltersComponent('loans-filters-placeholder', {
        title: 'Filtreler',
        onApply: (filters) => {
            currentLoanFilters = filters;
            loadLoans();
        },
        onClear: () => {
            currentLoanFilters = { status: 'active' };
            loadLoans();
        }
    })
        .addSelectFilter({
            id: 'status',
            label: 'Durum',
            value: 'active',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'active', label: 'Aktif' },
                { value: 'cancelled', label: 'İptal' }
            ],
            colSize: 2
        })
        .addSelectFilter({
            id: 'currency',
            label: 'Para Birimi',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'TRY', label: 'Türk Lirası' },
                { value: 'USD', label: 'Amerikan Doları' },
                { value: 'EUR', label: 'Euro' }
            ],
            colSize: 2
        });
}

function initLoansTable() {
    if (!document.getElementById('loans-table-container')) return;

    window.loansTable = new TableComponent('loans-table-container', {
        title: 'Krediler',
        icon: 'hand-holding-usd',
        iconColor: 'text-primary',
        loading: false,
        pagination: false,
        refreshable: true,
        onRefresh: loadLoans,
        columns: [
            {
                field: 'name',
                label: 'Kredi',
                sortable: true,
                formatter: (value) => (value ? `<strong>${escapeHtml(String(value))}</strong>` : '—')
            },
            {
                field: 'principal',
                label: 'Anapara',
                sortable: true,
                formatter: (value, row) => formatCurrency(value, row.currency)
            },
            {
                field: 'interest_rate',
                label: 'Faiz',
                sortable: true,
                formatter: (value) => formatInterestRate(value)
            },
            {
                field: 'term_months',
                label: 'Vade (Ay)',
                sortable: true,
                formatter: (value) => (value != null && value !== '' ? escapeHtml(String(value)) : '—')
            },
            {
                field: 'currency',
                label: 'Para Birimi',
                sortable: true,
                formatter: (value) => (value ? `<span class="currency-badge">${escapeHtml(String(value))}</span>` : '—')
            },
            {
                field: 'first_payment_date',
                label: 'İlk Ödeme',
                sortable: true,
                formatter: (value) => formatDate(value)
            },
            {
                field: '_installment_progress',
                label: 'Taksitler',
                sortable: false,
                formatter: (_v, row) => escapeHtml(formatLoanInstallmentProgress(row))
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value) =>
                    `<span class="status-badge ${getFinanceRecordStatusBadgeClass(value)}">${escapeHtml(getFinanceRecordStatusLabel(value))}</span>`
            },
            {
                field: 'created_by_username',
                label: 'Oluşturan',
                sortable: true,
                formatter: (value) => (value ? escapeHtml(String(value)) : '—')
            }
        ],
        actions: [
            {
                key: 'installments',
                label: 'Taksitler',
                icon: 'fas fa-list-ol',
                class: 'btn-outline-primary',
                onClick: (row) => openLoanInstallmentsDrawer(row.id)
            },
            {
                key: 'cancel',
                label: 'İptal Et',
                icon: 'fas fa-ban',
                class: 'btn-outline-danger',
                visible: (row) => row.status === 'active',
                onClick: (row) => confirmCancelLoan(row.id, row.name)
            }
        ],
        data: [],
        skeleton: false,
        emptyMessage: 'Kayıtlı kredi bulunmamaktadır.',
        emptyIcon: 'fas fa-hand-holding-usd'
    });
}

function initLoanFormModal() {
    if (!document.getElementById('loan-form-modal-container')) return;

    loanFormModal = new EditModal('loan-form-modal-container', {
        title: 'Yeni Kredi',
        icon: 'fas fa-plus',
        saveButtonText: 'Kaydet',
        size: 'lg'
    });
    loanFormModal.addSection({
        id: 'loan-form-section',
        title: null,
        icon: 'fas fa-hand-holding-usd',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'loan_name',
                name: 'name',
                label: 'Kredi adı',
                type: 'text',
                required: true,
                placeholder: 'Örn. Garanti Bank — Ekipman Kredisi',
                colSize: 12
            },
            {
                id: 'loan_principal',
                name: 'principal',
                label: 'Anapara',
                type: 'number',
                required: true,
                min: 0.01,
                step: 0.01,
                placeholder: '0,00',
                colSize: 6
            },
            {
                id: 'loan_interest_rate',
                name: 'interest_rate',
                label: 'Yıllık faiz (%)',
                type: 'number',
                required: true,
                min: 0,
                step: 0.01,
                placeholder: '42,50',
                colSize: 6
            },
            {
                id: 'loan_term_months',
                name: 'term_months',
                label: 'Vade (ay)',
                type: 'number',
                required: true,
                min: 1,
                step: 1,
                placeholder: '24',
                colSize: 6
            },
            {
                id: 'loan_currency',
                name: 'currency',
                label: 'Para birimi',
                type: 'select',
                required: true,
                value: 'TRY',
                colSize: 6,
                options: [
                    { value: 'TRY', label: 'TRY' },
                    { value: 'USD', label: 'USD' },
                    { value: 'EUR', label: 'EUR' }
                ]
            },
            {
                id: 'loan_first_payment_date',
                name: 'first_payment_date',
                label: 'İlk ödeme tarihi',
                type: 'date',
                required: true,
                colSize: 6
            },
            {
                id: 'loan_notes',
                name: 'notes',
                label: 'Notlar',
                type: 'textarea',
                rows: 2,
                required: false,
                colSize: 12
            }
        ]
    });
    loanFormModal.render();
    loanFormModal.onSaveCallback(handleCreateLoanSave);
}

function getFinanceRecordStatusLabel(status) {
    const labels = { active: 'Aktif', cancelled: 'İptal' };
    return labels[status] || status || '—';
}

function getFinanceRecordStatusBadgeClass(status) {
    const classes = { active: 'status-green', cancelled: 'status-red' };
    return classes[status] || 'status-grey';
}

function formatInterestRate(rate) {
    const n = parseMoneyNumber(rate);
    if (!Number.isFinite(n)) return '—';
    return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatLoanInstallmentProgress(row) {
    const installments = row.installments;
    if (!Array.isArray(installments) || !installments.length) return '—';
    const paid = installments.filter((i) => i.is_paid).length;
    return `${paid} / ${installments.length} ödendi`;
}

function openCreateLoanModal() {
    if (!loanFormModal) return;
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    loanFormModal.setFormData({
        name: '',
        principal: '',
        interest_rate: '',
        term_months: '24',
        currency: 'TRY',
        first_payment_date: `${y}-${m}-${d}`,
        notes: ''
    });
    loanFormModal.show();
}

async function handleCreateLoanSave(formData) {
    const principal = parseFloat(String(formData.principal ?? '').trim().replace(',', '.'));
    const interestRate = parseFloat(String(formData.interest_rate ?? '').trim().replace(',', '.'));
    const termMonths = parseInt(String(formData.term_months ?? '').trim(), 10);

    if (!Number.isFinite(principal) || principal <= 0) {
        showErrorMessage('Geçerli bir anapara girin.');
        return;
    }
    if (!Number.isFinite(interestRate) || interestRate < 0) {
        showErrorMessage('Geçerli bir faiz oranı girin.');
        return;
    }
    if (!Number.isFinite(termMonths) || termMonths < 1) {
        showErrorMessage('Vade en az 1 ay olmalıdır.');
        return;
    }

    const name = String(formData.name ?? '').trim();
    if (!name) {
        showErrorMessage('Kredi adı zorunludur.');
        return;
    }
    if (!formData.first_payment_date) {
        showErrorMessage('İlk ödeme tarihi zorunludur.');
        return;
    }

    const payload = {
        name,
        principal: principal.toFixed(2),
        interest_rate: interestRate.toFixed(2),
        term_months: termMonths,
        currency: formData.currency || 'TRY',
        first_payment_date: formData.first_payment_date,
        status: 'active',
        notes: String(formData.notes ?? '').trim()
    };

    try {
        const created = await createLoan(payload);
        showSuccessMessage('Kredi kaydedildi.');
        loanFormModal.hide();
        await loadLoans();
        if (created?.id) {
            openLoanInstallmentsDrawer(created.id, created);
        }
    } catch (error) {
        console.error(error);
        showErrorMessage(error.message || 'Kredi kaydedilirken hata oluştu.');
    }
}

async function loadLoans() {
    if (!window.loansTable) return;
    try {
        window.loansTable.setLoading(true);
        const raw = await getLoans(currentLoanFilters);
        currentLoans = normalizeApiList(raw);
        window.loansTable.setLoading(false);
        window.loansTable.updateData(currentLoans, currentLoans.length, 1);
    } catch (error) {
        console.error('Error loading loans:', error);
        showErrorMessage(error.message || 'Krediler yüklenirken hata oluştu.');
        if (window.loansTable) {
            window.loansTable.setLoading(false);
            window.loansTable.updateData([]);
        }
    }
}

function confirmCancelLoan(loanId, name) {
    const label = name ? `"${name}"` : `#${loanId}`;
    actionConfirmModal.show({
        message: `${label} kredisini iptal etmek istediğinize emin misiniz?`,
        confirmText: 'İptal Et',
        confirmButtonClass: 'btn-danger',
        onConfirm: async () => {
            try {
                await cancelLoan(loanId);
                showSuccessMessage('Kredi iptal edildi.');
                if (activeLoanContext && Number(activeLoanContext.id) === Number(loanId)) {
                    activeLoanContext.status = 'cancelled';
                }
                await loadLoans();
                if (loanInstallmentsDisplayModal?.modal?.classList.contains('show')) {
                    await refreshLoanInstallmentsList(loanId);
                }
            } catch (error) {
                console.error(error);
                showErrorMessage(error.message || 'Kredi iptal edilirken hata oluştu.');
            }
        }
    });
}

function setupLoanInstallmentMarkPaidDelegation() {
    if (!loanInstallmentsDisplayModal?.modal) return;
    const root = loanInstallmentsDisplayModal.modal;
    if (root.dataset.loanMarkPaidBound === '1') return;
    root.dataset.loanMarkPaidBound = '1';
    root.addEventListener('click', (e) => {
        const btn = e.target.closest('.loan-installment-mark-paid-btn');
        if (!btn) return;
        const loanId = parseInt(btn.dataset.loanId, 10);
        const installmentId = parseInt(btn.dataset.installmentId, 10);
        const sequence = btn.dataset.sequence || '';
        if (!Number.isFinite(loanId) || !Number.isFinite(installmentId)) return;
        confirmMarkLoanInstallmentPaid(loanId, installmentId, sequence);
    });
}

async function openLoanInstallmentsDrawer(loanId, loanRow = null) {
    const row =
        loanRow ||
        currentLoans.find((l) => Number(l.id) === Number(loanId)) ||
        null;
    const name = row?.name || `Kredi #${loanId}`;
    const currency = row?.currency || 'TRY';
    const status = row?.status || 'active';

    activeLoanContext = {
        id: loanId,
        name,
        currency,
        status
    };

    if (!loanInstallmentsDisplayModal) return;

    loanInstallmentsDisplayModal.clearData();
    loanInstallmentsDisplayModal.addCustomSection({
        id: 'loan-installments-section',
        customContent: `<p class="text-muted small mb-2">${escapeHtml(name)}</p><div id="loan-installments-list-host"><div class="text-center text-muted py-4">Yükleniyor…</div></div>`
    });
    loanInstallmentsDisplayModal.render();
    loanInstallmentsDisplayModal.show();

    await refreshLoanInstallmentsList(loanId);
}

async function refreshLoanInstallmentsList(loanId) {
    const host = document.getElementById('loan-installments-list-host');
    if (!host) return;

    try {
        let installments;
        const cached = currentLoans.find((l) => Number(l.id) === Number(loanId));
        if (cached?.installments?.length) {
            installments = cached.installments;
        } else {
            installments = await getLoanInstallments(loanId);
            if (cached) cached.installments = installments;
        }
        if (activeLoanContext && Number(activeLoanContext.id) === Number(loanId)) {
            activeLoanContext.status = cached?.status || activeLoanContext.status;
        }
        renderLoanInstallmentsListIntoHost(host, installments, loanId);
    } catch (error) {
        console.error(error);
        host.innerHTML = `<div class="alert alert-danger m-0">${escapeHtml(error.message || 'Taksitler yüklenemedi.')}</div>`;
    }
}

function renderLoanInstallmentsListIntoHost(host, installments, loanId) {
    if (!host) return;
    if (!installments.length) {
        host.innerHTML = '<p class="text-muted text-center py-4 mb-0">Taksit bulunamadı.</p>';
        return;
    }

    const currency = activeLoanContext?.currency || 'TRY';
    const loanActive = activeLoanContext?.status === 'active';

    const rowsHtml = installments
        .slice()
        .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
        .map((inst) => {
            const isPaid = !!inst.is_paid;
            const statusClass = isPaid ? 'success' : 'warning';
            const statusLabel = isPaid ? 'Ödendi' : 'Bekliyor';
            const dueLabel = formatDate(inst.due_date);
            const totalStr = formatCurrency(inst.total_payment, currency);
            const principalStr = formatCurrency(inst.principal_component, currency);
            const interestStr = formatCurrency(inst.interest_component, currency);
            const paidBy = inst.paid_by_username ? escapeHtml(String(inst.paid_by_username)) : '—';
            const paidAt = inst.paid_at ? escapeHtml(formatDate(inst.paid_at)) : '—';
            const markPaidBtn =
                loanActive && !isPaid
                    ? `<button type="button" class="btn btn-sm btn-outline-success loan-installment-mark-paid-btn"
                        data-loan-id="${loanId}"
                        data-installment-id="${inst.id}"
                        data-sequence="${inst.sequence}">
                        Ödendi
                    </button>`
                    : isPaid
                      ? '<span class="text-success"><i class="fas fa-check-circle"></i></span>'
                      : '—';

            return `
            <tr data-installment-id="${inst.id}">
                <td class="text-center">${escapeHtml(String(inst.sequence ?? '—'))}</td>
                <td>${escapeHtml(dueLabel)}</td>
                <td class="text-end">${principalStr}</td>
                <td class="text-end">${interestStr}</td>
                <td class="text-end"><strong>${totalStr}</strong></td>
                <td class="text-center"><span class="badge bg-${statusClass}">${statusLabel}</span></td>
                <td class="small">${paidAt}</td>
                <td class="small">${paidBy}</td>
                <td class="text-center">${markPaidBtn}</td>
            </tr>`;
        })
        .join('');

    host.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm table-striped align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th class="text-center">#</th>
                        <th>Vade</th>
                        <th class="text-end">Anapara</th>
                        <th class="text-end">Faiz</th>
                        <th class="text-end">Toplam</th>
                        <th class="text-center">Durum</th>
                        <th>Ödeme tarihi</th>
                        <th>Ödeyen</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
}

function confirmMarkLoanInstallmentPaid(loanId, installmentId, sequence) {
    const seqLabel = sequence ? `${sequence}. taksit` : 'Bu taksit';
    actionConfirmModal.show({
        message: `${seqLabel} ödendi olarak işaretlensin mi?`,
        confirmText: 'Ödendi İşaretle',
        confirmButtonClass: 'btn-success',
        onConfirm: async () => {
            try {
                const updated = await markLoanInstallmentPaid(loanId, installmentId);
                showSuccessMessage('Taksit ödendi olarak işaretlendi.');
                const loan = currentLoans.find((l) => Number(l.id) === Number(loanId));
                if (loan?.installments) {
                    const idx = loan.installments.findIndex((i) => Number(i.id) === Number(installmentId));
                    if (idx >= 0) loan.installments[idx] = { ...loan.installments[idx], ...updated };
                }
                if (window.loansTable) {
                    window.loansTable.updateData([...currentLoans], currentLoans.length, 1);
                }
                await refreshLoanInstallmentsList(loanId);
            } catch (error) {
                console.error(error);
                showErrorMessage(error.message || 'Taksit işaretlenirken hata oluştu.');
            }
        }
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

    markPaidEditModal.setFormData({
        schedule_label_ro: schedule.label,
        payment_currency_ro: schedule.currency,
        payment_due_date_ro: formatDate(schedule.due_date),
        paid_with_tax: true
    });

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

function getPaidWithTaxCheckbox() {
    if (!markPaidEditModal) return null;
    return markPaidEditModal.container.querySelector('[data-field-id="paid_with_tax"] input[type="checkbox"]');
}

// Update payment amount display based on checkbox
function updatePaymentAmountDisplay() {
    if (!selectedPaymentSchedule || !markPaidEditModal) return;

    const { schedule } = selectedPaymentSchedule;
    const paidWithTaxCheckbox = getPaidWithTaxCheckbox();
    const paidWithTax = paidWithTaxCheckbox ? paidWithTaxCheckbox.checked : true;

    let displayAmount;
    if (paidWithTax) {
        const totalWithTax = parseFloat(schedule.amount || 0) + parseFloat(schedule.effective_tax_due || 0);
        displayAmount = formatCurrency(totalWithTax, schedule.currency);
    } else {
        displayAmount = formatCurrency(schedule.amount || 0, schedule.currency);
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
