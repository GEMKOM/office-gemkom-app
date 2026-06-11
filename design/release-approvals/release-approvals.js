import { initNavbar } from '../../../components/navbar.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { mountTopicDiscussion } from '../../../components/topic-discussion/topic-discussion.js';
import {
    listPendingApprovalReleases,
    approveRelease,
    rejectRelease,
    getDrawingRelease
} from '../../../apis/projects/design.js';
import { showNotification } from '../../../components/notification/notification.js';

let headerComponent;
let approvalsTable;
let detailsModal;
let approveModal;
let rejectModal;
let pendingReleases = [];
let currentRelease = null;
let discussionPanel = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    initHeaderComponent();
    initializeModalComponents();
    initializeTable();
    await loadPendingReleases();

    const urlParams = new URLSearchParams(window.location.search);
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
        subtitle: 'Tasarım ekibinin incelemesini bekleyen teknik çizim yayınlarını görüntüleyin ve değerlendirin',
        icon: 'search',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/design/',
        onRefreshClick: async () => {
            await loadPendingReleases();
        }
    });
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

function initializeTable() {
    const columns = [
        {
            field: 'job_order_no',
            label: 'İş Emri',
            sortable: true,
            width: '10%'
        },
        {
            field: 'revision_code',
            label: 'Revizyon',
            sortable: false,
            width: '8%',
            formatter: (value, row) => value || `Rev.${row.revision_number}`
        },
        {
            field: 'released_by_name',
            label: 'Oluşturan',
            sortable: false,
            width: '12%'
        },
        {
            field: 'folder_path',
            label: 'Klasör Yolu',
            sortable: false,
            width: '22%',
            formatter: (value) => {
                if (!value) return '-';
                return value.length > 80 ? `${value.substring(0, 80)}...` : value;
            }
        },
        {
            field: 'changelog',
            label: 'Değişiklikler',
            sortable: false,
            width: '22%',
            formatter: (value) => {
                if (!value) return '-';
                return value.length > 120 ? `${value.substring(0, 120)}...` : value;
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

    detailsModal.setTitle(`${currentRelease.job_order_no || ''} — Rev.${rev}`);
    detailsModal.setIcon('fas fa-search');

    const infoHtml = `
        <div class="row g-2">
            <div class="col-md-4"><strong>İş Emri:</strong> ${currentRelease.job_order_no || '-'}</div>
            <div class="col-md-8"><strong>Başlık:</strong> ${currentRelease.job_order_title || '-'}</div>
            <div class="col-md-4"><strong>Oluşturan:</strong> ${currentRelease.released_by_name || '-'}</div>
            <div class="col-md-4"><strong>İnceleme:</strong> ${progress}</div>
            <div class="col-md-4"><strong>Tarih:</strong> ${formatDateTime(currentRelease.released_at)}</div>
            <div class="col-md-12"><strong>Klasör Yolu:</strong><br>${currentRelease.folder_path || '-'}</div>
            <div class="col-md-12"><strong>Değişiklikler:</strong>
                <pre class="bg-light p-2 rounded mt-1 mb-0" style="white-space: pre-wrap;">${currentRelease.changelog || '-'}</pre>
            </div>
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
