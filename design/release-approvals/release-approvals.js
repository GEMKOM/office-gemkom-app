import { initNavbar } from '../../../components/navbar.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { mountTopicDiscussion } from '../../../components/topic-discussion/topic-discussion.js';
import {
    listPendingApprovalReleases,
    listCompletedReviewReleases,
    approveRelease,
    rejectRelease,
    getDrawingRelease
} from '../../../apis/projects/design.js';
import { fetchAllUsers } from '../../../apis/users.js';
import { showNotification } from '../../../components/notification/notification.js';

const COMPLETED_REVIEW_STATUS_CHOICES = [
    { value: 'released', label: 'Yayınlandı' },
    { value: 'rejected', label: 'İnceleme Reddedildi' },
    { value: 'superseded', label: 'Güncelliğini Kaybetti' },
];

const urlParams = new URLSearchParams(window.location.search);
let activeTab = urlParams.get('tab') === 'completed' ? 'completed' : 'pending';
let completedPage = parseInt(urlParams.get('page'), 10) || 1;
let completedPageSize = parseInt(urlParams.get('page_size'), 10) || 20;
let completedOrdering = urlParams.get('ordering') || '-review_completed_at';
let completedFilters = {};
if (urlParams.get('status__in')) {
    completedFilters.status__in = urlParams.get('status__in');
} else {
    completedFilters.status__in = 'released,rejected';
}
let completedSearch = urlParams.get('search') || '';
let completedReleases = [];
let totalCompletedReleases = 0;
let completedLoading = false;
let allUsers = [];

let headerComponent;
let approvalsTable;
let completedTable;
let completedFiltersComponent;
let detailsModal;
let approveModal;
let rejectModal;
let pendingReleases = [];
let currentRelease = null;
let discussionPanel = null;
let folderPathCopyListenerAttached = false;

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function copyTextToClipboard(text) {
    if (!text) {
        showNotification('Kopyalanacak klasör yolu yok', 'error');
        return;
    }

    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => showNotification('Klasör yolu kopyalandı', 'success'))
            .catch(() => copyTextToClipboardFallback(text));
        return;
    }

    copyTextToClipboardFallback(text);
}

function copyTextToClipboardFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (err) {
        console.error('Copy failed:', err);
    }

    document.body.removeChild(textarea);

    if (copied) {
        showNotification('Klasör yolu kopyalandı', 'success');
    } else {
        showNotification('Klasör yolu kopyalanamadı', 'error');
    }
}

function formatFolderPathCell(value, row) {
    if (!value) return '-';
    const escaped = escapeHtml(value);
    const display = value.length > 80 ? `${escapeHtml(value.substring(0, 80))}...` : escaped;
    return `
        <div class="d-flex align-items-center gap-1 folder-path-cell">
            <span class="folder-path-text text-truncate flex-grow-1" style="min-width: 0;" title="${escaped}">${display}</span>
            <button type="button"
                class="btn btn-sm btn-outline-secondary py-0 px-1 copy-folder-path-btn flex-shrink-0"
                title="Klasör yolunu kopyala"
                data-folder-path="${encodeURIComponent(value)}"
                aria-label="Klasör yolunu kopyala">
                <i class="fas fa-copy"></i>
            </button>
        </div>
    `;
}

function setupFolderPathCopyHandler() {
    if (folderPathCopyListenerAttached) return;

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.copy-folder-path-btn');
        if (!btn || !btn.closest('#release-approvals-table-container, #completed-reviews-table-container')) return;

        e.preventDefault();
        e.stopPropagation();

        const encodedPath = btn.getAttribute('data-folder-path');
        if (!encodedPath) return;

        try {
            copyTextToClipboard(decodeURIComponent(encodedPath));
        } catch (err) {
            console.error('Failed to decode folder path:', err);
            showNotification('Klasör yolu kopyalanamadı', 'error');
        }
    });
    folderPathCopyListenerAttached = true;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    initHeaderComponent();
    initializeModalComponents();
    initializePendingTable();
    initializeCompletedTable();
    setupTabHandlers();
    allUsers = await fetchAllUsers({ is_active: true });
    initializeCompletedFilters();

    if (activeTab === 'completed') {
        activateTab('completed', false);
        await loadCompletedReviews();
    } else {
        await loadPendingReleases();
    }

    const releaseId = urlParams.get('release_id');
    if (releaseId) {
        try {
            const release = await getDrawingRelease(releaseId);
            await showReleaseDetails(release);
        } catch (error) {
            console.error('Error opening release from URL:', error);
        }
    }
});

function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Çizim İncelemesi',
        subtitle: 'Bekleyen incelemeleri değerlendirin ve tamamlanan inceleme geçmişini görüntüleyin',
        icon: 'search',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/design/',
        onRefreshClick: async () => {
            if (activeTab === 'completed') {
                await loadCompletedReviews();
            } else {
                await loadPendingReleases();
            }
        }
    });
}

function updateUrlParams(updates = {}) {
    const url = new URL(window.location);
    Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(key, value);
        }
    });
    window.history.replaceState({}, '', url);
}

function setupTabHandlers() {
    const pendingTab = document.getElementById('pending-tab');
    const completedTab = document.getElementById('completed-tab');

    pendingTab?.addEventListener('shown.bs.tab', async () => {
        activeTab = 'pending';
        updateUrlParams({ tab: null, page: null, page_size: null, ordering: null, search: null, status__in: null });
        await loadPendingReleases();
    });

    completedTab?.addEventListener('shown.bs.tab', async () => {
        activeTab = 'completed';
        updateUrlParams({
            tab: 'completed',
            page: completedPage > 1 ? completedPage : null,
            page_size: completedPageSize !== 20 ? completedPageSize : null,
            ordering: completedOrdering !== '-review_completed_at' ? completedOrdering : null,
            search: completedSearch || null,
            status__in: completedFilters.status__in !== 'released,rejected' ? completedFilters.status__in : null,
        });
        await loadCompletedReviews();
    });
}

function activateTab(tab, triggerBootstrap = true) {
    const pendingTab = document.getElementById('pending-tab');
    const completedTab = document.getElementById('completed-tab');
    if (tab === 'completed' && completedTab) {
        if (triggerBootstrap && window.bootstrap?.Tab) {
            window.bootstrap.Tab.getOrCreateInstance(completedTab).show();
        } else {
            pendingTab?.classList.remove('active');
            completedTab.classList.add('active');
            document.getElementById('pending-panel')?.classList.remove('show', 'active');
            document.getElementById('completed-panel')?.classList.add('show', 'active');
        }
        activeTab = 'completed';
    }
}

function initializeModalComponents() {
    detailsModal = new DisplayModal('release-details-modal-container', {
        title: 'Yayın Detayları',
        icon: 'fas fa-file-export',
        size: 'xl',
        fullscreen: true,
        showEditButton: false
    });

    detailsModal.onCloseCallback(() => {
        discussionPanel?.destroy();
        discussionPanel = null;
        const url = new URL(window.location);
        url.searchParams.delete('release_id');
        window.history.replaceState({}, '', url);
    });

    approveModal = new ConfirmationModal('confirmation-modal-container', {
        title: 'Olumlu Değerlendirme',
        icon: 'fas fa-check-circle',
        confirmText: 'Evet, Olumlu',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-success'
    });

    rejectModal = new EditModal('reject-modal-container', {
        title: 'Yayını Reddet',
        icon: 'fas fa-times-circle',
        size: 'md',
        showEditButton: false,
        saveButtonText: 'Reddet'
    });

    rejectModal.onSaveCallback(async (formData) => {
        if (!formData.reason || !formData.reason.trim()) {
            showNotification('Reddetme nedeni gereklidir', 'error');
            return;
        }
        if (!currentRelease) return;

        try {
            await rejectRelease(currentRelease.id, { reason: formData.reason.trim() });
            showNotification('Yayın reddedildi', 'success');
            rejectModal.hide();
            detailsModal.hide();
            await loadPendingReleases();
        } catch (error) {
            console.error('Error rejecting release:', error);
            showNotification('Yayın reddedilirken hata oluştu', 'error');
        }
    });
}

function formatStatusBadge(value, row) {
    const label = row.status_display || value || '-';
    let badgeClass = 'bg-secondary';
    if (row.status === 'released') badgeClass = 'bg-success';
    else if (row.status === 'rejected') badgeClass = 'bg-danger';
    else if (row.status === 'superseded') badgeClass = 'bg-warning text-dark';
    return `<span class="badge ${badgeClass}">${escapeHtml(label)}</span>`;
}

function initializeCompletedFilters() {
    const defaultStatusFilter = ['released', 'rejected'];
    const userOptions = [
        { value: '', label: 'Tümü' },
        ...allUsers.map((user) => ({
            value: String(user.id),
            label: user.full_name || user.username || `Kullanıcı #${user.id}`,
        })),
    ];

    completedFiltersComponent = new FiltersComponent('completed-reviews-filters', {
        title: 'Tamamlanan İnceleme Filtreleri',
        onApply: async (values) => {
            completedFilters = {};
            completedSearch = '';

            if (values['status-filter']) {
                const statusValues = Array.isArray(values['status-filter'])
                    ? values['status-filter']
                    : [values['status-filter']];
                const valid = statusValues.filter((v) => v && v !== '');
                if (valid.length > 0) {
                    completedFilters.status__in = valid.join(',');
                }
            } else {
                completedFilters.status__in = COMPLETED_REVIEW_STATUS_CHOICES.map((s) => s.value).join(',');
            }
            if (values['job-order-filter']) {
                completedFilters.job_order = values['job-order-filter'];
            }
            if (values['released-by-filter']) {
                completedFilters.released_by = values['released-by-filter'];
            }
            if (values['reviewer-filter']) {
                completedFilters.reviewer = values['reviewer-filter'];
            }
            if (values['completed-from-filter']) {
                completedFilters.completed_at_after = values['completed-from-filter'];
            }
            if (values['completed-to-filter']) {
                completedFilters.completed_at_before = values['completed-to-filter'];
            }
            if (values['search-filter']) {
                completedSearch = values['search-filter'];
            }

            completedPage = 1;
            updateUrlParams({
                tab: 'completed',
                page: null,
                search: completedSearch || null,
                status__in: completedFilters.status__in || null,
            });
            await loadCompletedReviews();
        },
        onClear: async () => {
            completedFilters = { status__in: defaultStatusFilter.join(',') };
            completedSearch = '';
            completedPage = 1;
            updateUrlParams({ tab: 'completed', page: null, search: null, status__in: defaultStatusFilter.join(',') });
            await loadCompletedReviews();
        },
    });

    const initialStatusValue = urlParams.get('status__in')
        ? urlParams.get('status__in').split(',').filter((v) => v)
        : defaultStatusFilter;

    completedFiltersComponent.addDropdownFilter({
        id: 'status-filter',
        label: 'Sonuç',
        multiple: true,
        options: COMPLETED_REVIEW_STATUS_CHOICES.map((s) => ({ value: s.value, label: s.label })),
        placeholder: 'Sonuç seçin',
        value: initialStatusValue,
        colSize: 2,
    });

    completedFiltersComponent.addTextFilter({
        id: 'job-order-filter',
        label: 'İş Emri',
        placeholder: 'İş emri no',
        value: urlParams.get('job_order') || '',
        colSize: 2,
    });

    completedFiltersComponent.addDropdownFilter({
        id: 'released-by-filter',
        label: 'Oluşturan',
        options: userOptions,
        placeholder: 'Oluşturan seçin',
        value: urlParams.get('released_by') || '',
        colSize: 2,
    });

    completedFiltersComponent.addDropdownFilter({
        id: 'reviewer-filter',
        label: 'İnceleyen',
        options: userOptions,
        placeholder: 'İnceleyen seçin',
        value: urlParams.get('reviewer') || '',
        colSize: 2,
    });

    completedFiltersComponent.addTextFilter({
        id: 'completed-from-filter',
        label: 'Tamamlanma (Başlangıç)',
        type: 'date',
        value: urlParams.get('completed_at_after') || '',
        colSize: 2,
    });

    completedFiltersComponent.addTextFilter({
        id: 'completed-to-filter',
        label: 'Tamamlanma (Bitiş)',
        type: 'date',
        value: urlParams.get('completed_at_before') || '',
        colSize: 2,
    });

    completedFiltersComponent.addTextFilter({
        id: 'search-filter',
        label: 'Ara',
        placeholder: 'İş emri, başlık, değişiklik...',
        value: completedSearch,
        colSize: 2,
    });
}

function initializeCompletedTable() {
    const columns = [
        {
            field: 'job_order_no',
            label: 'İş Emri',
            sortable: true,
            width: '10%',
            formatter: (value) => escapeHtml(value || '-'),
        },
        {
            field: 'revision_code',
            label: 'Revizyon',
            sortable: false,
            width: '8%',
            formatter: (value, row) => escapeHtml(value || `Rev.${row.revision_number}`),
        },
        {
            field: 'released_by_name',
            label: 'Oluşturan',
            sortable: false,
            width: '10%',
            formatter: (value) => escapeHtml(value || '-'),
        },
        {
            field: 'status_display',
            label: 'Sonuç',
            sortable: false,
            width: '10%',
            formatter: (value, row) => formatStatusBadge(value, row),
        },
        {
            field: 'reviewers_summary',
            label: 'İnceleyenler',
            sortable: false,
            width: '16%',
            formatter: (value) => {
                if (!value) return '-';
                return value.length > 80 ? `${escapeHtml(value.substring(0, 80))}...` : escapeHtml(value);
            },
        },
        {
            field: 'folder_path',
            label: 'Klasör Yolu',
            sortable: false,
            width: '18%',
            formatter: (value, row) => formatFolderPathCell(value, row),
        },
        {
            field: 'review_completed_at',
            label: 'Tamamlanma',
            sortable: true,
            width: '10%',
            formatter: (value) => formatDateTime(value),
        },
    ];

    completedTable = new TableComponent('completed-reviews-table-container', {
        title: 'Tamamlanan İncelemeler',
        columns,
        data: [],
        loading: false,
        skeleton: true,
        skeletonRows: 5,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: completedPageSize,
        currentPage: completedPage,
        totalItems: 0,
        sortable: true,
        onSort: async (field, direction) => {
            let sortField = field;
            if (field === 'job_order_no') sortField = 'job_order__job_no';
            completedOrdering = direction === 'asc' ? sortField : `-${sortField}`;
            completedPage = 1;
            updateUrlParams({ tab: 'completed', page: null, ordering: completedOrdering });
            await loadCompletedReviews();
        },
        onPageChange: async (page) => {
            completedPage = page;
            updateUrlParams({ tab: 'completed', page: page > 1 ? page : null });
            await loadCompletedReviews();
        },
        onPageSizeChange: async (newPageSize) => {
            completedPageSize = newPageSize;
            completedPage = 1;
            updateUrlParams({ tab: 'completed', page: null, page_size: newPageSize !== 20 ? newPageSize : null });
            await loadCompletedReviews();
        },
        refreshable: true,
        onRefresh: loadCompletedReviews,
        actions: [
            {
                key: 'view',
                label: 'Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                onClick: (row) => showReleaseDetails(row),
            },
        ],
        striped: true,
        bordered: true,
        responsive: true,
    });
}

async function loadCompletedReviews() {
    if (completedLoading) return;
    completedLoading = true;

    try {
        completedTable?.setLoading(true);
        const response = await listCompletedReviewReleases(
            completedFilters,
            completedSearch,
            completedOrdering,
            completedPage,
            completedPageSize
        );
        completedReleases = response.results;
        totalCompletedReleases = response.count;
        completedTable?.updateData(completedReleases, totalCompletedReleases, completedPage);
        completedTable?.setLoading(false);
    } catch (error) {
        console.error('Error loading completed reviews:', error);
        showNotification('Tamamlanan incelemeler yüklenirken hata oluştu', 'error');
        completedTable?.setLoading(false);
    } finally {
        completedLoading = false;
    }
}

function initializePendingTable() {
    const columns = [
        {
            field: 'job_order_no',
            label: 'İş Emri',
            sortable: true,
            width: '10%',
            formatter: (value) => escapeHtml(value || '-')
        },
        {
            field: 'revision_code',
            label: 'Revizyon',
            sortable: false,
            width: '8%',
            formatter: (value, row) => escapeHtml(value || `Rev.${row.revision_number}`)
        },
        {
            field: 'released_by_name',
            label: 'Oluşturan',
            sortable: false,
            width: '12%',
            formatter: (value) => escapeHtml(value || '-')
        },
        {
            field: 'folder_path',
            label: 'Klasör Yolu',
            sortable: false,
            width: '22%',
            formatter: (value, row) => formatFolderPathCell(value, row)
        },
        {
            field: 'changelog',
            label: 'Değişiklikler',
            sortable: false,
            width: '22%',
            formatter: (value) => {
                if (!value) return '-';
                return value.length > 120 ? `${escapeHtml(value.substring(0, 120))}...` : escapeHtml(value);
            }
        },
        {
            field: 'approval_state',
            label: 'Değerlendirme',
            sortable: false,
            width: '8%',
            formatter: (value) => {
                if (!value) return '0/2';
                return `${value.approval_count || 0}/${value.required_count || 2}`;
            }
        },
        {
            field: 'released_at',
            label: 'Tarih',
            sortable: true,
            width: '10%',
            formatter: (value) => formatDateTime(value)
        }
    ];

    approvalsTable = new TableComponent('release-approvals-table-container', {
        title: 'İnceleme Bekleyen Yayınlar',
        columns,
        data: [],
        loading: true,
        skeleton: true,
        skeletonRows: 5,
        refreshable: true,
        onRefresh: loadPendingReleases,
        actions: [
            {
                key: 'view',
                label: 'İncele',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                onClick: (row) => showReleaseDetails(row)
            },
            {
                key: 'approve',
                label: 'Olumlu',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                onClick: (row) => showApproveModal(row),
                visible: (row) => row.can_approve === true
            },
            {
                key: 'reject',
                label: 'Reddet',
                icon: 'fas fa-times',
                class: 'btn-outline-danger',
                onClick: (row) => showRejectModal(row),
                visible: (row) => row.can_approve === true
            }
        ],
        striped: true,
        bordered: true,
        responsive: true
    });

    setupFolderPathCopyHandler();
}

async function loadPendingReleases() {
    try {
        approvalsTable.setLoading(true);
        pendingReleases = await listPendingApprovalReleases();
        approvalsTable.updateData(pendingReleases, pendingReleases.length);
        approvalsTable.setLoading(false);
    } catch (error) {
        console.error('Error loading pending releases:', error);
        showNotification('İnceleme bekleyen yayınlar yüklenirken hata oluştu', 'error');
        approvalsTable.setLoading(false);
    }
}

function setReleaseUrl(releaseId) {
    const url = new URL(window.location);
    url.searchParams.set('release_id', releaseId);
    window.history.pushState({}, '', url);
}

function renderApprovalFooter(release) {
    if (release.can_approve) {
        detailsModal.setFooterContent(`
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
                <i class="fas fa-times me-1"></i>Kapat
            </button>
            <button type="button" class="btn btn-sm btn-danger" id="reject-from-details-btn">
                <i class="fas fa-times me-1"></i>Reddet
            </button>
            <button type="button" class="btn btn-sm btn-success" id="approve-from-details-btn">
                <i class="fas fa-check me-1"></i>Olumlu
            </button>
        `);
    } else {
        detailsModal.setFooterContent(`
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
                <i class="fas fa-times me-1"></i>Kapat
            </button>
        `);
    }
}

function bindApprovalFooterActions(release) {
    if (!release.can_approve) return;
    const footer = detailsModal.modal?.querySelector('.modal-footer');
    footer?.querySelector('#approve-from-details-btn')
        ?.addEventListener('click', () => showApproveModal(release));
    footer?.querySelector('#reject-from-details-btn')
        ?.addEventListener('click', () => showRejectModal(release));
}

async function showReleaseDetails(release) {
    if (!detailsModal) return;

    const releaseId = release?.id || release;
    currentRelease = await getDrawingRelease(releaseId);
    setReleaseUrl(currentRelease.id);

    discussionPanel?.destroy();
    discussionPanel = null;
    detailsModal.clearData();

    const state = currentRelease.approval_state || {};
    const progress = `${state.approval_count || 0}/${state.required_count || 2}`;
    const rev = currentRelease.revision_code || currentRelease.revision_number;
    const isPending = currentRelease.status === 'pending_approval';
    const approvals = Array.isArray(currentRelease.approvals) ? currentRelease.approvals : [];
    const reviewersHtml = approvals.length
        ? `<ul class="mb-0 ps-3">${approvals.map((a) =>
            `<li>${escapeHtml(a.approver_name || '-')} — ${escapeHtml(a.decision_display || a.decision || '')} (${formatDateTime(a.created_at)})</li>`
        ).join('')}</ul>`
        : '<span class="text-muted">Kayıt yok</span>';

    detailsModal.setTitle(`${currentRelease.job_order_no || ''} — Rev.${rev}`);
    detailsModal.setIcon('fas fa-search');

    const infoHtml = `
        <div class="row g-2">
            <div class="col-md-4"><strong>İş Emri:</strong> ${escapeHtml(currentRelease.job_order_no || '-')}</div>
            <div class="col-md-8"><strong>Başlık:</strong> ${escapeHtml(currentRelease.job_order_title || '-')}</div>
            <div class="col-md-4"><strong>Oluşturan:</strong> ${escapeHtml(currentRelease.released_by_name || '-')}</div>
            <div class="col-md-4"><strong>Durum:</strong> ${formatStatusBadge(currentRelease.status_display, currentRelease)}</div>
            <div class="col-md-4"><strong>${isPending ? 'İnceleme' : 'Gönderim'}:</strong> ${isPending ? progress : formatDateTime(currentRelease.released_at)}</div>
            <div class="col-md-12"><strong>Klasör Yolu:</strong><br>${escapeHtml(currentRelease.folder_path || '-')}</div>
            <div class="col-md-12"><strong>Değişiklikler:</strong>
                <pre class="bg-light p-2 rounded mt-1 mb-0" style="white-space: pre-wrap;">${escapeHtml(currentRelease.changelog || '-')}</pre>
            </div>
            ${!isPending ? `<div class="col-md-12"><strong>İnceleyenler:</strong><div class="mt-1">${reviewersHtml}</div></div>` : ''}
        </div>
    `;

    detailsModal.addCustomSection({
        title: 'Yayın Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        customContent: infoHtml
    });

    if (currentRelease.release_topic_id) {
        detailsModal.addCustomSection({
            title: 'Tartışma',
            icon: 'fas fa-comments',
            iconColor: 'text-primary',
            customContent: `<div id="release-discussion-root"></div>`
        });
    } else {
        detailsModal.addCustomSection({
            title: 'Tartışma',
            icon: 'fas fa-comments',
            iconColor: 'text-muted',
            customContent: '<p class="text-muted mb-0">Bu yayın için tartışma konusu bulunamadı.</p>'
        });
    }

    renderApprovalFooter(currentRelease);
    detailsModal.render();
    detailsModal.show();
    bindApprovalFooterActions(currentRelease);

    if (currentRelease.release_topic_id) {
        const root = document.getElementById('release-discussion-root');
        if (root) {
            try {
                discussionPanel = await mountTopicDiscussion(root, currentRelease.release_topic_id, {
                    prefix: `release-${currentRelease.id}`,
                    showTopicBody: true
                });
            } catch (error) {
                console.error('Error loading discussion:', error);
                root.innerHTML = '<p class="text-danger">Tartışma yüklenirken hata oluştu.</p>';
            }
        }
    }
}

async function refreshReleaseDetails(releaseId) {
    await loadPendingReleases();
    const updated = await getDrawingRelease(releaseId);
    if (updated.status !== 'pending_approval') {
        detailsModal.hide();
        return;
    }
    await showReleaseDetails(updated);
}

function showApproveModal(release) {
    currentRelease = release;
    approveModal.show({
        message: 'Bu teknik çizim yayınını olumlu değerlendirmek istediğinizden emin misiniz?',
        confirmText: 'Evet, Olumlu',
        onConfirm: async () => {
            try {
                const response = await approveRelease(release.id, {});
                showNotification(response.message || 'Değerlendirmeniz kaydedildi', 'success');
                approveModal.hide();

                if (response.published) {
                    detailsModal.hide();
                    await loadPendingReleases();
                } else {
                    await refreshReleaseDetails(release.id);
                }
            } catch (error) {
                console.error('Error approving release:', error);
                showNotification('Değerlendirme kaydedilirken hata oluştu', 'error');
            }
        }
    });
}

function showRejectModal(release) {
    currentRelease = release;
    rejectModal.clearAll();
    rejectModal.addSection({
        title: 'Reddetme Nedeni',
        icon: 'fas fa-times-circle',
        iconColor: 'text-danger'
    });
    rejectModal.addField({
        id: 'rejection-reason',
        name: 'reason',
        label: 'Reddetme Nedeni',
        type: 'textarea',
        value: '',
        required: true,
        placeholder: 'Reddetme nedenini açıklayın...',
        icon: 'fas fa-comment',
        colSize: 12
    });
    rejectModal.render();
    rejectModal.show();
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    try {
        return new Date(dateString).toLocaleString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateString;
    }
}
