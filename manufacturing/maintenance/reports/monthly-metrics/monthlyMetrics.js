import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../../components/table/table.js';
import { fetchMonthlyMetricsReport } from '../../../../apis/maintenance/reports.js';

let headerComponent, statisticsCards, tableComponent;
let allRows = [];
let summary  = {};

const TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                   'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();
    initializeComponents();
    await loadReport();
});

function initializeComponents() {
    headerComponent = new HeaderComponent({
        title: 'Aylık Metrikler',
        subtitle: 'Arıza ve bakım süreçlerine ait aylık istatistikler ve trendler',
        icon: 'chart-bar',
        showBackButton: 'block',
        backUrl: '/manufacturing/maintenance/reports'
    });

    statisticsCards = new StatisticsCards('statistics-container', {
        cards: [
            { title: 'Toplam Arıza',           value: 0,    icon: 'exclamation-triangle', color: 'danger',  trend: null },
            { title: 'Toplam Çözüldü',         value: 0,    icon: 'check-circle',         color: 'success', trend: null },
            { title: 'Ort. Çözüm Süresi',      value: '-',  icon: 'clock',                color: 'info',    trend: null },
            { title: 'Toplam Makine Duruşu',   value: '-',  icon: 'stop-circle',          color: 'warning', trend: null }
        ]
    });

    tableComponent = new TableComponent('table-container', {
        title: 'Aylık Arıza Detayları',
        columns: [
            {
                field: 'period',
                label: 'Dönem',
                sortable: true,
                formatter: (v, row) => {
                    const [y, m] = v.split('-').map(Number);
                    return `<span class="month-badge">${TR_MONTHS[m-1]} ${y}</span>`;
                }
            },
            {
                field: 'total_faults',
                label: 'Toplam Arıza',
                sortable: true,
                formatter: (v, row) => faultBar(v, row, 'total_faults')
            },
            {
                field: 'breaking_faults',
                label: 'Makine Duruşu',
                sortable: true,
                formatter: (v, row) => `
                    <span class="badge bg-danger me-1">${v}</span>
                    ${row.total_faults ? `<small class="text-muted">${Math.round(v/row.total_faults*100)}%</small>` : ''}`
            },
            {
                field: 'resolved_faults',
                label: 'Çözüldü',
                sortable: true,
                formatter: (v, row) => {
                    const pct = row.resolve_rate_pct;
                    const color = pct >= 80 ? '#198754' : pct >= 50 ? '#fd7e14' : '#dc3545';
                    return `
                        <span class="badge me-1" style="background:${color}">${v}</span>
                        ${pct != null ? `<small style="color:${color};font-weight:600;">${pct}%</small>` : ''}`;
                }
            },
            {
                field: 'unresolved_faults',
                label: 'Açık',
                sortable: true,
                formatter: (v) => v > 0
                    ? `<span class="badge bg-warning text-dark">${v}</span>`
                    : `<span class="text-muted">0</span>`
            },
            {
                field: 'avg_resolution_seconds',
                label: 'Ort. Çözüm Süresi',
                sortable: true,
                formatter: (v) => v != null ? formatDuration(v) : '-'
            },
            {
                field: 'min_resolution_seconds',
                label: 'En Hızlı',
                sortable: true,
                formatter: (v) => v != null
                    ? `<span class="text-success fw-semibold">${formatDuration(v)}</span>` : '-'
            },
            {
                field: 'max_resolution_seconds',
                label: 'En Yavaş',
                sortable: true,
                formatter: (v) => v != null
                    ? `<span class="text-danger fw-semibold">${formatDuration(v)}</span>` : '-'
            },
            {
                field: 'total_breaking_downtime_seconds',
                label: 'Toplam Duruş',
                sortable: true,
                formatter: (v) => v != null ? `<span class="fw-semibold">${formatDuration(v)}</span>` : '-'
            },
            {
                field: 'unique_machines_affected',
                label: 'Etkilenen Makine',
                sortable: true,
                formatter: (v) => `<span class="badge bg-light text-dark border">${v ?? 0}</span>`
            },
            {
                field: 'unique_resolvers',
                label: 'Çözen Kişi',
                sortable: true,
                formatter: (v) => `<span class="badge bg-light text-dark border">${v ?? 0}</span>`
            }
        ],
        pagination: false,
        refreshable: true,
        exportable: true,
        onRefresh: loadReport,
        emptyMessage: 'Henüz kayıt bulunamadı',
        emptyIcon: 'fas fa-chart-bar',
        skeleton: true,
        loading: true
    });
}

async function loadReport() {
    try {
        tableComponent.setLoading(true);
        const data = await fetchMonthlyMetricsReport();
        allRows = (data.monthly || []).slice().reverse(); // most-recent first
        summary = data.summary || {};
        updateStatistics();
        renderHighlights();
        tableComponent.updateData(allRows, allRows.length, 1);
    } catch (err) {
        console.error('Monthly metrics error:', err);
        allRows = [];
        tableComponent.updateData([], 0, 1);
    } finally {
        tableComponent.setLoading(false);
    }
}

function updateStatistics() {
    statisticsCards.updateValues({
        0: summary.total_faults_all_time ?? 0,
        1: summary.total_resolved_all_time ?? 0,
        2: summary.overall_avg_resolution_seconds != null
            ? formatDuration(summary.overall_avg_resolution_seconds) : '-',
        3: summary.total_breaking_downtime_all_time != null
            ? formatDuration(summary.total_breaking_downtime_all_time) : '-'
    });
}

function renderHighlights() {
    const c = document.getElementById('highlights-container');
    if (!c) return;

    const cards = [
        {
            label: 'Aylık Ortalama Arıza',
            value: summary.overall_avg_faults_per_month != null
                ? summary.overall_avg_faults_per_month.toFixed(1) : '-',
            icon: 'fas fa-chart-line', color: '#0d6efd'
        },
        {
            label: 'Aylık Ortalama Makine Duruşu',
            value: summary.overall_avg_breaking_per_month != null
                ? summary.overall_avg_breaking_per_month.toFixed(1) : '-',
            icon: 'fas fa-stop-circle', color: '#dc3545'
        },
        {
            label: 'En Yoğun Ay',
            value: summary.busiest_month ? periodLabel(summary.busiest_month) : '-',
            icon: 'fas fa-fire', color: '#fd7e14'
        },
        {
            label: 'En Hızlı Çözüm Ayı',
            value: summary.fastest_month ? periodLabel(summary.fastest_month) : '-',
            icon: 'fas fa-bolt', color: '#198754'
        }
    ];

    c.innerHTML = `
        <div class="row g-3">
            ${cards.map(card => `
                <div class="col-sm-6 col-xl-3">
                    <div class="metric-card">
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <i class="${card.icon}" style="color:${card.color};font-size:1.1rem;"></i>
                            <span class="metric-label mb-0">${card.label}</span>
                        </div>
                        <div class="metric-value" style="color:${card.color};">${card.value}</div>
                    </div>
                </div>`).join('')}
        </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function faultBar(v, row, field) {
    const max = Math.max(...allRows.map(r => r[field] || 0), 1);
    const pct = Math.round((v / max) * 100);
    const color = '#0d6efd';
    return `
        <div class="d-flex align-items-center gap-2">
            <span class="fw-semibold" style="min-width:24px;">${v}</span>
            <div class="mini-bar flex-grow-1">
                <div class="mini-bar-fill" style="width:${pct}%;background:${color};"></div>
            </div>
        </div>`;
}

function formatDuration(totalSeconds) {
    const s = Math.floor(Number(totalSeconds) || 0);
    if (s === 0) return '0d';
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const parts = [];
    if (d) parts.push(`${d}g`);
    if (h) parts.push(`${h}s`);
    if (m || parts.length === 0) parts.push(`${m}d`);
    return parts.join(' ');
}

function periodLabel(period) {
    if (!period) return '-';
    const [y, m] = period.split('-').map(Number);
    return `${TR_MONTHS[m-1]} ${y}`;
}
