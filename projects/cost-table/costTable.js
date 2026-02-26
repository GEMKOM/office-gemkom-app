import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { canViewCostTab } from '../../authService.js';
import { getCostTable, getCostChildren } from '../../apis/projects/cost.js';
import { listCustomers } from '../../apis/projects/customers.js';

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
    if (!canViewCostTab()) {
        alert('Maliyet tablosuna erişim yetkiniz bulunmamaktadır.');
        window.location.href = '/projects';
        return;
    }
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
                width: '7rem',
                formatter: (v, row) => {
                    if (!v) return '-';
                    const level = row.hierarchy_level ?? 0;
                    const url = `/projects/project-tracking/?job_no=${encodeURIComponent(v)}`;
                    if (level > 0) {
                        return `<a href="${url}" class="text-secondary text-decoration-none text-nowrap" style="font-weight:600;font-size:0.9rem;">${v}</a>`;
                    }
                    return `<a href="${url}" class="fw-bold text-primary text-decoration-none text-nowrap">${v}</a>`;
                }
            },
            { field: 'title', label: 'Başlık', sortable: false, formatter: (v, row) => (v || '-') },
            { field: 'customer_name', label: 'Müşteri', sortable: false, formatter: v => (v || '-') },
            { field: 'status', label: 'Durum', sortable: true, formatter: v => statusBadge(v) },
            { field: 'labor_cost', label: 'İşçilik', sortable: true, formatter: formatMoney },
            { field: 'material_cost', label: 'Malzeme', sortable: true, formatter: formatMoney },
            { field: 'subcontractor_cost', label: 'Taşeron', sortable: true, formatter: formatMoney },
            { field: 'paint_cost', label: 'Boya', sortable: true, formatter: formatMoney },
            { field: 'qc_cost', label: 'KK', sortable: true, formatter: formatMoney },
            { field: 'shipping_cost', label: 'Sevkiyat', sortable: true, formatter: formatMoney },
            { field: 'paint_material_cost', label: 'Boya Malzemesi', sortable: true, formatter: formatMoney },
            { field: 'general_expenses_cost', label: 'Genel Giderler', sortable: true, formatter: formatMoney },
            { field: 'employee_overhead_cost', label: 'Personel Gen. Gider', sortable: true, formatter: formatMoney },
            { field: 'actual_total_cost', label: 'Toplam Maliyet', sortable: true, formatter: v => `<span class="fw-bold">${formatMoney(v)}</span>` },
            { field: 'estimated_cost', label: 'Tahmini', sortable: true, formatter: formatMoney },
            { field: 'selling_price', label: 'Satış Fiyatı', sortable: true, formatter: (v, row) => (v != null && v !== '' ? formatMoney(v) + (row.selling_price_currency ? ` <small class="text-muted">${row.selling_price_currency}</small>` : '') : '<span class="text-muted">-</span>') },
            { field: 'margin_eur', label: 'Marj (€)', sortable: true, formatter: v => (v != null && v !== '' ? formatMoney(v) : '<span class="text-muted">-</span>') },
            { field: 'margin_pct', label: 'Marj %', sortable: true, formatter: v => (v != null && v !== '' ? formatPct(v) : '<span class="text-muted">-</span>') },
            { field: 'last_updated', label: 'Son Güncelleme', sortable: false, formatter: formatDate }
        ],
        data: [],
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
        exportFileName: 'maliyet-tablosu'
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
