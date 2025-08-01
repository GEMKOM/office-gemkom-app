import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';
import { fetchMachines } from '../generic/machines.js';
import { extractResultsFromResponse } from '../generic/paginationHelper.js';

const columns = [
    { key: 'key', label: 'TI No' },
    { key: 'name', label: 'Ad' },
    { key: 'job_no', label: 'İş No' },
    { key: 'image_no', label: 'Resim No' },
    { key: 'position_no', label: 'Poz No' },
    { key: 'quantity', label: 'Adet' },
    { key: 'machine_name', label: 'Makine' },
    { key: 'estimated_hours', label: 'Tahmini Saat' },
    { key: 'total_hours_spent', label: 'Harcanan Saat' },
    { key: 'finish_time', label: 'Bitmesi Gereken Tarih' },
    { key: 'completion_date', label: 'Tamamlanma Tarihi' },
    { key: 'completed_by_username', label: 'Tamamlayan' },
    { key: 'status', label: 'Durum' },
    { key: 'actions', label: '' },
];

// Track current page at module level
let currentPage = 1;
let lastQueryParams = '';
// Track ordering
let currentOrdering = { field: 'job_no', direction: 'asc' };
// Store machines for dropdown
let availableMachines = [];

function buildTaskListQuery(page = 1) {
    let key = document.getElementById('key').value.trim();
    const name = document.getElementById('name').value.trim();
    const job_no = document.getElementById('job_no').value.trim();
    const image_no = document.getElementById('image_no').value.trim();
    const position_no = document.getElementById('position_no').value.trim();
    const completed_by = document.getElementById('completed_by').value.trim();
    const completion_date_gte = document.getElementById('completion_date_gte').value;
    const completion_date_lte = document.getElementById('completion_date_lte').value;
    const status = document.getElementById('status_filter').value;
    const machine_filter = document.getElementById('machine_filter').value;
    let params = [];
    // Accept numbers for TI Numarası and prepend 'TI-' if needed
    if (key) {
        if (/^\d+$/.test(key)) {
            key = 'TI-' + key;
        }
        params.push(`key=${encodeURIComponent(key)}`);
    }
    if (name) params.push(`name=${encodeURIComponent(name)}`);
    if (job_no) params.push(`job_no=${encodeURIComponent(job_no)}`);
    if (image_no) params.push(`image_no=${encodeURIComponent(image_no)}`);
    if (position_no) params.push(`position_no=${encodeURIComponent(position_no)}`);
    if (completed_by) params.push(`completed_by=${encodeURIComponent(completed_by)}`);
    if (completion_date_gte) {
        const ts = new Date(completion_date_gte).getTime();
        if (!isNaN(ts)) params.push(`completion_date__gte=${ts}`);
    }
    if (completion_date_lte) {
        const ts = new Date(completion_date_lte).getTime();
        if (!isNaN(ts)) params.push(`completion_date__lte=${ts}`);
    }
    if (status === 'active') params.push('completion_date__isnull=true');
    if (status === 'completed') params.push('completion_date__isnull=false');
    if (machine_filter) params.push(`machine_fk=${encodeURIComponent(machine_filter)}`);
    params.push(`page=${page}`);
    params.push(`page_size=50`);
    // Add ordering param if set
    if (currentOrdering.field) {
        const prefix = currentOrdering.direction === 'desc' ? '-' : '';
        params.push(`ordering=${prefix}${currentOrdering.field}`);
    }
    lastQueryParams = params.join('&');
    return params.length ? '?' + params.join('&') : '';
}

// Add Enter key support for all filter inputs
export async function showTaskListSection() {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;
    mainContent.innerHTML = `
        <style>
            .editable-cell {
                position: relative;
                transition: background-color 0.2s;
            }
            .editable-cell:hover {
                background-color: #f8f9fa !important;
                border: 1px solid #007bff !important;
            }
            .editable-cell input,
            .editable-cell select {
                border: none;
                background: transparent;
                width: 100%;
                padding: 2px 4px;
                font-size: inherit;
            }
            .editable-cell input:focus,
            .editable-cell select:focus {
                outline: 2px solid #007bff;
                background: white;
            }
            .editable-cell.editing {
                background-color: #fff3cd !important;
                border: 2px solid #ffc107 !important;
            }
            
            /* Prevent text wrapping for specific columns */
            .table th:nth-child(1),
            .table td:nth-child(1) {
                white-space: nowrap;
                min-width: 80px;
            }
            
            .table th:nth-child(3),
            .table td:nth-child(3) {
                white-space: nowrap;
                min-width: 100px;
            }
            
            /* Ensure table can scroll horizontally */
            .table-responsive {
                overflow-x: auto;
            }
        </style>
        <div class="row mb-3">
            <div class="col-12">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3 class="mb-0">Talaşlı İmalat İşler</h3>
                    <button type="button" id="show-hold-tasks-btn" class="btn btn-warning">
                        <i class="fas fa-pause"></i> Mazeret İşleri (W)
                    </button>
                </div>
                <form id="task-list-filters" class="row g-3 align-items-end">
                    <div class="col-md-2">
                        <label for="key" class="form-label">TI Numarası</label>
                        <input type="text" class="form-control" id="key" placeholder="TI-123">
                    </div>
                    <div class="col-md-2">
                        <label for="name" class="form-label">Ad</label>
                        <input type="text" class="form-control" id="name" placeholder="Ad">
                    </div>
                    <div class="col-md-2">
                        <label for="job_no" class="form-label">İş No</label>
                        <input type="text" class="form-control" id="job_no" placeholder="İş No">
                    </div>
                    <div class="col-md-2">
                        <label for="image_no" class="form-label">Resim No</label>
                        <input type="text" class="form-control" id="image_no" placeholder="Resim No">
                    </div>
                    <div class="col-md-2">
                        <label for="position_no" class="form-label">Pozisyon No</label>
                        <input type="text" class="form-control" id="position_no" placeholder="Pozisyon No">
                    </div>
                    <div class="col-md-2">
                        <label for="completed_by" class="form-label">Tamamlayan</label>
                        <input type="text" class="form-control" id="completed_by" placeholder="Tamamlayan">
                    </div>
                    <div class="col-md-2">
                        <label for="completion_date_gte" class="form-label">Bitiş Tarihi (En Erken)</label>
                        <input type="date" class="form-control" id="completion_date_gte">
                    </div>
                    <div class="col-md-2">
                        <label for="completion_date_lte" class="form-label">Bitiş Tarihi (En Geç)</label>
                        <input type="date" class="form-control" id="completion_date_lte">
                    </div>
                    <div class="col-md-2">
                        <label for="status_filter" class="form-label">Durum</label>
                        <select class="form-select" id="status_filter">
                            <option value="">Hepsi</option>
                            <option value="active" selected>Aktif</option>
                            <option value="completed">Tamamlanmış</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label for="machine_filter" class="form-label">Makine</label>
                        <select class="form-select" id="machine_filter">
                            <option value="">Tüm Makineler</option>
                            <!-- Machine options will be loaded dynamically -->
                        </select>
                    </div>
                    <div class="col-md-2 mt-2">
                        <button type="button" id="fetch-task-list-btn" class="btn btn-primary w-100">Listele</button>
                    </div>
                </form>
            </div>
        </div>
        <div class="row">
            <div class="col-12">
                <div id="task-list-table-container"></div>
            </div>
        </div>
    `;

    document.getElementById('fetch-task-list-btn').addEventListener('click', async () => {
        currentPage = 1; // Reset to first page on new filter
        await renderTaskListTable(1);
    });
    
    // Fetch machines for dropdown
    try {
        availableMachines = await fetchMachines('machining');
        populateMachineFilter(availableMachines);
    } catch (error) {
        console.error('Error fetching machines:', error);
        availableMachines = [];
    }
    
    // Initial fetch
    document.getElementById('fetch-task-list-btn').click();

    // Add event listener for hold tasks button
    document.getElementById('show-hold-tasks-btn').addEventListener('click', async () => {
        await showHoldTasks();
    });

    // Add Enter key support for all filter inputs
    document.querySelectorAll('#task-list-filters input, #task-list-filters select').forEach(input => {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('fetch-task-list-btn').click();
            }
        });
    });
}

    // Add Enter key support for all filter inputs
    document.querySelectorAll('#task-list-filters input, #task-list-filters select').forEach(input => {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('fetch-task-list-btn').click();
            }
        });
    });


// Function to populate machine filter dropdown
function populateMachineFilter(machines) {
    const machineFilter = document.getElementById('machine_filter');
    if (!machineFilter) return;
    
    // Clear existing options except the first one
    machineFilter.innerHTML = '<option value="">Tüm Makineler</option>';
    
    // Add machine options
    machines.forEach(machine => {
        const option = document.createElement('option');
        option.value = machine.id;
        option.textContent = machine.name || `Makine ${machine.id}`;
        machineFilter.appendChild(option);
    });
}

async function renderTaskListTable(page = currentPage) {
    const container = document.getElementById('task-list-table-container');
    container.innerHTML = '<div>Yükleniyor...</div>';
    try {
        const query = buildTaskListQuery(page);
        const url = `${backendBase}/machining/tasks/${query}`;
        const resp = await authedFetch(url);
        if (!resp.ok) throw new Error('Liste alınamadı');
        const result = await resp.json();
        const data = extractResultsFromResponse(result);
        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<div>Sonuç bulunamadı.</div>';
            return;
        }
        // Pagination controls (top)
        let html = `<div class="table-responsive">`;
        html += renderPagination(result, page);
        html += `<table class="table table-bordered table-sm"><thead><tr>`;
        for (const col of columns) {
            // Only allow ordering for data columns, not 'actions'
            if (col.key !== 'actions') {
                let arrow = '';
                if (currentOrdering.field === col.key) {
                    arrow = currentOrdering.direction === 'asc' ? ' ▲' : ' ▼';
                }
                html += `<th class="sortable-col" data-key="${col.key}" style="cursor:pointer;">${col.label}${arrow}</th>`;
            } else {
                html += `<th>${col.label}</th>`;
            }
        }
        html += '</tr></thead><tbody>';
        for (const row of data) {
            html += '<tr>';
            for (const col of columns) {
                let val;
                let isEditable = false;
                let inputType = 'text';
                let inputValue = '';
                
                if (col.key === 'status') {
                    const isCompleted = !!row.completion_date;
                    val = isCompleted ? 
                        '<span class="badge bg-primary">Tamamlandı</span>' : 
                        '<span class="badge bg-success">Aktif</span>';
                    isEditable = true;
                    inputType = 'select';
                    inputValue = isCompleted ? 'completed' : 'active';
                } else if (col.key === 'key') {
                    val = row.key ? `<a href="https://gemkom-1.atlassian.net/browse/${row.key}" target="_blank">${row.key}</a>` : '';
                    // Key is not editable
                } else if (col.key === 'completion_date') {
                    val = row.completion_date ? new Date(row.completion_date).toLocaleString('tr-TR') : '';
                    // Completion date is not editable (managed by status)
                } else if (col.key === 'finish_time') {
                    val = row.finish_time ? new Date(row.finish_time).toLocaleDateString('tr-TR') : '';
                    isEditable = true;
                    inputType = 'date';
                    inputValue = row.finish_time ? (typeof row.finish_time === 'string' && row.finish_time.length >= 10 ? row.finish_time.substring(0,10) : '') : '';
                } else if (col.key === 'estimated_hours') {
                    val = row.estimated_hours ? `${row.estimated_hours}` : '';
                    isEditable = true;
                    inputType = 'number';
                    inputValue = row.estimated_hours || '';
                } else if (col.key === 'total_hours_spent') {
                    val = row.total_hours_spent ? `${row.total_hours_spent}` : '';
                    // Total hours spent is not editable (calculated)
                } else if (col.key === 'machine_name') {
                    val = row.machine_name ? row.machine_name : '';
                    isEditable = true;
                    inputType = 'machine_select';
                    inputValue = row.machine_fk || '';
                } else if (col.key === 'actions') {
                    val = `<button class="btn btn-sm btn-danger delete-task-btn" data-key="${row.key}">X</button>`;
                    // Only keep delete button, remove edit and status buttons
                } else if (col.key === 'completed_by_username'){
                    val = row['completed_by_username'] ? row['completed_by_username'] : '';
                    // Completed by is not editable (managed by system)
                } else {
                    val = row[col.key] == null ? '' : row[col.key];
                    isEditable = true;
                    inputType = 'text';
                    inputValue = row[col.key] || '';
                }
                
                if (isEditable && col.key !== 'actions') {
                    html += `<td class="editable-cell" data-key="${row.key}" data-field="${col.key}" data-type="${inputType}" data-value="${inputValue}" style="cursor:pointer;">${val}</td>`;
                } else {
                    html += `<td>${val}</td>`;
                }
            }
            html += '</tr>';
        }
        html += `</tbody></table>`;
        // Pagination controls (bottom)
        html += renderPagination(result, page);
        html += `</div>`;
        
        container.innerHTML = html;

        // Add event listeners for sortable columns
        container.querySelectorAll('.sortable-col').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.getAttribute('data-key');
                if (!key) return;
                if (currentOrdering.field === key) {
                    // Toggle direction
                    currentOrdering.direction = currentOrdering.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    currentOrdering.field = key;
                    currentOrdering.direction = 'asc';
                }
                currentPage = 1; // Reset to first page on ordering change
                renderTaskListTable(1);
            });
        });

        // Add event listeners for editable cells
        container.querySelectorAll('.editable-cell').forEach(cell => {
            cell.addEventListener('click', function() {
                const key = this.getAttribute('data-key');
                const field = this.getAttribute('data-field');
                const type = this.getAttribute('data-type');
                const currentValue = this.getAttribute('data-value');
                
                // Don't edit if already editing
                if (this.querySelector('input, select')) return;
                
                let input;
                if (type === 'select') {
                    input = document.createElement('select');
                    input.className = 'form-control form-control-sm';
                    input.innerHTML = `
                        <option value="active" ${currentValue === 'active' ? 'selected' : ''}>Aktif</option>
                        <option value="completed" ${currentValue === 'completed' ? 'selected' : ''}>Tamamlandı</option>
                    `;
                } else if (type === 'machine_select') {
                    input = document.createElement('select');
                    input.className = 'form-control form-control-sm';
                    input.innerHTML = '<option value="">Makine Seçin</option>';
                    
                    // Add machine options
                    availableMachines.forEach(machine => {
                        const selected = currentValue == machine.id ? 'selected' : '';
                        input.innerHTML += `<option value="${machine.id}" ${selected}>${machine.name}</option>`;
                    });
                } else {
                    input = document.createElement('input');
                    input.type = type;
                    input.className = 'form-control form-control-sm';
                    input.value = currentValue;
                }
                
                // Store original content
                this.setAttribute('data-original-content', this.innerHTML);
                
                // Add editing class for visual feedback
                this.classList.add('editing');
                
                // Replace content with input
                this.innerHTML = '';
                this.appendChild(input);
                input.focus();
                
                // Handle save on Enter or blur
                const saveChanges = async () => {
                    const newValue = input.value;
                    if (newValue !== currentValue) {
                        // Show loading state
                        this.innerHTML = '<small class="text-muted">Kaydediliyor...</small>';
                        const success = await updateTaskField(key, field, newValue, type);
                        if (success) {
                            // Update the cell content with new value
                            updateCellContent(this, field, newValue, type);
                            this.removeAttribute('data-original-content');
                            this.classList.remove('editing');
                        } else {
                            // Restore original content on error
                            this.innerHTML = this.getAttribute('data-original-content');
                            this.removeAttribute('data-original-content');
                            this.classList.remove('editing');
                        }
                    } else {
                        this.innerHTML = this.getAttribute('data-original-content');
                        this.removeAttribute('data-original-content');
                        this.classList.remove('editing');
                    }
                };
                
                const handleKeyDown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        saveChanges();
                    } else if (e.key === 'Escape') {
                        this.innerHTML = this.getAttribute('data-original-content');
                        this.removeAttribute('data-original-content');
                        this.classList.remove('editing');
                    }
                };
                
                input.addEventListener('keydown', handleKeyDown);
                input.addEventListener('blur', saveChanges);
                
                // For select elements, save on change
                if (type === 'select' || type === 'machine_select') {
                    input.addEventListener('change', saveChanges);
                }
            });
        });

        // Add event listeners for delete buttons
        container.querySelectorAll('.delete-task-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const key = btn.getAttribute('data-key');
                if (!key) return;
                if (!window.confirm('Bu görevi silmek istediğinize emin misiniz?')) return;
                
                // Show loading state on the button
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                btn.disabled = true;
                
                try {
                    const resp = await authedFetch(`${backendBase}/machining/tasks/${key}/`, {
                        method: 'DELETE',
                    });
                    if (!resp.ok) throw new Error('Silme başarısız');
                    
                    // Remove the row from the table
                    const row = btn.closest('tr');
                    if (row) {
                        row.style.transition = 'opacity 0.3s ease-out';
                        row.style.opacity = '0';
                        setTimeout(() => {
                            row.remove();
                            
                            // Check if table is empty and show message
                            const tbody = row.closest('tbody');
                            if (tbody && tbody.children.length === 0) {
                                const tableContainer = document.getElementById('task-list-table-container');
                                tableContainer.innerHTML = '<div>Sonuç bulunamadı.</div>';
                            }
                        }, 300);
                    }
                } catch (err) {
                    alert('Hata: ' + err.message);
                    // Restore button state on error
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        });

        // Add event listeners for pagination
        container.querySelectorAll('.pagination-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const page = parseInt(btn.getAttribute('data-page'));
                if (!isNaN(page)) {
                    currentPage = page;
                    renderTaskListTable(page);
                }
            });
        });
    } catch (err) {
        container.innerHTML = `<div class="text-danger">Hata: ${err.message}</div>`;
    }
}

// New function to handle field updates
async function updateTaskField(key, field, value, type) {
    try {
        let payload = {};
        
        // Handle different field types
        if (field === 'status') {
            if (value === 'completed') {
                const resp = await authedFetch(`${backendBase}/machining/tasks/mark-completed/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key })
                });
                if (!resp.ok) throw new Error('Durum güncelleme başarısız');
            } else {
                const resp = await authedFetch(`${backendBase}/machining/tasks/unmark-completed/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key })
                });
                if (!resp.ok) throw new Error('Durum güncelleme başarısız');
            }
        } else {
            // Handle other fields
            if (type === 'number') {
                payload[field] = value ? parseFloat(value) : null;
            } else if (type === 'date') {
                payload[field] = value || null;
            } else if (type === 'machine_select') {
                payload['machine_fk'] = value ? parseInt(value) : null;
            } else {
                payload[field] = value;
            }
            
            const resp = await authedFetch(`${backendBase}/machining/tasks/${key}/`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!resp.ok) throw new Error('Güncelleme başarısız');
        }
        
        return true; // Success
        
    } catch (err) {
        alert('Hata: ' + err.message);
        return false; // Error
    }
}

// Function to update cell content without refreshing the table
function updateCellContent(cell, field, value, type) {
    let displayValue = '';
    
    if (field === 'status') {
        displayValue = value === 'completed' ? 
            '<span class="badge bg-primary">Tamamlandı</span>' : 
            '<span class="badge bg-success">Aktif</span>';
    } else if (field === 'finish_time') {
        displayValue = value ? new Date(value).toLocaleDateString('tr-TR') : '';
    } else if (field === 'estimated_hours') {
        displayValue = value ? `${value}` : '';
    } else if (field === 'machine_name') {
        // Find machine name from available machines
        const machine = availableMachines.find(m => m.id == value);
        displayValue = machine ? machine.name : '';
    } else {
        displayValue = value || '';
    }
    
    cell.innerHTML = displayValue;
    cell.setAttribute('data-value', value);
}

function renderPagination(result, currentPage) {
    // result: API response object with count, next, previous, etc.
    const pageSize = extractResultsFromResponse(result).length;
    const totalCount = result.count || 0;
    const pageCount = pageSize > 0 ? Math.ceil(totalCount / pageSize) : 1;
    if (pageCount <= 1) return '';
    let html = '<nav><ul class="pagination justify-content-center mt-3">';
    // Previous button
    html += `<li class="page-item${currentPage === 1 ? ' disabled' : ''}"><button class="page-link pagination-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'tabindex="-1" aria-disabled="true"' : ''}>Önceki</button></li>`;
    // Page numbers (show up to 5 pages, with ... if needed)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(pageCount, currentPage + 2);
    if (currentPage <= 3) {
        endPage = Math.min(5, pageCount);
    }
    if (currentPage >= pageCount - 2) {
        startPage = Math.max(1, pageCount - 4);
    }
    if (startPage > 1) {
        html += `<li class="page-item"><button class="page-link pagination-btn" data-page="1">1</button></li>`;
        if (startPage > 2) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }
    for (let i = startPage; i <= endPage; i++) {
        html += `<li class="page-item${i === currentPage ? ' active' : ''}"><button class="page-link pagination-btn" data-page="${i}">${i}</button></li>`;
    }
    if (endPage < pageCount) {
        if (endPage < pageCount - 1) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        html += `<li class="page-item"><button class="page-link pagination-btn" data-page="${pageCount}">${pageCount}</button></li>`;
    }
    // Next button
    html += `<li class="page-item${currentPage === pageCount ? ' disabled' : ''}"><button class="page-link pagination-btn" data-page="${currentPage + 1}" ${currentPage === pageCount ? 'tabindex="-1" aria-disabled="true"' : ''}>Sonraki</button></li>`;
    html += '</ul></nav>';
    return html;
}

async function showHoldTasks() {
    try {
        const url = `${backendBase}/machining/hold-tasks/`;
        const resp = await authedFetch(url);
        if (!resp.ok) throw new Error('Bekleyen işler alınamadı');
        const result = await resp.json();
        const data = extractResultsFromResponse(result) || [];
        
        // Create or update modal
        let modalHtml = `
        <div class="modal" tabindex="-1" id="hold-tasks-modal" style="display:none; background:rgba(0,0,0,0.5); position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:1050; align-items:center; justify-content:center;">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Bekleyen İşler (${data.length})</h5>
                        <button type="button" class="btn-close" id="close-hold-tasks-modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="hold-tasks-content">
                            <div>Yükleniyor...</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="close-hold-tasks-btn">Kapat</button>
                    </div>
                </div>
            </div>
        </div>`;
        
        // Remove existing modal if present
        const existingModal = document.getElementById('hold-tasks-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const modal = document.getElementById('hold-tasks-modal');
        const content = document.getElementById('hold-tasks-content');
        
        if (data.length === 0) {
            content.innerHTML = '<div class="alert alert-info">Bekleyen iş bulunamadı.</div>';
        } else {
            let html = `<div class="table-responsive">`;
            html += `<table class="table table-bordered table-sm"><thead><tr>`;
            
            // Define columns for hold tasks
            const holdTaskColumns = [
                { key: 'key', label: 'TI No' },
                { key: 'name', label: 'Ad' }
            ];
            
            for (const col of holdTaskColumns) {
                html += `<th>${col.label}</th>`;
            }
            html += '</tr></thead><tbody>';
            
            // Sort data by key
            const sortedData = data.sort((a, b) => {
                if (!a.key && !b.key) return 0;
                if (!a.key) return 1;
                if (!b.key) return -1;
                return a.key.localeCompare(b.key);
            });
            
            for (const row of sortedData) {
                html += '<tr>';
                for (const col of holdTaskColumns) {
                    let val;
                    if (col.key === 'key') {
                        val = row.key || '';
                    } else {
                        val = row[col.key] == null ? '' : row[col.key];
                    }
                    html += `<td>${val}</td>`;
                }
                html += '</tr>';
            }
            html += `</tbody></table>`;
            html += `</div>`;
            
            content.innerHTML = html;
        }
        
        // Show modal
        modal.style.display = 'flex';
        
        // Add event listeners for modal controls
        document.getElementById('close-hold-tasks-modal').onclick = () => { modal.style.display = 'none'; };
        document.getElementById('close-hold-tasks-btn').onclick = () => { modal.style.display = 'none'; };
        
        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        
    } catch (err) {
        // Show error in modal
        const modal = document.getElementById('hold-tasks-modal');
        if (modal) {
            const content = document.getElementById('hold-tasks-content');
            content.innerHTML = `<div class="text-danger">Hata: ${err.message}</div>`;
        } else {
            alert('Hata: ' + err.message);
        }
    }
}
