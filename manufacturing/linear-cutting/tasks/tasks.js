import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { showNotification } from '../../../components/notification/notification.js';

import { fetchMachinesDropdown } from '../../../apis/machines.js';
import {
    listLinearCuttingTasks,
    getLinearCuttingTask,
    patchLinearCuttingTask,
    markLinearCuttingTaskCompleted,
    unmarkLinearCuttingTaskCompleted
} from '../../../apis/linear_cutting/tasks.js';

// State
let tasksFilters = null;
let tasksTable = null;
let detailsModal = null;
let editModal = null;
let completeConfirmModal = null;
let machines = [];

let currentPage = 1;
let currentPageSize = 20;
let currentOrdering = '-completion_date';
let currentSortField = 'completion_date';
let currentSortDirection = 'desc';
let isLoading = false;

function normalizePaginated(data) {
    if (Array.isArray(data)) return { results: data, count: data.length };
    if (data && Array.isArray(data.results)) return { results: data.results, count: data.count ?? data.results.length };
    return { results: [], count: 0 };
}

function escapeHtml(v) {
    return String(v ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escapeAttr(v) {
    // Attribute-safe escaping (no HTML entities that could break dataset values)
    return String(v ?? '').replaceAll('"', '&quot;');
}

// ─────────────────────────── BAR DIAGRAM (from cuts page) ───────────────────────────
function colorForIndex(i) {
    const palette = ['#0d6efd','#198754','#fd7e14','#6f42c1','#20c997','#dc3545','#0dcaf0','#ffc107'];
    return palette[i % palette.length];
}

const barCanvasDrawMap = new WeakMap(); // canvas -> { bar, kerfMm }

function scheduleDrawBar(canvas, tooltipEl) {
    const payload = barCanvasDrawMap.get(canvas);
    if (!payload) return;
    let tries = 0;
    const run = () => {
        const w = canvas.clientWidth || canvas.getBoundingClientRect?.().width || 0;
        if (w < 50 && tries < 10) {
            tries += 1;
            requestAnimationFrame(run);
            return;
        }
        drawBar(canvas, payload.bar, payload.kerfMm, tooltipEl);
    };
    requestAnimationFrame(run);
}

function drawBar(canvas, bar, kerfMm, tooltipEl) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 900;
    const H = 62;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const pad = 8, barY = 22, barH = 22;
    const barX = pad, barW = W - pad * 2;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f6f7f9';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const scale = barW / (bar.stock_length_mm || 1);
    const hitBoxes = [];

    (bar.cuts || []).forEach((cut, idx) => {
        const x = barX + (cut.offset_mm || 0) * scale;
        const w = Math.max(1, (cut.effective_mm || 0) * scale);
        ctx.fillStyle = colorForIndex(idx);
        ctx.beginPath(); ctx.roundRect(x, barY, w, barH, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (kerfMm > 0) {
            const kx = x + w, kw = Math.max(1, kerfMm * scale);
            ctx.fillStyle = 'rgba(0,0,0,.22)';
            ctx.fillRect(kx, barY, kw, barH);
        }
        hitBoxes.push({ x, y: barY, w, h: barH, cut });

        if (w > 55) {
            ctx.fillStyle = 'rgba(255,255,255,.95)';
            ctx.font = '600 11px system-ui';
            ctx.textBaseline = 'middle';
            const lbl = (cut.label ? `${cut.label} ` : '') + `${cut.nominal_mm ?? ''}mm`;
            ctx.fillText(lbl, x + 6, barY + barH / 2);
        }
    });

    const wasteW = Math.max(0, (bar.waste_mm || 0) * scale);
    if (wasteW > 0.5) {
        const wasteX = barX + barW - wasteW;
        ctx.save();
        ctx.beginPath(); ctx.roundRect(wasteX, barY, wasteW, barH, 4); ctx.clip();
        ctx.fillStyle = '#c6ccd2';
        ctx.fillRect(wasteX, barY, wasteW, barH);
        ctx.strokeStyle = 'rgba(0,0,0,.12)';
        ctx.lineWidth = 1;
        for (let i = -barH; i < wasteW + barH; i += 7) {
            ctx.beginPath();
            ctx.moveTo(wasteX + i, barY);
            ctx.lineTo(wasteX + i + barH, barY + barH);
            ctx.stroke();
        }
        ctx.restore();
        hitBoxes.push({
            x: wasteX, y: barY, w: wasteW, h: barH,
            cut: { label: 'Fire', nominal_mm: bar.waste_mm, effective_mm: bar.waste_mm, offset_mm: bar.stock_length_mm - bar.waste_mm, job_no: '' }
        });
    }

    ctx.fillStyle = '#6c757d'; ctx.font = '10px system-ui'; ctx.textBaseline = 'top';
    ctx.fillText('0', barX, 6);
    const endLabel = `${bar.stock_length_mm} mm`;
    ctx.fillText(endLabel, barX + barW - ctx.measureText(endLabel).width, 6);
    const mid = bar.stock_length_mm ? Math.round(bar.stock_length_mm / 2) : 0;
    const midLabel = `${mid}`;
    ctx.fillText(midLabel, barX + (barW / 2) - (ctx.measureText(midLabel).width / 2), 6);

    const fmt = v => (v == null || Number.isNaN(v)) ? '—' : String(v);
    canvas.onmousemove = e => {
        const r = canvas.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const hb = hitBoxes.find(h => mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h);
        if (!hb) { tooltipEl.style.display = 'none'; canvas.style.cursor = 'default'; return; }
        canvas.style.cursor = 'help';
        const c = hb.cut;
        tooltipEl.innerHTML = `
            <div style="font-weight:700;margin-bottom:4px;">${escapeHtml(c.label || '—')}</div>
            <div><span style="opacity:.7">Nominal:</span> ${fmt(c.nominal_mm)} mm</div>
            <div><span style="opacity:.7">Efektif:</span> ${fmt(c.effective_mm)} mm</div>
            <div><span style="opacity:.7">Offset:</span> ${fmt(c.offset_mm)} mm</div>
            ${c.job_no ? `<div><span style="opacity:.7">İş No:</span> ${escapeHtml(c.job_no)}</div>` : ''}`;
        tooltipEl.style.left = `${e.clientX + 14}px`;
        tooltipEl.style.top = `${e.clientY + 12}px`;
        tooltipEl.style.display = 'block';
    };
    canvas.onmouseleave = () => { tooltipEl.style.display = 'none'; canvas.style.cursor = 'default'; };
}

function formatDate(value) {
    if (!value) return '-';
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleString('tr-TR');
    } catch {
        return String(value);
    }
}

function buildQueryParams(page = 1) {
    const values = tasksFilters?.getFilterValues ? tasksFilters.getFilterValues() : {};
    const session = (values?.['session-filter'] || '').trim();
    const completed = values?.['completed-filter'] || '';
    const ordering = currentOrdering;

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(currentPageSize));
    if (session) params.set('session', session);
    if (completed !== '') params.set('completed', completed);
    if (ordering) params.set('ordering', ordering);
    return params;
}

function getMachineName(machine_fk) {
    const m = machines.find(x => String(x.id) === String(machine_fk));
    return m?.name || null;
}

async function loadMachines() {
    try {
        machines = await fetchMachinesDropdown('linear_cutting');
    } catch (e) {
        machines = [];
        console.error(e);
    }
}

async function loadTasks(page = 1) {
    if (isLoading) return;
    isLoading = true;
    currentPage = page;
    if (tasksTable) tasksTable.setLoading(true);
    try {
        const params = buildQueryParams(page);
        const data = await listLinearCuttingTasks(params);
        const { results, count } = normalizePaginated(data);
        tasksTable?.updateData(results, count, page);
    } catch (e) {
        console.error(e);
        showNotification(e.message || 'Görevler yüklenemedi', 'error');
        tasksTable?.updateData([], 0, page);
    } finally {
        if (tasksTable) tasksTable.setLoading(false);
        isLoading = false;
    }
}

async function showTaskDetails(taskKey) {
    try {
        const task = await getLinearCuttingTask(taskKey);
        if (!task) return;

        detailsModal = new DisplayModal('task-details-modal-container', {
            title: `Görev Detayı - ${task.key}`,
            icon: 'fas fa-tasks',
            size: 'lg',
            showEditButton: false
        });

        const completed = !!task.completion_date;
        const statusFmt = () => completed
            ? '<span class="badge bg-success"><i class="fas fa-check me-1"></i>Tamamlandı</span>'
            : '<span class="badge bg-warning text-dark"><i class="fas fa-clock me-1"></i>Bekliyor</span>';

        const planTxt = `${task.session || ''}${task.session_title ? ` — ${task.session_title}` : ''}`.trim() || '-';
        const matTxt = task.item_name || task.item_code || task.material || '-';
        const hasLayout = Array.isArray(task.layout_json) && task.layout_json.length;

        detailsModal.addSection({
            title: 'Özet',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary',
            fields: [
                { id: 'k', label: 'Görev No', value: task.key, type: 'text', colSize: 4, copyable: true },
                { id: 's', label: 'Kesim Planı', value: planTxt, type: 'text', colSize: 8 },
                { id: 'n', label: 'Ad', value: task.name || '-', type: 'text', colSize: 12 },
                { id: 'st', label: 'Durum', value: completed ? 'Tamamlandı' : 'Bekliyor', type: 'text', colSize: 3, format: statusFmt },
                { id: 'it', label: 'Malzeme', value: matTxt, type: 'text', colSize: 6 },
                { id: 'mc', label: 'Makine', value: task.machine_name || getMachineName(task.machine_fk) || '-', type: 'text', colSize: 3 },
            ]
        });

        detailsModal.addCustomContent(hasLayout ? `
            <div class="mt-2">
                <div class="form-label">Yerleşim</div>
                <div class="lc-canvas-wrap">
                    <div class="lc-bar-header">
                        <div class="lc-bar-title">
                            Bar #${task.bar_index ?? '—'}
                            <span class="text-muted" style="font-weight:500;">(${task.stock_length_mm ?? '—'} mm)</span>
                        </div>
                        <div class="lc-bar-meta">
                            Fire: <strong>${task.waste_mm ?? '—'} mm</strong> · Kesim: <strong>${task.layout_json.length}</strong>
                        </div>
                    </div>
                    <canvas id="lc-task-bar-canvas" aria-label="Bar görseli"></canvas>
                    <div class="mt-2 text-muted" style="font-size:.85rem;">
                        Parçaların üzerine gelince detayları görebilirsiniz.
                    </div>
                </div>
            </div>
        ` : `
            <div class="mt-2">
                <div class="form-label">Yerleşim</div>
                <div class="text-muted">Bu görev için yerleşim bilgisi bulunamadı.</div>
            </div>
        `);

        if (task.description) {
            detailsModal.addSection({
                title: 'Açıklama',
                icon: 'fas fa-align-left',
                iconColor: 'text-muted',
                fields: [{ id: 'd', label: 'Açıklama', value: task.description, type: 'textarea', colSize: 12 }]
            });
        }

        if (hasLayout) {
            detailsModal.addCustomSection({
                title: 'Kesim Listesi',
                icon: 'fas fa-stream',
                iconColor: 'text-success',
                customContent: `<div id="lc-task-layout-table" class="mt-2"></div>`
            });
        }

        detailsModal.render().show();

        // Draw bar canvas (same as cuts optimization)
        if (hasLayout) {
            const canvas = document.getElementById('lc-task-bar-canvas');
            const tooltipEl = document.getElementById('lc-task-tooltip');
            if (canvas && tooltipEl) {
                barCanvasDrawMap.set(canvas, {
                    bar: {
                        stock_length_mm: task.stock_length_mm ?? 0,
                        waste_mm: task.waste_mm ?? 0,
                        cuts: task.layout_json
                    },
                    kerfMm: 0 // Task detail response doesn't include kerf; keep diagram clean.
                });
                scheduleDrawBar(canvas, tooltipEl);
            }
        }

        if (hasLayout) {
            new TableComponent('lc-task-layout-table', {
                title: '',
                icon: 'fas fa-stream',
                iconColor: 'text-success',
                columns: [
                    { field: 'job_no', label: 'İş No', sortable: true, width: '18%', formatter: v => v || '-' },
                    { field: 'label', label: 'Parça', sortable: true, width: '34%', formatter: v => v || '-' },
                    { field: 'nominal_mm', label: 'Nominal (mm)', sortable: true, width: '16%', formatter: v => v ?? '-' },
                    { field: 'effective_mm', label: 'Effective (mm)', sortable: true, width: '16%', formatter: v => v ?? '-' },
                    { field: 'offset_mm', label: 'Offset (mm)', sortable: true, width: '16%', formatter: v => v ?? '-' }
                ],
                data: task.layout_json,
                sortable: true,
                pagination: false,
                exportable: false,
                refreshable: false,
                striped: true,
                small: true,
                emptyMessage: 'Kesim bulunamadı',
                emptyIcon: 'fas fa-stream'
            });
        }
    } catch (e) {
        console.error(e);
        showNotification('Detay yüklenemedi', 'error');
    }
}

function openEditModal(task) {
    editModal = new EditModal('task-edit-modal-container', {
        title: `Görev Düzenle - ${task.key}`,
        icon: 'fas fa-edit',
        saveButtonText: 'Kaydet',
        size: 'lg'
    });

    const machineOptions = [
        { value: '', label: 'Makine Seçin...' },
        ...machines.map(m => ({ value: String(m.id), label: m.name }))
    ];

    editModal
        .addSection({
            title: 'Görev Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary',
            fields: [
                { id: 't-key', name: 'key', label: 'Görev No', type: 'text', value: task.key, colSize: 6, readonly: true },
                { id: 't-name', name: 'name', label: 'Ad', type: 'text', value: task.name || '', colSize: 6, readonly: true },
                {
                    id: 't-machine',
                    name: 'machine_fk',
                    label: 'Makine',
                    type: 'select',
                    options: machineOptions,
                    value: task.machine_fk != null ? String(task.machine_fk) : '',
                    colSize: 6
                },
                {
                    id: 't-est',
                    name: 'estimated_hours',
                    label: 'Tahmini Süre (saat)',
                    type: 'number',
                    value: task.estimated_hours ?? '',
                    step: '0.1',
                    min: '0',
                    colSize: 6
                },
                {
                    id: 't-desc',
                    name: 'description',
                    label: 'Açıklama',
                    type: 'textarea',
                    value: task.description || '',
                    rows: 3,
                    colSize: 12
                }
            ]
        })
        .render()
        .onSaveCallback(async (data) => {
            try {
                const payload = {
                    machine_fk: data.machine_fk ? Number(data.machine_fk) : null,
                    estimated_hours: data.estimated_hours === '' ? null : Number(data.estimated_hours),
                    description: data.description ?? ''
                };

                await patchLinearCuttingTask(task.key, payload);
                showNotification('Görev güncellendi', 'success');
                await loadTasks(currentPage);
            } catch (e) {
                console.error(e);
                showNotification(e.message || 'Kaydedilemedi', 'error');
            }
        });

    editModal.show();
}

async function toggleCompleted(taskKey, shouldComplete) {
    try {
        if (shouldComplete) {
            await markLinearCuttingTaskCompleted(taskKey);
            showNotification('Görev tamamlandı', 'success');
        } else {
            await unmarkLinearCuttingTaskCompleted(taskKey);
            showNotification('Görev tamamlanmadı olarak işaretlendi', 'info');
        }
        await loadTasks(currentPage);
    } catch (e) {
        console.error(e);
        showNotification(e.message || 'İşlem başarısız', 'error');
    }
}

function initHeader() {
    new HeaderComponent({
        title: 'Lineer Kesim Görevler',
        subtitle: 'Bar görevleri listesi ve yönetimi',
        icon: 'tasks',
        showBackButton: 'block',
        showCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'block',
        onBackClick: () => (window.location.href = '/manufacturing/linear-cutting/'),
        onRefreshClick: () => loadTasks(1)
    });
}

function initFilters() {
    tasksFilters = new FiltersComponent('filters-placeholder', {
        title: 'Görev Filtreleri',
        onApply: () => loadTasks(1),
        onClear: () => {
            loadTasks(1);
            showNotification('Filtreler temizlendi', 'info');
        }
    });

    tasksFilters.addTextFilter({
        id: 'session-filter',
        label: 'Kesim Planı',
        placeholder: 'LC-0004',
        colSize: 2
    });

    tasksFilters.addDropdownFilter({
        id: 'completed-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'false', label: 'Tamamlanmamış' },
            { value: 'true', label: 'Tamamlanan' }
        ],
        colSize: 2
    });
}

function initTable() {
    tasksTable = new TableComponent('tasks-table-container', {
        title: 'Görev Listesi',
        icon: 'fas fa-table',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'key',
                label: 'Görev No',
                sortable: true,
                width: '12%',
                formatter: (v) => `<span class="status-badge status-blue" style="text-transform:none; letter-spacing:0;">${escapeHtml(v || '-')}</span>`
            },
            {
                field: 'session',
                label: 'Plan',
                sortable: true,
                width: '10%',
                formatter: (v, row) => {
                    const key = v || row.session || '';
                    const title = row.session_title || '';
                    const txt = title ? `${key} — ${title}` : (key || '-');
                    return escapeHtml(txt);
                }
            },
            {
                field: 'item_name',
                label: 'Malzeme',
                sortable: true,
                width: '18%',
                formatter: (v, row) => {
                    const name = v || row.item_name || '';
                    const code = row.item_code || '';
                    const material = row.material || '';
                    const txt = name || code || material || '-';
                    return escapeHtml(txt);
                }
            },
            {
                field: 'bar_index',
                label: 'Bar',
                sortable: true,
                width: '6%',
                formatter: (v) => (v != null ? String(v) : '-')
            },
            {
                field: 'stock_length_mm',
                label: 'Stok (mm)',
                sortable: true,
                width: '10%',
                type: 'number',
                formatter: (v) => (v != null ? `${v} mm` : '-')
            },
            {
                field: 'machine_name',
                label: 'Makine',
                sortable: true,
                width: '12%',
                formatter: (v, row) => escapeHtml(v || getMachineName(row.machine_fk) || '-')
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: false,
                width: '10%',
                formatter: (_, row) => {
                    const isCompleted = !!row.completion_date;
                    const statusClass = isCompleted ? 'status-green' : 'status-yellow';
                    const statusText = isCompleted ? 'Tamamlandı' : 'Bekliyor';
                    const taskKey = escapeAttr(row.key || '');

                    return `<button type="button" class="btn btn-sm status-badge ${statusClass} editable-status"
                        data-task-key="${taskKey}"
                        data-is-completed="${isCompleted}"
                        style="border:none; cursor:pointer; padding:0.25rem 0.5rem; font-size:0.875rem;"
                        title="Durumu değiştirmek için tıklayın">
                        ${statusText}
                    </button>`;
                }
            },
            {
                field: 'estimated_hours',
                label: 'Tahmini Saat',
                sortable: true,
                width: '10%',
                type: 'number',
                formatter: (v) => (v ? `${v} saat` : '-')
            },
            {
                field: 'total_hours_spent',
                label: 'Harcanan Saat',
                sortable: true,
                width: '10%',
                type: 'number',
                formatter: (v) => (v ? `${v} saat` : '0 saat')
            }
        ],
        data: [],
        loading: true,
        sortable: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: currentPageSize,
        currentPage: 1,
        totalItems: 0,
        onPageChange: (p) => loadTasks(p),
        onPageSizeChange: (newSize) => {
            currentPageSize = newSize;
            if (tasksTable) tasksTable.options.itemsPerPage = newSize;
            currentPage = 1;
            loadTasks(1);
        },
        onSort: (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            // Map TableComponent sort to DRF ordering
            if (field === 'completion_date') {
                currentOrdering = direction === 'desc' ? '-completion_date' : 'completion_date';
            } else if (field === 'bar_index') {
                currentOrdering = direction === 'desc' ? '-bar_index' : 'bar_index';
            } else if (field === 'estimated_hours') {
                currentOrdering = direction === 'desc' ? '-estimated_hours' : 'estimated_hours';
            } else if (field === 'total_hours_spent') {
                currentOrdering = direction === 'desc' ? '-total_hours_spent' : 'total_hours_spent';
            } else if (field === 'key') {
                currentOrdering = direction === 'desc' ? '-key' : 'key';
            }
            loadTasks(1);
        },
        exportable: true,
        refreshable: true,
        onRefresh: () => loadTasks(currentPage),
        striped: false,
        small: false,
        emptyMessage: 'Görev bulunamadı',
        emptyIcon: 'fas fa-tasks',
        rowAttributes: (row) => `data-task-key="${escapeHtml(row.key)}" class="data-update"`,
        actions: [
            {
                key: 'view',
                label: 'Detaylar',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                title: 'Görev Detayları',
                onClick: (row) => showTaskDetails(row.key)
            },
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-warning',
                title: 'Düzenle',
                onClick: async (row) => {
                    try {
                        const task = await getLinearCuttingTask(row.key);
                        openEditModal(task);
                    } catch (e) {
                        console.error(e);
                        showNotification('Görev yüklenemedi', 'error');
                    }
                }
            }
        ]
    });
}

function wireEvents() {
    document.body.addEventListener('click', async (e) => {
        // Row status toggle (same UX as CNC cuts)
        const statusBtn = e.target.closest('.editable-status');
        if (statusBtn) {
            e.preventDefault();
            const taskKey = statusBtn.getAttribute('data-task-key');
            const isCompleted = statusBtn.getAttribute('data-is-completed') === 'true';
            if (!taskKey) return;

            if (!isCompleted) {
                completeConfirmModal = new ConfirmationModal('task-complete-confirm-modal-container', {
                    title: 'Görev Tamamlama',
                    icon: 'fas fa-check-circle',
                    confirmText: 'Evet, Tamamla',
                    cancelText: 'İptal',
                    confirmButtonClass: 'btn-success'
                });
                completeConfirmModal.show({
                    message: 'Bu görevi tamamlandı olarak işaretlemek istiyor musunuz?',
                    onConfirm: async () => toggleCompleted(taskKey, true)
                });
            } else {
                await toggleCompleted(taskKey, false);
            }
            return;
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    initHeader();
    initFilters();
    initTable();
    wireEvents();
    await loadMachines();
    await loadTasks(1);
});

