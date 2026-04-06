import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../../components/table/table.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { fetchUserReport, fetchUserTaskDetail } from '../../../../apis/cnc-cutting/userReport.js';
import { buildUserReportSummaryFooterRow } from '../../../../components/table/userReportSummaryFooter.js';
import { showNotification } from '../../../../components/notification/notification.js';

let reportData = null;
let reportFilters = null;
let headerComponent;
let userReportStats = null;
let usersTable = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();

    initHeaderComponent();

    userReportStats = new StatisticsCards('user-report-statistics', {
        cards: [
            { title: 'Toplam Kullanıcı', value: '0', icon: 'fas fa-users', color: 'primary', id: 'total-users-count' },
            { title: 'Toplam Çalışma Saati', value: '0', icon: 'fas fa-clock', color: 'success', id: 'total-work-hours' },
            { title: 'Toplam Boşta Geçen Saat', value: '0', icon: 'fas fa-hourglass-half', color: 'warning', id: 'total-idle-hours' },
            { title: 'Ortalama Verimlilik', value: '0%', icon: 'fas fa-chart-line', color: 'info', id: 'avg-efficiency' }
        ],
        compact: true,
        animation: true
    });

    await initializeUserReport();
});

function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'CNC Kesim — Kullanıcı Raporu',
        subtitle: 'Seçilen tarih aralığında CNC kesim ekibi kullanıcı performansı, parça ve zaman kullanımı analizi',
        icon: 'calendar-alt',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => {
            window.location.href = '../';
        },
        onRefreshClick: () => {
            loadReport();
        }
    });
}

async function initializeUserReport() {
    try {
        initializeFiltersComponent();
        setDefaultDateFilter();
        await loadReport();
    } catch (error) {
        console.error('Error initializing user report:', error);
        showNotification('Rapor başlatılırken hata oluştu', 'error');
    }
}

function initializeFiltersComponent() {
    reportFilters = new FiltersComponent('filters-placeholder', {
        title: 'Rapor Filtreleri',
        onApply: () => {
            loadReport();
        },
        onClear: () => {
            setDefaultDateFilter();
            loadReport();
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    reportFilters.addDateRangeFilter({
        id: 'date-range',
        label: 'Tarih aralığı',
        colSize: 4,
        startDate: todayStr,
        endDate: todayStr
    });
}

function setDefaultDateFilter() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    if (reportFilters) {
        reportFilters.setFilterValues({
            'date-range': { start: todayStr, end: todayStr }
        });
    }
}

/** @returns {{ start_date?: string, end_date?: string }} */
function getReportDateParams() {
    const filterValues = reportFilters ? reportFilters.getFilterValues() : {};
    const dr = filterValues['date-range'] || { start: '', end: '' };
    let start = dr.start || '';
    let end = dr.end || '';
    if (!start && !end) {
        return {};
    }
    if (!start) start = end;
    if (!end) end = start;
    return { start_date: start, end_date: end };
}

async function loadReport() {
    try {
        showLoadingState();

        const params = getReportDateParams();
        reportData = await fetchUserReport(params);

        renderUsersTable();
        updateStatistics();
    } catch (error) {
        console.error('Error loading report:', error);
        showNotification('Rapor yüklenirken hata oluştu', 'error');
        renderErrorState();
    } finally {
        hideLoadingState();
    }
}

function renderUsersTable() {
    if (!reportData || !reportData.users || reportData.users.length === 0) {
        if (usersTable) {
            usersTable.updateData([]);
        } else {
            usersTable = new TableComponent('users-report-table-container', {
                title: 'CNC Kesim — Kullanıcı Raporu',
                icon: 'users',
                iconColor: 'text-primary',
                tableClass: 'table table-hover user-report-summary-table',
                columns: [],
                data: [],
                sortable: false,
                pagination: false
            });
        }
        return;
    }

    const tableData = reportData.users.map(user => {
        const totalTimeInOffice = user.total_time_in_office_hours ||
            (user.total_work_hours + user.total_idle_hours + (user.total_hold_hours || 0));

        const efficiency = totalTimeInOffice > 0
            ? ((user.total_work_hours / totalTimeInOffice) * 100).toFixed(1)
            : '0';

        const userDisplayName = (user.first_name && user.last_name)
            ? `${user.first_name} ${user.last_name}`
            : user.username;

        const hasWarnings = getWarnings(user, totalTimeInOffice);

        return {
            ...user,
            _displayName: userDisplayName,
            _totalTimeInOffice: totalTimeInOffice,
            _efficiency: parseFloat(efficiency),
            _hasWarnings: hasWarnings.length > 0,
            _warnings: hasWarnings
        };
    });

    if (usersTable) {
        if (usersTable.options.columns.length === 0) {
            const container = document.getElementById('users-report-table-container');
            if (container) {
                container.innerHTML = '';
            }
            usersTable = null;
        }
    }

    if (!usersTable) {
        const container = document.getElementById('users-report-table-container');
        if (!container) {
            console.error('Container element "users-report-table-container" not found!');
            return;
        }
        usersTable = new TableComponent('users-report-table-container', {
            title: 'CNC Kesim — Kullanıcı Raporu',
            icon: 'users',
            iconColor: 'text-primary',
            tableClass: 'table table-hover user-report-summary-table',
            columns: [
                {
                    field: '_displayName',
                    label: 'Kullanıcı',
                    sortable: true,
                    formatter: (value, row) => {
                        const usernameHtml = (row.first_name && row.last_name)
                            ? `<small class="text-muted ms-2">(@${row.username})</small>`
                            : '';
                        const warningBadge = row._hasWarnings
                            ? `<span class="badge bg-warning text-dark flex-shrink-0" title="${row._warnings.join('; ')}">
                                <i class="fas fa-exclamation-triangle me-1"></i>Uyarı
                               </span>`
                            : '';
                        return `
                            <div class="d-flex align-items-center user-report-name-row">
                                <i class="fas fa-user me-2 text-primary flex-shrink-0"></i>
                                <span class="user-report-name-text">${value}${usernameHtml}</span>
                                ${warningBadge}
                            </div>
                        `;
                    }
                },
                {
                    field: 'total_work_hours',
                    label: 'Çalışma Saati',
                    sortable: true,
                    formatter: (value) => {
                        return `<span class="text-success fw-bold">${(value || 0).toFixed(2)}</span>`;
                    }
                },
                {
                    field: 'total_idle_hours',
                    label: 'Boşta Geçen Saat',
                    sortable: true,
                    formatter: (value) => {
                        return `<span class="text-danger fw-bold">${(value || 0).toFixed(2)}</span>`;
                    }
                },
                {
                    field: 'total_hold_hours',
                    label: 'Bekleme Saati',
                    sortable: true,
                    formatter: (value) => {
                        return `<span class="text-secondary fw-bold">${(value || 0).toFixed(2)}</span>`;
                    }
                },
                {
                    field: '_efficiency',
                    label: 'Verimlilik',
                    sortable: true,
                    formatter: (value) => {
                        let colorClass; let styleAttr = '';
                        if (value >= 100) {
                            styleAttr = 'style="color: #6f42c1;"';
                        } else if (value >= 80) {
                            colorClass = 'text-success';
                        } else if (value >= 60) {
                            colorClass = 'text-warning';
                        } else {
                            colorClass = 'text-danger';
                        }
                        return `<span class="${colorClass || ''} fw-bold" ${styleAttr}>${value.toFixed(1)}%</span>`;
                    }
                },
                {
                    field: 'total_tasks_completed',
                    label: 'Tamamlanan Görev',
                    sortable: true,
                    formatter: (value) => {
                        if (value === undefined) return '-';
                        return `<span class="status-badge status-green" style="min-width: auto;">${value}</span>`;
                    }
                },
                {
                    field: 'total_tasks_worked_on',
                    label: 'Görev Sayısı',
                    sortable: true,
                    formatter: (value) => {
                        const n = value !== undefined && value !== null ? Number(value) : 0;
                        return `<span class="status-badge status-blue" style="min-width: auto;">${n}</span>`;
                    }
                },
                {
                    field: 'total_parts_completed',
                    label: 'Tamamlanan Parça',
                    sortable: true,
                    formatter: (value) => {
                        if (value === undefined) return '-';
                        return `<span class="status-badge status-yellow" style="min-width: auto;">${value}</span>`;
                    }
                },
                {
                    field: 'total_parts_worked_on',
                    label: 'Parça (işlem)',
                    sortable: true,
                    formatter: (value) => {
                        const n = value !== undefined && value !== null ? Number(value) : 0;
                        return `<span class="status-badge status-blue" style="min-width: auto;">${n}</span>`;
                    }
                }
            ],
            actions: [
                {
                    key: 'details',
                    label: 'Detaylar',
                    icon: 'fas fa-eye',
                    class: 'btn-outline-primary',
                    onClick: (row) => showUserDetails(row)
                }
            ],
            data: tableData,
            sortable: true,
            pagination: true,
            itemsPerPage: 20,
            responsive: true,
            emptyMessage: 'Bu aralık için rapor verisi bulunamadı',
            emptyIcon: 'fas fa-inbox',
            footer: (ctx) => buildUserReportSummaryFooterRow(ctx)
        });
    } else {
        usersTable.updateData(tableData);
    }
}

function normalizeTaskDetailDays(detail) {
    if (!detail) return [];
    if (Array.isArray(detail.days)) return detail.days;
    if (Array.isArray(detail.results)) return detail.results;
    return [];
}

function enrichTaskRow(row, taskTotals) {
    if (!taskTotals || !row || !row.task_key) return row;
    const t = taskTotals[row.task_key];
    if (!t) return row;
    return {
        ...row,
        estimated_hours: row.estimated_hours != null ? row.estimated_hours : t.estimated_hours,
        total_hours_spent: row.total_hours_spent != null ? row.total_hours_spent : t.total_hours_spent,
        parts_count: row.parts_count != null ? row.parts_count : t.parts_count
    };
}

function aggregateDetailDays(days) {
    const allTasks = [];
    const allIdle = [];
    const allHold = [];
    (days || []).forEach((day) => {
        const dateKey = day.date || day.day || '';
        const dateLabel = formatDayShort(dateKey);
        const dateTitle = formatDayHeading(dateKey);
        (day.tasks || []).forEach((t) => {
            allTasks.push({
                ...t,
                _activityDateLabel: dateLabel,
                _activityDateTitle: dateTitle
            });
        });
        (day.idle_periods || []).forEach((i) => {
            allIdle.push({
                ...i,
                _activityDateLabel: dateLabel,
                _activityDateTitle: dateTitle
            });
        });
        (day.hold_tasks || []).forEach((h) => {
            allHold.push({
                ...h,
                _activityDateLabel: dateLabel,
                _activityDateTitle: dateTitle
            });
        });
    });
    return { allTasks, allIdle, allHold };
}

function formatDayShort(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(String(dateStr).includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function buildUserDetailAccordionHtml(uid, nTasks, nIdle, nHold) {
    return `
<div class="accordion user-detail-accordion" id="accordion-${uid}">
    <div class="accordion-item">
        <h2 class="accordion-header" id="heading-tasks-${uid}">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-tasks-${uid}" aria-expanded="false" aria-controls="collapse-tasks-${uid}">
                <i class="fas fa-tasks me-2 text-primary"></i>Görevler <span class="badge bg-secondary ms-1">${nTasks}</span>
            </button>
        </h2>
        <div id="collapse-tasks-${uid}" class="accordion-collapse collapse" aria-labelledby="heading-tasks-${uid}">
            <div class="accordion-body p-2 pt-0">
                <div id="user-detail-tasks-${uid}"></div>
            </div>
        </div>
    </div>
    <div class="accordion-item">
        <h2 class="accordion-header" id="heading-idle-${uid}">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-idle-${uid}" aria-expanded="false" aria-controls="collapse-idle-${uid}">
                <i class="fas fa-hourglass-half me-2 text-warning"></i>Boşta geçen zaman <span class="badge bg-secondary ms-1">${nIdle}</span>
            </button>
        </h2>
        <div id="collapse-idle-${uid}" class="accordion-collapse collapse" aria-labelledby="heading-idle-${uid}">
            <div class="accordion-body p-2 pt-0">
                <div id="user-detail-idle-${uid}"></div>
            </div>
        </div>
    </div>
    <div class="accordion-item">
        <h2 class="accordion-header" id="heading-hold-${uid}">
            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-hold-${uid}" aria-expanded="false" aria-controls="collapse-hold-${uid}">
                <i class="fas fa-pause-circle me-2 text-warning"></i>Bekleme görevleri <span class="badge bg-secondary ms-1">${nHold}</span>
            </button>
        </h2>
        <div id="collapse-hold-${uid}" class="accordion-collapse collapse" aria-labelledby="heading-hold-${uid}">
            <div class="accordion-body p-2 pt-0">
                <div id="user-detail-hold-${uid}"></div>
            </div>
        </div>
    </div>
</div>`;
}

async function showUserDetails(user) {
    const userId = user.id ?? user.user_id;
    if (userId == null) {
        showNotification('Kullanıcı kimliği bulunamadı', 'error');
        return;
    }

    const totalTimeInOffice = user._totalTimeInOffice ||
        (user.total_work_hours + user.total_idle_hours + (user.total_hold_hours || 0));
    const hasWarnings = user._warnings || getWarnings(user, totalTimeInOffice);

    const userDisplayName = user._displayName ||
        ((user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : user.username);
    const modalTitle = `${userDisplayName}${(user.first_name && user.last_name) ? ` (@${user.username})` : ''}`;

    let detail;
    try {
        detail = await fetchUserTaskDetail(userId, getReportDateParams());
    } catch (e) {
        if (e.status === 404) {
            showNotification('Kullanıcı bulunamadı veya CNC kesim ekibinde değil', 'error');
        } else {
            showNotification('Detay verisi yüklenirken hata oluştu', 'error');
        }
        return;
    }

    const taskTotals = detail.task_totals || detail.taskTotals || {};
    const days = normalizeTaskDetailDays(detail);
    const { allTasks, allIdle, allHold } = aggregateDetailDays(days);
    const includeActivityDate = days.length > 1;
    const tasksEnriched = allTasks.map((r) => enrichTaskRow(r, taskTotals));
    const holdEnriched = allHold.map((r) => enrichTaskRow(r, taskTotals));

    const displayModal = new DisplayModal('user-details-modal-container', {
        title: modalTitle,
        icon: 'fas fa-user',
        size: 'xl',
        showEditButton: false
    });

    if (hasWarnings.length > 0) {
        displayModal.addCustomSection({
            title: 'Uyarılar',
            icon: 'fas fa-exclamation-triangle',
            iconColor: 'text-warning',
            customContent: `
                <div class="alert alert-warning mb-0">
                    <ul class="mb-0">
                        ${hasWarnings.map(warning => `<li>${warning}</li>`).join('')}
                    </ul>
                </div>
            `
        });
    }

    const uid = `ud-${Date.now()}`;

    if (days.length === 0) {
        displayModal.addCustomSection({
            title: null,
            customContent: `
                <div class="text-muted text-center py-3">
                    <i class="fas fa-inbox me-2"></i>Seçilen aralıkta gösterilecek kayıt yok
                </div>
            `
        });
    } else {
        displayModal.addCustomSection({
            title: null,
            customContent: buildUserDetailAccordionHtml(uid, tasksEnriched.length, allIdle.length, holdEnriched.length)
        });
    }

    displayModal.render().show();

    const handleCommentClick = (e) => {
        const btn = e.target.closest('.comment-view-btn');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            const commentEncoded = btn.getAttribute('data-comment');
            if (commentEncoded) {
                const comment = decodeURIComponent(commentEncoded);
                showComment(comment);
            }
        }
    };

    document.addEventListener('click', handleCommentClick);

    setTimeout(() => {
        const emptyMsg = (icon, text) => `
            <div class="text-muted text-center py-3 small">
                <i class="fas ${icon} me-2"></i>${text}
            </div>`;

        const tasksContainerId = `user-detail-tasks-${uid}`;
        const tasksEl = document.getElementById(tasksContainerId);
        if (tasksEl) {
            if (tasksEnriched.length > 0) {
                new TableComponent(tasksContainerId, {
                    title: ' ',
                    icon: 'fas fa-tasks',
                    iconColor: 'text-primary',
                    columns: buildTaskColumns(includeActivityDate),
                    data: tasksEnriched,
                    sortable: true,
                    pagination: false,
                    responsive: true,
                    small: true,
                    emptyMessage: 'Kayıt yok',
                    emptyIcon: 'fas fa-inbox'
                });
            } else {
                tasksEl.innerHTML = emptyMsg('fa-inbox', 'Görev kaydı yok');
            }
        }

        const idleContainerId = `user-detail-idle-${uid}`;
        const idleEl = document.getElementById(idleContainerId);
        if (idleEl) {
            if (allIdle.length > 0) {
                new TableComponent(idleContainerId, {
                    title: ' ',
                    icon: 'fas fa-hourglass-half',
                    iconColor: 'text-warning',
                    columns: buildIdleColumns(includeActivityDate),
                    data: allIdle,
                    sortable: true,
                    pagination: false,
                    responsive: true,
                    small: true,
                    emptyMessage: 'Kayıt yok',
                    emptyIcon: 'fas fa-check-circle'
                });
            } else {
                idleEl.innerHTML = emptyMsg('fa-check-circle', 'Boşta geçen dönem yok');
            }
        }

        const holdContainerId = `user-detail-hold-${uid}`;
        const holdEl = document.getElementById(holdContainerId);
        if (holdEl) {
            if (holdEnriched.length > 0) {
                new TableComponent(holdContainerId, {
                    title: ' ',
                    icon: 'fas fa-pause-circle',
                    iconColor: 'text-warning',
                    columns: buildHoldTaskColumns(includeActivityDate),
                    data: holdEnriched,
                    sortable: true,
                    pagination: false,
                    responsive: true,
                    small: true,
                    emptyMessage: 'Kayıt yok',
                    emptyIcon: 'fas fa-inbox'
                });
            } else {
                holdEl.innerHTML = emptyMsg('fa-inbox', 'Bekleme görevi yok');
            }
        }
    }, 100);
}

function formatDayHeading(dateStr) {
    if (!dateStr) return 'Gün';
    const d = new Date(String(dateStr).includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('tr-TR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatThicknessMm(value) {
    if (value === null || value === undefined || value === '') return '-';
    const n = Number(value);
    return Number.isNaN(n) ? String(value) : `${n} mm`;
}

function buildTaskColumns() {
    return [
        {
            field: 'task_key',
            label: 'Görev',
            sortable: true,
            formatter: (value) => {
                if (!value) return '-';
                const q = encodeURIComponent(value);
                return `<a href="/manufacturing/cnc-cutting/cuts/?cut=${q}" target="_blank" rel="noopener noreferrer" class="badge bg-primary text-decoration-none" style="cursor: pointer;">${value}</a>`;
            }
        },
        {
            field: 'start_time',
            label: 'Başlangıç',
            sortable: true,
            formatter: (value) => formatDateTime(value)
        },
        {
            field: 'finish_time',
            label: 'Bitiş',
            sortable: true,
            formatter: (value) => formatDateTime(value)
        },
        {
            field: 'task_name',
            label: 'Görev Adı',
            sortable: true
        },
        {
            field: 'nesting_id',
            label: 'Nesting',
            sortable: true,
            formatter: (value) => (value !== undefined && value !== null && value !== '' ? String(value) : '-')
        },
        {
            field: 'material',
            label: 'Malzeme',
            sortable: true,
            formatter: (value) => (value !== undefined && value !== null && value !== '' ? String(value) : '-')
        },
        {
            field: 'thickness_mm',
            label: 'Kalınlık',
            sortable: true,
            formatter: (value) => formatThicknessMm(value)
        },
        {
            field: 'parts_count',
            label: 'Parça adedi',
            sortable: true,
            formatter: (value) => (value !== undefined && value !== null ? value : '-')
        },
        {
            field: 'duration_minutes',
            label: 'Süre',
            sortable: true,
            formatter: (value) => formatDurationFromMinutes(value)
        },
        {
            field: 'estimated_hours',
            label: 'Tahmini',
            sortable: true,
            formatter: (value) => value !== null && value !== undefined ? `${value.toFixed(1)}s` : '-'
        },
        {
            field: 'total_hours_spent',
            label: 'Toplam Harcanan',
            sortable: true,
            formatter: (value) => value !== null && value !== undefined ? `${value.toFixed(2)}s` : '-'
        },
        {
            field: 'machine_name',
            label: 'Makine',
            sortable: true
        },
        {
            field: 'comment',
            label: 'Yorum',
            sortable: false,
            formatter: (value) => {
                if (!value) return '-';
                const commentEncoded = encodeURIComponent(value);
                return `<button class="btn btn-sm btn-outline-info comment-view-btn" data-comment="${commentEncoded}"><i class="fas fa-comment"></i></button>`;
            }
        }
    ];
}

function buildHoldTaskColumns() {
    return [
        {
            field: 'task_key',
            label: 'Görev',
            sortable: true,
            formatter: (value) => {
                if (!value) return '-';
                const q = encodeURIComponent(value);
                return `<a href="/manufacturing/cnc-cutting/cuts/?cut=${q}" target="_blank" rel="noopener noreferrer" class="badge bg-primary text-decoration-none" style="cursor: pointer;">${value}</a>`;
            }
        },
        {
            field: 'start_time',
            label: 'Başlangıç',
            sortable: true,
            formatter: (value) => formatDateTime(value)
        },
        {
            field: 'finish_time',
            label: 'Bitiş',
            sortable: true,
            formatter: (value) => formatDateTime(value)
        },
        {
            field: 'task_name',
            label: 'Görev Adı',
            sortable: true
        },
        {
            field: 'job_no',
            label: 'İş No',
            sortable: true
        },
        {
            field: 'nesting_id',
            label: 'Nesting',
            sortable: true,
            formatter: (value) => (value !== undefined && value !== null && value !== '' ? String(value) : '-')
        },
        {
            field: 'material',
            label: 'Malzeme',
            sortable: true,
            formatter: (value) => (value !== undefined && value !== null && value !== '' ? String(value) : '-')
        },
        {
            field: 'thickness_mm',
            label: 'Kalınlık',
            sortable: true,
            formatter: (value) => formatThicknessMm(value)
        },
        {
            field: 'parts_count',
            label: 'Parça adedi',
            sortable: true,
            formatter: (value) => (value !== undefined && value !== null ? value : '-')
        },
        {
            field: 'duration_minutes',
            label: 'Süre',
            sortable: true,
            formatter: (value) => formatDurationFromMinutes(value)
        },
        {
            field: 'estimated_hours',
            label: 'Tahmini',
            sortable: true,
            formatter: (value) => value !== null && value !== undefined ? `${value.toFixed(1)}s` : '-'
        },
        {
            field: 'machine_name',
            label: 'Makine',
            sortable: true
        },
        {
            field: 'manual_entry',
            label: 'Manuel',
            sortable: true,
            formatter: (value) => value ? '<span class="badge bg-success">Manuel</span>' : '<span class="text-muted">-</span>'
        },
        {
            field: 'comment',
            label: 'Yorum',
            sortable: false,
            formatter: (value) => {
                if (!value) return '-';
                const commentEncoded = encodeURIComponent(value);
                return `<button class="btn btn-sm btn-outline-info comment-view-btn" data-comment="${commentEncoded}"><i class="fas fa-comment"></i></button>`;
            }
        }
    ];
}

function buildIdleColumns() {
    return [
        {
            field: 'start_time',
            label: 'Başlangıç',
            sortable: true,
            formatter: (value) => formatDateTime(value)
        },
        {
            field: 'finish_time',
            label: 'Bitiş',
            sortable: true,
            formatter: (value) => formatDateTime(value)
        },
        {
            field: 'duration_minutes',
            label: 'Süre',
            sortable: true,
            formatter: (value) => formatDurationFromMinutes(value)
        }
    ];
}

function getEfficiencyColorClass(value) {
    if (value >= 100) {
        return 'class="stat-value" style="color: #6f42c1;"';
    } else if (value >= 80) {
        return 'class="stat-value text-success"';
    } else if (value >= 60) {
        return 'class="stat-value text-warning"';
    } else {
        return 'class="stat-value text-danger"';
    }
}

function getWarnings(user, totalTimeInOffice) {
    const warnings = [];
    const efficiency = totalTimeInOffice > 0
        ? (user.total_work_hours / totalTimeInOffice) * 100
        : 0;

    if (user.total_work_hours === 0) {
        warnings.push('Kullanıcı hiç görev çalıştırmamış');
    }

    if (efficiency < 50) {
        warnings.push(`Verimlilik çok düşük: %${efficiency.toFixed(1)}`);
    } else if (efficiency < 70) {
        warnings.push(`Verimlilik düşük: %${efficiency.toFixed(1)}`);
    }

    const totalIdleTime = (user.total_idle_hours || 0) + (user.total_hold_hours || 0);
    if (totalIdleTime > user.total_work_hours * 1.5) {
        warnings.push('Boşta geçen ve bekleme süresi çalışma süresinden çok fazla');
    }

    return warnings;
}

function formatDateTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDurationFromMinutes(minutes) {
    if (minutes === null || minutes === undefined) return '-';
    const totalMinutes = Math.round(minutes);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0 && m > 0) {
        return `${h}s ${m}dk`;
    } else if (h > 0) {
        return `${h}s`;
    } else {
        return `${m}dk`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.showComment = function(comment) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'comment-modal-' + Date.now();
    const commentText = escapeHtml(comment).replace(/\n/g, '<br>');
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Yorum</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    ${commentText}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Kapat</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
    bsModal.show();
    modal.addEventListener('hidden.bs.modal', () => {
        if (modal.parentNode) {
            document.body.removeChild(modal);
        }
    }, { once: true });
};

function updateStatistics() {
    if (!reportData || !reportData.users || reportData.users.length === 0) {
        if (userReportStats) {
            userReportStats.updateValues({
                0: '0',
                1: '0',
                2: '0',
                3: '0%'
            });
        }
        return;
    }

    const totalUsers = reportData.users.length;
    const totalWorkHours = reportData.users.reduce((sum, user) => sum + (user.total_work_hours || 0), 0);
    const totalIdleHours = reportData.users.reduce((sum, user) => sum + (user.total_idle_hours || 0), 0);

    const totalOfficeHours = reportData.users.reduce((sum, user) => {
        const officeHours = user.total_time_in_office_hours ||
            (user.total_work_hours + user.total_idle_hours + (user.total_hold_hours || 0));
        return sum + (officeHours || 0);
    }, 0);

    const avgEfficiency = totalOfficeHours > 0
        ? ((totalWorkHours / totalOfficeHours) * 100).toFixed(1)
        : '0';

    if (userReportStats) {
        userReportStats.updateValues({
            0: totalUsers.toString(),
            1: totalWorkHours.toFixed(2),
            2: totalIdleHours.toFixed(2),
            3: `${avgEfficiency}%`
        });
    }
}

function showLoadingState() {
    if (usersTable) {
        usersTable.setLoading(true);
    } else {
        const container = document.getElementById('users-report-table-container');
        container.innerHTML = `
            <div class="dashboard-card">
                <div class="card-body text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Yükleniyor...</span>
                    </div>
                    <div class="mt-3">Rapor yükleniyor...</div>
                </div>
            </div>
        `;
    }
}

function hideLoadingState() {
    if (usersTable) {
        usersTable.setLoading(false);
    }
}

function renderErrorState() {
    if (usersTable) {
        usersTable.updateData([]);
    } else {
        const container = document.getElementById('users-report-table-container');
        container.innerHTML = `
            <div class="dashboard-card">
                <div class="card-body text-center text-danger py-5">
                    <i class="fas fa-exclamation-triangle fa-3x mb-3"></i><br>
                    Rapor yüklenirken bir hata oluştu
                </div>
            </div>
        `;
    }
}
