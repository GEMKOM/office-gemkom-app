import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { getUser } from '../../../authService.js';
import { 
    listNotificationRoutes, 
    updateNotificationRoute,
    NOTIFICATION_TYPES 
} from '../../../apis/notifications.js';
import { fetchAllUsers } from '../../../apis/users.js';

// State management
let notificationRoutes = [];
let allUsers = [];
let currentUser = null;
let routesTable = null;
let editRouteModal = null;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    currentUser = await getUser();

    // Check if user is admin/superuser
    const isAdmin = currentUser && (currentUser.is_superuser || currentUser.is_admin);
    if (!isAdmin) {
        showNotification('Bu sayfaya erişim yetkiniz bulunmamaktadır.', 'error');
        window.location.href = '/it/';
        return;
    }

    // Initialize header
    new HeaderComponent({
        title: 'Bildirim Yönlendirmeleri',
        subtitle: 'Bildirim türlerine göre kullanıcı atamalarını yönetin',
        icon: 'fas fa-bell',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        backUrl: '/it/',
        onRefreshClick: async () => {
            await loadRoutes();
        }
    });

    // Initialize modals
    editRouteModal = new EditModal('edit-route-modal-container', {
        title: 'Bildirim Yönlendirmesi Düzenle',
        icon: 'fas fa-edit',
        size: 'lg',
        showEditButton: false
    });

    // Load users for dropdown
    await loadUsers();

    // Initialize table
    initializeTable();

    // Load routes
    await loadRoutes();
});

async function loadUsers() {
    try {
        allUsers = await fetchAllUsers();
    } catch (error) {
        console.error('Error loading users:', error);
        allUsers = [];
    }
}

async function loadRoutes() {
    try {
        if (routesTable) routesTable.setLoading(true);
        
        const routes = await listNotificationRoutes();
        notificationRoutes = routes;

        // Update table data
        if (routesTable) {
            const tableData = routes.map(route => {
                return {
                    id: route.notification_type,
                    notification_type: route.notification_type,
                    label: route.notification_type_display || route.notification_type,
                    link: route.link || null,
                    always_notified: route.always_notified || null,
                    enabled: route.enabled || false,
                    user_count: route.users ? route.users.length : 0,
                    users: route.users || [],
                    raw_data: route
                };
            });
            routesTable.updateData(tableData, tableData.length, 1);
        }
    } catch (error) {
        console.error('Error loading notification routes:', error);
        showNotification('Bildirim yönlendirmeleri yüklenirken hata oluştu', 'error');
        if (routesTable) routesTable.updateData([], 0, 1);
    } finally {
        if (routesTable) routesTable.setLoading(false);
    }
}

function initializeTable() {
    routesTable = new TableComponent('notifications-table-container', {
        title: 'Bildirim Yönlendirmeleri',
        columns: [
            {
                field: 'label',
                label: 'Bildirim Türü',
                sortable: true,
                formatter: (value) => `<strong>${value || '-'}</strong>`
            },
            {
                field: 'link',
                label: 'Link',
                sortable: false,
                width: '220px',
                formatter: (value) => {
                    if (!value) return '<span class="text-muted">-</span>';
                    const safe = escapeHtml(value);
                    return `<a href="${safe}" class="text-decoration-none" target="_blank" rel="noopener noreferrer">
                        <i class="fas fa-external-link-alt me-1"></i>${safe}
                    </a>`;
                }
            },
            {
                field: 'always_notified',
                label: 'Otomatik Bildirilenler',
                sortable: false,
                width: '250px',
                formatter: (value, row) => {
                    if (!value) {
                        return '<span class="text-muted">-</span>';
                    }
                    return `<span class="text-body"><i class="fas fa-info-circle me-1 text-muted"></i>${escapeHtml(value)}</span>`;
                }
            },
            {
                field: 'enabled',
                label: 'Durum',
                sortable: true,
                width: '120px',
                formatter: (value) => {
                    if (value) {
                        return '<span class="status-badge status-green">Aktif</span>';
                    } else {
                        return '<span class="status-badge status-grey">Pasif</span>';
                    }
                }
            },
            {
                field: 'user_count',
                label: 'Ek Kullanıcı Sayısı',
                sortable: true,
                width: '150px',
                formatter: (value, row) => {
                    const count = value || 0;
                    if (count === 0) {
                        return '<span class="text-muted">-</span>';
                    }
                    return `<span class="fw-bold text-primary">${count}</span>`;
                }
            },
            {
                field: 'users',
                label: 'Ek Atanan Kullanıcılar',
                sortable: false,
                formatter: (value, row) => {
                    if (!value || value.length === 0) {
                        return '<span class="text-muted">-</span>';
                    }
                    const userNames = value.map(user => {
                        const firstName = user.first_name || '';
                        const lastName = user.last_name || '';
                        const fullName = `${firstName} ${lastName}`.trim();
                        return fullName || user.username || `#${user.id}`;
                    });
                    return `<span class="status-badge status-grey">${userNames.join(', ')}</span>`;
                }
            }
        ],
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => showEditRouteModal(row)
            }
        ],
        pagination: false,
        refreshable: true,
        onRefresh: async () => {
            await loadRoutes();
        },
        emptyMessage: 'Bildirim yönlendirmesi bulunamadı.',
        loading: true
    });
}

function showEditRouteModal(routeRow) {
    const route = routeRow.raw_data;

    editRouteModal.clearAll();
    editRouteModal.addSection({
        title: 'Bildirim Yönlendirmesi',
        icon: 'fas fa-bell',
        iconColor: 'text-primary'
    });

    // Notification type label (read-only)
    editRouteModal.addField({
        id: 'notification_type_label',
        name: 'notification_type_label',
        label: 'Bildirim Türü',
        type: 'text',
        value: route.notification_type_display || route.notification_type,
        readonly: true,
        icon: 'fas fa-tag',
        colSize: 12
    });

    // Always notified info (read-only)
    if (route.always_notified) {
        editRouteModal.addField({
            id: 'always_notified',
            name: 'always_notified',
            label: 'Otomatik Bildirilenler',
            type: 'text',
            value: route.always_notified,
            readonly: true,
            icon: 'fas fa-info-circle',
            colSize: 12
        });
    }

    // Enabled toggle
    editRouteModal.addField({
        id: 'enabled',
        name: 'enabled',
        label: 'Aktif',
        type: 'checkbox',
        value: route.enabled || false,
        icon: 'fas fa-toggle-on',
        colSize: 12
    });

    // User selection (multi-select dropdown)
    const userOptions = allUsers.map(user => {
        const firstName = user.first_name || '';
        const lastName = user.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();
        const displayName = fullName || user.username || `#${user.id}`;
        return {
            value: String(user.id),
            label: displayName
        };
    });

    const currentUserIds = (route.users || []).map(u => String(u.id));

    editRouteModal.addField({
        id: 'user_ids',
        name: 'user_ids',
        label: 'Atanan Kullanıcılar',
        type: 'dropdown',
        value: currentUserIds,
        multiple: true,
        options: userOptions,
        placeholder: 'Kullanıcı seçin',
        searchable: true,
        icon: 'fas fa-users',
        colSize: 12
    });

    editRouteModal.onSaveCallback(async (formData) => {
        try {
            // Convert user_ids array to integers
            const userIds = Array.isArray(formData.user_ids) 
                ? formData.user_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
                : [];

            const updateData = {
                enabled: formData.enabled || false,
                user_ids: userIds
            };

            await updateNotificationRoute(route.notification_type, updateData);
            editRouteModal.hide();
            showNotification('Bildirim yönlendirmesi güncellendi', 'success');
            await loadRoutes();
        } catch (error) {
            console.error('Error updating notification route:', error);
            showNotification(error.message || 'Güncelleme hatası', 'error');
        }
    });

    editRouteModal.render();
    editRouteModal.show();
}
