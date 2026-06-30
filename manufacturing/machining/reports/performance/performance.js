import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../../components/table/table.js';
import { fetchPerformanceReport } from '../../../../apis/machining/reports.js';
import { showNotification } from '../../../../components/notification/notification.js';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function renderTaskKeyBadge(value) {
    if (!value) return '-';
    return `
        <a href="/manufacturing/machining/tasks/list/?task=${value}" target="_blank" rel="noopener noreferrer"
           style="text-decoration:none; cursor:pointer;">
            <span style="font-weight:700; color:#0d6efd; font-family:'Courier New',monospace; font-size:1rem;
                         background:rgba(13,110,253,0.1); padding:0.25rem 0.5rem; border-radius:4px;
                         border:1px solid rgba(13,110,253,0.2); display:inline-block;">
                ${value}
            </span>
        </a>`;
}

function renderEfficiencyBadge(value) {
    if (value === null || value === undefined) return '-';
    const pct = Math.round(value);
    const cls = pct >= 100 ? 'text-success' : pct >= 80 ? 'text-warning' : 'text-danger';
    return `<span class="${cls} fw-bold">${pct}%</span>`;
}

function renderOnTimeBadge(value) {
    if (value === null || value === undefined) return '<span class="text-muted">—</span>';
    return value
        ? '<span class="badge bg-success">Evet</span>'
        : '<span class="badge bg-danger">Hayır</span>';
}

function renderBoolBadge(value) {
    if (value === null || value === undefined) return '-';
    return value
        ? '<span class="badge bg-success">Evet</span>'
        : '<span class="badge bg-secondary">Hayır</span>';
}

function truncate(str, max = 30) {
    if (!str) return '-';
    return str.length > max ? `<span title="${str}">${str.substring(0, max)}…</span>` : str;
}

function hoursCell(value) {
    if (value === null || value === undefined) return '-';
    return `<span class="text-success fw-bold">${value.toFixed(2)}</span>`;
}

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------

function buildColumns() {
    return [
        {
            field: 'task_key',
            label: 'TI No',
            sortable: true,
            formatter: renderTaskKeyBadge
        },
        {
            field: 'task_name',
            label: 'Görev Adı',
            sortable: true,
            headerClass: 'text-nowrap',
            formatter: (v) => truncate(v, 30)
        },
        {
            field: 'job_no',
            label: 'İş No',
            sortable: true,
            headerClass: 'text-nowrap',
            formatter: (v) => v || '-'
        },
        {
            field: 'machine_name',
            label: 'Makine',
            sortable: true,
            headerClass: 'text-nowrap',
            formatter: (v) => truncate(v, 25)
        },
        {
            field: 'hours_in_period',
            label: 'Dönemdeki Süre (s)',
            sortable: true,
            headerClass: 'text-nowrap',
            formatter: hoursCell
        },
        {
            field: 'estimated_hours',
            label: 'Tahmini Saat',
            sortable: true,
            headerClass: 'text-nowrap',
            formatter: (v) => (v !== null && v !== undefined ? v.toFixed(2) : '-')
        },
        {
            field: 'total_hours_spent',
            label: 'Toplam Harcanan (s)',
            sortable: true,
            headerClass: 'text-nowrap',
            formatter: (v) => (v !== null && v !== undefined ? v.toFixed(2) : '-')
        },
        {
            field: 'efficiency',
            label: 'Verimlilik',
            sortable: true,
            formatter: renderEfficiencyBadge
        },
        {
            field: 'completed_in_period',
            label: 'Dönemde Tamamlandı',
            type: 'boolean',
            sortable: true,
            headerClass: 'text-nowrap',
            formatter: renderBoolBadge
        },
        {
            field: 'on_time',
            label: 'Zamanında',
            sortable: true,
            formatter: renderOnTimeBadge
        },
        {
            field: 'deadline',
            label: 'Termin',
            sortable: true,
            headerClass: 'text-nowrap',
            formatter: (v) => v || '-'
        },
    ];
}

// ---------------------------------------------------------------------------
// Group header for each user
// ---------------------------------------------------------------------------

function buildGroupHeader(groupRows) {
    const row = groupRows[0];
    const name = row._displayName;
    const username = row._username;
    const usernameHtml = row._firstName && row._lastName
        ? `<small class="text-muted ms-2">(@${username})</small>`
        : '';

    const taskCount = groupRows.length;
    const totalHours = (row._totalHours || 0).toFixed(2);
    const avgDaily = (row._avgDailyHours || 0).toFixed(2);
    const tasksCompleted = row._tasksCompleted ?? 0;
    const avgEff = row._avgEfficiency;
    const onTimeRate = row._onTimeRate;

    const effHtml = avgEff !== null && avgEff !== undefined
        ? (() => {
            const pct = Math.round(avgEff);
            const cls = pct >= 100 ? 'text-success' : pct >= 80 ? 'text-warning' : 'text-danger';
            return `<span class="${cls} fw-bold">${pct}%</span>`;
        })()
        : '<span class="text-muted">—</span>';

    const otHtml = onTimeRate !== null && onTimeRate !== undefined
        ? `<span class="fw-bold">${onTimeRate.toFixed(1)}%</span>`
        : '<span class="text-muted">—</span>';

    return `
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div class="d-flex align-items-center gap-2">
                <i class="fas fa-user text-primary"></i>
                <strong>${name}${usernameHtml}</strong>
                <span class="status-badge status-green" style="min-width:auto; padding:0.25rem 0.5rem;">
                    ${taskCount} görev
                </span>
            </div>
            <div class="d-flex gap-3 text-muted small flex-wrap">
                <span><i class="fas fa-clock me-1"></i>Toplam: <strong class="text-body">${totalHours} s</strong></span>
                <span><i class="fas fa-calendar-day me-1"></i>Günlük ort.: <strong class="text-body">${avgDaily} s</strong></span>
                <span><i class="fas fa-check-circle me-1"></i>Tamamlanan: <strong class="text-body">${tasksCompleted}</strong></span>
                <span><i class="fas fa-chart-line me-1"></i>Ort. verimlilik: ${effHtml}</span>
                <span><i class="fas fa-clock me-1"></i>Zamanında: ${otHtml}</span>
            </div>
        </div>`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let reportData = null;
let reportFilters = null;
let perfStats = null;
let perfTable = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();

    new HeaderComponent({
        title: 'Performans Raporu',
        subtitle: 'Seçilen dönemde kullanıcı bazlı verimlilik ve performans analizi',
        icon: 'chart-bar',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => { window.location.href = '../'; },
        onRefreshClick: () => { loadReport(); },
    });

    perfStats = new StatisticsCards('performance-statistics', {
        cards: [
            { title: 'Toplam Kullanıcı',      value: '0', icon: 'fas fa-users',       color: 'primary', id: 'stat-users' },
            { title: 'Toplam Çalışma Saati',  value: '0', icon: 'fas fa-clock',        color: 'success', id: 'stat-hours' },
            { title: 'Tamamlanan Görev',       value: '0', icon: 'fas fa-check-circle', color: 'info',    id: 'stat-completed' },
            { title: 'Çalışılan Görev',        value: '0', icon: 'fas fa-tasks',        color: 'secondary', id: 'stat-worked' },
            { title: 'Ortalama Verimlilik',    value: '-', icon: 'fas fa-chart-line',   color: 'warning', id: 'stat-efficiency' },
            { title: 'Zamanında Tamamlama',    value: '-', icon: 'fas fa-bullseye',     color: 'danger',  id: 'stat-ontime' },
        ],
        compact: true,
        animation: true,
    });

    initFilters();
    await loadReport();
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function getDefaultRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29);
    const fmt = (d) => d.toISOString().split('T')[0];
    return { start: fmt(start), end: fmt(end) };
}

function initFilters() {
    const { start, end } = getDefaultRange();

    reportFilters = new FiltersComponent('filters-placeholder', {
        title: 'Rapor Filtreleri',
        onApply: () => loadReport(),
        onClear: () => {
            const def = getDefaultRange();
            reportFilters.setFilterValues({ 'start-date': def.start, 'end-date': def.end });
            loadReport();
            showNotification('Filtreler temizlendi', 'info');
        },
    });

    reportFilters.addDateFilter({ id: 'start-date', label: 'Başlangıç Tarihi', colSize: 3, value: start });
    reportFilters.addDateFilter({ id: 'end-date',   label: 'Bitiş Tarihi',     colSize: 3, value: end });
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

async function loadReport() {
    try {
        showLoading();
        const vals = reportFilters ? reportFilters.getFilterValues() : {};
        const def = getDefaultRange();
        const startDate = vals['start-date'] || def.start;
        const endDate   = vals['end-date']   || def.end;

        reportData = await fetchPerformanceReport(startDate, endDate);
        renderTable();
        updateStats();
    } catch (err) {
        console.error('Performance report load error:', err);
        showNotification('Rapor yüklenirken hata oluştu', 'error');
        renderError();
    } finally {
        hideLoading();
    }
}

// ---------------------------------------------------------------------------
// Render table
// ---------------------------------------------------------------------------

function flattenData() {
    if (!reportData || !reportData.users) return [];
    const rows = [];
    for (const user of reportData.users) {
        const displayName = (user.first_name && user.last_name)
            ? `${user.first_name} ${user.last_name}`
            : user.username;
        for (const task of (user.tasks || [])) {
            rows.push({
                ...task,
                _userId:        user.user_id,
                _username:      user.username,
                _firstName:     user.first_name,
                _lastName:      user.last_name,
                _displayName:   displayName,
                _totalHours:    user.total_hours,
                _avgDailyHours: user.avg_daily_hours,
                _tasksWorked:   user.tasks_worked,
                _tasksCompleted: user.tasks_completed,
                _avgEfficiency: user.avg_efficiency,
                _onTimeRate:    user.on_time_rate,
            });
        }
    }
    return rows;
}

function renderTable() {
    const data = flattenData();
    const columns = buildColumns();

    const options = {
        title: 'Kullanıcı Performans Raporu',
        icon: 'chart-bar',
        iconColor: 'text-primary',
        groupBy: '_userId',
        groupCollapsible: true,
        defaultGroupExpanded: false,
        columns,
        data,
        sortable: true,
        pagination: false,
        responsive: true,
        exportable: true,
        exportFormats: ['excel'],
        emptyMessage: 'Bu dönem için rapor verisi bulunamadı',
        emptyIcon: 'fas fa-inbox',
        groupHeaderFormatter: (_groupValue, groupRows) => buildGroupHeader(groupRows),
    };

    if (!perfTable) {
        perfTable = new TableComponent('performance-table-container', options);
    } else {
        perfTable.updateData(data);
    }

    setupExport();
}

// ---------------------------------------------------------------------------
// Export override — prepend user column
// ---------------------------------------------------------------------------

function setupExport() {
    if (!perfTable) return;
    perfTable.prepareExportData = function () {
        const visibleCols = this.options.columns.filter(c => c.field !== 'actions' && !c.hidden);
        const headers = ['Kullanıcı', ...visibleCols.map(c => c.label || c.field)];

        const rows = this.options.data.map(row => {
            const userLabel = (row._firstName && row._lastName)
                ? `${row._displayName} (@${row._username})`
                : row._username || '';
            const cells = visibleCols.map(col => {
                const v = row[col.field];
                if (col.field === 'task_key') return v || '-';
                if (col.field === 'efficiency') return v !== null && v !== undefined ? `${Math.round(v)}%` : '-';
                if (col.field === 'completed_in_period' || col.field === 'on_time') {
                    if (v === true) return 'Evet';
                    if (v === false) return 'Hayır';
                    return '-';
                }
                if (col.formatter && typeof col.formatter === 'function') {
                    return this.stripHtmlTags(col.formatter(v, row));
                }
                return v ?? '';
            });
            return [userLabel, ...cells];
        });

        return [headers, ...rows];
    };
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function updateStats() {
    if (!perfStats || !reportData) return;
    const s = reportData.summary || {};
    perfStats.updateValues({
        0: String(s.total_users ?? 0),
        1: (s.total_hours ?? 0).toFixed(2),
        2: String(s.tasks_completed ?? 0),
        3: String(s.total_tasks_worked ?? 0),
        4: s.avg_efficiency !== null && s.avg_efficiency !== undefined
            ? `${Math.round(s.avg_efficiency)}%`
            : '-',
        5: s.on_time_rate !== null && s.on_time_rate !== undefined
            ? `${s.on_time_rate.toFixed(1)}%`
            : '-',
    });
}

// ---------------------------------------------------------------------------
// Loading / error states
// ---------------------------------------------------------------------------

function showLoading() {
    if (perfTable) {
        perfTable.setLoading(true);
    } else {
        document.getElementById('performance-table-container').innerHTML = `
            <div class="dashboard-card">
                <div class="card-body text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Yükleniyor…</span>
                    </div>
                    <div class="mt-3">Rapor yükleniyor…</div>
                </div>
            </div>`;
    }
}

function hideLoading() {
    if (perfTable) perfTable.setLoading(false);
}

function renderError() {
    if (perfTable) {
        perfTable.updateData([]);
    } else {
        document.getElementById('performance-table-container').innerHTML = `
            <div class="dashboard-card">
                <div class="card-body text-center text-danger py-5">
                    <i class="fas fa-exclamation-triangle fa-3x mb-3"></i><br>
                    Rapor yüklenirken bir hata oluştu
                </div>
            </div>`;
    }
}
