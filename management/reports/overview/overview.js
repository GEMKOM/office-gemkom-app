import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { showNotification } from '../../../components/notification/notification.js';
import { fetchOverviewSlice, mergeOverviewResponses } from '../../../apis/reports/overview.js';

let charts = [];

/** Cached GET /reports/overview/{slice}/ responses for the active filter set. */
const endpointCache = new Map();
/** Tracks which tab panes have been rendered for the current filter set (skip redundant refetch + repaint). */
const paneRendered = { jobs: false, prod: false, sales: false, sub: false, proc: false, qlt: false };

const TAB_ENDPOINTS = {
    jobs: ['job-orders'],
    prod: ['operations'],
    sales: ['sales'],
    sub: ['subcontracting'],
    proc: ['procurement'],
    qlt: ['operations']
};

const TARGET_TO_TAB = {
    '#pane-jobs': 'jobs',
    '#pane-prod': 'prod',
    '#pane-sales': 'sales',
    '#pane-sub': 'sub',
    '#pane-proc': 'proc',
    '#pane-qlt': 'qlt'
};

const PANE_IDS = {
    jobs: 'pane-jobs',
    prod: 'pane-prod',
    sales: 'pane-sales',
    sub: 'pane-sub',
    proc: 'pane-proc',
    qlt: 'pane-qlt'
};

let tabLoadSeq = 0;

/** Active overview tab key; preserved when filters change or the page is refreshed from the header. */
let activeOverviewTabKey = 'jobs';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    }
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

    function getOverviewParams() {
        const v = filters.getFilterValues();
        return {
            preset: v.preset || null,
            date_from: v.date_from || null,
            date_to: v.date_to || null,
            compare: v.compare === true
        };
    }

    function clearEndpointCache() {
        endpointCache.clear();
        paneRendered.jobs = false;
        paneRendered.prod = false;
        paneRendered.sales = false;
        paneRendered.sub = false;
        paneRendered.proc = false;
        paneRendered.qlt = false;
    }

    async function ensureEndpoint(name) {
        if (endpointCache.has(name)) return endpointCache.get(name);
        const data = await fetchOverviewSlice(name, getOverviewParams());
        endpointCache.set(name, data);
        return data;
    }

    function buildMergedFromCache() {
        return mergeOverviewResponses(
            endpointCache.get('operations'),
            endpointCache.get('subcontracting'),
            endpointCache.get('procurement'),
            endpointCache.get('sales'),
            endpointCache.get('job-orders')
        );
    }

    function pf(v) {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    }

    /** Handles dotted decimals, comma decimals, and thousands separators common in API strings. */
    function pfLocale(v) {
        if (v == null || v === '') return 0;
        const s = String(v).trim();
        if (/^\d{1,3}(?:\.\d{3})*,\d+$/.test(s)) {
            return pf(s.replace(/\./g, '').replace(',', '.'));
        }
        if (/^\d+,\d+$/.test(s)) {
            return pf(s.replace(',', '.'));
        }
        return pf(s);
    }

    function num(v, d = 0) {
        return pf(v).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    function numLocale(v, d = 0) {
        return pfLocale(v).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    /** Overtime block: support snake_case and camelCase; unwrap common team row shapes. */
    function overtimeFromOverview(data) {
        const o = data?.overtime;
        if (!o || typeof o !== 'object') return null;
        const teamsRaw = o.by_team ?? o.byTeam;
        const teams = Array.isArray(teamsRaw)
            ? teamsRaw.map(t => ({
                team: t.team ?? t.team_name ?? t.Team ?? '',
                hours: t.hours ?? t.Hours
            }))
            : [];
        return {
            requests_in_range: o.requests_in_range ?? o.requestsInRange,
            requests_approved_in_range: o.requests_approved_in_range ?? o.requestsApprovedInRange,
            total_approved_hours: o.total_approved_hours ?? o.totalApprovedHours,
            by_team: teams
        };
    }

    const OVERTIME_TEAM_LABELS = {
        manufacturing: 'Üretim',
        planning: 'Planlama',
        qualitycontrol: 'Kalite kontrol',
        quality_control: 'Kalite kontrol'
    };

    const JOB_ORDER_STATUS_LABELS = {
        draft: 'Taslak',
        active: 'Aktif',
        completed: 'Tamamlandı',
        on_hold: 'Beklemede'
    };

    /** API `sales_consults_by_department` anahtarları (slug) → Türkçe; bilinmeyen anahtar olduğu gibi gösterilir. */
    const SALES_CONSULT_DEPT_LABELS = {
        design: 'Tasarım',
        manufacturing: 'Üretim',
        planning: 'Planlama',
        procurement: 'Satın Alma',
        painting: 'Boya',
        logistics: 'Lojistik',
        maintenance: 'Bakım',
        finance: 'Finans',
        it: 'Bilgi İşlem',
        human_resources: 'İnsan Kaynakları',
        management: 'Yönetim',
        quality: 'Kalite',
        qualitycontrol: 'Kalite kontrol',
        quality_control: 'Kalite kontrol',
        welding: 'Kaynak',
        machining: 'Talaşlı',
        cnc: 'CNC',
        sales: 'Satış',
        marketing: 'Pazarlama'
    };

    function salesConsultDeptLabel(key) {
        if (key == null || key === '') return '';
        const raw = String(key).trim();
        const norm = raw.toLowerCase().replace(/\s+/g, '_');
        return SALES_CONSULT_DEPT_LABELS[norm] || SALES_CONSULT_DEPT_LABELS[raw] || raw;
    }

    function overtimeTeamLabel(key) {
        if (key == null || key === '') return '';
        const k = String(key).trim();
        return OVERTIME_TEAM_LABELS[k] || OVERTIME_TEAM_LABELS[k.toLowerCase()] || k;
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
                },
                datalabels: { display: false }
            }
        };
    }

    const DL_FONT = { weight: '700', size: 13, family: "'Segoe UI', system-ui, sans-serif" };

    /** Okunabilir çubuk etiketleri (taşmayı azaltır, küçük çubuklarda da görünür). */
    const DL_BAR_PILL = {
        color: '#1a1a1a',
        backgroundColor: 'rgba(255, 255, 255, 0.94)',
        borderColor: 'rgba(0, 0, 0, 0.1)',
        borderWidth: 1,
        borderRadius: 5,
        padding: 6
    };

    /** Yüzde + kısa tutar (halka grafikleri için). */
    function dlDoughnutPctAndEur(value, ctx) {
        const sum = ctx.dataset.data.reduce((a, b) => a + Number(b || 0), 0);
        if (!sum || !value) return '';
        const pct = Math.round((Number(value) / sum) * 100);
        return `${pct}%\n${eur(value)}`;
    }

    function dlDoughnutCountPct(value, ctx) {
        const sum = ctx.dataset.data.reduce((a, b) => a + Number(b || 0), 0);
        if (!sum || !value) return '';
        const pct = Math.round((Number(value) / sum) * 100);
        return `${pct}%\n${num(value, 0)}`;
    }

    const DL_DOUGHNUT = {
        display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex] || 0) > 0,
        anchor: 'center',
        align: 'center',
        font: { ...DL_FONT, size: 14 },
        color: '#1a1a1a',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: 'rgba(0, 0, 0, 0.1)',
        borderWidth: 1,
        borderRadius: 6,
        padding: 8,
        clip: false
    };

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

    function paneLoadingHtml() {
        return `<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm text-primary" role="status"></div><div class="small mt-2">Yükleniyor...</div></div>`;
    }

    function paneIdleHtml() {
        return `<div class="text-center py-5 text-muted small ov-pane-idle">Seçildiğinde yüklenecek...</div>`;
    }

    function attachOverviewTabListeners() {
        const nav = document.querySelector('#tabs-placeholder .overview-tabs .nav-tabs');
        if (!nav) return;
        nav.addEventListener('shown.bs.tab', (e) => {
            const btn = e.target?.closest?.('[data-bs-toggle="tab"]');
            if (!btn) return;
            const target = btn.getAttribute('data-bs-target');
            const tabKey = TARGET_TO_TAB[target];
            if (tabKey) {
                activeOverviewTabKey = tabKey;
                loadTabData(tabKey);
            }
        });
    }

    function renderPaneContent(tabKey, data) {
        const paneEl = document.getElementById(PANE_IDS[tabKey]);
        if (!paneEl) return;
        const renderers = {
            jobs: tabJobOrders,
            prod: tabProduction,
            sales: tabSalesCosts,
            sub: tabSubcontracting,
            proc: tabProcurement,
            qlt: tabQuality
        };
        paneEl.innerHTML = renderers[tabKey](data);
        requestAnimationFrame(() => {
            killCharts();
            buildAllCharts(data);
        });
    }

    async function loadTabData(tabKey) {
        const seq = ++tabLoadSeq;
        const eps = TAB_ENDPOINTS[tabKey];
        const needFetch = eps.filter(ep => !endpointCache.has(ep));

        if (needFetch.length === 0 && paneRendered[tabKey]) {
            return;
        }

        const paneEl = document.getElementById(PANE_IDS[tabKey]);
        if (!paneEl) return;

        if (needFetch.length > 0) {
            paneEl.innerHTML = paneLoadingHtml();
        }

        try {
            await Promise.all(eps.map(ep => ensureEndpoint(ep)));
            if (seq !== tabLoadSeq) return;
        } catch (err) {
            if (seq !== tabLoadSeq) return;
            console.error('Overview tab load error:', err);
            paneEl.innerHTML = `<div class="alert alert-danger mb-0"><i class="fas fa-triangle-exclamation me-2"></i>${String(err.message || err)}</div>`;
            showNotification(`Raporlar yüklenirken hata: ${err.message}`, 'error');
            kpis.showEmpty('Veri yüklenemedi');
            return;
        }

        if (seq !== tabLoadSeq) return;

        const merged = buildMergedFromCache();
        buildKpis(merged);
        renderPaneContent(tabKey, merged);
        paneRendered[tabKey] = true;
    }

    function buildTabsShell(activeKey = 'jobs') {
        const el = document.getElementById('tabs-placeholder');
        if (!el) return;

        const valid = Object.prototype.hasOwnProperty.call(TAB_ENDPOINTS, activeKey) ? activeKey : 'jobs';
        const tabDefs = [
            ['jobs', 'İş Emirleri'],
            ['prod', 'Üretim'],
            ['sales', 'Satış & Maliyet'],
            ['sub', 'Taşeron'],
            ['proc', 'Satınalma'],
            ['qlt', 'Kalite']
        ];
        const navHtml = tabDefs.map(([key, label]) => {
            const paneId = PANE_IDS[key];
            const active = key === valid ? ' active' : '';
            return `<li class="nav-item"><button class="nav-link${active}" data-bs-toggle="tab" data-bs-target="#${paneId}" type="button">${label}</button></li>`;
        }).join('');
        const panesHtml = tabDefs.map(([key]) => {
            const paneId = PANE_IDS[key];
            const active = key === valid ? ' show active' : '';
            const inner = key === valid ? paneLoadingHtml() : paneIdleHtml();
            return `<div class="tab-pane fade${active}" id="${paneId}">${inner}</div>`;
        }).join('');

        el.innerHTML = `
        <div class="dashboard-card compact overview-tabs">
            <div class="card-body">
                <ul class="nav nav-tabs" role="tablist">
                    ${navHtml}
                </ul>
                <div class="tab-content pt-3">
                    ${panesHtml}
                </div>
            </div>
        </div>`;

        attachOverviewTabListeners();
    }

    async function loadOverview() {
        try {
            kpis.showLoading();
            clearEndpointCache();
            killCharts();
            const tabKey = Object.prototype.hasOwnProperty.call(TAB_ENDPOINTS, activeOverviewTabKey)
                ? activeOverviewTabKey
                : 'jobs';
            buildTabsShell(tabKey);
            await loadTabData(tabKey);
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
        const hasSales = endpointCache.has('sales');
        const hasMarginData = hasSales || endpointCache.has('job-orders');
        const hasOpsData = endpointCache.has('operations');

        kpis.setCards([
            {
                id: 'won',
                title: `Kazanılan Teklif${cmp && hasSales ? ` ${trendArrow(data?.sales?.total_won_value_eur, pp?.sales?.total_won_value_eur)}` : ''}`,
                value: hasSales ? eur(data?.sales?.total_won_value_eur) : '—',
                icon: 'fas fa-handshake',
                color: 'success'
            },
            {
                id: 'margin',
                title: 'Ortalama Marj',
                value: hasMarginData ? `${num(data?.costs?.avg_margin_pct, 1)}%` : '—',
                icon: 'fas fa-percent',
                color: 'primary'
            },
            {
                id: 'hours',
                title: `Üretken Saat${cmp && hasOpsData ? ` ${trendArrow(data?.manufacturing?.total_productive_hours, pp?.manufacturing?.total_productive_hours)}` : ''}`,
                value: hasOpsData ? num(data?.manufacturing?.total_productive_hours, 1) : '—',
                icon: 'fas fa-clock',
                color: 'info'
            },
            {
                id: 'ncr',
                title: 'Açık NCR',
                value: hasOpsData ? num(data?.quality?.ncrs_open_total) : '—',
                icon: 'fas fa-triangle-exclamation',
                color: Number(data?.quality?.ncrs_by_severity?.critical || 0) > 0 ? 'danger' : 'warning'
            }
        ]);
    }

    /* ── TAB: İş Emirleri ─────────────────────────────────────────────── */

    function tabJobOrders(data) {
        const jo = data?.job_orders || {};
        const jc = data?.job_orders_costs || {};

        return `
        <div class="row g-3">
            <div class="col-12">
                ${card('clipboard-list', 'text-primary', 'Dönem özeti', `
                    <div class="ov-stat-grid ov-stat-grid--5">
                        ${stat('Aktif iş emirleri', num(jo.total_active), 'snapshot')}
                        ${stat('Dönemde tamamlanan', num(jo.total_completed_in_range), 'dönem')}
                        ${stat('Dönemde başlayan', num(jo.total_started_in_range), 'dönem')}
                        ${stat('Gecikmiş', `<span class="text-danger">${num(jo.overdue)}</span>`, 'snapshot')}
                        ${stat('Ort. tamamlanma', `${numLocale(jo.avg_completion_pct, 2)}%`, 'ortalama')}
                    </div>
                `)}
            </div>
            <div class="col-lg-6">
                ${chartCard('chart-bar', 'text-info', 'Duruma göre (snapshot)', 'chart-job-order-status', 'md')}
            </div>
            <div class="col-lg-6">
                ${chartCard('chart-pie', 'text-success', 'Maliyet dağılımı (iş emirleri)', 'chart-job-order-costs', 'md', `
                    <dl class="ov-kv mt-2">
                        ${kvRow('Maliyet verisi olan iş', num(jc.jobs_with_cost_data))}
                        ${kvRow('Satış fiyatı olan iş', num(jc.jobs_with_selling_price))}
                        ${kvRow('Satış toplam (EUR)', eur(jc.total_selling_price_eur))}
                        ${kvRow('Gerçek maliyet (EUR)', eur(jc.total_actual_cost_eur))}
                        ${kvRow('Ort. marj', `${numLocale(jc.avg_margin_pct, 2)}%`)}
                    </dl>
                `)}
            </div>
        </div>`;
    }

    /* ── TAB: Üretim ─────────────────────────────────────────────────── */

    function tabProduction(data) {
        const m = data?.manufacturing || {};
        const maint = data?.maintenance || {};
        const maintUsers = maint.maintenance_active_users ?? m.maintenance_active_users;
        const pp = data?.previous_period?.manufacturing;
        const cmp = data?.meta?.compare && pp;

        const ot = overtimeFromOverview(data) || {};
        const overtimeKv = `<dl class="ov-kv">
            ${kvRow('Talep (dönem)', num(ot.requests_in_range))}
            ${kvRow('Onaylanan', num(ot.requests_approved_in_range))}
            ${kvRow('Onaylanan saat', numLocale(ot.total_approved_hours, 1))}
        </dl>`;

        const teams = ot.by_team;
        const teamHtml = Array.isArray(teams) && teams.length > 0
            ? `<div class="ov-team-badges">${teams.map(t => `<span class="ov-team-badge">${overtimeTeamLabel(t.team)}: <strong>${numLocale(t.hours, 1)}</strong> saat</span>`).join('')}</div>`
            : '';

        return `
        <div class="row g-3">
            <div class="col-lg-6">
                ${chartCard('chart-bar', 'text-info', `Departman saatleri${cmp ? ' — karşılaştırmalı' : ''}`, 'chart-prod-hours', 'md')}
            </div>
            <div class="col-lg-6">
                ${card('clipboard-list', 'text-primary', 'Üretim özeti', `
                    <dl class="ov-kv mb-0">
                        ${kvRow('Üretilen tonaj (dönem)', `${numLocale(m.manufactured_tonnage_kg ?? m.manufacturedTonnageKg, 2)} kg`)}
                        ${kvRow('Üretken saat (dönem)', num(m.total_productive_hours, 1))}
                    </dl>
                `)}
            </div>
            <div class="col-lg-4">
                ${card('list-check', 'text-primary', 'Görev Durumu', `
                    <div class="ov-stat-grid ov-stat-grid--3">
                        ${stat('Talaşlı', `<span class="text-success">${num(m.machining_parts_completed)}</span> / ${num(m.machining_parts_remaining)}`, 'tamamlanan / kalan')}
                        ${stat('CNC', `<span class="text-success">${num(m.cnc_tasks_completed)}</span> / ${num(m.cnc_tasks_remaining)}`, 'tamamlanan / kalan')}
                        ${stat('Bakım', `<span class="text-success">${num(maint.faults_resolved_in_range)}</span> / ${num(maint.faults_open)}`, 'çözülen / kalan')}
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
                        ${stat('Bakım', num(maintUsers))}
                    </div>
                    <div class="mt-2">${stat('Toplam', num((m.welding_active_users || 0) + (m.machining_active_users || 0) + (m.cnc_active_users || 0) + (maintUsers || 0)))}</div>
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
        const created = pf(s.offers_created_in_range);
        const won = pf(s.offers_won_in_range);
        const winRate = created > 0 ? (won / created) * 100 : 0;

        const wonEur = pf(s.total_won_value_eur);
        const lostEur = pf(s.total_lost_value_eur);
        const pendingEur = pf(s.total_pending_value_eur);
        const eurSum = wonEur + lostEur + pendingEur;
        const eurWinSharePct = eurSum > 0 ? (wonEur / eurSum) * 100 : 0;

        return `
        <div class="row g-3 align-items-stretch">
            <div class="col-12">
                <div class="ov-section-label">Seçilen dönem</div>
            </div>
            <div class="col-lg-6 d-flex flex-column">
                ${chartCard('chart-column', 'text-primary', 'Teklif adetleri (karşılaştırma)', 'chart-sales-period-counts', 'md', `
                    <div class="ov-sales-footnote mt-2 pt-2 border-top">
                        <span class="text-muted small">Oluşturulan tekliflere göre kazanma oranı</span>
                        <strong class="ms-2 text-dark">${winRate.toFixed(1)}%</strong>
                    </div>
                `)}
            </div>
            <div class="col-lg-6 d-flex flex-column">
                ${chartCard('chart-bar', 'text-warning', 'Kazanılan, kaybedilen ve bekleyen tutarlar', 'chart-sales-period-eur', 'md', `
                    <div class="ov-hint mt-2 mb-0">Kazanılan ve kaybedilen: seçilen döneme göre (Euro). Bekleyen anlaşma değeri: güncel pipeline toplamı (tarih filtresinden bağımsız).</div>
                    <div class="ov-sales-footnote mt-2 pt-2 border-top">
                        <span class="text-muted small">Kazanılan ÷ (kazanılan + kaybedilen + bekleyen)</span>
                        <strong class="ms-2 text-dark">${eurWinSharePct.toFixed(1)}%</strong>
                    </div>
                `)}
            </div>
            <div class="col-12 d-flex flex-column">
                <div class="ov-section-label">Satış danışmanlığı (dönem)</div>
                ${chartCard('chart-bar', 'text-info', 'Departmanlara göre danışmanlık kayıtları', 'chart-sales-consults-dept', 'md', `
                    <div class="ov-hint mt-2 mb-0">Danışmanlık kayıtlarının oluşturulma tarihine göre.</div>
                `)}
            </div>
        </div>`;
    }

    /* ── TAB: Taşeron ────────────────────────────────────────────────── */

    function tabSubcontracting(data) {
        const sub = data?.subcontracting || {};

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
        </div>`;
    }

    /* ── TAB: Satınalma ──────────────────────────────────────────────── */

    function tabProcurement(data) {
        const pr = data?.procurement || {};

        return `
        <div class="row g-3">
            <div class="col-12">
                ${card('shopping-cart', 'text-success', 'Satınalma', `
                    <div class="ov-stat-grid ov-stat-grid--3" style="max-width:700px;">
                        ${stat('Talep (dönem)', num(pr.requests_in_range))}
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
        buildSalesPeriodCountsChart(data, base);
        buildSalesPeriodEurChart(data, base);
        buildSalesConsultsDeptChart(data, base);
        buildJobOrdersStatusChart(data, base);
        buildJobOrdersCostDonut(data, base);
        buildSubcontractorChart(data, base);
        buildNcrSeverityChart(data, base);
        buildNcrDefectChart(data, base);
    }

    function buildProdHoursChart(data, pp, base) {
        const m = data?.manufacturing || {};
        const maint = data?.maintenance || {};
        const maintHours = pf(maint.maintenance_hours ?? m.maintenance_hours);
        const el = document.getElementById('chart-prod-hours');
        if (!el) return;

        const labels = ['Kaynak', 'Talaşlı', 'CNC', 'Bakım'];
        const cur = [pf(m.welding_hours), pf(m.machining_hours), pf(m.cnc_hours), maintHours];
        const curColors = ['#6c757d', '#0d6efd', '#198754', '#fd7e14'];
        const prevColors = ['#adb5bd', '#9ec5fe', '#a3cfbb', '#ffc107'];

        const datasets = [{
            label: 'Bu dönem',
            data: cur,
            backgroundColor: curColors,
            borderRadius: 6,
            maxBarThickness: 44
        }];

        if (pp) {
            const prev = pp.manufacturing || {};
            const prevMaint = pp.maintenance || {};
            const prevMaintHours = pf(prevMaint.maintenance_hours ?? prev.maintenance_hours);
            datasets.push({
                label: 'Önceki dönem',
                data: [pf(prev.welding_hours), pf(prev.machining_hours), pf(prev.cnc_hours), prevMaintHours],
                backgroundColor: prevColors,
                borderRadius: 6,
                maxBarThickness: 44
            });
        }

        charts.push(new Chart(el, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                ...base,
                layout: { padding: { top: 8, right: 52, bottom: 8, left: 8 } },
                indexAxis: 'y',
                scales: {
                    x: scaleOpts(),
                    y: { ...scaleOpts(), grid: { display: false } }
                },
                plugins: {
                    ...base.plugins,
                    legend: {
                        ...base.plugins.legend,
                        position: 'top',
                        display: datasets.length > 1
                    },
                    datalabels: {
                        ...DL_BAR_PILL,
                        font: DL_FONT,
                        display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex] || 0) !== 0,
                        anchor: 'end',
                        align: 'end',
                        offset: 6,
                        clip: false,
                        clamp: true,
                        formatter: (v) => num(v, 1)
                    }
                }
            }
        }));
    }

    function buildSalesPeriodCountsChart(data, base) {
        const s = data?.sales || {};
        const el = document.getElementById('chart-sales-period-counts');
        if (!el) return;

        const labels = ['Oluşturulan', 'Kazanılan', 'Kaybedilen'];
        const values = [
            pf(s.offers_created_in_range),
            pf(s.offers_won_in_range),
            pf(s.offers_lost_in_range)
        ];

        charts.push(new Chart(el, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Teklif sayısı',
                    data: values,
                    backgroundColor: ['#2563EB', '#059669', '#B91C1C'],
                    borderRadius: 6,
                    maxBarThickness: 56
                }]
            },
            options: {
                ...base,
                layout: { padding: { top: 16, right: 8, bottom: 8, left: 8 } },
                scales: {
                    x: { ...scaleOpts(), grid: { display: false } },
                    y: scaleOpts({ beginAtZero: true, ticks: { stepSize: 1 } })
                },
                plugins: {
                    ...base.plugins,
                    legend: { display: false },
                    datalabels: {
                        ...DL_BAR_PILL,
                        font: DL_FONT,
                        display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex] || 0) !== 0,
                        anchor: 'end',
                        align: 'top',
                        offset: 4,
                        clip: false,
                        clamp: true,
                        formatter: (v) => num(v, 0)
                    }
                }
            }
        }));
    }

    function buildSalesPeriodEurChart(data, base) {
        const s = data?.sales || {};
        const el = document.getElementById('chart-sales-period-eur');
        if (!el) return;

        const won = pf(s.total_won_value_eur);
        const lost = pf(s.total_lost_value_eur);
        const pending = pf(s.total_pending_value_eur);

        charts.push(new Chart(el, {
            type: 'bar',
            data: {
                labels: ['Kazanılan tutar', 'Kaybedilen tutar', 'Bekleyen anlaşma değeri'],
                datasets: [{
                    label: 'Tutar',
                    data: [won, lost, pending],
                    backgroundColor: ['#047857', '#B91C1C', '#1e40af'],
                    borderRadius: 6,
                    maxBarThickness: 48
                }]
            },
            options: {
                ...base,
                layout: { padding: { top: 8, right: 72, bottom: 8, left: 8 } },
                indexAxis: 'y',
                scales: {
                    x: scaleOpts({ beginAtZero: true }),
                    y: { ...scaleOpts(), grid: { display: false } }
                },
                plugins: {
                    ...base.plugins,
                    legend: { display: false },
                    tooltip: {
                        ...base.plugins.tooltip,
                        callbacks: {
                            label(ctx) {
                                return ` ${eur(ctx.raw)}`;
                            }
                        }
                    },
                    datalabels: {
                        ...DL_BAR_PILL,
                        font: { ...DL_FONT, size: 12 },
                        display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex] || 0) !== 0,
                        anchor: 'end',
                        align: 'end',
                        offset: 8,
                        clip: false,
                        clamp: true,
                        formatter: (v) => eur(v)
                    }
                }
            }
        }));
    }

    function buildSalesConsultsDeptChart(data, base) {
        const byDept = data?.sales?.sales_consults_by_department || {};
        const el = document.getElementById('chart-sales-consults-dept');
        if (!el) return;

        const keys = Object.keys(byDept).sort((a, b) => pf(byDept[b]) - pf(byDept[a]));
        if (keys.length === 0) return;

        charts.push(new Chart(el, {
            type: 'bar',
            data: {
                labels: keys.map(k => salesConsultDeptLabel(k)),
                datasets: [{
                    label: 'Danışmanlık sayısı',
                    data: keys.map(k => Number(byDept[k] || 0)),
                    backgroundColor: '#475569',
                    borderRadius: 6,
                    maxBarThickness: 44
                }]
            },
            options: {
                ...base,
                layout: { padding: { top: 8, right: 52, bottom: 8, left: 8 } },
                indexAxis: 'y',
                scales: {
                    x: scaleOpts({ beginAtZero: true, ticks: { stepSize: 1 } }),
                    y: { ...scaleOpts(), grid: { display: false } }
                },
                plugins: {
                    ...base.plugins,
                    legend: { display: false },
                    datalabels: {
                        ...DL_BAR_PILL,
                        font: DL_FONT,
                        display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex] || 0) !== 0,
                        anchor: 'end',
                        align: 'end',
                        offset: 6,
                        clip: false,
                        clamp: true,
                        formatter: (v) => num(v, 0)
                    }
                }
            }
        }));
    }

    function buildJobOrdersStatusChart(data, base) {
        const byStatus = data?.job_orders?.by_status || {};
        const el = document.getElementById('chart-job-order-status');
        if (!el) return;

        const keys = Object.keys(byStatus);
        if (keys.length === 0) return;

        const colors = ['#6c757d', '#0d6efd', '#198754', '#fd7e14'];
        charts.push(new Chart(el, {
            type: 'bar',
            data: {
                labels: keys.map(k => JOB_ORDER_STATUS_LABELS[k] || k),
                datasets: [{
                    label: 'Adet',
                    data: keys.map(k => Number(byStatus[k] || 0)),
                    backgroundColor: keys.map((_, i) => colors[i % colors.length]),
                    borderRadius: 6,
                    maxBarThickness: 44
                }]
            },
            options: {
                ...base,
                layout: { padding: { top: 8, right: 52, bottom: 8, left: 8 } },
                indexAxis: 'y',
                scales: {
                    x: scaleOpts({ ticks: { stepSize: 1 } }),
                    y: { ...scaleOpts(), grid: { display: false } }
                },
                plugins: {
                    ...base.plugins,
                    legend: { display: false },
                    datalabels: {
                        ...DL_BAR_PILL,
                        font: DL_FONT,
                        display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex] || 0) !== 0,
                        anchor: 'end',
                        align: 'end',
                        offset: 6,
                        clip: false,
                        clamp: true,
                        formatter: (v) => num(v, 0)
                    }
                }
            }
        }));
    }

    function buildJobOrdersCostDonut(data, base) {
        const c = data?.job_orders_costs || {};
        const el = document.getElementById('chart-job-order-costs');
        if (!el) return;

        const labor = pf(c.total_labor_cost_eur);
        const material = pf(c.total_material_cost_eur);
        const subc = pf(c.total_subcontractor_cost_eur);
        const total = pf(c.total_actual_cost_eur);
        const other = Math.max(0, total - labor - material - subc);
        if (total <= 0 && labor + material + subc + other <= 0) return;

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
                layout: { padding: 18 },
                cutout: '55%',
                plugins: {
                    ...base.plugins,
                    legend: { ...base.plugins.legend, position: 'bottom' },
                    datalabels: {
                        ...DL_DOUGHNUT,
                        formatter: (v, ctx) => dlDoughnutPctAndEur(v, ctx)
                    }
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
                layout: { padding: { top: 18, right: 8, bottom: 8, left: 8 } },
                scales: { x: { ...scaleOpts(), grid: { display: false } }, y: scaleOpts() },
                plugins: {
                    ...base.plugins,
                    legend: { display: false },
                    datalabels: {
                        ...DL_BAR_PILL,
                        font: DL_FONT,
                        display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex] || 0) !== 0,
                        anchor: 'end',
                        align: 'top',
                        offset: 4,
                        clip: false,
                        clamp: true,
                        formatter: (v) => num(v, 0)
                    }
                }
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
                layout: { padding: 18 },
                cutout: '50%',
                plugins: {
                    ...base.plugins,
                    legend: { ...base.plugins.legend, position: 'bottom' },
                    datalabels: {
                        ...DL_DOUGHNUT,
                        formatter: (v, ctx) => dlDoughnutCountPct(v, ctx)
                    }
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
                layout: { padding: { top: 18, right: 8, bottom: 8, left: 8 } },
                scales: { x: { ...scaleOpts(), grid: { display: false } }, y: scaleOpts({ ticks: { stepSize: 1 } }) },
                plugins: {
                    ...base.plugins,
                    legend: { display: false },
                    datalabels: {
                        ...DL_BAR_PILL,
                        font: DL_FONT,
                        display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex] || 0) !== 0,
                        anchor: 'end',
                        align: 'top',
                        offset: 4,
                        clip: false,
                        clamp: true,
                        formatter: (v) => num(v, 0)
                    }
                }
            }
        }));
    }

    await loadOverview();
});
