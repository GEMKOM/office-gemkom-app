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
    deleteDbsPayment,
    createSupplierEvaluation,
    listSupplierEvaluations
} from '../../apis/procurement.js';
import { hasPerm, isSuperuser } from '../../authService.js';

// Whether the current user may rate suppliers. Procurement uses page-based
// permissions; the PR-create page permission is the write gate. Superusers
// always qualify (matches the backend's user_has_role_perm).
const canWriteProcurement = () => isSuperuser() || hasPerm('access_procurement_purchase_requests_create');
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
import { getInflowTracker } from '../../apis/finance/reports.js';
import {
    markOfferInstallmentReceived,
    unmarkOfferInstallmentReceived
} from '../../apis/finance/offer-installments.js';
import {
    createExpectedReceipt,
    cancelExpectedReceipt,
    createExpectedReceiptInstallment,
    markExpectedReceiptInstallmentReceived,
    updateExpectedReceipt,
    updateExpectedReceiptInstallment,
    deleteExpectedReceiptInstallment
} from '../../apis/finance/expected-receipts.js';
import {
    getAdhocJobCosts,
    createAdhocJobCost,
    updateAdhocJobCost,
    deleteAdhocJobCost
} from '../../apis/finance/adhoc-job-costs.js';
import { listJobOrders } from '../../apis/projects/jobOrders.js';
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
let currentAdhocCosts = [];
let currentAdhocCostFilters = { job_order: '', category: '', currency: '' };
let adhocJobCostFormModal = null;
let activeAdhocCostContext = null;
let currentInflowRows = [];
let currentInflowFilters = { is_received: 'false', source: '' };
let inflowGroupingMode = 'due_month';
let expectedReceiptFormModal = null;
let expectedReceiptInstallmentFormModal = null;
let activeReceiptContext = null;
let inflowOfferNotesModal = null;
let draftReceiptInstallments = [];

const INFLOW_SOURCE_OPTIONS = [
    { value: '', label: 'Tümü' },
    { value: 'sales_offer', label: 'Satış Teklifi' },
    { value: 'expected_receipt', label: 'Beklenen Tahsilat' }
];

const INFLOW_GROUPING_OPTIONS = [
    { value: 'none', label: 'Gruplama yok' },
    { value: 'due_month', label: 'Vade ayına göre' },
    { value: 'customer', label: 'Müşteriye göre' },
    { value: 'job', label: 'İş emrine göre' }
];

const INFLOW_UNDATED_GROUP_KEY = '9__NO_DUE_DATE';

const TAX_TYPE_OPTIONS = [
    { value: 'vat', label: 'KDV' },
    { value: 'corporate_tax', label: 'Kurumlar Vergisi' },
    { value: 'sgk', label: 'SGK' },
    { value: 'income_tax_withholding', label: 'Gelir Vergisi Stopajı' },
    { value: 'other', label: 'Diğer' }
];

const TAX_TYPE_LABELS = Object.fromEntries(TAX_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const ADHOC_COST_CATEGORY_OPTIONS = [
    { value: 'material', label: 'Malzeme' },
    { value: 'service', label: 'Hizmet' },
    { value: 'transport', label: 'Nakliye' },
    { value: 'other', label: 'Diğer' }
];

const ADHOC_COST_CATEGORY_LABELS = Object.fromEntries(
    ADHOC_COST_CATEGORY_OPTIONS.map((o) => [o.value, o.label])
);

const FINANCE_CURRENCY_OPTIONS = [
    { value: 'TRY', label: 'TRY' },
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' }
];

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
        title: 'Finans İşlemleri',
        subtitle: 'Ödemeler, tahsilatlar, giderler ve finansal kayıtlar',
        icon: 'coins',
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
    initAdhocCostsFilters();
    initAdhocJobCostsTable();
    initAdhocJobCostFormModal();
    initInflowTrackerFilters();
    initInflowTrackerTable();
    initExpectedReceiptFormModal();
    initExpectedReceiptInstallmentFormModal();
    initInflowOfferNotesModal();
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

}

function handleFinanceRefreshClick() {
    if (financeActiveTab === 'dbs') loadDbsSuppliers();
    else if (financeActiveTab === 'expenses') loadExpenses();
    else if (financeActiveTab === 'loans') loadLoans();
    else if (financeActiveTab === 'taxes') loadTaxes();
    else if (financeActiveTab === 'adhoc-costs') loadAdhocJobCosts();
    else if (financeActiveTab === 'receipts') loadInflowTracker();
    else loadPurchaseOrders();
}

function handleFinanceCreateClick() {
    if (financeActiveTab === 'expenses') openCreateExpenseModal();
    else if (financeActiveTab === 'loans') openCreateLoanModal();
    else if (financeActiveTab === 'taxes') openCreateTaxModal();
    else if (financeActiveTab === 'adhoc-costs') openCreateAdhocJobCostModal();
    else if (financeActiveTab === 'receipts') openCreateExpectedReceiptModal();
}

function updateFinanceHeaderForTab(tab) {
    if (!pageHeader) return;
    let createButtonText = 'Yeni Oluştur';
    if (tab === 'expenses') createButtonText = 'Yeni Gider';
    if (tab === 'loans') createButtonText = 'Yeni Kredi';
    if (tab === 'taxes') createButtonText = 'Yeni Vergi Kaydı';
    if (tab === 'adhoc-costs') createButtonText = 'Yeni Ek Gider';
    if (tab === 'receipts') createButtonText = 'Yeni Tahsilat';
    pageHeader.updateConfig({
        showExportButton: tab === 'po' ? 'block' : 'none',
        showCreateButton:
            tab === 'expenses' ||
            tab === 'loans' ||
            tab === 'taxes' ||
            tab === 'adhoc-costs' ||
            tab === 'receipts'
                ? 'block'
                : 'none',
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
    const adhocCostsPane = document.getElementById('finance-tab-pane-adhoc-costs');
    const receiptsPane = document.getElementById('finance-tab-pane-receipts');
    if (poPane) poPane.classList.toggle('d-none', tab !== 'po');
    if (dbsPane) dbsPane.classList.toggle('d-none', tab !== 'dbs');
    if (expensesPane) expensesPane.classList.toggle('d-none', tab !== 'expenses');
    if (loansPane) loansPane.classList.toggle('d-none', tab !== 'loans');
    if (taxesPane) taxesPane.classList.toggle('d-none', tab !== 'taxes');
    if (adhocCostsPane) adhocCostsPane.classList.toggle('d-none', tab !== 'adhoc-costs');
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
    } else if (tab === 'adhoc-costs') {
        loadAdhocJobCosts();
    } else if (tab === 'receipts') {
        loadInflowTracker();
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

function initAdhocCostsFilters() {
    if (!document.getElementById('adhoc-costs-filters-placeholder')) return;

    new FiltersComponent('adhoc-costs-filters-placeholder', {
        title: 'Filtreler',
        onApply: (filters) => {
            currentAdhocCostFilters = filters;
            loadAdhocJobCosts();
        },
        onClear: () => {
            currentAdhocCostFilters = { job_order: '', category: '', currency: '' };
            loadAdhocJobCosts();
        }
    })
        .addTextFilter({
            id: 'job_order',
            label: 'İş emri',
            placeholder: 'Örn. JOB-001',
            colSize: 2
        })
        .addSelectFilter({
            id: 'category',
            label: 'Kategori',
            options: [{ value: '', label: 'Tümü' }, ...ADHOC_COST_CATEGORY_OPTIONS],
            colSize: 2
        })
        .addSelectFilter({
            id: 'currency',
            label: 'Para Birimi',
            options: [{ value: '', label: 'Tümü' }, ...FINANCE_CURRENCY_OPTIONS],
            colSize: 2
        });
}

function initAdhocJobCostsTable() {
    if (!document.getElementById('adhoc-job-costs-table-container')) return;

    window.adhocJobCostsTable = new TableComponent('adhoc-job-costs-table-container', {
        title: 'Ek Giderler',
        icon: 'briefcase',
        iconColor: 'text-primary',
        loading: false,
        pagination: false,
        refreshable: true,
        onRefresh: loadAdhocJobCosts,
        columns: [
            {
                field: 'job_order',
                label: 'İş emri',
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
                field: 'category',
                label: 'Kategori',
                sortable: true,
                formatter: (value) => escapeHtml(getAdhocCostCategoryLabel(value))
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
                formatter: (value) =>
                    value ? `<span class="currency-badge">${escapeHtml(String(value))}</span>` : '—'
            },
            {
                field: 'cost_date',
                label: 'Gider tarihi',
                sortable: true,
                formatter: (value) => (value ? formatDate(value) : '—')
            },
            {
                field: 'notes',
                label: 'Notlar',
                sortable: false,
                formatter: (value) => {
                    if (!value) return '—';
                    const s = String(value);
                    return s.length > 60 ? `${escapeHtml(s.slice(0, 60))}…` : escapeHtml(s);
                }
            }
        ],
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-pen',
                class: 'btn-outline-primary',
                onClick: (row) => openEditAdhocJobCostModal(row)
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => confirmDeleteAdhocJobCost(row)
            }
        ],
        data: [],
        skeleton: false,
        emptyMessage: 'Kayıtlı ek gider bulunmamaktadır.',
        emptyIcon: 'fas fa-briefcase'
    });
}

function initAdhocJobCostFormModal() {
    if (!document.getElementById('adhoc-job-cost-form-modal-container')) return;

    adhocJobCostFormModal = new EditModal('adhoc-job-cost-form-modal-container', {
        title: 'Yeni Ek Gider',
        icon: 'fas fa-plus',
        saveButtonText: 'Kaydet',
        size: 'lg'
    });
    adhocJobCostFormModal.addSection({
        id: 'adhoc-job-cost-form-section',
        title: null,
        icon: 'fas fa-briefcase',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'ajc_job_order',
                name: 'job_order',
                label: 'İş emri',
                type: 'dropdown',
                required: true,
                searchable: true,
                placeholder: 'İş emri seçin',
                colSize: 6,
                help: 'En az 2 karakter ile arayın.',
                minSearchLength: 2,
                remoteSearchPlaceholder: 'En az 2 karakter yazın',
                options: [],
                remoteSearch: searchJobOrdersForDropdown
            },
            {
                id: 'ajc_category',
                name: 'category',
                label: 'Kategori',
                type: 'select',
                required: true,
                value: 'other',
                colSize: 6,
                options: ADHOC_COST_CATEGORY_OPTIONS
            },
            {
                id: 'ajc_description',
                name: 'description',
                label: 'Açıklama',
                type: 'text',
                required: true,
                placeholder: 'Örn. Nakliye ücreti',
                colSize: 12
            },
            {
                id: 'ajc_amount',
                name: 'amount',
                label: 'Tutar',
                type: 'number',
                required: true,
                min: 0.01,
                step: 0.01,
                placeholder: '0,00',
                colSize: 4
            },
            {
                id: 'ajc_currency',
                name: 'currency',
                label: 'Para birimi',
                type: 'select',
                required: true,
                value: 'TRY',
                colSize: 4,
                options: FINANCE_CURRENCY_OPTIONS
            },
            {
                id: 'ajc_cost_date',
                name: 'cost_date',
                label: 'Gider tarihi',
                type: 'date',
                required: true,
                colSize: 4
            },
            {
                id: 'ajc_notes',
                name: 'notes',
                label: 'Notlar',
                type: 'textarea',
                rows: 2,
                required: false,
                colSize: 12
            }
        ]
    });
    adhocJobCostFormModal.render();
    adhocJobCostFormModal.onSaveCallback(handleAdhocJobCostSave);
}

function getAdhocCostCategoryLabel(value) {
    return ADHOC_COST_CATEGORY_LABELS[value] || value || '—';
}

function setAdhocJobOrderDropdown(jobNo, jobTitle) {
    const field = adhocJobCostFormModal?.fields?.get('ajc_job_order');
    if (!field) return;
    field.options = jobOrderDropdownSeedOptions(jobNo, jobTitle);
    const dropdown = adhocJobCostFormModal?.dropdowns?.get('ajc_job_order');
    if (dropdown) {
        const items = field.options.map((o) => ({ value: o.value, text: o.label }));
        dropdown.setItems(items);
        dropdown.setValue(jobNo || '');
    }
}

function openCreateAdhocJobCostModal() {
    if (!adhocJobCostFormModal) return;
    activeAdhocCostContext = { mode: 'create' };
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    adhocJobCostFormModal.options.title = 'Yeni Ek Gider';
    adhocJobCostFormModal.options.saveButtonText = 'Kaydet';
    adhocJobCostFormModal.setFormData({
        ajc_job_order: '',
        ajc_category: 'other',
        ajc_description: '',
        ajc_amount: '',
        ajc_currency: 'TRY',
        ajc_cost_date: `${y}-${m}-${d}`,
        ajc_notes: ''
    });
    setAdhocJobOrderDropdown('', '');
    adhocJobCostFormModal.show();
}

function openEditAdhocJobCostModal(row) {
    if (!adhocJobCostFormModal || row.id == null) return;
    activeAdhocCostContext = { mode: 'edit', id: row.id };
    adhocJobCostFormModal.options.title = 'Ek Gideri Düzenle';
    adhocJobCostFormModal.options.saveButtonText = 'Güncelle';
    adhocJobCostFormModal.setFormData({
        ajc_job_order: row.job_order || '',
        ajc_category: row.category || 'other',
        ajc_description: row.description || '',
        ajc_amount: row.amount ?? '',
        ajc_currency: row.currency || 'TRY',
        ajc_cost_date: row.cost_date || '',
        ajc_notes: row.notes || ''
    });
    setAdhocJobOrderDropdown(row.job_order || '', '');
    adhocJobCostFormModal.show();
}

function buildAdhocJobCostPayload(formData, { requireJobOrder = false } = {}) {
    const rawAmount = String(formData.amount ?? '').trim().replace(',', '.');
    const amountNum = parseFloat(rawAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return { error: 'Geçerli pozitif bir tutar girin.' };
    }

    const description = String(formData.description ?? '').trim();
    if (!description) {
        return { error: 'Açıklama zorunludur.' };
    }
    if (!formData.cost_date) {
        return { error: 'Gider tarihi zorunludur.' };
    }
    if (!formData.category) {
        return { error: 'Kategori seçin.' };
    }

    const currency =
        String(formData.currency ?? adhocJobCostFormModal?.getFieldValue('ajc_currency') ?? 'TRY').trim() ||
        'TRY';

    const jobOrder =
        parseJobOrderFromForm(formData) ||
        String(adhocJobCostFormModal?.getFieldValue('ajc_job_order') ?? '').trim();

    if (requireJobOrder && !jobOrder) {
        return { error: 'İş emri seçimi zorunludur.' };
    }

    const payload = {
        description,
        amount: amountNum.toFixed(2),
        currency,
        cost_date: formData.cost_date,
        category: formData.category,
        notes: String(formData.notes ?? '').trim()
    };

    if (jobOrder) {
        payload.job_order = jobOrder;
    }

    return { payload };
}

async function handleAdhocJobCostSave(formData) {
    const isEdit = activeAdhocCostContext?.mode === 'edit' && activeAdhocCostContext.id;
    const built = buildAdhocJobCostPayload(formData, { requireJobOrder: !isEdit });
    if (built.error) {
        showErrorMessage(built.error);
        return;
    }

    try {
        adhocJobCostFormModal.setLoading(true);
        if (isEdit) {
            await updateAdhocJobCost(activeAdhocCostContext.id, built.payload);
            showSuccessMessage('Ek gider güncellendi.');
        } else {
            await createAdhocJobCost(built.payload);
            showSuccessMessage('Ek gider kaydedildi.');
        }
        adhocJobCostFormModal.hide();
        await loadAdhocJobCosts();
    } catch (error) {
        console.error(error);
        showErrorMessage(
            error.message ||
                (isEdit ? 'Ek gider güncellenirken hata oluştu.' : 'Ek gider kaydedilirken hata oluştu.')
        );
    } finally {
        adhocJobCostFormModal.setLoading(false);
    }
}

async function loadAdhocJobCosts() {
    if (!window.adhocJobCostsTable) return;
    try {
        window.adhocJobCostsTable.setLoading(true);
        const apiFilters = {};
        const jobOrder = String(currentAdhocCostFilters.job_order ?? '').trim();
        if (jobOrder) apiFilters.job_order = jobOrder;
        if (currentAdhocCostFilters.category) apiFilters.category = currentAdhocCostFilters.category;
        if (currentAdhocCostFilters.currency) apiFilters.currency = currentAdhocCostFilters.currency;
        const raw = await getAdhocJobCosts(apiFilters);
        currentAdhocCosts = normalizeApiList(raw);
        window.adhocJobCostsTable.setLoading(false);
        window.adhocJobCostsTable.updateData(currentAdhocCosts, currentAdhocCosts.length, 1);
    } catch (error) {
        console.error('Error loading adhoc job costs:', error);
        showErrorMessage(error.message || 'Ek giderler yüklenirken hata oluştu.');
        if (window.adhocJobCostsTable) {
            window.adhocJobCostsTable.setLoading(false);
            window.adhocJobCostsTable.updateData([]);
        }
    }
}

function confirmDeleteAdhocJobCost(row) {
    const label = row.description
        ? `"${row.description}"`
        : row.job_order
          ? `${row.job_order}`
          : `#${row.id}`;
    actionConfirmModal.show({
        message: `${label} ek gider kaydı silinsin mi? Bu işlem geri alınamaz.`,
        confirmText: 'Sil',
        confirmButtonClass: 'btn-danger',
        onConfirm: async () => {
            try {
                await deleteAdhocJobCost(row.id);
                showSuccessMessage('Ek gider silindi.');
                await loadAdhocJobCosts();
            } catch (error) {
                console.error(error);
                showErrorMessage(error.message || 'Ek gider silinirken hata oluştu.');
            }
        }
    });
}

function initInflowTrackerFilters() {
    if (!document.getElementById('receipts-filters-placeholder')) return;

    new FiltersComponent('receipts-filters-placeholder', {
        title: 'Filtreler',
        onApply: (filters) => {
            currentInflowFilters = filters;
            loadInflowTracker();
        },
        onClear: () => {
            currentInflowFilters = { is_received: 'false', source: '' };
            inflowGroupingMode = 'due_month';
            loadInflowTracker();
        }
    })
        .addSelectFilter({
            id: 'is_received',
            label: 'Tahsilat durumu',
            value: 'false',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'false', label: 'Bekleyen' },
                { value: 'true', label: 'Tahsil edilen' }
            ],
            colSize: 2
        })
        .addSelectFilter({
            id: 'source',
            label: 'Kaynak',
            value: '',
            options: INFLOW_SOURCE_OPTIONS,
            colSize: 2
        })
        .addSelectFilter({
            id: 'grouping',
            label: 'Gruplama',
            value: 'due_month',
            options: INFLOW_GROUPING_OPTIONS,
            colSize: 2
        });
}

function initInflowTrackerTable() {
    if (!document.getElementById('expected-receipts-table-container')) return;

    window.inflowTrackerTable = new TableComponent('expected-receipts-table-container', {
        title: 'Beklenen Tahsilatlar',
        icon: 'hand-holding-usd',
        iconColor: 'text-primary',
        loading: false,
        pagination: false,
        refreshable: true,
        onRefresh: loadInflowTracker,
        groupBy: '_groupKey',
        groupCollapsible: true,
        defaultGroupExpanded: true,
        groupSortDirection: 'asc',
        groupHeaderFormatter: formatInflowGroupHeader,
        actionColumnWidth: '132px',
        tableClass: 'table table-hover inflow-tracker-table',
        rowAttributes: (row) => {
            const cls = ['inflow-row'];
            if (row.is_received) cls.push('inflow-row-received');
            if (row.source === 'sales_offer') cls.push('inflow-row-sales-offer');
            return { class: cls.join(' ') };
        },
        columns: [
            {
                field: 'source',
                label: 'Kaynak',
                sortable: false,
                width: '118px',
                headerClass: 'text-nowrap',
                cellClass: 'text-nowrap',
                formatter: (_v, row) => formatInflowSourceBadge(row.source, row.editable)
            },
            {
                field: 'label',
                label: 'Taksit / Etiket',
                sortable: false,
                width: '16%',
                headerClass: 'text-nowrap',
                formatter: (value, row) => {
                    const label = value ? escapeHtml(String(value)) : '—';
                    const title = row.title ? `<span class="text-muted small d-block">${escapeHtml(String(row.title))}</span>` : '';
                    return `<strong>${label}</strong>${title}`;
                }
            },
            {
                field: 'customer_name',
                label: 'Müşteri',
                sortable: false,
                width: '14%',
                formatter: (value) => (value ? escapeHtml(String(value)) : '—')
            },
            {
                field: 'job_no',
                label: 'İş emri',
                sortable: false,
                width: '88px',
                headerClass: 'text-nowrap',
                cellClass: 'text-nowrap',
                formatter: (value, row) => {
                    if (!value) return '—';
                    const job = escapeHtml(String(value));
                    const title = row.job_title
                        ? ` title="${escapeHtml(String(row.job_title))}"`
                        : '';
                    return `<span${title}>${job}</span>`;
                }
            },
            {
                field: 'reference_no',
                label: 'Referans',
                sortable: false,
                width: '108px',
                headerClass: 'text-nowrap',
                cellClass: 'text-nowrap',
                formatter: (value, row) => {
                    if (row.source === 'sales_offer' && row.offer_no) {
                        const no = escapeHtml(String(row.offer_no));
                        return `<a href="/sales/offers?offer_no=${encodeURIComponent(row.offer_no)}" class="inflow-ref-link">${no}</a>`;
                    }
                    return value ? escapeHtml(String(value)) : '—';
                }
            },
            {
                field: 'due_date',
                label: 'Vade',
                sortable: false,
                width: '100px',
                headerClass: 'text-nowrap',
                cellClass: 'text-nowrap',
                formatter: (value, row) => formatInflowDueDateCell(value, row)
            },
            {
                field: 'amount',
                label: 'Tutar',
                sortable: false,
                width: '120px',
                headerClass: 'text-end text-nowrap',
                cellClass: 'text-end text-nowrap',
                formatter: (value, row) => {
                    const cur = row.currency || 'EUR';
                    const main = formatCurrency(value, cur);
                    const eur =
                        cur !== 'EUR' && row.amount_eur
                            ? `<div class="inflow-eur-sub text-muted small">${formatCurrency(row.amount_eur, 'EUR')}</div>`
                            : '';
                    return `${main}${eur}`;
                }
            },
            {
                field: 'is_received',
                label: 'Durum',
                sortable: false,
                width: '128px',
                headerClass: 'text-nowrap',
                formatter: (_v, row) => formatInflowReceivedStatus(row)
            }
        ],
        actions: [
            {
                key: 'mark_received',
                label: 'Tahsil edildi',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                visible: (row) => !row.is_received,
                onClick: (row) => handleInflowMarkReceived(row)
            },
            {
                key: 'unmark_received',
                label: 'Tahsilatı geri al',
                icon: 'fas fa-undo',
                class: 'btn-outline-warning',
                visible: (row) => row.is_received && row.source === 'sales_offer',
                onClick: (row) => confirmUnmarkOfferInstallment(row)
            },
            {
                key: 'view_offer',
                label: 'Teklifi görüntüle',
                icon: 'fas fa-file-invoice',
                class: 'btn-outline-primary',
                visible: (row) => row.source === 'sales_offer' && row.offer_no,
                onClick: (row) => {
                    window.location.href = `/sales/offers?offer_no=${encodeURIComponent(row.offer_no)}`;
                }
            },
            {
                type: 'dropdown',
                key: 'expected_receipt_menu',
                label: 'İşlemler',
                icon: 'fas fa-ellipsis-v',
                class: 'btn-outline-secondary',
                visible: (row) => row.source === 'expected_receipt' && row.editable,
                subActions: [
                    {
                        key: 'edit_installment',
                        label: 'Taksiti düzenle',
                        icon: 'fas fa-pen',
                        onClick: (row) => openEditExpectedReceiptInstallmentModal(row)
                    },
                    {
                        key: 'delete_installment',
                        label: 'Taksiti sil',
                        icon: 'fas fa-trash',
                        visible: (row) => !row.is_received,
                        onClick: (row) => confirmDeleteExpectedReceiptInstallment(row)
                    },
                    {
                        key: 'edit_receipt',
                        label: 'Kaydı düzenle',
                        icon: 'fas fa-edit',
                        onClick: (row) => openEditExpectedReceiptModal(row)
                    },
                    {
                        key: 'add_installment',
                        label: 'Taksit ekle',
                        icon: 'fas fa-plus',
                        onClick: (row) => openAddExpectedReceiptInstallmentModalFromRow(row)
                    },
                    {
                        key: 'cancel_receipt',
                        label: 'Kaydı iptal et',
                        icon: 'fas fa-ban',
                        onClick: (row) => confirmCancelExpectedReceipt(row.receipt_id, row.title)
                    }
                ]
            }
        ],
        data: [],
        skeleton: false,
        emptyMessage: 'Beklenen tahsilat satırı bulunmamaktadır.',
        emptyIcon: 'fas fa-hand-holding-usd'
    });
}

function initExpectedReceiptFormModal() {
    if (!document.getElementById('expected-receipt-form-modal-container')) return;

    expectedReceiptFormModal = new EditModal('expected-receipt-form-modal-container', {
        title: 'Yeni Beklenen Tahsilat',
        icon: 'fas fa-plus',
        saveButtonText: 'Kaydet',
        size: 'xl'
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
                value: 'EUR',
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
                label: 'İş emri',
                type: 'dropdown',
                required: false,
                searchable: true,
                placeholder: 'İş emri seçin (opsiyonel)',
                colSize: 6,
                help: 'Boş bırakılabilir. En az 2 karakter ile arayın.',
                minSearchLength: 2,
                remoteSearchPlaceholder: 'En az 2 karakter yazın',
                options: [],
                remoteSearch: searchJobOrdersForDropdown
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
    ensureExpectedReceiptInstallmentsSection();
    setupExpectedReceiptInstallmentsDelegation();
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

function formatInflowSourceBadge(source, editable) {
    if (source === 'sales_offer') {
        return `<span class="inflow-source-badge inflow-source-sales-offer" title="Satış teklifi ödeme planı">
            <i class="fas fa-lock me-1" aria-hidden="true"></i>Satış Teklifi</span>`;
    }
    if (source === 'expected_receipt') {
        return `<span class="inflow-source-badge inflow-source-expected-receipt">Beklenen Tahsilat</span>`;
    }
    if (editable === false) {
        return `<span class="inflow-source-badge inflow-source-sales-offer"><i class="fas fa-lock me-1"></i>—</span>`;
    }
    return '—';
}

function formatInflowDueDateCell(dueDate, row) {
    if (!dueDate) return '<span class="text-muted">Vade yok</span>';
    const label = escapeHtml(formatDate(dueDate));
    if (row.is_received) return label;
    const d = new Date(dueDate);
    if (!Number.isNaN(d.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (d < today) return `<span class="text-danger fw-semibold">${label}</span>`;
    }
    return label;
}

function formatInflowReceivedStatus(row) {
    if (!row.is_received) {
        return '<span class="status-badge status-yellow">Bekliyor</span>';
    }
    const at = row.received_at ? formatDate(row.received_at) : '';
    const by = row.received_by ? escapeHtml(String(row.received_by)) : '';
    const meta = [at, by].filter(Boolean).join(' · ');
    return `<span class="status-badge status-green">Tahsil edildi</span>${meta ? `<div class="small text-muted mt-1">${escapeHtml(meta)}</div>` : ''}`;
}

function formatInflowGroupHeader(groupKey, groupRows) {
    if (groupKey === INFLOW_UNDATED_GROUP_KEY) {
        const total = groupRows.reduce((s, r) => s + (parseMoneyNumber(r.amount_eur) || 0), 0);
        return `<strong>Vade tarihi yok</strong>
            <span class="badge bg-secondary ms-2">${groupRows.length} satır</span>
            <span class="text-muted ms-2 small">${formatCurrency(total, 'EUR')} EUR</span>`;
    }
    if (inflowGroupingMode === 'due_month' && groupKey.startsWith('0_')) {
        const month = groupKey.slice(2);
        const [y, m] = month.split('-');
        const monthLabel = y && m
            ? new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
            : month;
        const total = groupRows.reduce((s, r) => s + (parseMoneyNumber(r.amount_eur) || 0), 0);
        return `<strong>${escapeHtml(monthLabel)}</strong>
            <span class="badge bg-secondary ms-2">${groupRows.length} satır</span>
            <span class="text-muted ms-2 small">${formatCurrency(total, 'EUR')} EUR</span>`;
    }
    const total = groupRows.reduce((s, r) => s + (parseMoneyNumber(r.amount_eur) || 0), 0);
    const label = groupKey.startsWith('0_') ? groupKey.slice(2) : groupKey;
    return `<strong>${escapeHtml(label || '—')}</strong>
        <span class="badge bg-secondary ms-2">${groupRows.length} satır</span>
        <span class="text-muted ms-2 small">${formatCurrency(total, 'EUR')} EUR</span>`;
}

function getInflowRowKey(row) {
    if (row.source === 'sales_offer') {
        return `offer-${row.offer_id}-${row.sequence}`;
    }
    return `er-${row.receipt_id}-${row.installment_id}`;
}

function applyClientInflowFilters(rows) {
    let filtered = rows;
    const receivedFilter = currentInflowFilters.is_received;
    if (receivedFilter === 'true' || receivedFilter === true) {
        filtered = filtered.filter((r) => r.is_received);
    } else if (receivedFilter === 'false' || receivedFilter === false) {
        filtered = filtered.filter((r) => !r.is_received);
    }
    const sourceFilter = currentInflowFilters.source;
    if (sourceFilter) {
        filtered = filtered.filter((r) => r.source === sourceFilter);
    }
    return filtered;
}

function assignInflowGroupKeys(rows) {
    const dated = [];
    const undated = [];
    rows.forEach((row) => {
        const copy = { ...row, _rowKey: getInflowRowKey(row) };
        if (!row.due_date) {
            copy._groupKey = INFLOW_UNDATED_GROUP_KEY;
            undated.push(copy);
            return;
        }
        if (inflowGroupingMode === 'none') {
            copy._groupKey = '0_flat';
            dated.push(copy);
        } else if (inflowGroupingMode === 'due_month') {
            copy._groupKey = `0_${String(row.due_date).slice(0, 7)}`;
            dated.push(copy);
        } else if (inflowGroupingMode === 'customer') {
            copy._groupKey = `0_${row.customer_name || '—'}`;
            dated.push(copy);
        } else if (inflowGroupingMode === 'job') {
            copy._groupKey = `0_${row.job_no || '—'}`;
            dated.push(copy);
        } else {
            copy._groupKey = '0_flat';
            dated.push(copy);
        }
    });
    return [...dated, ...undated];
}

function prepareInflowTableData(rows) {
    const grouping = currentInflowFilters.grouping || inflowGroupingMode;
    inflowGroupingMode = grouping || 'due_month';
    const filtered = applyClientInflowFilters(rows);
    if (inflowGroupingMode === 'none') {
        const dated = [];
        const undated = [];
        filtered.forEach((row) => {
            const copy = { ...row, _rowKey: getInflowRowKey(row) };
            if (!row.due_date) undated.push(copy);
            else dated.push(copy);
        });
        return [...dated, ...undated];
    }
    return assignInflowGroupKeys(filtered);
}

function updateInflowTableGroupingOptions() {
    if (!window.inflowTrackerTable) return;
    const useGrouping = inflowGroupingMode !== 'none';
    window.inflowTrackerTable.options.groupBy = useGrouping ? '_groupKey' : null;
    window.inflowTrackerTable.options.groupCollapsible = useGrouping;
    window.inflowTrackerTable.options.groupHeaderFormatter = useGrouping ? formatInflowGroupHeader : null;
}

function initInflowOfferNotesModal() {
    if (!document.getElementById('inflow-offer-notes-modal-container')) return;
    inflowOfferNotesModal = new EditModal('inflow-offer-notes-modal-container', {
        title: 'Tahsil edildi işaretle',
        icon: 'fas fa-check',
        saveButtonText: 'Tahsil Edildi',
        size: 'md'
    });
    inflowOfferNotesModal.addSection({
        id: 'inflow-offer-notes-section',
        title: null,
        fields: [
            {
                id: 'inflow_offer_notes',
                name: 'notes',
                label: 'Notlar',
                type: 'textarea',
                rows: 3,
                required: false,
                colSize: 12,
                placeholder: 'Opsiyonel'
            }
        ]
    });
    inflowOfferNotesModal.render();
    inflowOfferNotesModal.onSaveCallback(handleOfferInstallmentMarkReceivedSave);
}

async function searchJobOrdersForDropdown(term) {
    const t = String(term ?? '').trim();
    if (t.length < 2) return [];
    const data = await listJobOrders({
        search: t,
        page_size: 20,
        ordering: '-created_at',
        status__in: 'active,draft,on_hold'
    });
    const items = normalizeApiList(data);
    return items.map((j) => ({
        value: j.job_no,
        text: `${j.job_no}${j.title ? ` — ${j.title}` : ''}`
    }));
}

function parseJobOrderFromForm(formData) {
    const jobNo = String(formData.job_order ?? '').trim();
    return jobNo || null;
}

function jobOrderDropdownSeedOptions(jobNo, jobTitle) {
    if (!jobNo) return [];
    const text = jobTitle ? `${jobNo} — ${jobTitle}` : jobNo;
    return [{ value: jobNo, label: text }];
}

function setExpectedReceiptJobOrderDropdown(jobNo, jobTitle) {
    const field = expectedReceiptFormModal?.fields?.get('er_job_order');
    if (!field) return;
    field.options = jobOrderDropdownSeedOptions(jobNo, jobTitle);
    const dropdown = expectedReceiptFormModal?.dropdowns?.get('er_job_order');
    if (dropdown) {
        const items = field.options.map((o) => ({ value: o.value, text: o.label }));
        dropdown.setItems(items);
        dropdown.setValue(jobNo || '');
    }
}

function createEmptyDraftInstallment(sequence) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return {
        sequence,
        label: '',
        amount: '',
        due_date: `${y}-${m}-${d}`,
        notes: ''
    };
}

function ensureExpectedReceiptInstallmentsSection() {
    if (!expectedReceiptFormModal?.form) return;
    if (document.getElementById('er-installments-section')) return;

    const section = document.createElement('div');
    section.id = 'er-installments-section';
    section.className = 'form-section compact mb-2 d-none';
    section.innerHTML = `
        <h6 class="section-subtitle compact text-primary mb-2">
            <i class="fas fa-list-ol me-2"></i>Taksitler
        </h6>
        <p class="text-muted small mb-2">
            Para birimi üst kayıttan alınır. Toplam tutar bilgilendirme amaçlıdır; taksit toplamı ile eşleşmek zorunda değildir.
        </p>
        <div id="er-installments-sum-hint" class="small mb-2"></div>
        <div id="er-installments-rows-host"></div>
        <button type="button" class="btn btn-sm btn-outline-primary mt-2" id="er-add-installment-row-btn">
            <i class="fas fa-plus me-1"></i>Taksit satırı ekle
        </button>`;
    expectedReceiptFormModal.form.appendChild(section);
}

function setupExpectedReceiptInstallmentsDelegation() {
    const form = expectedReceiptFormModal?.form;
    if (!form || form.dataset.erInstallmentsBound === '1') return;
    form.dataset.erInstallmentsBound = '1';
    form.addEventListener('click', (e) => {
        if (e.target.closest('#er-add-installment-row-btn')) {
            e.preventDefault();
            const nextSeq =
                draftReceiptInstallments.reduce((max, r) => Math.max(max, Number(r.sequence) || 0), 0) + 1;
            draftReceiptInstallments.push(createEmptyDraftInstallment(nextSeq));
            renderDraftReceiptInstallmentRows();
            return;
        }
        const removeBtn = e.target.closest('.er-remove-installment-row-btn');
        if (removeBtn) {
            e.preventDefault();
            const idx = parseInt(removeBtn.dataset.rowIndex, 10);
            if (!Number.isFinite(idx) || draftReceiptInstallments.length <= 1) {
                showErrorMessage('En az bir taksit satırı olmalıdır.');
                return;
            }
            draftReceiptInstallments.splice(idx, 1);
            draftReceiptInstallments.forEach((row, i) => {
                row.sequence = i + 1;
            });
            renderDraftReceiptInstallmentRows();
        }
    });
    form.addEventListener('input', (e) => {
        if (e.target.closest('#er-installments-rows-host')) {
            syncDraftInstallmentsFromDom();
            updateDraftInstallmentsSumHint();
        }
    });
}

function renderDraftReceiptInstallmentRows() {
    const host = document.getElementById('er-installments-rows-host');
    if (!host) return;

    const rowsHtml = draftReceiptInstallments
        .map((row, index) => {
            const seq = escapeHtml(String(row.sequence ?? index + 1));
            const label = escapeHtml(String(row.label ?? ''));
            const amount = escapeHtml(String(row.amount ?? ''));
            const due = escapeHtml(String(row.due_date ?? ''));
            const notes = escapeHtml(String(row.notes ?? ''));
            const canRemove = draftReceiptInstallments.length > 1;
            return `
            <div class="er-inst-row row g-2 align-items-end mb-2" data-row-index="${index}">
                <div class="col-6 col-md-1">
                    <label class="form-label small mb-0">#</label>
                    <input type="number" class="form-control form-control-sm er-inst-seq" min="1" step="1" value="${seq}">
                </div>
                <div class="col-12 col-md-3">
                    <label class="form-label small mb-0">Etiket</label>
                    <input type="text" class="form-control form-control-sm er-inst-label" value="${label}" placeholder="Örn. Avans" required>
                </div>
                <div class="col-6 col-md-2">
                    <label class="form-label small mb-0">Tutar</label>
                    <input type="number" class="form-control form-control-sm er-inst-amount" min="0.01" step="0.01" value="${amount}">
                </div>
                <div class="col-6 col-md-2">
                    <label class="form-label small mb-0">Vade</label>
                    <input type="date" class="form-control form-control-sm er-inst-due" value="${due}">
                </div>
                <div class="col-12 col-md-3">
                    <label class="form-label small mb-0">Not</label>
                    <input type="text" class="form-control form-control-sm er-inst-notes" value="${notes}">
                </div>
                <div class="col-12 col-md-1 text-md-end">
                    <label class="form-label small mb-0 d-none d-md-block">&nbsp;</label>
                    <button type="button" class="btn btn-sm btn-outline-danger er-remove-installment-row-btn w-100"
                        data-row-index="${index}" ${canRemove ? '' : 'disabled'} title="Satırı kaldır">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
        })
        .join('');

    host.innerHTML = rowsHtml;
    updateDraftInstallmentsSumHint();
}

function syncDraftInstallmentsFromDom() {
    const host = document.getElementById('er-installments-rows-host');
    if (!host) return;
    host.querySelectorAll('.er-inst-row').forEach((rowEl, index) => {
        if (!draftReceiptInstallments[index]) return;
        const seq = parseInt(rowEl.querySelector('.er-inst-seq')?.value, 10);
        draftReceiptInstallments[index].sequence = Number.isFinite(seq) && seq > 0 ? seq : index + 1;
        draftReceiptInstallments[index].label = rowEl.querySelector('.er-inst-label')?.value ?? '';
        draftReceiptInstallments[index].amount = rowEl.querySelector('.er-inst-amount')?.value ?? '';
        draftReceiptInstallments[index].due_date = rowEl.querySelector('.er-inst-due')?.value ?? '';
        draftReceiptInstallments[index].notes = rowEl.querySelector('.er-inst-notes')?.value ?? '';
    });
}

function updateDraftInstallmentsSumHint() {
    const hint = document.getElementById('er-installments-sum-hint');
    if (!hint) return;
    const totalField = expectedReceiptFormModal?.getFieldValue('er_total_amount');
    const currency = expectedReceiptFormModal?.getFieldValue('er_currency') || 'TRY';
    const installmentSum = draftReceiptInstallments.reduce(
        (sum, row) => sum + (parseMoneyNumber(row.amount) || 0),
        0
    );
    const totalNum = parseMoneyNumber(totalField);
    let html = `<span>Taksit toplamı: <strong>${formatCurrency(installmentSum, currency)}</strong></span>`;
    if (Number.isFinite(totalNum) && totalNum > 0 && Math.abs(installmentSum - totalNum) > 0.009) {
        html += ` <span class="text-warning ms-1">(Üst kayıt toplamı: ${formatCurrency(totalNum, currency)})</span>`;
    }
    hint.innerHTML = html;
}

function validateDraftInstallments() {
    syncDraftInstallmentsFromDom();
    if (!draftReceiptInstallments.length) {
        return { ok: false, message: 'En az bir taksit ekleyin.' };
    }
    const sequences = new Set();
    for (let i = 0; i < draftReceiptInstallments.length; i++) {
        const row = draftReceiptInstallments[i];
        const label = String(row.label ?? '').trim();
        if (!label) {
            return { ok: false, message: `${i + 1}. satırda etiket zorunludur.` };
        }
        const amountNum = parseMoneyNumber(row.amount);
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
            return { ok: false, message: `${i + 1}. satırda geçerli bir tutar girin.` };
        }
        if (!row.due_date) {
            return { ok: false, message: `${i + 1}. satırda vade tarihi zorunludur.` };
        }
        const seq = Number(row.sequence);
        if (!Number.isFinite(seq) || seq < 1) {
            return { ok: false, message: `${i + 1}. satırda geçerli bir sıra numarası girin.` };
        }
        if (sequences.has(seq)) {
            return { ok: false, message: 'Taksit sıra numaraları benzersiz olmalıdır.' };
        }
        sequences.add(seq);
    }
    return {
        ok: true,
        payloads: draftReceiptInstallments
            .slice()
            .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
            .map((row) => ({
                sequence: Number(row.sequence),
                label: String(row.label).trim(),
                amount: parseMoneyNumber(row.amount).toFixed(2),
                due_date: row.due_date,
                notes: String(row.notes ?? '').trim()
            }))
    };
}

function toggleExpectedReceiptFormCreateFields(show) {
    ['er_total_amount', 'er_currency', 'er_description'].forEach((id) => {
        const el = expectedReceiptFormModal?.container?.querySelector(`[data-field-id="${id}"]`);
        if (el) el.classList.toggle('d-none', !show);
    });
    const instSection = document.getElementById('er-installments-section');
    if (instSection) instSection.classList.toggle('d-none', !show);
    if (expectedReceiptFormModal) {
        expectedReceiptFormModal.options.size = show ? 'xl' : 'lg';
        expectedReceiptFormModal.options.saveButtonText = show ? 'Kaydet' : 'Güncelle';
    }
}

function openCreateExpectedReceiptModal() {
    if (!expectedReceiptFormModal) return;
    activeReceiptContext = { mode: 'create' };
    draftReceiptInstallments = [createEmptyDraftInstallment(1)];
    toggleExpectedReceiptFormCreateFields(true);
    expectedReceiptFormModal.options.title = 'Yeni Beklenen Tahsilat';
    expectedReceiptFormModal.setFormData({
        er_title: '',
        er_customer_name: '',
        er_reference_no: '',
        er_total_amount: '',
        er_currency: 'EUR',
        er_job_order: '',
        er_description: '',
        er_notes: ''
    });
    setExpectedReceiptJobOrderDropdown('', '');
    renderDraftReceiptInstallmentRows();
    expectedReceiptFormModal.show();
}

function openEditExpectedReceiptModal(row) {
    if (!expectedReceiptFormModal || !row.receipt_id) return;
    activeReceiptContext = { mode: 'edit', id: row.receipt_id };
    toggleExpectedReceiptFormCreateFields(false);
    expectedReceiptFormModal.options.title = 'Tahsilat Kaydını Düzenle';
    expectedReceiptFormModal.setFormData({
        er_title: row.title || '',
        er_customer_name: row.customer_name || '',
        er_reference_no: row.reference_no || '',
        er_job_order: row.job_no || '',
        er_notes: row.notes || ''
    });
    setExpectedReceiptJobOrderDropdown(row.job_no || '', row.job_title || '');
    expectedReceiptFormModal.show();
}

async function handleCreateExpectedReceiptSave(formData) {
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

    const jobOrder = parseJobOrderFromForm(formData);

    if (activeReceiptContext?.mode === 'edit' && activeReceiptContext.id) {
        const payload = {
            title,
            customer_name: customerName,
            reference_no: String(formData.reference_no ?? '').trim(),
            job_order: jobOrder,
            notes: String(formData.notes ?? '').trim()
        };
        try {
            await updateExpectedReceipt(activeReceiptContext.id, payload);
            showSuccessMessage('Tahsilat kaydı güncellendi.');
            expectedReceiptFormModal.hide();
            await loadInflowTracker();
        } catch (error) {
            console.error(error);
            showErrorMessage(error.message || 'Tahsilat kaydı güncellenirken hata oluştu.');
        }
        return;
    }

    const rawTotal = String(formData.total_amount ?? '').trim().replace(',', '.');
    const totalNum = parseFloat(rawTotal);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
        showErrorMessage('Geçerli pozitif bir tutar girin.');
        return;
    }

    const installmentValidation = validateDraftInstallments();
    if (!installmentValidation.ok) {
        showErrorMessage(installmentValidation.message);
        return;
    }

    const currency = String(
        formData.currency ?? expectedReceiptFormModal?.getFieldValue('er_currency') ?? 'EUR'
    ).trim() || 'EUR';

    const payload = {
        title,
        description: String(formData.description ?? '').trim(),
        reference_no: String(formData.reference_no ?? '').trim(),
        customer_name: customerName,
        job_order: jobOrder,
        total_amount: totalNum.toFixed(2),
        currency,
        status: 'expected',
        notes: String(formData.notes ?? '').trim()
    };

    try {
        expectedReceiptFormModal.setLoading(true);
        const created = await createExpectedReceipt(payload);
        const receiptId = created?.id;
        if (!receiptId) {
            throw new Error('Tahsilat oluşturuldu ancak kayıt kimliği alınamadı.');
        }
        for (const inst of installmentValidation.payloads) {
            await createExpectedReceiptInstallment(receiptId, inst);
        }
        showSuccessMessage(
            `Tahsilat ve ${installmentValidation.payloads.length} taksit kaydedildi.`
        );
        expectedReceiptFormModal.hide();
        await loadInflowTracker();
    } catch (error) {
        console.error(error);
        showErrorMessage(error.message || 'Tahsilat kaydı oluşturulurken hata oluştu.');
    } finally {
        expectedReceiptFormModal.setLoading(false);
    }
}

async function loadInflowTracker() {
    if (!window.inflowTrackerTable) return;
    try {
        window.inflowTrackerTable.setLoading(true);
        const apiFilters = {};
        if (currentInflowFilters.is_received !== '' && currentInflowFilters.is_received != null) {
            apiFilters.is_received = currentInflowFilters.is_received;
        }
        if (currentInflowFilters.source) {
            apiFilters.source = currentInflowFilters.source;
        }
        const raw = await getInflowTracker(apiFilters);
        currentInflowRows = Array.isArray(raw) ? raw : normalizeApiList(raw);
        const tableData = prepareInflowTableData(currentInflowRows);
        updateInflowTableGroupingOptions();
        window.inflowTrackerTable.setLoading(false);
        window.inflowTrackerTable.updateData(tableData, tableData.length, 1);
    } catch (error) {
        console.error('Error loading inflow tracker:', error);
        showErrorMessage(error.message || 'Tahsilatlar yüklenirken hata oluştu.');
        if (window.inflowTrackerTable) {
            window.inflowTrackerTable.setLoading(false);
            window.inflowTrackerTable.updateData([]);
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
                await loadInflowTracker();
            } catch (error) {
                console.error(error);
                showErrorMessage(error.message || 'Tahsilat iptal edilirken hata oluştu.');
            }
        }
    });
}

function handleInflowMarkReceived(row) {
    if (row.source === 'sales_offer') {
        activeReceiptContext = {
            mode: 'mark_offer',
            offer_id: row.offer_id,
            sequence: row.sequence,
            label: row.label
        };
        if (inflowOfferNotesModal) {
            inflowOfferNotesModal.setFormData({ notes: row.notes || '' });
            inflowOfferNotesModal.show();
        } else {
            confirmMarkOfferInstallment(row, '');
        }
        return;
    }
    if (row.source === 'expected_receipt') {
        confirmMarkExpectedReceiptInstallmentReceived(row.receipt_id, row.installment_id, row.label);
    }
}

async function handleOfferInstallmentMarkReceivedSave(formData) {
    if (activeReceiptContext?.mode !== 'mark_offer') return;
    const notes = String(formData.notes ?? '').trim();
    try {
        await markOfferInstallmentReceived(activeReceiptContext.offer_id, activeReceiptContext.sequence, { notes });
        showSuccessMessage('Taksit tahsil edildi olarak işaretlendi.');
        inflowOfferNotesModal?.hide();
        await loadInflowTracker();
    } catch (error) {
        console.error(error);
        showErrorMessage(error.message || 'Taksit işaretlenirken hata oluştu.');
    }
}

function confirmMarkOfferInstallment(row, notes) {
    const seqLabel = row.label ? `"${row.label}"` : 'Bu taksit';
    actionConfirmModal.show({
        message: `${seqLabel} tahsil edildi olarak işaretlensin mi?`,
        confirmText: 'Tahsil Edildi',
        confirmButtonClass: 'btn-success',
        onConfirm: async () => {
            try {
                await markOfferInstallmentReceived(row.offer_id, row.sequence, { notes });
                showSuccessMessage('Taksit tahsil edildi olarak işaretlendi.');
                await loadInflowTracker();
            } catch (error) {
                console.error(error);
                showErrorMessage(error.message || 'Taksit işaretlenirken hata oluştu.');
            }
        }
    });
}

function confirmUnmarkOfferInstallment(row) {
    const seqLabel = row.label ? `"${row.label}"` : 'Bu taksit';
    actionConfirmModal.show({
        message: `${seqLabel} için tahsilat işareti kaldırılsın mı?`,
        confirmText: 'Geri Al',
        confirmButtonClass: 'btn-warning',
        onConfirm: async () => {
            try {
                await unmarkOfferInstallmentReceived(row.offer_id, row.sequence);
                showSuccessMessage('Tahsilat işareti kaldırıldı.');
                await loadInflowTracker();
            } catch (error) {
                console.error(error);
                showErrorMessage(error.message || 'İşlem sırasında hata oluştu.');
            }
        }
    });
}

function confirmDeleteExpectedReceiptInstallment(row) {
    const seqLabel = row.label ? `"${row.label}"` : 'Bu taksit';
    actionConfirmModal.show({
        message: `${seqLabel} silinsin mi?`,
        confirmText: 'Sil',
        confirmButtonClass: 'btn-danger',
        onConfirm: async () => {
            try {
                await deleteExpectedReceiptInstallment(row.receipt_id, row.installment_id);
                showSuccessMessage('Taksit silindi.');
                await loadInflowTracker();
            } catch (error) {
                console.error(error);
                showErrorMessage(error.message || 'Taksit silinirken hata oluştu.');
            }
        }
    });
}

function openAddExpectedReceiptInstallmentModalFromRow(row) {
    const siblings = currentInflowRows.filter(
        (r) => r.source === 'expected_receipt' && Number(r.receipt_id) === Number(row.receipt_id)
    );
    const maxSeq = siblings.reduce((max, i) => Math.max(max, Number(i.sequence) || 0), 0);
    activeReceiptContext = {
        mode: 'add_installment',
        id: row.receipt_id,
        currency: row.currency || 'EUR',
        installments: siblings
    };
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    expectedReceiptInstallmentFormModal.options.title = 'Taksit Ekle';
    expectedReceiptInstallmentFormModal.setFormData({
        sequence: String(maxSeq + 1),
        label: '',
        amount: '',
        due_date: `${y}-${m}-${d}`,
        notes: ''
    });
    expectedReceiptInstallmentFormModal.show();
}

function openEditExpectedReceiptInstallmentModal(row) {
    activeReceiptContext = {
        mode: 'edit_installment',
        id: row.receipt_id,
        installment_id: row.installment_id,
        currency: row.currency || 'EUR'
    };
    expectedReceiptInstallmentFormModal.options.title = 'Taksiti Düzenle';
    expectedReceiptInstallmentFormModal.setFormData({
        sequence: String(row.sequence ?? ''),
        label: row.label || '',
        amount: row.amount ?? '',
        due_date: row.due_date || '',
        notes: row.notes || ''
    });
    expectedReceiptInstallmentFormModal.show();
}

function openAddExpectedReceiptInstallmentModal() {
    if (!expectedReceiptInstallmentFormModal || !activeReceiptContext) return;

    const installments = activeReceiptContext.installments || [];
    const maxSeq = installments.reduce((max, i) => Math.max(max, Number(i.sequence) || 0), 0);

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');

    expectedReceiptInstallmentFormModal.options.title = 'Taksit Ekle';
    expectedReceiptInstallmentFormModal.setFormData({
        sequence: String(maxSeq + 1),
        label: '',
        amount: '',
        due_date: `${y}-${m}-${d}`,
        notes: ''
    });
    expectedReceiptInstallmentFormModal.show();
}

async function handleAddExpectedReceiptInstallmentSave(formData) {
    if (!activeReceiptContext) return;

    const sequence = parseInt(String(formData.sequence ?? '').trim(), 10);
    const rawAmount = String(formData.amount ?? '').trim().replace(',', '.');
    const amountNum = parseFloat(rawAmount);
    const label = String(formData.label ?? '').trim();

    if (!Number.isFinite(sequence) || sequence < 1) {
        showErrorMessage('Geçerli bir sıra numarası girin.');
        return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
        showErrorMessage('Geçerli pozitif bir tutar girin.');
        return;
    }
    if (!label) {
        showErrorMessage('Etiket zorunludur.');
        return;
    }

    const payload = {
        sequence,
        label,
        amount: amountNum.toFixed(2),
        due_date: formData.due_date || null,
        notes: String(formData.notes ?? '').trim()
    };

    try {
        if (activeReceiptContext.mode === 'edit_installment') {
            await updateExpectedReceiptInstallment(
                activeReceiptContext.id,
                activeReceiptContext.installment_id,
                payload
            );
            showSuccessMessage('Taksit güncellendi.');
        } else {
            if (!activeReceiptContext.id) return;
            if (!formData.due_date) {
                showErrorMessage('Yeni taksit için vade tarihi zorunludur.');
                return;
            }
            await createExpectedReceiptInstallment(activeReceiptContext.id, payload);
            showSuccessMessage('Taksit eklendi.');
        }
        expectedReceiptInstallmentFormModal.hide();
        await loadInflowTracker();
    } catch (error) {
        console.error(error);
        showErrorMessage(error.message || 'Taksit kaydedilirken hata oluştu.');
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
                await markExpectedReceiptInstallmentReceived(receiptId, installmentId);
                showSuccessMessage('Taksit tahsil edildi olarak işaretlendi.');
                await loadInflowTracker();
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
            ${(canWriteProcurement() && order.status !== 'cancelled') ? `
            <div class="row mt-3">
                <div class="col-12 text-end">
                    <button class="btn btn-outline-warning btn-sm" onclick="openSupplierEvaluation(${order.id})">
                        <i class="fas fa-star me-1"></i>Tedarikçi Değerlendir
                    </button>
                </div>
            </div>
            ` : ''}
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

// --- Supplier evaluation (rate a completed purchase order) ---

let supplierEvaluationModal = null;
let evaluatingOrderId = null;

const EVAL_SCORE_OPTIONS = [
    { value: '5', label: '5 - Çok İyi' },
    { value: '4', label: '4 - İyi' },
    { value: '3', label: '3 - Orta' },
    { value: '2', label: '2 - Zayıf' },
    { value: '1', label: '1 - Kötü' },
];

function initSupplierEvaluationModal() {
    if (supplierEvaluationModal) return;
    supplierEvaluationModal = new EditModal('supplier-evaluation-modal-container', {
        title: 'Tedarikçi Değerlendirme',
        icon: 'fas fa-star',
        saveButtonText: 'Değerlendirmeyi Kaydet',
        size: 'md',
    });
    supplierEvaluationModal.addSection({
        id: 'evaluation',
        title: 'Değerlendirme (1–5)',
        icon: 'fas fa-star',
        iconColor: 'text-warning',
        fields: [
            { id: 'quality_score', name: 'quality_score', label: 'Kalite', type: 'select', required: true, colSize: 6, options: EVAL_SCORE_OPTIONS },
            { id: 'delivery_score', name: 'delivery_score', label: 'Teslimat', type: 'select', required: true, colSize: 6, options: EVAL_SCORE_OPTIONS },
            { id: 'price_score', name: 'price_score', label: 'Fiyat', type: 'select', required: true, colSize: 6, options: EVAL_SCORE_OPTIONS },
            { id: 'service_score', name: 'service_score', label: 'Servis', type: 'select', required: true, colSize: 6, options: EVAL_SCORE_OPTIONS },
            { id: 'comment', name: 'comment', label: 'Yorum', type: 'textarea', rows: 3, colSize: 12, placeholder: 'Opsiyonel' },
        ],
    });
    supplierEvaluationModal.render();
    supplierEvaluationModal.onSaveCallback(handleSupplierEvaluationSave);
}

async function handleSupplierEvaluationSave(formData) {
    if (!evaluatingOrderId) return;
    const payload = {
        purchase_order: evaluatingOrderId,
        quality_score: Number(formData.quality_score),
        delivery_score: Number(formData.delivery_score),
        price_score: Number(formData.price_score),
        service_score: Number(formData.service_score),
        comment: (formData.comment || '').trim(),
    };
    try {
        const result = await createSupplierEvaluation(payload);
        const score = result?.supplier?.rating_score;
        showSuccessMessage(
            'Değerlendirme kaydedildi.' + (score != null ? ` Tedarikçinin yeni puanı: ${Number(score).toFixed(2)}` : '')
        );
        supplierEvaluationModal.hide();
        evaluatingOrderId = null;
    } catch (error) {
        console.error('Error saving supplier evaluation:', error);
        showErrorMessage(error.message || 'Değerlendirme kaydedilirken hata oluştu.');
        throw error;
    }
}

window.openSupplierEvaluation = async (orderId) => {
    if (!canWriteProcurement()) return;
    try {
        // Guard against duplicate evaluations for this PO.
        const existing = await listSupplierEvaluations({ purchase_order: orderId });
        const rows = Array.isArray(existing) ? existing : (existing.results || []);
        if (rows.length > 0) {
            showErrorMessage('Bu sipariş zaten değerlendirilmiş.');
            return;
        }
    } catch (_) {
        // If the check fails, still let the backend enforce uniqueness.
    }
    evaluatingOrderId = orderId;
    initSupplierEvaluationModal();
    supplierEvaluationModal.clearForm();
    supplierEvaluationModal.setFormData({
        quality_score: '4', delivery_score: '4', price_score: '4', service_score: '4', comment: '',
    });
    supplierEvaluationModal.show();
};



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
