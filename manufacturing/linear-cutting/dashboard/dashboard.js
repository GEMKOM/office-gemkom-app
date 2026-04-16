import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../components/table/table.js';
import { listLinearCuttingSessions } from '../../../apis/linear_cutting/sessions.js';
import { listLinearCuttingTasks } from '../../../apis/linear_cutting/tasks.js';

let statsCards;
let sessionsTable;
let tasksTable;

function normalizePaginated(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
}

function initHeader() {
    new HeaderComponent({
        title: 'Lineer Kesim Dashboard',
        subtitle: 'Kesim planı ve görev görünümü',
        icon: 'chart-line',
        showBackButton: 'block',
        onBackClick: () => {
            window.location.href = '/manufacturing/linear-cutting/';
        }
    });
}

function initStats() {
    statsCards = new StatisticsCards('lc-dashboard-stats', {
        cards: [
            { title: 'Toplam Plan', value: '0', icon: 'fas fa-folder-open', color: 'primary', id: 'lc-sessions-count' },
            { title: 'Bekleyen Görev', value: '0', icon: 'fas fa-hourglass-half', color: 'warning', id: 'lc-pending-tasks' },
            { title: 'Tamamlanan Görev', value: '0', icon: 'fas fa-check-circle', color: 'success', id: 'lc-completed-tasks' },
            { title: 'Onaylanan Plan', value: '0', icon: 'fas fa-stamp', color: 'info', id: 'lc-confirmed-sessions' }
        ],
        compact: true,
        animation: true
    });
}

function initTables() {
    sessionsTable = new TableComponent('lc-sessions-table', {
        title: 'Son Kesim Planları',
        icon: 'fas fa-stream',
        columns: [
            {
                key: 'key',
                label: 'Key',
                sortable: false,
                formatter: (value) => `<span class="fw-bold text-primary">${value}</span>`
            },
            { key: 'title', label: 'Başlık', sortable: false, formatter: (v) => v || '-' },
            { key: 'material', label: 'Malzeme', sortable: false, formatter: (v) => v || '-' },
            { key: 'stock_length_mm', label: 'Stok (mm)', sortable: false, formatter: (v) => v ?? '-' },
            {
                key: 'confirmed',
                label: 'Onay',
                sortable: false,
                formatter: (v, row) => {
                    const ok = row.tasks_created || row.planning_request_created;
                    return ok ? '<span class="badge bg-success">Onaylandı</span>' : '<span class="badge bg-secondary">Bekliyor</span>';
                }
            },
            {
                key: 'actions',
                label: 'İşlem',
                sortable: false,
                formatter: (v, row) => `
                    <button class="btn btn-sm btn-outline-primary" data-open-session="${row.key}">
                        <i class="fas fa-external-link-alt me-1"></i>Aç
                    </button>
                `
            }
        ],
        data: [],
        pagination: false,
        emptyMessage: 'Kesim planı bulunamadı',
        emptyIcon: 'fas fa-folder-open',
        tableClass: 'table table-hover',
        refreshable: true,
        onRefresh: async () => {
            sessionsTable.setLoading(true);
            await loadData();
            sessionsTable.setLoading(false);
        },
        skeleton: true,
        skeletonRows: 6
    });

    tasksTable = new TableComponent('lc-tasks-table', {
        title: 'Bekleyen Görevler',
        icon: 'fas fa-tasks',
        columns: [
            { key: 'key', label: 'Key', sortable: false, formatter: (v) => `<span class="fw-bold">${v}</span>` },
            { key: 'session', label: 'Plan', sortable: false, formatter: (v) => v || '-' },
            { key: 'bar_index', label: 'Bar', sortable: false, formatter: (v) => v ?? '-' },
            {
                key: 'actions',
                label: 'İşlem',
                sortable: false,
                formatter: (v, row) => `
                    <button class="btn btn-sm btn-outline-success" data-open-task="${row.key}">
                        <i class="fas fa-eye me-1"></i>Detay
                    </button>
                `
            }
        ],
        data: [],
        pagination: false,
        emptyMessage: 'Bekleyen görev yok',
        emptyIcon: 'fas fa-check',
        tableClass: 'table table-hover',
        skeleton: true,
        skeletonRows: 8
    });

    document.body.addEventListener('click', (e) => {
        const openSessionBtn = e.target.closest('[data-open-session]');
        if (openSessionBtn) {
            const key = openSessionBtn.getAttribute('data-open-session');
            window.location.href = `/manufacturing/linear-cutting/cuts/?session=${encodeURIComponent(key)}`;
            return;
        }
        const openTaskBtn = e.target.closest('[data-open-task]');
        if (openTaskBtn) {
            const key = openTaskBtn.getAttribute('data-open-task');
            window.location.href = `/manufacturing/linear-cutting/cuts/?task=${encodeURIComponent(key)}`;
        }
    });
}

async function loadData() {
    const [sessionsRaw, pendingTasksRaw, completedTasksRaw] = await Promise.all([
        listLinearCuttingSessions({ ordering: '-created_at' }),
        listLinearCuttingTasks({ completed: 'false' }),
        listLinearCuttingTasks({ completed: 'true' })
    ]);

    const sessions = normalizePaginated(sessionsRaw);
    const pendingTasks = normalizePaginated(pendingTasksRaw);
    const completedTasks = normalizePaginated(completedTasksRaw);

    const confirmedSessions = sessions.filter(s => s && (s.tasks_created || s.planning_request_created)).length;

    statsCards.updateCard('lc-sessions-count', String(sessions.length));
    statsCards.updateCard('lc-pending-tasks', String(pendingTasks.length));
    statsCards.updateCard('lc-completed-tasks', String(completedTasks.length));
    statsCards.updateCard('lc-confirmed-sessions', String(confirmedSessions));

    sessionsTable.updateData(sessions.slice(0, 20).map(s => ({
        key: s.key,
        title: s.title,
        material: s.material,
        stock_length_mm: s.stock_length_mm,
        tasks_created: s.tasks_created,
        planning_request_created: s.planning_request_created
    })));

    tasksTable.updateData(pendingTasks.slice(0, 20).map(t => ({
        key: t.key,
        session: t.session,
        bar_index: t.bar_index
    })));
}

async function init() {
    await initNavbar();
    initHeader();
    initStats();
    initTables();

    try {
        sessionsTable.setLoading(true);
        tasksTable.setLoading(true);
        await loadData();
    } finally {
        sessionsTable.setLoading(false);
        tasksTable.setLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', init);

