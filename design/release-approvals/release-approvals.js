import { initNavbar } from '../../../components/navbar.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
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
        title: 'Akran İncelemesi',
        subtitle: 'Tasarım ekibinin incelemesini bekleyen teknik çizim yayınlarını görüntüleyin ve değerlendirin',
        icon: 'people-arrows',
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
        size: 'lg',
        showEditButton: false
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
            width: '12%'
        },
        {
            field: 'revision_code',
            label: 'Revizyon',
            sortable: false,
            width: '10%',
            formatter: (value, row) => value || `Rev.${row.revision_number}`
        },
        {
            field: 'released_by_name',
            label: 'Oluşturan',
            sortable: false,
            width: '14%'
        },
        {
            field: 'changelog',
            label: 'Değişiklikler',
            sortable: false,
            width: '30%',
            formatter: (value) => {
                if (!value) return '-';
                return value.length > 120 ? `${value.substring(0, 120)}...` : value;
            }
        },
        {
            field: 'approval_state',
            label: 'Değerlendirme',
            sortable: false,
            width: '10%',
            formatter: (value) => {
                if (!value) return '0/2';
                return `${value.approval_count || 0}/${value.required_count || 2}`;
            }
        },
        {
            field: 'released_at',
            label: 'Tarih',
            sortable: true,
            width: '14%',
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
                label: 'Detaylar',
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

async function showReleaseDetails(release) {
    if (!detailsModal) return;

    currentRelease = release.id ? release : await getDrawingRelease(release);
    detailsModal.clearAll();

    const state = currentRelease.approval_state || {};
    const progress = `${state.approval_count || 0}/${state.required_count || 2}`;
    const topicLink = currentRelease.release_topic_id
        ? `/projects/project-tracking/?job_no=${encodeURIComponent(currentRelease.job_order_no)}&topic_id=${currentRelease.release_topic_id}`
        : null;

    detailsModal.addSection({
        title: 'Yayın Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    const infoHtml = `
        <div class="row g-2">
            <div class="col-md-6"><strong>İş Emri:</strong> ${currentRelease.job_order_no || '-'}</div>
            <div class="col-md-6"><strong>Başlık:</strong> ${currentRelease.job_order_title || '-'}</div>
            <div class="col-md-6"><strong>Revizyon:</strong> ${currentRelease.revision_code || currentRelease.revision_number}</div>
            <div class="col-md-6"><strong>Oluşturan:</strong> ${currentRelease.released_by_name || '-'}</div>
            <div class="col-md-6"><strong>İnceleme İlerlemesi:</strong> ${progress}</div>
            <div class="col-md-12"><strong>Klasör Yolu:</strong><br>${currentRelease.folder_path || '-'}</div>
            <div class="col-md-12"><strong>Değişiklikler:</strong><pre class="bg-light p-2 rounded mt-1" style="white-space: pre-wrap;">${currentRelease.changelog || '-'}</pre></div>
            ${topicLink ? `<div class="col-md-12"><a href="${topicLink}" target="_blank" class="btn btn-outline-primary btn-sm"><i class="fas fa-comments me-1"></i>Konuya Git (Yorum Yap)</a></div>` : ''}
        </div>
    `;
    detailsModal.addCustomContent(infoHtml);

    if (currentRelease.can_approve) {
        const footer = detailsModal.container.querySelector('.modal-footer');
        if (footer) {
            footer.innerHTML = `
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Kapat</button>
                <button type="button" class="btn btn-danger" id="reject-from-details-btn">Reddet</button>
                <button type="button" class="btn btn-success" id="approve-from-details-btn">Olumlu</button>
            `;
            footer.querySelector('#approve-from-details-btn')?.addEventListener('click', () => showApproveModal(currentRelease));
            footer.querySelector('#reject-from-details-btn')?.addEventListener('click', () => showRejectModal(currentRelease));
        }
    }

    detailsModal.render();
    detailsModal.show();
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
                detailsModal.hide();
                await loadPendingReleases();
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
