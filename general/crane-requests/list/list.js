import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { FileAttachments } from '../../../components/file-attachments/file-attachments.js';
import { FileViewer } from '../../../components/file-viewer/file-viewer.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { showNotification } from '../../../components/notification/notification.js';
import { formatDate, formatDateTime } from '../../../apis/formatters.js';
import { fetchAllUsers } from '../../../apis/users.js';
import { getJobOrderDropdown } from '../../../apis/projects/jobOrders.js';
import {
    getCraneRequests,
    getCraneRequest,
    createCraneRequest,
    cancelCraneRequest,
    completeCraneRequest,
    getCraneTypes,
    getCraneMyPermissions,
    getCraneStatusInfo,
    computeCraneEstimate,
    PRICING_OPTION_LABELS,
    PLATFORM_CATEGORIES
} from '../../../apis/craneRequests.js';

// State management
let currentPage = 1;
let currentSortField = 'id';
let currentSortDirection = 'desc';
let requests = [];
let totalRequests = 0;
let isLoading = false;
let requestsTable = null;
let craneFilters = null;
let createModal = null;
let detailsModal = null;
let completeModal = null;
let cancelModal = null;
let currentRequest = null;

// Reference data
let craneTypes = [];
let jobOrderDropdownOptions = [];
let myPermissions = { can_complete: false, can_manage_prices: false };
const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

const priorityOptions = [
    { value: 'normal', label: 'Normal' },
    { value: 'urgent', label: 'Acil' },
    { value: 'critical', label: 'Kritik' }
];

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    const header = new HeaderComponent({
        title: 'Tüm Vinç Talepleri',
        subtitle: 'Kiralık vinç/platform taleplerinin yönetimi ve takibi',
        icon: 'truck-pickup',
        showBackButton: 'block',
        showCreateButton: 'block',
        showExportButton: 'none',
        showRefreshButton: 'block',
        createButtonText: 'Yeni Vinç Talebi',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/general/crane-requests',
        onCreateClick: showCreateModal,
        onRefreshClick: () => {
            currentPage = 1;
            loadRequests();
        }
    });

    // Load reference data in parallel (permissions failure shouldn't block the page)
    const [typesResult, permsResult, jobsResult] = await Promise.allSettled([
        getCraneTypes(),
        getCraneMyPermissions(),
        getJobOrderDropdown()
    ]);
    craneTypes = typesResult.status === 'fulfilled'
        ? (typesResult.value.results || typesResult.value || [])
        : [];
    if (permsResult.status === 'fulfilled') {
        myPermissions = permsResult.value;
    }
    jobOrderDropdownOptions = jobsResult.status === 'fulfilled' ? (jobsResult.value || []) : [];

    initializeModals();
    await initializeFiltersComponent();
    initializeTableComponent();
    await loadRequests();

    // Open details modal when ?request=<id> is present
    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('request');
    if (requestId) {
        await viewRequestDetails(parseInt(requestId, 10));
    }
});

function getTypeById(id) {
    return craneTypes.find(t => String(t.id) === String(id)) || null;
}

function isPlatformType(type) {
    return type && PLATFORM_CATEGORIES.includes(type.category);
}

function formatMoney(value, currency = 'TRY') {
    if (value === null || value === undefined || value === '') return '-';
    const num = parseFloat(value);
    if (Number.isNaN(num)) return '-';
    return `${num.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

function initializeModals() {
    createModal = new EditModal('create-crane-request-modal-container', {
        title: 'Yeni Vinç Talebi',
        icon: 'fas fa-plus-circle',
        size: 'lg',
        saveButtonText: 'Oluştur'
    });

    detailsModal = new DisplayModal('crane-request-details-modal-container', {
        title: 'Vinç Talebi Detayları',
        icon: 'fas fa-truck-pickup',
        size: 'xl',
        showEditButton: false
    });

    detailsModal.onCloseCallback(() => {
        const url = new URL(window.location);
        url.searchParams.delete('request');
        window.history.pushState({}, '', url);
    });

    completeModal = new EditModal('complete-crane-request-modal-container', {
        title: 'Talebi Tamamla (Fiili Değerler)',
        icon: 'fas fa-flag-checkered',
        size: 'md',
        saveButtonText: 'Tamamla'
    });

    cancelModal = new ConfirmationModal('cancel-confirmation-modal-container', {
        title: 'Vinç Talebini İptal Et',
        icon: 'fas fa-ban',
        message: 'Bu vinç talebini iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
        confirmText: 'Evet, İptal Et',
        cancelText: 'Vazgeç',
        confirmButtonClass: 'btn-danger'
    });

    cancelModal.setOnConfirm(async () => {
        if (currentRequest && currentRequest.id) {
            try {
                await cancelCraneRequest(currentRequest.id);
                showNotification('Vinç talebi iptal edildi', 'success');
                cancelModal.hide();
                detailsModal.hide();
                await loadRequests();
            } catch (error) {
                showNotification('Talep iptal edilirken hata oluştu: ' + error.message, 'error');
            }
        }
    });
}

async function initializeFiltersComponent() {
    craneFilters = new FiltersComponent('filters-placeholder', {
        title: 'Vinç Talepleri Filtreleri',
        onApply: () => {
            currentPage = 1;
            loadRequests();
        },
        onClear: () => {
            currentPage = 1;
            loadRequests();
            showNotification('Filtreler temizlendi', 'info');
        }
    });

    craneFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: 'submitted', label: 'Onay Bekliyor' },
            { value: 'approved', label: 'Onaylandı' },
            { value: 'rejected', label: 'Reddedildi' },
            { value: 'cancelled', label: 'İptal Edildi' },
            { value: 'completed', label: 'Tamamlandı' }
        ],
        placeholder: 'Durum seçin',
        colSize: 2
    });

    craneFilters.addDropdownFilter({
        id: 'crane-type-filter',
        label: 'Ekipman',
        options: craneTypes.map(t => ({
            value: t.id.toString(),
            label: `${t.category_label} · ${t.name}`
        })),
        placeholder: 'Ekipman seçin',
        colSize: 3,
        searchable: true
    });

    craneFilters.addDropdownFilter({
        id: 'job-no-filter',
        label: 'İş Emri',
        options: jobOrderDropdownOptions.map(j => ({
            value: j.job_no,
            label: `${j.job_no} - ${j.title}`
        })),
        placeholder: 'İş emri seçin',
        colSize: 3,
        searchable: true
    });

    craneFilters.addDropdownFilter({
        id: 'priority-filter',
        label: 'Öncelik',
        options: priorityOptions,
        placeholder: 'Öncelik seçin',
        colSize: 2
    });

    try {
        const users = await fetchAllUsers();
        craneFilters.addDropdownFilter({
            id: 'requestor-filter',
            label: 'Talep Eden',
            options: users.map(user => ({
                value: user.id ? user.id.toString() : user.username,
                label: user.full_name ? `${user.full_name} (${user.username})` :
                    (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name} (${user.username})` :
                    user.username
            })),
            placeholder: 'Kullanıcı seçin',
            colSize: 2,
            searchable: true
        });
    } catch (error) {
        console.error('Error loading users for filter:', error);
    }
}

function renderStatusBadge(status, statusLabel) {
    const info = getCraneStatusInfo(status);
    return `<span class="status-badge ${info.class}">${statusLabel || info.label}</span>`;
}

function renderPriorityBadge(priority) {
    const map = {
        'critical': { class: 'status-red', label: 'Kritik' },
        'urgent': { class: 'status-yellow', label: 'Acil' },
        'normal': { class: 'status-blue', label: 'Normal' }
    };
    const info = map[priority] || { class: 'status-grey', label: priority || 'Normal' };
    return `<span class="status-badge ${info.class}">${info.label}</span>`;
}

function formatDurationSummary(row) {
    if (row.pricing_option === 'daily') {
        return `${PRICING_OPTION_LABELS[row.pricing_option]} × ${row.days || 1}`;
    }
    let label = PRICING_OPTION_LABELS[row.pricing_option] || row.pricing_option_label || '-';
    if (row.needs_rigger) {
        label += ' + Sapancı';
    }
    return label;
}

function initializeTableComponent() {
    requestsTable = new TableComponent('crane-requests-table-container', {
        title: 'Vinç Talepleri',
        icon: 'fas fa-truck-pickup',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'request_number',
                label: 'Talep No',
                sortable: false,
                formatter: (value) => `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 0.9rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value || '-'}</span>`
            },
            {
                field: 'crane_type_name',
                label: 'Ekipman',
                sortable: false,
                formatter: (value) => `<div style="font-weight: 500; color: #212529;">${value || '-'}</div>`
            },
            {
                field: 'job_no',
                label: 'İş Emri',
                sortable: false,
                formatter: (value) => `<span style="font-weight: 600; color: #495057;">${value || '-'}</span>`
            },
            {
                field: 'department',
                label: 'Departman',
                sortable: false,
                formatter: (value) => `<div style="color: #495057;">${value || '-'}</div>`
            },
            {
                field: 'pricing_option',
                label: 'Süre',
                sortable: false,
                formatter: (value, row) => `<div style="color: #495057;">${formatDurationSummary(row)}</div>`
            },
            {
                field: 'needed_date',
                label: 'İhtiyaç Tarihi',
                sortable: true,
                formatter: (value, row) => {
                    if (!value) return '-';
                    const time = row.needed_time ? ` ${row.needed_time.substring(0, 5)}` : '';
                    return `<div style="color: #6c757d; font-weight: 500;">${formatDate(value)}${time}</div>`;
                }
            },
            {
                field: 'estimated_cost',
                label: 'Tahmini Maliyet',
                sortable: false,
                formatter: (value, row) => `<div style="color: #495057; font-weight: 600;">${formatMoney(value, row.estimated_cost_currency)}</div>`
            },
            {
                field: 'actual_cost',
                label: 'Fiili Maliyet',
                sortable: false,
                formatter: (value, row) => {
                    if (value === null || value === undefined) return '<span style="color:#adb5bd;">-</span>';
                    return `<div style="color: #198754; font-weight: 600;">${formatMoney(value, row.actual_cost_currency)}</div>`;
                }
            },
            {
                field: 'priority',
                label: 'Öncelik',
                sortable: true,
                formatter: (value) => renderPriorityBadge(value)
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value, row) => renderStatusBadge(value, row.status_label)
            },
            {
                field: 'created_at',
                label: 'Oluşturulma',
                sortable: true,
                type: 'date'
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
                key: 'complete',
                label: 'Tamamla (Fiili Değer Gir)',
                icon: 'fas fa-flag-checkered',
                class: 'btn-outline-success',
                onClick: (row) => showCompleteModal(row),
                visible: (row) => row.status === 'approved' && myPermissions.can_complete
            },
            {
                key: 'cancel',
                label: 'İptal Et',
                icon: 'fas fa-ban',
                class: 'btn-outline-danger',
                onClick: (row) => showCancelConfirmation(row),
                visible: (row) => row.status === 'submitted' && row.requestor === currentUser.id
            }
        ],
        pagination: true,
        itemsPerPage: 20,
        serverSidePagination: true,
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
        emptyMessage: 'Vinç talebi bulunamadı.',
        emptyIcon: 'fas fa-truck-pickup'
    });
}

async function loadRequests() {
    if (isLoading) return;

    try {
        isLoading = true;
        requestsTable.setLoading(true);

        const sortField = currentSortField === 'request_number' ? 'id' : currentSortField;
        const filters = {
            page: currentPage,
            page_size: 20,
            ordering: currentSortDirection === 'asc' ? sortField : `-${sortField}`
        };

        if (craneFilters) {
            const filterValues = craneFilters.getFilterValues();
            if (filterValues['status-filter']) filters.status = filterValues['status-filter'];
            if (filterValues['crane-type-filter']) filters.crane_type = filterValues['crane-type-filter'];
            if (filterValues['job-no-filter']) filters.job_no = filterValues['job-no-filter'];
            if (filterValues['priority-filter']) filters.priority = filterValues['priority-filter'];
            if (filterValues['requestor-filter']) filters.requestor = filterValues['requestor-filter'];
        }

        const response = await getCraneRequests(filters);

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

        requestsTable.updateData(requests, totalRequests, currentPage);
    } catch (error) {
        console.error('Error loading crane requests:', error);
        requests = [];
        totalRequests = 0;
        requestsTable.updateData([], 0, 1);
        showNotification('Talepler yüklenirken hata oluştu: ' + error.message, 'error');
    } finally {
        isLoading = false;
        requestsTable.setLoading(false);
    }
}

// ============================================================
// Create modal
// ============================================================

function showCreateModal() {
    currentRequest = null;
    createModal.clearAll();
    createModal.setTitle('Yeni Vinç Talebi');
    createModal.setSaveButtonText('Oluştur');

    createModal.addSection({
        id: 'equipment-section',
        title: 'Ekipman ve Süre',
        icon: 'fas fa-truck-pickup',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'crane_type',
                name: 'crane_type',
                label: 'Ekipman',
                type: 'dropdown',
                value: '',
                required: true,
                searchable: true,
                placeholder: 'Vinç / platform seçin',
                colSize: 12,
                options: craneTypes.map(t => ({
                    value: t.id,
                    label: `${t.category_label} · ${t.name}`
                })),
                helpText: 'Kiralanacak vinç veya platform tipi'
            },
            {
                id: 'pricing_option',
                name: 'pricing_option',
                label: 'Süre / Fiyatlandırma',
                type: 'select',
                value: '',
                required: true,
                colSize: 6,
                options: [],
                placeholder: 'Önce ekipman seçin',
                helpText: 'Seçilen ekipmanın sunduğu süre seçenekleri'
            },
            {
                id: 'days',
                name: 'days',
                label: 'Gün Sayısı',
                type: 'number',
                value: 1,
                required: false,
                min: 1,
                colSize: 6,
                helpText: 'Günlük kiralamada gün sayısı'
            },
            {
                id: 'needs_rigger',
                name: 'needs_rigger',
                label: 'İlave sapancı istiyorum',
                type: 'checkbox',
                value: false,
                colSize: 12
            }
        ]
    });

    createModal.addSection({
        id: 'job-section',
        title: 'İş ve Zamanlama',
        icon: 'fas fa-clipboard-list',
        iconColor: 'text-success',
        fields: [
            {
                id: 'job_no',
                name: 'job_no',
                label: 'İş Emri',
                type: 'dropdown',
                value: '',
                required: true,
                searchable: true,
                placeholder: 'İş no seçin',
                colSize: 12,
                options: jobOrderDropdownOptions.map(j => ({
                    value: j.job_no,
                    label: `${j.job_no} - ${j.title}`
                })),
                helpText: 'Kiralama maliyetinin işleneceği iş emri'
            },
            {
                id: 'needed_date',
                name: 'needed_date',
                label: 'İhtiyaç Tarihi',
                type: 'date',
                value: '',
                required: true,
                colSize: 6
            },
            {
                id: 'needed_time',
                name: 'needed_time',
                label: 'Saat',
                type: 'time',
                value: '',
                required: false,
                colSize: 6
            },
            {
                id: 'location',
                name: 'location',
                label: 'Konum / Saha',
                type: 'text',
                value: '',
                required: false,
                colSize: 12,
                placeholder: 'Örn: Saha 2, montaj alanı',
                helpText: 'Vincin çalışacağı yer (opsiyonel)'
            },
            {
                id: 'priority',
                name: 'priority',
                label: 'Öncelik',
                type: 'select',
                value: 'normal',
                required: false,
                colSize: 6,
                options: priorityOptions
            },
            {
                id: 'description',
                name: 'description',
                label: 'Açıklama',
                type: 'textarea',
                value: '',
                required: false,
                colSize: 12,
                rows: 3,
                helpText: 'Yapılacak iş hakkında kısa açıklama (opsiyonel)'
            },
            {
                id: 'files',
                name: 'files',
                label: 'Dosyalar',
                type: 'file',
                required: false,
                accept: '*/*',
                multiple: true,
                colSize: 12,
                helpText: 'Ek dosyalar (opsiyonel)'
            }
        ]
    });

    createModal.onSaveCallback(async (formData) => {
        await handleCreateRequest(formData);
    });

    createModal.render();
    createModal.show();

    // Wire dynamic behavior after dropdowns initialize (EditModal defers dropdown init ~100ms)
    setTimeout(() => setupCreateModalDynamics(), 250);
}

function setupCreateModalDynamics() {
    const container = createModal.container;

    // Insert the live estimate panel at the end of the modal body
    const modalBody = container.querySelector('.modal-body');
    if (modalBody && !modalBody.querySelector('#crane-estimate-panel')) {
        const panel = document.createElement('div');
        panel.id = 'crane-estimate-panel';
        panel.innerHTML = renderEstimatePanel(null);
        modalBody.appendChild(panel);
    }

    // Type selection drives pricing options + field visibility + estimate
    const typeDropdownContainer = container.querySelector('#dropdown-crane_type');
    if (typeDropdownContainer) {
        typeDropdownContainer.addEventListener('dropdown:select', () => {
            applyTypeSelection();
            updateEstimatePanel();
        });
    }

    // Any other change refreshes the estimate
    container.addEventListener('change', updateEstimatePanel);
    container.addEventListener('input', updateEstimatePanel);

    // Initial state: hide days/rigger until a type is chosen
    applyTypeSelection();
}

function getCreateFieldGroup(fieldId) {
    return createModal.container.querySelector(`[data-field-id="${fieldId}"]`);
}

function applyTypeSelection() {
    const typeId = createModal.getFieldValue('crane_type');
    const type = getTypeById(typeId);
    const pricingSelect = getCreateFieldGroup('pricing_option')?.querySelector('select.field-input');
    const daysGroup = getCreateFieldGroup('days');
    const riggerGroup = getCreateFieldGroup('needs_rigger');

    if (!pricingSelect) return;

    const previous = pricingSelect.value;
    pricingSelect.innerHTML = '';

    const addOption = (value, label) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        pricingSelect.appendChild(opt);
    };

    if (!type) {
        addOption('', 'Önce ekipman seçin');
        if (daysGroup) daysGroup.style.display = 'none';
        if (riggerGroup) riggerGroup.style.display = 'none';
        return;
    }

    const rate = type.current_rate;
    const available = [];
    if (rate?.price_up_to_3h != null) available.push('up_to_3h');
    if (rate?.price_up_to_8h != null) available.push('up_to_8h');
    if (rate?.price_per_day != null) available.push('daily');

    if (available.length === 0) {
        addOption('', 'Bu ekipman için fiyat tanımlı değil');
    } else {
        available.forEach(optionKey => addOption(optionKey, PRICING_OPTION_LABELS[optionKey]));
        pricingSelect.value = available.includes(previous) ? previous : available[0];
    }

    const isPlatform = isPlatformType(type);
    if (daysGroup) daysGroup.style.display = isPlatform ? '' : 'none';
    if (riggerGroup) riggerGroup.style.display = (!isPlatform && rate?.rigger_fee != null) ? '' : 'none';
}

function collectEstimateInputs() {
    const typeId = createModal.getFieldValue('crane_type');
    const type = getTypeById(typeId);
    const pricingSelect = getCreateFieldGroup('pricing_option')?.querySelector('select.field-input');
    const pricingOption = pricingSelect ? pricingSelect.value : null;
    const days = parseInt(createModal.getFieldValue('days'), 10) || 1;
    const needsRigger = createModal.getFieldValue('needs_rigger') === true;
    return { type, pricingOption, days, needsRigger };
}

function renderEstimatePanel(estimate) {
    const linesHtml = estimate
        ? estimate.lines.map(line => `
            <div class="d-flex justify-content-between" style="font-size: 0.9rem; color: #495057;">
                <span>${line.label}</span>
                <span>${formatMoney(line.amount, '')}</span>
            </div>
        `).join('')
        : '<div style="color: #6c757d; font-size: 0.9rem;">Ekipman ve süre seçtiğinizde tahmini maliyet burada görünür.</div>';

    const totalHtml = estimate
        ? `<div class="d-flex justify-content-between mt-2 pt-2" style="border-top: 1px solid #dee2e6; font-weight: 700; color: #0d6efd;">
               <span>Tahmini Toplam</span>
               <span>${formatMoney(estimate.total, estimate.currency)}</span>
           </div>
           <div style="font-size: 0.75rem; color: #6c757d; margin-top: 0.25rem;">Fiyat listesine göre tahmindir; KDV hariçtir. Kesin tutar tamamlanınca girilir.</div>`
        : '';

    return `
        <div class="mt-3 p-3" style="background: rgba(13, 110, 253, 0.05); border: 1px solid rgba(13, 110, 253, 0.2); border-radius: 8px;">
            <h6 class="mb-2" style="color: #0d6efd;"><i class="fas fa-calculator me-2"></i>Tahmini Maliyet</h6>
            ${linesHtml}
            ${totalHtml}
        </div>
    `;
}

function updateEstimatePanel() {
    const panel = createModal.container.querySelector('#crane-estimate-panel');
    if (!panel) return;
    const { type, pricingOption, days, needsRigger } = collectEstimateInputs();
    const estimate = type && pricingOption
        ? computeCraneEstimate(type, pricingOption, days, needsRigger)
        : null;
    panel.innerHTML = renderEstimatePanel(estimate);
}

async function handleCreateRequest(formData) {
    try {
        const pricingSelect = getCreateFieldGroup('pricing_option')?.querySelector('select.field-input');
        const pricingOption = pricingSelect ? pricingSelect.value : formData.pricing_option;

        if (!formData.crane_type) {
            showNotification('Lütfen bir ekipman seçin', 'error');
            throw new Error('validation');
        }
        if (!pricingOption) {
            showNotification('Lütfen süre / fiyatlandırma seçin', 'error');
            throw new Error('validation');
        }
        if (!formData.job_no) {
            showNotification('Lütfen iş emri seçin', 'error');
            throw new Error('validation');
        }
        if (!formData.needed_date) {
            showNotification('Lütfen ihtiyaç tarihini seçin', 'error');
            throw new Error('validation');
        }

        const fileInput = createModal.container.querySelector('input[type="file"]');
        const uploadedFiles = fileInput ? Array.from(fileInput.files) : [];

        const requestData = {
            crane_type: formData.crane_type,
            pricing_option: pricingOption,
            job_no: formData.job_no,
            days: parseInt(formData.days, 10) || 1,
            needs_rigger: formData.needs_rigger === true,
            needed_date: formData.needed_date,
            needed_time: formData.needed_time || null,
            location: formData.location || '',
            description: formData.description || '',
            priority: formData.priority || 'normal',
            files: uploadedFiles
        };

        const result = await createCraneRequest(requestData);
        showNotification(`Vinç talebi oluşturuldu: ${result.request_number}`, 'success');
        createModal.hide();
        currentPage = 1;
        await loadRequests();
    } catch (error) {
        console.error('Error creating crane request:', error);
        if (error.message !== 'validation') {
            showNotification('Talep oluşturulurken hata oluştu: ' + error.message, 'error');
        }
        throw error; // keep the modal open
    }
}

// ============================================================
// Details modal
// ============================================================

async function viewRequestDetails(requestId) {
    try {
        currentRequest = await getCraneRequest(requestId);
        showRequestDetailsModal(currentRequest);

        const url = new URL(window.location);
        url.searchParams.set('request', requestId);
        window.history.pushState({}, '', url);
    } catch (error) {
        console.error('Error viewing request details:', error);
        showNotification('Talep detayları yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

function renderApprovalChain(request) {
    const approval = request.approval;
    if (!approval || !approval.stage_instances || approval.stage_instances.length === 0) {
        return '<div style="color: #6c757d;">Onay akışı bulunamadı.</div>';
    }

    return approval.stage_instances.map(stage => {
        let icon = '<i class="fas fa-hourglass-half text-warning me-2"></i>';
        if (stage.is_rejected) {
            icon = '<i class="fas fa-times-circle text-danger me-2"></i>';
        } else if (stage.is_complete) {
            icon = '<i class="fas fa-check-circle text-success me-2"></i>';
        }

        const approverNames = (stage.approvers || [])
            .map(a => a.full_name || a.username)
            .join(', ');

        const decisions = (stage.decisions || []).map(d => {
            const decisionIcon = d.decision === 'approve'
                ? '<i class="fas fa-check text-success me-1"></i>'
                : '<i class="fas fa-times text-danger me-1"></i>';
            const who = d.approver_detail ? (d.approver_detail.full_name || d.approver_detail.username) : '—';
            const when = d.decided_at ? ` · ${formatDateTime(d.decided_at)}` : '';
            const comment = d.comment ? ` — "${d.comment}"` : '';
            return `<div style="font-size: 0.85rem; color: #6c757d; margin-left: 1.5rem;">${decisionIcon}${who}${when}${comment}</div>`;
        }).join('');

        return `
            <div class="mb-2">
                <div style="font-weight: 600; color: #212529;">${icon}${stage.order}. ${stage.name}
                    <span style="font-weight: 400; color: #6c757d; font-size: 0.85rem;">(${stage.approved_count || 0}/${stage.required_approvals} onay)</span>
                </div>
                ${approverNames ? `<div style="font-size: 0.85rem; color: #6c757d; margin-left: 1.5rem;"><i class="fas fa-users me-1"></i>${approverNames}</div>` : ''}
                ${decisions}
            </div>
        `;
    }).join('');
}

function renderEstimateBreakdownRows(request) {
    const breakdown = request.estimate_breakdown || {};
    const rows = [];
    ['base', 'transport', 'rigger'].forEach(key => {
        const entry = breakdown[key];
        if (entry && entry.amount !== undefined) {
            rows.push(`
                <div class="d-flex justify-content-between" style="font-size: 0.9rem; color: #495057;">
                    <span>${entry.label || key}</span>
                    <span>${formatMoney(entry.amount, '')}</span>
                </div>
            `);
        }
    });
    return rows.join('');
}

function showRequestDetailsModal(request) {
    detailsModal.clearData();

    const statusInfo = getCraneStatusInfo(request.status);
    const generalHtml = `
        <div class="row">
            <div class="col-md-6">
                <h6 class="text-primary mb-3"><i class="fas fa-info-circle me-2"></i>Genel Bilgiler</h6>
                <div class="row g-2">
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-hashtag me-1"></i>Talep No:</label>
                        <div class="field-value">${request.request_number}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-user me-1"></i>Talep Eden:</label>
                        <div class="field-value">${request.requestor_full_name || request.requestor_username || '-'}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-building me-1"></i>Departman:</label>
                        <div class="field-value">${request.department || '-'}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-info me-1"></i>Durum:</label>
                        <div class="field-value"><span class="status-badge ${statusInfo.class}">${request.status_label || statusInfo.label}</span></div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-flag me-1"></i>Öncelik:</label>
                        <div class="field-value">${renderPriorityBadge(request.priority)}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-calendar-plus me-1"></i>Oluşturulma:</label>
                        <div class="field-value">${formatDateTime(request.created_at)}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-barcode me-1"></i>Ürün Kodu:</label>
                        <div class="field-value"><code>${request.procurement_item_code || '-'}</code></div>
                    </div></div>
                </div>
            </div>
            <div class="col-md-6">
                <h6 class="text-primary mb-3"><i class="fas fa-truck-pickup me-2"></i>Kiralama Bilgileri</h6>
                <div class="row g-2">
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-truck-pickup me-1"></i>Ekipman:</label>
                        <div class="field-value">${request.crane_type_name || '-'}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-briefcase me-1"></i>İş Emri:</label>
                        <div class="field-value" style="font-weight: 600;">${request.job_no || '-'}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-clock me-1"></i>Süre:</label>
                        <div class="field-value">${formatDurationSummary(request)}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-calendar me-1"></i>İhtiyaç Tarihi:</label>
                        <div class="field-value">${formatDate(request.needed_date)}${request.needed_time ? ' ' + request.needed_time.substring(0, 5) : ''}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-map-marker-alt me-1"></i>Konum:</label>
                        <div class="field-value">${request.location || '-'}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2">
                        <label class="field-label mb-1"><i class="fas fa-align-left me-1"></i>Açıklama:</label>
                        <div class="field-value" style="white-space: pre-wrap; word-wrap: break-word;">${request.description || '-'}</div>
                    </div></div>
                </div>
            </div>
        </div>
    `;

    detailsModal.addSection({ title: '', icon: '', iconColor: 'text-primary' });
    detailsModal.addCustomContent(generalHtml);

    // Cost section
    const actualHtml = request.actual_cost !== null && request.actual_cost !== undefined ? `
        <div class="col-md-6">
            <h6 class="text-success mb-2"><i class="fas fa-receipt me-2"></i>Fiili</h6>
            <div class="d-flex justify-content-between" style="font-size: 0.9rem; color: #495057;">
                <span>Fiili Miktar (saat/gün)</span><span>${request.actual_quantity ?? '-'}</span>
            </div>
            <div class="d-flex justify-content-between mt-2 pt-2" style="border-top: 1px solid #dee2e6; font-weight: 700; color: #198754;">
                <span>Fiili Maliyet</span><span>${formatMoney(request.actual_cost, request.actual_cost_currency)}</span>
            </div>
            <div style="font-size: 0.8rem; color: #6c757d; margin-top: 0.25rem;">
                ${request.completed_by_username ? `Giren: ${request.completed_by_username}` : ''}
                ${request.completed_at ? ` · ${formatDateTime(request.completed_at)}` : ''}
            </div>
        </div>
    ` : '';

    const costHtml = `
        <div class="row mt-2">
            <div class="col-md-6">
                <h6 class="text-primary mb-2"><i class="fas fa-calculator me-2"></i>Tahmini</h6>
                ${renderEstimateBreakdownRows(request)}
                <div class="d-flex justify-content-between mt-2 pt-2" style="border-top: 1px solid #dee2e6; font-weight: 700; color: #0d6efd;">
                    <span>Tahmini Toplam</span><span>${formatMoney(request.estimated_cost, request.estimated_cost_currency)}</span>
                </div>
                <div style="font-size: 0.75rem; color: #6c757d; margin-top: 0.25rem;">KDV hariç, fiyat listesine göre.</div>
            </div>
            ${actualHtml}
        </div>
    `;

    detailsModal.addSection({ title: 'Maliyet', icon: 'fas fa-lira-sign', iconColor: 'text-success' });
    detailsModal.addCustomContent(costHtml);

    // Rejection reason
    if (request.status === 'rejected' && request.rejection_reason) {
        detailsModal.addSection({ title: 'Reddetme Gerekçesi', icon: 'fas fa-times-circle', iconColor: 'text-danger' });
        detailsModal.addCustomContent(`<div style="color: #dc3545; white-space: pre-wrap;">${request.rejection_reason}</div>`);
    }

    // Approval chain
    detailsModal.addSection({ title: 'Onay Akışı', icon: 'fas fa-route', iconColor: 'text-primary' });
    detailsModal.addCustomContent(`<div class="mt-2">${renderApprovalChain(request)}</div>`);

    // Files
    detailsModal.addSection({ title: 'Dosya Ekleri', icon: 'fas fa-paperclip', iconColor: 'text-info' });
    detailsModal.addCustomContent('<div id="crane-request-files-container" class="mt-3"></div>');

    detailsModal.render();

    // Footer buttons by status/permission
    const modalFooter = detailsModal.container.querySelector('.modal-footer');
    if (modalFooter) {
        const buttons = ['<button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="fas fa-times me-1"></i>Kapat</button>'];
        if (request.status === 'submitted' && request.requestor === currentUser.id) {
            buttons.push('<button type="button" class="btn btn-danger" id="cancel-crane-request-btn"><i class="fas fa-ban me-1"></i>İptal Et</button>');
        }
        if (request.can_complete) {
            buttons.push('<button type="button" class="btn btn-success" id="complete-crane-request-btn"><i class="fas fa-flag-checkered me-1"></i>Tamamla</button>');
        }
        modalFooter.innerHTML = `<div class="d-flex justify-content-end gap-2">${buttons.join('')}</div>`;

        const cancelBtn = modalFooter.querySelector('#cancel-crane-request-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => showCancelConfirmation(request));
        }
        const completeBtn = modalFooter.querySelector('#complete-crane-request-btn');
        if (completeBtn) {
            completeBtn.addEventListener('click', () => showCompleteModal(request));
        }
    }

    detailsModal.show();

    // Files component
    setTimeout(() => {
        const filesContainer = document.getElementById('crane-request-files-container');
        if (filesContainer) {
            const fileAttachments = new FileAttachments('crane-request-files-container', {
                title: '',
                layout: 'grid',
                showTitle: false,
                onFileClick: (file) => {
                    const fileName = file.file_name ? file.file_name.split('/').pop() : 'Dosya';
                    const fileExtension = fileName.split('.').pop().toLowerCase();
                    const viewer = new FileViewer();
                    viewer.setDownloadCallback(async () => {
                        await viewer.downloadFile(file.file_url, fileName);
                    });
                    viewer.openFile(file.file_url, fileName, fileExtension);
                }
            });
            fileAttachments.setFiles(request.files || []);
        }
    }, 100);
}

// ============================================================
// Complete + cancel
// ============================================================

function showCompleteModal(requestRow) {
    currentRequest = requestRow;
    const type = getTypeById(requestRow.crane_type);
    const isPlatform = requestRow.crane_type_category
        ? PLATFORM_CATEGORIES.includes(requestRow.crane_type_category)
        : isPlatformType(type);
    const quantityLabel = isPlatform ? 'Fiili Gün Sayısı' : 'Fiili Saat';

    completeModal.clearAll();
    completeModal.setTitle(`Talebi Tamamla — ${requestRow.request_number}`);
    completeModal.setSaveButtonText('Tamamla ve Maliyeti İşle');

    completeModal.addSection({
        id: 'actuals-section',
        title: 'Fiili Değerler',
        icon: 'fas fa-receipt',
        iconColor: 'text-success',
        fields: [
            {
                id: 'actual_quantity',
                name: 'actual_quantity',
                label: quantityLabel,
                type: 'number',
                value: requestRow.pricing_option === 'daily' ? (requestRow.days || 1) : '',
                required: false,
                min: 0,
                step: 0.5,
                colSize: 12,
                helpText: 'Vinç için çalışılan saat, platform için gün'
            },
            {
                id: 'actual_cost',
                name: 'actual_cost',
                label: 'Fiili Maliyet (fatura tutarı, KDV hariç)',
                type: 'number',
                value: requestRow.estimated_cost || '',
                required: true,
                min: 0,
                step: 0.01,
                colSize: 8,
                helpText: 'Tahmini tutar önerilir; tedarikçi faturasına göre düzeltin'
            },
            {
                id: 'actual_cost_currency',
                name: 'actual_cost_currency',
                label: 'Para Birimi',
                type: 'select',
                value: requestRow.estimated_cost_currency || 'TRY',
                required: false,
                colSize: 4,
                options: [
                    { value: 'TRY', label: 'TRY' },
                    { value: 'EUR', label: 'EUR' },
                    { value: 'USD', label: 'USD' }
                ]
            }
        ]
    });

    completeModal.onSaveCallback(async (formData) => {
        try {
            if (formData.actual_cost === '' || formData.actual_cost === null || formData.actual_cost === undefined) {
                showNotification('Fiili maliyet zorunludur', 'error');
                throw new Error('validation');
            }
            await completeCraneRequest(currentRequest.id, {
                actual_quantity: formData.actual_quantity !== '' ? formData.actual_quantity : null,
                actual_cost: formData.actual_cost,
                actual_cost_currency: formData.actual_cost_currency || 'TRY'
            });
            showNotification('Talep tamamlandı; maliyet iş emrine işlendi', 'success');
            completeModal.hide();
            detailsModal.hide();
            await loadRequests();
        } catch (error) {
            console.error('Error completing crane request:', error);
            if (error.message !== 'validation') {
                showNotification('Talep tamamlanırken hata oluştu: ' + error.message, 'error');
            }
            throw error;
        }
    });

    completeModal.render();
    completeModal.show();
}

function showCancelConfirmation(requestRow) {
    currentRequest = requestRow;
    cancelModal.show({
        message: `${requestRow.request_number} numaralı vinç talebini iptal etmek istediğinizden emin misiniz?`,
        onConfirm: async () => {
            try {
                await cancelCraneRequest(requestRow.id);
                showNotification('Vinç talebi iptal edildi', 'success');
                detailsModal.hide();
                await loadRequests();
            } catch (error) {
                showNotification('Talep iptal edilirken hata oluştu: ' + error.message, 'error');
                throw error;
            }
        }
    });
}
