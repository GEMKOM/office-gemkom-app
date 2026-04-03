import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { showNotification } from '../../../components/notification/notification.js';
import { getReportsOverview } from '../../../apis/reports/overview.js';

let charts = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();

    new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Genel Bakış',
        subtitle: 'Dönem bazlı özet metrikler ve karşılaştırmalar',
        icon: 'chart-line',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/management/reports',
        onRefreshClick: () => loadOverview()
    });

    const filters = new FiltersComponent('filters-placeholder', {
        title: 'Rapor Filtreleri',
        onApply: loadOverview,
        onClear: () => { setDefaultFilters(); loadOverview(); },
        onFilterChange: handleFilterChange
    });

    filters
        .addSelectFilter({
            id: 'preset',
            label: 'Dönem',
            colSize: 3,
            placeholder: 'Seçiniz',
            value: 'current_month',
            options: [
                { value: 'current_month', label: 'Bu Ay' },
                { value: 'last_3_months', label: 'Son 3 Ay' },
                { value: 'last_6_months', label: 'Son 6 Ay' },
                { value: 'last_year', label: 'Son 1 Yıl' }
            ]
        })
        .addDateFilter({ id: 'date_from', label: 'Başlangıç', colSize: 3 })
        .addDateFilter({ id: 'date_to', label: 'Bitiş', colSize: 3 })
        .addCheckboxFilter({ id: 'compare', label: 'Önceki dönemle karşılaştır', colSize: 3, checked: true });

    const kpis = new StatisticsCards('kpi-cards-placeholder', {
        compact: true,
        responsive: true,
        cards: []
    });

    renderSkeleton();
    setDefaultFilters();
    await loadOverview();

    /* ── helpers ─────────────────────────────────────────────────────── */

    function setDefaultFilters() {
        filters.setFilterValues({ preset: 'current_month', date_from: '', date_to: '', compare: true });
    }

    function handleFilterChange(id) {
        const v = filters.getFilterValues();
        if (id === 'preset' && v.preset) filters.setFilterValues({ date_from: '', date_to: '' });
        if ((id === 'date_from' || id === 'date_to') && (v.date_from || v.date_to)) filters.setFilterValues({ preset: '' });
    }

    function killCharts() {
        charts.forEach(c => { try { c.destroy(); } catch (_) { /* noop */ } });
        charts = [];
    }

    function pf(v) {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    }

    function num(v, d = 0) {
        return pf(v).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    function eur(v) {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR' }).format(pf(v));
    }

    function trendDir(cur, prev) {
        const c = pf(cur), p = pf(prev), diff = c - p;
        const pct = p !== 0 ? (diff / Math.abs(p)) * 100 : null;
        return { diff, pct, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
    }

    function trendArrow(cur, prev) {
        if (prev == null) return '';
        const t = trendDir(cur, prev);
        if (t.dir === 'flat') return '→';
        const pctStr = t.pct !== null ? ` ${Math.abs(t.pct).toFixed(0)}%` : '';
        return t.dir === 'up' ? `↑${pctStr}` : `↓${pctStr}`;
    }

    /* ── card / chart builder helpers ────────────────────────────────── */

    function card(icon, iconCls, title, bodyHtml) {
        return `<div class="ov-card">
            <div class="ov-card-header"><i class="fas fa-${icon} ${iconCls}"></i><h6>${title}</h6></div>
            <div class="ov-card-body">${bodyHtml}</div>
        </div>`;
    }

    function chartCard(icon, iconCls, title, canvasId, size = 'md', extraHtml = '') {
        return `<div class="ov-card">
            <div class="ov-card-header"><i class="fas fa-${icon} ${iconCls}"></i><h6>${title}</h6></div>
            <div class="ov-card-body">
                <div class="chart-wrap chart-wrap--${size}"><canvas id="${canvasId}"></canvas></div>
                ${extraHtml}
            </div>
        </div>`;
    }

    function kvRow(label, value, cls = '') {
        return `<dt>${label}</dt><dd${cls ? ` class="${cls}"` : ''}>${value}</dd>`;
    }

    function stat(label, value, sub = '') {
        return `<div class="ov-stat">
            <div class="ov-stat-label">${label}</div>
            <div class="ov-stat-value">${value}</div>
            ${sub ? `<div class="ov-stat-sub">${sub}</div>` : ''}
        </div>`;
    }

    /* ── shared Chart.js defaults for light theme ────────────────────── */

    function chartDefaults() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 4, bottom: 4 } },
            plugins: {
                legend: {
                    labels: {
                        color: '#495057',
                        font: { family: "'Segoe UI', system-ui, sans-serif", size: 12 },
                        padding: 14,
                        usePointStyle: true,
                        pointStyleWidth: 10
                    }
                },
                tooltip: {
                    backgroundColor: '#343a40',
                    titleFont: { family: "'Segoe UI', system-ui, sans-serif", weight: '600' },
                    bodyFont: { family: "'Segoe UI', system-ui, sans-serif" },
                    cornerRadius: 8,
                    padding: 10
                }
            }
        };
    }

    function scaleOpts(opts = {}) {
        return {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.06)' },
            ticks: { color: '#6c757d', font: { size: 11 } },
            ...opts
        };
    }

    /* ── skeleton / loading / error ──────────────────────────────────── */

    function renderSkeleton() {
        const el = document.getElementById('tabs-placeholder');
        if (el) el.innerHTML = `<div class="dashboard-card compact overview-tabs"><div class="card-body text-center py-5"><span class="text-muted small">Sekmeler hazırlanıyor...</span></div></div>`;
    }

    function renderLoading() {
        const el = document.getElementById('tabs-placeholder');
        if (el) el.innerHTML = `<div class="dashboard-card compact overview-tabs"><div class="card-body text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="text-muted small mt-2">Veriler hazırlanıyor...</div></div></div>`;
    }

    function renderError(err) {
        const el = document.getElementById('tabs-placeholder');
        if (el) el.innerHTML = `<div class="dashboard-card compact overview-tabs"><div class="card-body py-4"><div class="alert alert-danger mb-0"><i class="fas fa-exclamation-triangle me-2"></i><strong>Hata:</strong> ${String(err?.message || err)}</div></div></div>`;
    }

    /* ── data load ───────────────────────────────────────────────────── */

    async function loadOverview() {
        try {
            kpis.showLoading();
            renderLoading();
            killCharts();

            const v = filters.getFilterValues();
            const data = await getReportsOverview({
                preset: v.preset || null,
                date_from: v.date_from || null,
                date_to: v.date_to || null,
                compare: v.compare === true
            });

            buildKpis(data);
            buildTabs(data);
        } catch (err) {
            console.error('Overview load error:', err);
            showNotification(`Raporlar yüklenirken hata: ${err.message}`, 'error');
            kpis.showEmpty('Veri yüklenemedi');
            renderError(err);
        }
    }

    /* ── KPI row ─────────────────────────────────────────────────────── */

    function buildKpis(data) {
        const pp = data?.previous_period;
        const cmp = data?.meta?.compare && pp;

        kpis.setCards([
            {
                id: 'won',
                title: `Kazanılan Teklif${cmp ? ` ${trendArrow(data?.sales?.total_won_value_eur, pp?.sales?.total_won_value_eur)}` : ''}`,
                value: eur(data?.sales?.total_won_value_eur),
                icon: 'fas fa-handshake',
                color: 'success'
            },
            {
                id: 'margin',
                title: 'Ortalama Marj',
                value: `${num(data?.costs?.avg_margin_pct, 1)}%`,
                icon: 'fas fa-percent',
                color: 'primary'
            },
            {
                id: 'hours',
                title: `Üretken Saat${cmp ? ` ${trendArrow(data?.manufacturing?.total_productive_hours, pp?.manufacturing?.total_productive_hours)}` : ''}`,
                value: num(data?.manufacturing?.total_productive_hours, 1),
                icon: 'fas fa-clock',
                color: 'info'
            },
            {
                id: 'ncr',
                title: 'Açık NCR',
                value: num(data?.quality?.ncrs_open_total),
                icon: 'fas fa-triangle-exclamation',
                color: Number(data?.quality?.ncrs_by_severity?.critical || 0) > 0 ? 'danger' : 'warning'
            }
        ]);
    }

    /* ── tabs container ──────────────────────────────────────────────── */

    function buildTabs(data) {
        const el = document.getElementById('tabs-placeholder');
        if (!el) return;

        el.innerHTML = `
        <div class="dashboard-card compact overview-tabs">
            <div class="card-body">
                <ul class="nav nav-tabs" role="tablist">
                    <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#pane-prod" type="button">Üretim</button></li>
                    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-sales" type="button">Satış & Maliyet</button></li>
                    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-sub" type="button">Taşeron & Satınalma</button></li>
                    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-qlt" type="button">Kalite</button></li>
                </ul>
                <div class="tab-content pt-3">
                    <div class="tab-pane fade show active" id="pane-prod">${tabProduction(data)}</div>
                    <div class="tab-pane fade" id="pane-sales">${tabSalesCosts(data)}</div>
                    <div class="tab-pane fade" id="pane-sub">${tabSubProc(data)}</div>
                    <div class="tab-pane fade" id="pane-qlt">${tabQuality(data)}</div>
                </div>
            </div>
        </div>`;

        requestAnimationFrame(() => buildAllCharts(data));
    }

    /* ── TAB: Üretim ─────────────────────────────────────────────────── */

    function tabProduction(data) {
        const m = data?.manufacturing || {};
        const pp = data?.previous_period?.manufacturing;
        const cmp = data?.meta?.compare && pp;

        const overtimeKv = `<dl class="ov-kv">
            ${kvRow('Talep (dönem)', num(data?.overtime?.requests_submitted_in_range))}
            ${kvRow('Onaylanan', num(data?.overtime?.requests_approved_in_range))}
            ${kvRow('Onaylanan saat', num(data?.overtime?.total_approved_hours, 1))}
        </dl>`;

        const teams = data?.overtime?.by_team;
        const teamHtml = Array.isArray(teams) && teams.length > 0
            ? `<div class="ov-team-badges">${teams.map(t => `<span class="ov-team-badge">${t.team}: <strong>${num(t.hours, 1)}</strong> saat</span>`).join('')}</div>`
            : '';

        return `
        <div class="row g-3">
            <div class="col-12">
                ${chartCard('chart-column', 'text-info', `Departman Saatleri${cmp ? ' — karşılaştırmalı' : ''}`, 'chart-prod-hours', 'md')}
            </div>
            <div class="col-lg-4">
                ${card('list-check', 'text-primary', 'Görev Durumu', `
                    <div class="ov-stat-grid ov-stat-grid--3">
                        ${stat('Kaynak', `<span class="text-success">${num(m.welding_jobs_completed)}</span> / ${num(m.welding_jobs_remaining)}`, 'tamamlanan / kalan')}
                        ${stat('Talaşlı', `<span class="text-success">${num(m.machining_parts_completed)}</span> / ${num(m.machining_parts_remaining)}`, 'tamamlanan / kalan')}
                        ${stat('CNC', `<span class="text-success">${num(m.cnc_tasks_completed)}</span> / ${num(m.cnc_tasks_remaining)}`, 'tamamlanan / kalan')}
                    </div>
                    <div class="ov-hint">* Kalan değerleri güncel snapshot'tır.</div>
                `)}
            </div>
            <div class="col-lg-4">
                ${card('users', 'text-warning', 'Aktif Kullanıcılar', `
                    <div class="ov-stat-grid ov-stat-grid--4">
                        ${stat('Kaynak', num(m.welding_active_users))}
                        ${stat('Talaşlı', num(m.machining_active_users))}
                        ${stat('CNC', num(m.cnc_active_users))}
                        ${stat('Toplam', num((m.welding_active_users || 0) + (m.machining_active_users || 0) + (m.cnc_active_users || 0)))}
                    </div>
                `)}
            </div>
            <div class="col-lg-4">
                ${card('user-clock', 'text-secondary', 'Fazla Mesai', `${overtimeKv}${teamHtml}`)}
            </div>
        </div>`;
    }

    /* ── TAB: Satış & Maliyet ────────────────────────────────────────── */

    function tabSalesCosts(data) {
        const s = data?.sales || {};
        const c = data?.costs || {};
        const created = pf(s.offers_created_in_range);
        const won = pf(s.offers_won_in_range);
        const winRate = created > 0 ? (won / created) * 100 : 0;

        return `
        <div class="row g-3">
            <div class="col-lg-4">
                ${card('bullseye', 'text-success', 'Satış Metrikleri', `
                    <dl class="ov-kv">
                        ${kvRow('Oluşturulan', num(s.offers_created_in_range))}
                        ${kvRow('Kazanılan', num(s.offers_won_in_range), 'text-success')}
                        ${kvRow('Kaybedilen', num(s.offers_lost_in_range), 'text-danger')}
                        ${kvRow('Kazanılan (EUR)', eur(s.total_won_value_eur))}
                        ${kvRow('Win Rate', `${winRate.toFixed(1)}%`)}
                    </dl>
                `)}
            </div>
            <div class="col-lg-4">
                ${chartCard('funnel-dollar', 'text-primary', 'Pipeline (Snapshot)', 'chart-pipeline', 'md')}
            </div>
            <div class="col-lg-4">
                ${chartCard('chart-pie', 'text-info', 'Maliyet Dağılımı', 'chart-costs', 'sm', `
                    <dl class="ov-kv mt-2">
                        ${kvRow('Satış toplam', eur(c.total_selling_price_eur))}
                        ${kvRow('Gerçek maliyet', eur(c.total_actual_cost_eur))}
                        ${kvRow('Ort. marj', `${num(c.avg_margin_pct, 1)}%`)}
                    </dl>
                `)}
            </div>
        </div>`;
    }

    /* ── TAB: Taşeron & Satınalma ────────────────────────────────────── */

    function tabSubProc(data) {
        const sub = data?.subcontracting || {};
        const pr = data?.procurement || {};

        return `
        <div class="row g-3">
            <div class="col-lg-7">
                ${chartCard('handshake', 'text-info', 'Taşeron Top 10', 'chart-subcontractor', 'md')}
            </div>
            <div class="col-lg-5">
                ${card('file-invoice-dollar', 'text-warning', 'Taşeron Hakediş', `
                    <dl class="ov-kv">
                        ${kvRow('Onaylanan (dönem)', num(sub.statements_approved_in_range))}
                        ${kvRow('Ödenen (dönem)', num(sub.statements_paid_in_range))}
                        ${kvRow('Onaylanan tutar', num(sub.total_approved_value, 2))}
                        ${kvRow('Ödenen tutar', num(sub.total_paid_value, 2))}
                        ${kvRow('Bekleyen hakediş', num(sub.pending_statements))}
                        ${kvRow('Faturalanmamış (EUR)', eur(sub.total_unbilled_accrual_eur))}
                    </dl>
                `)}
            </div>
            <div class="col-12">
                ${card('shopping-cart', 'text-success', 'Satınalma', `
                    <div class="ov-stat-grid ov-stat-grid--3" style="max-width:700px;">
                        ${stat('Talep (dönem)', num(pr.requests_submitted_in_range))}
                        ${stat('PO oluşturulan', num(pr.orders_created_in_range))}
                        ${stat('Sipariş (EUR)', eur(pr.total_ordered_value_eur))}
                        ${stat('Vadesi gelen', num(pr.payments_due_in_range))}
                        ${stat('Gecikmiş', `<span style="color:#dc3545">${num(pr.payments_overdue)}</span>`, 'snapshot')}
                        ${stat('Vade toplamı (EUR)', eur(pr.total_payments_due_eur))}
                    </div>
                `)}
            </div>
        </div>`;
    }

    /* ── TAB: Kalite ─────────────────────────────────────────────────── */

    function tabQuality(data) {
        const q = data?.quality || {};
        const total = pf(q.qc_reviews_in_range);
        const approved = pf(q.qc_reviews_approved);
        const passRate = total > 0 ? (approved / total) * 100 : 0;

        return `
        <div class="row g-3">
            <div class="col-lg-4">
                ${card('clipboard-check', 'text-primary', 'NCR & QC Özeti', `
                    <dl class="ov-kv">
                        ${kvRow('NCR açılan (dönem)', num(q.ncrs_opened_in_range))}
                        ${kvRow('NCR kapanan (dönem)', num(q.ncrs_closed_in_range))}
                        ${kvRow('NCR toplam açık', num(q.ncrs_open_total))}
                        ${kvRow('QC incelemeleri', num(q.qc_reviews_in_range))}
                        ${kvRow('QC onaylanan', num(q.qc_reviews_approved), 'text-success')}
                        ${kvRow('QC reddedilen', num(q.qc_reviews_rejected), 'text-danger')}
                        ${kvRow('QC Pass Rate', `${passRate.toFixed(1)}%`)}
                    </dl>
                    <div class="ov-hint">* NCR toplam açık: snapshot alandır.</div>
                `)}
            </div>
            <div class="col-lg-4">
                ${chartCard('circle-exclamation', 'text-danger', 'NCR Şiddet (Açık)', 'chart-ncr-severity', 'sm')}
            </div>
            <div class="col-lg-4">
                ${chartCard('chart-bar', 'text-warning', 'NCR Hata Türü (Dönem)', 'chart-ncr-defect', 'sm')}
            </div>
        </div>`;
    }

    /* ── CHARTS ───────────────────────────────────────────────────────── */

    function buildAllCharts(data) {
        killCharts();
        const pp = data?.previous_period || null;
        const base = chartDefaults();

        buildProdHoursChart(data, pp, base);
        buildPipelineChart(data, base);
        buildCostDonut(data, base);
        buildSubcontractorChart(data, base);
        buildNcrSeverityChart(data, base);
        buildNcrDefectChart(data, base);
    }

    function buildProdHoursChart(data, pp, base) {
        const m = data?.manufacturing || {};
        const el = document.getElementById('chart-prod-hours');
        if (!el) return;

        const labels = ['Kaynak', 'Talaşlı', 'CNC'];
        const cur = [pf(m.welding_hours), pf(m.machining_hours), pf(m.cnc_hours)];
        const ds = [{
            label: 'Bu dönem',
            data: cur,
            backgroundColor: 'rgba(13, 110, 253, 0.7)',
            borderRadius: 6,
            maxBarThickness: 50
        }];

        if (pp) {
            const prev = pp.manufacturing || {};
            ds.push({
                label: 'Önceki dönem',
                data: [pf(prev.welding_hours), pf(prev.machining_hours), pf(prev.cnc_hours)],
                backgroundColor: 'rgba(173, 181, 189, 0.5)',
                borderRadius: 6,
                maxBarThickness: 50
            });
        }

        charts.push(new Chart(el, {
            type: 'bar',
            data: { labels, datasets: ds },
            options: {
                ...base,
                scales: { x: scaleOpts(), y: scaleOpts() },
                plugins: { ...base.plugins, legend: { ...base.plugins.legend, position: 'top' } }
            }
        }));
    }

    function buildPipelineChart(data, base) {
        const pipe = data?.sales?.pipeline_by_stage || {};
        const el = document.getElementById('chart-pipeline');
        if (!el) return;

        const stageMap = {
            consultation: 'Danışmanlık',
            pricing: 'Fiyatlandırma',
            pending_approval: 'Onay Bekliyor',
            submitted_customer: 'Müşteriye İletildi'
        };
        const keys = Object.keys(pipe);
        if (keys.length === 0) return;

        charts.push(new Chart(el, {
            type: 'bar',
            data: {
                labels: keys.map(k => stageMap[k] || k),
                datasets: [{
                    label: 'Adet',
                    data: keys.map(k => Number(pipe[k] || 0)),
                    backgroundColor: 'rgba(25, 135, 84, 0.65)',
                    borderRadius: 6,
                    maxBarThickness: 40
                }]
            },
            options: {
                ...base,
                indexAxis: 'y',
                scales: {
                    x: scaleOpts({ ticks: { stepSize: 1 } }),
                    y: { ...scaleOpts(), grid: { display: false } }
                },
                plugins: { ...base.plugins, legend: { display: false } }
            }
        }));
    }

    function buildCostDonut(data, base) {
        const c = data?.costs || {};
        const el = document.getElementById('chart-costs');
        if (!el) return;

        const labor = pf(c.total_labor_cost_eur);
        const material = pf(c.total_material_cost_eur);
        const subc = pf(c.total_subcontractor_cost_eur);
        const total = pf(c.total_actual_cost_eur);
        const other = Math.max(0, total - labor - material - subc);

        charts.push(new Chart(el, {
            type: 'doughnut',
            data: {
                labels: ['İşçilik', 'Malzeme', 'Taşeron', 'Diğer'],
                datasets: [{
                    data: [labor, material, subc, other],
                    backgroundColor: ['#0d6efd', '#ffc107', '#6f42c1', '#adb5bd'],
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: {
                ...base,
                cutout: '55%',
                plugins: {
                    ...base.plugins,
                    legend: { ...base.plugins.legend, position: 'bottom' }
                }
            }
        }));
    }

    function buildSubcontractorChart(data, base) {
        const subs = Array.isArray(data?.subcontracting?.by_subcontractor) ? data.subcontracting.by_subcontractor : [];
        const el = document.getElementById('chart-subcontractor');
        if (!el || subs.length === 0) return;

        charts.push(new Chart(el, {
            type: 'bar',
            data: {
                labels: subs.map(x => x.name),
                datasets: [{
                    label: 'Onaylanan',
                    data: subs.map(x => pf(x.approved_total)),
                    backgroundColor: 'rgba(13, 202, 240, 0.65)',
                    borderRadius: 6,
                    maxBarThickness: 40
                }]
            },
            options: {
                ...base,
                scales: { x: { ...scaleOpts(), grid: { display: false } }, y: scaleOpts() },
                plugins: { ...base.plugins, legend: { display: false } }
            }
        }));
    }

    function buildNcrSeverityChart(data, base) {
        const sev = data?.quality?.ncrs_by_severity || {};
        const el = document.getElementById('chart-ncr-severity');
        if (!el) return;

        charts.push(new Chart(el, {
            type: 'doughnut',
            data: {
                labels: ['Kritik', 'Majör', 'Minör'],
                datasets: [{
                    data: [Number(sev.critical || 0), Number(sev.major || 0), Number(sev.minor || 0)],
                    backgroundColor: ['#dc3545', '#fd7e14', '#ffc107'],
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: {
                ...base,
                cutout: '50%',
                plugins: {
                    ...base.plugins,
                    legend: { ...base.plugins.legend, position: 'bottom' }
                }
            }
        }));
    }

    function buildNcrDefectChart(data, base) {
        const defect = data?.quality?.ncrs_by_defect_type || {};
        const el = document.getElementById('chart-ncr-defect');
        if (!el) return;

        const keys = Object.keys(defect);
        if (keys.length === 0) return;

        charts.push(new Chart(el, {
            type: 'bar',
            data: {
                labels: keys,
                datasets: [{
                    label: 'Adet',
                    data: keys.map(k => Number(defect[k] || 0)),
                    backgroundColor: 'rgba(220, 53, 69, 0.6)',
                    borderRadius: 6,
                    maxBarThickness: 35
                }]
            },
            options: {
                ...base,
                scales: { x: { ...scaleOpts(), grid: { display: false } }, y: scaleOpts({ ticks: { stepSize: 1 } }) },
                plugins: { ...base.plugins, legend: { display: false } }
            }
        }));
    }
});
