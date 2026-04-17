// Dashboard Module JavaScript (mirrors CNC dashboard, uses linear_cutting timers)
import { initNavbar } from '../../../components/navbar.js';
import { fetchMachines } from '../../../apis/machines.js';
import { getSyncedNow } from '../../../apis/timeService.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../components/table/table.js';
import { formatDurationFromMs } from '../../../apis/formatters.js';
import { showNotification } from '../../../components/notification/notification.js';
import { listLinearCuttingTasks } from '../../../apis/linear_cutting/tasks.js';
import { listLinearCuttingTimers, stopLinearCuttingTimer } from '../../../apis/linear_cutting/timers.js';

let dashboardStats = null;
let activeTimersTable = null;
let machinesTable = null;

let dashboardState = {
    activeTimers: [],
    machines: [],
    refreshInterval: null,
    timerUpdateInterval: null
};

function normalizePaginated(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
}

function initHeaderComponent() {
    new HeaderComponent({
        title: 'Lineer Kesim Dashboard',
        subtitle: 'Gerçek zamanlı zamanlayıcı ve makine takibi',
        icon: 'chart-line',
        showBackButton: 'block',
        onBackClick: () => (window.location.href = '/manufacturing/linear-cutting/')
    });
}

function initStatisticsCards() {
    dashboardStats = new StatisticsCards('dashboard-statistics', {
        cards: [
            { title: 'Aktif Zamanlayıcı', value: '0', icon: 'fas fa-clock', color: 'primary', id: 'active-timers-count' },
            { title: 'Makine', value: '0', icon: 'fas fa-cog', color: 'success', id: 'active-machines-count' },
            { title: 'Aktif Kullanıcı', value: '0', icon: 'fas fa-users', color: 'info', id: 'active-users-count' },
            { title: 'Toplam Görev', value: '0', icon: 'fas fa-tasks', color: 'warning', id: 'total-tasks-count' }
        ],
        compact: true,
        animation: true
    });
}

function initTables() {
    activeTimersTable = new TableComponent('active-timers-table', {
        title: 'Aktif Zamanlayıcılar',
        icon: 'fas fa-clock',
        columns: [
            {
                key: 'username',
                label: 'Kullanıcı',
                sortable: false,
                formatter: (value) => `
                    <div class="d-flex align-items-center">
                        <div class="user-avatar-sm me-2" style="
                            width: 32px; height: 32px;
                            background: linear-gradient(135deg, #8b0000, #a52a2a);
                            border-radius: 8px;
                            display: flex; align-items: center; justify-content: center;
                            color: white; font-size: 0.875rem; flex-shrink: 0;
                        "><i class="fas fa-user"></i></div>
                        <span style="font-weight:600;color:#0d6efd;">${value || 'Bilinmeyen'}</span>
                    </div>
                `
            },
            {
                key: 'machine_name',
                label: 'Makine',
                sortable: false,
                formatter: (value) => `<span class="machine-name">${value || '-'}</span>`
            },
            {
                key: 'issue_name',
                label: 'Görev',
                sortable: false,
                formatter: (value, row) => {
                    const key = row.issue_key || '';
                    const title = value || row.issue_name || key || '-';
                    return `
                        <div class="clickable-task" style="
                            cursor:pointer; transition:all .2s ease;
                            padding:.5rem; border-radius:6px; border:1px solid transparent;
                        " data-task-key="${key}"
                          onmouseover="this.style.background='rgba(13,110,253,0.05)'; this.style.borderColor='rgba(13,110,253,0.2)'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 2px 8px rgba(13,110,253,0.1)'"
                          onmouseout="this.style.background='transparent'; this.style.borderColor='transparent'; this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            <div class="fw-bold text-primary" style="font-weight:700;font-size:.9rem;">
                                <i class="fas fa-external-link-alt me-1"></i>${key || '-'}
                            </div>
                            <small class="text-muted" style="font-size:.8rem;display:block;margin-top:.25rem;">
                                ${title}
                            </small>
                        </div>
                    `;
                }
            },
            {
                key: 'duration',
                label: 'Süre',
                sortable: false,
                formatter: (value, row) => `
                    <span class="timer-display text-success" style="
                        color:#28a745;font-weight:500;font-size:1rem;
                        background: rgba(40,167,69,.1);
                        padding:.25rem .5rem;border-radius:6px;
                        border: 1px solid rgba(40,167,69,.2);
                        display:inline-block;min-width:80px;text-align:center;
                    " data-start-time="${row.start_time}">${value}</span>
                `
            },
            {
                key: 'actions',
                label: 'İşlemler',
                sortable: false,
                formatter: (_, row) => `
                    <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-outline-danger stop-only" style="
                            border-radius:6px;padding:.375rem .75rem;
                            font-weight:600; transition: all .2s ease;
                            border:1px solid #dc3545; color:#dc3545; background:transparent;
                        " data-timer-id="${row.id}" title="Durdur"
                          onmouseover="this.style.background='#dc3545'; this.style.color='white'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(220,53,69,.3)'"
                          onmouseout="this.style.background='transparent'; this.style.color='#dc3545'; this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            <i class="fas fa-stop"></i>
                        </button>
                    </div>
                `
            }
        ],
        data: [],
        pagination: false,
        emptyMessage: 'Aktif Zamanlayıcı Yok',
        emptyIcon: 'fas fa-clock',
        tableClass: 'table table-hover',
        refreshable: true,
        onRefresh: async () => {
            activeTimersTable.setLoading(true);
            await refreshActiveTimers();
            activeTimersTable.setLoading(false);
        },
        skeleton: true,
        skeletonRows: 5
    });

    machinesTable = new TableComponent('machines-status', {
        title: 'Makine Durumları',
        icon: 'fas fa-industry',
        columns: [
            { key: 'name', label: 'Makine', sortable: false, formatter: (v) => `<span class="machine-name">${v || '-'}</span>` },
            { key: 'machine_type', label: 'Tip', sortable: false, formatter: (v) => `<span class="machine-type">${v || '-'}</span>` },
            {
                key: 'status',
                label: 'Durum',
                sortable: false,
                formatter: (_, row) => {
                    if (row.is_under_maintenance) return '<span class="status-badge status-grey">Bakımda</span>';
                    if (row.is_active) return row.has_active_timer
                        ? '<span class="status-badge status-green">Aktif</span>'
                        : '<span class="status-badge status-red">Boşta</span>';
                    return '<span class="status-badge status-red">Çevrimdışı</span>';
                }
            }
        ],
        data: [],
        pagination: false,
        emptyMessage: 'Makine bulunamadı',
        emptyIcon: 'fas fa-industry',
        tableClass: 'table table-hover',
        skeleton: true,
        skeletonRows: 6
    });
}

function updateStatistics() {
    const activeTimers = dashboardState.activeTimers || [];
    const machines = dashboardState.machines || [];
    const activeUsers = new Set(activeTimers.map(t => t.username).filter(Boolean));
    const activeMachines = machines.filter(m => m.is_active).length;
    const machinesWithTimers = new Set(activeTimers.map(t => t.machine_fk).filter(Boolean));

    dashboardStats.updateCard('active-timers-count', String(activeTimers.length));
    dashboardStats.updateCard('active-machines-count', String(activeMachines));
    dashboardStats.updateCard('active-users-count', String(activeUsers.size));
    dashboardStats.updateCard('total-tasks-count', String(dashboardState.totalTasks || 0));

    // decorate machines list with has_active_timer
    const decoratedMachines = machines.map(m => ({
        ...m,
        has_active_timer: machinesWithTimers.has(m.id)
    }));
    machinesTable.updateData(decoratedMachines);
}

async function refreshActiveTimers() {
    try {
        const timersRaw = await listLinearCuttingTimers();
        const timers = normalizePaginated(timersRaw);
        const active = timers.filter(t => !t.finish_time);
        dashboardState.activeTimers = active.map(t => ({
            ...t,
            duration: formatDurationFromMs(Math.max(0, getSyncedNow() - (t.start_time || getSyncedNow())))
        }));
        activeTimersTable.updateData(dashboardState.activeTimers);
    } catch (e) {
        console.error(e);
        showNotification('Zamanlayıcılar yüklenemedi', 'error');
        dashboardState.activeTimers = [];
        activeTimersTable.updateData([]);
    }
}

async function refreshMachines() {
    try {
        const machinesResp = await fetchMachines(1, 200, { used_in: 'linear_cutting', compact: true });
        dashboardState.machines = machinesResp.results || machinesResp || [];
    } catch (e) {
        console.error(e);
        dashboardState.machines = [];
    }
}

async function refreshTotalTasks() {
    try {
        const tasksRaw = await listLinearCuttingTasks({ page_size: 1 });
        if (tasksRaw && typeof tasksRaw.count === 'number') {
            dashboardState.totalTasks = tasksRaw.count;
        } else {
            const tasks = normalizePaginated(tasksRaw);
            dashboardState.totalTasks = tasks.length;
        }
    } catch {
        dashboardState.totalTasks = 0;
    }
}

function setupEventListeners() {
    document.body.addEventListener('click', async (e) => {
        const stopBtn = e.target.closest('.stop-only');
        if (stopBtn) {
            const timerId = stopBtn.getAttribute('data-timer-id');
            if (!timerId) return;
            stopBtn.disabled = true;
            try {
                await stopLinearCuttingTimer({
                    timer_id: Number(timerId),
                    finish_time: getSyncedNow(),
                    comment: ''
                });
                showNotification('Zamanlayıcı durduruldu', 'success');
                await refreshActiveTimers();
                updateStatistics();
            } catch (err) {
                console.error(err);
                showNotification('Zamanlayıcı durdurulamadı', 'error');
            } finally {
                stopBtn.disabled = false;
            }
            return;
        }

        const taskEl = e.target.closest('.clickable-task');
        if (taskEl) {
            const key = taskEl.getAttribute('data-task-key');
            if (key) window.open(`/manufacturing/linear-cutting/tasks/`, '_blank', 'noopener');
        }
    });
}

function startAutoRefresh() {
    dashboardState.refreshInterval = setInterval(async () => {
        await Promise.all([refreshActiveTimers(), refreshMachines(), refreshTotalTasks()]);
        updateStatistics();
    }, 30_000);
}

function startTimerUpdates() {
    dashboardState.timerUpdateInterval = setInterval(() => {
        const now = getSyncedNow();
        document.querySelectorAll('.timer-display[data-start-time]').forEach(el => {
            const start = Number(el.getAttribute('data-start-time') || 0);
            if (!start) return;
            el.textContent = formatDurationFromMs(Math.max(0, now - start));
        });
    }, 1_000);
}

async function initDashboard() {
    await initNavbar();
    initHeaderComponent();
    initStatisticsCards();
    initTables();
    setupEventListeners();

    try {
        activeTimersTable.setLoading(true);
        machinesTable.setLoading(true);
        await Promise.all([refreshActiveTimers(), refreshMachines(), refreshTotalTasks()]);
        updateStatistics();
    } finally {
        activeTimersTable.setLoading(false);
        machinesTable.setLoading(false);
    }

    startAutoRefresh();
    startTimerUpdates();
}

document.addEventListener('DOMContentLoaded', initDashboard);

