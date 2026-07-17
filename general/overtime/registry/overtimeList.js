import { initNavbar } from '../../../components/navbar.js';
import {
    fetchOvertimeRequests,
    fetchOvertimeRequest,
    createOvertimeRequest,
    updateOvertimeRequest,
    cancelOvertimeRequest,
    formatOvertimeDuration,
    canCancelOvertime,
    canResubmitOvertime,
    validateOvertimeRequest,
    getOperationsForJob,
    getMachiningOperators
} from '../../../apis/overtime.js';
import { fetchAllUsers } from '../../../apis/users.js';
import { formatDateTime } from '../../../apis/formatters.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { ModernDropdown } from '../../../components/dropdown/dropdown.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { getJobOrderDropdown } from '../../../apis/projects/jobOrders.js';
import { 
    initializeModalComponents, 
    showOvertimeDetailsModal, 
    setupModalEventListeners,
    setGlobalVariables 
} from '../pending/modals.js';

// Global variables
let currentOvertimeRequests = [];
let currentFilters = {};
let currentPage = 1;
let itemsPerPage = 20;
let selectedOvertimeRequest = null;
let currentUser = null;
let allUsers = [];
let overtimeTable = null; // TableComponent instance
let userDropdowns = new Map(); // Store dropdown references
let jobOrderDropdowns = new Map(); // Store job order dropdown references
let operationDropdowns = new Map(); // Store per-participant operation multi-selects
let jobOrderDropdownOptions = []; // Array of { job_no, title }
let machiningOperatorIds = new Set(); // User ids in the machining team
let editingRequestId = null; // When set, the create modal is in resubmit/edit mode
let cancelOvertimeModal = null; // DisplayModal instance for cancel
let createOvertimeModal = null; // EditModal instance for create

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    initNavbar();
    
    // Get current user info from localStorage or session
    const userData = localStorage.getItem('user');
    if (userData) {
        currentUser = JSON.parse(userData);
    }
    
    // Initialize header component
    new HeaderComponent({
        title: 'Mesai Talepleri',
        subtitle: 'Mesai talepleri takibi ve yönetimi',
        icon: 'clock',
        showBackButton: 'block',
        showCreateButton: 'block',
        showExportButton: 'none',
        showRefreshButton: 'none',
        createButtonText: 'Yeni Mesai Talebi',
        onBackClick: () => window.location.href = '/general/overtime',
        onCreateClick: () => showCreateOvertimeModal()
    });
    
    // Check for request ID in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('request');
    
    if (requestId) {
        // Store the request ID to show modal after data loads
        window.pendingRequestId = requestId;
    }
    
    // Initialize modal components
    initializeModalComponents();
    setupModalEventListeners();
    
    // Set global variables for modals
    setGlobalVariables({
        currentRequest: null,
        requests: currentOvertimeRequests,
        loadRequests: loadOvertimeRequests,
        loadApprovedRequests: () => {}, // Not needed for registry
    });
    
    // Initialize cancel overtime modal
    initializeCancelModal();
    
    // Initialize create overtime modal
    initializeCreateModal();
    
    // Initialize statistics cards component
    window.overtimeStats = new StatisticsCards('overtime-statistics', {
        cards: [
            {
                title: 'Toplam Talep',
                value: '0',
                icon: 'fas fa-clock',
                color: 'primary',
                trend: null
            },
            {
                title: 'Bekleyen Talepler',
                value: '0',
                icon: 'fas fa-hourglass-half',
                color: 'warning',
                trend: null
            },
            {
                title: 'Onaylanan',
                value: '0',
                icon: 'fas fa-check-circle',
                color: 'success',
                trend: null
            },
            {
                title: 'Toplam Mesai Saati',
                value: '0 saat',
                icon: 'fas fa-business-time',
                color: 'info',
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
            loadOvertimeRequests();
        },
        onClear: () => {
            currentFilters = {};
            currentPage = 1;
            loadOvertimeRequests();
        }
    }).addSelectFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'submitted', label: 'Bekliyor' },
            { value: 'approved', label: 'Onaylandı' },
            { value: 'rejected', label: 'Reddedildi' },
            { value: 'cancelled', label: 'İptal Edildi' }
        ],
        colSize: 2
    }).addSelectFilter({
        id: 'team-filter',
        label: 'Takım',
        options: [
            { value: '',               label: 'Tümü' },
            { value: 'machining',      label: 'Talaşlı İmalat' },
            { value: 'design',         label: 'Dizayn' },
            { value: 'logistics',      label: 'Lojistik' },
            { value: 'procurement',    label: 'Satın Alma' },
            { value: 'welding',        label: 'Kaynaklı İmalat' },
            { value: 'planning',       label: 'Planlama' },
            { value: 'manufacturing',  label: 'İmalat' },
            { value: 'maintenance',    label: 'Bakım' },
            { value: 'qualitycontrol', label: 'Kalite Kontrol' },
            { value: 'cutting',        label: 'CNC Kesim' },
            { value: 'warehouse',      label: 'Ambar' },
            { value: 'finance',        label: 'Finans' },
            { value: 'management',     label: 'Yönetim' },
            { value: 'sales',          label: 'Proje Taahhüt' },
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
    }).addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'Neden, iş no, açıklama...',
        colSize: 2
    });
    
    // Initialize table component
    initializeTableComponent();
    
    // Load initial data
    loadInitialData();
    
    // Add event listeners
    addEventListeners();
});

// Initialize TableComponent
function initializeTableComponent() {
    overtimeTable = new TableComponent('overtime-table-container', {
        title: 'Mesai Talepleri',
        columns: [
            {
                field: 'id',
                label: 'Talep No',
                sortable: true,
                formatter: (value) => `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value || '-'}</span>`
            },
            {
                field: 'requester_username',
                label: 'Talep Eden',
                sortable: true,
                formatter: (value, row) => {
                    if (typeof value === 'undefined' || value === null) {
                        return 'Bilinmiyor';
                    }
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return value;
                    }
                    return `
                        <div style="font-weight: 500; color: #495057;">
                            <i class="fas fa-user-circle me-2 text-muted"></i>
                            ${value}
                        </div>
                    `;
                }
            },
            {
                field: 'team_label',
                label: 'Departman',
                sortable: true,
                formatter: (value, row) => {
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return value || '-';
                    }
                    return `
                        <div style="color: #495057; font-weight: 500;">${value || '-'}</div>
                    `;
                }
            },
            {
                field: 'start_at',
                label: 'Başlangıç',
                sortable: true,
                type: 'date'
            },
            {
                field: 'end_at',
                label: 'Bitiş',
                sortable: true,
                type: 'date'
            },
            {
                field: 'duration_hours',
                label: 'Süre',
                sortable: true,
                formatter: (value, row) => {
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return formatOvertimeDuration(value);
                    }
                    return `
                        <div style="color: #495057; font-weight: 500;">${formatOvertimeDuration(value)}</div>
                    `;
                }
            },
            {
                field: 'total_users',
                label: 'Katılımcı',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${value || 0} kişi</div>
                `
            },
            {
                field: 'approval',
                label: 'Onay Durumu',
                sortable: false,
                formatter: (value, row) => getApprovalInfo(row)
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value, row) => {
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return row.status_label || value || '-';
                    }
                    return renderStatusBadge(value, row.status_label);
                }
            },
            {
                field: 'created_at',
                label: 'Oluşturulma',
                sortable: true,
                type: 'date'
            }
        ],
        data: [],
        sortable: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        refreshable: true,
        exportable: true,
        onRefresh: async () => {
            currentPage = 1;
            await loadOvertimeRequests();
        },
        onSort: async (field, direction) => {
            currentPage = 1;
            await loadOvertimeRequests();
        },
        onPageChange: async (page) => {
            currentPage = page;
            await loadOvertimeRequests();
        },
        onPageSizeChange: async (newPageSize) => {
            // Update local variable to keep in sync
            itemsPerPage = newPageSize;
            // Ensure table component also has the correct value (should already be set, but ensure sync)
            if (overtimeTable) {
                overtimeTable.options.itemsPerPage = newPageSize;
            }
            // Reset to page 1 and load with new page size
            currentPage = 1;
            await loadOvertimeRequests();
        },
        actions: [
            {
                key: 'view',
                label: 'Detayları Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    viewOvertimeDetails(row.id);
                }
            },
            {
                key: 'resubmit',
                label: 'Düzenle & Gönder',
                icon: 'fas fa-redo',
                class: 'btn-outline-warning',
                visible: (row) => canResubmitOvertime(row, currentUser?.id),
                onClick: (row) => {
                    openResubmitOvertimeModal(row.id);
                }
            },
            {
                key: 'cancel',
                label: 'İptal Et',
                icon: 'fas fa-ban',
                class: 'btn-outline-danger',
                visible: (row) => canCancelOvertime(row, currentUser?.id),
                onClick: (row) => {
                    showCancelOvertimeModal(row.id);
                }
            }
        ],
        emptyMessage: 'Henüz mesai talebi bulunmamaktadır',
        emptyIcon: 'fas fa-inbox',
        skeleton: true
    });
}

// Load initial data
async function loadInitialData() {
    try {
        await loadOvertimeRequests();
    } catch (error) {
        showErrorMessage('Veriler yüklenirken hata oluştu.');
    }
}

// Add event listeners
function addEventListeners() {
    
    
    
    // Modal close handling is now managed by the DisplayModal component
}

// Initialize cancel overtime modal
function initializeCancelModal() {
    cancelOvertimeModal = new DisplayModal('cancel-overtime-modal-container', {
        title: 'Mesai Talebini İptal Et',
        icon: 'fas fa-ban',
        size: 'md',
        showEditButton: false
    });
    
    // Set up modal close callback
    cancelOvertimeModal.onCloseCallback(() => {
        window.pendingCancelRequestId = null;
    });
}

// Show cancel overtime modal using DisplayModal
function showCancelOvertimeModal(requestId) {
    const request = currentOvertimeRequests.find(r => r.id === requestId) || selectedOvertimeRequest;
    if (!request) return;
    
    window.pendingCancelRequestId = requestId;
    
    // Clear previous data
    cancelOvertimeModal.clearData();
    
    // Add warning section
    cancelOvertimeModal.addSection({
        title: 'İptal Onayı',
        icon: 'fas fa-exclamation-triangle',
        iconColor: 'text-warning'
    });
    
    // Add warning message
    cancelOvertimeModal.addField({
        id: 'cancel-warning',
        name: 'warning',
        label: 'Uyarı',
        type: 'text',
        value: 'Bu mesai talebini iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
        icon: 'fas fa-exclamation-triangle',
        colSize: 12
    });
    
    // Add request details section
    cancelOvertimeModal.addSection({
        title: 'Talep Detayları',
        icon: 'fas fa-info-circle',
        iconColor: 'text-info'
    });
    
    cancelOvertimeModal.addField({
        id: 'cancel-request-id',
        name: 'request_id',
        label: 'Talep No',
        type: 'text',
        value: `#${request.id}`,
        icon: 'fas fa-hashtag',
        colSize: 6,
        layout: 'horizontal'
    });
    
    cancelOvertimeModal.addField({
        id: 'cancel-start-time',
        name: 'start_time',
        label: 'Başlangıç',
        type: 'text',
        value: formatDateTime(request.start_at),
        icon: 'fas fa-play',
        colSize: 6,
        layout: 'horizontal'
    });
    
    cancelOvertimeModal.addField({
        id: 'cancel-end-time',
        name: 'end_time',
        label: 'Bitiş',
        type: 'text',
        value: formatDateTime(request.end_at),
        icon: 'fas fa-stop',
        colSize: 6,
        layout: 'horizontal'
    });
    
    cancelOvertimeModal.addField({
        id: 'cancel-duration',
        name: 'duration',
        label: 'Süre',
        type: 'text',
        value: formatOvertimeDuration(parseFloat(request.duration_hours)),
        icon: 'fas fa-hourglass-half',
        colSize: 6,
        layout: 'horizontal'
    });
    
    // Render modal
    cancelOvertimeModal.render();
    
    // Add custom footer with action buttons
    const modalFooter = cancelOvertimeModal.container.querySelector('.modal-footer');
    if (modalFooter) {
        modalFooter.innerHTML = `
            <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>Vazgeç
                </button>
                <button type="button" class="btn btn-danger" id="confirm-cancel-overtime-btn">
                    <i class="fas fa-ban me-1"></i>İptal Et
                </button>
            </div>
        `;
    }
    
    // Add event listener for confirm button
    const confirmBtn = cancelOvertimeModal.container.querySelector('#confirm-cancel-overtime-btn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmCancelOvertime);
    }
    
    cancelOvertimeModal.show();
}

// Initialize create overtime modal
function initializeCreateModal() {
    createOvertimeModal = new EditModal('create-overtime-modal-container', {
        title: 'Yeni Mesai Talebi',
        icon: 'fas fa-plus',
        size: 'lg',
        showEditButton: false
    });
    
    // Set up save callback
    createOvertimeModal.onSaveCallback(async (formData) => {
        await submitOvertimeRequest(formData);
    });
}

// Convert an ISO/UTC datetime string to local {date:'YYYY-MM-DD', time:'HH:MM'}.
function isoToLocalParts(iso) {
    if (!iso) return { date: '', time: '' };
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
}

// Open the create modal pre-filled with a rejected/cancelled request to re-submit.
async function openResubmitOvertimeModal(requestId) {
    try {
        const request = await fetchOvertimeRequest(requestId);
        await showCreateOvertimeModal(request);
    } catch (error) {
        showErrorMessage('Talep yüklenirken hata oluştu.');
    }
}

// Show create overtime modal using EditModal.
// When `prefillRequest` is provided the modal is in edit/resubmit mode.
async function showCreateOvertimeModal(prefillRequest = null) {
    if (!createOvertimeModal) {
        return;
    }

    editingRequestId = prefillRequest && prefillRequest.id ? prefillRequest.id : null;
    const start = prefillRequest ? isoToLocalParts(prefillRequest.start_at) : { date: '', time: '' };
    const end = prefillRequest ? isoToLocalParts(prefillRequest.end_at) : { date: '', time: '' };

    // Clear previous data
    createOvertimeModal.clearAll();

    // Clear dropdown references
    userDropdowns.clear();
    jobOrderDropdowns.clear();
    operationDropdowns.clear();

    // Add basic information section
    createOvertimeModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    // Add reason field
    createOvertimeModal.addField({
        id: 'reason',
        name: 'reason',
        label: 'Mesai Nedeni',
        type: 'textarea',
        placeholder: 'Mesai talebinin nedenini açıklayın...',
        required: true,
        icon: 'fas fa-comment',
        colSize: 12,
        value: prefillRequest ? (prefillRequest.reason || '') : '',
        helpText: 'Mesai talebinin nedenini detaylı olarak açıklayın'
    });

    // Add date and time section
    createOvertimeModal.addSection({
        title: 'Tarih ve Saat',
        icon: 'fas fa-calendar',
        iconColor: 'text-info'
    });

    createOvertimeModal.addField({
        id: 'start_date', name: 'start_date', label: 'Başlangıç Tarihi', type: 'date',
        required: true, icon: 'fas fa-calendar-day', colSize: 6, value: start.date
    });
    createOvertimeModal.addField({
        id: 'start_time', name: 'start_time', label: 'Başlangıç Saati', type: 'time',
        required: true, icon: 'fas fa-clock', colSize: 6, value: start.time
    });
    createOvertimeModal.addField({
        id: 'end_date', name: 'end_date', label: 'Bitiş Tarihi', type: 'date',
        required: true, icon: 'fas fa-calendar-day', colSize: 6, value: end.date
    });
    createOvertimeModal.addField({
        id: 'end_time', name: 'end_time', label: 'Bitiş Saati', type: 'time',
        required: true, icon: 'fas fa-clock', colSize: 6, value: end.time
    });

    // Add participants section
    createOvertimeModal.addSection({
        title: 'Katılımcılar',
        icon: 'fas fa-users',
        iconColor: 'text-success'
    });

    // Render modal first
    createOvertimeModal.render();

    // Set modal title depending on mode.
    const titleEl = createOvertimeModal.container.querySelector('.modal-title');
    if (titleEl) {
        titleEl.innerHTML = editingRequestId
            ? '<i class="fas fa-redo me-2"></i>Mesai Talebini Düzenle & Gönder'
            : '<i class="fas fa-plus me-2"></i>Yeni Mesai Talebi';
    }

    // Add participants table inside the Katılımcılar section
    const participantsHtml = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0">Katılımcı Listesi</h6>
            <button type="button" class="btn btn-sm btn-outline-primary" id="add-participant-btn">
                <i class="fas fa-plus me-1"></i>Katılımcı Ekle
            </button>
        </div>
        <div id="participants-container">
            <!-- Participants will be added here -->
        </div>
    `;

    const katilimcilarSection = createOvertimeModal.container.querySelector('[data-section-id*="section"]:last-of-type');
    if (katilimcilarSection) {
        const fieldsContainer = katilimcilarSection.querySelector('.row.g-2');
        if (fieldsContainer) {
            fieldsContainer.insertAdjacentHTML('beforeend', participantsHtml);
        }
    }

    const addParticipantBtn = createOvertimeModal.container.querySelector('#add-participant-btn');
    if (addParticipantBtn) {
        addParticipantBtn.addEventListener('click', () => addParticipant());
    }

    // Load users and job orders for dropdowns
    try {
        await loadUsersForModal();
        await loadJobOrderDropdownOptions();
        // Add participants: one per prefilled entry, or a single empty row.
        setTimeout(() => {
            if (prefillRequest && Array.isArray(prefillRequest.entries) && prefillRequest.entries.length) {
                prefillRequest.entries.forEach(entry => addParticipant({
                    user: entry.user_id,
                    job_no: entry.job_no,
                    description: entry.description || '',
                    operations: (entry.operations || []).map(o => o.key),
                }));
            } else {
                addParticipant();
            }
        }, 100);
    } catch (error) {
        showErrorMessage('Veriler yüklenirken hata oluştu.');
    }

    createOvertimeModal.show();
}



// Load overtime requests
async function loadOvertimeRequests() {
    try {
        if (overtimeTable) {
            overtimeTable.setLoading(true);
        }
        
        // Prepare filters for API call
        const apiFilters = {
            ...currentFilters,
            page: currentPage,
            // Get page size from table component if available, otherwise use local variable
            // This ensures we always use the most up-to-date page size
            page_size: overtimeTable ? overtimeTable.options.itemsPerPage : itemsPerPage
        };
        
        // Convert filter names to API format
        if (apiFilters['status-filter']) {
            apiFilters.status = apiFilters['status-filter'];
            delete apiFilters['status-filter'];
        }
        if (apiFilters['team-filter']) {
            apiFilters.team = apiFilters['team-filter'];
            delete apiFilters['team-filter'];
        }
        if (apiFilters['start-date-filter']) {
            apiFilters.start_date = apiFilters['start-date-filter'];
            delete apiFilters['start-date-filter'];
        }
        if (apiFilters['end-date-filter']) {
            apiFilters.end_date = apiFilters['end-date-filter'];
            delete apiFilters['end-date-filter'];
        }
        if (apiFilters['search-filter']) {
            apiFilters.search = apiFilters['search-filter'];
            delete apiFilters['search-filter'];
        }
        
        const data = await fetchOvertimeRequests(apiFilters);
        currentOvertimeRequests = data.results || data;
        const totalItems = data.count || data.total || currentOvertimeRequests.length;
        
        // Update table with new data
        if (overtimeTable) {
            overtimeTable.updateData(currentOvertimeRequests, totalItems, currentPage);
        }
        
        renderStatistics();
        
        // Check if there's a pending request ID to show modal
        if (window.pendingRequestId) {
            const requestId = parseInt(window.pendingRequestId);
            const request = currentOvertimeRequests.find(r => r.id === requestId);
            
            if (request) {
                // Show the modal for the specified request
                await viewOvertimeDetails(requestId);
                // Clear the pending request ID
                window.pendingRequestId = null;
            } else {
                // Request not found in current data, try to fetch it directly
                try {
                    await viewOvertimeDetails(requestId);
                    window.pendingRequestId = null;
                } catch (error) {
                    showErrorMessage('Belirtilen mesai talebi bulunamadı.');
                    window.pendingRequestId = null;
                }
            }
        }
        
    } catch (error) {
        showErrorMessage('Mesai talepleri yüklenirken hata oluştu.');
        if (overtimeTable) {
            overtimeTable.updateData([], 0, currentPage);
        }
    } finally {
        if (overtimeTable) {
            overtimeTable.setLoading(false);
        }
    }
}

// Table rendering is now handled by TableComponent

// Render status badge
function renderStatusBadge(status, statusLabel) {
    // Map status values to badge colors
    let badgeClass = 'status-grey'; // default
    
    switch (status) {
        case 'approved':
            badgeClass = 'status-green';
            break;
        case 'submitted':
            badgeClass = 'status-yellow';
            break;
        case 'rejected':
            badgeClass = 'status-red';
            break;
        case 'cancelled':
            badgeClass = 'status-red';
            break;
        default:
            badgeClass = 'status-grey';
    }
    
    return `
        <span class="status-badge ${badgeClass}">
            ${statusLabel || status || 'Bilinmiyor'}
        </span>
    `;
}

// Render statistics
function renderStatistics() {
    const totalRequests = currentOvertimeRequests.length;
    const pendingRequests = currentOvertimeRequests.filter(request => request.status === 'submitted').length;
    const approvedRequests = currentOvertimeRequests.filter(request => request.status === 'approved').length;
    const totalHours = currentOvertimeRequests.reduce((sum, request) => sum + parseFloat(request.duration_hours || 0), 0);
    
    // Update statistics cards
    const statsComponent = window.overtimeStats;
    if (statsComponent) {
        statsComponent.updateValues({
            0: totalRequests.toString(),
            1: pendingRequests.toString(),
            2: approvedRequests.toString(),
            3: formatOvertimeDuration(totalHours)
        });
    }
}

// Pagination is now handled by TableComponent

// Load users for modal
async function loadUsersForModal() {
    if (!currentUser) {
        throw new Error('Current user not available');
    }
    allUsers = await fetchAllUsers();

    // Load machining operators once (users with access_machining_tasks) so we
    // know which entries should offer the machining-operation multi-select.
    if (machiningOperatorIds.size === 0) {
        try {
            const machinists = await getMachiningOperators();
            const rows = Array.isArray(machinists) ? machinists : (machinists?.results || []);
            machiningOperatorIds = new Set(rows.map(u => u.id).filter(Boolean));
        } catch (e) {
            console.warn('Could not load machining operators:', e);
            machiningOperatorIds = new Set();
        }
    }
}

// Show/hide loading state for submit button
function showSubmitLoading(show) {
    const submitBtn = document.getElementById('submit-overtime-request');
    const addParticipantBtn = document.getElementById('add-participant');
    const cancelBtn = document.querySelector('#createOvertimeModal .btn-outline-secondary');
    
    if (show) {
        // Show loading state
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Oluşturuluyor...';
        }
        
        if (addParticipantBtn) addParticipantBtn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = true;
    } else {
        // Restore original state
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save me-1"></i>Mesai Talebi Oluştur';
        }
        
        if (addParticipantBtn) addParticipantBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
    }
}

// Add participant to form. `prefill` = { user, job_no, description, operations:[keys] }
function addParticipant(prefill = null) {
    const container = document.getElementById('participants-container');
    if (!container) {
        return;
    }
    const participantIndex = container.children.length;

    const participantHtml = `
        <div class="participant-row mb-3" data-index="${participantIndex}">
            <div class="row g-2">
                <div class="col-md-4">
                    <div class="mb-2">
                        <label class="form-label compact">
                            <i class="fas fa-user me-1"></i>Çalışan *
                        </label>
                        <div class="user-dropdown-container" id="user-dropdown-${participantIndex}"></div>
                        <div class="form-text compact">Mesai talebine katılacak çalışan</div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="mb-2">
                        <label class="form-label compact">
                            <i class="fas fa-hashtag me-1"></i>İş Emri No *
                        </label>
                        <div id="job-no-dropdown-${participantIndex}"></div>
                        <div class="form-text compact">Çalışanın çalışacağı iş emri numarası</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="mb-2">
                        <label class="form-label compact">
                            <i class="fas fa-comment me-1"></i>Açıklama
                        </label>
                        <input type="text" class="form-control form-control-sm" name="description" placeholder="Açıklama">
                        <div class="form-text compact">İş emri için ek açıklama</div>
                    </div>
                </div>
                <div class="col-md-1">
                    <div class="mb-2">
                        <label class="form-label compact">&nbsp;</label>
                        <button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="removeParticipant(${participantIndex})" title="Katılımcıyı Kaldır">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div class="row g-2 operations-row" id="operations-row-${participantIndex}" style="display:none;">
                <div class="col-12">
                    <div class="mb-2">
                        <label class="form-label compact">
                            <i class="fas fa-cogs me-1"></i>Talaşlı İmalat Operasyonları
                        </label>
                        <div id="operations-dropdown-${participantIndex}"></div>
                        <div class="form-text compact">Bu operatörün mesaide çalışacağı operasyonlar (iş emrine göre)</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', participantHtml);

    // Initialize dropdowns for this participant with a small delay to ensure DOM is ready
    setTimeout(() => {
        initializeUserDropdown(participantIndex, prefill);
        initializeJobOrderDropdown(participantIndex, prefill);
        wireParticipantChangeEvents(participantIndex, prefill);
    }, 10);
}

// Listen for user/job selection changes to show & populate the operations select.
function wireParticipantChangeEvents(index, prefill = null) {
    const userContainer = document.getElementById(`user-dropdown-${index}`);
    const jobContainer = document.getElementById(`job-no-dropdown-${index}`);
    const handler = () => maybeShowOperations(index);
    if (userContainer) userContainer.addEventListener('dropdown:select', handler);
    if (jobContainer) jobContainer.addEventListener('dropdown:select', handler);

    // If prefilled, populate operations after the dropdowns settle.
    if (prefill && (prefill.operations?.length || (prefill.user && prefill.job_no))) {
        setTimeout(() => maybeShowOperations(index, prefill.operations || []), 200);
    }
}

// Show/populate operations multi-select when a machining operator + job are chosen.
async function maybeShowOperations(index, preselectKeys = null) {
    const row = document.getElementById(`operations-row-${index}`);
    if (!row) return;

    const userId = parseInt(userDropdowns.get(index)?.getValue());
    const jobNo = jobOrderDropdowns.get(index)?.getValue();
    const isMachinist = userId && machiningOperatorIds.has(userId);

    if (!isMachinist || !jobNo) {
        row.style.display = 'none';
        operationDropdowns.delete(index);
        return;
    }

    row.style.display = '';
    const container = document.getElementById(`operations-dropdown-${index}`);
    if (!container) return;
    container.innerHTML = '';

    const dropdown = new ModernDropdown(container, {
        placeholder: 'Operasyon seçiniz...',
        searchable: true,
        multiple: true,
        maxHeight: 200,
        width: '100%'
    });

    let items = [];
    try {
        items = await getOperationsForJob(jobNo);
    } catch (e) {
        items = [];
    }
    dropdown.setItems(items);
    if (preselectKeys && preselectKeys.length) {
        dropdown.setValue(preselectKeys.filter(k => items.some(it => it.value === k)));
    }
    operationDropdowns.set(index, dropdown);
}

// Initialize user dropdown
function initializeUserDropdown(index, prefill = null) {
    const container = document.getElementById(`user-dropdown-${index}`);
    if (!container) {
        return;
    }

    const dropdown = new ModernDropdown(container, {
        placeholder: 'Çalışan seçiniz...',
        searchable: true
    });

    // Set user options - try ID first, fallback to username
    const userItems = allUsers.map(user => ({
        value: user.id || user.username, // Try ID first, fallback to username
        text: (user.first_name && user.last_name) ?
            `${user.first_name} ${user.last_name}` :
            user.username
    }));

    dropdown.setItems(userItems);

    if (prefill && prefill.user) {
        dropdown.setValue(prefill.user);
    }

    // Store dropdown reference in Map
    userDropdowns.set(index, dropdown);
}

// Load job order dropdown options
async function loadJobOrderDropdownOptions() {
    try {
        jobOrderDropdownOptions = await getJobOrderDropdown();
    } catch (error) {
        console.error('Error loading job order dropdown options:', error);
        jobOrderDropdownOptions = [];
        showErrorMessage('İş emirleri yüklenirken hata oluştu.');
    }
}

// Initialize job order dropdown for a specific participant
function initializeJobOrderDropdown(participantIndex, prefill = null) {
    const container = document.getElementById(`job-no-dropdown-${participantIndex}`);
    if (!container) return;

    // Load options if not already loaded
    if (jobOrderDropdownOptions.length === 0) {
        loadJobOrderDropdownOptions().then(() => {
            setupJobOrderDropdown(container, participantIndex, prefill);
        }).catch(() => {
            // Initialize with empty options if loading fails
            setupJobOrderDropdown(container, participantIndex, prefill);
        });
    } else {
        setupJobOrderDropdown(container, participantIndex, prefill);
    }
}

// Setup the job order dropdown component
function setupJobOrderDropdown(container, participantIndex, prefill = null) {
    // Clear container
    container.innerHTML = '';

    // Create dropdown
    const dropdown = new ModernDropdown(container, {
        placeholder: 'İş emri seçin',
        searchable: true,
        multiple: false,
        maxHeight: 200,
        width: '100%'
    });

    // Convert job orders to dropdown items format
    const dropdownItems = jobOrderDropdownOptions.map(jobOrder => ({
        value: jobOrder.job_no,
        text: `${jobOrder.job_no} - ${jobOrder.title}`
    }));

    dropdown.setItems(dropdownItems);

    if (prefill && prefill.job_no) {
        dropdown.setValue(prefill.job_no);
    }

    // Store dropdown reference in Map
    jobOrderDropdowns.set(participantIndex, dropdown);
}

// Remove participant
function removeParticipant(index) {
    const participantRow = document.querySelector(`.participant-row[data-index="${index}"]`);
    if (participantRow) {
        // Don't remove if it's the only participant
        const container = document.getElementById('participants-container');
        if (container.children.length > 1) {
            // Clean up dropdown references
            userDropdowns.delete(index);
            jobOrderDropdowns.delete(index);
            operationDropdowns.delete(index);
            participantRow.remove();
        } else {
            showErrorMessage('En az bir katılımcı olmalıdır.');
        }
    }
}

// Submit overtime request
async function submitOvertimeRequest(formData) {
    try {
        // Extract form data
        const reason = formData.reason;
        const startDate = formData.start_date;
        const startTime = formData.start_time;
        const endDate = formData.end_date;
        const endTime = formData.end_time;
        
        // Collect participants from the modal
        const participants = [];
        const participantRows = document.querySelectorAll('.participant-row');
        
        for (const row of participantRows) {
            const participantIndex = parseInt(row.dataset.index);
            const descriptionInput = row.querySelector('input[name="description"]');
            
            // Get dropdowns from Maps
            const userDropdown = userDropdowns.get(participantIndex);
            const jobOrderDropdown = jobOrderDropdowns.get(participantIndex);
            
            const userId = userDropdown?.getValue();
            const jobNo = jobOrderDropdown?.getValue();
            const description = descriptionInput?.value?.trim() || '';

            if (!userId || !jobNo) {
                showErrorMessage('Lütfen tüm katılımcılar için gerekli bilgileri doldurun.');
                return;
            }

            const operationDropdown = operationDropdowns.get(participantIndex);
            const operations = operationDropdown ? (operationDropdown.getValue() || []) : [];

            participants.push({
                user: parseInt(userId),
                job_no: jobNo,
                description: description,
                operations: operations
            });
        }
        
        if (participants.length === 0) {
            showErrorMessage('En az 1 katılımcı eklemelisiniz.');
            return;
        }
        
        // Combine date and time
        const startAt = `${startDate}T${startTime}`;
        const endAt = `${endDate}T${endTime}`;
        
        // Convert to UTC ISO string
        const startAtUTC = new Date(startAt).toISOString();
        const endAtUTC = new Date(endAt).toISOString();
        
        // Prepare request data
        const requestData = {
            start_at: startAtUTC,
            end_at: endAtUTC,
            reason: reason.trim(),
            entries: participants
        };
        
        // Validate request
        const validation = validateOvertimeRequest(requestData);
        if (!validation.isValid) {
            showErrorMessage(validation.errors.join('<br>'));
            return;
        }

        // Create, or re-submit an existing rejected/cancelled request.
        if (editingRequestId) {
            await updateOvertimeRequest(editingRequestId, requestData);
            showSuccessMessage('Mesai talebi güncellendi ve yeniden gönderildi.');
        } else {
            await createOvertimeRequest(requestData);
            showSuccessMessage('Mesai talebi başarıyla oluşturuldu.');
        }

        editingRequestId = null;

        // Close modal
        createOvertimeModal.hide();

        // Refresh data
        loadOvertimeRequests();
        
    } catch (error) {
        
        // Extract error message from API response
        let errorMessage = 'Mesai talebi oluşturulurken hata oluştu.';
        
        if (error.response) {
            // Try to get error from the API response
            if (Array.isArray(error.response)) {
                errorMessage = error.response.join('\n');
            } else {
                errorMessage = error.response;
            }
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        showErrorMessage(errorMessage);
    } finally {
        // Hide loading state
        showSubmitLoading(false);
    }
}

// View overtime details
async function viewOvertimeDetails(requestId) {
    try {
        const request = await fetchOvertimeRequest(requestId);
        
        selectedOvertimeRequest = request;
        
        // Update URL to include the request ID
        const url = new URL(window.location);
        url.searchParams.set('request', requestId);
        window.history.pushState({}, '', url);
        
        // Use the modal from modals.js
        showOvertimeDetailsModal(request);
        
    } catch (error) {
        showErrorMessage('Mesai talebi detayları yüklenirken hata oluştu.');
    }
}


// Show cancel overtime modal

// Confirm cancel overtime
async function confirmCancelOvertime() {
    try {
        const requestId = window.pendingCancelRequestId;
        if (!requestId) return;
        
        await cancelOvertimeRequest(requestId);
        
        showSuccessMessage('Mesai talebi başarıyla iptal edildi.');
        
        // Close modal
        cancelOvertimeModal.hide();
        window.pendingCancelRequestId = null;
        
        // Refresh data
        loadOvertimeRequests();
        
    } catch (error) {
        showErrorMessage(error.message || 'Mesai talebi iptal edilirken hata oluştu.');
    }
}

// Loading state is now handled by TableComponent

function showSuccessMessage(message) {
    // You can implement a toast notification system here
    alert(message);
}

function showErrorMessage(message) {
    // Clean up the message for better display
    let cleanMessage = message;
    
    // Remove HTML tags if any
    cleanMessage = cleanMessage.replace(/<[^>]*>/g, '');
    
    // Replace line breaks with spaces for alert display
    cleanMessage = cleanMessage.replace(/\n/g, ' ');
    
    // Show the error message
    alert('Hata: ' + cleanMessage);
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
        <div style="line-height: 1.3; text-align: middle;">
            <div style="font-size: 0.85rem; margin-bottom: 0.25rem; color: #0d6efd; font-weight: 600; text-align: middle;">${name}</div>
            <div style="font-size: 0.75rem; margin-bottom: 0.25rem; color: #6c757d; text-align: middle;">
                <i class="fas fa-users me-1"></i>
                ${remainingApprovals} onay bekleniyor
            </div>
            ${approverNames ? `
                <div style="font-size: 0.7rem; line-height: 1.2; word-wrap: break-word; color: #6c757d; text-align: middle;">
                    <i class="fas fa-user-clock me-1"></i>
                    ${approverNames}
                </div>
            ` : ''}
        </div>
    `;
}

// Global functions for onclick handlers
window.viewOvertimeDetails = viewOvertimeDetails;
window.showCancelOvertimeModal = showCancelOvertimeModal;
window.removeParticipant = removeParticipant;
