import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { showNotification } from '../../components/notification/notification.js';
import { getReportsSnapshot } from '../../apis/reports/snapshot.js';

const POLL_MS = 60_000;
let pollTimer = null;
let kpiCards = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();

    new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Dashboard',
        subtitle: 'Genel performans göstergeleri, onay bekleyenler ve uyarılar',
        icon: 'tachometer-alt',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/management',
        onRefreshClick: () => loadSnapshot(true)
    });

    kpiCards = new StatisticsCards('kpi-cards-placeholder', {
        compact: true,
        responsive: true,
        cards: []
    });

    await loadSnapshot(true);
    startPolling();
});

window.addEventListener('beforeunload', stopPolling);

function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => loadSnapshot(false), POLL_MS);
}

function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}

function n(v) {
    const num = Number(v);
    return Number.isFinite(num) ? num : 0;
}

function renderLoading() {
    kpiCards?.showLoading();
    const el = document.getElementById('content-placeholder');
    if (!el) return;
    el.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status"></div>
            <div class="text-muted small mt-2">Veriler yükleniyor...</div>
        </div>
    `;
}

function alertBadge(value, kind) {
    const v = n(value);
    if (v <= 0) return '';
    const cls = kind === 'red' ? 'metric-tile-alert metric-tile-alert--red' : 'metric-tile-alert metric-tile-alert--amber';
    return `<span class="${cls}"><i class="fas fa-circle" style="font-size:0.45rem;"></i> ${v}</span>`;
}

function metricTile({ label, value, icon, iconColor, tileColor, url, alert, footer }) {
    return `
        <div class="metric-tile metric-tile--${tileColor}" onclick="window.location.href='${url}'" title="${footer || label}">
            ${alert || ''}
            <div class="metric-tile-header">
                <span class="metric-tile-label">${label}</span>
                <span class="metric-tile-icon metric-tile-icon--${iconColor}"><i class="fas fa-${icon}"></i></span>
            </div>
            <div class="metric-tile-value">${n(value)}</div>
            <div class="metric-tile-footer">
                <i class="fas fa-arrow-right"></i>
                ${footer || 'Detaya git'}
            </div>
        </div>
    `;
}

async function loadSnapshot(showSpinner) {
    try {
        if (showSpinner) renderLoading();
        const data = await getReportsSnapshot();

        const jobActive  = n(data?.job_orders?.active);
        const jobOverdue = n(data?.job_orders?.overdue);
        const jobHold    = n(data?.job_orders?.on_hold_for_revision);

        const apOvertime    = n(data?.approvals_pending?.overtime_requests);
        const apPurchase    = n(data?.approvals_pending?.purchase_requests);
        const apStatements  = n(data?.approvals_pending?.subcontractor_statements);
        const totalApprovals = apOvertime + apPurchase + apStatements;

        const alBlocked  = n(data?.alerts?.tasks_blocked);
        const alNcr      = n(data?.alerts?.ncrs_critical_open);
        const alPayments = n(data?.alerts?.payments_overdue);
        const totalAlerts = alBlocked + alNcr + alPayments;

        kpiCards.setCards([
            {
                id: 'active-jobs',
                title: 'Aktif İş Emri',
                value: String(jobActive),
                icon: 'fas fa-briefcase',
                color: 'primary'
            },
            {
                id: 'overdue-jobs',
                title: 'Gecikmiş İş Emri',
                value: String(jobOverdue),
                icon: 'fas fa-clock',
                color: jobOverdue > 0 ? 'danger' : 'secondary'
            },
            {
                id: 'pending-approvals',
                title: 'Onay Bekleyen',
                value: String(totalApprovals),
                icon: 'fas fa-clipboard-check',
                color: totalApprovals > 0 ? 'warning' : 'secondary'
            },
            {
                id: 'alerts',
                title: 'Uyarı',
                value: String(totalAlerts),
                icon: 'fas fa-triangle-exclamation',
                color: totalAlerts > 0 ? 'danger' : 'secondary'
            }
        ]);

        const content = document.getElementById('content-placeholder');
        if (!content) return;

        const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

        content.innerHTML = `
            <!-- İş Emirleri -->
            <div class="snapshot-section">
                <div class="snapshot-section-title">
                    <i class="fas fa-briefcase text-primary"></i> İş Emirleri
                </div>
                <div class="metric-tiles">
                    ${metricTile({
                        label: 'Aktif',
                        value: jobActive,
                        icon: 'play-circle',
                        iconColor: 'blue',
                        tileColor: 'blue',
                        url: '/projects/project-tracking',
                        footer: 'Proje Takibi'
                    })}
                    ${metricTile({
                        label: 'Gecikmiş',
                        value: jobOverdue,
                        icon: 'clock',
                        iconColor: 'red',
                        tileColor: 'red',
                        url: '/projects/project-tracking',
                        alert: alertBadge(jobOverdue, 'red'),
                        footer: 'Gecikmiş iş emirleri'
                    })}
                    ${metricTile({
                        label: 'Revizyon Beklemede',
                        value: jobHold,
                        icon: 'pause-circle',
                        iconColor: 'amber',
                        tileColor: 'amber',
                        url: '/design/revision-requests',
                        footer: 'Revizyon talepleri'
                    })}
                </div>
            </div>

            <!-- Onay Bekleyenler -->
            <div class="snapshot-section">
                <div class="snapshot-section-title">
                    <i class="fas fa-clipboard-check text-success"></i> Onay Bekleyenler
                </div>
                <div class="metric-tiles">
                    ${metricTile({
                        label: 'Fazla Mesai',
                        value: apOvertime,
                        icon: 'user-clock',
                        iconColor: 'blue',
                        tileColor: 'blue',
                        url: '/general/overtime/pending',
                        alert: alertBadge(apOvertime, 'amber'),
                        footer: 'Bekleyen mesai talepleri'
                    })}
                    ${metricTile({
                        label: 'Satın Alma',
                        value: apPurchase,
                        icon: 'shopping-cart',
                        iconColor: 'green',
                        tileColor: 'green',
                        url: '/procurement/purchase-requests/pending',
                        alert: alertBadge(apPurchase, 'amber'),
                        footer: 'Bekleyen satın alma talepleri'
                    })}
                    ${metricTile({
                        label: 'Hakediş',
                        value: apStatements,
                        icon: 'file-invoice-dollar',
                        iconColor: 'dark',
                        tileColor: 'green',
                        url: '/manufacturing/subcontracting/statements/',
                        alert: alertBadge(apStatements, 'amber'),
                        footer: 'Bekleyen hakedişler'
                    })}
                </div>
            </div>

            <!-- Uyarılar -->
            <div class="snapshot-section">
                <div class="snapshot-section-title">
                    <i class="fas fa-triangle-exclamation text-warning"></i> Uyarılar
                </div>
                <div class="metric-tiles">
                    ${metricTile({
                        label: 'Bloke Görev',
                        value: alBlocked,
                        icon: 'ban',
                        iconColor: 'amber',
                        tileColor: 'amber',
                        url: '/projects/project-tracking',
                        footer: 'Bloke departman görevleri'
                    })}
                    ${metricTile({
                        label: 'Kritik NCR',
                        value: alNcr,
                        icon: 'exclamation-circle',
                        iconColor: 'red',
                        tileColor: 'red',
                        url: '/quality-control/ncrs',
                        alert: alertBadge(alNcr, 'red'),
                        footer: 'Kritik uygunsuzluk raporları'
                    })}
                    ${metricTile({
                        label: 'Gecikmiş Ödeme',
                        value: alPayments,
                        icon: 'credit-card',
                        iconColor: 'red',
                        tileColor: 'red',
                        url: '/finance/purchase-orders',
                        alert: alertBadge(alPayments, 'red'),
                        footer: 'Vadesi geçmiş ödemeler'
                    })}
                </div>
            </div>

            <div class="snapshot-updated">
                Son güncelleme: ${now} • Her 60 saniyede otomatik yenilenir
            </div>
        `;
    } catch (error) {
        console.error('Snapshot load error:', error);
        showNotification(`Dashboard yüklenirken hata oluştu: ${error.message}`, 'error');

        const content = document.getElementById('content-placeholder');
        if (content) {
            content.innerHTML = `
                <div class="dashboard-card compact">
                    <div class="card-body py-4">
                        <div class="alert alert-danger mb-0">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            <strong>Veriler yüklenemedi:</strong> ${error.message}
                        </div>
                    </div>
                </div>
            `;
        }
    }
}
