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
    deleteUserPermissionOverride,
    fetchGroupPermissions,
    addPermissionToGroup,
    removePermissionFromGroup
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
let groupPermsCache = new Map(); // group_name -> Set(codename)
let currentGroupName = null;
let currentGroupPermsOriginal = new Set();
let currentGroupPermsDraft = new Set();
let currentGroupDirty = false;

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
    await loadGroupPermissionsMatrix();
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

async function loadGroupPermissionsMatrix() {
    try {
        if (!groupMatrixTable || !permissionsMatrix) return;
        groupMatrixTable.setLoading(true);

        const codenames = permissionsMatrix.codenames || [];

        // Fetch group permissions from backend
        groupPermsCache = new Map();
        await Promise.all((groupsCache || []).map(async (g) => {
            try {
                const resp = await fetchGroupPermissions(g.name);
                // Expecting either {codenames: [...]} or plain array; normalize to array
                const codes = Array.isArray(resp) ? resp : (resp.codenames || resp.permissions || []);
                groupPermsCache.set(g.name, new Set(codes));
            } catch (e) {
                console.error('Failed to fetch permissions for group', g.name, e);
                groupPermsCache.set(g.name, new Set());
            }
        }));

        const rows = (groupsCache || []).map(g => {
            const set = groupPermsCache.get(g.name) || new Set();
            const base = {
                id: g.name,
                group_name: g.name,
                group_display_name: g.display_name || g.name,
                member_count: g.member_count ?? '-'
            };
            codenames.forEach(code => {
                base[code] = set.has(code);
            });
            return base;
        });

        groupMatrixTable.updateData(rows, rows.length, 1);

        // If a group is currently selected, refresh its panel too
        if (currentGroupName) {
            await loadGroupDetail(currentGroupName);
        }
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

    attachMatrixPermissionCellHandler();
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
            field: 'group_display_name',
            label: 'Türkçe',
            width: '200px',
            sortable: true
        },
        {
            field: 'member_count',
            label: 'Kullanıcı Sayısı',
            width: '120px',
            sortable: true
        }
    ];

    const permColumns = (permissionsMatrix?.codenames || []).map(code => ({
        field: code,
        label: code,
        width: '90px',
        sortable: false,
        formatter: (val, row) => {
            const checked = val === true ? 'checked' : '';
            return `
                <div class="form-check m-0 d-flex justify-content-center">
                    <input class="form-check-input group-perm-checkbox"
                           type="checkbox"
                           ${checked}
                           data-group-name="${row.group_name}"
                           data-codename="${code}"
                           onclick="event.stopPropagation();"
                           disabled>
                </div>
            `;
        }
    }));

    groupMatrixTable = new TableComponent('group-matrix-container', {
        title: 'Grup Bazlı Yetki Matrisi',
        columns: [...staticColumns, ...permColumns],
        actions: [],
        pagination: false,
        loading: true,
        emptyMessage: 'Grup bulunamadı.',
        onRowClick: (row) => {
            if (row && row.group_name) {
                loadGroupDetail(row.group_name);
            }
        },
        onRendered: () => {}
    });
}

async function loadGroupDetail(groupName) {
    currentGroupName = groupName;
    const panel = document.getElementById('group-permissions-panel');
    if (!panel) return;

    const groupInfo = (groupsCache || []).find(g => g.name === groupName) || { name: groupName, display_name: groupName };

    panel.innerHTML = `
        <div class="card shadow-sm">
            <div class="card-body">
                <h5 class="card-title mb-1">
                    <i class="fas fa-users-cog me-2"></i>${groupInfo.display_name || groupInfo.name}
                </h5>
                <p class="text-muted mb-3"><code>${groupInfo.name}</code></p>
                <div class="text-muted">Yükleniyor...</div>
            </div>
        </div>
    `;

    try {
        const resp = await fetchGroupPermissions(groupName);
        const codes = Array.isArray(resp) ? resp : (resp.codenames || resp.permissions || []);
        const set = new Set(codes);
        groupPermsCache.set(groupName, set);

        // Initialize draft state
        currentGroupPermsOriginal = new Set(codes);
        currentGroupPermsDraft = new Set(codes);
        currentGroupDirty = false;

        const codenames = permissionsMatrix?.codenames || [];
        const members = (permissionsMatrix?.users || [])
            .filter(u => (u.groups || []).includes(groupName))
            .map(u => u.full_name || u.username);

        const permsList = codenames.map(code => {
            const checked = currentGroupPermsDraft.has(code) ? 'checked' : '';
            return `
                <div class="d-flex align-items-center justify-content-between py-1 border-bottom">
                    <div class="me-2"><code>${code}</code></div>
                    <div class="form-check m-0">
                        <input class="form-check-input group-panel-checkbox"
                               type="checkbox"
                               ${checked}
                               data-group-name="${groupName}"
                               data-codename="${code}">
                    </div>
                </div>
            `;
        }).join('');

        panel.innerHTML = `
            <div class="card shadow-sm h-100">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title mb-1">
                        <i class="fas fa-users-cog me-2"></i>${groupInfo.display_name || groupInfo.name}
                    </h5>
                    <p class="text-muted mb-2"><code>${groupInfo.name}</code></p>
                    <div class="d-flex flex-wrap gap-2 mb-3">
                        <span class="badge bg-secondary">Üye: ${groupInfo.member_count ?? members.length ?? '-'}</span>
                        <span class="badge bg-secondary">Yetki: ${set.size}</span>
                    </div>

                    <div class="d-flex gap-2 mb-3">
                        <button type="button" class="btn btn-sm btn-success" id="group-save-btn" disabled>
                            <i class="fas fa-save me-1"></i>Kaydet
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" id="group-discard-btn" disabled>
                            <i class="fas fa-undo me-1"></i>Vazgeç
                        </button>
                        <div class="ms-auto text-muted small" id="group-dirty-indicator"></div>
                    </div>

                    <h6>Üyeler</h6>
                    <div class="mb-3" style="max-height: 120px; overflow-y: auto;">
                        ${members.length ? members.map(m => `<div class="text-body">${m}</div>`).join('') : `<span class="text-muted">-</span>`}
                    </div>

                    <h6>Yetkiler</h6>
                    <div class="flex-grow-1" style="overflow-y: auto;">
                        ${permsList}
                    </div>
                </div>
            </div>
        `;

        attachGroupPanelHandlers();
    } catch (e) {
        console.error(e);
        showNotification(e.message || 'Grup detayları yüklenirken hata oluştu', 'error');
        panel.innerHTML = `
            <div class="card shadow-sm">
                <div class="card-body">
                    <h5 class="card-title mb-1">
                        <i class="fas fa-users-cog me-2"></i>${groupInfo.display_name || groupInfo.name}
                    </h5>
                    <p class="text-muted mb-3"><code>${groupInfo.name}</code></p>
                    <div class="text-muted">Detaylar yüklenemedi.</div>
                </div>
            </div>
        `;
    }
}

function attachGroupPanelHandlers() {
    const panel = document.getElementById('group-permissions-panel');
    if (!panel) return;

    const saveBtn = panel.querySelector('#group-save-btn');
    const discardBtn = panel.querySelector('#group-discard-btn');
    const dirtyIndicator = panel.querySelector('#group-dirty-indicator');

    function setDirty(isDirty) {
        currentGroupDirty = isDirty;
        if (saveBtn) saveBtn.disabled = !isDirty;
        if (discardBtn) discardBtn.disabled = !isDirty;
        if (dirtyIndicator) dirtyIndicator.textContent = isDirty ? 'Kaydedilmemiş değişiklikler' : '';
    }

    if (discardBtn) {
        discardBtn.addEventListener('click', () => {
            currentGroupPermsDraft = new Set(currentGroupPermsOriginal);
            // Re-render panel checkboxes quickly by reloading detail from cache state
            // (no network)
            loadGroupDetail(currentGroupName);
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const groupName = currentGroupName;
            if (!groupName) return;

            // Diff original vs draft
            const toAdd = [];
            const toRemove = [];
            for (const code of currentGroupPermsDraft) {
                if (!currentGroupPermsOriginal.has(code)) toAdd.push(code);
            }
            for (const code of currentGroupPermsOriginal) {
                if (!currentGroupPermsDraft.has(code)) toRemove.push(code);
            }

            if (toAdd.length === 0 && toRemove.length === 0) {
                setDirty(false);
                return;
            }

            saveBtn.disabled = true;
            discardBtn.disabled = true;
            if (dirtyIndicator) dirtyIndicator.textContent = 'Kaydediliyor...';

            try {
                // Apply changes
                for (const code of toAdd) {
                    await addPermissionToGroup(groupName, code);
                }
                for (const code of toRemove) {
                    await removePermissionFromGroup(groupName, code);
                }

                // Update caches
                currentGroupPermsOriginal = new Set(currentGroupPermsDraft);
                groupPermsCache.set(groupName, new Set(currentGroupPermsDraft));

                showNotification('Grup yetkileri kaydedildi', 'success');

                // Refresh other tabs data
                await loadMatrix({});
                await loadPermissionsList();
                await loadGroupPermissionsMatrix();
                setDirty(false);
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Kaydetme sırasında hata oluştu', 'error');
                setDirty(true);
            }
        });
    }

    panel.querySelectorAll('.group-panel-checkbox').forEach(cb => {
        cb.addEventListener('change', async () => {
            const groupName = cb.getAttribute('data-group-name');
            const codename = cb.getAttribute('data-codename');
            const checked = cb.checked === true;
            if (!groupName || !codename) return;

            // Update draft only (no network)
            if (checked) currentGroupPermsDraft.add(codename);
            else currentGroupPermsDraft.delete(codename);

            const isDirty = !setsEqual(currentGroupPermsDraft, currentGroupPermsOriginal);
            setDirty(isDirty);
        });
    });
}

function setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) {
        if (!b.has(v)) return false;
    }
    return true;
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

function attachMatrixPermissionCellHandler() {
    const container = document.getElementById('permissions-matrix-container');
    if (!container) return;
    if (container.dataset.permHandlersAttached === 'true') return;
    container.dataset.permHandlersAttached = 'true';

    container.addEventListener('click', (e) => {
        const permBtn = e.target.closest('.permission-cell-btn');
        if (!permBtn) return;

        const userId = permBtn.getAttribute('data-user-id');
        const codename = permBtn.getAttribute('data-codename');
        if (userId && codename) {
            openOverrideModal(parseInt(userId, 10), codename);
        }
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

function formatPermSourceBadge(source, sourceDetail) {
    const detail = sourceDetail ? `<span class="text-muted ms-1">${sourceDetail}</span>` : '';

    switch (source) {
        case 'superuser':
            return `<span class="badge bg-danger">Süper kullanıcı</span>${detail}`;
        case 'override':
            return `<span class="badge bg-warning text-dark">Bireysel</span>${detail}`;
        case 'group':
            return `<span class="badge bg-primary">Grup</span>${detail}`;
        case 'legacy':
            return `<span class="badge bg-secondary">Eski sistem</span>${detail}`;
        case 'none':
        default:
            return `<span class="badge bg-secondary">Yok</span>`;
    }
}

function renderUserDetailPanel() {
    const panel = document.getElementById('user-permissions-panel');
    if (!panel || !currentUserDetail) return;

    const { user, groups, effective_permissions, overrides } = currentUserDetail;
    const codenames = permissionsMatrix?.codenames || Object.keys(effective_permissions || {});

    const officePerm = effective_permissions?.office_access || { value: false, source: 'none', source_detail: '' };
    const workshopPerm = effective_permissions?.workshop_access || { value: false, source: 'none', source_detail: '' };
    const hasOfficeAccess = officePerm.value === true;
    const hasWorkshopAccess = workshopPerm.value === true;

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
        const permObj = effective_permissions?.[code] || { value: false, source: 'none', source_detail: '' };
        const value = permObj.value === true;

        // Backend already resolves the permission source; render it directly.
        const sourceBadge = user.is_superuser
            ? formatPermSourceBadge('superuser', '')
            : formatPermSourceBadge(permObj.source, permObj.source_detail);
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

