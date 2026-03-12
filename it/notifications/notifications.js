import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { getUser } from '../../../authService.js';
import { 
    getNotificationConfigs, 
    updateNotificationConfig,
    resetNotificationConfigs
} from '../../../apis/notification/notifications.js';
import { fetchAllUsers } from '../../../apis/users.js';

// State management
let notificationConfigs = [];
let teamChoices = [];
let allUsers = [];
let currentUser = null;
let configsTable = null;
let editConfigModal = null;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function truncateText(text, maxLength = 50) {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
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
        title: 'Bildirim Yapılandırmaları',
        subtitle: 'Bildirim şablonlarını ve yönlendirmelerini yönetin',
        icon: 'fas fa-bell',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        backUrl: '/it/',
        onRefreshClick: async () => {
            await loadConfigs();
        }
    });

    // Add reset button to header after it renders
    setTimeout(() => {
        const headerPlaceholder = document.getElementById('header-placeholder');
        if (headerPlaceholder) {
            const dashboardControls = headerPlaceholder.querySelector('.dashboard-controls');
            if (dashboardControls) {
                const resetBtn = document.createElement('button');
                resetBtn.className = 'btn btn-sm btn-outline-danger ms-2';
                resetBtn.innerHTML = '<i class="fas fa-undo me-1"></i>Tümünü Sıfırla';
                resetBtn.onclick = handleResetAll;
                dashboardControls.appendChild(resetBtn);
            }
        }
    }, 100);

    // Initialize modal
    editConfigModal = new EditModal('edit-route-modal-container', {
        title: 'Bildirim Yapılandırması Düzenle',
        icon: 'fas fa-edit',
        size: 'xl',
        showEditButton: false
    });

    // Load users for dropdown
    await loadUsers();

    // Initialize table
    initializeTable();

    // Load configs
    await loadConfigs();
});

async function loadUsers() {
    try {
        allUsers = await fetchAllUsers();
    } catch (error) {
        console.error('Error loading users:', error);
        allUsers = [];
    }
}

async function loadConfigs() {
    try {
        if (configsTable) configsTable.setLoading(true);
        
        const response = await getNotificationConfigs();
        teamChoices = response.team_choices || [];
        notificationConfigs = response.configs || [];

        // Update table data
        if (configsTable) {
            const tableData = notificationConfigs.map(config => {
                // Build routing display (users + teams)
                const userCount = config.users ? config.users.length : 0;
                const teams = config.teams || [];
                const teamLabels = teams.map(t => {
                    const teamChoice = teamChoices.find(tc => tc.value === t);
                    return teamChoice ? teamChoice.label : t;
                }).filter(Boolean);
                
                let routingDisplay = [];
                if (userCount > 0) {
                    routingDisplay.push(`${userCount} kullanıcı`);
                }
                if (teamLabels.length > 0) {
                    routingDisplay.push(teamLabels.join(', '));
                }
                const routingText = routingDisplay.length > 0 ? routingDisplay.join(' + ') : '-';

                return {
                    id: config.notification_type,
                    notification_type: config.notification_type,
                    label: config.notification_type_display || config.notification_type,
                    title_template: config.title_template || '',
                    routing: routingText,
                    default_send_email: config.default_send_email !== undefined ? config.default_send_email : true,
                    default_send_in_app: config.default_send_in_app !== undefined ? config.default_send_in_app : true,
                    updated_at: config.updated_at,
                    is_default: config.is_default || false,
                    is_routable: config.is_routable || false,
                    raw_data: config
                };
            });
            configsTable.updateData(tableData, tableData.length, 1);
        }
    } catch (error) {
        console.error('Error loading notification configs:', error);
        showNotification('Bildirim yapılandırmaları yüklenirken hata oluştu', 'error');
        if (configsTable) configsTable.updateData([], 0, 1);
    } finally {
        if (configsTable) configsTable.setLoading(false);
    }
}

function initializeTable() {
    configsTable = new TableComponent('notifications-table-container', {
        title: 'Bildirim Yapılandırmaları',
        columns: [
            {
                field: 'label',
                label: 'Bildirim Türü',
                sortable: true,
                formatter: (value, row) => {
                    const defaultBadge = row.is_default 
                        ? '<span class="badge bg-secondary ms-2">Varsayılan</span>' 
                        : '';
                    return `<strong>${escapeHtml(value || '-')}</strong>${defaultBadge}`;
                }
            },
            {
                field: 'title_template',
                label: 'Başlık Şablonu',
                sortable: false,
                width: '300px',
                formatter: (value) => {
                    const truncated = truncateText(value, 40);
                    return `<span class="text-muted">${escapeHtml(truncated)}</span>`;
                }
            },
            {
                field: 'routing',
                label: 'Yönlendirme',
                sortable: false,
                width: '250px',
                formatter: (value, row) => {
                    if (!row.is_routable) {
                        return '<span class="text-muted">Yönlendirilemez</span>';
                    }
                    if (value === '-') {
                        return '<span class="text-muted">-</span>';
                    }
                    return `<span class="status-badge status-grey">${escapeHtml(value)}</span>`;
                }
            },
            {
                field: 'default_send_email',
                label: 'E-posta',
                sortable: true,
                width: '100px',
                formatter: (value) => {
                    if (value) {
                        return '<span class="status-badge status-green"><i class="fas fa-check me-1"></i>Aktif</span>';
                    } else {
                        return '<span class="status-badge status-grey"><i class="fas fa-times me-1"></i>Pasif</span>';
                    }
                }
            },
            {
                field: 'default_send_in_app',
                label: 'Uygulama İçi',
                sortable: true,
                width: '120px',
                formatter: (value) => {
                    if (value) {
                        return '<span class="status-badge status-green"><i class="fas fa-check me-1"></i>Aktif</span>';
                    } else {
                        return '<span class="status-badge status-grey"><i class="fas fa-times me-1"></i>Pasif</span>';
                    }
                }
            },
            {
                field: 'updated_at',
                label: 'Son Güncelleme',
                sortable: true,
                width: '180px',
                formatter: (value) => {
                    if (!value) {
                        return '<span class="text-muted">-</span>';
                    }
                    return `<span class="text-muted">${formatDate(value)}</span>`;
                }
            }
        ],
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => showEditConfigModal(row)
            }
        ],
        pagination: false,
        refreshable: true,
        onRefresh: async () => {
            await loadConfigs();
        },
        emptyMessage: 'Bildirim yapılandırması bulunamadı.',
        loading: true
    });
}

function showEditConfigModal(configRow) {
    const config = configRow.raw_data;

    editConfigModal.clearAll();

    // Notification type section
    editConfigModal.addSection({
        title: 'Bildirim Türü',
        icon: 'fas fa-tag',
        iconColor: 'text-primary'
    });

    // Notification type label (read-only)
    editConfigModal.addField({
        id: 'notification_type_label',
        name: 'notification_type_label',
        label: 'Bildirim Türü',
        type: 'text',
        value: config.notification_type_display || config.notification_type,
        readonly: true,
        icon: 'fas fa-tag',
        colSize: 12
    });

    // Always notified info (read-only, if exists)
    if (config.always_notified) {
        editConfigModal.addField({
            id: 'always_notified',
            name: 'always_notified',
            label: 'Her Zaman Bildirilenler',
            type: 'text',
            value: config.always_notified,
            readonly: true,
            icon: 'fas fa-info-circle',
            colSize: 12,
            help: 'Bu bildirim türünde her zaman şu kişiler bildirilir'
        });
    }

    // Templates section
    editConfigModal.addSection({
        title: 'Şablonlar',
        icon: 'fas fa-code',
        iconColor: 'text-info'
    });

    // Store available vars for variable insertion
    window.currentAvailableVars = config.available_vars || [];

    // Title template
    editConfigModal.addField({
        id: 'title_template',
        name: 'title_template',
        label: 'Başlık Şablonu',
        type: 'text',
        value: config.title_template || '',
        placeholder: 'Örn: [İş Emri Beklemede] {job_no}',
        icon: 'fas fa-heading',
        colSize: 12,
        help: config.available_vars && config.available_vars.length > 0 
            ? 'Kullanılabilir değişkenler: ' + config.available_vars.map(v => `{${v}}`).join(', ')
            : ''
    });

    // Body template
    editConfigModal.addField({
        id: 'body_template',
        name: 'body_template',
        label: 'İçerik Şablonu',
        type: 'textarea',
        value: config.body_template || '',
        placeholder: 'Örn: {job_no} numaralı iş emri bekletilmiştir.',
        rows: 5,
        icon: 'fas fa-align-left',
        colSize: 12,
        help: config.available_vars && config.available_vars.length > 0 
            ? 'Kullanılabilir değişkenler: ' + config.available_vars.map(v => `{${v}}`).join(', ')
            : ''
    });

    // Link template
    editConfigModal.addField({
        id: 'link_template',
        name: 'link_template',
        label: 'Link Şablonu',
        type: 'text',
        value: config.link_template || '',
        placeholder: 'Örn: https://ofis.gemcore.com.tr/projects/project-tracking/?job_no={job_no}',
        icon: 'fas fa-link',
        colSize: 12,
        help: config.available_vars && config.available_vars.length > 0 
            ? 'Kullanılabilir değişkenler: ' + config.available_vars.map(v => `{${v}}`).join(', ')
            : ''
    });

    // Default delivery methods section
    editConfigModal.addSection({
        title: 'Varsayılan Teslimat Yöntemleri',
        icon: 'fas fa-paper-plane',
        iconColor: 'text-warning'
    });

    // Default send email
    editConfigModal.addField({
        id: 'default_send_email',
        name: 'default_send_email',
        label: 'E-posta ile Gönder',
        type: 'checkbox',
        value: config.default_send_email !== undefined ? config.default_send_email : true,
        icon: 'fas fa-envelope',
        colSize: 12,
        help: 'Varsayılan olarak bu bildirim türü e-posta ile gönderilir'
    });

    // Default send in app
    editConfigModal.addField({
        id: 'default_send_in_app',
        name: 'default_send_in_app',
        label: 'Uygulama İçi Bildirim',
        type: 'checkbox',
        value: config.default_send_in_app !== undefined ? config.default_send_in_app : true,
        icon: 'fas fa-bell',
        colSize: 12,
        help: 'Varsayılan olarak bu bildirim türü uygulama içi bildirim olarak gönderilir'
    });

    // Routing section (only if routable)
    if (config.is_routable) {
        editConfigModal.addSection({
            title: 'Yönlendirme',
            icon: 'fas fa-route',
            iconColor: 'text-success'
        });

        // Enabled toggle
        editConfigModal.addField({
            id: 'enabled',
            name: 'enabled',
            label: 'Aktif',
            type: 'checkbox',
            value: config.enabled || false,
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

        const currentUserIds = (config.users || []).map(u => String(u.id));

        editConfigModal.addField({
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

        // Team selection (multi-select dropdown)
        const teamOptions = (teamChoices || []).map(t => ({
            value: String(t.value),
            label: t.label || t.value
        }));
        const currentTeamValues = (config.teams || []).map(v => String(v));

        editConfigModal.addField({
            id: 'teams',
            name: 'teams',
            label: 'Takımlar',
            type: 'dropdown',
            value: currentTeamValues,
            multiple: true,
            options: teamOptions,
            placeholder: 'Takım seçin',
            searchable: true,
            icon: 'fas fa-sitemap',
            colSize: 12
        });
    }

    editConfigModal.onSaveCallback(async (formData) => {
        try {
            const updateData = {};

            // Template fields (always included)
            if (formData.title_template !== undefined) {
                updateData.title_template = formData.title_template || '';
            }
            if (formData.body_template !== undefined) {
                updateData.body_template = formData.body_template || '';
            }
            if (formData.link_template !== undefined) {
                updateData.link_template = formData.link_template || '';
            }

            // Default delivery methods (always included)
            if (formData.default_send_email !== undefined) {
                updateData.default_send_email = formData.default_send_email || false;
            }
            if (formData.default_send_in_app !== undefined) {
                updateData.default_send_in_app = formData.default_send_in_app || false;
            }

            // Routing fields (only for routable types)
            if (config.is_routable) {
                if (formData.enabled !== undefined) {
                    updateData.enabled = formData.enabled || false;
                }
                
                // Convert user_ids array to integers
                const userIds = Array.isArray(formData.user_ids) 
                    ? formData.user_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
                    : [];
                updateData.user_ids = userIds;

                // Teams
                const teams = Array.isArray(formData.teams)
                    ? formData.teams.map(v => String(v)).filter(Boolean)
                    : [];
                updateData.teams = teams;
            }

            await updateNotificationConfig(config.notification_type, updateData);
            editConfigModal.hide();
            showNotification('Bildirim yapılandırması güncellendi', 'success');
            await loadConfigs();
        } catch (error) {
            console.error('Error updating notification config:', error);
            showNotification(error.message || 'Güncelleme hatası', 'error');
        }
    });

    editConfigModal.render();
    editConfigModal.show();

    // Add variable chips after modal is shown
    if (config.available_vars && config.available_vars.length > 0) {
        setTimeout(() => {
            addVariableChips(config.available_vars);
        }, 200);
    }
}

function addVariableChips(availableVars) {
    const modal = document.querySelector('.edit-modal-container');
    if (!modal) return;

    // Find template fields
    const titleField = document.getElementById('title_template');
    const bodyField = document.getElementById('body_template');
    const linkField = document.getElementById('link_template');

    const fields = [
        { field: titleField, label: 'Başlık Şablonu' },
        { field: bodyField, label: 'İçerik Şablonu' },
        { field: linkField, label: 'Link Şablonu' }
    ].filter(f => f.field);

    fields.forEach(({ field, label }) => {
        const fieldGroup = field.closest('.field-group');
        if (!fieldGroup) return;

        // Create chips container
        const chipsContainer = document.createElement('div');
        chipsContainer.className = 'mb-2 mt-1';
        chipsContainer.style.fontSize = '0.85rem';

        const chipsLabel = document.createElement('small');
        chipsLabel.className = 'text-muted d-block mb-1';
        chipsLabel.textContent = `${label} için değişkenler:`;

        const chipsDiv = document.createElement('div');
        chipsDiv.className = 'd-flex flex-wrap gap-1';

        availableVars.forEach(varName => {
            const chip = document.createElement('span');
            chip.className = 'badge bg-light text-dark';
            chip.style.cursor = 'pointer';
            chip.textContent = `{${varName}}`;
            chip.onclick = () => insertVariable(field.id, varName);
            chip.onmouseover = () => chip.style.backgroundColor = '#e9ecef';
            chip.onmouseout = () => chip.style.backgroundColor = '#f8f9fa';
            chipsDiv.appendChild(chip);
        });

        chipsContainer.appendChild(chipsLabel);
        chipsContainer.appendChild(chipsDiv);

        // Insert after the field input
        fieldGroup.appendChild(chipsContainer);
    });
}

function insertVariable(fieldId, varName) {
    const field = document.getElementById(fieldId);
    if (!field) return;

    const variable = `{${varName}}`;
    const start = field.selectionStart || 0;
    const end = field.selectionEnd || 0;
    const text = field.value || '';
    
    const newText = text.substring(0, start) + variable + text.substring(end);
    field.value = newText;
    
    // Set cursor position after inserted variable
    const newPos = start + variable.length;
    field.setSelectionRange(newPos, newPos);
    field.focus();
}

async function handleResetAll() {
    const confirmed = confirm(
        'Tüm özel bildirim yapılandırmaları silinecek ve varsayılan değerlere dönecektir. ' +
        'Bu işlem geri alınamaz. Devam etmek istediğinizden emin misiniz?'
    );
    
    if (!confirmed) return;

    try {
        const response = await resetNotificationConfigs();
        showNotification(
            response.message || 'Tüm yapılandırmalar varsayılan değerlere sıfırlandı',
            'success'
        );
        await loadConfigs();
    } catch (error) {
        console.error('Error resetting notification configs:', error);
        showNotification(error.message || 'Yapılandırmalar sıfırlanırken hata oluştu', 'error');
    }
}
