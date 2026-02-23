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
import {
    listNCRs,
    getNCR,
    createNCR,
    updateNCR,
    submitNCR,
    decideNCR,
    closeNCR,
    DEFECT_TYPE_CHOICES,
    SEVERITY_CHOICES,
    DISPOSITION_CHOICES,
    NCR_STATUS_CHOICES
} from '../../../apis/qualityControl.js';

// State management
const urlParams = new URLSearchParams(window.location.search);
let currentPage = parseInt(urlParams.get('page')) || 1;
let currentPageSize = parseInt(urlParams.get('page_size')) || 20;
let currentFilters = {};
let currentSearch = '';
let currentOrdering = '-created_at';
let ncrs = [];
let totalNCRs = 0;
let isLoading = false;
let allUsers = [];
let currentUser = null;

// Component instances
let ncrsFilters = null;
let ncrsTable = null;
let confirmationModal = null;
let ncrDetailsModal = null;
let ncrEditModal = null;
let ncrCreateModal = null;
let ncrDecisionModal = null;
let ncrSubmitModal = null;

// Status badge mapping
const STATUS_BADGE_MAP = {
    'draft': { class: 'status-grey', label: 'Taslak' },
    'submitted': { class: 'status-yellow', label: 'Gönderildi' },
    'approved': { class: 'status-green', label: 'Onaylandı' },
    'rejected': { class: 'status-red', label: 'Reddedildi' },
    'closed': { class: 'status-blue', label: 'Kapatıldı' }
};

const SEVERITY_BADGE_MAP = {
    'minor': { class: 'status-yellow', label: 'Minör' },
    'major': { class: 'status-orange', label: 'Majör' },
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
    
    // Check if there's an NCR ID in the URL to auto-open the modal
    const ncrIdParam = urlParams.get('ncr');
    if (ncrIdParam) {
        const ncrId = parseInt(ncrIdParam);
        if (!isNaN(ncrId)) {
            // Wait a bit for the table to load, then open the modal
            setTimeout(async () => {
                try {
                    const ncr = await getNCR(ncrId);
                    if (ncr) {
                        await showNCRDetails(ncr);
                        // Remove the ncr parameter from URL after opening
                        const newParams = new URLSearchParams(window.location.search);
                        newParams.delete('ncr');
                        const newUrl = window.location.pathname + (newParams.toString() ? '?' + newParams.toString() : '');
                        window.history.replaceState({}, '', newUrl);
                    }
                } catch (error) {
                    console.error('Error loading NCR from URL parameter:', error);
                    showNotification('NCR yüklenirken hata oluştu', 'error');
                }
            }, 500);
        }
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
        const isQCTeam = currentUser && currentUser.team === 'qualitycontrol';
        const isSuperuser = currentUser && (currentUser.is_superuser || currentUser.is_admin);
        const canDecideNCRs = isQCTeam || isSuperuser;

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
    ncrsFilters = new FiltersComponent('filters-placeholder', {
        title: 'NCR Filtreleri',
        onApply: async (values) => {
            currentFilters = {};
            currentSearch = '';
            
            if (values['status-filter']) {
                currentFilters.status = values['status-filter'];
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
            currentFilters = {};
            currentSearch = '';
            currentPage = 1;
            updateUrlParams({ page: 1 });
            await loadNCRs();
        }
    });

    // Status filter
    ncrsFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            ...NCR_STATUS_CHOICES.map(s => ({ value: s.value, label: s.label }))
        ],
        placeholder: 'Durum seçin',
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
            formatter: (value) => {
                const status = STATUS_BADGE_MAP[value] || { class: 'status-grey', label: value };
                return `<span class="status-badge ${status.class}">${status.label}</span>`;
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
                const isQCTeam = currentUser && currentUser.team === 'qualitycontrol';
                return isQCTeam && (row.status === 'draft' || row.status === 'rejected');
            },
            onClick: (row) => showEditNCRModal(row)
        },
        {
            key: 'submit',
            label: 'Gönder',
            icon: 'fas fa-paper-plane',
            class: 'btn-outline-success',
            visible: (row) => row.status === 'draft' || row.status === 'rejected',
            onClick: (row) => handleSubmitNCR(row)
        }
    ];

    // Add QC team or superuser actions
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
            },
            {
                key: 'close',
                label: 'Kapat',
                icon: 'fas fa-lock',
                class: 'btn-outline-secondary',
                visible: (row) => row.status === 'approved',
                onClick: (row) => handleCloseNCR(row)
            }
        );
    }

    ncrsTable = new TableComponent('ncrs-table-container', {
        title: 'Uygunsuzluk Raporları',
        columns: columns,
        data: ncrs,
        actions: actions,
        pagination: true,
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
        refreshable: true,
        onRefresh: async () => {
            await loadNCRs();
        },
        exportable: false
    });
}

function initializeModalComponents() {
    confirmationModal = new ConfirmationModal('confirmation-modal-container');
    ncrDetailsModal = new DisplayModal('ncr-details-modal-container');
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
}

async function loadNCRs() {
    if (isLoading) return;
    isLoading = true;

    try {
        ncrsTable?.setLoading(true);
        const response = await listNCRs(
            currentFilters,
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

async function showNCRDetails(ncr) {
    try {
        const fullNCR = await getNCR(ncr.id);

        // Clear and prepare the modal
        ncrDetailsModal.clearData();
        ncrDetailsModal.setTitle(fullNCR.ncr_number || `NCR #${fullNCR.id}`);

        // Title section - most important, shown prominently
        ncrDetailsModal.addSection({
            title: 'Başlık',
            icon: 'fas fa-heading',
            fields: [
                { 
                    label: 'Başlık', 
                    value: fullNCR.title || '-',
                    colSize: 12
                }
            ]
        });

        // Description section - important, shown early
        ncrDetailsModal.addSection({
            title: 'Açıklama',
            icon: 'fas fa-align-left',
            fields: [
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

        // Genel Bilgiler section - additional information
        ncrDetailsModal.addSection({
            title: 'Genel Bilgiler',
            icon: 'fas fa-info-circle',
            fields: [
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
                }
            ]
        });

        // Render and show the modal
        ncrDetailsModal.render();
        ncrDetailsModal.show();
    } catch (error) {
        console.error('Error loading NCR details:', error);
        showNotification('NCR detayları yüklenirken hata oluştu', 'error');
    }
}

function showCreateNCRModal() {
    ncrCreateModal.clearAll();

    ncrCreateModal
        .addSection({
            title: 'Temel Bilgiler',
            icon: 'fas fa-info-circle',
            fields: [
                {
                    name: 'job_order',
                    label: 'İş Emri',
                    type: 'text',
                    required: true,
                    placeholder: 'İş emri numarası'
                },
                {
                    name: 'title',
                    label: 'Başlık',
                    type: 'text',
                    required: true,
                    placeholder: 'NCR başlığı'
                },
                {
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
                    name: 'defect_type',
                    label: 'Kusur Tipi',
                    type: 'select',
                    required: true,
                    options: DEFECT_TYPE_CHOICES.map(d => ({ value: d.value, label: d.label }))
                },
                {
                    name: 'severity',
                    label: 'Önem Derecesi',
                    type: 'select',
                    required: true,
                    options: SEVERITY_CHOICES.map(s => ({ value: s.value, label: s.label }))
                },
                {
                    name: 'affected_quantity',
                    label: 'Etkilenen Miktar',
                    type: 'number',
                    required: false,
                    placeholder: '0'
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
                    options: [
                        { value: '', label: 'Seçiniz' },
                        { value: 'manufacturing', label: 'İmalat' },
                        { value: 'design', label: 'Dizayn' },
                        { value: 'planning', label: 'Planlama' }
                    ]
                },
                {
                    name: 'disposition',
                    label: 'Karar',
                    type: 'select',
                    required: false,
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
