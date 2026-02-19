import { initNavbar } from '../../../components/navbar.js';
import { 
    fetchStatements,
    fetchStatement,
    generateStatement,
    refreshStatement,
    submitStatement,
    decideStatement,
    markStatementAsPaid,
    fetchStatementAdjustments,
    createStatementAdjustment,
    deleteStatementAdjustment,
    getStatementStatusInfo
} from '../../../apis/subcontracting/statements.js';
import { fetchSubcontractors } from '../../../apis/subcontracting/subcontractors.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { showNotification } from '../../../components/notification/notification.js';

// State management
let currentPage = 1;
let currentSortField = '-period_year';
let currentSortDirection = 'desc';
let statements = [];
let totalStatements = 0;
let isLoading = false;
let statementsFilters = null;
let statementsTable = null;
let subcontractors = [];

// Modal component instances
let generateStatementModal = null;
let statementDetailModal = null;
let adjustmentModal = null;
let decideModal = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Hakediş Yönetimi',
        subtitle: 'Taşeron hakediş listesi ve yönetimi',
        icon: 'file-invoice-dollar',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'none',
        createButtonText: 'Yeni Hakediş Oluştur',
        onBackClick: () => window.location.href = '/manufacturing/',
        onCreateClick: () => showGenerateStatementModal()
    });
    
    await initializeStatements();
    setupEventListeners();
});

async function initializeStatements() {
    try {
        await loadSubcontractors();
        initializeFiltersComponent();
        initializeTableComponent();
        initializeModalComponents();
        
        await loadStatements();
    } catch (error) {
        console.error('Error initializing statements:', error);
        showNotification('Hakedişler yüklenirken hata oluştu', 'error');
    }
}

async function loadSubcontractors() {
    try {
        const response = await fetchSubcontractors({ is_active: true });
        subcontractors = response.results || response || [];
    } catch (error) {
        console.error('Error loading subcontractors:', error);
    }
}

function initializeTableComponent() {
    statementsTable = new TableComponent('statements-table-container', {
        title: 'Hakediş Listesi',
        columns: [
            {
                field: 'subcontractor_name',
                label: 'Taşeron',
                sortable: true,
                formatter: (value) => `<strong>${value || '-'}</strong>`
            },
            {
                field: 'period',
                label: 'Dönem',
                sortable: true,
                formatter: (value, row) => {
                    if (row.period_year && row.period_month) {
                        const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
                                          'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
                        return `${row.period_year}/${String(row.period_month).padStart(2, '0')}`;
                    }
                    return '-';
                }
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value) => {
                    const statusInfo = getStatementStatusInfo(value);
                    return `<span class="status-badge ${statusInfo.class}">${statusInfo.label}</span>`;
                }
            },
            {
                field: 'work_total',
                label: 'İş Toplamı',
                sortable: true,
                formatter: (value, row) => {
                    if (!value) return '-';
                    return new Intl.NumberFormat('tr-TR', {
                        style: 'decimal',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }).format(value) + ' ' + (row.currency || 'TRY');
                }
            },
            {
                field: 'adjustments_total',
                label: 'Düzeltme',
                sortable: true,
                formatter: (value, row) => {
                    if (!value) return '0 ' + (row.currency || 'TRY');
                    const sign = value >= 0 ? '+' : '';
                    return sign + new Intl.NumberFormat('tr-TR', {
                        style: 'decimal',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }).format(value) + ' ' + (row.currency || 'TRY');
                }
            },
            {
                field: 'grand_total',
                label: 'Genel Toplam',
                sortable: true,
                formatter: (value, row) => {
                    if (!value) return '-';
                    return new Intl.NumberFormat('tr-TR', {
                        style: 'decimal',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }).format(value) + ' ' + (row.currency || 'TRY');
                }
            }
        ],
        data: [],
        sortable: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        refreshable: true,
        onRefresh: async () => {
            currentPage = 1;
            await loadStatements();
        },
        onSort: async (field, direction) => {
            currentPage = 1;
            currentSortField = field;
            currentSortDirection = direction;
            await loadStatements();
        },
        onPageSizeChange: async (newPageSize) => {
            if (statementsTable) {
                statementsTable.options.itemsPerPage = newPageSize;
            }
            currentPage = 1;
            await loadStatements();
        },
        onPageChange: async (page) => {
            currentPage = page;
            await loadStatements();
        },
        onRowClick: (row) => {
            viewStatementDetail(row.id);
        },
        actions: [
            {
                key: 'view',
                label: 'Detay',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    viewStatementDetail(row.id);
                }
            }
        ],
        emptyMessage: 'Hakediş bulunamadı',
        emptyIcon: 'fas fa-file-invoice-dollar'
    });
}

function initializeFiltersComponent() {
    statementsFilters = new FiltersComponent('filters-placeholder', {
        title: 'Hakediş Filtreleri',
        onApply: (values) => {
            currentPage = 1;
            loadStatements();
        },
        onClear: () => {
            currentPage = 1;
            loadStatements();
        }
    });

    statementsFilters.addDropdownFilter({
        id: 'subcontractor-filter',
        label: 'Taşeron',
        options: [
            { value: '', label: 'Tümü' },
            ...subcontractors.map(s => ({ value: s.id.toString(), label: s.name || s.short_name }))
        ],
        placeholder: 'Tümü',
        colSize: 3
    });

    const currentYear = new Date().getFullYear();
    const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);
    statementsFilters.addDropdownFilter({
        id: 'year-filter',
        label: 'Yıl',
        options: [
            { value: '', label: 'Tümü' },
            ...yearOptions.map(y => ({ value: y.toString(), label: y.toString() }))
        ],
        placeholder: 'Tümü',
        colSize: 3
    });

    const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
                       'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    statementsFilters.addDropdownFilter({
        id: 'month-filter',
        label: 'Ay',
        options: [
            { value: '', label: 'Tümü' },
            ...monthOptions.map((m, i) => ({ value: m.toString(), label: monthNames[i] }))
        ],
        placeholder: 'Tümü',
        colSize: 3
    });

    statementsFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'draft', label: 'Taslak' },
            { value: 'submitted', label: 'Onay Bekliyor' },
            { value: 'approved', label: 'Onaylandı' },
            { value: 'rejected', label: 'Reddedildi' },
            { value: 'paid', label: 'Ödendi' },
            { value: 'cancelled', label: 'İptal Edildi' }
        ],
        placeholder: 'Tümü',
        colSize: 3
    });
}

function initializeModalComponents() {
    generateStatementModal = new EditModal('generate-statement-modal-container', {
        title: 'Yeni Hakediş Oluştur',
        icon: 'fas fa-plus-circle',
        size: 'md',
        showEditButton: false
    });

    statementDetailModal = new DisplayModal('statement-detail-modal-container', {
        title: 'Hakediş Detayı',
        icon: 'fas fa-file-invoice-dollar',
        size: 'xl',
        fullscreen: true,
        showEditButton: false
    });

    adjustmentModal = new EditModal('adjustment-modal-container', {
        title: 'Düzeltme Ekle',
        icon: 'fas fa-edit',
        size: 'md',
        showEditButton: false
    });

    decideModal = new EditModal('decide-statement-modal-container', {
        title: 'Hakediş Kararı',
        icon: 'fas fa-gavel',
        size: 'md',
        showEditButton: false
    });
}

async function loadStatements() {
    try {
        if (isLoading) return;
        
        isLoading = true;
        if (statementsTable) {
            statementsTable.setLoading(true);
        }
        
        const filterValues = statementsFilters ? statementsFilters.getFilterValues() : {};
        
        const filters = {
            page: currentPage,
            page_size: statementsTable ? statementsTable.options.itemsPerPage : 20
        };
        
        if (filterValues['subcontractor-filter']) {
            filters.subcontractor = filterValues['subcontractor-filter'];
        }
        if (filterValues['year-filter']) {
            filters.year = filterValues['year-filter'];
        }
        if (filterValues['month-filter']) {
            filters.month = filterValues['month-filter'];
        }
        if (filterValues['status-filter']) {
            filters.status = filterValues['status-filter'];
        }
        
        const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
        filters.ordering = orderingParam;
        
        const response = await fetchStatements(filters);
        
        statements = response.results || response || [];
        totalStatements = response.count || response.total || statements.length;
        
        if (statementsTable) {
            statementsTable.updateData(statements, totalStatements, currentPage);
        }
        
    } catch (error) {
        console.error('Error loading statements:', error);
        showNotification(error.message || 'Hakedişler yüklenirken hata oluştu', 'error');
        statements = [];
        totalStatements = 0;
        if (statementsTable) {
            statementsTable.updateData([], 0, currentPage);
        }
    } finally {
        isLoading = false;
        if (statementsTable) {
            statementsTable.setLoading(false);
        }
    }
}

function showGenerateStatementModal() {
    generateStatementModal.clearAll();
    
    generateStatementModal.addSection({
        title: 'Hakediş Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });
    
    generateStatementModal.addField({
        id: 'generate-subcontractor',
        name: 'subcontractor',
        label: 'Taşeron',
        type: 'dropdown',
        value: '',
        required: true,
        options: [
            { value: '', label: 'Taşeron seçin...' },
            ...subcontractors.map(s => ({ value: s.id.toString(), label: s.name || s.short_name }))
        ],
        icon: 'fas fa-building',
        colSize: 12
    });
    
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    generateStatementModal.addField({
        id: 'generate-year',
        name: 'year',
        label: 'Yıl',
        type: 'number',
        value: currentYear,
        required: true,
        min: 2020,
        max: 2100,
        icon: 'fas fa-calendar',
        colSize: 6
    });
    
    generateStatementModal.addField({
        id: 'generate-month',
        name: 'month',
        label: 'Ay',
        type: 'number',
        value: currentMonth,
        required: true,
        min: 1,
        max: 12,
        icon: 'fas fa-calendar-alt',
        colSize: 6
    });
    
    generateStatementModal.render();
    generateStatementModal.show();
    
    generateStatementModal.onSaveCallback(async (formData) => {
        try {
            await generateStatement({
                subcontractor: parseInt(formData.subcontractor),
                year: parseInt(formData.year),
                month: parseInt(formData.month)
            });
            showNotification('Hakediş oluşturuldu', 'success');
            generateStatementModal.hide();
            await loadStatements();
        } catch (error) {
            console.error('Error generating statement:', error);
            showNotification(error.message || 'Hakediş oluşturulurken hata oluştu', 'error');
        }
    });
}

async function viewStatementDetail(statementId) {
    try {
        const [statement, adjustments] = await Promise.all([
            fetchStatement(statementId),
            fetchStatementAdjustments(statementId)
        ]);
        
        if (!statement) {
            showNotification('Hakediş bulunamadı', 'error');
            return;
        }
        
        statementDetailModal.clearData();
        statementDetailModal.setTitle(`Hakediş Detayı - ${statement.subcontractor_name || ''}`);
        
        const statusInfo = getStatementStatusInfo(statement.status);
        const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
                          'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        const periodText = statement.period_year && statement.period_month 
            ? `${monthNames[statement.period_month - 1]} ${statement.period_year}`
            : '-';
        
        // Header Section
        statementDetailModal.addSection({
            title: 'Hakediş Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });
        
        statementDetailModal.addField({
            id: 'detail-subcontractor',
            name: 'subcontractor',
            label: 'Taşeron',
            value: statement.subcontractor_name || '-',
            icon: 'fas fa-building',
            colSize: 4
        });
        
        statementDetailModal.addField({
            id: 'detail-period',
            name: 'period',
            label: 'Dönem',
            value: periodText,
            icon: 'fas fa-calendar',
            colSize: 4
        });
        
        statementDetailModal.addField({
            id: 'detail-status',
            name: 'status',
            label: 'Durum',
            value: statusInfo.label,
            icon: 'fas fa-info-circle',
            colSize: 4,
            format: () => `<span class="status-badge ${statusInfo.class}">${statusInfo.label}</span>`
        });
        
        // Line Items Section
        statementDetailModal.addCustomSection({
            id: 'line-items',
            customContent: `
                <div class="mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6 class="mb-0"><i class="fas fa-list me-2"></i>İş Kalemleri</h6>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm table-bordered">
                            <thead class="table-light">
                                <tr>
                                    <th>İş Emri</th>
                                    <th>Kademe</th>
                                    <th>Ayrılan</th>
                                    <th>Önceki %</th>
                                    <th>Mevcut %</th>
                                    <th>Delta %</th>
                                    <th>Eff. Ağırlık</th>
                                    <th>Fiyat/kg</th>
                                    <th>Tutar</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${statement.line_items && statement.line_items.length > 0 ? 
                                    statement.line_items.map(item => `
                                        <tr>
                                            <td>${item.job_order || '-'}</td>
                                            <td>${item.price_tier_name || '-'}</td>
                                            <td>${item.allocated_weight_kg || 0} kg</td>
                                            <td>${item.previous_progress || 0}%</td>
                                            <td>${item.current_progress || 0}%</td>
                                            <td>${item.delta_progress || 0}%</td>
                                            <td>${item.effective_weight_kg || 0} kg</td>
                                            <td>${formatCurrency(item.price_per_kg, item.currency)}</td>
                                            <td><strong>${formatCurrency(item.amount, item.currency)}</strong></td>
                                        </tr>
                                    `).join('') : 
                                    '<tr><td colspan="9" class="text-center text-muted">Kalem bulunmamaktadır</td></tr>'
                                }
                            </tbody>
                            <tfoot class="table-light">
                                <tr>
                                    <td colspan="8" class="text-end"><strong>İş Toplamı:</strong></td>
                                    <td><strong>${formatCurrency(statement.work_total, statement.currency)}</strong></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            `
        });
        
        // Adjustments Section
        statementDetailModal.addCustomSection({
            id: 'adjustments',
            customContent: `
                <div class="mb-4">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6 class="mb-0"><i class="fas fa-edit me-2"></i>Düzeltmeler</h6>
                        ${statement.status === 'draft' || statement.status === 'rejected' ? `
                            <button class="btn btn-sm btn-primary" id="add-adjustment-btn">
                                <i class="fas fa-plus me-1"></i>Düzeltme Ekle
                            </button>
                        ` : ''}
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm table-bordered">
                            <thead class="table-light">
                                <tr>
                                    <th>Tür</th>
                                    <th>Tutar</th>
                                    <th>Neden</th>
                                    <th>İş Emri</th>
                                    ${statement.status === 'draft' || statement.status === 'rejected' ? '<th>İşlem</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${adjustments && adjustments.length > 0 ? 
                                    adjustments.map(adj => `
                                        <tr>
                                            <td>${adj.adjustment_type || '-'}</td>
                                            <td>${formatCurrency(adj.amount, statement.currency)}</td>
                                            <td>${adj.reason || '-'}</td>
                                            <td>${adj.job_order || '-'}</td>
                                            ${statement.status === 'draft' || statement.status === 'rejected' ? `
                                                <td>
                                                    <button class="btn btn-sm btn-outline-danger delete-adj-btn" data-adj-id="${adj.id}">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            ` : ''}
                                        </tr>
                                    `).join('') : 
                                    '<tr><td colspan="${statement.status === 'draft' || statement.status === 'rejected' ? '5' : '4'}" class="text-center text-muted">Düzeltme bulunmamaktadır</td></tr>'
                                }
                            </tbody>
                            <tfoot class="table-light">
                                <tr>
                                    <td colspan="${statement.status === 'draft' || statement.status === 'rejected' ? '4' : '3'}" class="text-end"><strong>Düzeltmeler Toplamı:</strong></td>
                                    <td><strong>${formatCurrency(statement.adjustments_total || 0, statement.currency)}</strong></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            `
        });
        
        // Totals Section
        statementDetailModal.addCustomSection({
            id: 'totals',
            customContent: `
                <div class="card">
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6 offset-md-6">
                                <table class="table table-sm table-borderless">
                                    <tr>
                                        <td><strong>İş Toplamı:</strong></td>
                                        <td class="text-end">${formatCurrency(statement.work_total || 0, statement.currency)}</td>
                                    </tr>
                                    <tr>
                                        <td><strong>Düzeltmeler:</strong></td>
                                        <td class="text-end">${formatCurrency(statement.adjustments_total || 0, statement.currency)}</td>
                                    </tr>
                                    <tr class="border-top">
                                        <td><strong>Genel Toplam:</strong></td>
                                        <td class="text-end"><strong>${formatCurrency(statement.grand_total || 0, statement.currency)}</strong></td>
                                    </tr>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            `
        });
        
        statementDetailModal.render();
        statementDetailModal.show();
        
        // Set up event listeners
        setTimeout(() => {
            setupStatementDetailActions(statement, adjustments);
        }, 100);
    } catch (error) {
        console.error('Error loading statement detail:', error);
        showNotification('Hakediş detayları yüklenirken hata oluştu', 'error');
    }
}

function setupStatementDetailActions(statement, adjustments) {
    // Add adjustment button
    const addAdjBtn = document.getElementById('add-adjustment-btn');
    if (addAdjBtn) {
        addAdjBtn.addEventListener('click', () => {
            showAddAdjustmentModal(statement.id);
        });
    }
    
    // Delete adjustment buttons
    document.querySelectorAll('.delete-adj-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const adjId = parseInt(btn.dataset.adjId);
            if (confirm('Düzeltmeyi silmek istediğinizden emin misiniz?')) {
                try {
                    await deleteStatementAdjustment(statement.id, adjId);
                    showNotification('Düzeltme silindi', 'success');
                    viewStatementDetail(statement.id);
                } catch (error) {
                    console.error('Error deleting adjustment:', error);
                    showNotification(error.message || 'Düzeltme silinirken hata oluştu', 'error');
                }
            }
        });
    });
    
    // Action buttons based on status
    const modalBody = statementDetailModal.container.querySelector('.modal-body');
    if (modalBody) {
        let actionButtons = '';
        
        if (statement.status === 'draft') {
            actionButtons = `
                <div class="mt-3 d-flex gap-2">
                    <button class="btn btn-primary" id="refresh-statement-btn">
                        <i class="fas fa-sync me-1"></i>Yenile
                    </button>
                    <button class="btn btn-success" id="submit-statement-btn">
                        <i class="fas fa-paper-plane me-1"></i>Onaya Gönder
                    </button>
                </div>
            `;
        } else if (statement.status === 'submitted') {
            actionButtons = `
                <div class="mt-3 d-flex gap-2">
                    <button class="btn btn-success" id="approve-statement-btn">
                        <i class="fas fa-check me-1"></i>Onayla
                    </button>
                    <button class="btn btn-danger" id="reject-statement-btn">
                        <i class="fas fa-times me-1"></i>Reddet
                    </button>
                </div>
            `;
        } else if (statement.status === 'rejected') {
            actionButtons = `
                <div class="mt-3 d-flex gap-2">
                    <button class="btn btn-primary" id="refresh-statement-btn">
                        <i class="fas fa-sync me-1"></i>Yenile
                    </button>
                    <button class="btn btn-success" id="submit-statement-btn">
                        <i class="fas fa-paper-plane me-1"></i>Onaya Gönder
                    </button>
                </div>
            `;
        } else if (statement.status === 'approved') {
            actionButtons = `
                <div class="mt-3">
                    <button class="btn btn-info" id="mark-paid-btn">
                        <i class="fas fa-money-check-alt me-1"></i>Ödendi olarak işaretle
                    </button>
                </div>
            `;
        }
        
        if (actionButtons) {
            const actionDiv = document.createElement('div');
            actionDiv.innerHTML = actionButtons;
            modalBody.appendChild(actionDiv);
            
            // Set up button handlers
            const refreshBtn = document.getElementById('refresh-statement-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async () => {
                    if (confirm('Mevcut kalemler silinip güncel verilerden yeniden oluşturulacak. Düzeltmeler korunacaktır. Devam edilsin mi?')) {
                        try {
                            await refreshStatement(statement.id);
                            showNotification('Hakediş yenilendi', 'success');
                            viewStatementDetail(statement.id);
                        } catch (error) {
                            console.error('Error refreshing statement:', error);
                            showNotification(error.message || 'Hakediş yenilenirken hata oluştu', 'error');
                        }
                    }
                });
            }
            
            const submitBtn = document.getElementById('submit-statement-btn');
            if (submitBtn) {
                submitBtn.addEventListener('click', async () => {
                    try {
                        await submitStatement(statement.id);
                        showNotification('Hakediş onaya gönderildi', 'success');
                        viewStatementDetail(statement.id);
                        await loadStatements();
                    } catch (error) {
                        console.error('Error submitting statement:', error);
                        showNotification(error.message || 'Hakediş onaya gönderilirken hata oluştu', 'error');
                    }
                });
            }
            
            const approveBtn = document.getElementById('approve-statement-btn');
            if (approveBtn) {
                approveBtn.addEventListener('click', () => {
                    showDecideModal(statement.id, true);
                });
            }
            
            const rejectBtn = document.getElementById('reject-statement-btn');
            if (rejectBtn) {
                rejectBtn.addEventListener('click', () => {
                    showDecideModal(statement.id, false);
                });
            }
            
            const markPaidBtn = document.getElementById('mark-paid-btn');
            if (markPaidBtn) {
                markPaidBtn.addEventListener('click', async () => {
                    if (confirm('Hakedişi ödendi olarak işaretlemek istediğinizden emin misiniz?')) {
                        try {
                            await markStatementAsPaid(statement.id);
                            showNotification('Hakediş ödendi olarak işaretlendi', 'success');
                            viewStatementDetail(statement.id);
                            await loadStatements();
                        } catch (error) {
                            console.error('Error marking as paid:', error);
                            showNotification(error.message || 'Hakediş işaretlenirken hata oluştu', 'error');
                        }
                    }
                });
            }
        }
    }
}

function showAddAdjustmentModal(statementId) {
    adjustmentModal.clearAll();
    
    adjustmentModal.addSection({
        title: 'Düzeltme Bilgileri',
        icon: 'fas fa-edit',
        iconColor: 'text-warning'
    });
    
    adjustmentModal.addField({
        id: 'adjustment-type',
        name: 'adjustment_type',
        label: 'Tür',
        type: 'dropdown',
        value: '',
        required: true,
        options: [
            { value: '', label: 'Tür seçin...' },
            { value: 'Ek Ödeme', label: 'Ek Ödeme' },
            { value: 'Kesinti', label: 'Kesinti' }
        ],
        icon: 'fas fa-tag',
        colSize: 6
    });
    
    adjustmentModal.addField({
        id: 'adjustment-amount',
        name: 'amount',
        label: 'Tutar',
        type: 'number',
        value: '',
        required: true,
        step: '0.01',
        min: '0',
        icon: 'fas fa-money-bill-wave',
        colSize: 6
    });
    
    adjustmentModal.addField({
        id: 'adjustment-reason',
        name: 'reason',
        label: 'Neden',
        type: 'textarea',
        value: '',
        required: true,
        icon: 'fas fa-comment',
        colSize: 12
    });
    
    adjustmentModal.addField({
        id: 'adjustment-job-order',
        name: 'job_order',
        label: 'İş Emri (Opsiyonel)',
        type: 'text',
        value: '',
        icon: 'fas fa-file-invoice',
        colSize: 12
    });
    
    adjustmentModal.render();
    adjustmentModal.show();
    
    window.currentStatementId = statementId;
    
    adjustmentModal.onSaveCallback(async (formData) => {
        try {
            await createStatementAdjustment(statementId, {
                adjustment_type: formData.adjustment_type,
                amount: parseFloat(formData.amount),
                reason: formData.reason,
                job_order: formData.job_order || null
            });
            showNotification('Düzeltme eklendi', 'success');
            adjustmentModal.hide();
            viewStatementDetail(statementId);
        } catch (error) {
            console.error('Error creating adjustment:', error);
            showNotification(error.message || 'Düzeltme eklenirken hata oluştu', 'error');
        }
    });
}

function showDecideModal(statementId, approve) {
    decideModal.clearAll();
    
    decideModal.addSection({
        title: approve ? 'Onay' : 'Red',
        icon: approve ? 'fas fa-check-circle' : 'fas fa-times-circle',
        iconColor: approve ? 'text-success' : 'text-danger'
    });
    
    decideModal.addField({
        id: 'decide-comment',
        name: 'comment',
        label: 'Yorum',
        type: 'textarea',
        value: '',
        required: !approve,
        icon: 'fas fa-comment',
        colSize: 12,
        helpText: approve ? 'Onay yorumu (opsiyonel)' : 'Red nedeni (zorunlu)'
    });
    
    decideModal.render();
    decideModal.show();
    
    window.decidingStatementId = statementId;
    window.decidingApprove = approve;
    
    decideModal.onSaveCallback(async (formData) => {
        try {
            await decideStatement(statementId, {
                approve: approve,
                comment: formData.comment || ''
            });
            showNotification(approve ? 'Hakediş onaylandı' : 'Hakediş reddedildi', 'success');
            decideModal.hide();
            viewStatementDetail(statementId);
            await loadStatements();
        } catch (error) {
            console.error('Error deciding statement:', error);
            showNotification(error.message || 'Karar verilirken hata oluştu', 'error');
        }
    });
}

function formatCurrency(amount, currency) {
    if (!amount) return '-';
    return new Intl.NumberFormat('tr-TR', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount) + ' ' + (currency || 'TRY');
}

function setupEventListeners() {
    // Additional event listeners if needed
}
