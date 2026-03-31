import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { getUser } from '../../../../authService.js';
import { 
    fetchStatements,
    fetchStatement,
    generateStatement,
    generateBulkStatements,
    refreshStatement,
    submitStatement,
    decideStatement,
    fetchStatementAdjustments,
    createStatementAdjustment,
    deleteStatementAdjustment,
    getStatementStatusInfo,
    patchStatement
} from '../../../../apis/subcontracting/statements.js';
import {
    fetchSubcontractors,
    markSubcontractingStatementAsPaid
} from '../../../../apis/subcontracting/subcontractors.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { EditModal } from '../../../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../../../components/confirmation-modal/confirmation-modal.js';
import { initRouteProtection } from '../../../../apis/routeProtection.js';
import { showNotification } from '../../../../components/notification/notification.js';
import { fetchPaintInputs, createPaintInput, patchPaintInput } from '../../../../apis/subcontracting/paintInputs.js';
import { getJobOrderDropdown } from '../../../../apis/projects/jobOrders.js';

// Header component instance
let headerComponent;

// Filters component instance
let statementsFilters = null;

// Table component instance
let statementsTable = null;

// Modal component instances
let generateStatementModal = null;
let statementDetailModal = null;
let adjustmentModal = null;
let decideModal = null;
let actionConfirmModal = null;
let paintInputModal = null;

// State management
let currentPage = 1;
let currentOrdering = '-year,-month';
let statements = [];
let totalStatements = 0;
let isLoading = false;
let subcontractors = [];
let currentPaintInput = null;
let paintInputClickHandlerAttached = false;
let statementDeepLinkInitialized = false;
let currentOpenedStatementId = null;

function getStatementIdFromUrl() {
    try {
        const url = new URL(window.location.href);
        const raw = url.searchParams.get('statement');
        const id = raw ? parseInt(raw, 10) : null;
        return Number.isFinite(id) ? id : null;
    } catch {
        return null;
    }
}

function setStatementIdInUrl(statementId) {
    const url = new URL(window.location.href);
    if (statementId) {
        url.searchParams.set('statement', String(statementId));
    } else {
        url.searchParams.delete('statement');
    }
    window.history.pushState({ statementId: statementId || null }, '', url.toString());
}

function replaceStatementIdInUrl(statementId) {
    const url = new URL(window.location.href);
    if (statementId) {
        url.searchParams.set('statement', String(statementId));
    } else {
        url.searchParams.delete('statement');
    }
    window.history.replaceState({ statementId: statementId || null }, '', url.toString());
}

function initStatementDeepLinking() {
    if (statementDeepLinkInitialized) return;
    statementDeepLinkInitialized = true;

    window.addEventListener('popstate', () => {
        const statementId = getStatementIdFromUrl();
        if (statementId) {
            viewStatementDetail(statementId, { pushUrl: false });
        } else {
            // If URL no longer points to a statement, close modal if open.
            if (statementDetailModal) {
                statementDetailModal.hide();
            }
        }
    });
}

function formatAdjustmentTypeLabel(type) {
    const typeMap = {
        addition: 'Ek Ödeme',
        deduction: 'Kesinti'
    };
    return typeMap[type] || type || '-';
}

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    initStatementDeepLinking();
    actionConfirmModal = new ConfirmationModal('action-confirm-modal-container', {
        title: 'Onay',
        icon: 'fas fa-exclamation-triangle',
        message: 'Bu işlemi yapmak istediğinize emin misiniz?',
        confirmText: 'Evet',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-danger'
    });
    // Initialize header component
    initHeaderComponent();
    
    // Initialize modal components
    initializeModalComponents();
    setupPaintInputButtonHandler();
    
    await initializeStatements();

    // Auto-open detail modal if URL contains a statement id
    const deepLinkedId = getStatementIdFromUrl();
    if (deepLinkedId) {
        await viewStatementDetail(deepLinkedId, { pushUrl: false });
    }
});

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Hakediş Yönetimi',
        subtitle: 'Taşeron hakediş listesi ve yönetimi',
        icon: 'file-invoice-dollar',
        showBackButton: 'block',
        showCreateButton: 'block',
        showRefreshButton: 'block',
        createButtonText: 'Yeni Hakediş Oluştur',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/manufacturing/',
        onCreateClick: () => {
            showGenerateStatementModal();
        },
        onRefreshClick: async () => {
            // Reset to first page when refreshing
            currentPage = 1;
            await loadStatements();
        }
    });
}

async function initializeStatements() {
    try {
        await loadSubcontractors();
        initializeFiltersComponent();
        initializeTableComponent();
        
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
                field: '_expand',
                label: '',
                sortable: false,
                width: '50px',
                formatter: (value, row) => {
                    // This will be empty for regular rows, the expand icon is in the group header
                    return '';
                }
            },
            {
                field: 'subcontractor_name',
                label: 'Taşeron',
                sortable: true,
                formatter: (value) => `<strong>${value || '-'}</strong>`
            },
            {
                field: 'employee_count',
                label: 'Çalışan Sayısı',
                sortable: true,
                editable: true,
                type: 'number',
                width: '140px',
                formatter: (value) => {
                    if (value === null || value === undefined || value === '') return '-';
                    const n = parseInt(value, 10);
                    return Number.isFinite(n) ? n.toLocaleString('tr-TR') : '-';
                },
                validate: (newValue) => {
                    const raw = `${newValue ?? ''}`.trim();
                    if (raw === '') return 'Çalışan sayısı boş olamaz';
                    const n = Number(raw);
                    if (!Number.isFinite(n)) return 'Çalışan sayısı sayı olmalıdır';
                    if (!Number.isInteger(n)) return 'Çalışan sayısı tam sayı olmalıdır';
                    if (n < 0) return 'Çalışan sayısı 0 veya daha büyük olmalıdır';
                    return true;
                }
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value, row) => {
                    const statusInfo = getStatementStatusInfo(value);
                    // Map status classes to badge classes
                    let badgeClass = statusInfo.class;
                    if (badgeClass === 'status-teal') {
                        badgeClass = 'status-blue';
                    } else if (badgeClass === 'status-unknown') {
                        badgeClass = 'status-grey';
                    }
                    const approvers = Array.isArray(row?.current_approvers) ? row.current_approvers : [];
                    const approverText = approvers
                        .map(a => (a?.full_name || a?.username || '').trim())
                        .filter(Boolean)
                        .join(', ');

                    return `
                        <div class="text-center" style="line-height: 1.15;">
                            <span class="status-badge ${badgeClass} d-inline-block">${statusInfo.label}</span>
                            ${approverText ? `
                                <div class="small text-muted mt-1" style="white-space: nowrap;">
                                    <i class="fas fa-user-check me-1"></i>${approverText}
                                </div>
                            ` : ``}
                        </div>
                    `;
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
                // Backend field name is `adjustment_total` (singular). Keep formatter tolerant to older payloads.
                field: 'adjustment_total',
                label: 'Düzeltme',
                sortable: true,
                formatter: (value, row) => {
                    const resolved =
                        (value ?? row?.adjustment_total ?? row?.adjustments_total ?? 0);
                    if (resolved === null || resolved === undefined || Number.isNaN(resolved)) {
                        return '0 ' + (row.currency || 'TRY');
                    }
                    const sign = resolved >= 0 ? '+' : '';
                    return sign + new Intl.NumberFormat('tr-TR', {
                        style: 'decimal',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }).format(resolved) + ' ' + (row.currency || 'TRY');
                }
            },
            {
                field: 'grand_total',
                label: 'Genel Toplam (KDV Hariç)',
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
        editable: true,
        editableColumns: ['employee_count'],
        onEdit: async (row, field, newValue) => {
            // Only allow editing in draft/rejected
            if (!['draft', 'rejected'].includes(row?.status)) {
                throw new Error('Bu hakedişte çalışan sayısı düzenlenemez');
            }
            const n = parseInt(`${newValue}`.trim(), 10);
            if (!Number.isFinite(n) || n < 0) {
                throw new Error('Geçersiz çalışan sayısı');
            }
            const updated = await patchStatement(row.id, { employee_count: n });
            // Keep table row in sync with backend response when available
            row.employee_count = updated?.employee_count ?? n;
            return updated;
        },
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
            if (!field) {
                currentOrdering = '-year,-month';
            } else {
                const cleanField = String(field).replace(/^-+/, '');
                // Keep year+month ordering coupled so newest period stays on top.
                if (cleanField === 'year' || cleanField === 'month') {
                    currentOrdering = direction === 'asc' ? 'year,month' : '-year,-month';
                } else {
                    currentOrdering = direction === 'asc' ? cleanField : `-${cleanField}`;
                }
            }
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
        emptyIcon: 'fas fa-file-invoice-dollar',
        // Grouping configuration
        groupBy: 'period',
        groupCollapsible: true,
        defaultGroupExpanded: false,
        groupSortDirection: 'desc',
        groupHeaderFormatter: (groupValue, groupRows) => {
            // groupValue is the period string (e.g., "2026-02")
            // Parse it to display nicely
            const [year, month] = groupValue.split('-');
            const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
                              'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
            const monthName = monthNames[parseInt(month) - 1] || month;
            const count = groupRows.length;
            const periodText = `${monthName} ${year}`;
            return `
                <div class="d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center">
                        <div style="
                            color: #0d6efd;
                            font-weight: 500;
                            font-size: 0.95rem;
                            font-family: 'Courier New', monospace;
                            letter-spacing: 0.5px;
                            display: inline-block;
                        ">${periodText}</div>
                        <span class="badge bg-secondary ms-2">${count} ${count === 1 ? 'hakediş' : 'hakediş'}</span>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <button type="button"
                                class="btn btn-sm btn-outline-primary paint-input-btn"
                                data-year="${year}"
                                data-month="${month}"
                                title="Aylık boya girişi">
                            <i class="fas fa-fill-drip me-1"></i>Boya Girişi
                        </button>
                    </div>
                </div>
            `;
        }
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

// Initialize modal components
function initializeModalComponents() {
    // Generate Statement Modal
    generateStatementModal = new EditModal('generate-statement-modal-container', {
        title: 'Yeni Hakediş Oluştur',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Hakediş Oluştur',
        size: 'md'
    });

    // Statement Detail Modal
    statementDetailModal = new DisplayModal('statement-detail-modal-container', {
        title: 'Hakediş Detayı',
        icon: 'fas fa-file-invoice-dollar',
        size: 'xl',
        fullscreen: true,
        showEditButton: false
    });

    // Adjustment Modal
    adjustmentModal = new EditModal('adjustment-modal-container', {
        title: 'Düzeltme Ekle',
        icon: 'fas fa-edit',
        saveButtonText: 'Düzeltme Ekle',
        size: 'md'
    });

    // Decide Modal
    decideModal = new EditModal('decide-statement-modal-container', {
        title: 'Hakediş Kararı',
        icon: 'fas fa-gavel',
        saveButtonText: 'Karar Ver',
        size: 'md'
    });

    paintInputModal = new EditModal('paint-input-modal-container', {
        title: 'Aylık Boya Girişi',
        icon: 'fas fa-fill-drip',
        saveButtonText: 'Kaydet',
        size: 'md'
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
        
        filters.ordering = currentOrdering;
        
        const response = await fetchStatements(filters);
        
        statements = response.results || response || [];
        totalStatements = response.count || response.total || statements.length;
        
        // Add period field for grouping (format: "YYYY-MM" for proper sorting)
        statements = statements.map(statement => ({
            ...statement,
            period: statement.year && statement.month 
                ? `${statement.year}-${String(statement.month).padStart(2, '0')}`
                : 'unknown'
        }));

        // Expand the latest period group by default (keep others collapsed).
        // This is based on the actual loaded data so it always opens the newest month/year.
        if (statementsTable?.options?.groupBy === 'period') {
            const periodKeys = Array.from(
                new Set(
                    statements
                        .map(s => s.period)
                        .filter(p => p && p !== 'unknown')
                )
            ).sort(); // YYYY-MM sorts naturally

            const latestPeriodKey = periodKeys.length > 0 ? periodKeys[periodKeys.length - 1] : null;

            // Pre-seed groupExpandedState BEFORE rendering so TableComponent won't override it.
            statementsTable.groupExpandedState = {};
            periodKeys.forEach(k => {
                statementsTable.groupExpandedState[k] = (k === latestPeriodKey);
            });
            if (latestPeriodKey === null) {
                // fallback: leave defaults if no valid period
                statementsTable.groupExpandedState = {};
            }
        }
        
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

function setupPaintInputButtonHandler() {
    // IMPORTANT: TableComponent re-renders by cloning/replacing its container,
    // which removes any listeners attached to that container. Use document-level
    // delegation so the handler survives re-renders.
    if (paintInputClickHandlerAttached) return;
    paintInputClickHandlerAttached = true;

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.paint-input-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();

        const year = parseInt(btn.dataset.year);
        const month = parseInt(btn.dataset.month);
        if (!year || !month) return;

        await showPaintInputModal(year, month);
    });
}

async function showPaintInputModal(year, month) {
    if (!paintInputModal) return;

    paintInputModal.clearAll();
    currentPaintInput = null;

    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
        'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    const periodText = `${monthNames[month - 1] || month} ${year}`;

    paintInputModal.setTitle(`Aylık Boya Girişi - ${periodText}`);

    paintInputModal.addSection({
        title: 'Dönem',
        icon: 'fas fa-calendar',
        iconColor: 'text-primary'
    });

    paintInputModal.addField({
        id: 'paint-year',
        name: 'year',
        label: 'Yıl',
        type: 'number',
        value: year,
        required: true,
        readonly: true,
        icon: 'fas fa-calendar',
        colSize: 6
    });

    paintInputModal.addField({
        id: 'paint-month',
        name: 'month',
        label: 'Ay',
        type: 'number',
        value: month,
        required: true,
        readonly: true,
        icon: 'fas fa-calendar-alt',
        colSize: 6
    });

    paintInputModal.addSection({
        title: 'Boya Bilgileri',
        icon: 'fas fa-fill-drip',
        iconColor: 'text-primary'
    });

    paintInputModal.addField({
        id: 'paint-total-kg',
        name: 'total_kg',
        label: 'Toplam (kg)',
        type: 'number',
        value: '',
        required: true,
        step: '0.001',
        min: '0',
        icon: 'fas fa-weight-hanging',
        colSize: 6
    });

    paintInputModal.addField({
        id: 'paint-total-cost',
        name: 'total_cost',
        label: 'Toplam Maliyet',
        type: 'number',
        value: '',
        required: true,
        step: '0.01',
        min: '0',
        icon: 'fas fa-money-bill-wave',
        colSize: 6
    });

    paintInputModal.render();
    paintInputModal.show();

    try {
        paintInputModal.setLoading(true);
        const resp = await fetchPaintInputs({ year, month });
        const list = Array.isArray(resp) ? resp : (resp?.results || []);
        currentPaintInput = list.length > 0 ? list[0] : null;

        if (currentPaintInput) {
            paintInputModal.setFieldValue('paint-total-kg', currentPaintInput.total_kg ?? '');
            paintInputModal.setFieldValue('paint-total-cost', currentPaintInput.total_cost ?? '');
        }
    } catch (error) {
        // If backend returns 404 for empty, it'll show error; we prefer silent empty state.
        // Keep modal usable even if GET fails.
        console.warn('Paint input GET failed:', error);
    } finally {
        paintInputModal.setLoading(false);
    }

    paintInputModal.onSaveCallback(async (formData) => {
        try {
            const payload = {
                year: parseInt(formData.year),
                month: parseInt(formData.month),
                total_kg: parseFloat(formData.total_kg),
                total_cost: parseFloat(formData.total_cost)
            };

            if (currentPaintInput?.id) {
                await patchPaintInput(currentPaintInput.id, payload);
                showNotification('Boya girişi güncellendi', 'success');
            } else {
                const created = await createPaintInput(payload);
                currentPaintInput = created;
                showNotification('Boya girişi kaydedildi', 'success');
            }

            paintInputModal.hide();
        } catch (error) {
            console.error('Error saving paint input:', error);
            showNotification(error.message || 'Boya girişi kaydedilirken hata oluştu', 'error');
        }
    });
}

function showGenerateStatementModal() {
    generateStatementModal.clearAll();
    
    generateStatementModal.addSection({
        title: 'Hakediş Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
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
            await generateBulkStatements({
                year: parseInt(formData.year),
                month: parseInt(formData.month)
            });
            showNotification('Hakedişler oluşturuldu', 'success');
            generateStatementModal.hide();
            await loadStatements();
        } catch (error) {
            console.error('Error generating statements:', error);
            showNotification(error.message || 'Hakedişler oluşturulurken hata oluştu', 'error');
        }
    });
}

async function viewStatementDetail(statementId, options = {}) {
    try {
        const { pushUrl = true } = options || {};
        const [statement, adjustmentsResponse] = await Promise.all([
            fetchStatement(statementId),
            fetchStatementAdjustments(statementId)
        ]);
        const adjustments = Array.isArray(adjustmentsResponse)
            ? adjustmentsResponse
            : (adjustmentsResponse?.results || []);
        // Some detail endpoints may not include adjustments_total; compute it from the list to keep UI consistent.
        const computedAdjustmentsTotal = adjustments.reduce((sum, adj) => {
            const raw = parseFloat(adj?.amount);
            const amount = Number.isFinite(raw) ? raw : 0;
            const sign = (adj?.adjustment_type === 'deduction') ? -1 : 1;
            return sum + (sign * amount);
        }, 0);
        
        if (!statement) {
            showNotification('Hakediş bulunamadı', 'error');
            return;
        }
        
        statementDetailModal.clearData();
        statementDetailModal.setTitle(`Hakediş Detayı - ${statement.subcontractor_name || ''}`);
        
        const statusInfo = getStatementStatusInfo(statement.status);
        const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
                          'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        const periodText = statement.year && statement.month 
            ? `${monthNames[statement.month - 1]} ${statement.year}`
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
            format: () => {
                // Map status classes to badge classes
                let badgeClass = statusInfo.class;
                if (badgeClass === 'status-teal') {
                    badgeClass = 'status-blue';
                } else if (badgeClass === 'status-unknown') {
                    badgeClass = 'status-grey';
                }
                return `<span class="status-badge ${badgeClass}">${statusInfo.label}</span>`;
            }
        });

        const canEditEmployeeCount = ['draft', 'rejected'].includes(statement.status);
        const employeeCountValue =
            statement.employee_count === null || statement.employee_count === undefined
                ? ''
                : String(statement.employee_count);

        statementDetailModal.addCustomSection({
            id: 'employee-count',
            customContent: `
                <div class="mb-3">
                    <div class="row g-2 align-items-end">
                        <div class="col-md-4">
                            <label class="form-label">
                                <i class="fas fa-users me-1"></i>Çalışan Sayısı
                            </label>
                            <input
                                type="number"
                                class="form-control"
                                id="detail-employee-count-input"
                                min="0"
                                step="1"
                                value="${employeeCountValue}"
                                ${canEditEmployeeCount ? '' : 'readonly'}
                            />
                        </div>
                        <div class="col-md-4">
                            ${canEditEmployeeCount ? `
                                <button type="button" class="btn btn-primary" id="save-employee-count-btn">
                                    <i class="fas fa-save me-1"></i>Kaydet
                                </button>
                            ` : `
                                <div class="text-muted small">Bu alan sadece Taslak / Reddedildi durumunda düzenlenebilir.</div>
                            `}
                        </div>
                    </div>
                </div>
            `
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
                                            <td>
                                                <strong>${item.job_no || '-'}</strong>
                                                ${item.job_title ? `<br><small class="text-muted">${item.job_title}</small>` : ''}
                                            </td>
                                            <td>${item.price_tier_name || '-'}</td>
                                            <td>${item.allocated_weight_kg || 0} kg</td>
                                            <td>${item.previous_progress || 0}%</td>
                                            <td>${item.current_progress || 0}%</td>
                                            <td>${item.delta_progress || 0}%</td>
                                            <td>${item.effective_weight_kg || 0} kg</td>
                                            <td>${formatCurrency(item.price_per_kg, statement.currency)}</td>
                                            <td><strong>${formatCurrency(item.cost_amount, statement.currency)}</strong></td>
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
                                    <th>İş Emri</th>
                                    <th>Tür</th>
                                    <th>Neden</th>
                                    <th>Ağırlık</th>
                                    <th class="text-end">Fiyat/kg</th>
                                    <th class="text-end">Tutar</th>
                                    ${statement.status === 'draft' || statement.status === 'rejected' ? '<th>İşlem</th>' : ''}
                                </tr>
                            </thead>
                            <tbody>
                                ${adjustments && adjustments.length > 0 ? 
                                    adjustments.map(adj => `
                                        <tr>
                                            <td>
                                                <strong>${adj.job_order || '-'}</strong>
                                            </td>
                                            <td>${formatAdjustmentTypeLabel(adj.adjustment_type)}</td>
                                            <td>${adj.reason || '-'}</td>
                                            <td>${(adj.weight_kg ?? 0)} kg</td>
                                            <td class="text-end">${
                                                (() => {
                                                    const w = parseFloat(adj?.weight_kg);
                                                    const a = parseFloat(adj?.amount);
                                                    if (!Number.isFinite(w) || w <= 0) return '-';
                                                    if (!Number.isFinite(a)) return '-';
                                                    return formatCurrency(a / w, statement.currency);
                                                })()
                                            }</td>
                                            <td class="text-end"><strong>${formatCurrency(adj.amount, statement.currency)}</strong></td>
                                            ${statement.status === 'draft' || statement.status === 'rejected' ? `
                                                <td>
                                                    <button class="btn btn-sm btn-outline-danger delete-adj-btn" data-adj-id="${adj.id}">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            ` : ''}
                                        </tr>
                                    `).join('') : 
                                    `<tr><td colspan="${statement.status === 'draft' || statement.status === 'rejected' ? '7' : '6'}" class="text-center text-muted">Düzeltme bulunmamaktadır</td></tr>`
                                }
                            </tbody>
                            <tfoot class="table-light">
                                <tr>
                                    <td colspan="${statement.status === 'draft' || statement.status === 'rejected' ? '6' : '5'}" class="text-end"><strong>Düzeltmeler Toplamı:</strong></td>
                                    <td><strong>${formatCurrency(computedAdjustmentsTotal, statement.currency)}</strong></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            `
        });
        
        // Totals Section
        const subtotal = (parseFloat(statement.work_total) || 0) + computedAdjustmentsTotal;
        const vatRate = 0.20;
        const vatAmount = subtotal * vatRate;
        const totalWithVat = subtotal + vatAmount;

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
                                        <td class="text-end">${formatCurrency(computedAdjustmentsTotal, statement.currency)}</td>
                                    </tr>
                                    <tr class="border-top">
                                        <td><strong>Ara Toplam:</strong></td>
                                        <td class="text-end">${formatCurrency(subtotal, statement.currency)}</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <strong>KDV (%20):</strong>
                                        </td>
                                        <td class="text-end">${formatCurrency(vatAmount, statement.currency)}</td>
                                    </tr>
                                    <tr class="border-top">
                                        <td><strong>Genel Toplam (KDV Dahil):</strong></td>
                                        <td class="text-end"><strong>${formatCurrency(totalWithVat, statement.currency)}</strong></td>
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

        // Sync URL for shareable links
        currentOpenedStatementId = statementId;
        if (pushUrl) {
            setStatementIdInUrl(statementId);
        } else {
            // Ensure initial deep link has correct state for back/forward.
            replaceStatementIdInUrl(statementId);
        }

        // When modal closes, clear URL param (replace to avoid extra history entry).
        statementDetailModal.onCloseCallback(() => {
            currentOpenedStatementId = null;
            replaceStatementIdInUrl(null);
        });
        
        // Set up event listeners
        setTimeout(() => {
            setupStatementDetailActions(statement, adjustments);
        }, 100);
    } catch (error) {
        console.error('Error loading statement detail:', error);
        showNotification('Hakediş detayları yüklenirken hata oluştu', 'error');
    }
}

async function setupStatementDetailActions(statement, adjustments) {
    // Employee count save
    const saveEmployeeBtn = document.getElementById('save-employee-count-btn');
    if (saveEmployeeBtn) {
        saveEmployeeBtn.addEventListener('click', async () => {
            try {
                const input = document.getElementById('detail-employee-count-input');
                const raw = `${input?.value ?? ''}`.trim();
                if (raw === '') {
                    showNotification('Çalışan sayısı boş olamaz', 'error');
                    return;
                }
                const n = Number(raw);
                if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
                    showNotification('Çalışan sayısı 0 veya daha büyük tam sayı olmalıdır', 'error');
                    return;
                }
                await patchStatement(statement.id, { employee_count: n });
                showNotification('Çalışan sayısı güncellendi', 'success');
                // Refresh detail + list to reflect new value
                await viewStatementDetail(statement.id);
                await loadStatements();
            } catch (error) {
                console.error('Error updating employee count:', error);
                showNotification(error.message || 'Çalışan sayısı güncellenirken hata oluştu', 'error');
            }
        });
    }

    // Add adjustment button
    const addAdjBtn = document.getElementById('add-adjustment-btn');
    if (addAdjBtn) {
        addAdjBtn.addEventListener('click', () => {
            showAddAdjustmentModal(statement.id);
        });
    }
    
    // Delete adjustment buttons
    document.querySelectorAll('.delete-adj-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const adjId = parseInt(btn.dataset.adjId);
            const stId = statement.id;
            actionConfirmModal.show({
                message: 'Düzeltmeyi silmek istediğinizden emin misiniz?',
                onConfirm: async () => {
                    try {
                        await deleteStatementAdjustment(stId, adjId);
                        showNotification('Düzeltme silindi', 'success');
                        viewStatementDetail(stId);
                    } catch (error) {
                        console.error('Error deleting adjustment:', error);
                        showNotification(error.message || 'Düzeltme silinirken hata oluştu', 'error');
                    }
                }
            });
        });
    });
    
    // Update footer buttons based on status
    const modalFooter = statementDetailModal.container.querySelector('.modal-footer');
    if (modalFooter) {
        let footerButtons = '';

        let canCurrentUserDecide = true;
        if (statement.status === 'submitted') {
            try {
                const user = await getUser();
                const userId = user?.id;
                const wf = statement?.approval_workflow;
                const currentOrder = wf?.current_stage_order;
                const stages = Array.isArray(wf?.stage_instances) ? wf.stage_instances : [];
                const currentStage = stages.find(s => s?.order === currentOrder) || null;
                const approverIds = Array.isArray(currentStage?.approver_user_ids) ? currentStage.approver_user_ids : [];
                canCurrentUserDecide = !!(userId && approverIds.includes(userId));
            } catch (e) {
                // If user/wf cannot be resolved, default to safe behavior: hide approve/reject.
                canCurrentUserDecide = false;
            }
        }
        
        if (statement.status === 'draft') {
            footerButtons = `
                <button type="button" class="btn btn-sm btn-primary" id="refresh-statement-btn">
                    <i class="fas fa-sync me-1"></i>Yenile
                </button>
                <button type="button" class="btn btn-sm btn-success" id="submit-statement-btn">
                    <i class="fas fa-paper-plane me-1"></i>Onaya Gönder
                </button>
            `;
        } else if (statement.status === 'submitted') {
            footerButtons = canCurrentUserDecide ? `
                    <button type="button" class="btn btn-success" id="approve-statement-btn">
                        <i class="fas fa-check me-1"></i>Onayla
                    </button>
                    <button type="button" class="btn btn-sm btn-danger" id="reject-statement-btn">
                        <i class="fas fa-times me-1"></i>Reddet
                    </button>
                `
                : `
                    <div class="text-muted small">Bu hakedişi onaylamak/reddetmek için yetkiniz yok.</div>
                `;
        } else if (statement.status === 'rejected') {
            footerButtons = `
                <button type="button" class="btn btn-sm btn-primary" id="refresh-statement-btn">
                    <i class="fas fa-sync me-1"></i>Yenile
                </button>
                <button type="button" class="btn btn-sm btn-success" id="submit-statement-btn">
                    <i class="fas fa-paper-plane me-1"></i>Onaya Gönder
                </button>
            `;
        } else if (statement.status === 'approved') {
            footerButtons = `
                <button type="button" class="btn btn-sm btn-info" id="mark-paid-btn">
                    <i class="fas fa-money-check-alt me-1"></i>Ödendi olarak işaretle
                </button>
            `;
        } else {
            // Default: just close button
            footerButtons = ``;
        }
        
        modalFooter.innerHTML = footerButtons;
        
        // Set up button handlers
        const refreshBtn = document.getElementById('refresh-statement-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                const stId = statement.id;
                actionConfirmModal.show({
                    message: 'Mevcut kalemler silinip güncel verilerden yeniden oluşturulacak. Düzeltmeler korunacaktır. Devam edilsin mi?',
                    onConfirm: async () => {
                        try {
                            await refreshStatement(stId);
                            showNotification('Hakediş yenilendi', 'success');
                            viewStatementDetail(stId);
                        } catch (error) {
                            console.error('Error refreshing statement:', error);
                            showNotification(error.message || 'Hakediş yenilenirken hata oluştu', 'error');
                        }
                    }
                });
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
            markPaidBtn.addEventListener('click', () => {
                const stId = statement.id;
                actionConfirmModal.show({
                    message: 'Hakedişi ödendi olarak işaretlemek istediğinizden emin misiniz?',
                    onConfirm: async () => {
                        try {
                            await markSubcontractingStatementAsPaid(stId);
                            showNotification('Hakediş ödendi olarak işaretlendi', 'success');
                            viewStatementDetail(stId);
                            await loadStatements();
                        } catch (error) {
                            console.error('Error marking as paid:', error);
                            showNotification(error.message || 'Hakediş işaretlenirken hata oluştu', 'error');
                        }
                    }
                });
            });
        }
    }
}

async function showAddAdjustmentModal(statementId) {
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
            { value: 'addition', label: 'Ek Ödeme' },
            { value: 'deduction', label: 'Kesinti' }
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

    let jobOrderOptions = [];
    try {
        const dropdownItems = await getJobOrderDropdown(true);
        const list = Array.isArray(dropdownItems) ? dropdownItems : (dropdownItems?.results || []);
        jobOrderOptions = list.map((it) => {
            const jobNo = it.job_no || it.jobNo || it.value || it.id;
            const title = it.title || it.name || it.label || '';
            const label = title ? `${jobNo} - ${title}` : `${jobNo}`;
            return { value: jobNo, label };
        }).filter(o => o.value);
    } catch (error) {
        console.warn('Failed to load job order dropdown:', error);
        jobOrderOptions = [];
    }

    adjustmentModal.addField({
        id: 'adjustment-job-order',
        name: 'job_order',
        label: 'İş Emri',
        type: 'dropdown',
        value: '',
        required: true,
        options: [
            { value: '', label: 'İş emri seçin...' },
            ...jobOrderOptions
        ],
        searchable: true,
        placeholder: 'İş emri seçin...',
        icon: 'fas fa-file-invoice',
        colSize: 12
    });

    adjustmentModal.addField({
        id: 'adjustment-weight-kg',
        name: 'weight_kg',
        label: 'Ağırlık (kg) (Opsiyonel)',
        type: 'number',
        value: '',
        required: false,
        step: '0.01',
        min: '0',
        icon: 'fas fa-weight-hanging',
        colSize: 12,
        helpText: '<span class="text-danger"><i class="fas fa-exclamation-triangle me-1"></i>Uyarı: Bu değer toplam imalat tonajına dahil edilir.</span>'
    });
    
    adjustmentModal.render();
    adjustmentModal.show();
    
    window.currentStatementId = statementId;
    
    adjustmentModal.onSaveCallback(async (formData) => {
        try {
            const weightKgRaw = formData.weight_kg;
            const weightKgParsed = (weightKgRaw === null || weightKgRaw === undefined || `${weightKgRaw}`.trim() === '')
                ? 0
                : parseFloat(weightKgRaw);
            const weight_kg = Number.isFinite(weightKgParsed) ? weightKgParsed : 0;

            await createStatementAdjustment(statementId, {
                adjustment_type: formData.adjustment_type,
                amount: parseFloat(formData.amount),
                reason: formData.reason,
                job_order: formData.job_order,
                weight_kg
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
    if (amount === null || amount === undefined || Number.isNaN(amount)) return '-';
    return new Intl.NumberFormat('tr-TR', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount) + ' ' + (currency || 'TRY');
}
