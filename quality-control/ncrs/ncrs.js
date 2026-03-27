import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { getUser } from '../../../authService.js';
import { fetchAllUsers, authFetchUsers } from '../../../apis/users.js';
import { FileViewer } from '../../../components/file-viewer/file-viewer.js';
import { FileAttachments } from '../../../components/file-attachments/file-attachments.js';
import {
    listNCRs,
    getNCR,
    createNCR,
    updateNCR,
    submitNCR,
    decideNCR,
    closeNCR,
    listNCRFiles,
    uploadNCRFile,
    deleteNCRFile,
    DEFECT_TYPE_CHOICES,
    SEVERITY_CHOICES,
    DISPOSITION_CHOICES,
    NCR_STATUS_CHOICES,
    NCR_FILE_TYPE_OPTIONS
} from '../../../apis/qualityControl.js';
import { getJobOrderDropdown } from '../../../apis/projects/jobOrders.js';

// State management
const urlParams = new URLSearchParams(window.location.search);
let currentPage = parseInt(urlParams.get('page')) || 1;
let currentPageSize = parseInt(urlParams.get('page_size')) || 20;
// Initialize filters from URL or use defaults
let currentFilters = {};
if (urlParams.get('status__in')) {
    currentFilters.status__in = urlParams.get('status__in');
} else {
    // Default status filter: draft, submitted and rejected
    currentFilters.status__in = 'draft,submitted,rejected';
}
let currentSearch = urlParams.get('search') || '';
let currentOrdering = urlParams.get('ordering') || '-created_at';
let ncrs = [];
let totalNCRs = 0;
let isLoading = false;
let allUsers = [];
let currentUser = null;

function isUserInGroup(user, groupName) {
    if (!user || !groupName) return false;
    const groups = Array.isArray(user.groups) ? user.groups : [];
    return groups.some(group => {
        if (typeof group === 'string') return group === groupName;
        if (group && typeof group === 'object') {
            return group.name === groupName || group.slug === groupName;
        }
        return false;
    });
}

function doesGroupMatchAssignedTeam(group, assignedTeamName, assignedTeamId) {
    if (!group) return false;

    if (typeof group === 'string') {
        return Boolean(assignedTeamName) && group === assignedTeamName;
    }

    if (typeof group === 'object') {
        const groupName = group.name;
        const groupSlug = group.slug;
        const groupId = group.id;

        if (assignedTeamName && (groupName === assignedTeamName || groupSlug === assignedTeamName)) {
            return true;
        }

        if (assignedTeamId !== null && assignedTeamId !== undefined && groupId !== undefined && groupId !== null) {
            return String(groupId) === String(assignedTeamId);
        }
    }

    return false;
}

function isUserInAssignedTeam(user, row) {
    if (!user || !row) return false;

    const isSuperuser = user.is_superuser || user.is_admin;
    if (isSuperuser) return true;

    const groups = Array.isArray(user.groups) ? user.groups : [];
    if (!groups.length) return false;

    const assignedTeamName = row.assigned_team_name || '';
    const assignedTeamId = row.assigned_team;

    return groups.some(group => doesGroupMatchAssignedTeam(group, assignedTeamName, assignedTeamId));
}

function canCurrentUserDecideNCRs() {
    const isQCTeam = isUserInGroup(currentUser, 'qualitycontrol_team');
    const isSuperuser = currentUser && (currentUser.is_superuser || currentUser.is_admin);
    return isQCTeam || isSuperuser;
}

// Component instances
let ncrsFilters = null;
let ncrsTable = null;
let confirmationModal = null;
let ncrDetailsModal = null;
let ncrEditModal = null;
let ncrCreateModal = null;
let ncrDecisionModal = null;
let ncrSubmitModal = null;
let ncrFileUploadModal = null;

const ncrFileViewer = new FileViewer();
let ncrFilesComponent = null;

function getFileExtension(fileName) {
    if (!fileName) return '';
    return String(fileName).split('.').pop().toLowerCase();
}

function normalizeNcrFile(file) {
    // Backend spec says serializer includes `url` (presigned). Some backends may return `file_url`.
    const fileUrl = file?.url || file?.file_url || file?.file || '';
    const fileName = file?.name || file?.filename || file?.original_name || 'Dosya';
    return {
        ...file,
        file_url: fileUrl,
        filename: fileName,
        uploaded_at: file?.uploaded_at || file?.created_at || null
    };
}

// Status badge mapping
const STATUS_BADGE_MAP = {
    'draft': { class: 'status-grey', label: 'Taslak' },
    'submitted': { class: 'status-yellow', label: 'Gönderildi' },
    'approved': { class: 'status-green', label: 'Onaylandı' },
    'rejected': { class: 'status-red', label: 'Reddedildi' },
    'closed': { class: 'status-blue', label: 'Kapatıldı' }
};

const SEVERITY_BADGE_MAP = {
    'minor': { class: 'status-blue', label: 'Minör' },
    'major': { class: 'status-yellow', label: 'Majör' },
    'critical': { class: 'status-red', label: 'Kritik' }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    currentUser = await getUser();
    await loadUsers();
    await initializeComponents();
    await loadNCRs();
    
    // Check if there's an NCR number in the URL to auto-open the modal
    const ncrNumberParam = urlParams.get('ncr');
    if (ncrNumberParam) {
        // Wait a bit for the table to load, then search for and open the NCR
        setTimeout(async () => {
            try {
                // Search for NCR by number
                const response = await listNCRs({}, ncrNumberParam, '-created_at', 1, 1);
                if (response.results && response.results.length > 0) {
                    // Find exact match by ncr_number
                    const ncr = response.results.find(n => n.ncr_number === ncrNumberParam);
                    if (ncr) {
                        await showNCRDetails(ncr);
                    } else {
                        throw new Error('NCR not found');
                    }
                } else {
                    throw new Error('NCR not found');
                }
            } catch (error) {
                console.error('Error loading NCR from URL parameter:', error);
                showNotification('NCR yüklenirken hata oluştu', 'error');
                // Remove invalid NCR number from URL
                const newParams = new URLSearchParams(window.location.search);
                newParams.delete('ncr');
                const newUrl = window.location.pathname + (newParams.toString() ? '?' + newParams.toString() : '');
                window.history.replaceState({}, '', newUrl);
            }
        }, 500);
    }
});

async function loadUsers() {
    try {
        allUsers = await fetchAllUsers();
    } catch (error) {
        console.error('Error loading users:', error);
        allUsers = [];
    }
}

async function initializeComponents() {
    try {
        const canDecideNCRs = canCurrentUserDecideNCRs();

        // Initialize header
        new HeaderComponent({
            title: 'Uygunsuzluk Raporları',
            subtitle: 'NCR\'ları görüntüleyin, oluşturun ve yönetin',
            icon: 'exclamation-triangle',
            showBackButton: 'none',
            showCreateButton: 'block',
            showRefreshButton: 'block',
            onCreateClick: () => showCreateNCRModal(),
            onRefreshClick: async () => {
                currentPage = 1;
                updateUrlParams({ page: 1 });
                await loadNCRs();
            }
        });

        // Initialize filters
        initializeFiltersComponent();

        // Initialize table
        initializeTableComponent(canDecideNCRs);

        // Initialize modals
        initializeModalComponents();
    } catch (error) {
        console.error('Error initializing components:', error);
        showNotification('Bileşenler yüklenirken hata oluştu', 'error');
    }
}

function initializeFiltersComponent() {
    // Default status filter values
    const defaultStatusFilter = ['draft', 'submitted', 'rejected'];
    const allStatusFilter = NCR_STATUS_CHOICES.map(status => status.value).filter(Boolean);
    
    ncrsFilters = new FiltersComponent('filters-placeholder', {
        title: 'NCR Filtreleri',
        onApply: async (values) => {
            currentFilters = {};
            currentSearch = '';
            
            if (values['status-filter']) {
                const statusValues = Array.isArray(values['status-filter']) ? values['status-filter'] : [values['status-filter']];
                // Filter out empty strings
                const validStatusValues = statusValues.filter(v => v && v !== '');
                if (validStatusValues.length > 0) {
                    // Use status__in with comma-separated values
                    currentFilters.status__in = validStatusValues.join(',');
                }
            } else {
                // If no status is selected, include all statuses
                currentFilters.status__in = allStatusFilter.join(',');
            }
            if (values['severity-filter']) {
                currentFilters.severity = values['severity-filter'];
            }
            if (values['defect-type-filter']) {
                currentFilters.defect_type = values['defect-type-filter'];
            }
            if (values['assigned-team-filter']) {
                currentFilters.assigned_team = values['assigned-team-filter'];
            }
            if (values['job-order-filter']) {
                currentFilters.job_order = values['job-order-filter'];
            }
            if (values['search-filter']) {
                currentSearch = values['search-filter'];
            }
            
            currentPage = 1;
            updateUrlParams({ page: 1, ...currentFilters, search: currentSearch });
            await loadNCRs();
        },
        onClear: async () => {
            currentFilters = { status__in: defaultStatusFilter.join(',') };
            currentSearch = '';
            currentPage = 1;
            updateUrlParams({ page: 1, status__in: defaultStatusFilter.join(',') });
            await loadNCRs();
        }
    });

    // Status filter - multiselect
    // Get initial value from URL or use default
    const initialStatusValue = urlParams.get('status__in') 
        ? urlParams.get('status__in').split(',').filter(v => v)
        : defaultStatusFilter;
    
    ncrsFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        multiple: true,
        options: NCR_STATUS_CHOICES.map(s => ({ value: s.value, label: s.label })),
        placeholder: 'Durum seçin',
        value: initialStatusValue,
        colSize: 2
    });

    // Severity filter
    ncrsFilters.addDropdownFilter({
        id: 'severity-filter',
        label: 'Önem Derecesi',
        options: [
            { value: '', label: 'Tümü' },
            ...SEVERITY_CHOICES.map(s => ({ value: s.value, label: s.label }))
        ],
        placeholder: 'Önem derecesi seçin',
        colSize: 2
    });

    // Defect type filter
    ncrsFilters.addDropdownFilter({
        id: 'defect-type-filter',
        label: 'Kusur Tipi',
        options: [
            { value: '', label: 'Tümü' },
            ...DEFECT_TYPE_CHOICES.map(d => ({ value: d.value, label: d.label }))
        ],
        placeholder: 'Kusur tipi seçin',
        colSize: 2
    });

    // Assigned team filter
    ncrsFilters.addDropdownFilter({
        id: 'assigned-team-filter',
        label: 'Atanan Takım',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'manufacturing', label: 'İmalat' },
            { value: 'design', label: 'Dizayn' },
            { value: 'planning', label: 'Planlama' }
        ],
        placeholder: 'Takım seçin',
        colSize: 2
    });

    // Job order filter
    ncrsFilters.addTextFilter({
        id: 'job-order-filter',
        label: 'İş Emri',
        placeholder: 'İş emri numarası',
        colSize: 2
    });

    // Search filter
    ncrsFilters.addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'NCR no, başlık, açıklama...',
        colSize: 3
    });
}

function initializeTableComponent(canDecideNCRs) {
    const columns = [
        {
            field: 'ncr_number',
            label: 'NCR No',
            sortable: true,
            width: '180px',
            formatter: (value) => {
                if (!value) return '-';
                // Badge-style styling for NCR number (similar to job_no in project-tracking)
                // Format: NCR-2026-0001 - ensure it fits on one row
                return `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2); white-space: nowrap; display: inline-block;">${value}</span>`;
            }
        },
        {
            field: 'title',
            label: 'Başlık',
            sortable: true,
            width: '300px',
            formatter: (value) => {
                if (!value) return '-';
                // Enhanced title display with better typography - compact sizing
                return `
                    <div style="
                        color: #212529;
                        font-weight: 600;
                        font-size: 0.95rem;
                        line-height: 1.5;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    ">${value}</div>
                `;
            }
        },
        {
            field: 'job_order',
            label: 'İş Emri',
            sortable: true,
            width: '140px',
            formatter: (value) => {
                if (!value) return '-';
                // Badge-style styling for job order
                return `<span style="font-weight: 600; color: #6c757d; font-family: 'Courier New', monospace; font-size: 0.9rem; background: rgba(108, 117, 125, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(108, 117, 125, 0.2);">${value}</span>`;
            }
        },
        {
            field: 'severity',
            label: 'Önem',
            sortable: true,
            width: '120px',
            formatter: (value) => {
                const severity = SEVERITY_BADGE_MAP[value] || { class: 'status-grey', label: value };
                return `<span class="status-badge ${severity.class}">${severity.label}</span>`;
            }
        },
        {
            field: 'defect_type_display',
            label: 'Kusur Tipi',
            sortable: false,
            width: '150px',
            formatter: (value) => {
                if (!value) return '-';
                return `<span class="status-badge status-grey">${value}</span>`;
            }
        },
        {
            field: 'status',
            label: 'Durum',
            sortable: true,
            width: '130px',
            formatter: (value, row) => {
                // Use status_display from API if available, otherwise fallback to mapping
                const displayLabel = row.status_display || STATUS_BADGE_MAP[value]?.label || value;
                const status = STATUS_BADGE_MAP[value] || { class: 'status-grey', label: value };
                return `<span class="status-badge ${status.class}">${displayLabel}</span>`;
            }
        },
        {
            field: 'submission_count',
            label: 'Gönderim Sayısı',
            sortable: true,
            width: '140px',
            formatter: (value) => {
                if (value === null || value === undefined) return '<span class="status-badge status-grey">0</span>';
                const count = parseInt(value) || 0;
                // Use badge styling for submission count
                return `<span class="status-badge status-grey">${count}</span>`;
            }
        },
        {
            field: 'assigned_team',
            label: 'Atanan Takım',
            sortable: false,
            width: '150px',
            formatter: (value) => {
                const teamMap = {
                    'manufacturing': 'İmalat',
                    'welding': 'Kaynak',
                    'qualitycontrol': 'Kalite Kontrol',
                    'design': 'Dizayn',
                    'planning': 'Planlama'
                };
                const displayValue = teamMap[value] || value;
                if (!displayValue || displayValue === '-') return '-';
                return `<span class="status-badge status-grey">${displayValue}</span>`;
            }
        },
        {
            field: 'created_at',
            label: 'Oluşturulma',
            sortable: true,
            type: 'date',
            width: '150px',
            formatter: (value) => {
                if (!value) return '-';
                const date = new Date(value);
                const formattedDate = date.toLocaleDateString('tr-TR', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                return `<span class="text-dark" style="font-size: 0.875rem; font-weight: 500;">${formattedDate}</span>`;
            }
        }
    ];

    const actions = [
        {
            key: 'view',
            label: 'Detaylar',
            icon: 'fas fa-eye',
            class: 'btn-outline-info',
            onClick: (row) => showNCRDetails(row)
        },
        {
            key: 'edit',
            label: 'Düzenle',
            icon: 'fas fa-edit',
            class: 'btn-outline-primary',
            visible: (row) => {
                const isQCTeam = isUserInGroup(currentUser, 'qualitycontrol_team');
                return isQCTeam && (row.status === 'draft' || row.status === 'rejected');
            },
            onClick: (row) => showEditNCRModal(row)
        },
        {
            key: 'submit',
            label: 'Gönder',
            icon: 'fas fa-paper-plane',
            class: 'btn-outline-success',
            // Only users from the assigned group/team can submit
            visible: (row) => {
                if (!row.assigned_team && !row.assigned_team_name) return false;
                if (!(row.status === 'draft' || row.status === 'rejected')) return false;
                return isUserInAssignedTeam(currentUser, row);
            },
            onClick: (row) => handleSubmitNCR(row)
        }
    ];

    // Add QC team or superuser actions (approve/reject)
    if (canDecideNCRs) {
        actions.push(
            {
                key: 'approve',
                label: 'Onayla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                visible: (row) => row.status === 'submitted',
                onClick: (row) => showNCRDecisionModal(row, true)
            },
            {
                key: 'reject',
                label: 'Reddet',
                icon: 'fas fa-times',
                class: 'btn-outline-danger',
                visible: (row) => row.status === 'submitted',
                onClick: (row) => showNCRDecisionModal(row, false)
            }
        );
    }

    // Close action: Available to QC team/superusers OR the assigned team
    actions.push({
        key: 'close',
        label: 'Kapat',
        icon: 'fas fa-lock',
        class: 'btn-outline-secondary',
        visible: (row) => {
            if (row.status !== 'approved') return false;
            // QC team or superuser can always close
            if (canDecideNCRs) return true;
            // Assigned group/team can close if NCR is assigned to one of user's groups
            if (!row.assigned_team && !row.assigned_team_name) return false;
            return isUserInAssignedTeam(currentUser, row);
        },
        onClick: (row) => handleCloseNCR(row)
    });

    ncrsTable = new TableComponent('ncrs-table-container', {
        title: 'Uygunsuzluk Raporları',
        columns: columns,
        data: ncrs,
        actions: actions,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: currentPageSize,
        currentPage: currentPage,
        totalItems: totalNCRs,
        sortable: true,
        onSort: async (field, direction) => {
            currentOrdering = direction === 'asc' ? field : `-${field}`;
            currentPage = 1;
            updateUrlParams({ page: 1, ordering: currentOrdering });
            await loadNCRs();
        },
        onPageChange: async (page) => {
            currentPage = page;
            updateUrlParams({ page });
            await loadNCRs();
        },
        onPageSizeChange: async (newPageSize) => {
            currentPageSize = newPageSize;
            currentPage = 1;
            updateUrlParams({ page: 1, page_size: newPageSize });
            await loadNCRs();
        },
        refreshable: true,
        onRefresh: async () => {
            await loadNCRs();
        },
        exportable: false
    });
}

function initializeModalComponents() {
    confirmationModal = new ConfirmationModal('confirmation-modal-container');
    ncrDetailsModal = new DisplayModal('ncr-details-modal-container', {
        fullscreen: true
    });
    ncrEditModal = new EditModal('ncr-edit-modal-container', {
        title: 'NCR Düzenle',
        icon: 'fas fa-edit',
        saveButtonText: 'Kaydet',
        size: 'xl'
    });
    ncrCreateModal = new EditModal('ncr-create-modal-container', {
        title: 'Yeni NCR Oluştur',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Oluştur',
        size: 'xl'
    });
    ncrDecisionModal = new EditModal('ncr-decision-modal-container', {
        title: 'NCR Kararı',
        icon: 'fas fa-gavel',
        saveButtonText: 'Karar Ver',
        size: 'lg'
    });
    ncrSubmitModal = new EditModal('ncr-submit-modal-container', {
        title: 'NCR Gönder',
        icon: 'fas fa-paper-plane',
        saveButtonText: 'Gönder',
        size: 'lg'
    });
    ncrFileUploadModal = new EditModal('ncr-file-upload-modal-container', {
        title: 'Dosya Yükle',
        icon: 'fas fa-upload',
        saveButtonText: 'Yükle',
        size: 'md'
    });
}

async function loadNCRs() {
    if (isLoading) return;
    isLoading = true;

    try {
        ncrsTable?.setLoading(true);
        
        // Apply default status filter if no status filter is set
        const filters = { ...currentFilters };
        if (!filters.status && !filters.status__in) {
            filters.status__in = 'draft,submitted,rejected';
        }
        
        const response = await listNCRs(
            filters,
            currentSearch,
            currentOrdering,
            currentPage,
            currentPageSize
        );

        ncrs = response.results;
        totalNCRs = response.count;

        ncrsTable?.updateData(ncrs, totalNCRs);
        ncrsTable?.setLoading(false);
    } catch (error) {
        console.error('Error loading NCRs:', error);
        showNotification('NCR\'lar yüklenirken hata oluştu', 'error');
        ncrsTable?.setLoading(false);
    } finally {
        isLoading = false;
    }
}

// Utility function to download all files as zip
async function downloadAllFilesAsZip(files, zipFileName = 'files.zip') {
    if (!window.JSZip) {
        showNotification('JSZip kütüphanesi yüklenemedi', 'error');
        return;
    }
    
    if (!files || files.length === 0) {
        showNotification('İndirilecek dosya yok', 'warning');
        return;
    }
    
    try {
        showNotification('Dosyalar indiriliyor...', 'info');
        const zip = new JSZip();
        
        // Fetch and add each file to the zip
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileUrl = file.file_url || file.url || file.file || '';
            const fileName = file.file_name || file.name || file.filename || `file_${i + 1}`;
            
            if (!fileUrl) {
                console.warn(`Skipping file ${fileName}: no URL`);
                continue;
            }
            
            try {
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    console.warn(`Failed to fetch ${fileName}: ${response.status}`);
                    continue;
                }
                const blob = await response.blob();
                zip.file(fileName, blob);
            } catch (error) {
                console.error(`Error fetching file ${fileName}:`, error);
            }
        }
        
        // Generate zip file
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        // Download the zip
        const url = window.URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = zipFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        showNotification(`${files.length} dosya zip olarak indirildi`, 'success');
    } catch (error) {
        console.error('Error creating zip file:', error);
        showNotification('Zip dosyası oluşturulurken hata oluştu', 'error');
    }
}

async function refreshNcrFilesUI(ncrId) {
    const container = document.getElementById('ncr-files-list');
    if (!container) return;

    // Show loading state
    container.innerHTML = `
        <div class="text-center text-muted py-3">
            <i class="fas fa-spinner fa-spin me-2"></i>Dosyalar yükleniyor...
        </div>
    `;

    let files = [];
    try {
        const data = await listNCRFiles(ncrId);
        const rawList = Array.isArray(data) ? data : (data.results || data.files || []);
        files = rawList.map(normalizeNcrFile);
    } catch (e) {
        console.error('Failed to load NCR files:', e);
        container.innerHTML = `<div class="text-danger small py-2">Dosyalar yüklenemedi.</div>`;
        return;
    }

    if (!files.length) {
        container.innerHTML = `<div class="text-muted small py-2">Henüz dosya yok.</div>`;
        return;
    }

    // Initialize FileAttachments component once
    if (!ncrFilesComponent) {
        ncrFilesComponent = new FileAttachments('ncr-files-list', {
            title: 'Dosyalar',
            titleIcon: 'fas fa-paperclip',
            titleIconColor: 'text-muted',
            layout: 'list',
            showDeleteButton: true,
            onFileClick: (file) => {
                const name = file.file_name || 'Dosya';
                const ext = getFileExtension(name);
                const url = file.file_url;
                if (!url) {
                    showNotification('Dosya URL bulunamadı', 'warning');
                    return;
                }
                ncrFileViewer.openFile(url, name, ext);
            },
            onDownloadClick: async (fileUrl, fileName) => {
                if (!fileUrl) {
                    showNotification('Dosya URL bulunamadı', 'warning');
                    return;
                }
                try {
                    const response = await fetch(fileUrl);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const blob = await response.blob();
                    const downloadUrl = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    link.download = fileName || 'Dosya';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(downloadUrl);
                } catch (error) {
                    console.error('Error downloading file:', error);
                    // Fallback: open in new tab
                    const fallbackLink = document.createElement('a');
                    fallbackLink.href = fileUrl;
                    fallbackLink.download = fileName || 'Dosya';
                    fallbackLink.target = '_blank';
                    document.body.appendChild(fallbackLink);
                    fallbackLink.click();
                    document.body.removeChild(fallbackLink);
                }
            },
            onDeleteClick: (file) => {
                const fileId = file.id;
                if (!fileId) {
                    showNotification('Dosya ID bulunamadı', 'warning');
                    return;
                }
                confirmationModal.show({
                    title: 'Dosya Sil',
                    message: 'Bu dosyayı silmek istiyor musunuz?',
                    confirmText: 'Sil',
                    confirmButtonClass: 'btn-danger',
                    onConfirm: async () => {
                        try {
                            await deleteNCRFile(ncrId, fileId);
                            showNotification('Dosya silindi', 'success');
                            await refreshNcrFilesUI(ncrId);
                        } catch (error) {
                            console.error('Error deleting NCR file:', error);
                            showNotification('Dosya silinirken hata oluştu', 'error');
                        }
                    }
                });
            }
        });
    }

    // Map NCR files to FileAttachments format
    const mappedFiles = files.map(f => ({
        id: f.id,
        file_url: f.file_url || f.url || f.file || '',
        file_name: f.filename || f.name || 'Dosya',
        uploaded_at: f.uploaded_at,
        uploaded_by_username: f.uploaded_by_username || f.uploaded_by_name || ''
    }));

    ncrFilesComponent.setFiles(mappedFiles);
}

function showNcrFileUploadModal(ncrId, onSuccess) {
    if (!ncrFileUploadModal) return;
    ncrFileUploadModal.clearAll();
    ncrFileUploadModal.addSection({ title: 'Dosya Bilgileri', icon: 'fas fa-file', iconColor: 'text-primary' });
    ncrFileUploadModal.addField({ id: 'file_type', name: 'file_type', label: 'Dosya Türü', type: 'dropdown', required: true, options: NCR_FILE_TYPE_OPTIONS, icon: 'fas fa-tag', colSize: 6 });
    ncrFileUploadModal.addField({ id: 'name', name: 'name', label: 'Dosya Adı', type: 'text', placeholder: 'Opsiyonel (tüm dosyalar için)', icon: 'fas fa-heading', colSize: 6 });
    ncrFileUploadModal.addField({ id: 'description', name: 'description', label: 'Açıklama', type: 'textarea', placeholder: 'Opsiyonel (tüm dosyalar için)', icon: 'fas fa-align-left', colSize: 12 });

    ncrFileUploadModal.onSave = async (formData) => {
        const fileInput = document.getElementById('ncr-file-input-field');
        const files = fileInput?.files;
        if (!files || files.length === 0) {
            showNotification('Lütfen en az bir dosya seçin', 'warning');
            return;
        }
        
        ncrFileUploadModal.setLoading(true);
        let successCount = 0;
        let errorCount = 0;
        
        try {
            for (let i = 0; i < files.length; i++) {
                try {
                    await uploadNCRFile(ncrId, files[i], formData.file_type, formData.name, formData.description);
                    successCount++;
                } catch (error) {
                    console.error(`Error uploading file ${files[i].name}:`, error);
                    errorCount++;
                }
            }
            
            ncrFileUploadModal.setLoading(false);
            
            if (successCount > 0 && errorCount === 0) {
                ncrFileUploadModal.hide();
                showNotification(`${successCount} dosya başarıyla yüklendi`, 'success');
                if (onSuccess) await onSuccess();
            } else if (successCount > 0 && errorCount > 0) {
                ncrFileUploadModal.hide();
                showNotification(`${successCount} dosya yüklendi, ${errorCount} dosya yüklenemedi`, 'warning');
                if (onSuccess) await onSuccess();
            } else {
                showNotification('Dosyalar yüklenemedi', 'error');
            }
        } catch (error) {
            ncrFileUploadModal.setLoading(false);
            showNotification('Dosya yükleme sırasında hata oluştu', 'error');
        }
    };

    ncrFileUploadModal.render();
    const body = ncrFileUploadModal.container?.querySelector('.modal-body');
    if (body) {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'mb-3 px-3';
        fileDiv.innerHTML = `
            <label class="form-label">Dosyalar (Birden fazla seçebilirsiniz)</label>
            <input type="file" class="form-control" id="ncr-file-input-field" multiple>
            <small class="form-text text-muted">Birden fazla dosya seçmek için Ctrl (veya Cmd) tuşuna basılı tutarak tıklayın</small>
            <div id="ncr-selected-files-list" class="mt-2"></div>
        `;
        body.insertBefore(fileDiv, body.firstChild);
        
        // Show selected files
        const fileInput = fileDiv.querySelector('#ncr-file-input-field');
        const filesList = fileDiv.querySelector('#ncr-selected-files-list');
        fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length === 0) {
                filesList.innerHTML = '';
                return;
            }
            const filesHtml = Array.from(files).map((file, index) => `
                <div class="d-flex align-items-center gap-2 p-2 border rounded mb-1">
                    <i class="fas fa-file text-primary"></i>
                    <span class="flex-grow-1">${file.name}</span>
                    <small class="text-muted">${(file.size / 1024).toFixed(1)} KB</small>
                </div>
            `).join('');
            filesList.innerHTML = `<div class="mt-2"><strong>Seçilen dosyalar (${files.length}):</strong>${filesHtml}</div>`;
        });
    }
    ncrFileUploadModal.show();
}

async function showNCRDetails(ncr) {
    try {
        // Get full NCR to ensure we have ncr_number
        const fullNCR = await getNCR(ncr.id);
        
        // Update URL with NCR number (key)
        if (fullNCR.ncr_number) {
            updateUrlParams({ ncr: fullNCR.ncr_number });
        }

        // Clear and prepare the modal
        ncrDetailsModal.clearData();
        ncrDetailsModal.setTitle(fullNCR.ncr_number || `NCR #${fullNCR.id}`);

        // Top section: merged Başlık + Açıklama + Genel Bilgiler
        ncrDetailsModal.addSection({
            title: 'Genel Bilgiler',
            icon: 'fas fa-info-circle',
            fields: [
                {
                    label: 'Başlık',
                    value: fullNCR.title || '-',
                    colSize: 12
                },
                {
                    label: 'NCR Numarası',
                    value: fullNCR.ncr_number || '-',
                    colSize: 6
                },
                {
                    label: 'İş Emri',
                    value: fullNCR.job_order || '-',
                    colSize: 6
                },
                {
                    label: 'Durum',
                    value: STATUS_BADGE_MAP[fullNCR.status]?.label || fullNCR.status_display || '-',
                    colSize: 6
                },
                {
                    label: 'Tespit Eden',
                    value: fullNCR.detected_by_name || '-',
                    colSize: 6
                },
                {
                    label: 'Açıklama',
                    value: fullNCR.description || '-',
                    colSize: 12
                }
            ]
        });

        // Kusur Bilgileri section - important defect information
        ncrDetailsModal.addSection({
            title: 'Kusur Bilgileri',
            icon: 'fas fa-exclamation-triangle',
            fields: [
                { 
                    label: 'Kusur Tipi', 
                    value: fullNCR.defect_type_display || '-',
                    colSize: 6
                },
                { 
                    label: 'Önem Derecesi', 
                    value: SEVERITY_BADGE_MAP[fullNCR.severity]?.label || fullNCR.severity_display || '-',
                    colSize: 6
                },
                { 
                    label: 'Etkilenen Miktar', 
                    value: fullNCR.affected_quantity || '-',
                    colSize: 6
                },
                { 
                    label: 'Atanan Takım', 
                    value: fullNCR.assigned_team || '-',
                    colSize: 6
                }
            ]
        });

        // Düzeltici Faaliyet section - root cause and corrective action
        if (fullNCR.root_cause || fullNCR.corrective_action || fullNCR.disposition) {
            ncrDetailsModal.addSection({
                title: 'Düzeltici Faaliyet',
                icon: 'fas fa-tools',
                fields: [
                    { 
                        label: 'Kök Neden', 
                        value: fullNCR.root_cause || '-',
                        colSize: 12
                    },
                    { 
                        label: 'Düzeltici Faaliyet', 
                        value: fullNCR.corrective_action || '-',
                        colSize: 12
                    },
                    { 
                        label: 'Karar', 
                        value: fullNCR.disposition_display || fullNCR.disposition || '-',
                        colSize: 6
                    }
                ]
            });
        }

        // Files section (upload + list)
        ncrDetailsModal.addCustomSection({
            title: 'Dosyalar',
            icon: 'fas fa-paperclip',
            iconColor: 'text-muted',
            customContent: `
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <div class="text-muted small">NCR ile ilişkili dosyalar</div>
                    <div class="d-flex gap-2">
                        <button type="button" class="btn btn-sm btn-outline-success" id="ncr-files-download-all-btn">
                            <i class="fas fa-download me-1"></i>Tümünü İndir (ZIP)
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-primary" id="ncr-files-upload-btn">
                            <i class="fas fa-upload me-1"></i>Dosya Yükle
                        </button>
                    </div>
                </div>
                <div id="ncr-files-list"></div>
            `
        });

        const canDecideNCRs = canCurrentUserDecideNCRs();
        const canShowDecisionButtons = canDecideNCRs && fullNCR.status === 'submitted';
        ncrDetailsModal.setFooterContent(`
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
                <i class="fas fa-times me-1"></i>Kapat
            </button>
            ${canShowDecisionButtons ? `
                <button type="button" class="btn btn-sm btn-outline-danger" id="ncr-details-reject-btn">
                    <i class="fas fa-times me-1"></i>Reddet
                </button>
                <button type="button" class="btn btn-sm btn-outline-success" id="ncr-details-approve-btn">
                    <i class="fas fa-check me-1"></i>Onayla
                </button>
            ` : ''}
        `);

        // Render and show the modal
        ncrDetailsModal.render();
        ncrDetailsModal.show();

        if (canShowDecisionButtons) {
            const approveBtn = document.getElementById('ncr-details-approve-btn');
            if (approveBtn) {
                approveBtn.onclick = () => showNCRDecisionModal(fullNCR, true);
            }
            const rejectBtn = document.getElementById('ncr-details-reject-btn');
            if (rejectBtn) {
                rejectBtn.onclick = () => showNCRDecisionModal(fullNCR, false);
            }
        }

        // Reset files component so it binds to the current modal instance
        ncrFilesComponent = null;

        const uploadBtn = document.getElementById('ncr-files-upload-btn');
        if (uploadBtn) {
            uploadBtn.onclick = (e) => {
                e.preventDefault();
                showNcrFileUploadModal(fullNCR.id, async () => {
                    await refreshNcrFilesUI(fullNCR.id);
                });
            };
        }
        
        const downloadAllBtn = document.getElementById('ncr-files-download-all-btn');
        if (downloadAllBtn) {
            downloadAllBtn.onclick = async (e) => {
                e.preventDefault();
                try {
                    const data = await listNCRFiles(fullNCR.id);
                    const rawList = Array.isArray(data) ? data : (data.results || data.files || []);
                    const files = rawList.map(normalizeNcrFile);
                    if (files.length > 0) {
                        const ncrNumber = fullNCR.ncr_number || fullNCR.id;
                        await downloadAllFilesAsZip(files, `ncr-${ncrNumber}-files.zip`);
                    } else {
                        showNotification('İndirilecek dosya yok', 'warning');
                    }
                } catch (error) {
                    console.error('Error loading files for download:', error);
                    showNotification('Dosyalar yüklenirken hata oluştu', 'error');
                }
            };
        }
        
        await refreshNcrFilesUI(fullNCR.id);
    } catch (error) {
        console.error('Error loading NCR details:', error);
        showNotification('NCR detayları yüklenirken hata oluştu', 'error');
    }
}

async function showCreateNCRModal() {
    ncrCreateModal.clearAll();

    // Load job orders for dropdown
    let jobOrderOptions = [{ value: '', label: 'İş emri seçin' }];
    try {
        const jobOrders = await getJobOrderDropdown();
        if (Array.isArray(jobOrders)) {
            jobOrderOptions = [
                { value: '', label: 'İş emri seçin' },
                ...jobOrders.map(jo => ({
                    value: jo.job_no,
                    label: `${jo.job_no}${jo.title ? ' - ' + jo.title : ''}`
                }))
            ];
        }
    } catch (error) {
        console.error('Error loading job orders:', error);
        showNotification('İş emirleri yüklenirken hata oluştu', 'error');
    }

    ncrCreateModal
        .addSection({
            title: 'Temel Bilgiler',
            icon: 'fas fa-info-circle',
            fields: [
                {
                    id: 'job_order',
                    name: 'job_order',
                    label: 'İş Emri',
                    type: 'dropdown',
                    required: true,
                    searchable: true,
                    options: jobOrderOptions,
                    placeholder: 'İş emri seçin'
                },
                {
                    id: 'title',
                    name: 'title',
                    label: 'Başlık',
                    type: 'text',
                    required: true,
                    placeholder: 'NCR başlığı'
                },
                {
                    id: 'description',
                    name: 'description',
                    label: 'Açıklama',
                    type: 'textarea',
                    required: true,
                    placeholder: 'Detaylı açıklama'
                }
            ]
        })
        .addSection({
            title: 'Kusur Bilgileri',
            icon: 'fas fa-exclamation-triangle',
            fields: [
                {
                    id: 'defect_type',
                    name: 'defect_type',
                    label: 'Kusur Tipi',
                    type: 'dropdown',
                    required: true,
                    options: DEFECT_TYPE_CHOICES.map(d => ({ value: d.value, label: d.label }))
                },
                {
                    id: 'severity',
                    name: 'severity',
                    label: 'Önem Derecesi',
                    type: 'dropdown',
                    required: true,
                    options: SEVERITY_CHOICES.map(s => ({ value: s.value, label: s.label }))
                },
                {
                    id: 'affected_quantity',
                    name: 'affected_quantity',
                    label: 'Etkilenen Miktar',
                    type: 'number',
                    required: true,
                    placeholder: '0'
                }
            ]
        })
        .addSection({
            title: 'Atama',
            icon: 'fas fa-users',
            fields: [
                {
                    id: 'assigned_team',
                    name: 'assigned_team',
                    label: 'Atanan Takım',
                    type: 'dropdown',
                    required: false,
                    options: [
                        { value: '', label: 'Seçiniz' },
                        { value: 'manufacturing', label: 'İmalat' },
                        { value: 'design', label: 'Dizayn' },
                        { value: 'planning', label: 'Planlama' }
                    ]
                },
                {
                    id: 'disposition',
                    name: 'disposition',
                    label: 'Karar',
                    type: 'dropdown',
                    required: true,
                    options: [
                        { value: 'pending', label: 'Karar Bekliyor' },
                        ...DISPOSITION_CHOICES.filter(d => d.value !== 'pending').map(d => ({ value: d.value, label: d.label }))
                    ]
                }
            ]
        });

    ncrCreateModal.render();
    ncrCreateModal.onSave = async (formData) => {
        try {
            // Automatically set detected_by to current user
            if (currentUser && currentUser.id) {
                formData.detected_by = currentUser.id;
            }

            // Convert affected_quantity to integer if provided
            if (formData.affected_quantity) {
                formData.affected_quantity = parseInt(formData.affected_quantity);
            }

            await createNCR(formData);
            showNotification('NCR başarıyla oluşturuldu', 'success');
            ncrCreateModal.hide();
            await loadNCRs();
        } catch (error) {
            console.error('Error creating NCR:', error);
            showNotification(error.message || 'NCR oluşturulurken hata oluştu', 'error');
        }
    };

    ncrCreateModal.show();
}

async function showEditNCRModal(ncr) {
    try {
        const fullNCR = await getNCR(ncr.id);

        ncrEditModal.clearAll();

        ncrEditModal
            .addSection({
                title: 'Temel Bilgiler',
                icon: 'fas fa-info-circle',
                fields: [
                    {
                        name: 'title',
                        label: 'Başlık',
                        type: 'text',
                        required: true,
                        value: fullNCR.title || ''
                    },
                    {
                        name: 'description',
                        label: 'Açıklama',
                        type: 'textarea',
                        required: true,
                        value: fullNCR.description || ''
                    }
                ]
            })
            .addSection({
                title: 'Kusur Bilgileri',
                icon: 'fas fa-exclamation-triangle',
                fields: [
                    {
                        name: 'defect_type',
                        label: 'Kusur Tipi',
                        type: 'select',
                        required: true,
                        value: fullNCR.defect_type || '',
                        options: DEFECT_TYPE_CHOICES.map(d => ({ value: d.value, label: d.label }))
                    },
                    {
                        name: 'severity',
                        label: 'Önem Derecesi',
                        type: 'select',
                        required: true,
                        value: fullNCR.severity || '',
                        options: SEVERITY_CHOICES.map(s => ({ value: s.value, label: s.label }))
                    },
                {
                    name: 'affected_quantity',
                    label: 'Etkilenen Miktar',
                    type: 'number',
                    required: false,
                    value: fullNCR.affected_quantity || ''
                }
                ]
            })
            .addSection({
                title: 'Atama',
                icon: 'fas fa-users',
                fields: [
                    {
                        name: 'assigned_team',
                        label: 'Atanan Takım',
                        type: 'select',
                        required: false,
                        value: fullNCR.assigned_team || '',
                        options: [
                            { value: '', label: 'Seçiniz' },
                            { value: 'manufacturing', label: 'İmalat' },
                            { value: 'design', label: 'Dizayn' },
                            { value: 'planning', label: 'Planlama' }
                        ]
                    }
                ]
            });

        ncrEditModal.render();
        ncrEditModal.onSave = async (formData) => {
            try {
                // Convert affected_quantity to integer if provided
                if (formData.affected_quantity) {
                    formData.affected_quantity = parseInt(formData.affected_quantity);
                }

                await updateNCR(fullNCR.id, formData);
                showNotification('NCR başarıyla güncellendi', 'success');
                ncrEditModal.hide();
                await loadNCRs();
            } catch (error) {
                console.error('Error updating NCR:', error);
                showNotification(error.message || 'NCR güncellenirken hata oluştu', 'error');
            }
        };

        ncrEditModal.show();
    } catch (error) {
        console.error('Error loading NCR for edit:', error);
        showNotification('NCR yüklenirken hata oluştu', 'error');
    }
}

async function handleSubmitNCR(ncr) {
    try {
        const fullNCR = await getNCR(ncr.id);
        
        ncrSubmitModal.clearAll();
        
        ncrSubmitModal
            .addSection({
                title: 'Düzeltici Faaliyet Bilgileri',
                icon: 'fas fa-tools',
                fields: [
                    {
                        name: 'root_cause',
                        label: 'Kök Neden',
                        type: 'textarea',
                        required: false,
                        value: fullNCR.root_cause || '',
                        placeholder: 'Kök neden açıklaması'
                    },
                    {
                        name: 'corrective_action',
                        label: 'Düzeltici Faaliyet',
                        type: 'textarea',
                        required: false,
                        value: fullNCR.corrective_action || '',
                        placeholder: 'Düzeltici faaliyet açıklaması'
                    },
                    {
                        name: 'disposition',
                        label: 'Karar',
                        type: 'select',
                        required: false,
                        value: fullNCR.disposition || 'pending',
                        options: DISPOSITION_CHOICES.map(d => ({ value: d.value, label: d.label }))
                    }
                ]
            });
        
        ncrSubmitModal.render();
        ncrSubmitModal.onSave = async (formData) => {
            try {
                const submitData = {
                    root_cause: formData.root_cause || undefined,
                    corrective_action: formData.corrective_action || undefined,
                    disposition: formData.disposition || undefined
                };
                
                // Remove undefined values
                Object.keys(submitData).forEach(key => {
                    if (submitData[key] === undefined) {
                        delete submitData[key];
                    }
                });
                
                await submitNCR(fullNCR.id, submitData);
                showNotification('NCR başarıyla gönderildi', 'success');
                ncrSubmitModal.hide();
                await loadNCRs();
            } catch (error) {
                console.error('Error submitting NCR:', error);
                showNotification(error.message || 'NCR gönderilirken hata oluştu', 'error');
            }
        };
        
        ncrSubmitModal.show();
    } catch (error) {
        console.error('Error loading NCR for submit:', error);
        showNotification('NCR yüklenirken hata oluştu', 'error');
    }
}

function showNCRDecisionModal(ncr, approve) {
    ncrDecisionModal.clearAll();

    ncrDecisionModal
        .addSection({
            title: approve ? 'Onaylama' : 'Reddetme',
            icon: approve ? 'fas fa-check-circle' : 'fas fa-times-circle',
            fields: [
                {
                    name: 'comment',
                    label: 'Yorum',
                    type: 'textarea',
                    required: !approve,
                    placeholder: approve
                        ? 'Onay yorumu (isteğe bağlı)'
                        : 'Red nedeni (zorunlu)',
                    value: ''
                }
            ]
        });

    ncrDecisionModal.render();
    ncrDecisionModal.onSave = async (formData) => {
        try {
            await decideNCR(ncr.id, approve, formData.comment || '');
            showNotification(
                approve ? 'NCR onaylandı' : 'NCR reddedildi',
                'success'
            );
            ncrDecisionModal.hide();
            await loadNCRs();
        } catch (error) {
            console.error('Error deciding NCR:', error);
            showNotification(
                error.message || 'Karar verilirken hata oluştu',
                'error'
            );
        }
    };

    ncrDecisionModal.show();
}

async function handleCloseNCR(ncr) {
    confirmationModal.show({
        title: 'NCR Kapat',
        message: `"${ncr.ncr_number || ncr.title}" NCR'sını kapatmak istediğinizden emin misiniz?`,
        confirmText: 'Kapat',
        cancelText: 'İptal',
        onConfirm: async () => {
            try {
                await closeNCR(ncr.id);
                showNotification('NCR başarıyla kapatıldı', 'success');
                await loadNCRs();
            } catch (error) {
                console.error('Error closing NCR:', error);
                showNotification(error.message || 'NCR kapatılırken hata oluştu', 'error');
            }
        }
    });
}

function updateUrlParams(params) {
    const newParams = new URLSearchParams(window.location.search);
    Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
            if (Array.isArray(params[key])) {
                newParams.delete(key);
                params[key].forEach(val => newParams.append(key, val));
            } else {
                newParams.set(key, params[key]);
            }
        } else {
            newParams.delete(key);
        }
    });
    window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
}
