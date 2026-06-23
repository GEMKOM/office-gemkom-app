import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../../components/table/table.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { fetchStaffActivityReport, fetchStaffActivityDetail } from '../../../../apis/maintenance/reports.js';

let headerComponent, statisticsCards, tableComponent, detailModal;
let allRows = [];
let currentPeriod = { year: null, month: null };

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();
    initializeComponents();
    await loadReport();
});

// ── Initialise ────────────────────────────────────────────────────────────────

function initializeComponents() {
    headerComponent = new HeaderComponent({
        title: 'Personel Faaliyet Raporu',
        subtitle: 'Her personelin çözdüğü arızalar, başlattığı zamanlayıcılar ve toplam çalışma süresi',
        icon: 'users',
        showBackButton: 'block',
        backUrl: '/manufacturing/maintenance/reports'
    });

    statisticsCards = new StatisticsCards('statistics-container', {
        cards: [
            { title: 'Aktif Personel',       value: 0,    icon: 'users',         color: 'primary', trend: null },
            { title: 'Çözülen Arıza',        value: 0,    icon: 'check-circle',  color: 'success', trend: null },
            { title: 'Zamanlayıcı',          value: 0,    icon: 'stopwatch',     color: 'info',    trend: null },
            { title: 'Toplam Çalışma',       value: '0d', icon: 'clock',         color: 'warning', trend: null }
        ]
    });

    // ── Month navigator ───────────────────────────────────────────────────────
    const now = new Date();
    currentPeriod = { year: now.getFullYear(), month: now.getMonth() + 1 };
    initMonthNavigator();

    // ── Table ─────────────────────────────────────────────────────────────────
    tableComponent = new TableComponent('table-container', {
        title: 'Personel Özeti',
        columns: [
            {
                field: 'full_name',
                label: 'Personel',
                sortable: true,
                formatter: (v, row) => `
                    <div class="d-flex align-items-center gap-2">
                        <div style="width:34px;height:34px;border-radius:50%;
                                    background:linear-gradient(135deg,#0d6efd,#6610f2);
                                    display:flex;align-items:center;justify-content:center;
                                    color:#fff;font-weight:700;font-size:.85rem;flex-shrink:0;">
                            ${(v || row.username || '?')[0].toUpperCase()}
                        </div>
                        <div>
                            <div class="fw-semibold">${v || row.username}</div>
                            <div class="text-muted" style="font-size:.75rem;">@${row.username}</div>
                        </div>
                    </div>`
            },
            {
                field: 'faults_resolved_count',
                label: 'Çözülen Arıza',
                sortable: true,
                formatter: (v) => `<span class="stat-pill stat-pill-green"><i class="fas fa-check-circle"></i>${Number(v ?? 0)}</span>`
            },
            {
                field: 'timers_count',
                label: 'Zamanlayıcı',
                sortable: true,
                formatter: (v) => `<span class="stat-pill stat-pill-blue"><i class="fas fa-stopwatch"></i>${Number(v ?? 0)}</span>`
            },
            {
                field: 'total_timer_seconds',
                label: 'Toplam Çalışma',
                sortable: true,
                formatter: (v) => `<span class="stat-pill stat-pill-orange"><i class="fas fa-clock"></i>${formatDuration(v)}</span>`
            },
            {
                field: 'actions',
                label: '',
                sortable: false,
                formatter: (v, row) => `
                    <button class="btn btn-sm btn-outline-primary" onclick="openStaffDetail(${row.user_id})">
                        <i class="fas fa-eye me-1"></i>Detay
                    </button>`
            }
        ],
        pagination: false,
        refreshable: true,
        exportable: true,
        onRefresh: loadReport,
        emptyMessage: 'Faaliyet kaydı bulunamadı',
        emptyIcon: 'fas fa-users',
        skeleton: true,
        loading: true
    });

    // ── Detail modal (DisplayModal component) ─────────────────────────────────
    detailModal = new DisplayModal('staff-detail-modal-container', {
        title: 'Personel Detayı',
        icon: 'fas fa-user-clock',
        size: 'xl',
        showEditButton: false
    });
}

// ── Month navigator ───────────────────────────────────────────────────────────

function initMonthNavigator() {
    const container = document.getElementById('filters-container');
    if (!container) return;

    const value = periodToInputValue(currentPeriod);
    container.innerHTML = `
        <div class="month-navigator">
            <button class="month-nav-btn" id="month-prev" title="Önceki ay">
                <i class="fas fa-chevron-left"></i>
            </button>
            <input type="month" class="month-nav-input" id="periodFilter" value="${value}">
            <button class="month-nav-btn" id="month-next" title="Sonraki ay">
                <i class="fas fa-chevron-right"></i>
            </button>
            <button class="month-nav-btn month-nav-all" id="month-all" title="Tüm zamanlar">
                <i class="fas fa-infinity"></i>
            </button>
        </div>`;

    document.getElementById('month-prev').addEventListener('click', () => shiftMonth(-1));
    document.getElementById('month-next').addEventListener('click', () => shiftMonth(+1));
    document.getElementById('month-all').addEventListener('click', () => {
        currentPeriod = { year: null, month: null };
        document.getElementById('periodFilter').value = '';
        loadReport();
    });
    document.getElementById('periodFilter').addEventListener('change', (e) => {
        const raw = e.target.value;
        if (raw) {
            const [y, m] = raw.split('-').map(Number);
            currentPeriod = { year: y, month: m };
        } else {
            currentPeriod = { year: null, month: null };
        }
        loadReport();
    });
}

function shiftMonth(delta) {
    let { year, month } = currentPeriod;
    if (!year) {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
    }
    month += delta;
    if (month < 1)  { month = 12; year--; }
    if (month > 12) { month = 1;  year++; }
    currentPeriod = { year, month };
    const el = document.getElementById('periodFilter');
    if (el) el.value = periodToInputValue(currentPeriod);
    loadReport();
}

function periodToInputValue({ year, month }) {
    if (!year) return '';
    return `${year}-${String(month).padStart(2, '0')}`;
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadReport() {
    try {
        tableComponent.setLoading(true);
        allRows = await fetchStaffActivityReport(currentPeriod);
        updateStatistics();
        tableComponent.updateData(allRows, allRows.length, 1);
    } catch (err) {
        console.error('Staff report error:', err);
        allRows = [];
        tableComponent.updateData([], 0, 1);
    } finally {
        tableComponent.setLoading(false);
    }
}

function updateStatistics() {
    const totalFaults  = allRows.reduce((s, r) => s + (r.faults_resolved_count || 0), 0);
    const totalTimers  = allRows.reduce((s, r) => s + (r.timers_count || 0), 0);
    const totalSeconds = allRows.reduce((s, r) => s + (r.total_timer_seconds || 0), 0);
    statisticsCards.updateValues({
        0: allRows.length,
        1: totalFaults,
        2: totalTimers,
        3: formatDuration(totalSeconds)
    });
}

// ── Detail modal ──────────────────────────────────────────────────────────────

window.openStaffDetail = async function(userId) {
    detailModal.clearData();
    detailModal.setTitle('Yükleniyor…');
    detailModal.setLoading(true);
    detailModal.show();

    try {
        const data = await fetchStaffActivityDetail(userId, currentPeriod);

        detailModal.clearData();
        detailModal.setTitle(data.user.full_name);

        const periodLabel = currentPeriod.year
            ? monthLabel(currentPeriod.year, currentPeriod.month)
            : 'Tüm Zamanlar';

        detailModal.addCustomSection({
            customContent: buildDetailHtml(data, periodLabel)
        });

        detailModal.render();
    } catch (err) {
        console.error('Detail fetch error:', err);
        detailModal.clearData();
        detailModal.addCustomSection({
            customContent: `<p class="text-danger text-center py-4">
                <i class="fas fa-exclamation-circle me-2"></i>Veri yüklenemedi.
            </p>`
        });
        detailModal.render();
    } finally {
        detailModal.setLoading(false);
    }
};

function buildDetailHtml(data, periodLabel) {
    const completedTimers = data.timers.filter(t => !t.is_active && t.duration_seconds != null);
    const totalTimerSec   = completedTimers.reduce((s, t) => s + t.duration_seconds, 0);
    const activeCount     = data.timers.filter(t => t.is_active).length;

    const summaryHtml = `
        <div class="d-flex gap-2 flex-wrap p-3 border-bottom bg-light rounded-top mb-0">
            <span class="stat-pill stat-pill-blue"><i class="fas fa-calendar-alt"></i>${escHtml(periodLabel)}</span>
            <span class="stat-pill stat-pill-green"><i class="fas fa-check-circle"></i>${data.resolved_faults.length} arıza çözüldü</span>
            <span class="stat-pill stat-pill-blue"><i class="fas fa-stopwatch"></i>${data.timers.length} zamanlayıcı</span>
            <span class="stat-pill stat-pill-orange"><i class="fas fa-clock"></i>${formatDuration(totalTimerSec)}</span>
            ${activeCount > 0
                ? `<span class="stat-pill stat-pill-red"><i class="fas fa-circle" style="font-size:.45rem;"></i>${activeCount} aktif</span>`
                : ''}
        </div>`;

    const faultsHtml = data.resolved_faults.length === 0
        ? `<p class="text-muted text-center py-4 mb-0">
               <i class="fas fa-check-circle me-2"></i>Bu dönemde çözülen arıza yok.
           </p>`
        : `<div class="table-responsive">
            <table class="table table-sm table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th>#ID</th><th>Ekipman</th><th>Açıklama</th><th>Tür</th>
                        <th>Bildirilme</th><th>Çözüm</th><th>Süre</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.resolved_faults.map(f => `
                        <tr>
                            <td><span class="fw-bold text-primary">#${f.id}</span></td>
                            <td class="fw-semibold">${escHtml(f.machine_name || '-')}</td>
                            <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
                                title="${escHtml(f.description || '')}">${escHtml(f.description || '-')}</td>
                            <td>${typeBadge(f)}</td>
                            <td style="white-space:nowrap;">${formatDateTime(f.reported_at)}</td>
                            <td style="white-space:nowrap;">${formatDateTime(f.resolved_at)}</td>
                            <td style="white-space:nowrap;">${f.resolution_duration_seconds != null
                                ? formatDuration(f.resolution_duration_seconds) : '-'}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
           </div>`;

    const timersHtml = data.timers.length === 0
        ? `<p class="text-muted text-center py-4 mb-0">
               <i class="fas fa-stopwatch me-2"></i>Bu dönemde zamanlayıcı yok.
           </p>`
        : `<div class="table-responsive">
            <table class="table table-sm table-hover align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th>#ID</th><th>Arıza</th><th>Ekipman</th>
                        <th>Başlangıç</th><th>Bitiş</th><th>Süre</th><th>Durum</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.timers.map(t => `
                        <tr class="${t.is_active ? 'timer-row-active' : ''}">
                            <td><span class="fw-bold text-primary">#${t.id}</span></td>
                            <td>${t.fault_id ? `<span class="text-muted">Arıza #${t.fault_id}</span>` : '-'}</td>
                            <td>${escHtml(t.fault_machine || '-')}</td>
                            <td style="white-space:nowrap;">${formatMsDateTime(t.start_time_ms)}</td>
                            <td style="white-space:nowrap;">${t.finish_time_ms
                                ? formatMsDateTime(t.finish_time_ms)
                                : '<span class="text-success fw-semibold">Devam Ediyor</span>'}</td>
                            <td style="white-space:nowrap;">${t.duration_seconds != null
                                ? formatDuration(t.duration_seconds)
                                : (t.is_active ? '—' : '-')}</td>
                            <td>${t.is_active
                                ? '<span class="badge bg-success">Aktif</span>'
                                : '<span class="badge bg-secondary">Tamamlandı</span>'}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
           </div>`;

    // Bootstrap tab IDs must be unique per open; use timestamp to avoid conflicts
    const uid = Date.now();

    return `
        ${summaryHtml}
        <ul class="nav nav-tabs px-3 pt-3" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active" id="tab-faults-${uid}-btn"
                        data-bs-toggle="tab" data-bs-target="#tab-faults-${uid}"
                        type="button" role="tab">
                    <i class="fas fa-exclamation-triangle me-1"></i>
                    Çözülen Arızalar
                    <span class="badge bg-secondary ms-1">${data.resolved_faults.length}</span>
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" id="tab-timers-${uid}-btn"
                        data-bs-toggle="tab" data-bs-target="#tab-timers-${uid}"
                        type="button" role="tab">
                    <i class="fas fa-stopwatch me-1"></i>
                    Zamanlayıcılar
                    <span class="badge bg-secondary ms-1">${data.timers.length}</span>
                </button>
            </li>
        </ul>
        <div class="tab-content px-3 pb-3 pt-2">
            <div class="tab-pane fade show active" id="tab-faults-${uid}" role="tabpanel">
                ${faultsHtml}
            </div>
            <div class="tab-pane fade" id="tab-timers-${uid}" role="tabpanel">
                ${timersHtml}
            </div>
        </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function formatDateTime(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatMsDateTime(ms) {
    if (ms == null) return '-';
    return formatDateTime(new Date(ms).toISOString());
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function typeBadge(f) {
    if (f.is_breaking)   return '<span class="badge bg-danger">Duruş</span>';
    if (f.is_maintenance) return '<span class="badge bg-warning text-dark">Bakım</span>';
    return '<span class="badge bg-secondary">Arıza</span>';
}

const TR_MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                   'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

function monthLabel(year, month) {
    return `${TR_MONTHS[(month - 1) % 12]} ${year}`;
}
