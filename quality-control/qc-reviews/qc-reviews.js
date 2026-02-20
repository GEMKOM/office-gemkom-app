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
import {
    listQCReviews,
    getQCReview,
    decideQCReview,
    QC_REVIEW_STATUS_CHOICES,
    DEFECT_TYPE_CHOICES,
    SEVERITY_CHOICES,
    DISPOSITION_CHOICES
} from '../../../apis/qualityControl.js';

// State management
const urlParams = new URLSearchParams(window.location.search);
let currentPage = parseInt(urlParams.get('page')) || 1;
let currentPageSize = parseInt(urlParams.get('page_size')) || 20;
let currentFilters = {};
let currentSearch = '';
let currentOrdering = '-submitted_at';
let reviews = [];
let totalReviews = 0;
let isLoading = false;
let currentUser = null;
let canDecideReviews = false;

// Component instances
let reviewsFilters = null;
let reviewsTable = null;
let confirmationModal = null;
let reviewDetailsModal = null;
let reviewDecisionModal = null;
let currentReview = null;

// Status badge mapping
const STATUS_BADGE_MAP = {
    'pending': { class: 'status-yellow', label: 'İnceleme Bekliyor' },
    'approved': { class: 'status-green', label: 'Onaylandı' },
    'rejected': { class: 'status-red', label: 'Reddedildi' }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    await initializeComponents();
    await loadReviews();
});

async function initializeComponents() {
    try {
        currentUser = await getUser();
        canDecideReviews = currentUser && (currentUser.team === 'qualitycontrol' || currentUser.is_superuser);

        // Initialize header
        new HeaderComponent({
            title: 'KK İncelemeleri',
            subtitle: 'Kalite kontrol incelemelerini görüntüleyin ve yönetin',
            icon: 'search',
            showBackButton: 'none',
            showCreateButton: 'none',
            showRefreshButton: 'block',
            onRefreshClick: async () => {
                currentPage = 1;
                updateUrlParams({ page: 1 });
                await loadReviews();
            }
        });

        // Initialize filters
        initializeFiltersComponent();

        // Initialize table
        await initializeTableComponent();

        // Initialize modals
        initializeModalComponents();
    } catch (error) {
        console.error('Error initializing components:', error);
        showNotification('Bileşenler yüklenirken hata oluştu', 'error');
    }
}

function initializeFiltersComponent() {
    reviewsFilters = new FiltersComponent('filters-placeholder', {
        title: 'KK İnceleme Filtreleri',
        onApply: async (values) => {
            currentFilters = {};
            currentSearch = '';
            
            if (values['status-filter']) {
                currentFilters.status = values['status-filter'];
            }
            if (values['job-order-filter']) {
                currentFilters.task__job_order = values['job-order-filter'];
            }
            if (values['department-filter']) {
                currentFilters.task__department = values['department-filter'];
            }
            if (values['search-filter']) {
                currentSearch = values['search-filter'];
            }
            
            currentPage = 1;
            updateUrlParams({ page: 1, ...currentFilters, search: currentSearch });
            await loadReviews();
        },
        onClear: async () => {
            currentFilters = {};
            currentSearch = '';
            currentPage = 1;
            updateUrlParams({ page: 1 });
            await loadReviews();
        }
    });

    // Status filter
    reviewsFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            ...QC_REVIEW_STATUS_CHOICES.map(s => ({ value: s.value, label: s.label }))
        ],
        placeholder: 'Durum seçin',
        colSize: 2
    });

    // Job order filter
    reviewsFilters.addTextFilter({
        id: 'job-order-filter',
        label: 'İş Emri',
        placeholder: 'İş emri numarası',
        colSize: 2
    });

    // Department filter
    reviewsFilters.addDropdownFilter({
        id: 'department-filter',
        label: 'Departman',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'manufacturing', label: 'İmalat' },
            { value: 'design', label: 'Dizayn' },
            { value: 'planning', label: 'Planlama' },
            { value: 'procurement', label: 'Satın Alma' }
        ],
        placeholder: 'Departman seçin',
        colSize: 2
    });

    // Search filter
    reviewsFilters.addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'Görev başlığı, iş emri...',
        colSize: 3
    });
}

async function initializeTableComponent() {
    // Use the global currentUser that was set in initializeComponents
    // If not set, try to get it again
    if (!currentUser) {
        try {
            currentUser = await getUser();
            canDecideReviews = currentUser && (currentUser.team === 'qualitycontrol' || currentUser.is_superuser);
        } catch (error) {
            console.error('Error getting user:', error);
            currentUser = null;
            canDecideReviews = false;
        }
    }

    const columns = [
        {
            field: 'id',
            label: 'ID',
            sortable: true,
            width: '100px',
            formatter: (value) => {
                if (!value) return '-';
                // Badge-style styling for ID
                return `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2); white-space: nowrap; display: inline-block;">#${value}</span>`;
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
            field: 'task_title',
            label: 'Görev',
            sortable: false,
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
            field: 'submitted_by_name',
            label: 'Gönderen',
            sortable: false,
            width: '150px',
            formatter: (value) => {
                if (!value || value === '-') return '-';
                return `<span class="status-badge status-grey">${value}</span>`;
            }
        },
        {
            field: 'submitted_at',
            label: 'Gönderilme Tarihi',
            sortable: true,
            type: 'date',
            width: '180px',
            formatter: (value) => {
                if (!value) return '-';
                const date = new Date(value);
                const formattedDate = date.toLocaleDateString('tr-TR', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                const formattedTime = date.toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return `<span class="text-dark" style="font-size: 0.875rem; font-weight: 500;">${formattedDate} ${formattedTime}</span>`;
            }
        },
        {
            field: 'status',
            label: 'Durum',
            sortable: true,
            width: '150px',
            formatter: (value) => {
                const status = STATUS_BADGE_MAP[value] || { class: 'status-grey', label: value };
                return `<span class="status-badge ${status.class}">${status.label}</span>`;
            }
        },
        {
            field: 'reviewed_by_name',
            label: 'İnceleyen',
            sortable: false,
            width: '150px',
            formatter: (value) => {
                if (!value || value === '-') return '-';
                return `<span class="status-badge status-grey">${value}</span>`;
            }
        },
        {
            field: 'reviewed_at',
            label: 'İnceleme Tarihi',
            sortable: false,
            width: '180px',
            formatter: (value) => {
                if (!value) return '-';
                const date = new Date(value);
                const formattedDate = date.toLocaleDateString('tr-TR', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                const formattedTime = date.toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return `<span class="text-dark" style="font-size: 0.875rem; font-weight: 500;">${formattedDate} ${formattedTime}</span>`;
            }
        }
    ];

    const actions = [
        {
            key: 'view',
            label: 'Detaylar',
            icon: 'fas fa-eye',
            class: 'btn-outline-info',
            onClick: (row) => showReviewDetails(row)
        }
    ];

    // Add approve/reject actions for QC team or superusers
    if (canDecideReviews) {
        actions.push(
            {
                key: 'approve',
                label: 'Onayla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                visible: (row) => row.status === 'pending',
                onClick: (row) => showReviewDecisionModal(row, true)
            },
            {
                key: 'reject',
                label: 'Reddet',
                icon: 'fas fa-times',
                class: 'btn-outline-danger',
                visible: (row) => row.status === 'pending',
                onClick: (row) => showReviewDecisionModal(row, false)
            }
        );
    }

    reviewsTable = new TableComponent('reviews-table-container', {
        title: 'KK İncelemeleri',
        columns: columns,
        data: reviews,
        actions: actions,
        pagination: true,
        itemsPerPage: currentPageSize,
        currentPage: currentPage,
        totalItems: totalReviews,
        sortable: true,
        onSort: async (field, direction) => {
            currentOrdering = direction === 'asc' ? field : `-${field}`;
            currentPage = 1;
            updateUrlParams({ page: 1, ordering: currentOrdering });
            await loadReviews();
        },
        onPageChange: async (page) => {
            currentPage = page;
            updateUrlParams({ page });
            await loadReviews();
        },
        refreshable: true,
        onRefresh: async () => {
            await loadReviews();
        },
        exportable: false
    });
}

function initializeModalComponents() {
    confirmationModal = new ConfirmationModal('confirmation-modal-container');
    reviewDetailsModal = new DisplayModal('review-details-modal-container', {
        title: 'KK İnceleme Detayları',
        icon: 'fas fa-search',
        size: 'lg'
    });
    reviewDecisionModal = new EditModal('review-decision-modal-container', {
        title: 'KK İnceleme Kararı',
        icon: 'fas fa-gavel',
        saveButtonText: 'Karar Ver',
        size: 'xl'
    });
}

async function loadReviews() {
    if (isLoading) return;
    isLoading = true;

    try {
        reviewsTable?.setLoading(true);
        const response = await listQCReviews(
            currentFilters,
            currentSearch,
            currentOrdering,
            currentPage,
            currentPageSize
        );

        reviews = response.results;
        totalReviews = response.count;

        reviewsTable?.updateData(reviews, totalReviews);
        reviewsTable?.setLoading(false);
    } catch (error) {
        console.error('Error loading reviews:', error);
        showNotification('İncelemeler yüklenirken hata oluştu', 'error');
        reviewsTable?.setLoading(false);
    } finally {
        isLoading = false;
    }
}

async function showReviewDetails(review) {
    try {
        // Fetch full review details
        const fullReview = await getQCReview(review.id);
        currentReview = fullReview;

        // Clear previous content
        reviewDetailsModal.sections = [];
        
        // Set title
        reviewDetailsModal.setTitle(`KK İnceleme #${fullReview.id}`);

        // Add job order and task title section (2 per row)
        reviewDetailsModal.addSection({
            title: 'Genel Bilgiler',
            icon: 'fas fa-info-circle',
            fields: [
                { 
                    label: 'İş Emri', 
                    value: fullReview.job_order || '-',
                    colSize: 6
                },
                { 
                    label: 'Görev', 
                    value: fullReview.task_title || '-',
                    colSize: 6
                }
            ]
        });

        // Add part data section (2 per row)
        if (fullReview.part_data && Object.keys(fullReview.part_data).length > 0) {
            // Turkish label mapping for part data fields
            const partDataLabelMap = {
                'location': 'Konum',
                'quantity_inspected': 'İncelenen Miktar',
                'position_no': 'Pozisyon No',
                'drawing_no': 'Çizim No',
                'notes': 'Notlar',
                'quantity': 'Miktar',
                'measurements': 'Ölçümler',
                'dimensions': 'Boyutlar',
                'weight': 'Ağırlık',
                'material': 'Malzeme',
                'serial_number': 'Seri No',
                'batch_number': 'Parti No',
                'inspection_date': 'İnceleme Tarihi',
                'inspector': 'İnceleyen',
                'test_results': 'Test Sonuçları',
                'certificate': 'Sertifika',
                'photo': 'Fotoğraf',
                'document': 'Doküman'
            };

            const partDataFields = Object.entries(fullReview.part_data).map(([key, value]) => ({
                label: partDataLabelMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                value: value || '-',
                colSize: 6
            }));

            reviewDetailsModal.addSection({
                title: 'Parça Bilgileri',
                icon: 'fas fa-cog',
                fields: partDataFields
            });
        } else {
            // Show empty part data section if no data
            reviewDetailsModal.addSection({
                title: 'Parça Bilgileri',
                icon: 'fas fa-cog',
                fields: [
                    {
                        label: 'Parça Bilgisi',
                        value: '-',
                        colSize: 6
                    }
                ]
            });
        }

        // Add comment section at the bottom
        reviewDetailsModal.addSection({
            title: 'Yorum',
            icon: 'fas fa-comment',
            fields: [
                {
                    label: 'Yorum',
                    value: fullReview.comment || '-',
                    colSize: 12
                }
            ]
        });

        // Render the modal
        reviewDetailsModal.render();

        // Add action buttons for QC team or superusers if status is pending
        // Use the global canDecideReviews variable
        const modalFooter = reviewDetailsModal.container.querySelector('.modal-footer');
        
        if (modalFooter && canDecideReviews && fullReview.status === 'pending') {
            modalFooter.innerHTML = `
                <div class="d-flex justify-content-end gap-2">
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
                        <i class="fas fa-times me-1"></i>Kapat
                    </button>
                    <button type="button" class="btn btn-sm btn-danger" id="reject-review-btn">
                        <i class="fas fa-times me-1"></i>Reddet
                    </button>
                    <button type="button" class="btn btn-sm btn-success" id="approve-review-btn">
                        <i class="fas fa-check me-1"></i>Onayla
                    </button>
                </div>
            `;

            // Add event listeners
            const approveBtn = modalFooter.querySelector('#approve-review-btn');
            const rejectBtn = modalFooter.querySelector('#reject-review-btn');

            if (approveBtn) {
                approveBtn.addEventListener('click', () => {
                    reviewDetailsModal.hide();
                    showReviewDecisionModal(fullReview, true);
                });
            }

            if (rejectBtn) {
                rejectBtn.addEventListener('click', () => {
                    reviewDetailsModal.hide();
                    showReviewDecisionModal(fullReview, false);
                });
            }
        }

        reviewDetailsModal.show();
    } catch (error) {
        console.error('Error loading review details:', error);
        showNotification('İnceleme detayları yüklenirken hata oluştu', 'error');
    }
}

async function showReviewDecisionModal(review, approve) {
    reviewDecisionModal.clearAll();

    // Fetch full review to get task title and part data
    const fullReview = await getQCReview(review.id);

    reviewDecisionModal
        .addSection({
            title: approve ? 'Onaylama' : 'Reddetme',
            icon: approve ? 'fas fa-check-circle' : 'fas fa-times-circle',
            fields: [
                {
                    name: 'comment',
                    label: 'Yorum',
                    type: 'textarea',
                    required: !approve, // Comment required for rejection
                    placeholder: approve
                        ? 'Onay yorumu (isteğe bağlı)'
                        : 'Red nedeni (zorunlu)',
                    value: ''
                }
            ]
        });

    // Add NCR fields for rejection
    if (!approve) {
        reviewDecisionModal
            .addSection({
                title: 'NCR Bilgileri',
                icon: 'fas fa-exclamation-triangle',
                fields: [
                    {
                        name: 'ncr_title',
                        label: 'NCR Başlığı',
                        type: 'text',
                        required: false,
                        value: `KK Red: ${fullReview.task_title || 'İnceleme Reddedildi'}`,
                        placeholder: 'NCR başlığı (boş bırakılırsa otomatik oluşturulur)'
                    },
                    {
                        name: 'ncr_description',
                        label: 'NCR Açıklaması',
                        type: 'textarea',
                        required: false,
                        placeholder: 'Açıklama (boş bırakılırsa yorum kullanılır)'
                    },
                    {
                        name: 'ncr_defect_type',
                        label: 'Kusur Tipi',
                        type: 'select',
                        required: false,
                        value: 'other',
                        options: DEFECT_TYPE_CHOICES.map(d => ({ value: d.value, label: d.label }))
                    },
                    {
                        name: 'ncr_severity',
                        label: 'Önem Derecesi',
                        type: 'select',
                        required: false,
                        value: 'minor',
                        options: SEVERITY_CHOICES.map(s => ({ value: s.value, label: s.label }))
                    },
                    {
                        name: 'ncr_affected_quantity',
                        label: 'Etkilenen Miktar',
                        type: 'number',
                        required: false,
                        value: fullReview.part_data?.quantity_inspected || 1,
                        placeholder: '1'
                    },
                    {
                        name: 'ncr_disposition',
                        label: 'Karar',
                        type: 'select',
                        required: false,
                        value: 'pending',
                        options: DISPOSITION_CHOICES.map(d => ({ value: d.value, label: d.label }))
                    }
                ]
            });
    }

    reviewDecisionModal.render();
    reviewDecisionModal.onSave = async (formData) => {
        try {
            let ncrData = {};
            
            // Build NCR data for rejection
            if (!approve) {
                ncrData = {
                    ncr_title: formData.ncr_title || undefined,
                    ncr_description: formData.ncr_description || undefined,
                    ncr_defect_type: formData.ncr_defect_type || undefined,
                    ncr_severity: formData.ncr_severity || undefined,
                    ncr_affected_quantity: formData.ncr_affected_quantity ? parseInt(formData.ncr_affected_quantity) : undefined,
                    ncr_disposition: formData.ncr_disposition || undefined
                };
                
                // Remove undefined values
                Object.keys(ncrData).forEach(key => {
                    if (ncrData[key] === undefined) {
                        delete ncrData[key];
                    }
                });
            }
            
            await decideQCReview(review.id, approve, formData.comment || '', ncrData);
            
            showNotification(
                approve ? 'İnceleme onaylandı' : 'İnceleme reddedildi ve NCR oluşturuldu',
                'success'
            );
            reviewDecisionModal.hide();
            await loadReviews();
        } catch (error) {
            console.error('Error deciding review:', error);
            showNotification(
                error.message || 'Karar verilirken hata oluştu',
                'error'
            );
        }
    };

    reviewDecisionModal.show();
}


function updateUrlParams(params) {
    const newParams = new URLSearchParams(window.location.search);
    Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
            newParams.set(key, params[key]);
        } else {
            newParams.delete(key);
        }
    });
    window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
}
