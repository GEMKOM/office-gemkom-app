import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { getCostTable, getCostChildren, getProcurementLines } from '../../apis/projects/cost.js';
import { listCustomers } from '../../apis/projects/customers.js';
import { getCombinedJobCosts } from '../../apis/planning/reports.js';
import { getMachiningJobEntries } from '../../apis/machining/reports.js';
import { getWeldingJobCostDetail } from '../../apis/welding/reports.js';
import { fetchSubcontractorCostBreakdown } from '../../apis/subcontracting/subcontractors.js';

const STATUS_OPTIONS = [
    { value: '', label: 'Tümü' },
    { value: 'draft', label: 'Taslak' },
    { value: 'active', label: 'Aktif' },
    { value: 'on_hold', label: 'Beklemede' },
    { value: 'completed', label: 'Tamamlandı' },
    { value: 'cancelled', label: 'İptal Edildi' }
];

let currentPage = 1;
let pageSize = 20;
let currentOrdering = 'job_no';
let costTable = null;
let filtersComponent = null;
let expandedRows = new Set(); // Track expanded rows by job_no for hierarchy
let costTableRoots = []; // Current page root rows (no children in response)
let childrenCache = new Map(); // job_no -> array of direct children (from getCostChildren)

function formatMoney(value) {
    if (value == null || value === '') return '<span class="text-muted">-</span>';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (Number.isNaN(num)) return '<span class="text-muted">-</span>';
    return `€${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toNumber(value) {
    if (value == null || value === '') return 0;
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(num) ? num : 0;
}

function formatNumber(value, fractionDigits = 2) {
    if (value == null || value === '') return '<span class="text-muted">-</span>';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (!Number.isFinite(num)) return '<span class="text-muted">-</span>';
    return num.toLocaleString('tr-TR', { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

function formatPct(value) {
    if (value == null || value === '') return '<span class="text-muted">-</span>';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (Number.isNaN(num)) return '<span class="text-muted">-</span>';
    return `${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatDate(value) {
    if (value == null || value === '') return '<span class="text-muted">-</span>';
    try {
        const d = new Date(value);
        return d.toLocaleDateString('tr-TR');
    } catch {
        return '<span class="text-muted">-</span>';
    }
}

function statusBadge(status) {
    const labels = {
        draft: 'Taslak',
        active: 'Aktif',
        on_hold: 'Beklemede',
        completed: 'Tamamlandı',
        cancelled: 'İptal Edildi'
    };
    const label = labels[status] || status || '–';
    const colorClass = status === 'active' ? 'status-green' : status === 'completed' ? 'status-blue' : status === 'on_hold' ? 'status-yellow' : status === 'cancelled' ? 'status-red' : 'status-grey';
    return `<span class="status-badge ${colorClass}">${label}</span>`;
}

// Flatten tree for display: roots + expanded children from childrenCache (recursive).
function mergeExpandedChildren(roots, level = 0) {
    const merged = [];
    if (!Array.isArray(roots)) return merged;
    roots.forEach((row) => {
        const node = { ...row };
        node.hierarchy_level = level;
        merged.push(node);
        if (expandedRows.has(row.job_no)) {
            const children = childrenCache.get(row.job_no) || [];
            merged.push(...mergeExpandedChildren(children, level + 1));
        }
    });
    return merged;
}

function updateTableDataOnly() {
    if (!costTable) return;
    const displayList = mergeExpandedChildren(costTableRoots);
    costTable.updateData(displayList, costTable.options.totalItems, costTable.options.currentPage);
    setTimeout(() => setupExpandButtonListeners(), 50);
}

let expandButtonHandler = null;
function setupExpandButtonListeners() {
    if (!costTable || !costTable.container) return;
    if (expandButtonHandler) {
        costTable.container.removeEventListener('click', expandButtonHandler);
    }
    expandButtonHandler = async (e) => {
        const btn = e.target.closest('.expand-toggle-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const jobNo = btn.getAttribute('data-job-no');
        if (!jobNo) return;
        if (expandedRows.has(jobNo)) {
            expandedRows.delete(jobNo);
            updateTableDataOnly();
            return;
        }
        try {
            const icon = btn.querySelector('i');
            if (icon) icon.className = 'fas fa-spinner fa-spin';
            const children = await getCostChildren(jobNo);
            childrenCache.set(jobNo, children);
            expandedRows.add(jobNo);
            updateTableDataOnly();
        } catch (err) {
            console.error('Error fetching cost children for', jobNo, err);
            if (typeof showNotification === 'function') {
                showNotification('Alt işler yüklenirken hata oluştu', 'error');
            } else {
                alert('Alt işler yüklenirken hata oluştu.');
            }
            const icon = btn.querySelector('i');
            if (icon) icon.className = 'fas fa-plus';
        }
    };
    costTable.container.addEventListener('click', expandButtonHandler);
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) return;
    await initNavbar();

    const header = new HeaderComponent({
        title: 'Maliyet Tablosu',
        subtitle: 'Tüm iş emirlerinin maliyet özeti: işçilik, malzeme, taşeron, boya, kalite, sevkiyat ve toplam maliyet.',
        icon: 'fas fa-calculator',
        showBackButton: 'block',
        backUrl: '/projects',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onRefreshClick: () => loadData()
    });

    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        onApply: () => {
            currentPage = 1;
            loadData();
        },
        onClear: () => {
            currentPage = 1;
            loadData();
        }
    });
    filtersComponent.addSelectFilter({
        id: 'status',
        label: 'Durum',
        options: STATUS_OPTIONS,
        placeholder: 'Tümü',
        colSize: 2
    });
    filtersComponent.addTextFilter({
        id: 'search',
        label: 'Ara (iş no / başlık)',
        placeholder: 'Örn: pump',
        colSize: 3
    });

    // Customer: remote search via GET /projects/customers/?search=...&is_active=true, results after 3 characters
    filtersComponent.addDropdownFilter({
        id: 'customer',
        label: 'Müşteri',
        options: [],
        placeholder: 'Müşteri ara (en az 3 karakter)',
        colSize: 3,
        searchable: true,
        minSearchLength: 3,
        remoteSearchPlaceholder: 'En az 3 karakter yazın',
        remoteSearch: async (term) => {
            if (!term || term.length < 3) return [];
            const res = await listCustomers({ search: term.trim(), is_active: true, page_size: 50 });
            const list = res.results || [];
            return list.map(c => ({ value: String(c.id), text: c.name || c.code || `#${c.id}` }));
        }
    });

    costTable = new TableComponent('cost-table-container', {
        title: 'Maliyet Tablosu',
        icon: 'fas fa-calculator',
        iconColor: 'text-primary',
        columns: [
            {
                field: '_expand',
                label: '',
                sortable: false,
                width: '80px',
                formatter: (value, row) => {
                    const hasChildren = row.has_children === true || (childrenCache.get(row.job_no) || []).length > 0;
                    const isExpanded = expandedRows.has(row.job_no);
                    const level = row.hierarchy_level ?? 0;
                    const LEVEL_WIDTH = 20;
                    const LINE_THICKNESS = 2;
                    const LINE_COLOR = '#cbd5e0';
                    const BUTTON_SIZE = 24;
                    const buttonLeft = level * LEVEL_WIDTH;
                    let treeLinesHtml = '';
                    if (level > 0) {
                        for (let i = 0; i < level; i++) {
                            const isLast = i === level - 1;
                            const lineLeft = i * LEVEL_WIDTH + (LEVEL_WIDTH / 2) - (LINE_THICKNESS / 2);
                            if (!isLast) {
                                treeLinesHtml += `<div style="position:absolute;left:${lineLeft}px;top:0;bottom:0;width:${LINE_THICKNESS}px;background:${LINE_COLOR};"></div>`;
                            } else {
                                treeLinesHtml += `<div style="position:absolute;left:${lineLeft}px;top:0;height:50%;width:${LINE_THICKNESS}px;background:${LINE_COLOR};"></div>`;
                                treeLinesHtml += `<div style="position:absolute;left:${lineLeft}px;top:50%;width:${LEVEL_WIDTH/2}px;height:${LINE_THICKNESS}px;background:${LINE_COLOR};transform:translateY(-50%);"></div>`;
                            }
                        }
                    }
                    let expandBtn = '';
                    if (hasChildren) {
                        const icon = isExpanded ? 'fa-minus' : 'fa-plus';
                        const btnClass = isExpanded ? 'expanded' : 'collapsed';
                        expandBtn = `<button type="button" class="btn btn-sm expand-toggle-btn ${btnClass}" data-job-no="${row.job_no}" style="position:absolute;left:${buttonLeft}px;top:50%;transform:translateY(-50%);width:${BUTTON_SIZE}px;height:${BUTTON_SIZE}px;padding:0;border-radius:4px;border:1.5px solid #0d6efd;background:${isExpanded ? '#0d6efd' : '#fff'};color:${isExpanded ? '#fff' : '#0d6efd'};display:inline-flex;align-items:center;justify-content:center;cursor:pointer;z-index:1;" title="${isExpanded ? 'Daralt' : 'Genişlet'}"><i class="fas ${icon}" style="font-size:10px;"></i></button>`;
                    }
                    return `<div style="position:relative;width:100%;height:40px;min-height:40px;">${treeLinesHtml}${expandBtn}</div>`;
                }
            },
            {
                field: 'job_no',
                label: 'İş No',
                sortable: true,
                width: '160px',
                formatter: (v, row) => {
                    if (!v) return '-';
                    const level = row.hierarchy_level ?? 0;
                    const url = `/projects/project-tracking/?job_no=${encodeURIComponent(v)}`;
                    if (level > 0) {
                        // Child jobs - subtle badge styling
                        return `<a href="${url}" class="text-decoration-none" style="font-weight: 600; color: #6c757d; font-family: 'Courier New', monospace; font-size: 0.9rem; background: rgba(108, 117, 125, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(108, 117, 125, 0.2); display: inline-block;">${v}</a>`;
                    } else {
                        // Root jobs - prominent badge styling
                        return `<a href="${url}" class="text-decoration-none" style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2); display: inline-block;">${v}</a>`;
                    }
                }
            },
            { field: 'title', label: 'Başlık', sortable: false, formatter: (v, row) => (v || '-') },
            { 
                field: 'customer_name', 
                label: 'Müşteri', 
                sortable: false, 
                width: '220px',
                formatter: (v, row) => {
                    const customerDisplayName = row.customer_short_name || row.customer_name || v;
                    if (!customerDisplayName) return '-';
                    return `<span class="status-badge status-grey">${customerDisplayName}</span>`;
                }
            },
            { field: 'status', label: 'Durum', sortable: true, formatter: v => statusBadge(v) },
            { 
                field: 'labor_cost', 
                label: 'İşçilik + Vergi', 
                sortable: true, 
                formatter: (v, row) => {
                    const labor = typeof v === 'string' ? parseFloat(v) : (v || 0);
                    const overhead = typeof row.employee_overhead_cost === 'string' ? parseFloat(row.employee_overhead_cost) : (row.employee_overhead_cost || 0);
                    const total = labor + overhead;
                    const jobNo = (row.job_no || '').replace(/"/g, '&quot;');
                    const iconButton = total > 0 ? ` <button class="btn btn-sm btn-link p-0 ms-1" onclick="window.showJobDetails &amp;&amp; window.showJobDetails(&quot;${jobNo}&quot;)" title="İşçilik Detaylarını Görüntüle" style="text-decoration: none; white-space: nowrap;"><i class="fas fa-info-circle text-primary"></i></button>` : '';
                    return `<span style="white-space: nowrap;">${formatMoney(total)}${iconButton}</span>`;
                }
            },
            { 
                field: 'material_cost', 
                label: 'Malzeme', 
                sortable: true, 
                formatter: (v, row) => {
                    const materialCost = typeof v === 'string' ? parseFloat(v) : (v || 0);
                    const jobNo = (row.job_no || '').replace(/"/g, '&quot;');
                    const iconButton = materialCost > 0 ? ` <button class="btn btn-sm btn-link p-0 ms-1" onclick="window.showMaterialDetails &amp;&amp; window.showMaterialDetails(&quot;${jobNo}&quot;)" title="Malzeme Detaylarını Görüntüle" style="text-decoration: none; white-space: nowrap;"><i class="fas fa-info-circle text-primary"></i></button>` : '';
                    return `<span style="white-space: nowrap;">${formatMoney(v)}${iconButton}</span>`;
                }
            },
            { 
                field: 'subcontractor_cost', 
                label: 'Taşeron', 
                sortable: true, 
                formatter: (v, row) => {
                    const subcontractorCost = typeof v === 'string' ? parseFloat(v) : (v || 0);
                    const jobNo = (row.job_no || '').replace(/"/g, '&quot;');
                    const iconButton = subcontractorCost > 0 ? ` <button class="btn btn-sm btn-link p-0 ms-1" onclick="window.showSubcontractorDetails &amp;&amp; window.showSubcontractorDetails(&quot;${jobNo}&quot;)" title="Taşeron Detaylarını Görüntüle" style="text-decoration: none; white-space: nowrap;"><i class="fas fa-info-circle text-primary"></i></button>` : '';
                    return `<span style="white-space: nowrap;">${formatMoney(v)}${iconButton}</span>`;
                }
            },
            { 
                field: 'paint_cost', 
                label: 'Boya + Boya Malzemesi', 
                sortable: true, 
                formatter: (v, row) => {
                    const paint = typeof v === 'string' ? parseFloat(v) : (v || 0);
                    const paintMaterial = typeof row.paint_material_cost === 'string' ? parseFloat(row.paint_material_cost) : (row.paint_material_cost || 0);
                    const total = paint + paintMaterial;
                    return formatMoney(total);
                }
            },
            { field: 'qc_cost', label: 'KK', sortable: true, formatter: formatMoney },
            { field: 'shipping_cost', label: 'Sevkiyat', sortable: true, formatter: formatMoney },
            { 
                field: 'general_expenses_cost', 
                label: 'Genel Giderler', 
                sortable: true, 
                formatter: (v, row) => {
                    const cost = formatMoney(v);
                    const rate = row.general_expenses_rate;
                    if (rate != null && rate !== '' && rate !== undefined) {
                        const rateNum = typeof rate === 'string' ? parseFloat(rate) : rate;
                        if (!isNaN(rateNum)) {
                            // Remove trailing zeros and decimal point if not needed
                            const formattedRate = parseFloat(rateNum.toString());
                            return `<span style="white-space: nowrap;">${cost} <small class="text-muted">(${formattedRate})</small></span>`;
                        }
                    }
                    return cost;
                }
            },
            { field: 'total_weight_kg', label: 'Toplam Ağırlık (kg)', sortable: true, formatter: v => (v != null && v !== '' ? parseFloat(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '<span class="text-muted">-</span>') },
            { 
                field: 'price_per_kg', 
                label: 'Kg Fiyatı', 
                sortable: true, 
                formatter: v => (v != null && v !== '' ? `<span class="fw-bold text-primary">€${parseFloat(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>` : '<span class="text-muted">-</span>') 
            },
            { field: 'actual_total_cost', label: 'Toplam Maliyet', sortable: true, formatter: v => `<span class="fw-bold">${formatMoney(v)}</span>` },
            { field: 'selling_price', label: 'Satış Fiyatı', sortable: true, formatter: (v, row) => (v != null && v !== '' ? formatMoney(v) + (row.selling_price_currency && row.selling_price_currency !== 'EUR' ? ` <small class="text-muted">${row.selling_price_currency}</small>` : '') : '<span class="text-muted">-</span>') },
            { field: 'margin_eur', label: 'Marj (€)', sortable: true, formatter: v => (v != null && v !== '' ? formatMoney(v) : '<span class="text-muted">-</span>') },
            { field: 'margin_pct', label: 'Marj %', sortable: true, formatter: v => (v != null && v !== '' ? formatPct(v) : '<span class="text-muted">-</span>') },
            { field: 'last_updated', label: 'Tarih', sortable: false, formatter: formatDate }
        ],
        data: [],
        footer: ({ displayedData, columns, hasActions }) => {
            // Summary is for currently displayed rows (page + expanded children).
            const rowCount = Array.isArray(displayedData) ? displayedData.length : 0;

            const sums = {
                laborWithTax: 0,
                material: 0,
                subcontractor: 0,
                paintWithMaterial: 0,
                qc: 0,
                shipping: 0,
                generalExpenses: 0,
                weightKg: 0,
                actualTotalCost: 0,
                sellingPrice: 0,
                marginEur: 0
            };

            let generalRateSum = 0;
            let generalRateCount = 0;

            (displayedData || []).forEach((row) => {
                sums.laborWithTax += toNumber(row.labor_cost) + toNumber(row.employee_overhead_cost);
                sums.material += toNumber(row.material_cost);
                sums.subcontractor += toNumber(row.subcontractor_cost);
                sums.paintWithMaterial += toNumber(row.paint_cost) + toNumber(row.paint_material_cost);
                sums.qc += toNumber(row.qc_cost);
                sums.shipping += toNumber(row.shipping_cost);
                sums.generalExpenses += toNumber(row.general_expenses_cost);
                sums.weightKg += toNumber(row.total_weight_kg);
                sums.actualTotalCost += toNumber(row.actual_total_cost);
                sums.sellingPrice += toNumber(row.selling_price);
                sums.marginEur += toNumber(row.margin_eur);

                const rate = row.general_expenses_rate;
                if (rate != null && rate !== '') {
                    const r = toNumber(rate);
                    if (Number.isFinite(r) && r !== 0) {
                        generalRateSum += r;
                        generalRateCount += 1;
                    }
                }
            });

            const pricePerKgOverall = sums.weightKg > 0 ? (sums.actualTotalCost / sums.weightKg) : null;
            const marginPctOverall = sums.sellingPrice > 0 ? ((sums.marginEur / sums.sellingPrice) * 100) : null;
            const generalRateAvg = generalRateCount > 0 ? (generalRateSum / generalRateCount) : null;

            const valueByField = new Map();
            valueByField.set('_expand', '');
            valueByField.set('job_no', `<span class="fw-bold">Toplam / Ortalama</span><div class="text-muted small">${rowCount} satır</div>`);
            valueByField.set('title', '<span class="text-muted">-</span>');
            valueByField.set('customer_name', '<span class="text-muted">-</span>');
            valueByField.set('status', '<span class="text-muted">-</span>');

            valueByField.set('labor_cost', `<span class="fw-bold">${formatMoney(sums.laborWithTax)}</span>`);
            valueByField.set('material_cost', `<span class="fw-bold">${formatMoney(sums.material)}</span>`);
            valueByField.set('subcontractor_cost', `<span class="fw-bold">${formatMoney(sums.subcontractor)}</span>`);
            valueByField.set('paint_cost', `<span class="fw-bold">${formatMoney(sums.paintWithMaterial)}</span>`);
            valueByField.set('qc_cost', `<span class="fw-bold">${formatMoney(sums.qc)}</span>`);
            valueByField.set('shipping_cost', `<span class="fw-bold">${formatMoney(sums.shipping)}</span>`);
            valueByField.set(
                'general_expenses_cost',
                `<span class="fw-bold" style="white-space: nowrap;">${formatMoney(sums.generalExpenses)}${generalRateAvg != null ? ` <small class="text-muted">(${formatNumber(generalRateAvg, 2)})</small>` : ''}</span>`
            );
            valueByField.set('total_weight_kg', `<span class="fw-bold">${formatNumber(sums.weightKg, 2)}</span>`);
            valueByField.set(
                'price_per_kg',
                pricePerKgOverall != null
                    ? `<span class="fw-bold text-primary">€${formatNumber(pricePerKgOverall, 2)}</span>`
                    : '<span class="text-muted">-</span>'
            );
            valueByField.set('actual_total_cost', `<span class="fw-bold">${formatMoney(sums.actualTotalCost)}</span>`);
            valueByField.set('selling_price', `<span class="fw-bold">${formatMoney(sums.sellingPrice)}</span>`);
            valueByField.set('margin_eur', `<span class="fw-bold">${formatMoney(sums.marginEur)}</span>`);
            valueByField.set(
                'margin_pct',
                marginPctOverall != null
                    ? `<span class="fw-bold">${formatPct(marginPctOverall)}</span>`
                    : '<span class="text-muted">-</span>'
            );
            valueByField.set('last_updated', '<span class="text-muted">-</span>');

            const tds = (columns || []).map((col, idx) => {
                const content = valueByField.has(col.field) ? valueByField.get(col.field) : '<span class="text-muted">-</span>';
                const widthStyle = col.width ? ` style="width: ${col.width}; min-width: ${col.width};"` : '';
                return `<td class="cost-table-summary-cell"${widthStyle}>${content}</td>`;
            });

            if (hasActions) {
                tds.push('<td class="cost-table-summary-cell"></td>');
            }

            return `<tr class="cost-table-summary-row">${tds.join('')}</tr>`;
        },
        pagination: true,
        serverSidePagination: true,
        totalItems: 0,
        currentPage: 1,
        itemsPerPage: pageSize,
        onSort: (field, direction) => {
            currentOrdering = direction === 'asc' ? field : `-${field}`;
            currentPage = 1;
            loadData();
        },
        onPageChange: (page) => {
            currentPage = page;
            loadData();
        },
        onPageSizeChange: (newSize) => {
            pageSize = newSize;
            currentPage = 1;
            loadData();
        },
        emptyMessage: 'Kayıt bulunamadı.',
        loading: true,
        skeleton: true,
        refreshable: true,
        onRefresh: () => loadData(),
        exportable: true,
        exportFileName: 'maliyet-tablosu',
        stickyHeader: true
    });

    await loadData();
});

async function loadData() {
    const filters = filtersComponent ? filtersComponent.getFilterValues() : {};
    const status = filters.status;
    const status__in = filters.status__in || '';
    const search = filters.search || '';
    const customer = filters.customer || '';

    costTable.setLoading(true);
    try {
        const res = await getCostTable({
            status: status || undefined,
            status__in: status__in || undefined,
            search: search || undefined,
            customer: customer ? parseInt(customer, 10) : undefined,
            ordering: currentOrdering,
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
        setTimeout(() => setupExpandButtonListeners(), 50);
    } catch (err) {
        console.error('Cost table load error:', err);
        costTable.updateData([], 0, 1);
    } finally {
        costTable.setLoading(false);
    }
}

// Helper function to ensure modal container exists
function ensureModalContainer(containerId) {
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        document.body.appendChild(container);
    }
    return container;
}

// Show error message
function showError(message) {
    console.error(message);
    alert(message);
}

// Show job details modal
async function showJobDetails(jobNo) {
    if (!jobNo) {
        showError('İş numarası bulunamadı.');
        return;
    }
    
    try {
        // Ensure container exists
        ensureModalContainer('job-details-modal-container');
        
        // Fetch job cost data
        const data = await getCombinedJobCosts({ job_no: jobNo });
        const results = data.results || [];
        
        if (results.length === 0) {
            showError('Bu iş için maliyet verisi bulunamadı.');
            return;
        }
        
        const jobData = results[0];
        const machining = jobData.machining || null;
        const welding = jobData.welding || null;
        const currency = jobData.currency || 'EUR';
        
        const modal = new DisplayModal('job-details-modal-container', {
            title: `${jobNo} - İş Maliyeti Detayları`,
            icon: 'fas fa-calculator',
            size: 'xl',
            showEditButton: false
        });
        
        // Add summary section
        const combinedTotalCost = jobData.combined_total_cost || 0;
        const combinedTotalHours = jobData.combined_total_hours || 0;
        const costPerHour = combinedTotalHours > 0 ? combinedTotalCost / combinedTotalHours : 0;
        
        modal.addCustomSection({
            title: 'Özet',
            icon: 'fas fa-chart-pie',
            iconColor: 'text-primary',
            customContent: `
                <div class="row mb-3">
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body text-center">
                                <i class="fas fa-euro-sign text-primary mb-2"></i>
                                <div class="fw-bold">€${combinedTotalCost.toFixed(2)}</div>
                                <small class="text-muted">Toplam Maliyet</small>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body text-center">
                                <i class="fas fa-clock text-primary mb-2"></i>
                                <div class="fw-bold">${combinedTotalHours.toFixed(1)}</div>
                                <small class="text-muted">Toplam Saat</small>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body text-center">
                                <i class="fas fa-calculator text-primary mb-2"></i>
                                <div class="fw-bold">€${costPerHour.toFixed(2)}</div>
                                <small class="text-muted">Saat Başı Maliyet</small>
                            </div>
                        </div>
                    </div>
                </div>
            `
        });
        
        // Add machining section (always show, even if no data)
        const machiningTotalHours = machining ? (machining.hours.weekday_work || 0) + (machining.hours.after_hours || 0) + (machining.hours.sunday || 0) : 0;
        const machiningOvertimeCost = machining ? (machining.costs.after_hours || 0) + (machining.costs.sunday || 0) : 0;
        
        modal.addCustomSection({
            title: 'Talaşlı İmalat Departmanı',
            icon: 'fas fa-cog',
            iconColor: 'text-primary',
            customContent: machining ? `
                <div class="row mb-3">
                    <div class="col-md-3">
                        <div class="card">
                            <div class="card-body text-center">
                                <i class="fas fa-euro-sign text-primary mb-2"></i>
                                <div class="fw-bold">€${(machining.total_cost || 0).toFixed(2)}</div>
                                <small class="text-muted">Toplam Maliyet</small>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card">
                            <div class="card-body text-center">
                                <i class="fas fa-clock text-primary mb-2"></i>
                                <div class="fw-bold">${machiningTotalHours.toFixed(1)}</div>
                                <small class="text-muted">Toplam Saat</small>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card">
                            <div class="card-body text-center">
                                <i class="fas fa-calendar text-primary mb-2"></i>
                                <div class="fw-bold">€${machiningOvertimeCost.toFixed(2)}</div>
                                <small class="text-muted">Mesai Maliyeti</small>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card">
                            <div class="card-body text-center">
                                <i class="fas fa-calculator text-primary mb-2"></i>
                                <div class="fw-bold">€${(machiningTotalHours > 0 ? (machining.total_cost || 0) / machiningTotalHours : 0).toFixed(2)}</div>
                                <small class="text-muted">Saat Başı Maliyet</small>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="text-center">
                    <button class="btn btn-primary" onclick="showMachiningDetails('${jobNo}')">
                        <i class="fas fa-table me-2"></i>Detayları Görüntüle
                    </button>
                </div>
            ` : `
                <div class="text-center py-3">
                    <p class="text-muted mb-3">Bu iş için talaşlı imalat verisi bulunmamaktadır.</p>
                </div>
            `
        });
        
        // Add welding section (always show, even if no data)
        const weldingTotalHours = welding ? (welding.hours.regular || 0) + (welding.hours.after_hours || 0) + (welding.hours.holiday || 0) : 0;
        const weldingOvertimeCost = welding ? (welding.costs.after_hours || 0) + (welding.costs.holiday || 0) : 0;
        
        modal.addCustomSection({
            title: 'Kaynaklı İmalat Departmanı',
            icon: 'fas fa-fire',
            iconColor: 'text-danger',
            customContent: welding ? `
                <div class="row mb-3">
                    <div class="col-md-3">
                        <div class="card">
                            <div class="card-body text-center">
                                <i class="fas fa-euro-sign text-danger mb-2"></i>
                                <div class="fw-bold">€${(welding.total_cost || 0).toFixed(2)}</div>
                                <small class="text-muted">Toplam Maliyet</small>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card">
                            <div class="card-body text-center">
                                <i class="fas fa-clock text-danger mb-2"></i>
                                <div class="fw-bold">${weldingTotalHours.toFixed(1)}</div>
                                <small class="text-muted">Toplam Saat</small>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card">
                            <div class="card-body text-center">
                                <i class="fas fa-calendar text-danger mb-2"></i>
                                <div class="fw-bold">€${weldingOvertimeCost.toFixed(2)}</div>
                                <small class="text-muted">Mesai Maliyeti</small>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card">
                            <div class="card-body text-center">
                                <i class="fas fa-calculator text-danger mb-2"></i>
                                <div class="fw-bold">€${(weldingTotalHours > 0 ? (welding.total_cost || 0) / weldingTotalHours : 0).toFixed(2)}</div>
                                <small class="text-muted">Saat Başı Maliyet</small>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="text-center">
                    <button class="btn btn-danger" onclick="showWeldingDetails('${jobNo}')">
                        <i class="fas fa-table me-2"></i>Detayları Görüntüle
                    </button>
                </div>
            ` : `
                <div class="text-center py-3">
                    <p class="text-muted mb-3">Bu iş için kaynaklı imalat verisi bulunmamaktadır.</p>
                </div>
            `
        });
        
        // Render and show modal
        modal.render().show();
        
    } catch (error) {
        console.error('Error loading job details:', error);
        showError('İş detayları yüklenirken bir hata oluştu.');
    }
}

// Show machining details modal
async function showMachiningDetails(jobNo) {
    try {
        // Ensure container exists
        ensureModalContainer('machining-details-modal-container');
        
        // Fetch machining entries for the job
        const data = await getMachiningJobEntries({ job_no: jobNo });
        const operationGroups = data.entries || [];
        const summary = data.summary || {};
        
        // Create display modal
        const modal = new DisplayModal('machining-details-modal-container', {
            title: `${jobNo} - Talaşlı İmalat Detayları`,
            icon: 'fas fa-cog',
            size: 'xl',
            showEditButton: false
        });
        
        // Add summary section
        const totalCost = summary.total_cost || '0';
        const costCurrency = summary.cost_currency || 'EUR';
        
        modal.addSection({
            title: 'Özet',
            icon: 'fas fa-chart-pie',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'total_entries',
                    label: 'Toplam Kayıt',
                    value: summary.total_entries || 0,
                    type: 'number',
                    icon: 'fas fa-list',
                    colSize: 2
                },
                {
                    id: 'total_hours',
                    label: 'Toplam Saat',
                    value: summary.total_hours || 0,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                },
                {
                    id: 'total_cost',
                    label: 'Toplam Maliyet',
                    value: totalCost,
                    type: 'text',
                    icon: 'fas fa-euro-sign',
                    format: (value) => formatMoney(value),
                    colSize: 2
                },
                {
                    id: 'weekday_work',
                    label: 'Hafta İçi Saat',
                    value: summary.breakdown_by_type?.weekday_work || 0,
                    type: 'number',
                    icon: 'fas fa-calendar-day',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                },
                {
                    id: 'after_hours',
                    label: 'Mesai Saat',
                    value: summary.breakdown_by_type?.after_hours || 0,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                },
                {
                    id: 'sunday',
                    label: 'Pazar Saat',
                    value: summary.breakdown_by_type?.sunday || 0,
                    type: 'number',
                    icon: 'fas fa-calendar',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                }
            ]
        });
        
        // Add entries table using TableComponent with grouping
        if (operationGroups.length > 0) {
            // Create a map of operation_key -> operation info for group headers
            const operationInfoMap = new Map();
            operationGroups.forEach(operation => {
                operationInfoMap.set(operation.operation_key || '-', {
                    operation_name: operation.operation_name || '-',
                    total_hours: operation.total_hours || 0,
                    total_entries: operation.total_entries || 0,
                    total_cost: operation.total_cost || '0',
                    cost_currency: operation.cost_currency || 'EUR'
                });
            });
            
            // Process data: add operation summary rows and entry rows
            const tableData = [];
            
            operationGroups.forEach(operation => {
                // Add operation summary row first
                tableData.push({
                    id: `operation-summary-${operation.operation_key}`,
                    operation_key: operation.operation_key || '-',
                    date: '',
                    employee_full_name: '',
                    hours: operation.total_hours || 0,
                    cost: operation.total_cost || '0',
                    cost_currency: operation.cost_currency || 'EUR',
                    work_type: '',
                    is_operation_summary: true,
                    operation_name: operation.operation_name || '-'
                });
                
                // Add entry rows (children) - sort by start_time
                const sortedEntries = [...(operation.entries || [])].sort((a, b) => {
                    const timeA = a.start_time || 0;
                    const timeB = b.start_time || 0;
                    return timeA - timeB;
                });
                
                sortedEntries.forEach(entry => {
                    const date = entry.start_time ? new Date(entry.start_time).toISOString().split('T')[0] : '-';
                    tableData.push({
                        id: entry.id,
                        operation_key: operation.operation_key || '-',
                        date: date,
                        employee_id: entry.employee_id,
                        employee_username: entry.employee_username,
                        employee_full_name: entry.employee_full_name,
                        operation_name: entry.operation_name || '-',
                        hours: entry.hours || 0,
                        cost: entry.cost || '0',
                        cost_currency: entry.cost_currency || 'EUR',
                        work_type: entry.work_type,
                        is_operation_summary: false,
                        raw_data: entry
                    });
                });
            });

            const tableHtml = `
                <div id="machining-entries-table-container"></div>
            `;
            
            modal.addCustomSection({
                title: null,
                customContent: tableHtml
            });

            // Render and show modal first
            modal.render().show();

            // Initialize table component after modal is shown
            setTimeout(() => {
                const entriesTable = new TableComponent('machining-entries-table-container', {
                    title: 'Kayıtlar',
                    groupBy: 'operation_key',
                    groupCollapsible: true,
                    defaultGroupExpanded: true,
                    groupHeaderFormatter: (groupValue, groupRows) => {
                        const operationInfo = operationInfoMap.get(groupValue);
                        if (operationInfo) {
                            // Escape HTML for security
                            const escapeHtml = (text) => {
                                const div = document.createElement('div');
                                div.textContent = text;
                                return div.innerHTML;
                            };
                            const operationName = escapeHtml(operationInfo.operation_name || '-');
                            const operationKey = escapeHtml(groupValue);
                            return `
                                <div class="d-flex align-items-center gap-2">
                                    <span class="status-badge status-blue">${operationName}</span>
                                    <span class="text-muted">${operationKey}</span>
                                </div>
                            `;
                        }
                        const escapeHtml = (text) => {
                            const div = document.createElement('div');
                            div.textContent = text;
                            return div.innerHTML;
                        };
                        return `<span class="status-badge status-grey">${escapeHtml(groupValue || '-')}</span>`;
                    },
                    columns: [
                        {
                            field: 'date',
                            label: 'Tarih',
                            sortable: true,
                            type: 'text',
                            width: '120px',
                            formatter: (value, rowData) => {
                                if (rowData.is_operation_summary) {
                                    return '<span class="text-muted fw-bold">Toplam</span>';
                                }
                                return value || '-';
                            }
                        },
                        {
                            field: 'employee_full_name',
                            label: 'Çalışan',
                            sortable: true,
                            type: 'text',
                            formatter: (value, rowData) => {
                                if (rowData.is_operation_summary) {
                                    return '<span class="text-muted">-</span>';
                                }
                                const displayName = value || rowData.employee_username || '-';
                                return displayName;
                            }
                        },
                        {
                            field: 'hours',
                            label: 'Saat',
                            sortable: true,
                            type: 'number',
                            width: '100px',
                            formatter: (value, rowData) => {
                                const hours = (value || 0).toFixed(1);
                                if (rowData.is_operation_summary) {
                                    return `<span class="fw-bold">${hours}</span>`;
                                }
                                return hours;
                            }
                        },
                        {
                            field: 'cost',
                            label: 'Maliyet',
                            sortable: true,
                            type: 'text',
                            width: '120px',
                            formatter: (value, rowData) => {
                                if (rowData.is_operation_summary) {
                                    return `<span class="fw-bold">${formatMoney(value)}</span>`;
                                }
                                return formatMoney(value);
                            }
                        },
                        {
                            field: 'work_type',
                            label: 'Tip',
                            sortable: true,
                            type: 'text',
                            width: '120px',
                            formatter: (value, rowData) => {
                                if (rowData.is_operation_summary) {
                                    return '<span class="text-muted">-</span>';
                                }
                                const typeLabels = {
                                    'weekday_work': 'Hafta İçi',
                                    'after_hours': 'Mesai',
                                    'sunday': 'Pazar'
                                };
                                return typeLabels[value] || value || '-';
                            }
                        }
                    ],
                    rowAttributes: (row) => {
                        if (row.is_operation_summary) {
                            return {
                                class: 'operation-summary-row',
                                style: 'background-color: #f8f9fa;'
                            };
                        }
                        return null;
                    },
                    onRowClick: null,
                    onSort: null,
                    onPageChange: null,
                    showPagination: false,
                    showSearch: false,
                    showExport: false,
                    skeletonLoading: false
                });

                // Update table with data
                entriesTable.updateData(tableData, {
                    totalItems: tableData.length,
                    currentPage: 1,
                    pageSize: tableData.length
                });
            }, 100);
        } else {
            modal.addCustomSection({
                title: 'Kayıtlar',
                icon: 'fas fa-table',
                iconColor: 'text-primary',
                customContent: '<div class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Bu iş için kayıt bulunamadı.</div>'
            });
            modal.render().show();
        }
        
    } catch (error) {
        console.error('Error loading machining details:', error);
        showError('Talaşlı imalat detayları yüklenirken bir hata oluştu.');
    }
}

// Show welding details modal
async function showWeldingDetails(jobNo) {
    try {
        // Ensure container exists
        ensureModalContainer('welding-details-modal-container');
        
        // Fetch welding entries for the job
        const data = await getWeldingJobCostDetail({ job_no: jobNo });
        const entries = data.entries || [];
        const summary = data.summary || {};
        
        // Sort entries by date (ascending)
        const sortedEntries = [...entries].sort((a, b) => {
            const dateA = new Date(a.date || '');
            const dateB = new Date(b.date || '');
            return dateA - dateB;
        });
        
        // Create display modal
        const modal = new DisplayModal('welding-details-modal-container', {
            title: `${jobNo} - Kaynaklı İmalat Detayları`,
            icon: 'fas fa-fire',
            size: 'xl',
            showEditButton: false
        });
        
        // Add summary section
        const totalCost = summary.total_cost || '0';
        const costCurrency = summary.cost_currency || 'EUR';
        
        modal.addSection({
            title: 'Özet',
            icon: 'fas fa-chart-pie',
            iconColor: 'text-danger',
            fields: [
                {
                    id: 'total_entries',
                    label: 'Toplam Kayıt',
                    value: summary.total_entries || entries.length,
                    type: 'number',
                    icon: 'fas fa-list',
                    colSize: 2
                },
                {
                    id: 'total_hours',
                    label: 'Toplam Saat',
                    value: summary.total_hours || 0,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                },
                {
                    id: 'total_cost',
                    label: 'Toplam Maliyet',
                    value: totalCost,
                    type: 'text',
                    icon: 'fas fa-euro-sign',
                    format: (value) => formatMoney(value),
                    colSize: 2
                },
                {
                    id: 'regular_hours',
                    label: 'Normal Saat',
                    value: summary.breakdown_by_type?.regular || 0,
                    type: 'number',
                    icon: 'fas fa-calendar-day',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                },
                {
                    id: 'after_hours',
                    label: 'Mesai Saat',
                    value: summary.breakdown_by_type?.after_hours || 0,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                },
                {
                    id: 'holiday_hours',
                    label: 'Tatil Saat',
                    value: summary.breakdown_by_type?.holiday || 0,
                    type: 'number',
                    icon: 'fas fa-calendar',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                }
            ]
        });
        
        // Add entries table using TableComponent
        if (sortedEntries.length > 0) {
            // Process entries data for table display
            const entriesTableData = sortedEntries.map(entry => ({
                id: entry.id,
                date: entry.date,
                employee_id: entry.employee_id,
                employee_username: entry.employee_username,
                employee_full_name: entry.employee_full_name,
                hours: entry.hours || 0,
                cost: entry.cost || '0',
                cost_currency: entry.cost_currency || 'EUR',
                overtime_type: entry.overtime_type,
                raw_data: entry
            }));

            const tableHtml = `
                <div id="welding-entries-table-container"></div>
            `;
            
            modal.addCustomSection({
                title: null,
                customContent: tableHtml
            });

            // Render and show modal first
            modal.render().show();

            // Initialize table component after modal is shown
            setTimeout(() => {
                const entriesTable = new TableComponent('welding-entries-table-container', {
                    title: 'Kayıtlar',
                    columns: [
                        {
                            field: 'date',
                            label: 'Tarih',
                            sortable: true,
                            type: 'text',
                            width: '120px',
                            formatter: (value) => value || '-'
                        },
                        {
                            field: 'employee_full_name',
                            label: 'Çalışan',
                            sortable: true,
                            type: 'text',
                            formatter: (value, rowData) => {
                                const displayName = value || rowData.employee_username || '-';
                                return displayName;
                            }
                        },
                        {
                            field: 'hours',
                            label: 'Saat',
                            sortable: true,
                            type: 'number',
                            width: '100px',
                            formatter: (value) => {
                                const hours = (value || 0).toFixed(1);
                                return hours;
                            }
                        },
                        {
                            field: 'cost',
                            label: 'Maliyet',
                            sortable: true,
                            type: 'text',
                            width: '120px',
                            formatter: (value, rowData) => {
                                return formatMoney(value);
                            }
                        },
                        {
                            field: 'overtime_type',
                            label: 'Tip',
                            sortable: true,
                            type: 'text',
                            width: '120px',
                            formatter: (value) => {
                                const typeLabels = {
                                    'regular': 'Normal',
                                    'after_hours': 'Mesai',
                                    'holiday': 'Tatil'
                                };
                                return typeLabels[value] || value || '-';
                            }
                        }
                    ],
                    onRowClick: null,
                    onSort: null,
                    onPageChange: null,
                    showPagination: false,
                    showSearch: false,
                    showExport: false,
                    skeletonLoading: false
                });

                // Update table with data
                entriesTable.updateData(entriesTableData, {
                    totalItems: entriesTableData.length,
                    currentPage: 1,
                    pageSize: entriesTableData.length
                });
            }, 100);
        } else {
            modal.addCustomSection({
                title: 'Kayıtlar',
                icon: 'fas fa-table',
                iconColor: 'text-danger',
                customContent: '<div class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Bu iş için kayıt bulunamadı.</div>'
            });
            modal.render().show();
        }
        
    } catch (error) {
        console.error('Error loading welding details:', error);
        showError('Kaynaklı imalat detayları yüklenirken bir hata oluştu.');
    }
}

// Show material details modal
async function showMaterialDetails(jobNo) {
    if (!jobNo) {
        showError('İş numarası bulunamadı.');
        return;
    }
    
    try {
        // Ensure container exists
        ensureModalContainer('material-details-modal-container');
        
        // Fetch procurement lines for the job
        const lines = await getProcurementLines(jobNo);
        const procurementLines = Array.isArray(lines) ? lines : (lines.results || []);
        
        // Create display modal
        const modal = new DisplayModal('material-details-modal-container', {
            title: `${jobNo} - Malzeme Detayları`,
            icon: 'fas fa-box',
            size: 'xl',
            showEditButton: false
        });
        
        // Calculate totals
        const totalAmount = procurementLines.reduce((sum, line) => {
            const amount = typeof line.amount_eur === 'string' ? parseFloat(line.amount_eur) : (line.amount_eur || 0);
            return sum + amount;
        }, 0);
        
        // Add summary section
        modal.addSection({
            title: 'Özet',
            icon: 'fas fa-chart-pie',
            iconColor: 'text-success',
            fields: [
                {
                    id: 'total_lines',
                    label: 'Toplam Satır',
                    value: procurementLines.length,
                    type: 'number',
                    icon: 'fas fa-list',
                    colSize: 6
                },
                {
                    id: 'total_amount',
                    label: 'Toplam Tutar',
                    value: totalAmount,
                    type: 'currency',
                    icon: 'fas fa-euro-sign',
                    format: (value) => `€${(Number(value) || 0).toFixed(2)}`,
                    colSize: 6
                }
            ]
        });
        
        // Add procurement lines table using TableComponent
        if (procurementLines.length > 0) {
            // Process lines data for table display
            const linesTableData = procurementLines.map((line, index) => ({
                id: line.id || index,
                item_code: line.item_code || '-',
                item_name: line.item_name || '-',
                item_unit: line.item_unit || '-',
                item_description: line.item_description || '-',
                quantity: line.quantity || 0,
                unit_price: line.unit_price || 0,
                amount_eur: line.amount_eur || 0,
                raw_data: line
            }));

            const tableHtml = `
                <div id="material-lines-table-container"></div>
            `;
            
            modal.addCustomSection({
                title: null,
                customContent: tableHtml
            });

            // Render and show modal first
            modal.render().show();

            // Initialize table component after modal is shown
            setTimeout(() => {
                const linesTable = new TableComponent('material-lines-table-container', {
                    title: 'Malzeme Satırları',
                    icon: 'fas fa-table',
                    iconColor: 'text-success',
                    columns: [
                        {
                            field: 'item_code',
                            label: 'Malzeme Kodu',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => `<span class="text-info fw-bold">${value || '-'}</span>`
                        },
                        {
                            field: 'item_name',
                            label: 'Malzeme Adı',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => `<span>${value || '-'}</span>`
                        },
                        {
                            field: 'item_unit',
                            label: 'Birim',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => `<span class="text-muted">${value || '-'}</span>`
                        },
                        {
                            field: 'item_description',
                            label: 'Açıklama',
                            sortable: false,
                            type: 'text',
                            formatter: (value) => `<span>${value || '-'}</span>`
                        },
                        {
                            field: 'quantity',
                            label: 'Miktar',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => {
                                const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
                                return `<span class="fw-bold">${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
                            }
                        },
                        {
                            field: 'unit_price',
                            label: 'Birim Fiyat (€)',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => {
                                const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
                                return `€${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            }
                        },
                        {
                            field: 'amount_eur',
                            label: 'Tutar (€)',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => {
                                const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
                                return `<span class="fw-bold text-success">€${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
                            }
                        }
                    ],
                    onRowClick: null,
                    onSort: null,
                    onPageChange: null,
                    showPagination: false,
                    showSearch: false,
                    showExport: false,
                    skeletonLoading: false
                });

                // Update table with data
                linesTable.updateData(linesTableData, {
                    totalItems: linesTableData.length,
                    currentPage: 1,
                    pageSize: linesTableData.length
                });
            }, 100);
        } else {
            modal.addCustomSection({
                title: 'Malzeme Satırları',
                icon: 'fas fa-table',
                iconColor: 'text-success',
                customContent: '<div class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Bu iş için malzeme satırı bulunamadı.</div>'
            });
            modal.render().show();
        }
        
    } catch (error) {
        console.error('Error loading material details:', error);
        showError('Malzeme detayları yüklenirken bir hata oluştu.');
    }
}

// Show subcontractor details modal
async function showSubcontractorDetails(jobNo) {
    if (!jobNo) {
        showError('İş numarası bulunamadı.');
        return;
    }
    
    try {
        // Ensure container exists
        ensureModalContainer('subcontractor-details-modal-container');
        
        // Fetch subcontractor cost breakdown for the job
        const data = await fetchSubcontractorCostBreakdown(jobNo);
        const lines = Array.isArray(data?.lines) ? data.lines : [];
        const adjustments = Array.isArray(data?.adjustments) ? data.adjustments : [];
        
        // Create display modal
        const modal = new DisplayModal('subcontractor-details-modal-container', {
            title: `${jobNo} - Taşeron Detayları`,
            icon: 'fas fa-handshake',
            size: 'xl',
            showEditButton: false
        });
        
        const totalEur = typeof data?.total_eur === 'string' ? parseFloat(data.total_eur) : (data?.total_eur || 0);
        
        // Add summary section
        modal.addSection({
            title: 'Özet',
            icon: 'fas fa-chart-pie',
            iconColor: 'text-warning',
            fields: [
                {
                    id: 'total_work_lines',
                    label: 'İş Satırı',
                    value: lines.length,
                    type: 'number',
                    icon: 'fas fa-list',
                    colSize: 4
                },
                {
                    id: 'total_adjustments',
                    label: 'Düzeltme Satırı',
                    value: adjustments.length,
                    type: 'number',
                    icon: 'fas fa-edit',
                    colSize: 4
                },
                {
                    id: 'total_eur',
                    label: 'Toplam (EUR)',
                    value: totalEur,
                    type: 'text',
                    icon: 'fas fa-euro-sign',
                    format: (value) => formatMoney(value),
                    colSize: 4
                }
            ]
        });
        
        // Add work lines table
        if (lines.length > 0) {
            const linesTableData = lines.map((line, index) => ({
                id: `line-${index}`,
                statement_period: line.statement_year && line.statement_month
                    ? `${line.statement_month}.${line.statement_year}`
                    : '-',
                subcontractor_name: line.subcontractor_name || '-',
                delta_progress: line.delta_progress || 0,
                cost_amount: line.cost_amount || 0,
                cost_currency: line.cost_currency || 'TRY',
                cost_amount_eur: line.cost_amount_eur || 0
            }));

            const tableHtml = `
                <div id="subcontractor-lines-table-container"></div>
            `;
            
            modal.addCustomSection({
                title: null,
                customContent: tableHtml
            });

            // Render and show modal first
            modal.render().show();

            // Initialize work lines table after modal is shown
            setTimeout(() => {
                const linesTable = new TableComponent('subcontractor-lines-table-container', {
                    title: 'İş Satırları',
                    columns: [
                        {
                            field: 'statement_period',
                            label: 'Dönem',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => value || '-'
                        },
                        {
                            field: 'subcontractor_name',
                            label: 'Taşeron',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => value || '-'
                        },
                        {
                            field: 'delta_progress',
                            label: 'Delta İlerleme (%)',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => formatPct(value)
                        },
                        {
                            field: 'cost_amount',
                            label: 'Tutar',
                            sortable: true,
                            type: 'text',
                            formatter: (value, rowData) => {
                                const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
                                const currency = rowData.cost_currency || 'TRY';
                                return `${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
                            }
                        },
                        {
                            field: 'cost_amount_eur',
                            label: 'EUR Tutarı',
                            sortable: true,
                            sortable: true,
                            type: 'text',
                            formatter: (value) => formatMoney(value)
                        }
                    ],
                    onRowClick: null,
                    onSort: null,
                    onPageChange: null,
                    showPagination: false,
                    showSearch: false,
                    showExport: false,
                    skeletonLoading: false
                });

                // Update table with data
                linesTable.updateData(linesTableData, {
                    totalItems: linesTableData.length,
                    currentPage: 1,
                    pageSize: linesTableData.length
                });
            }, 100);
        } else {
            modal.addCustomSection({
                title: 'İş Satırları',
                icon: 'fas fa-table',
                iconColor: 'text-warning',
                customContent: '<div class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Bu iş için taşeron iş satırı bulunamadı.</div>'
            });
            modal.render().show();
        }

        if (adjustments.length > 0) {
            const adjustmentsTableData = adjustments.map((adj, index) => ({
                id: `adj-${index}`,
                adjustment_type: adj.adjustment_type || '-',
                reason: adj.reason || '-',
                amount: adj.amount || 0,
                cost_currency: adj.cost_currency || 'TRY',
                cost_amount_eur: adj.cost_amount_eur || 0
            }));

            const adjustmentsTableHtml = `
                <div id="subcontractor-adjustments-table-container"></div>
            `;

            modal.addCustomSection({
                title: null,
                customContent: adjustmentsTableHtml
            });

            modal.render();

            setTimeout(() => {
                const adjustmentsTable = new TableComponent('subcontractor-adjustments-table-container', {
                    title: 'Düzeltmeler',
                    columns: [
                        {
                            field: 'adjustment_type',
                            label: 'Tür',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => value || '-'
                        },
                        {
                            field: 'reason',
                            label: 'Açıklama',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => value || '-'
                        },
                        {
                            field: 'amount',
                            label: 'Tutar',
                            sortable: true,
                            type: 'text',
                            formatter: (value, rowData) => {
                                const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
                                const currency = rowData.cost_currency || 'TRY';
                                return `${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
                            }
                        },
                        {
                            field: 'cost_amount_eur',
                            label: 'EUR Tutarı',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => formatMoney(value)
                        }
                    ],
                    onRowClick: null,
                    onSort: null,
                    onPageChange: null,
                    showPagination: false,
                    showSearch: false,
                    showExport: false,
                    skeletonLoading: false
                });

                adjustmentsTable.updateData(adjustmentsTableData, {
                    totalItems: adjustmentsTableData.length,
                    currentPage: 1,
                    pageSize: adjustmentsTableData.length
                });
            }, 100);
        } else {
            modal.addCustomSection({
                title: 'Düzeltmeler',
                icon: 'fas fa-table',
                iconColor: 'text-warning',
                customContent: '<div class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Bu iş için taşeron düzeltmesi bulunamadı.</div>'
            });
            modal.render().show();
        }
        
    } catch (error) {
        console.error('Error loading subcontractor details:', error);
        showError('Taşeron detayları yüklenirken bir hata oluştu.');
    }
}

// Make functions globally accessible for button onclick
window.showJobDetails = showJobDetails;
window.showMachiningDetails = showMachiningDetails;
window.showWeldingDetails = showWeldingDetails;
window.showMaterialDetails = showMaterialDetails;
window.showSubcontractorDetails = showSubcontractorDetails;