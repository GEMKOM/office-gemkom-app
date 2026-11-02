import { guardRoute, getUser } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { ConfirmationModal } from '../../components/confirmation-modal/confirmation-modal.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { FileAttachments } from '../../components/file-attachments/file-attachments.js';
import { FileViewer } from '../../components/file-viewer/file-viewer.js';
import { mountTopicDiscussion } from '../../components/topic-discussion/topic-discussion.js';
import { showNotification } from '../../components/notification/notification.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { fetchUsersDropdown } from '../../apis/users.js';
import { formatDate } from '../../apis/formatters.js';
import { escapeHtml, escapeHtmlWithBreaks } from '../../utils/text.js';
import { getUserInitials, getAvatarColor } from '../../utils/avatar.js';
import {
    listISGIssues,
    getISGIssue,
    getISGSummary,
    getISGMyPermissions,
    createISGIssue,
    updateISGIssue,
    startISGIssue,
    resolveISGIssue,
    closeISGIssue,
    reopenISGIssue,
    cancelISGIssue,
    listISGIssueFiles,
    uploadISGIssueFile,
    deleteISGIssueFile,
    ISG_CATEGORY_CHOICES,
    ISG_SEVERITY_CHOICES,
    ISG_STATUS_CHOICES,
    ISG_FILE_TYPE_OPTIONS,
    ISG_STATUS_BADGE,
    ISG_SEVERITY_BADGE
} from '../../apis/isg.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const urlParams = new URLSearchParams(window.location.search);

// Everything but the two terminal states: the page is a worklist first, an
// archive second, so a fresh visit shows what still needs somebody.
const DEFAULT_STATUS_FILTER = ['open', 'in_progress', 'resolved'];

let currentPage = parseInt(urlParams.get('page')) || 1;
let currentPageSize = parseInt(urlParams.get('page_size')) || 20;
let currentSearch = urlParams.get('search') || '';
let currentOrdering = urlParams.get('ordering') || '-created_at';
let currentFilters = {};
let issues = [];
let totalIssues = 0;
let isLoading = false;

let currentUser = null;
let myPermissions = { can_manage: false };
let assignableUsers = [];

// Components
let issuesStats = null;
let issuesFilters = null;
let issuesTable = null;
let confirmationModal = null;
let detailsModal = null;
let createModal = null;
let editModal = null;
let resolveModal = null;
let closeModal = null;
let reopenModal = null;
let fileUploadModal = null;

const fileViewer = new FileViewer();
let filesComponent = null;
let discussionPanel = null;
let openDetailsIssueId = null;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function statusBadge(status, label) {
    const info = ISG_STATUS_BADGE[status] || { class: 'status-grey', label: status };
    return `<span class="status-badge ${info.class}">${escapeHtml(label || info.label)}</span>`;
}

function severityBadge(severity, label) {
    const info = ISG_SEVERITY_BADGE[severity] || { class: 'status-grey', label: severity };
    return `<span class="status-badge ${info.class}">${escapeHtml(label || info.label)}</span>`;
}

function issueNumberBadge(value) {
    if (!value) return '-';
    return `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 0.95rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2); white-space: nowrap; display: inline-block;">${escapeHtml(value)}</span>`;
}

function userChip(user) {
    const name = user.name || user.username || '';
    return `<span class="d-inline-flex align-items-center gap-2 me-2 mb-1" style="background:#f1f3f5;border-radius:999px;padding:2px 10px 2px 2px;">
        <span style="width:24px;height:24px;border-radius:50%;background:${getAvatarColor(name)};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;">${escapeHtml(getUserInitials(name))}</span>
        <span style="font-size:0.85rem;color:#212529;">${escapeHtml(name)}</span>
    </span>`;
}

function assigneesHtml(row) {
    const people = row.assigned_to_data || [];
    if (!people.length) return '<span class="text-muted">-</span>';
    return people.map(userChip).join('');
}

/** Deadline cell: overdue days in red, days left in muted text. */
function dueDateHtml(value, row) {
    if (!value) return '<span class="text-muted">-</span>';
    const label = formatDate(value);
    if (row.is_overdue) {
        return `<span class="text-danger fw-semibold"><i class="fas fa-triangle-exclamation me-1"></i>${escapeHtml(label)}</span>`;
    }
    return `<span style="color:#495057;font-weight:500;">${escapeHtml(label)}</span>`;
}

/** Same thing for the detail modal, where a missing deadline must still show. */
function dueDateDetailHtml(issue) {
    if (!issue.due_date) return '<span class="text-muted">-</span>';
    const label = formatDate(issue.due_date);
    if (issue.is_overdue) {
        return `<span class="text-danger fw-semibold"><i class="fas fa-triangle-exclamation me-1"></i>${escapeHtml(label)} (gecikmiş)</span>`;
    }
    return escapeHtml(label);
}

function isAssignedToMe(row) {
    if (!currentUser) return false;
    return (row.assigned_to || []).some(id => Number(id) === Number(currentUser.id));
}

function canAct(row) {
    return myPermissions.can_manage || isAssignedToMe(row);
}

function updateUrlParams(updates) {
    const params = new URLSearchParams(window.location.search);
    Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '' || value === false) {
            params.delete(key);
        } else {
            params.set(key, value);
        }
    });
    const query = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();

    currentUser = await getUser();
    const [permsResult, usersResult] = await Promise.allSettled([
        getISGMyPermissions(),
        fetchUsersDropdown()
    ]);
    if (permsResult.status === 'fulfilled') myPermissions = permsResult.value;
    assignableUsers = usersResult.status === 'fulfilled' ? (usersResult.value || []) : [];

    readFiltersFromUrl();
    initializeComponents();
    await refreshAll();

    const issueParam = urlParams.get('issue');
    if (issueParam) {
        await openIssueByNumber(issueParam);
    }
});

function readFiltersFromUrl() {
    currentFilters = {};
    currentFilters.status__in = urlParams.get('status__in') || DEFAULT_STATUS_FILTER.join(',');
    if (urlParams.get('severity__in')) currentFilters.severity__in = urlParams.get('severity__in');
    if (urlParams.get('category')) currentFilters.category = urlParams.get('category');
    if (urlParams.get('assigned_to')) currentFilters.assigned_to = urlParams.get('assigned_to');
    if (urlParams.get('mine') === 'true') currentFilters.mine = 'true';
    if (urlParams.get('overdue') === 'true') currentFilters.overdue = 'true';
}

function initializeComponents() {
    new HeaderComponent({
        title: 'İSG Bildirimleri',
        subtitle: 'İş sağlığı ve güvenliği bulgularını takip edin ve kapatın',
        icon: 'helmet-safety',
        showBackButton: 'block',
        showCreateButton: myPermissions.can_manage ? 'block' : 'none',
        showRefreshButton: 'block',
        createButtonText: 'Yeni Bildirim',
        backUrl: '/isg',
        onBackClick: () => { window.location.href = '/isg'; },
        onCreateClick: () => showCreateModal(),
        onRefreshClick: async () => {
            currentPage = 1;
            updateUrlParams({ page: null });
            await refreshAll();
        }
    });

    issuesStats = new StatisticsCards('isg-statistics', { cards: [], itemsPerRow: 6, compact: true });

    initializeFilters();
    initializeTable();
    initializeModals();
}

function initializeFilters() {
    issuesFilters = new FiltersComponent('filters-placeholder', {
        title: 'Bildirim Filtreleri',
        onApply: async (values) => {
            applyFilterValues(values);
            currentPage = 1;
            await refreshAll();
        },
        onClear: async () => {
            currentFilters = { status__in: DEFAULT_STATUS_FILTER.join(',') };
            currentSearch = '';
            currentPage = 1;
            updateUrlParams({
                page: null, search: null, severity__in: null, category: null,
                assigned_to: null, mine: null, overdue: null,
                status__in: DEFAULT_STATUS_FILTER.join(',')
            });
            await refreshAll();
        }
    });

    issuesFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        multiple: true,
        options: ISG_STATUS_CHOICES,
        placeholder: 'Durum seçin',
        value: (currentFilters.status__in || '').split(',').filter(Boolean),
        colSize: 2
    });

    issuesFilters.addDropdownFilter({
        id: 'severity-filter',
        label: 'Önem',
        multiple: true,
        options: ISG_SEVERITY_CHOICES,
        placeholder: 'Önem seçin',
        value: (currentFilters.severity__in || '').split(',').filter(Boolean),
        colSize: 2
    });

    issuesFilters.addDropdownFilter({
        id: 'category-filter',
        label: 'Kategori',
        options: [{ value: '', label: 'Tümü' }, ...ISG_CATEGORY_CHOICES],
        placeholder: 'Kategori seçin',
        value: currentFilters.category || '',
        searchable: true,
        colSize: 2
    });

    issuesFilters.addDropdownFilter({
        id: 'assignee-filter',
        label: 'Atanan Kişi',
        options: [
            { value: '', label: 'Tümü' },
            ...assignableUsers.map(u => ({
                value: String(u.id),
                label: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username
            }))
        ],
        placeholder: 'Kişi seçin',
        value: currentFilters.assigned_to || '',
        searchable: true,
        colSize: 2
    });

    issuesFilters.addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'Bildirim no, başlık, yer...',
        value: currentSearch,
        colSize: 2
    });

    issuesFilters.addCheckboxFilter({
        id: 'mine-filter',
        label: 'Bana atananlar',
        checked: currentFilters.mine === 'true',
        colSize: 2
    });

    issuesFilters.addCheckboxFilter({
        id: 'overdue-filter',
        label: 'Gecikenler',
        checked: currentFilters.overdue === 'true',
        colSize: 2
    });
}

function applyFilterValues(values) {
    const next = {};

    const statuses = [].concat(values['status-filter'] || []).filter(Boolean);
    next.status__in = statuses.length
        ? statuses.join(',')
        : ISG_STATUS_CHOICES.map(s => s.value).join(',');

    const severities = [].concat(values['severity-filter'] || []).filter(Boolean);
    if (severities.length) next.severity__in = severities.join(',');
    if (values['category-filter']) next.category = values['category-filter'];
    if (values['assignee-filter']) next.assigned_to = values['assignee-filter'];
    if (values['mine-filter']) next.mine = 'true';
    if (values['overdue-filter']) next.overdue = 'true';

    currentFilters = next;
    currentSearch = values['search-filter'] || '';

    updateUrlParams({
        page: null,
        search: currentSearch || null,
        status__in: next.status__in,
        severity__in: next.severity__in || null,
        category: next.category || null,
        assigned_to: next.assigned_to || null,
        mine: next.mine || null,
        overdue: next.overdue || null
    });
}

function initializeTable() {
    const columns = [
        {
            field: 'issue_number',
            label: 'Bildirim No',
            sortable: true,
            width: '150px',
            formatter: (value) => issueNumberBadge(value)
        },
        {
            field: 'title',
            label: 'Başlık',
            sortable: true,
            width: '280px',
            formatter: (value) => `<div style="color:#212529;font-weight:600;font-size:0.95rem;line-height:1.4;word-wrap:break-word;">${escapeHtml(value || '-')}</div>`
        },
        {
            field: 'category_display',
            label: 'Kategori',
            sortable: false,
            width: '170px',
            formatter: (value) => value ? `<span class="status-badge status-grey">${escapeHtml(value)}</span>` : '-'
        },
        {
            field: 'severity',
            label: 'Önem',
            sortable: true,
            width: '110px',
            formatter: (value, row) => severityBadge(value, row.severity_display)
        },
        {
            field: 'status',
            label: 'Durum',
            sortable: true,
            width: '140px',
            formatter: (value, row) => statusBadge(value, row.status_display)
        },
        {
            field: 'location',
            label: 'Yer',
            sortable: false,
            width: '150px',
            formatter: (value) => value ? `<span style="color:#495057;">${escapeHtml(value)}</span>` : '<span class="text-muted">-</span>'
        },
        {
            field: 'assigned_to',
            label: 'Atananlar',
            sortable: false,
            width: '220px',
            formatter: (value, row) => assigneesHtml(row)
        },
        {
            field: 'due_date',
            label: 'Termin',
            sortable: true,
            width: '130px',
            formatter: (value, row) => dueDateHtml(value, row)
        },
        {
            field: 'file_count',
            label: 'Ek',
            sortable: false,
            width: '70px',
            formatter: (value) => {
                const count = parseInt(value) || 0;
                if (!count) return '<span class="text-muted">-</span>';
                return `<span class="text-muted"><i class="fas fa-paperclip me-1"></i>${count}</span>`;
            }
        },
        {
            field: 'created_at',
            label: 'Oluşturulma',
            sortable: true,
            width: '130px',
            formatter: (value) => value ? `<span class="text-dark" style="font-size:0.875rem;font-weight:500;">${formatDate(value)}</span>` : '-'
        }
    ];

    const actions = [
        {
            key: 'view',
            label: 'Detaylar',
            icon: 'fas fa-eye',
            class: 'btn-outline-info',
            onClick: (row) => showIssueDetails(row.id)
        },
        {
            key: 'start',
            label: 'İşleme Al',
            icon: 'fas fa-play',
            class: 'btn-outline-primary',
            visible: (row) => row.status === 'open' && canAct(row),
            onClick: (row) => handleStart(row)
        },
        {
            key: 'resolve',
            label: 'Giderildi',
            icon: 'fas fa-check',
            class: 'btn-outline-success',
            visible: (row) => ['open', 'in_progress'].includes(row.status) && canAct(row),
            onClick: (row) => showResolveModal(row)
        },
        {
            key: 'edit',
            label: 'Düzenle',
            icon: 'fas fa-edit',
            class: 'btn-outline-secondary',
            visible: () => myPermissions.can_manage,
            onClick: (row) => showEditModal(row.id)
        },
        {
            key: 'close',
            label: 'Kapat',
            icon: 'fas fa-lock',
            class: 'btn-outline-success',
            visible: (row) => myPermissions.can_manage && ['open', 'in_progress', 'resolved'].includes(row.status),
            onClick: (row) => showCloseModal(row)
        },
        {
            key: 'reopen',
            label: 'Yeniden Aç',
            icon: 'fas fa-rotate-left',
            class: 'btn-outline-primary',
            visible: (row) => myPermissions.can_manage && ['resolved', 'closed', 'cancelled'].includes(row.status),
            onClick: (row) => showReopenModal(row)
        },
        {
            key: 'cancel',
            label: 'İptal Et',
            icon: 'fas fa-ban',
            class: 'btn-outline-danger',
            visible: (row) => myPermissions.can_manage && ['open', 'in_progress', 'resolved'].includes(row.status),
            onClick: (row) => handleCancel(row)
        }
    ];

    issuesTable = new TableComponent('isg-issues-table-container', {
        title: 'İSG Bildirimleri',
        icon: 'fas fa-helmet-safety',
        iconColor: 'text-primary',
        columns,
        data: issues,
        actions,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: currentPageSize,
        currentPage,
        totalItems: totalIssues,
        sortable: true,
        refreshable: true,
        exportable: false,
        emptyMessage: 'İSG bildirimi bulunamadı.',
        emptyIcon: 'fas fa-helmet-safety',
        onSort: async (field, direction) => {
            currentOrdering = direction === 'asc' ? field : `-${field}`;
            currentPage = 1;
            updateUrlParams({ page: null, ordering: currentOrdering });
            await loadIssues();
        },
        onPageChange: async (page) => {
            currentPage = page;
            updateUrlParams({ page: page > 1 ? page : null });
            await loadIssues();
        },
        onPageSizeChange: async (size) => {
            currentPageSize = size;
            currentPage = 1;
            updateUrlParams({ page: null, page_size: size });
            await loadIssues();
        },
        onRefresh: async () => { await loadIssues(); }
    });
}

function initializeModals() {
    confirmationModal = new ConfirmationModal('confirmation-modal-container', {
        confirmButtonClass: 'btn-danger'
    });
    detailsModal = new DisplayModal('isg-details-modal-container', { fullscreen: true });
    detailsModal.onCloseCallback(() => {
        discussionPanel?.destroy?.();
        discussionPanel = null;
        filesComponent = null;
        openDetailsIssueId = null;
        updateUrlParams({ issue: null });
    });

    createModal = new EditModal('isg-create-modal-container', {
        title: 'Yeni İSG Bildirimi', icon: 'fas fa-helmet-safety', saveButtonText: 'Oluştur', size: 'xl'
    });
    editModal = new EditModal('isg-edit-modal-container', {
        title: 'İSG Bildirimini Düzenle', icon: 'fas fa-edit', saveButtonText: 'Kaydet', size: 'xl'
    });
    resolveModal = new EditModal('isg-resolve-modal-container', {
        title: 'Giderildi Olarak İşaretle', icon: 'fas fa-check', saveButtonText: 'Gönder', size: 'lg'
    });
    closeModal = new EditModal('isg-close-modal-container', {
        title: 'Bildirimi Kapat', icon: 'fas fa-lock', saveButtonText: 'Kapat', size: 'lg'
    });
    reopenModal = new EditModal('isg-reopen-modal-container', {
        title: 'Bildirimi Yeniden Aç', icon: 'fas fa-rotate-left', saveButtonText: 'Yeniden Aç', size: 'lg'
    });
    fileUploadModal = new EditModal('isg-file-upload-modal-container', {
        title: 'Dosya Yükle', icon: 'fas fa-upload', saveButtonText: 'Yükle', size: 'md'
    });
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadIssues() {
    if (isLoading) return;
    isLoading = true;
    try {
        issuesTable?.setLoading(true);
        const response = await listISGIssues(
            currentFilters, currentSearch, currentOrdering, currentPage, currentPageSize
        );
        issues = response.results;
        totalIssues = response.count;
        issuesTable?.updateData(issues, totalIssues, currentPage);
    } catch (error) {
        console.error('Error loading İSG issues:', error);
        issues = [];
        totalIssues = 0;
        issuesTable?.updateData([], 0, 1);
        showNotification(error.message || 'İSG bildirimleri yüklenirken hata oluştu', 'error');
    } finally {
        issuesTable?.setLoading(false);
        isLoading = false;
    }
}

async function loadSummary() {
    try {
        // Counters follow the filters, minus the status filter — otherwise the
        // "Kapatıldı" card would always read 0 under the default worklist view.
        const { status__in, ...rest } = currentFilters;
        const summary = await getISGSummary(rest, currentSearch);
        issuesStats.setCards([
            { title: 'Toplam', value: summary.total ?? 0, icon: 'fas fa-list', color: 'secondary' },
            { title: 'Açık', value: summary.open ?? 0, icon: 'fas fa-folder-open', color: 'danger' },
            { title: 'Devam Eden', value: summary.in_progress ?? 0, icon: 'fas fa-person-digging', color: 'primary' },
            { title: 'Onay Bekleyen', value: summary.resolved ?? 0, icon: 'fas fa-hourglass-half', color: 'info' },
            { title: 'Geciken', value: summary.overdue ?? 0, icon: 'fas fa-triangle-exclamation', color: 'danger' },
            { title: 'Bana Atanan', value: summary.mine_open ?? 0, icon: 'fas fa-user-shield', color: 'dark' }
        ]);
    } catch (error) {
        console.error('Error loading İSG summary:', error);
    }
}

async function refreshAll() {
    await Promise.all([loadIssues(), loadSummary()]);
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

function userDropdownOptions() {
    return assignableUsers.map(u => ({
        value: String(u.id),
        label: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username
    }));
}

function buildIssueFormSections(modal, issue = null) {
    modal.clearAll();
    modal
        .addSection({
            title: 'Bulgu',
            icon: 'fas fa-triangle-exclamation',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'title', name: 'title', label: 'Başlık', type: 'text', required: true,
                    placeholder: 'Örn. Kaynakhanede baret kullanılmıyor',
                    value: issue?.title || '', colSize: 12
                },
                {
                    id: 'description', name: 'description', label: 'Açıklama', type: 'textarea', required: true,
                    placeholder: 'Bulgunun detayı, ne zaman ve nasıl tespit edildiği',
                    rows: 4, value: issue?.description || '', colSize: 12
                }
            ]
        })
        .addSection({
            title: 'Sınıflandırma',
            icon: 'fas fa-tags',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'category', name: 'category', label: 'Kategori', type: 'dropdown', required: true,
                    searchable: true, options: ISG_CATEGORY_CHOICES,
                    value: issue?.category || 'other', colSize: 6
                },
                {
                    id: 'severity', name: 'severity', label: 'Önem Derecesi', type: 'dropdown', required: true,
                    options: ISG_SEVERITY_CHOICES, value: issue?.severity || 'medium', colSize: 6
                },
                {
                    id: 'location', name: 'location', label: 'Yer', type: 'text',
                    placeholder: 'Örn. Kaynakhane B blok', value: issue?.location || '', colSize: 6
                },
                {
                    id: 'due_date', name: 'due_date', label: 'Termin Tarihi', type: 'date',
                    value: issue?.due_date || '', colSize: 6
                }
            ]
        })
        .addSection({
            title: 'Atama',
            icon: 'fas fa-users',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'assigned_to', name: 'assigned_to', label: 'Atanan Kişiler', type: 'dropdown',
                    required: true, multiple: true, searchable: true,
                    options: userDropdownOptions(),
                    placeholder: 'Bir veya daha fazla kişi seçin',
                    value: (issue?.assigned_to || []).map(String),
                    colSize: 12
                }
            ]
        });
}

function normalizeIssuePayload(formData) {
    const assigned = [].concat(formData.assigned_to || [])
        .map(v => parseInt(v, 10))
        .filter(Number.isFinite);
    return {
        title: (formData.title || '').trim(),
        description: (formData.description || '').trim(),
        category: formData.category || 'other',
        severity: formData.severity || 'medium',
        location: (formData.location || '').trim(),
        due_date: formData.due_date || null,
        assigned_to: assigned
    };
}

function showCreateModal() {
    if (!myPermissions.can_manage) {
        showNotification('İSG bildirimi oluşturma yetkiniz yok.', 'warning');
        return;
    }
    buildIssueFormSections(createModal);
    createModal.render();
    createModal.onSave = async (formData) => {
        const payload = normalizeIssuePayload(formData);
        if (!payload.assigned_to.length) {
            showNotification('En az bir kişi atamalısınız', 'warning');
            return;
        }
        try {
            const created = await createISGIssue(payload);
            showNotification(`${created.issue_number} oluşturuldu`, 'success');
            createModal.hide();
            await refreshAll();
            await showIssueDetails(created.id);
        } catch (error) {
            console.error('Error creating İSG issue:', error);
            showNotification(error.message || 'Bildirim oluşturulurken hata oluştu', 'error');
        }
    };
    createModal.show();
}

async function showEditModal(issueId) {
    if (!myPermissions.can_manage) {
        showNotification('Bu bildirimi düzenleme yetkiniz yok.', 'warning');
        return;
    }
    try {
        const issue = await getISGIssue(issueId);
        buildIssueFormSections(editModal, issue);
        editModal.render();
        editModal.onSave = async (formData) => {
            const payload = normalizeIssuePayload(formData);
            if (!payload.assigned_to.length) {
                showNotification('En az bir kişi atamalısınız', 'warning');
                return;
            }
            try {
                await updateISGIssue(issueId, payload);
                showNotification('Bildirim güncellendi', 'success');
                editModal.hide();
                await refreshAll();
                if (isDetailsOpenFor(issueId)) await showIssueDetails(issueId);
            } catch (error) {
                console.error('Error updating İSG issue:', error);
                showNotification(error.message || 'Bildirim güncellenirken hata oluştu', 'error');
            }
        };
        editModal.show();
    } catch (error) {
        console.error('Error loading İSG issue for edit:', error);
        showNotification(error.message || 'Bildirim yüklenirken hata oluştu', 'error');
    }
}

// ---------------------------------------------------------------------------
// Workflow actions
// ---------------------------------------------------------------------------

function isDetailsOpenFor(issueId) {
    return openDetailsIssueId === issueId;
}

async function handleStart(row) {
    try {
        await startISGIssue(row.id);
        showNotification('Bildirim işleme alındı', 'success');
        await refreshAll();
        if (isDetailsOpenFor(row.id)) await showIssueDetails(row.id);
    } catch (error) {
        console.error('Error starting İSG issue:', error);
        showNotification(error.message || 'İşlem tamamlanamadı', 'error');
    }
}

function showResolveModal(row) {
    resolveModal.clearAll();
    resolveModal.addSection({
        title: 'Yapılan İşlem',
        icon: 'fas fa-screwdriver-wrench',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'corrective_action', name: 'corrective_action',
                label: 'Ne yapıldı?', type: 'textarea', required: true, rows: 4,
                placeholder: 'Alınan aksiyonu kısaca açıklayın. İSG bu açıklamayı doğrulayıp bildirimi kapatacak.',
                colSize: 12
            }
        ]
    });
    resolveModal.render();
    resolveModal.onSave = async (formData) => {
        const text = (formData.corrective_action || '').trim();
        if (!text) {
            showNotification('Yapılan işlemi yazmanız gerekiyor', 'warning');
            return;
        }
        try {
            await resolveISGIssue(row.id, text);
            showNotification('Bildirim İSG onayına gönderildi', 'success');
            resolveModal.hide();
            await refreshAll();
            if (isDetailsOpenFor(row.id)) await showIssueDetails(row.id);
        } catch (error) {
            console.error('Error resolving İSG issue:', error);
            showNotification(error.message || 'İşlem tamamlanamadı', 'error');
        }
    };
    resolveModal.show();
}

function showCloseModal(row) {
    closeModal.clearAll();
    closeModal.addSection({
        title: 'Kapanış',
        icon: 'fas fa-lock',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'closing_note', name: 'closing_note',
                label: 'Kapanış Notu', type: 'textarea', rows: 3,
                placeholder: 'Doğrulama notu (opsiyonel)',
                colSize: 12
            }
        ]
    });
    closeModal.render();
    closeModal.onSave = async (formData) => {
        try {
            await closeISGIssue(row.id, (formData.closing_note || '').trim());
            showNotification('Bildirim kapatıldı', 'success');
            closeModal.hide();
            await refreshAll();
            if (isDetailsOpenFor(row.id)) await showIssueDetails(row.id);
        } catch (error) {
            console.error('Error closing İSG issue:', error);
            showNotification(error.message || 'İşlem tamamlanamadı', 'error');
        }
    };
    closeModal.show();
}

function showReopenModal(row) {
    reopenModal.clearAll();
    reopenModal.addSection({
        title: 'Yeniden Açma',
        icon: 'fas fa-rotate-left',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'comment', name: 'comment', label: 'Gerekçe', type: 'textarea', rows: 3,
                placeholder: 'Neden yeniden açılıyor? Atananlara bildirim olarak gider.',
                colSize: 12
            },
            {
                id: 'due_date', name: 'due_date', label: 'Yeni Termin (opsiyonel)', type: 'date',
                value: row.due_date || '', colSize: 6
            }
        ]
    });
    reopenModal.render();
    reopenModal.onSave = async (formData) => {
        try {
            await reopenISGIssue(row.id, (formData.comment || '').trim(), formData.due_date || null);
            showNotification('Bildirim yeniden açıldı', 'success');
            reopenModal.hide();
            await refreshAll();
            if (isDetailsOpenFor(row.id)) await showIssueDetails(row.id);
        } catch (error) {
            console.error('Error reopening İSG issue:', error);
            showNotification(error.message || 'İşlem tamamlanamadı', 'error');
        }
    };
    reopenModal.show();
}

function handleCancel(row) {
    confirmationModal.show({
        title: 'Bildirimi İptal Et',
        message: `${row.issue_number} numaralı bildirimi iptal etmek istiyor musunuz?`,
        confirmText: 'Evet, İptal Et',
        confirmButtonClass: 'btn-danger',
        onConfirm: async () => {
            try {
                await cancelISGIssue(row.id);
                showNotification('Bildirim iptal edildi', 'success');
                await refreshAll();
                if (isDetailsOpenFor(row.id)) await showIssueDetails(row.id);
            } catch (error) {
                console.error('Error cancelling İSG issue:', error);
                showNotification(error.message || 'İşlem tamamlanamadı', 'error');
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

function getFileExtension(fileName) {
    if (!fileName) return '';
    const name = String(fileName);
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1) return '';
    return name.slice(dot + 1).toLowerCase();
}

function normalizeIssueFile(file) {
    const fileUrl = file?.url || file?.file_url || file?.file || '';
    const rawName = file?.name || 'Dosya';
    // `name` may be a free-text title with no extension; the viewer needs one
    // to pick a preview mode, and the serializer always sends the real one.
    const extension = String(file?.extension || '').replace(/^\./, '').toLowerCase() || getFileExtension(rawName);
    const fileName = (extension && !rawName.toLowerCase().endsWith(`.${extension}`))
        ? `${rawName}.${extension}`
        : rawName;
    return {
        id: file.id,
        file_url: fileUrl,
        file_name: fileName,
        file_extension: extension,
        // FileAttachments prints "Tür: … • İsim: …" from these two; without
        // them every card reads "Tür: - • İsim: -".
        file_type_display: file.file_type_display || '-',
        display_name: file.description || file.name || '-',
        uploaded_at: file.uploaded_at,
        uploaded_by_username: file.uploaded_by_name || ''
    };
}

async function downloadFile(fileUrl, fileName) {
    if (!fileUrl) {
        showNotification('Dosya URL bulunamadı', 'warning');
        return;
    }
    try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || 'Dosya';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading file:', error);
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = fileName || 'Dosya';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

async function downloadAllAsZip(files, issueNumber) {
    if (!window.JSZip) {
        showNotification('JSZip kütüphanesi yüklenemedi', 'error');
        return;
    }
    if (!files.length) {
        showNotification('İndirilecek dosya yok', 'warning');
        return;
    }
    try {
        showNotification('Dosyalar indiriliyor...', 'info');
        const zip = new JSZip();
        const folderName = String(issueNumber || 'ISG').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
        const folder = zip.folder(folderName);
        const used = new Set();
        let added = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file.file_url) continue;
            try {
                const response = await fetch(file.file_url);
                if (!response.ok) continue;
                const blob = await response.blob();
                let name = (file.file_name || `dosya_${i + 1}`).replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
                while (used.has(name)) {
                    const ext = getFileExtension(name);
                    const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
                    name = ext ? `${stem} (${i + 1}).${ext}` : `${stem} (${i + 1})`;
                }
                used.add(name);
                folder.file(name, blob);
                added += 1;
            } catch (error) {
                console.error('Error fetching file for zip:', error);
            }
        }

        if (!added) {
            showNotification('Zip içine eklenecek geçerli dosya bulunamadı', 'warning');
            return;
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = window.URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${folderName}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        showNotification(`${added} dosya zip olarak indirildi`, 'success');
    } catch (error) {
        console.error('Error creating zip file:', error);
        showNotification('Zip dosyası oluşturulurken hata oluştu', 'error');
    }
}

async function refreshFilesUI(issue) {
    const container = document.getElementById('isg-files-list');
    if (!container) return;

    container.innerHTML = '<div class="text-center text-muted py-3"><i class="fas fa-spinner fa-spin me-2"></i>Dosyalar yükleniyor...</div>';

    let files = [];
    try {
        const data = await listISGIssueFiles(issue.id);
        const raw = Array.isArray(data) ? data : (data.results || []);
        files = raw.map(normalizeIssueFile);
    } catch (error) {
        console.error('Failed to load İSG files:', error);
        container.innerHTML = '<div class="text-danger small py-2">Dosyalar yüklenemedi.</div>';
        return;
    }

    if (!files.length) {
        container.innerHTML = '<div class="text-muted small py-2">Henüz dosya yok.</div>';
        return;
    }

    if (!filesComponent) {
        filesComponent = new FileAttachments('isg-files-list', {
            title: 'Dosyalar',
            showTitle: false,
            layout: 'grid',
            showDeleteButton: true,
            onFileClick: (file) => {
                if (!file.file_url) {
                    showNotification('Dosya URL bulunamadı', 'warning');
                    return;
                }
                fileViewer.openFile(
                    file.file_url,
                    file.file_name || 'Dosya',
                    file.file_extension || getFileExtension(file.file_name)
                );
            },
            onDownloadClick: downloadFile,
            onDeleteClick: (file) => {
                confirmationModal.show({
                    title: 'Dosya Sil',
                    message: 'Bu dosyayı silmek istiyor musunuz?',
                    confirmText: 'Sil',
                    confirmButtonClass: 'btn-danger',
                    onConfirm: async () => {
                        try {
                            await deleteISGIssueFile(issue.id, file.id);
                            showNotification('Dosya silindi', 'success');
                            await refreshFilesUI(issue);
                        } catch (error) {
                            console.error('Error deleting İSG file:', error);
                            showNotification(error.message || 'Dosya silinirken hata oluştu', 'error');
                        }
                    }
                });
            }
        });
    }

    filesComponent.setFiles(files);
}

function showFileUploadModal(issue, onSuccess) {
    fileUploadModal.clearAll();
    fileUploadModal.addSection({ title: 'Dosya Bilgileri', icon: 'fas fa-file', iconColor: 'text-primary' });
    fileUploadModal.addField({
        id: 'file_type', name: 'file_type', label: 'Dosya Türü', type: 'dropdown',
        required: true, options: ISG_FILE_TYPE_OPTIONS, value: 'photo', icon: 'fas fa-tag', colSize: 6
    });
    fileUploadModal.addField({
        id: 'name', name: 'name', label: 'Dosya Adı', type: 'text',
        placeholder: 'Opsiyonel (tüm dosyalar için)', icon: 'fas fa-heading', colSize: 6
    });
    fileUploadModal.addField({
        id: 'description', name: 'description', label: 'Açıklama', type: 'textarea',
        placeholder: 'Opsiyonel', icon: 'fas fa-align-left', colSize: 12
    });

    fileUploadModal.onSave = async (formData) => {
        const input = document.getElementById('isg-file-input-field');
        const selected = input?.files;
        if (!selected || !selected.length) {
            showNotification('Lütfen en az bir dosya seçin', 'warning');
            return;
        }
        fileUploadModal.setLoading(true);
        let ok = 0;
        let failed = 0;
        for (const file of selected) {
            try {
                await uploadISGIssueFile(issue.id, file, formData.file_type, formData.name, formData.description);
                ok += 1;
            } catch (error) {
                console.error(`Error uploading ${file.name}:`, error);
                failed += 1;
            }
        }
        fileUploadModal.setLoading(false);

        if (ok && !failed) {
            fileUploadModal.hide();
            showNotification(`${ok} dosya yüklendi`, 'success');
            await onSuccess?.();
        } else if (ok && failed) {
            fileUploadModal.hide();
            showNotification(`${ok} dosya yüklendi, ${failed} dosya yüklenemedi`, 'warning');
            await onSuccess?.();
        } else {
            showNotification('Dosyalar yüklenemedi', 'error');
        }
    };

    fileUploadModal.render();

    const body = fileUploadModal.container?.querySelector('.modal-body');
    if (body) {
        const wrapper = document.createElement('div');
        wrapper.className = 'mb-3 px-3';
        wrapper.innerHTML = `
            <label class="form-label">Dosyalar (birden fazla seçebilirsiniz)</label>
            <input type="file" class="form-control" id="isg-file-input-field" multiple>
            <div id="isg-selected-files-list" class="mt-2"></div>
        `;
        body.insertBefore(wrapper, body.firstChild);

        const input = wrapper.querySelector('#isg-file-input-field');
        const list = wrapper.querySelector('#isg-selected-files-list');
        input.addEventListener('change', (e) => {
            const selected = Array.from(e.target.files || []);
            if (!selected.length) {
                list.innerHTML = '';
                return;
            }
            list.innerHTML = `<div class="mt-2"><strong>Seçilen dosyalar (${selected.length}):</strong>${
                selected.map(f => `
                    <div class="d-flex align-items-center gap-2 p-2 border rounded mb-1">
                        <i class="fas fa-file text-primary"></i>
                        <span class="flex-grow-1">${escapeHtml(f.name)}</span>
                        <small class="text-muted">${(f.size / 1024).toFixed(1)} KB</small>
                    </div>
                `).join('')
            }</div>`;
        });
    }

    fileUploadModal.show();
}

// ---------------------------------------------------------------------------
// Details modal
// ---------------------------------------------------------------------------

async function openIssueByNumber(issueNumber) {
    try {
        const response = await listISGIssues({}, issueNumber, '-created_at', 1, 5);
        const match = (response.results || []).find(i => i.issue_number === issueNumber);
        if (!match) {
            showNotification('Bildirim bulunamadı', 'warning');
            updateUrlParams({ issue: null });
            return;
        }
        await showIssueDetails(match.id);
    } catch (error) {
        console.error('Error opening İSG issue from URL:', error);
        updateUrlParams({ issue: null });
    }
}

async function showIssueDetails(issueId) {
    let issue;
    try {
        issue = await getISGIssue(issueId);
    } catch (error) {
        console.error('Error loading İSG issue details:', error);
        showNotification(error.message || 'Bildirim detayları yüklenirken hata oluştu', 'error');
        return;
    }

    openDetailsIssueId = issue.id;
    updateUrlParams({ issue: issue.issue_number });

    // Re-rendering the modal throws away the nodes these were bound to.
    discussionPanel?.destroy?.();
    discussionPanel = null;
    filesComponent = null;

    detailsModal.clearData();
    detailsModal.setTitle(`${issue.issue_number} — ${issue.title}`);

    detailsModal.addSection({
        title: 'Genel Bilgiler',
        icon: 'fas fa-circle-info',
        fields: [
            // .field-value is a flex container and .status-badge carries
            // `margin: 0 auto`, so a bare badge would centre itself in the cell.
            { label: 'Durum', value: issue.status, colSize: 4, format: (v) => `<span>${statusBadge(v, issue.status_display)}</span>` },
            { label: 'Önem Derecesi', value: issue.severity, colSize: 4, format: (v) => `<span>${severityBadge(v, issue.severity_display)}</span>` },
            { label: 'Kategori', value: issue.category_display || '-', colSize: 4 },
            { label: 'Yer', value: issue.location || '-', colSize: 4 },
            { label: 'Termin', value: dueDateDetailHtml(issue), colSize: 4, format: (v) => v },
            { label: 'Bildiren', value: issue.created_by_name || '-', colSize: 4 },
            { label: 'Oluşturulma', value: issue.created_at, colSize: 4, type: 'datetime' },
            {
                label: 'Açıklama', value: issue.description || '-', colSize: 12,
                format: (v) => `<div style="white-space:normal;line-height:1.6;">${escapeHtmlWithBreaks(v)}</div>`
            }
        ]
    });

    detailsModal.addCustomSection({
        title: 'Atanan Kişiler',
        icon: 'fas fa-users',
        iconColor: 'text-primary',
        customContent: `<div class="d-flex flex-wrap">${assigneesHtml(issue)}</div>`
    });

    if (issue.corrective_action || issue.resolved_at) {
        detailsModal.addSection({
            title: 'Yapılan İşlem',
            icon: 'fas fa-screwdriver-wrench',
            fields: [
                {
                    label: 'Açıklama', value: issue.corrective_action || '-', colSize: 12,
                    format: (v) => `<div style="white-space:normal;line-height:1.6;">${escapeHtmlWithBreaks(v)}</div>`
                },
                { label: 'Bildiren', value: issue.resolved_by_name || '-', colSize: 6 },
                { label: 'Tarih', value: issue.resolved_at, colSize: 6, type: 'datetime' }
            ]
        });
    }

    if (issue.closed_at) {
        detailsModal.addSection({
            title: 'Kapanış',
            icon: 'fas fa-lock',
            fields: [
                {
                    label: 'Kapanış Notu', value: issue.closing_note || '-', colSize: 12,
                    format: (v) => `<div style="white-space:normal;line-height:1.6;">${escapeHtmlWithBreaks(v)}</div>`
                },
                { label: 'Kapatan', value: issue.closed_by_name || '-', colSize: 6 },
                { label: 'Tarih', value: issue.closed_at, colSize: 6, type: 'datetime' }
            ]
        });
    }

    const canUpload = canAct(issue);
    detailsModal.addCustomSection({
        title: 'Dosyalar',
        icon: 'fas fa-paperclip',
        iconColor: 'text-muted',
        customContent: `
            <div class="d-flex align-items-center justify-content-between mb-2">
                <div class="text-muted small">Bulgu fotoğrafları ve ilgili dokümanlar</div>
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-sm btn-outline-success" id="isg-files-download-all-btn">
                        <i class="fas fa-download me-1"></i>Tümünü İndir (ZIP)
                    </button>
                    ${canUpload ? `
                    <button type="button" class="btn btn-sm btn-outline-primary" id="isg-files-upload-btn">
                        <i class="fas fa-upload me-1"></i>Dosya Yükle
                    </button>` : ''}
                </div>
            </div>
            <div id="isg-files-list"></div>
        `
    });

    detailsModal.addCustomSection({
        title: 'Tartışma',
        icon: 'fas fa-comments',
        iconColor: 'text-primary',
        customContent: issue.discussion_topic_id
            ? '<div id="isg-discussion-root"></div>'
            : '<p class="text-muted mb-0">Bu bildirim için tartışma konusu bulunamadı.</p>'
    });

    detailsModal.setFooterContent(buildDetailsFooter(issue));
    detailsModal.render();
    detailsModal.show();

    bindDetailsFooter(issue);

    const uploadBtn = document.getElementById('isg-files-upload-btn');
    if (uploadBtn) {
        uploadBtn.onclick = (e) => {
            e.preventDefault();
            showFileUploadModal(issue, () => refreshFilesUI(issue));
        };
    }

    const downloadAllBtn = document.getElementById('isg-files-download-all-btn');
    if (downloadAllBtn) {
        downloadAllBtn.onclick = async (e) => {
            e.preventDefault();
            try {
                const data = await listISGIssueFiles(issue.id);
                const raw = Array.isArray(data) ? data : (data.results || []);
                await downloadAllAsZip(raw.map(normalizeIssueFile), issue.issue_number);
            } catch (error) {
                console.error('Error loading files for download:', error);
                showNotification('Dosyalar yüklenirken hata oluştu', 'error');
            }
        };
    }

    await refreshFilesUI(issue);

    if (issue.discussion_topic_id) {
        const root = document.getElementById('isg-discussion-root');
        if (root) {
            try {
                discussionPanel = await mountTopicDiscussion(root, issue.discussion_topic_id, {
                    prefix: `isg-${issue.id}`,
                    showTopicBody: false
                });
            } catch (error) {
                console.error('Error mounting İSG discussion:', error);
                root.innerHTML = '<p class="text-danger mb-0">Tartışma yüklenirken hata oluştu.</p>';
            }
        }
    }
}

function buildDetailsFooter(issue) {
    const buttons = ['<button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal"><i class="fas fa-times me-1"></i>Kapat</button>'];

    if (issue.status === 'open' && canAct(issue)) {
        buttons.push('<button type="button" class="btn btn-sm btn-outline-primary" id="isg-details-start-btn"><i class="fas fa-play me-1"></i>İşleme Al</button>');
    }
    if (['open', 'in_progress'].includes(issue.status) && canAct(issue)) {
        buttons.push('<button type="button" class="btn btn-sm btn-outline-success" id="isg-details-resolve-btn"><i class="fas fa-check me-1"></i>Giderildi</button>');
    }
    if (myPermissions.can_manage) {
        buttons.push('<button type="button" class="btn btn-sm btn-outline-secondary" id="isg-details-edit-btn"><i class="fas fa-edit me-1"></i>Düzenle</button>');
        if (['resolved', 'closed', 'cancelled'].includes(issue.status)) {
            buttons.push('<button type="button" class="btn btn-sm btn-outline-primary" id="isg-details-reopen-btn"><i class="fas fa-rotate-left me-1"></i>Yeniden Aç</button>');
        }
        if (['open', 'in_progress', 'resolved'].includes(issue.status)) {
            buttons.push('<button type="button" class="btn btn-sm btn-success" id="isg-details-close-btn"><i class="fas fa-lock me-1"></i>Kapat ve Onayla</button>');
        }
    }

    return buttons.join('\n');
}

function bindDetailsFooter(issue) {
    const bind = (id, handler) => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = handler;
    };
    bind('isg-details-start-btn', () => handleStart(issue));
    bind('isg-details-resolve-btn', () => showResolveModal(issue));
    bind('isg-details-edit-btn', () => showEditModal(issue.id));
    bind('isg-details-reopen-btn', () => showReopenModal(issue));
    bind('isg-details-close-btn', () => showCloseModal(issue));
}
