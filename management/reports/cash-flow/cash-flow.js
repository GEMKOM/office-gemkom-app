import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../components/table/table.js';
import { getPaymentForecastReport } from '../../../apis/procurement/reports.js';
import { getRevenueReport } from '../../../apis/sales/reports.js';
import { showNotification } from '../../../components/notification/notification.js';
import { initCashFlowDrilldown, openCashFlowDrilldown } from './cash-flow-drilldown.js';

let mainChart = null;
let filtersComponent = null;
let kpiCards = null;
let monthlyTable = null;
let dbsTable = null;
let lastMergedTotals = null;

const EUR = 'EUR';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();

    const elBanner = document.getElementById('alert-banner');

    new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Nakit Akış Tablosu',
        subtitle: 'Satış girişleri ile satınalma çıkışlarının birleşik görünümü',
        icon: 'money-bill-wave',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/management/reports',
        onRefreshClick: () => loadReport()
    });

    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Dönem Filtreleri',
        applyButtonText: 'Uygula',
        onApply: () => loadReport(),
        onClear: () => {
            applyPreset('month');
            filtersComponent.setFilterValues({ preset: 'month' });
            loadReport();
        },
        onFilterChange: handleFilterChange
    });

    filtersComponent
        .addSelectFilter({
            id: 'preset',
            label: 'Dönem',
            colSize: 3,
            value: 'month',
            options: [
                { value: 'month', label: 'Bu Ay' },
                { value: 'quarter', label: 'Bu Çeyrek' },
                { value: 'year', label: 'Bu Yıl' },
                { value: 'last12', label: 'Son 12 Ay' },
                { value: 'all', label: 'Tümü' }
            ]
        })
        .addDateFilter({ id: 'created-gte', label: 'Başlangıç', colSize: 3 })
        .addDateFilter({ id: 'created-lte', label: 'Bitiş', colSize: 3 });

    kpiCards = new StatisticsCards('kpi-cards-placeholder', {
        compact: true,
        responsive: true,
        itemsPerRow: 6,
        cards: buildEmptyKpiCards()
    });

    monthlyTable = new TableComponent('table-placeholder', {
        title: 'Aylık Nakit Akış Özeti',
        icon: 'fas fa-table',
        iconColor: 'text-secondary',
        loading: true,
        pagination: false,
        sortable: true,
        small: true,
        skeleton: true,
        emptyMessage: 'Bu dönem için veri yok.',
        emptyIcon: 'fas fa-table',
        rowBackgroundColor: (row) => {
            if (row._netNegative) return 'rgba(220, 53, 69, 0.08)';
            if (row._crossesZero) return 'rgba(245, 158, 11, 0.12)';
            return null;
        },
        footer: ({ columns, hasActions }) => buildMonthlyFooter(columns, hasActions),
        actionColumnWidth: '52px',
        actions: [
            {
                key: 'detail',
                icon: 'fas fa-magnifying-glass',
                class: 'btn-outline-primary btn-sm',
                title: 'Ay detayı',
                onClick: (row) => openCashFlowDrilldown(row.month, row.monthLabel)
            }
        ],
        onRowClick: (row) => openCashFlowDrilldown(row.month, row.monthLabel),
        columns: [
            {
                field: 'monthLabel',
                label: 'Ay',
                sortable: true,
                type: 'text'
            },
            {
                field: 'inflow',
                label: 'Giriş',
                sortable: true,
                type: 'number',
                headerClass: 'text-end',
                cellClass: 'text-end',
                formatter: (v) => `<span class="cf-in">${fmtMoney(v)}</span>`
            },
            {
                field: 'outflow',
                label: 'Çıkış',
                sortable: true,
                type: 'number',
                headerClass: 'text-end',
                cellClass: 'text-end',
                formatter: (v) => `<span class="cf-out">${fmtMoney(v)}</span>`
            },
            {
                field: 'net',
                label: 'Net',
                sortable: true,
                type: 'number',
                headerClass: 'text-end',
                cellClass: 'text-end',
                formatter: (v, row) =>
                    `<span class="${row.net >= 0 ? 'cf-in' : 'cf-out'}">${fmtMoneySigned(v)}</span>`
            },
            {
                field: 'cumulative',
                label: 'Küm. Net',
                sortable: true,
                type: 'number',
                headerClass: 'text-end',
                cellClass: 'text-end',
                formatter: (v) =>
                    `<span class="fw-bold ${v >= 0 ? '' : 'cf-out'}">${fmtMoneySigned(v)}</span>`
            },
            {
                field: 'paid',
                label: 'Ödenen',
                sortable: true,
                type: 'number',
                headerClass: 'text-end',
                cellClass: 'text-end',
                formatter: (v) => `<span class="text-muted">${fmtMoney(v)}</span>`
            },
            {
                field: 'awaiting',
                label: 'Bekleyen',
                sortable: true,
                type: 'number',
                headerClass: 'text-end',
                cellClass: 'text-end',
                formatter: (v) =>
                    `<span class="${num(v) > 0 ? 'cf-await' : 'text-muted'}">${fmtMoney(v)}</span>`
            },
            {
                field: 'po_count',
                label: 'PO',
                sortable: true,
                type: 'number',
                headerClass: 'text-end',
                cellClass: 'text-end',
                formatter: (v) => `<span class="text-muted">${v ?? 0}</span>`
            },
            {
                field: 'offer_count',
                label: 'Teklif',
                sortable: true,
                type: 'number',
                headerClass: 'text-end',
                cellClass: 'text-end',
                formatter: (v) => `<span class="text-muted">${v ?? 0}</span>`
            }
        ]
    });

    dbsTable = new TableComponent('dbs-table-placeholder', {
        title: 'DBS Limit Kullanımı',
        icon: 'fas fa-university',
        iconColor: 'text-primary',
        loading: true,
        pagination: true,
        itemsPerPage: 10,
        serverSidePagination: false,
        small: true,
        skeleton: true,
        emptyMessage: 'DBS kaydı yok.',
        emptyIcon: 'fas fa-university',
        columns: [
            { field: 'supplier_name', label: 'Tedarikçi', sortable: true, type: 'text' },
            { field: 'dbs_bank', label: 'Banka', sortable: true, type: 'text' },
            { field: 'dbs_currency', label: 'PB', sortable: true, type: 'text' },
            {
                field: 'dbs_used',
                label: 'Kullanılan',
                sortable: true,
                type: 'number',
                formatter: (v, row) => fmtNative(v, row.dbs_currency)
            },
            {
                field: 'dbs_used_eur',
                label: 'Kullanılan (EUR)',
                sortable: true,
                type: 'number',
                formatter: (v) => fmtMoney(v)
            },
            {
                field: 'dbs_limit_eur',
                label: 'Limit (EUR)',
                sortable: true,
                type: 'number',
                formatter: (v) => (num(v) ? fmtMoney(v) : '—')
            },
            {
                field: 'dbs_available_eur',
                label: 'Kalan (EUR)',
                sortable: true,
                type: 'number',
                formatter: (v) =>
                    v != null && v !== '' ? `<span class="text-success fw-semibold">${fmtMoney(v)}</span>` : '—'
            },
            {
                field: 'dbs_expiry_date',
                label: 'Vade',
                sortable: true,
                type: 'text',
                formatter: (v) => formatExpiryCell(v)
            },
            {
                field: '_util',
                label: 'Doluluk',
                sortable: false,
                formatter: (_, row) => renderUtilBar(row)
            }
        ]
    });

    initCashFlowDrilldown();

    applyPreset('month');
    filtersComponent.setFilterValues({ preset: 'month' });
    await loadReport();

    function handleFilterChange(id) {
        const v = filtersComponent.getFilterValues();
        if (id === 'preset' && v.preset) {
            applyPreset(v.preset);
            return;
        }
        if ((id === 'created-gte' || id === 'created-lte') && (v['created-gte'] || v['created-lte'])) {
            filtersComponent.setFilterValues({ preset: '' });
        }
    }

    function applyPreset(key) {
        const today = new Date();
        const y = today.getFullYear();
        const m = today.getMonth();
        const pad = (n) => String(n).padStart(2, '0');
        const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        let from = '';
        let to = '';
        if (key === 'month') {
            from = fmt(new Date(y, m, 1));
            to = fmt(new Date(y, m + 1, 0));
        } else if (key === 'quarter') {
            const q = Math.floor(m / 3) * 3;
            from = fmt(new Date(y, q, 1));
            to = fmt(new Date(y, q + 3, 0));
        } else if (key === 'year') {
            from = `${y}-01-01`;
            to = `${y}-12-31`;
        } else if (key === 'last12') {
            from = fmt(new Date(y, m - 11, 1));
            to = fmt(today);
        }

        filtersComponent.setFilterValues({ 'created-gte': from, 'created-lte': to });
    }

    function apiFilters() {
        const v = filtersComponent.getFilterValues();
        const f = {};
        if (v['created-gte']) f.created_gte = v['created-gte'];
        if (v['created-lte']) f.created_lte = v['created-lte'];
        return f;
    }

    function showBanner(messages, variant = 'warning') {
        if (!messages.length) {
            elBanner.classList.add('d-none');
            elBanner.innerHTML = '';
            return;
        }
        elBanner.className = `alert alert-${variant} mb-3`;
        elBanner.innerHTML = messages.map((m) => `<div>${m}</div>`).join('');
        elBanner.classList.remove('d-none');
    }

    async function loadReport() {
        showBanner([]);
        kpiCards.showLoading();
        monthlyTable.setLoading(true);
        dbsTable.setLoading(true);

        const filters = apiFilters();
        const [outRes, inRes] = await Promise.allSettled([
            getPaymentForecastReport(filters),
            getRevenueReport(filters)
        ]);

        const warnings = [];
        let outflow = null;
        let inflow = null;

        if (outRes.status === 'fulfilled') outflow = outRes.value;
        else warnings.push('Çıkış verisi kullanılamıyor — yalnızca giriş gösteriliyor.');

        if (inRes.status === 'fulfilled') inflow = inRes.value;
        else warnings.push('Giriş verisi kullanılamıyor — yalnızca çıkış gösteriliyor.');

        if (!outflow && !inflow) {
            showBanner(['Nakit akış verisi yüklenemedi.'], 'danger');
            kpiCards.showEmpty('Veri yüklenemedi');
            monthlyTable.setLoading(false);
            monthlyTable.updateData([]);
            dbsTable.setLoading(false);
            dbsTable.updateData([]);
            destroyChart();
            renderChartShell(true);
            renderUndated(null, null);
            return;
        }

        showBanner(warnings);
        const merged = buildMergedRows(outflow, inflow);
        lastMergedTotals = merged.totals;

        renderKpis(outflow, inflow);
        renderChart(merged.rows);
        monthlyTable.setLoading(false);
        monthlyTable.updateData(merged.rows);
        dbsTable.setLoading(false);
        dbsTable.updateData(enrichDbsRows(outflow?.dbs_summary?.suppliers || []));
        renderUndated(outflow, inflow);
    }

    function buildEmptyKpiCards() {
        return [
            { id: 'kpi-in', title: 'Toplam Giriş', value: '—', icon: 'fas fa-arrow-trend-down', color: 'success' },
            { id: 'kpi-out', title: 'Toplam Çıkış', value: '—', icon: 'fas fa-arrow-trend-up', color: 'danger' },
            { id: 'kpi-net', title: 'Net Pozisyon', value: '—', icon: 'fas fa-scale-balanced', color: 'primary' },
            { id: 'kpi-paid', title: 'Ödenen (çıkış)', value: '—', icon: 'fas fa-check-circle', color: 'secondary' },
            { id: 'kpi-await', title: 'Bekleyen (çıkış)', value: '—', icon: 'fas fa-clock', color: 'warning' },
            { id: 'kpi-dbs', title: 'DBS Kullanılan', value: '—', icon: 'fas fa-university', color: 'info' }
        ];
    }

    function renderKpis(outflow, inflow) {
        const totalIn = pickNum(inflow?.kpis, 'total_inflow_eur', 'total_revenue_eur');
        const totalOut = pickNum(outflow?.kpis, 'total_outflow_eur', 'total_spent_eur');
        const net = totalIn - totalOut;
        const paid = hasAmount(outflow?.kpis, 'total_procurement_paid_eur', 'total_paid_eur')
            ? pickNum(outflow?.kpis, 'total_procurement_paid_eur', 'total_paid_eur')
            : sumSeries(outflow?.series, 'procurement_paid_eur', 'paid_eur');
        const awaiting = hasAmount(
            outflow?.kpis,
            'total_procurement_awaiting_eur',
            'total_awaiting_eur'
        )
            ? pickNum(outflow?.kpis, 'total_procurement_awaiting_eur', 'total_awaiting_eur')
            : sumSeries(outflow?.series, 'procurement_awaiting_eur', 'awaiting_eur');
        const dbsUsed = num(outflow?.dbs_summary?.total_dbs_used_eur);

        const momIn = inflow?.kpis?.mom_percent;
        const momOut = outflow?.kpis?.mom_percent;

        kpiCards.setCards([
            {
                id: 'kpi-in',
                title: 'Toplam Giriş',
                value: fmtMoney(totalIn),
                icon: 'fas fa-arrow-trend-down',
                color: 'success',
                tooltip: momIn != null ? `MoM: ${fmtPct(momIn)}` : null
            },
            {
                id: 'kpi-out',
                title: 'Toplam Çıkış',
                value: fmtMoney(totalOut),
                icon: 'fas fa-arrow-trend-up',
                color: 'danger',
                tooltip: momOut != null ? `MoM: ${fmtPct(momOut)}` : null
            },
            {
                id: 'kpi-net',
                title: 'Net Pozisyon',
                value: fmtMoneySigned(net),
                icon: 'fas fa-scale-balanced',
                color: net >= 0 ? 'success' : 'danger'
            },
            {
                id: 'kpi-paid',
                title: 'Ödenen (çıkış)',
                value: fmtMoney(paid),
                icon: 'fas fa-check-circle',
                color: 'secondary'
            },
            {
                id: 'kpi-await',
                title: 'Bekleyen (çıkış)',
                value: fmtMoney(awaiting),
                icon: 'fas fa-clock',
                color: 'warning'
            },
            {
                id: 'kpi-dbs',
                title: 'DBS Kullanılan',
                value: fmtMoney(dbsUsed),
                icon: 'fas fa-university',
                color: 'info'
            }
        ]);
    }

    function buildMonthlyFooter(columns, hasActions = false) {
        if (!lastMergedTotals || !Array.isArray(columns)) return '';
        const t = lastMergedTotals;

        const footTd = (col, innerHtml) => {
            const cls = [col.cellClass, 'fw-bold'].filter(Boolean).join(' ');
            const classAttr = cls ? ` class="${cls}"` : '';
            const widthAttr = col.width
                ? ` style="width: ${col.width}; min-width: ${col.width};"`
                : '';
            return `<td${classAttr}${widthAttr}>${innerHtml}</td>`;
        };

        const cellHtml = {
            monthLabel: 'Toplam',
            inflow: `<span class="cf-in">${fmtMoney(t.inflow)}</span>`,
            outflow: `<span class="cf-out">${fmtMoney(t.outflow)}</span>`,
            net: `<span class="${t.net >= 0 ? 'cf-in' : 'cf-out'}">${fmtMoneySigned(t.net)}</span>`,
            cumulative: `<span class="${t.cumulative >= 0 ? '' : 'cf-out'}">${fmtMoneySigned(t.cumulative)}</span>`,
            paid: `<span class="text-muted">${fmtMoney(t.paid)}</span>`,
            awaiting: `<span class="text-muted">${fmtMoney(t.awaiting)}</span>`,
            po_count: `<span class="text-muted">${t.po_count}</span>`,
            offer_count: `<span class="text-muted">${t.offer_count}</span>`
        };

        return `<tr class="table-secondary cf-monthly-footer">${columns
            .map((col) => footTd(col, cellHtml[col.field] ?? ''))
            .join('')}${hasActions ? '<td class="action-column"></td>' : ''}</tr>`;
    }

    function renderChartShell(emptyOnly = false) {
        const host = document.getElementById('charts-placeholder');
        host.innerHTML = `
            <div class="dashboard-card cf-chart-wrap">
                <div class="card-header">
                    <h6 class="card-title mb-0">
                        <i class="fas fa-chart-column me-2 text-primary"></i>
                        Giriş / Çıkış ve kümülatif net
                    </h6>
                </div>
                <div class="card-body position-relative cf-chart-body">
                    <canvas id="cashflow-chart"></canvas>
                    <div id="chart-empty" class="cf-empty ${emptyOnly ? '' : 'd-none'}">
                        <i class="fas fa-chart-area d-block mb-2"></i>
                        <p class="mb-0">Bu dönem için nakit akış verisi yok.</p>
                    </div>
                </div>
            </div>`;
    }

    function destroyChart() {
        if (mainChart) {
            try { mainChart.destroy(); } catch (_) { /* noop */ }
            mainChart = null;
        }
    }

    function renderChart(rows) {
        renderChartShell(false);
        const canvas = document.getElementById('cashflow-chart');
        const empty = document.getElementById('chart-empty');
        destroyChart();

        if (!rows.length) {
            canvas?.classList.add('d-none');
            empty?.classList.remove('d-none');
            return;
        }
        canvas?.classList.remove('d-none');
        empty?.classList.add('d-none');

        const labels = rows.map((r) => r.monthLabel);
        mainChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Giriş',
                        data: rows.map((r) => r.inflow),
                        backgroundColor: 'rgba(13, 110, 253, 0.75)',
                        borderColor: '#0d6efd',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        type: 'bar',
                        label: 'Çıkış',
                        data: rows.map((r) => r.outflow),
                        backgroundColor: 'rgba(220, 53, 69, 0.75)',
                        borderColor: '#dc3545',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: 'Kümülatif Net',
                        data: rows.map((r) => r.cumulative),
                        borderColor: '#212529',
                        borderWidth: 2.5,
                        tension: 0.25,
                        yAxisID: 'y1',
                        pointRadius: 4,
                        segment: {
                            borderColor: (ctx) => (ctx.p1.parsed.y < 0 ? '#dc3545' : '#212529')
                        }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const row = rows[ctx.dataIndex];
                                if (ctx.dataset.label === 'Kümülatif Net') {
                                    return `Küm. Net: ${fmtMoney(ctx.parsed.y)}`;
                                }
                                if (ctx.dataset.label === 'Giriş') {
                                    return [
                                        `Giriş: ${fmtMoney(ctx.parsed.y)}`,
                                        `Çıkış: ${fmtMoney(row.outflow)}`,
                                        `Net: ${fmtMoneySigned(row.net)}`,
                                        `Küm. Net: ${fmtMoneySigned(row.cumulative)}`
                                    ];
                                }
                                return `${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        position: 'left',
                        beginAtZero: true,
                        ticks: { callback: (v) => fmtMoneyShort(v) }
                    },
                    y1: {
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: { callback: (v) => fmtMoneyShort(v) }
                    }
                }
            },
            plugins: [{
                id: 'zeroLine',
                afterDraw(chart) {
                    const { ctx, chartArea, scales } = chart;
                    const y1 = scales.y1;
                    if (!y1) return;
                    const y0 = y1.getPixelForValue(0);
                    if (y0 < chartArea.top || y0 > chartArea.bottom) return;
                    ctx.save();
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = '#6c757d';
                    ctx.beginPath();
                    ctx.moveTo(chartArea.left, y0);
                    ctx.lineTo(chartArea.right, y0);
                    ctx.stroke();
                    ctx.restore();
                }
            }]
        });
    }

    function renderUndated(outflow, inflow) {
        renderUndatedCard(
            'undated-out-card',
            'Tarihsiz Çıkış',
            outflow?.undated_schedules,
            ['total_outflow_eur', 'total_eur'],
            'po_count',
            'PO',
            'Vadesi atanmamış ödeme planları — aylık görünüme dahil değil.'
        );
        renderUndatedCard(
            'undated-in-card',
            'Tarihsiz Giriş',
            inflow?.undated,
            ['total_inflow_eur', 'revenue_eur'],
            'offer_count',
            'teklif',
            'Tarihsiz gelir kalemleri — aylık görünüme dahil değil.'
        );
    }

    function renderUndatedCard(elId, title, data, amountKeys, countKey, unit, hint) {
        const el = document.getElementById(elId);
        const keys = Array.isArray(amountKeys) ? amountKeys : [amountKeys];
        const amount = pickNum(data, ...keys);
        const count = data?.[countKey] ?? 0;
        const warn = amount > 0;
        el.innerHTML = `
            <div class="dashboard-card compact h-100 cf-undated-panel">
                <div class="card-header py-2">
                    <h6 class="card-title mb-0">
                        ${warn ? '<i class="fas fa-triangle-exclamation text-warning me-2"></i>' : ''}
                        ${title}
                    </h6>
                </div>
                <div class="card-body py-3">
                    <p class="cf-undated-amount mb-1">${fmtMoney(amount)}
                        <span class="text-muted fw-normal fs-6"> / ${count} ${unit}</span>
                    </p>
                    <p class="small text-muted mb-0">${hint}</p>
                </div>
            </div>`;
    }

    function enrichDbsRows(suppliers) {
        return suppliers.map((s) => {
            const usedEur = num(s.dbs_used_eur);
            const limitEur = num(s.dbs_limit_eur);
            return {
                ...s,
                _util: limitEur > 0 ? (usedEur / limitEur) * 100 : 0
            };
        });
    }

    function renderUtilBar(row) {
        const pct = num(row._util);
        let barCls = 'bg-primary';
        if (pct > 90) barCls = 'bg-danger';
        else if (pct > 70) barCls = 'bg-warning';
        return `
            <div class="progress cf-util-bar" style="height:8px">
                <div class="progress-bar ${barCls}" style="width:${Math.min(100, pct)}%"></div>
            </div>
            <small class="text-muted">${pct.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}%</small>`;
    }

    function formatExpiryCell(value) {
        if (!value) return '—';
        const expiry = new Date(value);
        const days = (expiry - new Date()) / 86400000;
        const cls = days < 0 || days <= 30 ? 'text-danger fw-semibold' : '';
        return `<span class="${cls}">${value}</span>`;
    }

    function buildMergedRows(outflow, inflow) {
        const outSeries = outflow?.series || [];
        const inSeries = inflow?.series || [];
        const months = new Set();
        outSeries.forEach((r) => months.add(r.month));
        inSeries.forEach((r) => months.add(r.month));
        const sorted = [...months].filter(Boolean).sort();

        const outByMonth = Object.fromEntries(outSeries.map((r) => [r.month, r]));
        const inByMonth = Object.fromEntries(inSeries.map((r) => [r.month, r]));

        let cumulative = 0;
        let prevCum = 0;
        let zeroCrossMarked = false;

        const rows = sorted.map((month) => {
            const o = outByMonth[month] || {};
            const i = inByMonth[month] || {};
            const inflowAmt = pickNum(i, 'total_inflow_eur', 'revenue_eur');
            const outflowAmt = pickNum(o, 'total_outflow_eur', 'total_spent_eur');
            const net = inflowAmt - outflowAmt;
            prevCum = cumulative;
            cumulative += net;
            const crossed =
                (prevCum >= 0 && cumulative < 0) || (prevCum < 0 && cumulative > 0);
            const crossesZero = !zeroCrossMarked && crossed;
            if (crossesZero) zeroCrossMarked = true;

            return {
                month,
                monthLabel: fmtMonth(month),
                inflow: inflowAmt,
                outflow: outflowAmt,
                net,
                cumulative,
                paid: pickNum(o, 'procurement_paid_eur', 'paid_eur'),
                awaiting: pickNum(o, 'procurement_awaiting_eur', 'awaiting_eur'),
                po_count: o.po_count ?? 0,
                offer_count: i.offer_count ?? 0,
                _netNegative: net < 0,
                _crossesZero: crossesZero
            };
        });

        const totals = rows.reduce(
            (acc, r) => {
                acc.inflow += r.inflow;
                acc.outflow += r.outflow;
                acc.net += r.net;
                acc.paid += r.paid;
                acc.awaiting += r.awaiting;
                acc.po_count += Number(r.po_count) || 0;
                acc.offer_count += Number(r.offer_count) || 0;
                return acc;
            },
            { inflow: 0, outflow: 0, net: 0, paid: 0, awaiting: 0, po_count: 0, offer_count: 0 }
        );
        totals.cumulative = rows.length ? rows[rows.length - 1].cumulative : 0;

        return { rows, totals };
    }

    function num(v) {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    }

    /** First defined numeric field on obj (supports API renames). */
    function pickNum(obj, ...keys) {
        if (!obj) return 0;
        for (const key of keys) {
            const v = obj[key];
            if (v != null && v !== '') return num(v);
        }
        return 0;
    }

    function hasAmount(obj, ...keys) {
        if (!obj) return false;
        return keys.some((key) => obj[key] != null && obj[key] !== '');
    }

    function sumSeries(series, ...keys) {
        return (series || []).reduce((acc, row) => acc + pickNum(row, ...keys), 0);
    }

    function fmtMoney(v) {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: EUR,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num(v));
    }

    function fmtMoneySigned(v) {
        const n = num(v);
        if (n < 0) return `−${fmtMoney(Math.abs(n))}`;
        return fmtMoney(n);
    }

    function fmtMoneyShort(v) {
        const n = num(v);
        if (Math.abs(n) >= 1e6) return `€${(n / 1e6).toFixed(1)}M`;
        if (Math.abs(n) >= 1e3) return `€${(n / 1e3).toFixed(0)}K`;
        return fmtMoney(n);
    }

    function fmtNative(v, currency) {
        if (v == null || v === '') return '—';
        const c = currency || EUR;
        try {
            return new Intl.NumberFormat('tr-TR', {
                style: 'currency',
                currency: c,
                minimumFractionDigits: 2
            }).format(num(v));
        } catch {
            return `${num(v).toLocaleString('tr-TR')} ${c}`;
        }
    }

    function fmtPct(v) {
        const n = num(v);
        const sign = n > 0 ? '+' : '';
        return `${sign}${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
    }

    function fmtMonth(ym) {
        if (!ym) return '—';
        const [y, m] = String(ym).split('-');
        return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('tr-TR', {
            month: 'long',
            year: 'numeric'
        });
    }
});
