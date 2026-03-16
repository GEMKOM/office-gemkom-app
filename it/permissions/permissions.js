import { guardRoute, getUser } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import {
    fetchUserGroups,
    fetchPermissionsMatrix,
    fetchUserPermissionsDetail,
    addUserToGroup,
    removeUserFromGroup,
    saveUserPermissionOverride,
    deleteUserPermissionOverride
} from '../../../apis/users.js';

// State
let permissionsMatrix = null;
let matrixTable = null;
let groupMatrixTable = null;
let permissionsListTable = null;
let filtersComponent = null;
let overrideModal = null;
let currentUserDetail = null;
let groupsCache = [];

function boolIcon(val) {
    if (val) {
        return '<span class="status-badge status-green"><i class="fas fa-check"></i></span>';
    }
    return '<span class="status-badge status-red"><i class="fas fa-times"></i></span>';
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    const user = await getUser();
    const isAdmin = user && (user.is_superuser || user.is_admin);
    if (!isAdmin) {
        showNotification('Bu sayfaya erişim yetkiniz bulunmamaktadır.', 'error');
        window.location.href = '/it/';
        return;
    }

    new HeaderComponent({
        title: 'Yetki Yönetimi',
        subtitle: 'Kullanıcı gruplarını ve yetkilerini yönetin',
        icon: 'fas fa-user-shield',
        showBackButton: 'block',
        backUrl: '/it/',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onRefreshClick: async () => {
            await loadMatrix();
        }
    });

    overrideModal = new EditModal('permission-override-modal-container', {
        title: 'Yetki Geçersiz Kılma',
        icon: 'fas fa-user-shield',
        size: 'lg',
        showEditButton: false
    });

    await loadGroups();
    initFilters();
    initMatrixTable();
    initGroupMatrixTable();
    initPermissionsListTable();
    await loadMatrix();
    await loadGroupMatrix();
    await loadPermissionsList();
});

async function loadGroups() {
    try {
        groupsCache = await fetchUserGroups();
    } catch (e) {
        console.error('Error loading groups', e);
        groupsCache = [];
    }
}

async function loadMatrix(params = {}) {
    try {
        if (matrixTable) matrixTable.setLoading(true);
        permissionsMatrix = await fetchPermissionsMatrix(params);
        const codenames = permissionsMatrix.codenames || [];
        const rows = (permissionsMatrix.users || []).map(u => {
            const grantedCodes = codenames.filter(code => {
                const perm = u.permissions ? u.permissions[code] : null;
                return perm && perm.value === true;
            });
            const base = {
                id: u.id,
                username: u.username,
                full_name: u.full_name || u.username,
                is_superuser: u.is_superuser,
                groups_display: (u.groups || []).join(', ') || '-',
                permissions_display: grantedCodes.length ? grantedCodes.join(', ') : '-',
                raw: u
            };
            codenames.forEach(code => {
                const perm = u.permissions ? u.permissions[code] : null;
                base[code] = perm ? perm.value === true : false;
            });
            return base;
        });
        matrixTable.updateData(rows, rows.length, 1);
    } catch (e) {
        console.error(e);
        showNotification(e.message || 'Yetki matrisi yüklenirken hata oluştu', 'error');
        if (matrixTable) matrixTable.updateData([], 0, 1);
    } finally {
        if (matrixTable) matrixTable.setLoading(false);
    }
}

async function loadGroupMatrix() {
    try {
        if (!groupMatrixTable || !permissionsMatrix) return;
        groupMatrixTable.setLoading(true);

        const codenames = permissionsMatrix.codenames || [];
        const groupMap = new Map();

        (permissionsMatrix.users || []).forEach(u => {
            (u.groups || []).forEach(g => {
                if (!groupMap.has(g)) {
                    groupMap.set(g, {
                        id: g,
                        group_name: g,
                        members: new Set(),
                        perms: new Map()
                    });
                }
                const entry = groupMap.get(g);
                entry.members.add(u.username);
                codenames.forEach(code => {
                    const current = entry.perms.get(code) || false;
                    const perm = u.permissions ? u.permissions[code] : null;
                    const userHas = perm ? perm.value === true : false;
                    entry.perms.set(code, current || userHas);
                });
            });
        });

        const rows = Array.from(groupMap.values()).map(entry => {
            const base = {
                id: entry.group_name,
                group_name: entry.group_name,
                member_count: entry.members.size,
                members_display: Array.from(entry.members).join(', ') || '-'
            };
            codenames.forEach(code => {
                base[code] = entry.perms.get(code) || false;
            });
            return base;
        });

        groupMatrixTable.updateData(rows, rows.length, 1);
    } catch (e) {
        console.error(e);
        showNotification(e.message || 'Grup matrisi yüklenirken hata oluştu', 'error');
        if (groupMatrixTable) groupMatrixTable.updateData([], 0, 1);
    } finally {
        if (groupMatrixTable) groupMatrixTable.setLoading(false);
    }
}

async function loadPermissionsList() {
    try {
        if (!permissionsListTable || !permissionsMatrix) return;
        permissionsListTable.setLoading(true);

        const codenames = permissionsMatrix.codenames || [];
        const rows = codenames.map(code => {
            const usersWith = (permissionsMatrix.users || []).filter(u => {
                const perm = u.permissions ? u.permissions[code] : null;
                return perm && perm.value === true;
            });
            return {
                id: code,
                codename: code,
                user_count: usersWith.length,
                users_display: usersWith.map(u => u.username).join(', ') || '-'
            };
        });

        permissionsListTable.updateData(rows, rows.length, 1);
    } catch (e) {
        console.error(e);
        showNotification(e.message || 'Yetki listesi yüklenirken hata oluştu', 'error');
        if (permissionsListTable) permissionsListTable.updateData([], 0, 1);
    } finally {
        if (permissionsListTable) permissionsListTable.setLoading(false);
    }
}

function initMatrixTable() {
    const staticColumns = [
        {
            field: 'username',
            label: 'Kullanıcı',
            width: '160px',
            sortable: true,
            formatter: (value, row) => {
                const badge = row.is_superuser
                    ? '<span class="badge bg-danger ms-1">Süper Kullanıcı</span>'
                    : '';
                return `<button type="button" class="btn btn-link p-0 user-detail-btn" data-user-id="${row.id}">
                            ${value}
                        </button>${badge}`;
            }
        },
        {
            field: 'full_name',
            label: 'Ad Soyad',
            width: '200px',
            sortable: true
        },
        {
            field: 'groups_display',
            label: 'Gruplar',
            width: '220px',
            sortable: false
        },
        {
            field: 'permissions_display',
            label: 'Yetkiler',
            sortable: false
        }
    ];

    // dynamic permission columns (header icons/text only; actual set when data loaded)
    const permColumns = (permissionsMatrix?.codenames || []).map(code => ({
        field: code,
        label: code,
        width: '80px',
        sortable: false,
        formatter: (val, row) => {
            if (row.is_superuser) {
                return '<span class="badge bg-danger">Süper kullanıcı</span>';
            }
            return `<button type="button" 
                        class="btn btn-sm btn-light border permission-cell-btn" 
                        data-user-id="${row.id}" 
                        data-codename="${code}">
                        ${boolIcon(val)}
                    </button>`;
        }
    }));

    matrixTable = new TableComponent('permissions-matrix-container', {
        title: 'Yetki Matrisi',
        columns: [...staticColumns, ...permColumns],
        actions: [],
        pagination: false,
        loading: true,
        emptyMessage: 'Kullanıcı bulunamadı.',
        onRowClick: (row) => {
            if (row && row.id) {
                loadUserDetail(row.id);
            }
        }
    });
}

function initGroupMatrixTable() {
    const staticColumns = [
        {
            field: 'group_name',
            label: 'Grup',
            width: '180px',
            sortable: true
        },
        {
            field: 'member_count',
            label: 'Kullanıcı Sayısı',
            width: '120px',
            sortable: true
        },
        {
            field: 'members_display',
            label: 'Kullanıcılar',
            sortable: false
        }
    ];

    const permColumns = (permissionsMatrix?.codenames || []).map(code => ({
        field: code,
        label: code,
        width: '90px',
        sortable: false,
        formatter: (val) => boolIcon(val)
    }));

    groupMatrixTable = new TableComponent('group-matrix-container', {
        title: 'Grup Bazlı Yetki Matrisi',
        columns: [...staticColumns, ...permColumns],
        actions: [],
        pagination: false,
        loading: true,
        emptyMessage: 'Grup bulunamadı.'
    });
}

function initPermissionsListTable() {
    permissionsListTable = new TableComponent('permissions-list-container', {
        title: 'Yetkiler',
        columns: [
            {
                field: 'codename',
                label: 'Kod',
                sortable: true,
                width: '220px'
            },
            {
                field: 'user_count',
                label: 'Kullanıcı Sayısı',
                sortable: true,
                width: '140px'
            },
            {
                field: 'users_display',
                label: 'Kullanıcılar',
                sortable: false
            }
        ],
        actions: [],
        pagination: false,
        loading: true,
        emptyMessage: 'Yetki bulunamadı.'
    });
}

function initFilters() {
    filtersComponent = new FiltersComponent('permissions-filters', {
        title: 'Filtreler',
        onApply: (values) => {
            const search = values['user-search'] || '';
            const group = values['group-filter'] || '';
            loadMatrix({ search, group });
        },
        onClear: () => {
            loadMatrix({});
        }
    });

    filtersComponent
        .addTextFilter({
            id: 'user-search',
            label: 'Kullanıcı',
            placeholder: 'Kullanıcı adı / isim',
            colSize: 3
        })
        .addDropdownFilter({
            id: 'group-filter',
            label: 'Grup',
            placeholder: 'Tüm Gruplar',
            options: groupsCache.map(g => ({
                value: g.name,
                label: g.display_name || g.name
            })),
            colSize: 3
        });
}

// Permission cell clicks use inline formatter buttons; username row click handled via onRowClick above.

async function loadUserDetail(userId) {
    try {
        currentUserDetail = await fetchUserPermissionsDetail(userId);
        renderUserDetailPanel();
    } catch (e) {
        console.error(e);
        showNotification(e.message || 'Kullanıcı detayları yüklenirken hata oluştu', 'error');
    }
}

function permSource(codename, groups, overrides, effectivePerms) {
    const override = overrides.find(o => o.codename === codename);
    if (override) return override.granted ? 'override-grant' : 'override-deny';
    if (effectivePerms[codename]) return 'group';
    return 'none';
}

function renderUserDetailPanel() {
    const panel = document.getElementById('user-permissions-panel');
    if (!panel || !currentUserDetail) return;

    const { user, groups, effective_permissions, overrides } = currentUserDetail;
    const codenames = permissionsMatrix?.codenames || Object.keys(effective_permissions || {});

    const hasOfficeAccess = !!effective_permissions.office_access;
    const hasWorkshopAccess = !!effective_permissions.workshop_access;

    const groupChips = (groups || []).map(g => `
        <span class="badge bg-secondary me-1 mb-1">
            ${g.display_name || g.name}
            <button type="button" 
                    class="btn btn-sm btn-link text-light p-0 ms-1 remove-group-btn" 
                    data-group-name="${g.name}">
                <i class="fas fa-times"></i>
            </button>
        </span>
    `).join('') || '<span class="text-muted">Bu kullanıcı hiçbir grupta değil.</span>';

    const groupOptions = groupsCache.map(g => `
        <option value="${g.name}">${g.display_name || g.name}</option>
    `).join('');

    const permsRows = codenames.map(code => {
        const value = !!effective_permissions[code];
        const source = permSource(code, groups || [], overrides || [], effective_permissions || {});
        let sourceBadge = '<span class="badge bg-secondary">Yok</span>';
        if (user.is_superuser) {
            sourceBadge = '<span class="badge bg-danger">Süper kullanıcı</span>';
        } else if (source === 'override-grant') {
            sourceBadge = '<span class="badge bg-success">Bireysel: İzin</span>';
        } else if (source === 'override-deny') {
            sourceBadge = '<span class="badge bg-danger">Bireysel: Yasak</span>';
        } else if (source === 'group') {
            sourceBadge = '<span class="badge bg-primary">Grup</span>';
        }
        return `
            <tr>
                <td><code>${code}</code></td>
                <td>${boolIcon(value)}</td>
                <td>${sourceBadge}</td>
                <td>
                    ${!user.is_superuser ? `
                    <button type="button" 
                            class="btn btn-sm btn-outline-secondary override-button" 
                            data-codename="${code}">
                        Geçersiz Kıl
                    </button>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    const overridesRows = (overrides || []).map(o => `
        <tr>
            <td><code>${o.codename}</code></td>
            <td>${o.granted ? 'İzin' : 'Yasak'}</td>
            <td>${o.reason || '-'}</td>
            <td>${o.created_at ? new Date(o.created_at).toLocaleString('tr-TR') : '-'}</td>
            <td>
                <button type="button" class="btn btn-sm btn-outline-danger remove-override-btn" data-codename="${o.codename}">
                    Sil
                </button>
            </td>
        </tr>
    `).join('') || `
        <tr>
            <td colspan="5" class="text-muted">Bu kullanıcı için bireysel geçersiz kılma yok.</td>
        </tr>
    `;

    panel.innerHTML = `
        <div class="card shadow-sm">
            <div class="card-body">
                <h5 class="card-title mb-1">
                    <i class="fas fa-user-shield me-2"></i>${user.full_name || user.username}
                </h5>
                <p class="text-muted mb-3">@${user.username}</p>

                <h6 class="mb-2">Gruplar</h6>
                <div class="mb-2">
                    ${groupChips}
                </div>
                <div class="d-flex mb-3">
                    <select class="form-select form-select-sm me-2" id="add-group-select">
                        <option value="">Grup seçin...</option>
                        ${groupOptions}
                    </select>
                    <button type="button" class="btn btn-sm btn-outline-primary" id="add-group-btn">
                        Ekle
                    </button>
                </div>

                <h6 class="mt-3">Portal Erişimi</h6>
                <div class="d-flex flex-wrap gap-2 mb-3">
                    <button type="button"
                            class="btn btn-sm ${hasOfficeAccess ? 'btn-success' : 'btn-outline-secondary'} portal-toggle-btn"
                            data-codename="office_access"
                            data-current="${hasOfficeAccess ? 'true' : 'false'}">
                        <i class="fas fa-building me-1"></i>
                        Ofis: ${hasOfficeAccess ? 'Açık' : 'Kapalı'}
                    </button>
                    <button type="button"
                            class="btn btn-sm ${hasWorkshopAccess ? 'btn-success' : 'btn-outline-secondary'} portal-toggle-btn"
                            data-codename="workshop_access"
                            data-current="${hasWorkshopAccess ? 'true' : 'false'}">
                        <i class="fas fa-industry me-1"></i>
                        Atölye: ${hasWorkshopAccess ? 'Açık' : 'Kapalı'}
                    </button>
                </div>

                <h6 class="mt-3">Yetkiler</h6>
                <div class="table-responsive" style="max-height: 280px; overflow-y: auto;">
                    <table class="table table-sm align-middle mb-0">
                        <thead>
                            <tr>
                                <th>Kod</th>
                                <th>Durum</th>
                                <th>Kaynak</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${permsRows}
                        </tbody>
                    </table>
                </div>

                <h6 class="mt-3">Bireysel Geçersiz Kılmalar</h6>
                <div class="table-responsive" style="max-height: 180px; overflow-y: auto;">
                    <table class="table table-sm align-middle mb-0">
                        <thead>
                            <tr>
                                <th>Kod</th>
                                <th>Durum</th>
                                <th>Neden</th>
                                <th>Tarih</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${overridesRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    attachUserPanelHandlers();
}

function attachUserPanelHandlers() {
    const panel = document.getElementById('user-permissions-panel');
    if (!panel || !currentUserDetail) return;

    const userId = currentUserDetail.user.id;

    const addGroupBtn = panel.querySelector('#add-group-btn');
    const addGroupSelect = panel.querySelector('#add-group-select');
    if (addGroupBtn && addGroupSelect) {
        addGroupBtn.addEventListener('click', async () => {
            const groupName = addGroupSelect.value;
            if (!groupName) return;
            try {
                await addUserToGroup(userId, groupName);
                showNotification('Kullanıcı gruba eklendi', 'success');
                await loadUserDetail(userId);
                await loadMatrix();
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Grup eklenirken hata oluştu', 'error');
            }
        });
    }

    panel.querySelectorAll('.remove-group-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const groupName = btn.getAttribute('data-group-name');
            if (!groupName) return;
            try {
                await removeUserFromGroup(userId, groupName);
                showNotification('Kullanıcı gruptan çıkarıldı', 'success');
                await loadUserDetail(userId);
                await loadMatrix();
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Grup kaldırılırken hata oluştu', 'error');
            }
        });
    });

    panel.querySelectorAll('.override-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const codename = btn.getAttribute('data-codename');
            if (codename) {
                openOverrideModal(userId, codename);
            }
        });
    });

    panel.querySelectorAll('.portal-toggle-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const codename = btn.getAttribute('data-codename');
            if (!codename) return;
            const current = btn.getAttribute('data-current') === 'true';
            const nextGranted = !current;
            try {
                await saveUserPermissionOverride(userId, {
                    codename,
                    granted: nextGranted,
                    reason: ''
                });
                const label = codename === 'office_access' ? 'Ofis erişimi' : 'Atölye erişimi';
                showNotification(`${label} ${nextGranted ? 'açıldı' : 'kapatıldı'}`, 'success');
                await loadUserDetail(userId);
                await loadMatrix();
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Portal erişimi güncellenirken hata oluştu', 'error');
            }
        });
    });

    panel.querySelectorAll('.remove-override-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const codename = btn.getAttribute('data-codename');
            if (!codename) return;
            try {
                await deleteUserPermissionOverride(userId, codename);
                showNotification('Geçersiz kılma kaldırıldı', 'success');
                await loadUserDetail(userId);
                await loadMatrix();
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Geçersiz kılma silinirken hata oluştu', 'error');
            }
        });
    });
}

function openOverrideModal(userId, codename) {
    if (!overrideModal || !permissionsMatrix) return;

    overrideModal.clearAll();

    overrideModal.addSection({
        title: 'Yetki Geçersiz Kılma',
        icon: 'fas fa-user-shield',
        iconColor: 'text-primary'
    });

    overrideModal.addField({
        id: 'codename',
        name: 'codename',
        label: 'Yetki Kodu',
        type: 'text',
        value: codename,
        readonly: true,
        colSize: 12
    });

    overrideModal.addField({
        id: 'granted',
        name: 'granted',
        label: 'Durum',
        type: 'dropdown',
        value: 'true',
        options: [
            { value: 'true', label: 'Erişim Ver (grant)' },
            { value: 'false', label: 'Erişimi Engelle (deny)' }
        ],
        colSize: 12
    });

    overrideModal.addField({
        id: 'reason',
        name: 'reason',
        label: 'Sebep (opsiyonel)',
        type: 'textarea',
        value: '',
        rows: 3,
        colSize: 12
    });

    overrideModal.onSaveCallback(async (formData) => {
        try {
            await saveUserPermissionOverride(userId, {
                codename,
                granted: String(formData.granted) === 'true',
                reason: formData.reason || ''
            });
            overrideModal.hide();
            showNotification('Geçersiz kılma kaydedildi', 'success');
            await loadUserDetail(userId);
            await loadMatrix();
        } catch (e) {
            console.error(e);
            showNotification(e.message || 'Geçersiz kılma kaydedilirken hata oluştu', 'error');
        }
    });

    overrideModal.render();
    overrideModal.show();
}

