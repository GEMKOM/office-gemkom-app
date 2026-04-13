import { initNavbar } from '../../components/navbar.js';
import { ModernDropdown } from '../../components/dropdown/dropdown.js';
import { authFetchUsers, deleteUser as deleteUserAPI, createUser as createUserAPI, updateUser as updateUserAPI, fetchOccupations, fetchUserGroups } from '../../apis/users.js';
import { fetchUsersSummary } from '../../apis/summaries.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { showNotification } from '../../components/notification/notification.js';
import { fetchShiftRules, assignShiftRuleToUser } from '../../apis/human_resources/attendance.js';
import { fetchWageRatesForUser } from '../../apis/hr.js';
import { fetchAttendanceMonthlySummary } from '../../apis/human_resources/attendance.js';

function ensureUserEditTabs(editModal, user) {
    const modalEl = editModal?.modal;
    const container = editModal?.container;
    if (!modalEl || !container) return;

    const form = container.querySelector('#edit-modal-form');
    if (!form) return;

    const existingTabs = container.querySelector('[data-user-edit-tabs="true"]');
    const existingForUser = existingTabs?.getAttribute('data-user-id');
    if (existingTabs) {
        // If the modal is being reused for a different user, teardown and rebuild tabs.
        if (existingForUser && String(existingForUser) !== String(user.id)) {
            const existingForm = existingTabs.querySelector('#edit-modal-form') || container.querySelector('#edit-modal-form');
            if (existingForm) {
                container.insertBefore(existingForm, existingTabs);
            }
            existingTabs.remove();
        } else {
            return;
        }
    }

    const tabsId = `user-edit-tabs-${user.id}`;
    const contentId = `user-edit-tab-content-${user.id}`;

    const tabsWrapper = document.createElement('div');
    tabsWrapper.setAttribute('data-user-edit-tabs', 'true');
    tabsWrapper.setAttribute('data-user-id', String(user.id));
    tabsWrapper.innerHTML = `
        <ul class="nav nav-tabs mb-3" id="${tabsId}" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active" id="tab-bilgiler-${user.id}" data-bs-toggle="tab" data-bs-target="#pane-bilgiler-${user.id}" type="button" role="tab">
                    <i class="fas fa-user me-1"></i>Bilgiler
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" id="tab-maaslar-${user.id}" data-bs-toggle="tab" data-bs-target="#pane-maaslar-${user.id}" type="button" role="tab">
                    <i class="fas fa-money-bill-wave me-1"></i>Maaşlar
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" id="tab-yoklama-${user.id}" data-bs-toggle="tab" data-bs-target="#pane-yoklama-${user.id}" type="button" role="tab">
                    <i class="fas fa-calendar-alt me-1"></i>Yoklama Özeti
                </button>
            </li>
        </ul>
        <div class="tab-content" id="${contentId}">
            <div class="tab-pane fade show active" id="pane-bilgiler-${user.id}" role="tabpanel"></div>
            <div class="tab-pane fade" id="pane-maaslar-${user.id}" role="tabpanel">
                <div class="py-2">
                    <div class="d-flex align-items-center justify-content-between mb-2">
                        <div class="fw-semibold">Ücret Geçmişi</div>
                        <button class="btn btn-sm btn-outline-secondary" type="button" data-wages-refresh>
                            <i class="fas fa-sync-alt me-1"></i>Yenile
                        </button>
                    </div>
                    <div class="text-muted small mb-2">Bu sekme sadece görüntüleme amaçlıdır.</div>
                    <div id="wages-box-${user.id}"></div>
                </div>
            </div>
            <div class="tab-pane fade" id="pane-yoklama-${user.id}" role="tabpanel">
                <div class="py-2">
                    <div class="fw-semibold mb-2">Aylık Yoklama Özeti</div>
                    <div class="row g-2 align-items-end mb-3">
                        <div class="col-6 col-md-3">
                            <label class="form-label small mb-1">Yıl</label>
                            <input class="form-control form-control-sm" type="number" id="att-year-${user.id}" min="2000" max="2100" />
                        </div>
                        <div class="col-6 col-md-3">
                            <label class="form-label small mb-1">Ay</label>
                            <select class="form-select form-select-sm" id="att-month-${user.id}">
                                <option value="1">Ocak</option>
                                <option value="2">Şubat</option>
                                <option value="3">Mart</option>
                                <option value="4">Nisan</option>
                                <option value="5">Mayıs</option>
                                <option value="6">Haziran</option>
                                <option value="7">Temmuz</option>
                                <option value="8">Ağustos</option>
                                <option value="9">Eylül</option>
                                <option value="10">Ekim</option>
                                <option value="11">Kasım</option>
                                <option value="12">Aralık</option>
                            </select>
                        </div>
                        <div class="col-12 col-md-3">
                            <button class="btn btn-sm btn-primary w-100" type="button" id="att-fetch-${user.id}">
                                <i class="fas fa-search me-1"></i>Sorgula
                            </button>
                        </div>
                    </div>
                    <div id="att-summary-${user.id}"></div>
                    <div id="att-days-${user.id}" class="mt-3"></div>
                </div>
            </div>
        </div>
    `;

    // Insert tabs before the form in modal body
    form.parentElement.insertBefore(tabsWrapper, form);

    // Move the entire form into the first tab pane
    const paneBilgiler = container.querySelector(`#pane-bilgiler-${user.id}`);
    if (paneBilgiler) paneBilgiler.appendChild(form);

    const today = new Date();
    const yEl = container.querySelector(`#att-year-${user.id}`);
    const mEl = container.querySelector(`#att-month-${user.id}`);
    if (yEl) yEl.value = String(today.getFullYear());
    if (mEl) mEl.value = String(today.getMonth() + 1);

    let wagesLoaded = false;
    let attendanceLoaded = false;

    async function renderWages() {
        const box = container.querySelector(`#wages-box-${user.id}`);
        if (!box) return;
        box.innerHTML = '<div class="text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Yükleniyor...</div>';
        try {
            const resp = await fetchWageRatesForUser(user.id);
            const rows = resp?.results || resp || [];
            if (!rows.length) {
                box.innerHTML = '<div class="text-muted">Ücret kaydı bulunamadı.</div>';
                return;
            }
            const items = rows
                .slice()
                .sort((a, b) => new Date(b.effective_from || 0) - new Date(a.effective_from || 0))
                .map(r => {
                    const date = r.effective_from ? new Date(r.effective_from).toLocaleDateString('tr-TR') : '-';
                    const amount = r.base_monthly ?? r.base_hourly ?? '-';
                    const cur = r.currency || '';
                    return `<tr><td>${date}</td><td>${amount} ${cur}</td></tr>`;
                })
                .join('');
            box.innerHTML = `
                <div class="table-responsive">
                    <table class="table table-sm table-hover mb-0">
                        <thead><tr><th>Tarih</th><th>Ücret</th></tr></thead>
                        <tbody>${items}</tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            box.innerHTML = `<div class="text-danger">Ücretler yüklenemedi: ${e.message || e}</div>`;
        }
    }

    function renderAttendance(summary) {
        const summaryEl = container.querySelector(`#att-summary-${user.id}`);
        const daysEl = container.querySelector(`#att-days-${user.id}`);
        if (!summaryEl || !daysEl) return;

        const shift = summary?.shift_rule || null;
        const thresholdMin = Number(shift?.overtime_threshold_minutes ?? 0) || 0;

        const weekdayTr = (w) => {
            const s = (w || '').toString().toLowerCase();
            const map = {
                monday: 'Pazartesi',
                tuesday: 'Salı',
                wednesday: 'Çarşamba',
                thursday: 'Perşembe',
                friday: 'Cuma',
                saturday: 'Cumartesi',
                sunday: 'Pazar'
            };
            return map[s] || (w || '-');
        };

        const dayTypeTr = (t) => {
            const s = (t || '').toString();
            const map = {
                working: 'Çalışma Günü',
                weekend: 'Hafta Sonu',
                public_holiday: 'Resmi Tatil',
                company_holiday: 'Şirket Tatili'
            };
            return map[s] || s || '-';
        };

        const parseNum = (v) => {
            if (v === undefined || v === null || v === '') return 0;
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };

        const timeHM = (v) => {
            if (!v) return '-';
            const d = new Date(v);
            if (Number.isNaN(d.getTime())) {
                const s = String(v);
                // fallback: try "HH:MM:SS" or "HH:MM" somewhere in the string
                const m = s.match(/\b(\d{2}:\d{2}:\d{2})\b/) || s.match(/\b(\d{2}:\d{2})\b/);
                return m ? m[1] : s;
            }
            return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };

        const flagTr = (f) => {
            const s = (f || '').toString();
            const map = {
                absent: 'Gelmedi',
                late: 'Geç Geldi',
                missing_checkout: 'Çıkış Eksik'
            };
            return map[s] || s || '-';
        };

        const s = summary?.summary || {};
        summaryEl.innerHTML = `
            <div class="row g-2">
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Çalışma Günü</div><div class="fw-semibold">${s.total_working_days ?? '-'}</div></div></div>
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Geldi</div><div class="fw-semibold">${s.total_present ?? '-'}</div></div></div>
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Gelmedi</div><div class="fw-semibold">${s.total_absent ?? '-'}</div></div></div>
                <div class="col-6 col-md-3"><div class="p-2 border rounded small"><div class="text-muted">Fazla Mesai (s)</div><div class="fw-semibold">${s.total_overtime_hours ?? '-'}</div></div></div>
            </div>
        `;

        const days = Array.isArray(summary?.days) ? summary.days : [];
        if (!days.length) {
            daysEl.innerHTML = '<div class="text-muted">Gün bulunamadı.</div>';
            return;
        }
        const rows = days.map(d => {
            const rec = d.record || null;
            const flag = d.flag ? `<span class="status-badge status-red">${flagTr(d.flag)}</span>` : '-';
            const inTime = rec ? timeHM(rec.check_in_time || rec.check_in_at || rec.check_in) : '-';
            const outTime = rec ? timeHM(rec.check_out_time || rec.check_out_at || rec.check_out) : '-';

            // Highlight rules:
            // - overtime: overtime_hours exceeds threshold (minutes) from shift rule
            // - undertime: late_minutes or early_leave_minutes exceeds same threshold
            let rowClass = '';
            if (rec && thresholdMin > 0) {
                const overtimeHours = parseNum(rec.overtime_hours);
                const overtimeMin = overtimeHours * 60;
                const lateMin = parseNum(rec.late_minutes);
                const earlyLeaveMin = parseNum(rec.early_leave_minutes);

                const isOvertime = overtimeMin >= thresholdMin && overtimeMin > 0;
                const isUndertime = (lateMin >= thresholdMin && lateMin > 0) || (earlyLeaveMin >= thresholdMin && earlyLeaveMin > 0);

                if (isOvertime) rowClass = 'attendance-overtime-row';
                else if (isUndertime) rowClass = 'attendance-undertime-row';
            }

            return `<tr class="${rowClass}">
                <td>${d.date || '-'}</td>
                <td>${weekdayTr(d.weekday)}</td>
                <td>${dayTypeTr(d.day_type)}</td>
                <td>${d.holiday_name || '-'}</td>
                <td>${flag}</td>
                <td>${inTime}</td>
                <td>${outTime}</td>
                </tr>`;
        }).join('');

        daysEl.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead>
                        <tr>
                            <th>Tarih</th><th>Gün</th><th>Gün Türü</th><th>Tatil</th><th>Durum Notu</th><th>Giriş</th><th>Çıkış</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    async function loadAttendance() {
        const y = Number(container.querySelector(`#att-year-${user.id}`)?.value);
        const m = Number(container.querySelector(`#att-month-${user.id}`)?.value);
        const daysEl = container.querySelector(`#att-days-${user.id}`);
        if (daysEl) daysEl.innerHTML = '<div class="text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Yükleniyor...</div>';
        try {
            const resp = await fetchAttendanceMonthlySummary({ user_id: user.id, year: y, month: m });
            renderAttendance(resp);
        } catch (e) {
            if (daysEl) daysEl.innerHTML = `<div class="text-danger">Yoklama özeti yüklenemedi: ${e.message || e}</div>`;
        }
    }

    // Lazy-load on tab open
    const tabButtons = container.querySelectorAll(`#${tabsId} [data-bs-toggle="tab"]`);
    tabButtons.forEach(btn => {
        btn.addEventListener('shown.bs.tab', async (e) => {
            const target = e.target?.getAttribute('data-bs-target') || '';
            if (target.includes(`pane-maaslar-${user.id}`) && !wagesLoaded) {
                wagesLoaded = true;
                await renderWages();
            }
            if (target.includes(`pane-yoklama-${user.id}`) && !attendanceLoaded) {
                attendanceLoaded = true;
                await loadAttendance();
            }
        });
    });

    container.querySelector(`[data-wages-refresh]`)?.addEventListener('click', () => renderWages());
    container.querySelector(`#att-fetch-${user.id}`)?.addEventListener('click', () => loadAttendance());
}

// State management
let currentPage = 1;
let currentFilter = 'all';
let currentOrdering = 'username'; // Default backend ordering
let currentSortField = 'username'; // Default sort field
let currentSortDirection = 'asc'; // Default sort direction
let users = [];
let totalUsers = 0;
let isLoading = false;
let usersStats = null; // Statistics Cards component instance
let userFilters = null; // Filters component instance
let occupations = []; // Store occupations data for filters
let groups = []; // Store groups data for filters
let usersTable = null; // Table component instance
let shiftRules = []; // Store shift rules for assignment dropdown

// Modal component instances
let createUserModal = null;
let editUserModal = null;
let deleteUserModal = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    // Load shift rules for user assignment dropdown
    try {
        const data = await fetchShiftRules();
        shiftRules = (Array.isArray(data) ? data : (data?.results || [])).filter(r => r && r.is_active !== false);
    } catch (e) {
        console.warn('Failed to load shift rules:', e);
        shiftRules = [];
    }
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Çalışan Yönetimi',
        subtitle: 'Çalışan listesi ve yönetimi',
        icon: 'users',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'none',
        createButtonText: '      Yeni Çalışan',
        onBackClick: () => window.location.href = '/general/',
        onCreateClick: () => showCreateUserModal()
    });
    
    // Initialize Statistics Cards component
    usersStats = new StatisticsCards('users-statistics', {
        cards: [
            { title: 'Toplam Çalışan', value: '0', icon: 'fas fa-users', color: 'primary', id: 'total-users-count' },
            { title: 'Ofis', value: '0', icon: 'fas fa-building', color: 'success', id: 'office-users-count' },
            { title: 'Atölye', value: '0', icon: 'fas fa-industry', color: 'info', id: 'workshop-users-count' },
            { title: 'Aktif Takım', value: '0', icon: 'fas fa-user-friends', color: 'warning', id: 'active-teams-count' }
        ],
        compact: true,
        animation: true
    });
    
    await initializeUsers();
    setupEventListeners();
});

async function initializeUsers() {
    try {
        initializeFiltersComponent();
        initializeTableComponent();
        initializeModalComponents();
        
        await loadGroups();
        await loadOccupations();
        updateOccupationFilterOptions();
        updateGroupFilterOptions();
        
        await loadUsers();
        updateUserCounts();
    } catch (error) {
        console.error('Error initializing users:', error);
        showNotification('Çalışanlar yüklenirken hata oluştu', 'error');
    }
}

function initializeTableComponent() {
    usersTable = new TableComponent('users-table-container', {
        title: 'Çalışan Listesi',
        columns: [
            {
                field: 'id',
                label: 'ID',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'username',
                label: 'Kullanıcı Adı',
                sortable: true,
                formatter: (value) => `<strong>${value || '-'}</strong>`
            },
            {
                field: 'first_name',
                label: 'Ad',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'last_name',
                label: 'Soyad',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'email',
                label: 'E-posta',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'occupation_label',
                label: 'Görev',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'portal',
                label: 'Portal',
                sortable: true,
                formatter: (value) => {
                    const v = (value || '').toString();
                    if (!v) return '-';
                    if (v === 'office') return '<span class="status-badge status-blue">OFİS</span>';
                    if (v === 'workshop') return '<span class="status-badge status-grey">ATÖLYE</span>';
                    return `<span class="status-badge status-grey">${v}</span>`;
                }
            },
            {
                field: 'groups',
                label: 'Gruplar',
                sortable: false,
                formatter: (value) => {
                    const arr = Array.isArray(value) ? value : [];
                    return arr.length ? arr.join(', ') : '-';
                }
            },
            {
                field: 'is_active',
                label: 'Durum',
                sortable: true,
                formatter: (value) => {
                    if (value === true) {
                        return '<span class="status-badge status-green">Aktif</span>';
                    } else if (value === false) {
                        return '<span class="status-badge status-grey">Pasif</span>';
                    }
                    return '<span class="text-muted">-</span>';
                }
            }
        ],
        data: [],
        sortable: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        refreshable: true,
        exportable: true,
        onRefresh: async () => {
            // Reset to first page when refreshing
            currentPage = 1;
            await loadUsers();
        },
        onExport: async (format) => {
            await exportUsers(format);
        },
        onSort: async (field, direction) => {
            // Reset to first page when sorting
            currentPage = 1;
            currentSortField = field;
            currentSortDirection = direction;
            await loadUsers();
        },
        onPageSizeChange: async (newPageSize) => {
            // Update local variable to keep in sync
            let itemsPerPage = newPageSize;
            // Ensure table component also has the correct value (should already be set, but ensure sync)
            if (usersTable) {
                usersTable.options.itemsPerPage = newPageSize;
            }
            // Reset to page 1 and load with new page size
            currentPage = 1;
            await loadUsers();
        },
        onPageChange: async (page) => {
            currentPage = page;
            await loadUsers();
        },
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    editUser(row.id);
                }
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => deleteUser(row.id, row.username)
            }
        ],
        emptyMessage: 'Çalışan bulunamadı',
        emptyIcon: 'fas fa-users'
    });
}

async function loadOccupations() {
    try {
        const occupationsData = await fetchOccupations();
        occupations = occupationsData; // Store occupations globally
        
        // Populate occupation dropdown in create user modal
        const occupationSelect = document.getElementById('user-occupation');
        if (occupationSelect) {
            occupationSelect.innerHTML = '<option value="">Görev seçin...</option>';
            occupations.forEach(occupation => {
                const option = document.createElement('option');
                option.value = occupation.value || occupation.id;
                option.textContent = occupation.label || occupation.name;
                occupationSelect.appendChild(option);
            });
        }
        
        // Also populate occupation dropdown in edit user modal (if it exists)
        const editOccupationSelect = document.getElementById('edit-user-occupation');
        if (editOccupationSelect) {
            editOccupationSelect.innerHTML = '<option value="">Görev seçin...</option>';
            occupations.forEach(occupation => {
                const option = document.createElement('option');
                option.value = occupation.value || occupation.id;
                option.textContent = occupation.label || occupation.name;
                editOccupationSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading occupations:', error);
    }
}

async function loadGroups() {
    try {
        const data = await fetchUserGroups();
        groups = Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Error loading groups:', error);
        groups = [];
    }
}

function initializeFiltersComponent() {
    // Initialize filters component
    userFilters = new FiltersComponent('filters-placeholder', {
        title: 'Çalışan Filtreleri',
        onApply: (values) => {
            // Reset to first page when applying filters
            currentPage = 1;
            loadUsers();
        },
        onClear: () => {
            // Reset to first page when clearing filters
            currentPage = 1;
            loadUsers();
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
        }
    });

    // Add text filters
    userFilters.addTextFilter({
        id: 'username-filter',
        label: 'Kullanıcı Adı',
        placeholder: 'Kullanıcı adı',
        colSize: 3
    });

    userFilters.addDropdownFilter({
        id: 'group-filter',
        label: 'Grup',
        placeholder: 'Tüm Gruplar',
        options: [
            { value: '', label: 'Tüm Gruplar' }
        ],
        multiple: true,
        colSize: 3
    });

    // "Çalışma Yeri" is now derived from access flags instead of a user field.
    // Ofis -> office_access=true, Atölye -> workshop_access=true
    userFilters.addDropdownFilter({
        id: 'access-filter',
        label: 'Erişim',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'office', label: 'Ofis' },
            { value: 'workshop', label: 'Atölye' }
        ],
        placeholder: 'Tümü',
        colSize: 3
    });

    userFilters.addDropdownFilter({
        id: 'occupation-filter',
        label: 'Görev',
        options: [
            { value: '', label: 'Tüm Görevler' }
        ],
        placeholder: 'Tüm Görevler',
        colSize: 3
    });

    userFilters.addDropdownFilter({
        id: 'is-active-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        placeholder: 'Tümü',
        colSize: 3
    });
}

// Initialize modal components
function initializeModalComponents() {
    // Create User Modal
    createUserModal = new EditModal('create-user-modal-container', {
        title: 'Yeni Çalışan Oluştur',
        icon: 'fas fa-plus-circle',
        size: 'lg',
        showEditButton: false
    });

    // Edit User Modal
    editUserModal = new EditModal('edit-user-modal-container', {
        title: 'Çalışan Düzenle',
        icon: 'fas fa-edit',
        size: 'xl',
        showEditButton: false
    });

    // Delete User Modal
    deleteUserModal = new DisplayModal('delete-user-modal-container', {
        title: 'Çalışan Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        size: 'md',
        showEditButton: false
    });

    // Set up modal callbacks
    setupModalCallbacks();
}

// Set up modal callbacks
function setupModalCallbacks() {
    // Create user modal callbacks
    createUserModal.onSaveCallback(async (formData) => {
        await createUser(formData);
    });

    // Edit user modal callbacks
    editUserModal.onSaveCallback(async (formData) => {
        await updateUser(formData);
    });

    // Delete user modal callbacks
    deleteUserModal.onCloseCallback(() => {
        // Clear any pending delete data when modal is closed
        window.pendingDeleteUserId = null;
    });
}

async function loadUsers() {
    try {
        if (isLoading) return;
        
        isLoading = true;
        if (usersTable) {
            usersTable.setLoading(true);
        }
        
        // Get filter values
        const filterValues = userFilters ? userFilters.getFilterValues() : {};
        
        // Build query parameters
        const params = new URLSearchParams();
        params.append('page', currentPage.toString());
        // Get page size from table component if available, otherwise use default
        // This ensures we always use the most up-to-date page size
        const pageSize = usersTable ? usersTable.options.itemsPerPage : 20;
        params.append('page_size', String(pageSize));
        
        // Add filters
        if (filterValues['username-filter']) {
            params.append('username', filterValues['username-filter']);
        }
        // group can be single or multiple. backend supports comma-separated list
        const groupVal = filterValues['group-filter'] || [];
        const group = Array.isArray(groupVal) ? groupVal.filter(Boolean).join(',') : (groupVal || '');
        if (group) params.append('group', group);

        // access filter -> office_access/workshop_access
        const access = filterValues['access-filter'] || '';
        if (access === 'office') params.append('office_access', 'true');
        if (access === 'workshop') params.append('workshop_access', 'true');

        if (filterValues['occupation-filter']) {
            params.append('occupation', filterValues['occupation-filter']);
        }
        if (filterValues['is-active-filter']) {
            params.append('is_active', filterValues['is-active-filter']);
        }
        
        // Add ordering
        const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
        params.append('ordering', orderingParam);
        
        // Call API with parameters
        const usersResponse = await authFetchUsers(currentPage, pageSize, {
            username: filterValues['username-filter'] || '',
            group,
            office_access: access === 'office' ? 'true' : '',
            workshop_access: access === 'workshop' ? 'true' : '',
            occupation: filterValues['occupation-filter'] || '',
            is_active: filterValues['is-active-filter'] || '',
            ordering: orderingParam
        });
        
        // Extract users and total count from response
        users = usersResponse.results || usersResponse || [];
        totalUsers = usersResponse.count || usersResponse.total || users.length;
        
        // Update table data with pagination info
        if (usersTable) {
            usersTable.updateData(users, totalUsers, currentPage);
        } else {
            console.warn('usersTable is null, cannot update data');
        }
        
        updateUserCounts();
        
        updateOccupationFilterOptions();
        updateGroupFilterOptions();
        
    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Çalışanlar yüklenirken hata oluştu', 'error');
        users = [];
        totalUsers = 0;
        if (usersTable) {
            usersTable.updateData([], 0, currentPage);
        }
    } finally {
        isLoading = false;
        if (usersTable) {
            usersTable.setLoading(false);
        }
    }
}

// Table rendering is now handled by TableComponent

// Pagination is now handled by TableComponent

function updateUserCounts() {
    try {
        // Load summary data
        fetchUsersSummary().then(summary => {
            // New shape: { total, office, workshop }
            // Legacy shape: [{ portal/work_location, count }, ...]
            let officeCount = 0;
            let workshopCount = 0;
            let totalCount = 0;

            if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
                officeCount = Number(summary.office || 0);
                workshopCount = Number(summary.workshop || 0);
                totalCount = Number(summary.total || (officeCount + workshopCount));
            } else if (Array.isArray(summary)) {
                officeCount = summary.find(s => (s.portal || s.work_location) === 'office')?.count || 0;
                workshopCount = summary.find(s => (s.portal || s.work_location) === 'workshop')?.count || 0;
                totalCount = officeCount + workshopCount;
            }
            
            // Card kept for layout; count distinct occupations instead of teams (team field removed)
            const occs = new Set(users.map(user => user.occupation_label).filter(Boolean));
            const activeTeamsCount = occs.size;
            
            // Update statistics cards using the component
            if (usersStats) {
                usersStats.updateValues({
                    0: totalCount.toString(),
                    1: officeCount.toString(),
                    2: workshopCount.toString(),
                    3: activeTeamsCount.toString()
                });
            }
        });
    } catch (error) {
        console.error('Error updating user counts:', error);
    }
}

function updateOccupationFilterOptions() {
    if (!userFilters) return;
    
    // Update occupation filter options using stored occupations data
    const occupationOptions = [
        { value: '', label: 'Tüm Görevler' },
        ...occupations.map(occupation => ({ 
            value: occupation.value || occupation.id, 
            label: occupation.label || occupation.name 
        }))
    ];
    
    userFilters.updateFilterOptions('occupation-filter', occupationOptions);
}

function updateGroupFilterOptions() {
    if (!userFilters) return;

    const groupOptions = [
        { value: '', label: 'Tüm Gruplar' },
        ...(groups || []).map(g => ({
            value: g.name,
            label: g.display_name || g.name
        }))
    ];

    userFilters.updateFilterOptions('group-filter', groupOptions);
}

// Sorting is now handled by TableComponent

function setupEventListeners() {
    // Use event delegation for dynamically added buttons
    document.addEventListener('click', async (e) => {
        if (e.target && e.target.id === 'confirm-delete-user-btn') {
            const userId = window.pendingDeleteUserId;
            if (!userId) return;
            
            try {
                const response = await deleteUserAPI(userId);
                
                if (response.ok) {
                    showNotification('Çalışan silindi', 'success');
                    // Hide the modal
                    deleteUserModal.hide();
                    // Clear the pending delete key
                    window.pendingDeleteUserId = null;
                    // Reload users
                    await loadUsers();
                } else {
                    throw new Error('Failed to delete user');
                }
            } catch (error) {
                console.error('Error deleting user:', error);
                showNotification('Çalışan silinirken hata oluştu', 'error');
            }
        }
    });
}

// Global functions for actions

 window.editUser = function(userId) {
     // Check if userId is valid
     if (!userId || userId === '') {
         showNotification('Geçersiz çalışan ID', 'error');
         return;
     }
     
     // Ensure teams are loaded
     // Find the user data - convert userId to string for comparison
     const user = users.find(u => String(u.id) === String(userId));
     if (!user) {
         showNotification('Çalışan bulunamadı', 'error');
         return;
     }
     
     // Store the user ID for update
     window.editingUserId = userId;
     
    // Clear and configure the edit modal
    editUserModal.clearAll();
     
     // Add Basic Information section
     editUserModal.addSection({
         title: 'Temel Bilgiler',
         icon: 'fas fa-info-circle',
         iconColor: 'text-primary'
     });

     // Add form fields with user data
     editUserModal.addField({
         id: 'username',
         name: 'username',
         label: 'Kullanıcı Adı',
         type: 'text',
         value: user.username || '',
         required: true,
         icon: 'fas fa-user',
         colSize: 6,
         helpText: 'Benzersiz kullanıcı adı'
     });

     editUserModal.addField({
         id: 'email',
         name: 'email',
         label: 'E-posta',
         type: 'email',
         value: user.email || '',
         icon: 'fas fa-envelope',
         colSize: 6,
         helpText: 'İletişim için e-posta adresi'
     });

     editUserModal.addField({
         id: 'first_name',
         name: 'first_name',
         label: 'Ad',
         type: 'text',
         value: user.first_name || '',
         required: true,
         icon: 'fas fa-id-card',
         colSize: 6,
         helpText: 'Çalışanın adı'
     });

     editUserModal.addField({
         id: 'last_name',
         name: 'last_name',
         label: 'Soyad',
         type: 'text',
         value: user.last_name || '',
         required: true,
         icon: 'fas fa-id-card',
         colSize: 6,
         helpText: 'Çalışanın soyadı'
     });

     // Add Work Information section
     editUserModal.addSection({
         title: 'İş Bilgileri',
         icon: 'fas fa-briefcase',
         iconColor: 'text-success'
     });

     // Shift rule assignment dropdown (HR)
     const currentShiftId =
        user.shift_rule_id ??
        user.shift_rule?.id ??
        user.shift_rule ??
        '';

     const shiftRuleOptions = [
        { value: '', label: 'Varsayılan (otomatik)' },
        ...shiftRules.map(r => ({
            value: String(r.id),
            label: `${r.name} (${String(r.expected_start || '').slice(0, 5)}-${String(r.expected_end || '').slice(0, 5)})`
        }))
     ];

     editUserModal.addField({
         id: 'shift_rule_id',
         name: 'shift_rule_id',
         label: 'Vardiya Kuralı',
         type: 'dropdown',
         value: currentShiftId ? String(currentShiftId) : '',
         options: shiftRuleOptions,
         placeholder: 'Varsayılan (otomatik)',
         searchable: true,
         icon: 'fas fa-clock',
         colSize: 12,
         helpText: 'Seçerseniz kullanıcıya kural atanır; “Varsayılan” seçerseniz otomatik kurala döner.'
     });

     // Add is_active checkbox
     editUserModal.addField({
         id: 'is_active',
         name: 'is_active',
         label: 'Aktif',
         type: 'checkbox',
         value: user.is_active !== false, // Default to true if not explicitly false
         icon: 'fas fa-check-circle',
         colSize: 12,
         helpText: 'Çalışanın aktif durumu'
     });

     // Render and show modal
     editUserModal.render();
    ensureUserEditTabs(editUserModal, user);
     editUserModal.show();
 };

window.deleteUser = function(userId, username) {
    showDeleteUserModal(userId, username);
};

// Show delete user confirmation modal
function showDeleteUserModal(userId, username) {
    // Store the user ID for deletion
    window.pendingDeleteUserId = userId;

    // Clear and configure the delete modal
    deleteUserModal.clearData();
    
    // Add warning section
    deleteUserModal.addSection({
        title: 'Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        iconColor: 'text-danger'
    });

    // Add warning message
    deleteUserModal.addField({
        id: 'delete-warning',
        name: 'warning',
        label: 'Uyarı',
        type: 'text',
        value: 'Bu çalışanı silmek istediğinize emin misiniz?',
        icon: 'fas fa-exclamation-triangle',
        colSize: 12
    });

    // Add user name
    deleteUserModal.addField({
        id: 'delete-user-name',
        name: 'user_name',
        label: 'Çalışan Adı',
        type: 'text',
        value: username,
        icon: 'fas fa-user',
        colSize: 12
    });

    // Add warning about permanent deletion
    deleteUserModal.addField({
        id: 'delete-warning-permanent',
        name: 'permanent_warning',
        label: 'Dikkat',
        type: 'text',
        value: 'Bu işlem geri alınamaz ve çalışan kalıcı olarak silinecektir.',
        icon: 'fas fa-trash',
        colSize: 12
    });

    // Render the modal first
    deleteUserModal.render();
    
    // Add custom buttons after rendering
    const modalFooter = deleteUserModal.container.querySelector('.modal-footer');
    if (modalFooter) {
        modalFooter.innerHTML = `
            <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>İptal
                </button>
                <button type="button" class="btn btn-danger" id="confirm-delete-user-btn">
                    <i class="fas fa-trash me-1"></i>Evet, Sil
                </button>
            </div>
        `;
    }

    // Show the modal
    deleteUserModal.show();
}

function showCreateUserModal() {
    // Clear and configure the create modal
    createUserModal.clearAll();
    
    // Add Basic Information section
    createUserModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    // Add form fields
    createUserModal.addField({
        id: 'username',
        name: 'username',
        label: 'Kullanıcı Adı',
        type: 'text',
        placeholder: 'Kullanıcı adını girin',
        required: true,
        icon: 'fas fa-user',
        colSize: 6,
        helpText: 'Benzersiz kullanıcı adı'
    });

    createUserModal.addField({
        id: 'email',
        name: 'email',
        label: 'E-posta',
        type: 'email',
        placeholder: 'E-posta adresi',
        icon: 'fas fa-envelope',
        colSize: 6,
        helpText: 'İletişim için e-posta adresi'
    });

    createUserModal.addField({
        id: 'first_name',
        name: 'first_name',
        label: 'Ad',
        type: 'text',
        placeholder: 'Adını girin',
        required: true,
        icon: 'fas fa-id-card',
        colSize: 6,
        helpText: 'Çalışanın adı'
    });

    createUserModal.addField({
        id: 'last_name',
        name: 'last_name',
        label: 'Soyad',
        type: 'text',
        placeholder: 'Soyadını girin',
        required: true,
        icon: 'fas fa-id-card',
        colSize: 6,
        helpText: 'Çalışanın soyadı'
    });

    // Add Work Information section
    createUserModal.addSection({
        title: 'İş Bilgileri',
        icon: 'fas fa-briefcase',
        iconColor: 'text-success'
    });

    // Add is_active checkbox
    createUserModal.addField({
        id: 'is_active',
        name: 'is_active',
        label: 'Aktif',
        type: 'checkbox',
        value: true,
        icon: 'fas fa-check-circle',
        colSize: 12,
        helpText: 'Çalışanın aktif durumu'
    });

    // Render and show modal
    createUserModal.render();
    createUserModal.show();
}


async function createUser(formData) {
    // This function is called by the modal's onSaveCallback
    // formData is already provided by the modal component
    
    try {
        const response = await createUserAPI(formData);
        
        if (response.ok) {
            showNotification('Çalışan başarıyla oluşturuldu', 'success');
            
            // Hide modal
            createUserModal.hide();
            
            // Reload users
            currentPage = 1;
            await loadUsers();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Çalışan oluşturulamadı');
        }
    } catch (error) {
        console.error('Error creating user:', error);
        showNotification(error.message || 'Çalışan oluşturulurken hata oluştu', 'error');
    }
}
 
 async function updateUser(formData) {
     const userId = window.editingUserId;
     if (!userId) {
         showNotification('Düzenlenecek çalışan bulunamadı', 'error');
         return;
     }
     
     try {
         // shift rule assignment is handled by attendance service, not the users endpoint
         const { shift_rule_id, ...userPatch } = formData || {};
         const response = await updateUserAPI(userId, userPatch);
         
         if (response.ok) {
             // Assign shift rule if present in the form (empty -> default)
             if (shift_rule_id !== undefined) {
                 const idStr = (shift_rule_id ?? '').toString().trim();
                 const shiftRuleId = idStr ? Number(idStr) : null;
                 try {
                     await assignShiftRuleToUser(Number(userId), shiftRuleId);
                 } catch (e) {
                     // User update succeeded; assignment failed
                     showNotification(`Vardiya kuralı atanamadı: ${e.message || e}`, 'warning');
                 }
             }

             // Hide modal
             editUserModal.hide();
             
             // Clear the editing user ID
             window.editingUserId = null;
             
             // Reload users
             await loadUsers();
         } else {
             const errorData = await response.json();
             throw new Error(errorData.message || 'Çalışan güncellenemedi');
         }
     } catch (error) {
         console.error('Error updating user:', error);
         showNotification(error.message || 'Çalışan güncellenirken hata oluştu', 'error');
     }
 }

async function exportUsers(format) {
    try {
        // Show loading state using table component's method
        if (usersTable) {
            usersTable.setExportLoading(true);
        }
        
        // Get filter values
        const filterValues = userFilters ? userFilters.getFilterValues() : {};
        
        // Fetch all users for export (use a large page size)
        const groupVal = filterValues['group-filter'] || [];
        const group = Array.isArray(groupVal) ? groupVal.filter(Boolean).join(',') : (groupVal || '');
        const access = filterValues['access-filter'] || '';

        const usersResponse = await authFetchUsers(1, 10000, {
            username: filterValues['username-filter'] || '',
            group,
            office_access: access === 'office' ? 'true' : '',
            workshop_access: access === 'workshop' ? 'true' : '',
            occupation: filterValues['occupation-filter'] || '',
            is_active: filterValues['is-active-filter'] || '',
            ordering: currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`
        });
        
        const allUsers = usersResponse.results || usersResponse || [];
        
        if (allUsers.length === 0) {
            alert('Dışa aktarılacak çalışan bulunamadı');
            return;
        }
        
        // Store current table state
        const originalData = usersTable.options.data;
        const originalTotal = usersTable.options.totalItems;
        
        // Temporarily update table with all users for export
        usersTable.options.data = allUsers;
        usersTable.options.totalItems = allUsers.length;
        
        // Use table component's export functionality
        // The table component will use its prepareExportData and exportToExcel methods
        usersTable.exportData('excel');
        
        // Restore original table state
        usersTable.options.data = originalData;
        usersTable.options.totalItems = originalTotal;
        
    } catch (error) {
        // Error exporting users
        alert('Dışa aktarma sırasında hata oluştu');
        console.error('Export error:', error);
    } finally {
        // Reset loading state using table component's method
        if (usersTable) {
            usersTable.setExportLoading(false);
        }
    }
}

// Helper function for notifications

// Loading state is now handled by TableComponent 