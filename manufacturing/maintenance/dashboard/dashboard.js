import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../components/table/table.js';
import { fetchFaultTimers } from '../../../apis/maintenance.js';
import { formatDurationFromMs, formatDateTime } from '../../../apis/formatters.js';

let headerComponent;
let statisticsCards;
let faultTimersTable;

let state = {
    timers: [],
    refreshInterval: null,
    timerUpdateInterval: null
};

function normalizeTimersResponse(responseData) {
    if (!responseData) return [];
    if (Array.isArray(responseData)) return responseData;
    if (Array.isArray(responseData.results)) return responseData.results;
    return [];
}

function getStartMs(timer) {
    const raw =
        timer.start_time ??
        timer.started_at ??
        timer.start ??
        timer.created_at ??
        timer.reported_at;

    if (!raw) return null;
    if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;

    // Some endpoints return milliseconds as a string.
    const asNum = Number(raw);
    if (!Number.isNaN(asNum) && String(raw).trim() !== '') {
        // Heuristic: seconds -> ms (if looks like Unix seconds)
        if (asNum < 10_000_000_000) return asNum * 1000;
        return asNum;
    }

    const asDate = new Date(raw);
    if (!Number.isNaN(asDate.getTime())) return asDate.getTime();
    return null;
}

function getUsername(timer) {
    return (
        timer.username ||
        timer.user ||
        timer.user_name ||
        timer.reported_by_username ||
        timer.created_by_username ||
        'Bilinmiyor'
    );
}

function getMachineName(timer) {
    return (
        timer.machine_name ||
        timer.machine ||
        timer.asset_name ||
        timer.equipment_name ||
        'Bilinmiyor'
    );
}

function getFaultLabel(timer) {
    const id = timer.fault_id ?? timer.fault ?? timer.machine_fault_id ?? timer.request_id ?? timer.id;
    const desc =
        timer.fault_description ||
        timer.description ||
        timer.reason ||
        timer.reason_name ||
        timer.fault_reason_name;

    if (desc && String(desc).trim() !== '') return String(desc);
    if (id !== null && id !== undefined && String(id).trim() !== '') return `#${id}`;
    return '-';
}

async function initDashboard() {
    if (!guardRoute()) return;

    await initNavbar();
    initHeader();
    initStatistics();
    initTable();

    await loadData();
    startAutoRefresh();
    startTimerUpdates();
}

function initHeader() {
    headerComponent = new HeaderComponent({
        title: 'Bakım Dashboard',
        subtitle: 'Aktif arıza zamanlayıcıları takibi',
        icon: 'wrench',
        showBackButton: 'block',
        onBackClick: () => {
            window.location.href = '/manufacturing/maintenance/';
        }
    });
}

function initStatistics() {
    statisticsCards = new StatisticsCards('dashboard-statistics', {
        cards: [
            { title: 'Aktif Arıza Timer', value: '0', icon: 'fas fa-stopwatch', color: 'danger', id: 'active-fault-timers' },
            { title: 'Ekipman', value: '0', icon: 'fas fa-cogs', color: 'primary', id: 'active-fault-machines' },
            { title: 'Aktif Kullanıcı', value: '0', icon: 'fas fa-users', color: 'info', id: 'active-fault-users' }
        ],
        compact: true,
        animation: true
    });
}

function initTable() {
    faultTimersTable = new TableComponent('fault-timers-table', {
        title: 'Aktif Arıza Zamanlayıcıları',
        icon: 'fas fa-stopwatch',
        columns: [
            {
                field: 'user',
                label: 'Kullanıcı',
                sortable: false,
                formatter: (value) => `<span style="font-weight: 600; color: #0d6efd;">${value || 'Bilinmiyor'}</span>`
            },
            {
                field: 'machine',
                label: 'Ekipman',
                sortable: false,
                formatter: (value) => `<span style="font-weight: 500;">${value || 'Bilinmiyor'}</span>`
            },
            {
                field: 'fault',
                label: 'Arıza',
                sortable: false,
                formatter: (value) => `<span title="${String(value || '').replace(/"/g, '&quot;')}">${value || '-'}</span>`
            },
            {
                field: 'started_at',
                label: 'Başlangıç',
                sortable: false,
                formatter: (value) => `<span style="color:#6c757d;font-weight:500;">${formatDateTime(value) || '-'}</span>`
            },
            {
                field: 'duration',
                label: 'Süre',
                sortable: false,
                formatter: (value, row) => {
                    const startMs = row.start_ms;
                    if (!startMs) return '-';
                    return `<span class="fault-timer-display" style="
                        color: #dc3545;
                        font-weight: 600;
                        font-size: 1rem;
                        background: rgba(220, 53, 69, 0.08);
                        padding: 0.25rem 0.5rem;
                        border-radius: 6px;
                        border: 1px solid rgba(220, 53, 69, 0.2);
                        display: inline-block;
                        min-width: 90px;
                        text-align: center;
                    " data-start-ms="${startMs}">${value}</span>`;
                }
            }
        ],
        data: [],
        pagination: false,
        emptyMessage: 'Aktif arıza zamanlayıcısı yok',
        emptyIcon: 'fas fa-stopwatch',
        tableClass: 'table table-hover',
        refreshable: true,
        skeleton: true,
        skeletonRows: 6,
        onRefresh: async () => {
            faultTimersTable.setLoading(true);
            await loadData();
            faultTimersTable.setLoading(false);
        }
    });
}

function updateStatistics() {
    if (!statisticsCards) return;

    const timers = Array.isArray(state.timers) ? state.timers : [];
    const activeUsers = new Set(timers.map(getUsername)).size;
    const activeMachines = new Set(timers.map(getMachineName)).size;

    statisticsCards.updateCard('active-fault-timers', String(timers.length));
    statisticsCards.updateCard('active-fault-users', String(activeUsers));
    statisticsCards.updateCard('active-fault-machines', String(activeMachines));
}

function updateTable() {
    if (!faultTimersTable) return;

    const now = Date.now();
    const tableData = state.timers.map((t) => {
        const startMs = getStartMs(t);
        const duration = startMs ? formatDurationFromMs(Math.max(0, now - startMs)) : '-';
        const startedAt = t.start_time || t.started_at || t.start || t.created_at || t.reported_at || null;

        return {
            raw: t,
            user: getUsername(t),
            machine: getMachineName(t),
            fault: getFaultLabel(t),
            started_at: startedAt,
            start_ms: startMs,
            duration
        };
    });

    faultTimersTable.updateData(tableData);
}

async function loadData() {
    try {
        const response = await fetchFaultTimers(true);
        state.timers = normalizeTimersResponse(response);
    } catch (error) {
        console.error('Error loading fault timers:', error);
        state.timers = [];
    }

    updateStatistics();
    updateTable();
}

function startAutoRefresh() {
    // Refresh every 2 minutes
    state.refreshInterval = setInterval(loadData, 120000);
}

function stopAutoRefresh() {
    if (state.refreshInterval) {
        clearInterval(state.refreshInterval);
        state.refreshInterval = null;
    }
}

function startTimerUpdates() {
    state.timerUpdateInterval = setInterval(() => {
        const elements = document.querySelectorAll('.fault-timer-display[data-start-ms]');
        const now = Date.now();
        elements.forEach((el) => {
            const startMs = Number(el.getAttribute('data-start-ms'));
            if (!startMs || Number.isNaN(startMs)) return;
            el.textContent = formatDurationFromMs(Math.max(0, now - startMs));
        });
    }, 1000);
}

function stopTimerUpdates() {
    if (state.timerUpdateInterval) {
        clearInterval(state.timerUpdateInterval);
        state.timerUpdateInterval = null;
    }
}

window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
    stopTimerUpdates();
});

document.addEventListener('DOMContentLoaded', initDashboard);

