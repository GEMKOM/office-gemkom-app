import { guardRoute, getUser } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
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
    fetchGroupsWithPermissions,
    fetchPermissionsUsersList,
    saveGroupPermissionsBulk
} from '../../../apis/users.js';

// State
let permissionsMatrix = null;
let matrixTable = null;
let groupMatrixTable = null;
let permissionsListTable = null;
let overrideModal = null;
let currentUserDetail = null;
let groupsCache = [];
let groupPermsCache = new Map(); // group_name -> Set(codename)
let currentGroupName = null;
let currentGroupPermsOriginal = new Set();
let currentGroupPermsDraft = new Set();
let currentGroupDirty = false;
let usersTabLoaded = false;
let groupsTabLoaded = false;
let permsTabLoaded = false;
let permissionsCatalog = null; // [{codename,name,section}]
let sectionCollapseState = new Map(); // section -> boolean (expanded)

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
            await refreshActiveTab();
        }
    });

    overrideModal = new EditModal('permission-override-modal-container', {
        title: 'Yetki Geçersiz Kılma',
        icon: 'fas fa-user-shield',
        size: 'lg',
        showEditButton: false
    });

    await loadGroups();
    initMatrixTable();
    initGroupMatrixTable();
    initPermissionsListTable();

    attachTabLazyLoadHandlers();

    // Default tab is "Kullanıcılar" -> load immediately
    await ensureUsersTabLoaded();
});

function getActiveTabId() {
    const active = document.querySelector('#permissions-tabs .nav-link.active');
    return active ? active.getAttribute('data-bs-target') : null; // e.g. "#tab-users"
}

async function refreshActiveTab() {
    const active = getActiveTabId();
    if (active === '#tab-groups') {
        await ensureGroupsTabLoaded(true);
        return;
    }
    if (active === '#tab-perms') {
        await ensurePermsTabLoaded(true);
        return;
    }
    await ensureUsersTabLoaded(true);
}

function attachTabLazyLoadHandlers() {
    const usersBtn = document.getElementById('tab-users-tab');
    const groupsBtn = document.getElementById('tab-groups-tab');
    const permsBtn = document.getElementById('tab-perms-tab');

    // Bootstrap tab event fires when a tab becomes active
    if (usersBtn) {
        usersBtn.addEventListener('shown.bs.tab', async () => {
            await ensureUsersTabLoaded();
        });
    }
    if (groupsBtn) {
        groupsBtn.addEventListener('shown.bs.tab', async () => {
            await ensureGroupsTabLoaded();
        });
    }
    if (permsBtn) {
        permsBtn.addEventListener('shown.bs.tab', async () => {
            await ensurePermsTabLoaded();
        });
    }
}

async function ensureUsersTabLoaded(force = false) {
    if (!force && usersTabLoaded) return;
    await loadMatrix();
    usersTabLoaded = true;
}

async function ensureGroupsTabLoaded(force = false) {
    if (!force && groupsTabLoaded) return;

    // Group matrix needs codenames from permissionsMatrix
    if (!permissionsMatrix) {
        await ensureUsersTabLoaded();
    }
    await loadGroupPermissionsMatrix();
    groupsTabLoaded = true;
}

async function ensurePermsTabLoaded(force = false) {
    if (!force && permsTabLoaded) return;

    // Yetkiler tab prefers /users/permissions/, but may fall back to matrix-derived list.
    if (!permissionsMatrix) {
        await ensureUsersTabLoaded();
    }
    await loadPermissionsList();
    permsTabLoaded = true;
}

async function ensurePermissionsCatalogLoaded() {
    if (Array.isArray(permissionsCatalog) && permissionsCatalog.length) return;
    try {
        // Reuse /users/permissions/ which already includes {codename, name, portal}
        const perms = await fetchPermissionsUsersList();
        permissionsCatalog = (perms || [])
            .filter(p => p && p.codename)
            .map(p => ({
                codename: p.codename,
                name: p.name || p.codename,
                section: p.section || p.portal || 'other'
            }));
    } catch (e) {
        console.warn('Failed to load permissions catalog; falling back to matrix codenames', e);
        const codenames = permissionsMatrix?.codenames || [];
        permissionsCatalog = codenames.map(code => ({
            codename: code,
            name: code,
            section: 'other'
        }));
    }
}

function sectionLabel(section) {
    if (section === 'office') return 'Ofis';
    if (section === 'workshop') return 'Atölye';
    if (section === 'manufacturing') return 'Üretim';
    return section || '-';
}

function sectionBadgeClass(section) {
    if (section === 'office') return 'bg-primary';
    if (section === 'workshop') return 'bg-dark';
    if (section === 'manufacturing') return 'bg-success';
    return 'bg-secondary';
}

function safeId(s) {
    return (s || '')
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9\-_]/g, '_');
}

function captureSectionCollapseState(panelEl) {
    if (!panelEl) return;
    panelEl.querySelectorAll('.accordion-collapse').forEach(el => {
        const section = el.querySelector('.group-panel-checkbox')?.getAttribute('data-section');
        if (!section) return;
        const expanded = el.classList.contains('show');
        sectionCollapseState.set(section, expanded);
    });
}

async function loadGroups() {
    try {
        // Prefer bulk group payload (includes member_count/portal/permissions)
        groupsCache = await fetchGroupsWithPermissions();
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

        // Preferred: single backend call returning groups with permissions.
        // Fallback: per-group permissions calls (older backend).
        groupPermsCache = new Map();
        let groupsWithPerms = [];
        try {
            groupsWithPerms = await fetchGroupsWithPermissions();
        } catch (e) {
            console.warn('Bulk group permissions fetch failed; falling back to per-group requests', e);
            groupsWithPerms = [];
        }

        const hasInlinePerms = (groupsWithPerms || []).some(g => Array.isArray(g?.permissions));
        if (hasInlinePerms) {
            // keep groupsCache in sync so filters + panels show updated info like member_count/portal
            groupsCache = groupsWithPerms;
            for (const g of groupsWithPerms) {
                const codes = Array.isArray(g.permissions) ? g.permissions : [];
                groupPermsCache.set(g.name, new Set(codes));
            }
        } else {
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
        }

        let rows = (groupsCache || []).map(g => {
            const set = groupPermsCache.get(g.name) || new Set();
            const permsArr = Array.from(set);
            const permissionsDisplay = permsArr.length ? permsArr.join(', ') : '-';
            const base = {
                id: g.name,
                portal: g.portal || '-',
                group_name: g.name,
                group_display_name: g.display_name || g.name,
                member_count: g.member_count ?? '-',
                permissions_display: permissionsDisplay
            };
            codenames.forEach(code => {
                base[code] = set.has(code);
            });
            return base;
        });

        // Group visually by portal by sorting rows (office/workshop/other).
        rows = rows.sort((a, b) => {
            const ap = (a.portal || '').toString();
            const bp = (b.portal || '').toString();
            if (ap !== bp) return ap.localeCompare(bp, 'tr');
            const an = (a.group_display_name || a.group_name || '').toString();
            const bn = (b.group_display_name || b.group_name || '').toString();
            return an.localeCompare(bn, 'tr');
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
        if (!permissionsListTable) return;
        permissionsListTable.setLoading(true);

        // Preferred: backend-provided permission -> users (+ overrides) list
        let perms = [];
        try {
            perms = await fetchPermissionsUsersList();
        } catch (e) {
            console.warn('Failed to load /users/permissions/; falling back to matrix-derived list', e);
            perms = [];
        }

        let rows = [];
        if (Array.isArray(perms) && perms.length) {
            rows = perms.map(p => {
                const users = Array.isArray(p.users) ? p.users : [];
                const overrides = Array.isArray(p.overrides) ? p.overrides : [];

                const usersPart = users.length
                    ? users.map(u => u.username).join(', ')
                    : '-';
                const overridesPart = overrides.length
                    ? overrides.map(o => `${o.username}(${o.granted ? '+' : '-'})`).join(', ')
                    : '-';

                const overridesDisplay = overrides.length ? ` | Override: ${overridesPart}` : '';

                return {
                    id: p.codename,
                    codename: p.codename,
                    user_count: users.length,
                    users_display: `${usersPart}${overridesDisplay}`
                };
            });
        } else if (permissionsMatrix) {
            // Fallback: derive from matrix (no overrides info)
            const codenames = permissionsMatrix.codenames || [];
            rows = codenames.map(code => {
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
        }

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
            field: 'portal',
            label: 'Portal',
            width: '120px',
            sortable: true,
            formatter: (val) => {
                const v = (val || '').toString();
                if (!v || v === '-') return '-';
                const label = sectionLabel(v);
                const cls = v === 'office'
                    ? 'status-badge status-blue'
                    : (v === 'workshop'
                        ? 'status-badge status-grey'
                        : 'status-badge status-grey');
                return `<span class="${cls}">${label.toUpperCase()}</span>`;
            }
        },
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
        },
        {
            field: 'permissions_display',
            label: 'Yetkiler',
            sortable: false
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
    const prevGroupName = currentGroupName;
    currentGroupName = groupName;
    const panel = document.getElementById('group-permissions-panel');
    if (!panel) return;

    const groupInfo = (groupsCache || []).find(g => g.name === groupName) || { name: groupName, display_name: groupName };
    const portalBadgeHtml = groupInfo.portal === 'office'
        ? '<span class="badge bg-primary ms-2">Ofis</span>'
        : (groupInfo.portal === 'workshop'
            ? '<span class="badge bg-dark ms-2">Atölye</span>'
            : (groupInfo.portal ? `<span class="badge bg-secondary ms-2">${groupInfo.portal}</span>` : ''));

    panel.innerHTML = `
        <div class="card shadow-sm">
            <div class="card-body">
                <h5 class="card-title mb-1">
                    <i class="fas fa-users-cog me-2"></i>${groupInfo.display_name || groupInfo.name}${portalBadgeHtml}
                </h5>
                <p class="text-muted mb-3"><code>${groupInfo.name}</code></p>
                <div class="text-muted">Yükleniyor...</div>
            </div>
        </div>
    `;

    try {
        const isSameGroup =
            prevGroupName === groupName &&
            currentGroupPermsDraft instanceof Set &&
            currentGroupPermsOriginal instanceof Set;

        // Prefer cache filled by bulk groups-with-permissions fetch.
        let codes = [];
        if (groupPermsCache?.has(groupName)) {
            codes = Array.from(groupPermsCache.get(groupName) || []);
        } else {
            const resp = await fetchGroupPermissions(groupName);
            codes = Array.isArray(resp) ? resp : (resp.codenames || resp.permissions || []);
        }
        const fetchedSet = new Set(codes);

        // Keep cache in sync only when not actively editing this same group.
        if (!isSameGroup || !currentGroupDirty) {
            groupPermsCache.set(groupName, fetchedSet);
        }

        // Initialize draft state only when switching groups (or first load).
        if (!isSameGroup) {
            currentGroupPermsOriginal = new Set(codes);
            currentGroupPermsDraft = new Set(codes);
            currentGroupDirty = false;
        }

        await ensurePermissionsCatalogLoaded();
        const catalog = Array.isArray(permissionsCatalog) ? permissionsCatalog : [];
        const bySection = new Map(); // section -> [{codename,name}]
        for (const p of catalog) {
            const section = p.section || 'other';
            if (!bySection.has(section)) bySection.set(section, []);
            bySection.get(section).push({ codename: p.codename, name: p.name || p.codename, section });
        }
        // Sort portals + items for stable UI
        const sections = Array.from(bySection.keys()).sort((a, b) => a.localeCompare(b, 'tr'));
        for (const section of sections) {
            bySection.get(section).sort((a, b) => (a.name || '').localeCompare((b.name || ''), 'tr'));
        }

        const members = (permissionsMatrix?.users || [])
            .filter(u => (u.groups || []).includes(groupName))
            .map(u => u.full_name || u.username);

        const sectionAccordions = sections.map((section) => {
            const items = bySection.get(section) || [];
            const total = items.length;
            const selectedCount = items.reduce((acc, it) => acc + (currentGroupPermsDraft.has(it.codename) ? 1 : 0), 0);
            const allSelected = total > 0 && selectedCount === total;

            const sectionId = safeId(section);
            const collapseId = `section-collapse-${safeId(groupName)}-${sectionId}`;
            const headerId = `section-header-${safeId(groupName)}-${sectionId}`;

            const expanded = sectionCollapseState.has(section) ? sectionCollapseState.get(section) : false;

            const children = items.map(it => {
                const checked = currentGroupPermsDraft.has(it.codename) ? 'checked' : '';
                return `
                    <div class="d-flex align-items-start justify-content-between py-1 border-bottom">
                        <div class="me-2">
                            <div class="text-body">${it.name || '-'}</div>
                            <div class="text-muted small"><code>${it.codename}</code></div>
                        </div>
                        <div class="form-check m-0 pt-1">
                            <input class="form-check-input group-panel-checkbox"
                                   type="checkbox"
                                   ${checked}
                                   data-group-name="${groupName}"
                                   data-codename="${it.codename}"
                                   data-section="${section}">
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="accordion-item">
                    <h2 class="accordion-header" id="${headerId}">
                        <div class="d-flex align-items-stretch">
                            <button class="accordion-button ${expanded ? '' : 'collapsed'} flex-grow-1" type="button"
                                    data-bs-toggle="collapse"
                                    data-bs-target="#${collapseId}"
                                    aria-expanded="${expanded ? 'true' : 'false'}"
                                    aria-controls="${collapseId}">
                                <div class="d-flex align-items-center gap-2 w-100">
                                    <span class="badge ${sectionBadgeClass(section)}">${sectionLabel(section)}</span>
                                    <span class="text-muted small">${selectedCount}/${total}</span>
                                </div>
                            </button>
                            <div class="px-3 d-flex align-items-center border-start">
                                <div class="form-check m-0">
                                    <input class="form-check-input section-parent-checkbox"
                                           type="checkbox"
                                           ${allSelected ? 'checked' : ''}
                                           data-section="${section}"
                                           onclick="event.stopPropagation();">
                                </div>
                            </div>
                        </div>
                    </h2>
                    <div id="${collapseId}" class="accordion-collapse collapse ${expanded ? 'show' : ''}"
                         aria-labelledby="${headerId}">
                        <div class="accordion-body py-2">
                            ${children || `<div class="text-muted">-</div>`}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const permsList = `
            <div class="accordion" id="group-portal-accordion">
                ${sectionAccordions || `<div class="text-muted">-</div>`}
            </div>
        `;

        panel.innerHTML = `
            <div class="card shadow-sm h-100">
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title mb-1">
                        <i class="fas fa-users-cog me-2"></i>${groupInfo.display_name || groupInfo.name}${portalBadgeHtml}
                    </h5>
                    <p class="text-muted mb-2"><code>${groupInfo.name}</code></p>
                    <div class="d-flex flex-wrap gap-2 mb-3">
                        <span class="badge bg-secondary">Üye: ${groupInfo.member_count ?? members.length ?? '-'}</span>
                        <span class="badge bg-secondary">Yetki: ${currentGroupPermsDraft.size}</span>
                    </div>

                    <div class="d-flex gap-2 mb-3">
                        <button type="button" class="btn btn-sm btn-success" id="group-save-btn" ${currentGroupDirty ? '' : 'disabled'}>
                            <i class="fas fa-save me-1"></i>Kaydet
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" id="group-discard-btn" ${currentGroupDirty ? '' : 'disabled'}>
                            <i class="fas fa-undo me-1"></i>Vazgeç
                        </button>
                        <div class="ms-auto text-muted small" id="group-dirty-indicator">${currentGroupDirty ? 'Kaydedilmemiş değişiklikler' : ''}</div>
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

    // Sync initial UI state on each re-render
    setDirty(currentGroupDirty === true);

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

            if (setsEqual(currentGroupPermsDraft, currentGroupPermsOriginal)) {
                setDirty(false);
                return;
            }

            saveBtn.disabled = true;
            discardBtn.disabled = true;
            if (dirtyIndicator) dirtyIndicator.textContent = 'Kaydediliyor...';

            try {
                // Bulk replace (send only leaf/child codenames)
                const payload = Array.from(currentGroupPermsDraft);
                await saveGroupPermissionsBulk(groupName, payload);

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

            // Update the portal header counters/indeterminate state by re-rendering panel (no network)
            // Preserve collapse state.
            captureSectionCollapseState(panel);
            await loadGroupDetail(currentGroupName);
        });
    });

    // Parent portal checkbox: select/deselect all children in that portal.
    panel.querySelectorAll('.section-parent-checkbox').forEach(pcb => {
        // set indeterminate if partially selected
        const section = pcb.getAttribute('data-section');
        if (section) {
            const children = panel.querySelectorAll(`.group-panel-checkbox[data-section="${section}"]`);
            let total = 0;
            let selected = 0;
            children.forEach(ch => {
                total += 1;
                if (ch.checked) selected += 1;
            });
            pcb.indeterminate = selected > 0 && selected < total;
        }

        pcb.addEventListener('change', async () => {
            const section = pcb.getAttribute('data-section');
            if (!section) return;
            const wantChecked = pcb.checked === true;

            // Preserve collapse state while we update/re-render
            captureSectionCollapseState(panel);

            panel.querySelectorAll(`.group-panel-checkbox[data-section="${section}"]`).forEach(ch => {
                const codename = ch.getAttribute('data-codename');
                if (!codename) return;
                if (wantChecked) currentGroupPermsDraft.add(codename);
                else currentGroupPermsDraft.delete(codename);
            });

            const isDirty = !setsEqual(currentGroupPermsDraft, currentGroupPermsOriginal);
            setDirty(isDirty);
            await loadGroupDetail(currentGroupName);
        });
    });

    // Track expand/collapse state so re-renders don't lose it.
    panel.querySelectorAll('.accordion-collapse').forEach(el => {
        el.addEventListener('shown.bs.collapse', () => {
            const section = el.querySelector('.group-panel-checkbox')?.getAttribute('data-section');
            if (section) sectionCollapseState.set(section, true);
        });
        el.addEventListener('hidden.bs.collapse', () => {
            const section = el.querySelector('.group-panel-checkbox')?.getAttribute('data-section');
            if (section) sectionCollapseState.set(section, false);
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

// No filters on this page.

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
        await ensurePermissionsCatalogLoaded();
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
    const catalog = Array.isArray(permissionsCatalog) ? permissionsCatalog : [];
    const catalogMap = new Map(catalog.map(p => [p.codename, p.name || p.codename]));
    const allCodenames = Array.from(new Set([
        ...catalog.map(p => p.codename),
        ...Object.keys(effective_permissions || {})
    ])).sort((a, b) => a.localeCompare(b, 'tr'));
    const codenames = allCodenames.length
        ? allCodenames
        : (permissionsMatrix?.codenames || Object.keys(effective_permissions || {}));
    const overridesMap = new Map((overrides || []).map(o => [o.codename, o]));

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
        const permName = catalogMap.get(code) || code;
        const hasOverride = overridesMap.has(code);

        // Backend already resolves the permission source; render it directly.
        const sourceBadge = user.is_superuser
            ? formatPermSourceBadge('superuser', '')
            : formatPermSourceBadge(permObj.source, permObj.source_detail);
        return `
            <tr>
                <td>
                    <div class="fw-semibold">${permName}</div>
                    <div class="text-muted small"><code>${code}</code></div>
                </td>
                <td>${boolIcon(value)}</td>
                <td>${sourceBadge}</td>
                <td>
                    ${!user.is_superuser ? `
                    <div class="btn-group btn-group-sm" role="group" aria-label="permission-actions">
                        <button type="button"
                                class="btn btn-outline-success quick-perm-btn"
                                data-codename="${code}"
                                data-action="grant"
                                title="Bu kullanıcı için izin ver">
                            Ver
                        </button>
                        <button type="button"
                                class="btn btn-outline-warning quick-perm-btn"
                                data-codename="${code}"
                                data-action="deny"
                                title="Bu kullanıcı için engelle">
                            Engelle
                        </button>
                        <button type="button"
                                class="btn btn-outline-danger clear-perm-override-btn"
                                data-codename="${code}"
                                ${hasOverride ? '' : 'disabled'}
                                title="Bireysel override kaldır ve grup varsayılanına dön">
                            Sıfırla
                        </button>
                    </div>
                    <button type="button"
                            class="btn btn-sm btn-link text-decoration-none override-button ms-1"
                            data-codename="${code}">
                        Detay
                    </button>
                    ` : ''}
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
                                <th>Yetki</th>
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

    panel.querySelectorAll('.quick-perm-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const codename = btn.getAttribute('data-codename');
            const action = btn.getAttribute('data-action');
            if (!codename || !action) return;

            try {
                await saveUserPermissionOverride(userId, {
                    codename,
                    granted: action === 'grant',
                    reason: ''
                });
                showNotification(
                    action === 'grant'
                        ? `${codename} izni kullanıcıya verildi`
                        : `${codename} izni kullanıcı için engellendi`,
                    'success'
                );
                await loadUserDetail(userId);
                await loadMatrix();
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Yetki güncellenirken hata oluştu', 'error');
            }
        });
    });

    panel.querySelectorAll('.clear-perm-override-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const codename = btn.getAttribute('data-codename');
            if (!codename) return;

            try {
                await deleteUserPermissionOverride(userId, codename);
                showNotification(`${codename} için bireysel ayar kaldırıldı`, 'success');
                await loadUserDetail(userId);
                await loadMatrix();
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Bireysel ayar kaldırılırken hata oluştu', 'error');
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

