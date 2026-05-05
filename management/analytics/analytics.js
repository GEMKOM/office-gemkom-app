import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { showNotification } from '../../components/notification/notification.js';
import { getCostTable, getCostChildren, getProcurementLines } from '../../apis/projects/cost.js';
import { getCombinedJobCosts } from '../../apis/planning/reports.js';
import { getMachiningJobEntries } from '../../apis/machining/reports.js';
import { getWeldingJobCostDetail } from '../../apis/welding/reports.js';
import { fetchSubcontractorCostBreakdown } from '../../apis/subcontracting/subcontractors.js';
import { listCustomers } from '../../apis/projects/customers.js';

/* ── state ─────────────────────────────────────────────────────────── */
let chart = null;
let costTable = null;
let summaryCards = null;
let filtersComponent = null;
let currentPage = 1;
let pageSize = 20;
let currentOrdering = '-date';

/**
 * Table column `field` → API `ordering` param (cost_table backend).
 * Only listed keys differ from the column field name.
 */
const COLUMN_FIELD_TO_ORDERING = {
    actual_total_cost: 'actual_cost',
    total_weight_kg: 'weight',
    target_completion_date: 'date'
};

/** All valid `ordering` query values (Sıralama dropdown + column-sort sync). */
const ORDERING_SELECT_VALUES = new Set([
    'job_no', '-job_no', 'title', '-title', 'weight', '-weight',
    'actual_cost', '-actual_cost', 'price_per_kg', '-price_per_kg',
    'selling_price', '-selling_price', 'margin_eur', '-margin_eur',
    'margin_pct', '-margin_pct', 'completion_pct', '-completion_pct',
    'date', '-date'
]);
let expandedRows = new Set();
let costTableRoots = [];
let childrenCache = new Map();
let costBreakdownVisible = false;
const DETAIL_FIELDS = new Set(['labor_cost', 'material_cost', 'subcontractor_cost', 'paint_cost', 'qc_cost', 'shipping_cost', 'general_expenses_cost']);

/* ── format helpers ────────────────────────────────────────────────── */

function formatMoney(value) {
    if (value == null || value === '') return '<span class="text-muted">-</span>';
    const n = typeof value === 'string' ? parseFloat(value) : value;
    if (Number.isNaN(n)) return '<span class="text-muted">-</span>';
    return `€${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toNumber(value) {
    if (value == null || value === '') return 0;
    const n = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(n) ? n : 0;
}

function formatNumber(value, fd = 2) {
    if (value == null || value === '') return '<span class="text-muted">-</span>';
    const n = typeof value === 'string' ? parseFloat(value) : value;
    if (!Number.isFinite(n)) return '<span class="text-muted">-</span>';
    return n.toLocaleString('tr-TR', { minimumFractionDigits: fd, maximumFractionDigits: fd });
}

function formatPct(value) {
    if (value == null || value === '') return '<span class="text-muted">-</span>';
    const n = typeof value === 'string' ? parseFloat(value) : value;
    if (Number.isNaN(n)) return '<span class="text-muted">-</span>';
    return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatDate(value) {
    if (value == null || value === '') return '<span class="text-muted">-</span>';
    try { return new Date(value).toLocaleDateString('tr-TR'); } catch { return '<span class="text-muted">-</span>'; }
}

function eur(v) {
    const n = Number.parseFloat(v);
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR' }).format(Number.isFinite(n) ? n : 0);
}

function pctStr(v, d = 1) {
    const n = Number.parseFloat(v);
    return `${(Number.isFinite(n) ? n : 0).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
}

/* ── badges & chips ────────────────────────────────────────────────── */

function statusBadge(status) {
    const labels = { draft: 'Taslak', active: 'Aktif', on_hold: 'Beklemede', completed: 'Tamamlandı', cancelled: 'İptal Edildi' };
    const label = labels[status] || status || '–';
    const cls = status === 'active' ? 'status-green' : status === 'completed' ? 'status-blue' : status === 'on_hold' ? 'status-yellow' : status === 'cancelled' ? 'status-red' : 'status-grey';
    return `<span class="status-badge ${cls}">${label}</span>`;
}

function marginChip(marginPct, sellingPrice) {
    if (marginPct == null || marginPct === '') return '<span class="text-muted">-</span>';
    const sp = Number.parseFloat(sellingPrice);
    if (!Number.isFinite(sp) || sp <= 0) return '<span class="margin-chip margin-amber">—</span>';
    const m = Number.parseFloat(marginPct);
    const mm = Number.isFinite(m) ? m : 0;
    const cls = mm > 15 ? 'margin-green' : (mm >= 5 ? 'margin-amber' : 'margin-red');
    return `<span class="margin-chip ${cls}">${pctStr(mm, 1)}</span>`;
}

function completionBar(v) {
    const n = Number.parseFloat(v);
    const safe = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
    return `<div class="d-flex align-items-center gap-2"><div class="completion-bar flex-grow-1"><span style="width:${safe}%;"></span></div><span class="text-muted small" style="min-width:44px;">${pctStr(safe, 0)}</span></div>`;
}

/* ── tree hierarchy ────────────────────────────────────────────────── */

function mergeExpandedChildren(roots, level = 0) {
    const merged = [];
    if (!Array.isArray(roots)) return merged;
    roots.forEach(row => {
        merged.push({ ...row, hierarchy_level: level });
        if (expandedRows.has(row.job_no)) {
            merged.push(...mergeExpandedChildren(childrenCache.get(row.job_no) || [], level + 1));
        }
    });
    return merged;
}

function updateTableDataOnly() {
    if (!costTable) return;
    const list = mergeExpandedChildren(costTableRoots);
    costTable.updateData(list, costTable.options.totalItems, costTable.options.currentPage);
    setTimeout(() => { setupExpandListeners(); afterTableRender(); }, 50);
}

let expandHandler = null;
function setupExpandListeners() {
    if (!costTable?.container) return;
    if (expandHandler) costTable.container.removeEventListener('click', expandHandler);
    expandHandler = async (e) => {
        const btn = e.target.closest('.expand-toggle-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const jobNo = btn.getAttribute('data-job-no');
        if (!jobNo) return;
        if (expandedRows.has(jobNo)) { expandedRows.delete(jobNo); updateTableDataOnly(); return; }
        try {
            const icon = btn.querySelector('i');
            if (icon) icon.className = 'fas fa-spinner fa-spin';
            const children = await getCostChildren(jobNo);
            childrenCache.set(jobNo, children);
            expandedRows.add(jobNo);
            updateTableDataOnly();
        } catch (err) {
            console.error('Error fetching children for', jobNo, err);
            showNotification('Alt işler yüklenirken hata oluştu', 'error');
            const icon = btn.querySelector('i');
            if (icon) icon.className = 'fas fa-plus';
        }
    };
    costTable.container.addEventListener('click', expandHandler);
}

/* ── expand column formatter (tree lines) ──────────────────────────── */

function expandColumnFormatter(value, row) {
    const hasChildren = row.has_children === true || (childrenCache.get(row.job_no) || []).length > 0;
    const isExpanded = expandedRows.has(row.job_no);
    const level = row.hierarchy_level ?? 0;
    const LW = 20, LT = 2, LC = '#cbd5e0', BS = 24;
    const btnLeft = level * LW;
    let lines = '';
    if (level > 0) {
        for (let i = 0; i < level; i++) {
            const ll = i * LW + (LW / 2) - (LT / 2);
            if (i < level - 1) {
                lines += `<div style="position:absolute;left:${ll}px;top:0;bottom:0;width:${LT}px;background:${LC};"></div>`;
            } else {
                lines += `<div style="position:absolute;left:${ll}px;top:0;height:50%;width:${LT}px;background:${LC};"></div>`;
                lines += `<div style="position:absolute;left:${ll}px;top:50%;width:${LW / 2}px;height:${LT}px;background:${LC};transform:translateY(-50%);"></div>`;
            }
        }
    }
    let btn = '';
    if (hasChildren) {
        const icon = isExpanded ? 'fa-minus' : 'fa-plus';
        const cls = isExpanded ? 'expanded' : 'collapsed';
        btn = `<button type="button" class="btn btn-sm expand-toggle-btn ${cls}" data-job-no="${row.job_no}" style="position:absolute;left:${btnLeft}px;top:50%;transform:translateY(-50%);width:${BS}px;height:${BS}px;padding:0;border-radius:4px;border:1.5px solid #0d6efd;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;z-index:1;" title="${isExpanded ? 'Daralt' : 'Genişlet'}"><i class="fas ${icon}" style="font-size:10px;"></i></button>`;
    }
    return `<div style="position:relative;width:100%;height:40px;min-height:40px;">${lines}${btn}</div>`;
}

/* ── job_no column formatter (linked badge) ────────────────────────── */

function jobNoFormatter(v, row) {
    if (!v) return '-';
    const level = row.hierarchy_level ?? 0;
    const url = `/projects/project-tracking/?job_no=${encodeURIComponent(v)}`;
    if (level > 0) {
        return `<a href="${url}" class="text-decoration-none" style="font-weight:600;color:#6c757d;font-family:'Courier New',monospace;font-size:0.9rem;background:rgba(108,117,125,0.1);padding:0.25rem 0.5rem;border-radius:4px;border:1px solid rgba(108,117,125,0.2);display:inline-block;">${v}</a>`;
    }
    return `<a href="${url}" class="text-decoration-none" style="font-weight:700;color:#0d6efd;font-family:'Courier New',monospace;font-size:1rem;background:rgba(13,110,253,0.1);padding:0.25rem 0.5rem;border-radius:4px;border:1px solid rgba(13,110,253,0.2);display:inline-block;">${v}</a>`;
}

/* ── cost cell formatters (with detail buttons) ────────────────────── */

function laborCellFormatter(v, row) {
    const labor = toNumber(v);
    const overhead = toNumber(row.employee_overhead_cost);
    const total = labor + overhead;
    const jobNo = (row.job_no || '').replace(/"/g, '&quot;');
    const btn = total > 0 ? ` <button class="btn btn-sm btn-link p-0 ms-1" onclick="window.showJobDetails&&window.showJobDetails('${jobNo}')" title="İşçilik Detayları" style="text-decoration:none;white-space:nowrap;"><i class="fas fa-info-circle text-primary"></i></button>` : '';
    return `<span style="white-space:nowrap;">${formatMoney(total)}${btn}</span>`;
}

function materialCellFormatter(v, row) {
    const cost = toNumber(v);
    const jobNo = (row.job_no || '').replace(/"/g, '&quot;');
    const btn = cost > 0 ? ` <button class="btn btn-sm btn-link p-0 ms-1" onclick="window.showMaterialDetails&&window.showMaterialDetails('${jobNo}')" title="Malzeme Detayları" style="text-decoration:none;white-space:nowrap;"><i class="fas fa-info-circle text-primary"></i></button>` : '';
    return `<span style="white-space:nowrap;">${formatMoney(v)}${btn}</span>`;
}

function subcontractorCellFormatter(v, row) {
    const cost = toNumber(v);
    const jobNo = (row.job_no || '').replace(/"/g, '&quot;');
    const btn = cost > 0 ? ` <button class="btn btn-sm btn-link p-0 ms-1" onclick="window.showSubcontractorDetails&&window.showSubcontractorDetails('${jobNo}')" title="Taşeron Detayları" style="text-decoration:none;white-space:nowrap;"><i class="fas fa-info-circle text-primary"></i></button>` : '';
    return `<span style="white-space:nowrap;">${formatMoney(v)}${btn}</span>`;
}

function paintCellFormatter(v, row) {
    return formatMoney(toNumber(v) + toNumber(row.paint_material_cost));
}

function generalExpensesCellFormatter(v, row) {
    const cost = formatMoney(v);
    const rate = row.general_expenses_rate;
    if (rate != null && rate !== '') {
        const r = typeof rate === 'string' ? parseFloat(rate) : rate;
        if (!isNaN(r)) return `<span style="white-space:nowrap;">${cost} <small class="text-muted">(${parseFloat(r.toString())})</small></span>`;
    }
    return cost;
}

/* ── summary footer builder ────────────────────────────────────────── */

function buildFooter({ displayedData, columns, hasActions }) {
    const rows = Array.isArray(displayedData) ? displayedData : [];
    const s = {
        laborWithTax: 0, material: 0, subcontractor: 0, paintWithMaterial: 0,
        qc: 0, shipping: 0, generalExpenses: 0, weightKg: 0,
        actualTotalCost: 0, sellingPrice: 0, marginEur: 0
    };
    let grSum = 0, grCount = 0;

    rows.forEach(r => {
        s.laborWithTax += toNumber(r.labor_cost) + toNumber(r.employee_overhead_cost);
        s.material += toNumber(r.material_cost);
        s.subcontractor += toNumber(r.subcontractor_cost);
        s.paintWithMaterial += toNumber(r.paint_cost) + toNumber(r.paint_material_cost);
        s.qc += toNumber(r.qc_cost);
        s.shipping += toNumber(r.shipping_cost);
        s.generalExpenses += toNumber(r.general_expenses_cost);
        s.weightKg += toNumber(r.total_weight_kg);
        s.actualTotalCost += toNumber(r.actual_total_cost);
        s.sellingPrice += toNumber(r.selling_price);
        s.marginEur += toNumber(r.margin_eur);
        const rate = r.general_expenses_rate;
        if (rate != null && rate !== '') { const rv = toNumber(rate); if (Number.isFinite(rv) && rv !== 0) { grSum += rv; grCount++; } }
    });

    // Footer "Kg Fiyatı" should be average (not weighted by kg).
    const ppkgList = rows
        .map(r => toNumber(r.price_per_kg))
        .filter(v => Number.isFinite(v) && v > 0);
    const ppkg = ppkgList.length > 0 ? (ppkgList.reduce((a, b) => a + b, 0) / ppkgList.length) : null;
    const mpct = s.sellingPrice > 0 ? (s.marginEur / s.sellingPrice) * 100 : null;
    const grAvg = grCount > 0 ? grSum / grCount : null;

    const vm = new Map();
    vm.set('_expand', '');
    vm.set('job_no', `<span class="fw-bold">Toplam / Ortalama</span><div class="text-muted small">${rows.length} satır</div>`);
    vm.set('title', '<span class="text-muted">-</span>');
    vm.set('customer_name', '<span class="text-muted">-</span>');
    vm.set('status', '<span class="text-muted">-</span>');
    vm.set('labor_cost', `<span class="fw-bold">${formatMoney(s.laborWithTax)}</span>`);
    vm.set('material_cost', `<span class="fw-bold">${formatMoney(s.material)}</span>`);
    vm.set('subcontractor_cost', `<span class="fw-bold">${formatMoney(s.subcontractor)}</span>`);
    vm.set('paint_cost', `<span class="fw-bold">${formatMoney(s.paintWithMaterial)}</span>`);
    vm.set('qc_cost', `<span class="fw-bold">${formatMoney(s.qc)}</span>`);
    vm.set('shipping_cost', `<span class="fw-bold">${formatMoney(s.shipping)}</span>`);
    vm.set('general_expenses_cost', `<span class="fw-bold" style="white-space:nowrap;">${formatMoney(s.generalExpenses)}${grAvg != null ? ` <small class="text-muted">(${formatNumber(grAvg, 2)})</small>` : ''}</span>`);
    vm.set('total_weight_kg', `<span class="fw-bold">${formatNumber(s.weightKg, 2)}</span>`);
    vm.set('price_per_kg', ppkg != null ? `<span class="fw-bold text-primary">€${formatNumber(ppkg, 2)}</span>` : '<span class="text-muted">-</span>');
    vm.set('actual_total_cost', `<span class="fw-bold">${formatMoney(s.actualTotalCost)}</span>`);
    vm.set('selling_price', `<span class="fw-bold">${formatMoney(s.sellingPrice)}</span>`);
    vm.set('margin_eur', `<span class="fw-bold">${formatMoney(s.marginEur)}</span>`);
    vm.set('margin_pct', mpct != null ? `<span class="fw-bold">${formatPct(mpct)}</span>` : '<span class="text-muted">-</span>');
    vm.set('target_completion_date', '<span class="text-muted">-</span>');

    const tds = (columns || []).map(col => {
        const content = vm.has(col.field) ? vm.get(col.field) : '<span class="text-muted">-</span>';
        const w = col.width ? ` style="width:${col.width};min-width:${col.width};"` : '';
        return `<td class="cost-table-summary-cell"${w}>${content}</td>`;
    });
    if (hasActions) tds.push('<td class="cost-table-summary-cell"></td>');
    return `<tr class="cost-table-summary-row">${tds.join('')}</tr>`;
}

/* ── chart helpers ─────────────────────────────────────────────────── */

function destroyChart() {
    if (chart) { try { chart.destroy(); } catch (_) { /* noop */ } chart = null; }
}

function updateChart(results) {
    destroyChart();
    const rows = [...(results || [])].sort((a, b) => toNumber(b.actual_total_cost) - toNumber(a.actual_total_cost)).slice(0, 15);
    const ctx = document.getElementById('cost-stack-chart');
    if (!ctx || rows.length === 0) return;

    const labels = rows.map(r => r.job_no);
    const labor = rows.map(r => toNumber(r.labor_cost) + toNumber(r.employee_overhead_cost));
    const material = rows.map(r => toNumber(r.material_cost));
    const subc = rows.map(r => toNumber(r.subcontractor_cost));
    const other = rows.map((r, i) => Math.max(0, toNumber(r.actual_total_cost) - labor[i] - material[i] - subc[i]));

    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'İşçilik', data: labor, backgroundColor: 'rgba(13, 202, 240, 0.60)', borderRadius: 4, maxBarThickness: 40 },
                { label: 'Malzeme', data: material, backgroundColor: 'rgba(255, 193, 7, 0.60)', borderRadius: 4, maxBarThickness: 40 },
                { label: 'Taşeron', data: subc, backgroundColor: 'rgba(111, 66, 193, 0.60)', borderRadius: 4, maxBarThickness: 40 },
                { label: 'Diğer', data: other, backgroundColor: 'rgba(173, 181, 189, 0.55)', borderRadius: 4, maxBarThickness: 40 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#495057', usePointStyle: true, padding: 14 } },
                tooltip: { backgroundColor: '#343a40', cornerRadius: 8, padding: 10 }
            },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { color: '#6c757d', font: { size: 11 } } },
                y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#6c757d', font: { size: 11 } } }
            }
        }
    });
}

function updateSummary(results) {
    const rows = Array.isArray(results) ? results : [];
    const withPrice = rows.filter(r => toNumber(r.selling_price) > 0);
    const avgMargin = withPrice.length ? withPrice.reduce((s, r) => s + toNumber(r.margin_pct), 0) / withPrice.length : 0;
    const totalRevenue = rows.reduce((s, r) => s + toNumber(r.selling_price), 0);
    const totalCost = rows.reduce((s, r) => s + toNumber(r.actual_total_cost), 0);

    summaryCards.setCards([
        { id: 'count', title: 'İş Sayısı', value: String(rows.length), icon: 'fas fa-briefcase', color: 'primary' },
        { id: 'avgMargin', title: 'Ortalama Marj %', value: pctStr(avgMargin, 1), icon: 'fas fa-percent', color: 'success' },
        { id: 'revenue', title: 'Toplam Satış (EUR)', value: eur(totalRevenue), icon: 'fas fa-euro-sign', color: 'info' },
        { id: 'cost', title: 'Toplam Maliyet (EUR)', value: eur(totalCost), icon: 'fas fa-receipt', color: 'danger' }
    ]);
}

/* ── DOMContentLoaded ──────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();

    new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Analitik',
        subtitle: 'İş bazlı kârlılık, maliyet dağılımı ve sıralama',
        icon: 'chart-pie',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/management',
        onRefreshClick: () => loadData()
    });

    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Analitik Filtreleri',
        onApply: () => {
            const f = filtersComponent.getFilterValues();
            if (f.ordering !== undefined && f.ordering !== '') currentOrdering = f.ordering;
            currentPage = 1;
            loadData();
        },
        onClear: () => { setDefaults(); currentPage = 1; loadData(); }
    });

    filtersComponent
        .addDropdownFilter({
            id: 'status',
            label: 'Durum',
            colSize: 3,
            multiple: true,
            placeholder: 'Tümü',
            options: [
                { value: 'active', label: 'Aktif' },
                { value: 'completed', label: 'Tamamlandı' },
                { value: 'on_hold', label: 'Beklemede' },
                { value: 'draft', label: 'Taslak' },
                { value: 'cancelled', label: 'İptal' }
            ]
        })
        .addTextFilter({ id: 'search', label: 'Ara (iş no / başlık)', placeholder: 'Örn: pump', colSize: 2 })
        .addDropdownFilter({
            id: 'customer',
            label: 'Müşteri',
            options: [],
            placeholder: 'Müşteri ara (en az 3 karakter)',
            colSize: 2,
            searchable: true,
            minSearchLength: 3,
            remoteSearchPlaceholder: 'En az 3 karakter yazın',
            remoteSearch: async (term) => {
                if (!term || term.length < 3) return [];
                const res = await listCustomers({ search: term.trim(), is_active: true, page_size: 50 });
                return (res.results || []).map(c => ({ value: String(c.id), text: c.name || c.code || `#${c.id}` }));
            }
        })
        .addSelectFilter({
            id: 'facility',
            label: 'Tesis',
            colSize: 2,
            value: '',
            placeholder: 'Tümü',
            options: [
                { value: 'rolling_mill', label: 'Haddehane' },
                { value: 'meltshop', label: 'Çelikhane' }
            ]
        })
        .addSelectFilter({
            id: 'ordering',
            label: 'Sıralama',
            colSize: 3,
            value: '-date',
            options: [
                { value: '-date', label: 'Hedef tarih (yeni önce)' },
                { value: 'date', label: 'Hedef tarih (eski önce)' },
                { value: 'job_no', label: 'İş No (A→Z)' },
                { value: '-job_no', label: 'İş No (Z→A)' },
                { value: 'title', label: 'Başlık (A→Z)' },
                { value: '-title', label: 'Başlık (Z→A)' },
                { value: 'weight', label: 'Ağırlık (artan)' },
                { value: '-weight', label: 'Ağırlık (azalan)' },
                { value: '-actual_cost', label: 'Toplam maliyet (azalan)' },
                { value: 'actual_cost', label: 'Toplam maliyet (artan)' },
                { value: 'price_per_kg', label: 'Kg fiyatı (artan)' },
                { value: '-price_per_kg', label: 'Kg fiyatı (azalan)' },
                { value: 'selling_price', label: 'Satış fiyatı (artan)' },
                { value: '-selling_price', label: 'Satış fiyatı (azalan)' },
                { value: 'margin_eur', label: 'Marj € (artan)' },
                { value: '-margin_eur', label: 'Marj € (azalan)' },
                { value: 'margin_pct', label: 'Marj % (artan)' },
                { value: '-margin_pct', label: 'Marj % (azalan)' },
                { value: 'completion_pct', label: 'Tamamlanma (artan)' },
                { value: '-completion_pct', label: 'Tamamlanma (azalan)' }
            ]
        });

    summaryCards = new StatisticsCards('summary-placeholder', { compact: true, responsive: true, cards: [] });

    document.getElementById('chart-placeholder').innerHTML = `
        <div class="dashboard-card compact">
            <div class="card-header"><h6 class="card-title mb-0"><i class="fas fa-layer-group text-info me-2"></i>Top 15 Maliyet (Stacked)</h6></div>
            <div class="card-body"><div class="analytics-chart-wrap"><canvas id="cost-stack-chart"></canvas></div></div>
        </div>`;

    costTable = new TableComponent('table-placeholder', {
        title: 'Maliyet Tablosu',
        icon: 'fas fa-calculator',
        iconColor: 'text-primary',
        columns: [
            { field: '_expand', label: '', sortable: false, width: '80px', formatter: expandColumnFormatter },
            { field: 'job_no', label: 'İş No', sortable: true, width: '160px', formatter: jobNoFormatter },
            { field: 'title', label: 'Başlık', sortable: true },
            {
                field: 'customer_name', label: 'Müşteri', sortable: false, width: '220px',
                formatter: (v, row) => {
                    const name = row.customer_short_name || row.customer_name || v;
                    return name ? `<span class="status-badge status-grey">${name}</span>` : '-';
                }
            },
            { field: 'status', label: 'Durum', sortable: false, formatter: v => statusBadge(v) },
            { field: 'total_weight_kg', label: 'Ağırlık (kg)', sortable: true, formatter: v => (v != null && v !== '' ? parseFloat(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '<span class="text-muted">-</span>') },
            /* detail columns — hidden by default, revealed via toggle */
            { field: 'labor_cost', label: 'İşçilik + Vergi', sortable: false, formatter: laborCellFormatter },
            { field: 'material_cost', label: 'Malzeme', sortable: false, formatter: materialCellFormatter },
            { field: 'subcontractor_cost', label: 'Taşeron', sortable: false, formatter: subcontractorCellFormatter },
            { field: 'paint_cost', label: 'Boya + Malzeme', sortable: false, formatter: paintCellFormatter },
            { field: 'qc_cost', label: 'KK', sortable: false, formatter: formatMoney },
            { field: 'shipping_cost', label: 'Sevkiyat', sortable: false, formatter: formatMoney },
            { field: 'general_expenses_cost', label: 'Genel Giderler', sortable: false, formatter: generalExpensesCellFormatter },
            /* end detail columns */
            { field: 'actual_total_cost', label: 'Toplam Maliyet', sortable: true, formatter: v => `<span class="fw-bold">${formatMoney(v)}</span>` },
            { field: 'price_per_kg', label: 'Kg Fiyatı', sortable: true, formatter: v => (v != null && v !== '' ? `<span class="fw-bold text-primary">€${parseFloat(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>` : '<span class="text-muted">-</span>') },
            {
                field: 'selling_price', label: 'Satış Fiyatı', sortable: true,
                formatter: (v, row) => (v != null && v !== '' ? formatMoney(v) + (row.selling_price_currency && row.selling_price_currency !== 'EUR' ? ` <small class="text-muted">${row.selling_price_currency}</small>` : '') : '<span class="text-muted">-</span>')
            },
            { field: 'margin_eur', label: 'Marj (€)', sortable: true, formatter: v => (v != null && v !== '' ? formatMoney(v) : '<span class="text-muted">-</span>') },
            { field: 'margin_pct', label: 'Marj %', sortable: true, formatter: (v, row) => marginChip(v, row?.selling_price) },
            { field: 'completion_pct', label: 'Tamamlanma', sortable: true, width: '160px', formatter: v => completionBar(v) },
            { field: 'target_completion_date', label: 'Hedef tarih', sortable: true, width: '120px', formatter: formatDate }
        ],
        data: [],
        footer: buildFooter,
        pagination: true,
        serverSidePagination: true,
        totalItems: 0,
        currentPage: 1,
        itemsPerPage: pageSize,
        onSort: (field, direction) => {
            const apiField = COLUMN_FIELD_TO_ORDERING[field] || field;
            currentOrdering = direction === 'asc' ? apiField : `-${apiField}`;
            currentPage = 1;
            if (filtersComponent && ORDERING_SELECT_VALUES.has(currentOrdering)) {
                filtersComponent.setFilterValues({ ordering: currentOrdering });
            }
            loadData();
        },
        onPageChange: (page) => { currentPage = page; loadData(); },
        onPageSizeChange: (newSize) => { pageSize = newSize; currentPage = 1; loadData(); },
        emptyMessage: 'Kayıt bulunamadı.',
        loading: true,
        skeleton: true,
        refreshable: true,
        onRefresh: () => loadData(),
        exportable: true,
        exportFileName: 'analitik-maliyet',
        stickyHeader: true
    });

    setDefaults();
    await loadData();
});

function setDefaults() {
    currentOrdering = '-date';
    filtersComponent.setFilterValues({ status: [], search: '', ordering: '-date', facility: '' });
}

/* ── cost breakdown toggle (hide/show detail columns) ──────────────── */

function applyCostBreakdownVisibility() {
    const table = costTable?.container?.querySelector('table');
    if (!table) return;
    const cols = costTable.options.columns;
    const detailIndices = [];
    cols.forEach((col, i) => { if (DETAIL_FIELDS.has(col.field)) detailIndices.push(i); });
    const display = costBreakdownVisible ? '' : 'none';

    // Also hide/show <col> elements so the table layout doesn't reserve width
    // for hidden detail columns (otherwise you can get a large empty area on the right).
    const colEls = table.querySelectorAll('colgroup col');
    detailIndices.forEach(i => { if (colEls[i]) colEls[i].style.display = display; });

    table.querySelectorAll('tr').forEach(tr => {
        const cells = tr.querySelectorAll('th, td');
        detailIndices.forEach(i => { if (cells[i]) cells[i].style.display = display; });
    });
    const icon = costTable.container.querySelector('.cost-detail-toggle');
    if (icon) {
        icon.className = `fas fa-${costBreakdownVisible ? 'compress-alt' : 'expand-alt'} cost-detail-toggle`;
        icon.title = costBreakdownVisible ? 'Maliyet detaylarını gizle' : 'Maliyet detaylarını göster';
    }
}

function injectCostToggleIcon() {
    const table = costTable?.container?.querySelector('table');
    if (!table) return;
    const cols = costTable.options.columns;
    const idx = cols.findIndex(c => c.field === 'actual_total_cost');
    if (idx === -1) return;
    const th = table.querySelectorAll('thead th')[idx];
    if (!th || th.querySelector('.cost-detail-toggle')) return;
    const icon = document.createElement('i');
    icon.className = `fas fa-${costBreakdownVisible ? 'compress-alt' : 'expand-alt'} cost-detail-toggle`;
    icon.style.cssText = 'cursor:pointer;color:#0d6efd;font-size:0.85rem;margin-left:6px;vertical-align:middle;';
    icon.title = costBreakdownVisible ? 'Maliyet detaylarını gizle' : 'Maliyet detaylarını göster';
    icon.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        costBreakdownVisible = !costBreakdownVisible;
        applyCostBreakdownVisibility();
    });
    th.appendChild(icon);
}

function afterTableRender() {
    injectCostToggleIcon();
    applyCostBreakdownVisibility();
}

async function loadData() {
    const filters = filtersComponent ? filtersComponent.getFilterValues() : {};
    const statusArr = Array.isArray(filters.status) ? filters.status : (filters.status ? [filters.status] : []);
    const statusIn = statusArr.join(',');
    const search = filters.search || '';
    const customer = filters.customer || '';
    const facilityRaw = filters.facility;
    const facility = (facilityRaw === 'rolling_mill' || facilityRaw === 'meltshop') ? facilityRaw : undefined;
    const ordering = currentOrdering;

    summaryCards.showLoading();
    costTable.setLoading(true);
    destroyChart();

    try {
        const res = await getCostTable({
            status__in: statusIn || undefined,
            search: search || undefined,
            customer: customer ? parseInt(customer, 10) : undefined,
            ordering,
            facility,
            page: currentPage,
            page_size: pageSize
        });

        const results = res.results || [];
        const count = res.count ?? 0;

        expandedRows.clear();
        childrenCache.clear();
        costTableRoots = results;
        const displayList = mergeExpandedChildren(costTableRoots);
        costTable.updateData(displayList, count, currentPage);
        costTable.options.itemsPerPage = pageSize;
        setTimeout(() => { setupExpandListeners(); afterTableRender(); }, 50);

        updateSummary(results);
        updateChart(results);
    } catch (err) {
        console.error('Analytics load error:', err);
        showNotification(`Analitik yüklenirken hata: ${err.message}`, 'error');
        summaryCards.showEmpty('Veri yüklenemedi');
        costTable.updateData([], 0, 1);
        destroyChart();
    } finally {
        costTable.setLoading(false);
    }
}

/* ══════════════════════════════════════════════════════════════════════
   DETAIL MODALS (exact copy from projects/cost-table)
   ══════════════════════════════════════════════════════════════════════ */

function ensureModalContainer(id) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
    return el;
}

function showError(msg) { console.error(msg); showNotification(msg, 'error'); }

/** Cost table row for a job (exact job_no) — used to align labor + vergi with Maliyet Tablosu. */
async function fetchCostTableRowForJob(jobNo) {
    if (!jobNo) return null;
    const res = await getCostTable({ search: jobNo, page_size: 100 });
    const rows = res.results || [];
    return rows.find(r => r.job_no === jobNo) || null;
}

/** Split job-level personel genel gideri (vergi) between machining and welding by net işçilik payı. */
function splitEmployeeOverheadByLaborCost(overhead, machBase, weldBase) {
    const o = toNumber(overhead);
    const m = toNumber(machBase);
    const w = toNumber(weldBase);
    const sum = m + w;
    if (sum <= 0) {
        if (m > 0) return { mach: o, weld: 0 };
        if (w > 0) return { mach: 0, weld: o };
        return { mach: 0, weld: 0 };
    }
    const mach = o * (m / sum);
    const weld = o - mach;
    return { mach, weld };
}

/* ── Job details (combined) ────────────────────────────────────────── */

async function showJobDetails(jobNo) {
    if (!jobNo) { showError('İş numarası bulunamadı.'); return; }
    try {
        ensureModalContainer('job-details-modal-container');
        const [data, costRow] = await Promise.all([
            getCombinedJobCosts({ job_no: jobNo }),
            fetchCostTableRowForJob(jobNo)
        ]);
        const results = data.results || [];
        if (results.length === 0) { showError('Maliyet verisi bulunamadı.'); return; }
        const jobData = results[0];
        const machining = jobData.machining || null;
        const welding = jobData.welding || null;
        const machBase = toNumber(machining?.total_cost);
        const weldBase = toNumber(welding?.total_cost);
        const laborNetFromTable = costRow ? toNumber(costRow.labor_cost) : 0;
        const overheadTotal = costRow ? toNumber(costRow.employee_overhead_cost) : 0;
        const laborNet = laborNetFromTable > 0 ? laborNetFromTable : (machBase + weldBase);
        const laborWithTax = laborNet + overheadTotal;
        const { mach: machTax, weld: weldTax } = splitEmployeeOverheadByLaborCost(overheadTotal, machBase, weldBase);
        const machWithTax = machBase + machTax;
        const weldWithTax = weldBase + weldTax;

        const combinedTotalHours = jobData.combined_total_hours || 0;
        const costPerHourWithTax = combinedTotalHours > 0 ? laborWithTax / combinedTotalHours : 0;

        const modal = new DisplayModal('job-details-modal-container', { title: `${jobNo} - İş Maliyeti Detayları`, icon: 'fas fa-calculator', size: 'xl', showEditButton: false });

        modal.addCustomSection({ title: 'Özet', icon: 'fas fa-chart-pie', iconColor: 'text-primary', customContent: summaryRow([
            { icon: 'money-bill-wave', cls: 'text-primary', value: `€${laborNet.toFixed(2)}`, label: 'İşçilik (vergi hariç)', colSize: 4 },
            { icon: 'percent', cls: 'text-primary', value: `€${overheadTotal.toFixed(2)}`, label: 'Vergi / genel gider', colSize: 4 },
            { icon: 'euro-sign', cls: 'text-primary', value: `€${laborWithTax.toFixed(2)}`, label: 'İşçilik + Vergi', colSize: 4 }
        ]) + summaryRow([
            { icon: 'clock', cls: 'text-primary', value: combinedTotalHours.toFixed(1), label: 'Toplam Saat', colSize: 6 },
            { icon: 'calculator', cls: 'text-primary', value: `€${costPerHourWithTax.toFixed(2)}`, label: 'Saat Başı (işçilik + vergi)', colSize: 6 }
        ]) });

        const machTotalH = machining ? (machining.hours.weekday_work || 0) + (machining.hours.after_hours || 0) + (machining.hours.sunday || 0) : 0;
        const machOTCost = machining ? (machining.costs.after_hours || 0) + (machining.costs.sunday || 0) : 0;
        const machCphWithTax = machTotalH > 0 ? machWithTax / machTotalH : 0;
        modal.addCustomSection({ title: 'Talaşlı İmalat', icon: 'fas fa-cog', iconColor: 'text-primary', customContent: machining ? summaryRow([
            { icon: 'money-bill-wave', cls: 'text-primary', value: `€${machBase.toFixed(2)}`, label: 'İşçilik (vergi hariç)', colSize: 4 },
            { icon: 'percent', cls: 'text-primary', value: `€${machTax.toFixed(2)}`, label: 'Vergi / genel gider', colSize: 4 },
            { icon: 'euro-sign', cls: 'text-primary', value: `€${machWithTax.toFixed(2)}`, label: 'İşçilik + Vergi', colSize: 4 }
        ]) + summaryRow([
            { icon: 'clock', cls: 'text-primary', value: machTotalH.toFixed(1), label: 'Saat', colSize: 4 },
            { icon: 'calendar', cls: 'text-primary', value: `€${machOTCost.toFixed(2)}`, label: 'Mesai Maliyeti', colSize: 4 },
            { icon: 'calculator', cls: 'text-primary', value: `€${machCphWithTax.toFixed(2)}`, label: 'Saat/Maliyet (+ vergi)', colSize: 4 }
        ]) + `<div class="text-center mt-2"><button class="btn btn-primary btn-sm" onclick="window.showMachiningDetails('${jobNo}')"><i class="fas fa-table me-1"></i>Detay</button></div>` : '<div class="text-center py-3 text-muted">Talaşlı imalat verisi yok.</div>' });

        const weldTotalH = welding ? (welding.hours.regular || 0) + (welding.hours.after_hours || 0) + (welding.hours.holiday || 0) : 0;
        const weldOTCost = welding ? (welding.costs.after_hours || 0) + (welding.costs.holiday || 0) : 0;
        const weldCphWithTax = weldTotalH > 0 ? weldWithTax / weldTotalH : 0;
        modal.addCustomSection({ title: 'Kaynaklı İmalat', icon: 'fas fa-fire', iconColor: 'text-danger', customContent: welding ? summaryRow([
            { icon: 'money-bill-wave', cls: 'text-danger', value: `€${weldBase.toFixed(2)}`, label: 'İşçilik (vergi hariç)', colSize: 4 },
            { icon: 'percent', cls: 'text-danger', value: `€${weldTax.toFixed(2)}`, label: 'Vergi / genel gider', colSize: 4 },
            { icon: 'euro-sign', cls: 'text-danger', value: `€${weldWithTax.toFixed(2)}`, label: 'İşçilik + Vergi', colSize: 4 }
        ]) + summaryRow([
            { icon: 'clock', cls: 'text-danger', value: weldTotalH.toFixed(1), label: 'Saat', colSize: 4 },
            { icon: 'calendar', cls: 'text-danger', value: `€${weldOTCost.toFixed(2)}`, label: 'Mesai Maliyeti', colSize: 4 },
            { icon: 'calculator', cls: 'text-danger', value: `€${weldCphWithTax.toFixed(2)}`, label: 'Saat/Maliyet (+ vergi)', colSize: 4 }
        ]) + `<div class="text-center mt-2"><button class="btn btn-danger btn-sm" onclick="window.showWeldingDetails('${jobNo}')"><i class="fas fa-table me-1"></i>Detay</button></div>` : '<div class="text-center py-3 text-muted">Kaynaklı imalat verisi yok.</div>' });

        modal.render().show();
    } catch (err) { console.error(err); showError('İş detayları yüklenirken hata oluştu.'); }
}

function summaryRow(items) {
    const cols = items.map(it => {
        const col = it.colSize != null ? it.colSize : Math.max(1, Math.floor(12 / items.length));
        return `<div class="col-md-${col}"><div class="card"><div class="card-body text-center"><i class="fas fa-${it.icon} ${it.cls} mb-2"></i><div class="fw-bold">${it.value}</div><small class="text-muted">${it.label}</small></div></div></div>`;
    }).join('');
    return `<div class="row mb-3">${cols}</div>`;
}

/* ── Machining details ─────────────────────────────────────────────── */

async function showMachiningDetails(jobNo) {
    try {
        ensureModalContainer('machining-details-modal-container');
        const [data, costRow, combinedData] = await Promise.all([
            getMachiningJobEntries({ job_no: jobNo }),
            fetchCostTableRowForJob(jobNo),
            getCombinedJobCosts({ job_no: jobNo })
        ]);
        const groups = data.entries || [];
        const summary = data.summary || {};
        const job = combinedData.results?.[0];
        const machBase = toNumber(job?.machining?.total_cost);
        const weldBase = toNumber(job?.welding?.total_cost);
        const overhead = costRow ? toNumber(costRow.employee_overhead_cost) : 0;
        const machTax = splitEmployeeOverheadByLaborCost(overhead, machBase, weldBase).mach;
        const netMach = toNumber(summary.total_cost);
        const machWithTax = netMach + machTax;
        const modal = new DisplayModal('machining-details-modal-container', { title: `${jobNo} - Talaşlı İmalat Detayları`, icon: 'fas fa-cog', size: 'xl', showEditButton: false });

        modal.addSection({ title: 'Özet', icon: 'fas fa-chart-pie', iconColor: 'text-primary', fields: [
            { id: 'te', label: 'Toplam Kayıt', value: summary.total_entries || 0, type: 'number', icon: 'fas fa-list', colSize: 2 },
            { id: 'th', label: 'Toplam Saat', value: summary.total_hours || 0, type: 'number', icon: 'fas fa-clock', format: v => `${(Number(v) || 0).toFixed(1)} saat`, colSize: 2 },
            { id: 'tn', label: 'İşçilik (vergi hariç)', value: netMach, type: 'text', icon: 'fas fa-money-bill-wave', format: v => formatMoney(v), colSize: 2 },
            { id: 'tv', label: 'Vergi / genel gider', value: machTax, type: 'text', icon: 'fas fa-percent', format: v => formatMoney(v), colSize: 2 },
            { id: 'tg', label: 'İşçilik + Vergi', value: machWithTax, type: 'text', icon: 'fas fa-euro-sign', format: v => formatMoney(v), colSize: 2 },
            { id: 'ww', label: 'Hafta İçi', value: summary.breakdown_by_type?.weekday_work || 0, type: 'number', icon: 'fas fa-calendar-day', format: v => `${(Number(v) || 0).toFixed(1)} saat`, colSize: 2 },
            { id: 'ah', label: 'Mesai', value: summary.breakdown_by_type?.after_hours || 0, type: 'number', icon: 'fas fa-clock', format: v => `${(Number(v) || 0).toFixed(1)} saat`, colSize: 2 },
            { id: 'su', label: 'Pazar', value: summary.breakdown_by_type?.sunday || 0, type: 'number', icon: 'fas fa-calendar', format: v => `${(Number(v) || 0).toFixed(1)} saat`, colSize: 2 }
        ]});

        if (groups.length > 0) {
            const opMap = new Map();
            groups.forEach(op => opMap.set(op.operation_key || '-', op));
            const tableData = [];
            groups.forEach(op => {
                tableData.push({ id: `summary-${op.operation_key}`, operation_key: op.operation_key || '-', date: '', employee_full_name: '', hours: op.total_hours || 0, cost: op.total_cost || '0', work_type: '', is_operation_summary: true, operation_name: op.operation_name || '-' });
                [...(op.entries || [])].sort((a, b) => (a.start_time || 0) - (b.start_time || 0)).forEach(e => {
                    tableData.push({ id: e.id, operation_key: op.operation_key || '-', date: e.start_time ? new Date(e.start_time).toISOString().split('T')[0] : '-', employee_full_name: e.employee_full_name, employee_username: e.employee_username, hours: e.hours || 0, cost: e.cost || '0', work_type: e.work_type, is_operation_summary: false });
                });
            });
            modal.addCustomSection({ title: null, customContent: '<div id="machining-entries-table-container"></div>' });
            modal.render().show();
            setTimeout(() => {
                const t = new TableComponent('machining-entries-table-container', {
                    title: 'Kayıtlar', groupBy: 'operation_key', groupCollapsible: true, defaultGroupExpanded: true,
                    groupHeaderFormatter: (gv) => { const op = opMap.get(gv); return op ? `<span class="status-badge status-blue">${op.operation_name || '-'}</span> <span class="text-muted">${gv}</span>` : `<span class="status-badge status-grey">${gv || '-'}</span>`; },
                    columns: [
                        { field: 'date', label: 'Tarih', sortable: true, width: '120px', formatter: (v, r) => r.is_operation_summary ? '<span class="text-muted fw-bold">Toplam</span>' : (v || '-') },
                        { field: 'employee_full_name', label: 'Çalışan', sortable: true, formatter: (v, r) => r.is_operation_summary ? '<span class="text-muted">-</span>' : (v || r.employee_username || '-') },
                        { field: 'hours', label: 'Saat', sortable: true, width: '100px', formatter: (v, r) => { const h = (v || 0).toFixed(1); return r.is_operation_summary ? `<span class="fw-bold">${h}</span>` : h; } },
                        { field: 'cost', label: 'Maliyet', sortable: true, width: '120px', formatter: (v, r) => r.is_operation_summary ? `<span class="fw-bold">${formatMoney(v)}</span>` : formatMoney(v) },
                        { field: 'work_type', label: 'Tip', sortable: true, width: '120px', formatter: (v, r) => r.is_operation_summary ? '<span class="text-muted">-</span>' : ({ weekday_work: 'Hafta İçi', after_hours: 'Mesai', sunday: 'Pazar' }[v] || v || '-') }
                    ],
                    rowAttributes: r => r.is_operation_summary ? { class: 'operation-summary-row', style: 'background-color:#f8f9fa;' } : null,
                    showPagination: false, showSearch: false, showExport: false
                });
                t.updateData(tableData, { totalItems: tableData.length, currentPage: 1, pageSize: tableData.length });
            }, 100);
        } else { modal.addCustomSection({ title: 'Kayıtlar', customContent: '<div class="text-center text-muted py-4">Kayıt bulunamadı.</div>' }); modal.render().show(); }
    } catch (err) { console.error(err); showError('Talaşlı imalat detayları yüklenirken hata.'); }
}

/* ── Welding details ───────────────────────────────────────────────── */

async function showWeldingDetails(jobNo) {
    try {
        ensureModalContainer('welding-details-modal-container');
        const [data, costRow, combinedData] = await Promise.all([
            getWeldingJobCostDetail({ job_no: jobNo }),
            fetchCostTableRowForJob(jobNo),
            getCombinedJobCosts({ job_no: jobNo })
        ]);
        const entries = data.entries || [];
        const summary = data.summary || {};
        const job = combinedData.results?.[0];
        const machBase = toNumber(job?.machining?.total_cost);
        const weldBase = toNumber(job?.welding?.total_cost);
        const overhead = costRow ? toNumber(costRow.employee_overhead_cost) : 0;
        const weldTax = splitEmployeeOverheadByLaborCost(overhead, machBase, weldBase).weld;
        const netWeld = toNumber(summary.total_cost);
        const weldWithTax = netWeld + weldTax;
        const modal = new DisplayModal('welding-details-modal-container', { title: `${jobNo} - Kaynaklı İmalat Detayları`, icon: 'fas fa-fire', size: 'xl', showEditButton: false });

        modal.addSection({ title: 'Özet', icon: 'fas fa-chart-pie', iconColor: 'text-danger', fields: [
            { id: 'te', label: 'Toplam Kayıt', value: summary.total_entries || entries.length, type: 'number', icon: 'fas fa-list', colSize: 2 },
            { id: 'th', label: 'Toplam Saat', value: summary.total_hours || 0, type: 'number', icon: 'fas fa-clock', format: v => `${(Number(v) || 0).toFixed(1)} saat`, colSize: 2 },
            { id: 'tn', label: 'İşçilik (vergi hariç)', value: netWeld, type: 'text', icon: 'fas fa-money-bill-wave', format: v => formatMoney(v), colSize: 2 },
            { id: 'tv', label: 'Vergi / genel gider', value: weldTax, type: 'text', icon: 'fas fa-percent', format: v => formatMoney(v), colSize: 2 },
            { id: 'tg', label: 'İşçilik + Vergi', value: weldWithTax, type: 'text', icon: 'fas fa-euro-sign', format: v => formatMoney(v), colSize: 2 },
            { id: 'rh', label: 'Normal Saat', value: summary.breakdown_by_type?.regular || 0, type: 'number', icon: 'fas fa-calendar-day', format: v => `${(Number(v) || 0).toFixed(1)} saat`, colSize: 2 },
            { id: 'ah', label: 'Mesai Saat', value: summary.breakdown_by_type?.after_hours || 0, type: 'number', icon: 'fas fa-clock', format: v => `${(Number(v) || 0).toFixed(1)} saat`, colSize: 2 },
            { id: 'hh', label: 'Tatil Saat', value: summary.breakdown_by_type?.holiday || 0, type: 'number', icon: 'fas fa-calendar', format: v => `${(Number(v) || 0).toFixed(1)} saat`, colSize: 2 }
        ]});

        const sorted = [...entries].sort((a, b) => new Date(a.date || '') - new Date(b.date || ''));
        if (sorted.length > 0) {
            modal.addCustomSection({ title: null, customContent: '<div id="welding-entries-table-container"></div>' });
            modal.render().show();
            setTimeout(() => {
                const t = new TableComponent('welding-entries-table-container', {
                    title: 'Kayıtlar',
                    columns: [
                        { field: 'date', label: 'Tarih', sortable: true, width: '120px', formatter: v => v || '-' },
                        { field: 'employee_full_name', label: 'Çalışan', sortable: true, formatter: (v, r) => v || r.employee_username || '-' },
                        { field: 'hours', label: 'Saat', sortable: true, width: '100px', formatter: v => (v || 0).toFixed(1) },
                        { field: 'cost', label: 'Maliyet', sortable: true, width: '120px', formatter: v => formatMoney(v) },
                        { field: 'overtime_type', label: 'Tip', sortable: true, width: '120px', formatter: v => ({ regular: 'Normal', after_hours: 'Mesai', holiday: 'Tatil' }[v] || v || '-') }
                    ],
                    showPagination: false, showSearch: false, showExport: false
                });
                t.updateData(sorted.map(e => ({ ...e, id: e.id })), { totalItems: sorted.length, currentPage: 1, pageSize: sorted.length });
            }, 100);
        } else { modal.addCustomSection({ title: 'Kayıtlar', customContent: '<div class="text-center text-muted py-4">Kayıt bulunamadı.</div>' }); modal.render().show(); }
    } catch (err) { console.error(err); showError('Kaynaklı imalat detayları yüklenirken hata.'); }
}

/* ── Material details ──────────────────────────────────────────────── */

async function showMaterialDetails(jobNo) {
    if (!jobNo) { showError('İş numarası bulunamadı.'); return; }
    try {
        ensureModalContainer('material-details-modal-container');
        const lines = await getProcurementLines(jobNo);
        const procLines = Array.isArray(lines) ? lines : (lines.results || []);
        const totalAmt = procLines.reduce((s, l) => s + toNumber(l.amount_eur), 0);
        const modal = new DisplayModal('material-details-modal-container', { title: `${jobNo} - Malzeme Detayları`, icon: 'fas fa-box', size: 'xl', showEditButton: false });

        modal.addSection({ title: 'Özet', icon: 'fas fa-chart-pie', iconColor: 'text-success', fields: [
            { id: 'tl', label: 'Toplam Satır', value: procLines.length, type: 'number', icon: 'fas fa-list', colSize: 6 },
            { id: 'ta', label: 'Toplam Tutar', value: totalAmt, type: 'currency', icon: 'fas fa-euro-sign', format: v => `€${(Number(v) || 0).toFixed(2)}`, colSize: 6 }
        ]});

        if (procLines.length > 0) {
            modal.addCustomSection({ title: null, customContent: '<div id="material-lines-table-container"></div>' });
            modal.render().show();
            setTimeout(() => {
                const t = new TableComponent('material-lines-table-container', {
                    title: 'Malzeme Satırları', icon: 'fas fa-table', iconColor: 'text-success',
                    columns: [
                        { field: 'item_code', label: 'Kod', sortable: true, formatter: v => `<span class="text-info fw-bold">${v || '-'}</span>` },
                        { field: 'item_name', label: 'Ad', sortable: true },
                        { field: 'item_unit', label: 'Birim', sortable: true, formatter: v => `<span class="text-muted">${v || '-'}</span>` },
                        { field: 'item_description', label: 'Açıklama', sortable: false },
                        { field: 'quantity', label: 'Miktar', sortable: true, formatter: v => `<span class="fw-bold">${formatNumber(v, 2)}</span>` },
                        { field: 'unit_price', label: 'Birim Fiyat (€)', sortable: true, formatter: v => formatMoney(v) },
                        { field: 'amount_eur', label: 'Tutar (€)', sortable: true, formatter: v => `<span class="fw-bold text-success">${formatMoney(v)}</span>` }
                    ],
                    showPagination: false, showSearch: false, showExport: false
                });
                t.updateData(procLines.map((l, i) => ({ ...l, id: l.id || i })), { totalItems: procLines.length, currentPage: 1, pageSize: procLines.length });
            }, 100);
        } else { modal.addCustomSection({ title: 'Malzeme Satırları', customContent: '<div class="text-center text-muted py-4">Satır bulunamadı.</div>' }); modal.render().show(); }
    } catch (err) { console.error(err); showError('Malzeme detayları yüklenirken hata.'); }
}

/* ── Subcontractor details ─────────────────────────────────────────── */

async function showSubcontractorDetails(jobNo) {
    if (!jobNo) { showError('İş numarası bulunamadı.'); return; }
    try {
        ensureModalContainer('subcontractor-details-modal-container');
        const data = await fetchSubcontractorCostBreakdown(jobNo);
        const lines = Array.isArray(data?.lines) ? data.lines : [];
        const adjustments = Array.isArray(data?.adjustments) ? data.adjustments : [];
        const totalEur = toNumber(data?.total_eur);
        const modal = new DisplayModal('subcontractor-details-modal-container', { title: `${jobNo} - Taşeron Detayları`, icon: 'fas fa-handshake', size: 'xl', showEditButton: false });

        modal.addSection({ title: 'Özet', icon: 'fas fa-chart-pie', iconColor: 'text-warning', fields: [
            { id: 'wl', label: 'İş Satırı', value: lines.length, type: 'number', icon: 'fas fa-list', colSize: 4 },
            { id: 'al', label: 'Düzeltme', value: adjustments.length, type: 'number', icon: 'fas fa-edit', colSize: 4 },
            { id: 'te', label: 'Toplam (EUR)', value: totalEur, type: 'text', icon: 'fas fa-euro-sign', format: v => formatMoney(v), colSize: 4 }
        ]});

        if (lines.length > 0) {
            modal.addCustomSection({ title: null, customContent: '<div id="subcontractor-lines-table-container"></div>' });
            modal.render().show();
            setTimeout(() => {
                const t = new TableComponent('subcontractor-lines-table-container', {
                    title: 'İş Satırları',
                    columns: [
                        { field: 'statement_period', label: 'Dönem', sortable: true, formatter: v => v || '-' },
                        { field: 'subcontractor_name', label: 'Taşeron', sortable: true },
                        { field: 'delta_progress', label: 'Delta (%)', sortable: true, formatter: v => formatPct(v) },
                        { field: 'cost_amount', label: 'Tutar', sortable: true, formatter: (v, r) => `${formatNumber(v, 2)} ${r.cost_currency || 'TRY'}` },
                        { field: 'cost_amount_eur', label: 'EUR', sortable: true, formatter: v => formatMoney(v) }
                    ],
                    showPagination: false, showSearch: false, showExport: false
                });
                const td = lines.map((l, i) => ({ ...l, id: `line-${i}`, statement_period: l.statement_year && l.statement_month ? `${l.statement_month}.${l.statement_year}` : '-' }));
                t.updateData(td, { totalItems: td.length, currentPage: 1, pageSize: td.length });
            }, 100);
        } else { modal.addCustomSection({ title: 'İş Satırları', customContent: '<div class="text-center text-muted py-4">Satır bulunamadı.</div>' }); modal.render().show(); }

        if (adjustments.length > 0) {
            modal.addCustomSection({ title: null, customContent: '<div id="subcontractor-adjustments-table-container"></div>' });
            modal.render();
            setTimeout(() => {
                const t = new TableComponent('subcontractor-adjustments-table-container', {
                    title: 'Düzeltmeler',
                    columns: [
                        { field: 'adjustment_type', label: 'Tür', sortable: true },
                        { field: 'reason', label: 'Açıklama', sortable: true },
                        { field: 'amount', label: 'Tutar', sortable: true, formatter: (v, r) => `${formatNumber(v, 2)} ${r.cost_currency || 'TRY'}` },
                        { field: 'cost_amount_eur', label: 'EUR', sortable: true, formatter: v => formatMoney(v) }
                    ],
                    showPagination: false, showSearch: false, showExport: false
                });
                t.updateData(adjustments.map((a, i) => ({ ...a, id: `adj-${i}` })), { totalItems: adjustments.length, currentPage: 1, pageSize: adjustments.length });
            }, 100);
        }
    } catch (err) { console.error(err); showError('Taşeron detayları yüklenirken hata.'); }
}

/* ── global exports for inline onclick ─────────────────────────────── */
window.showJobDetails = showJobDetails;
window.showMachiningDetails = showMachiningDetails;
window.showWeldingDetails = showWeldingDetails;
window.showMaterialDetails = showMaterialDetails;
window.showSubcontractorDetails = showSubcontractorDetails;
