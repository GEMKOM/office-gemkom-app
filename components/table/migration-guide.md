# Migration Guide: From Current Tasks Table to TableComponent

This guide will help you migrate your existing tasks table to use the new reusable TableComponent.

## Current Implementation vs New Component

### Current Implementation (tasks.js)
```javascript
// Current table rendering in tasks.js
function renderTasksTable() {
    const tbody = document.getElementById('tasks-table-body');
    tbody.innerHTML = tasks.map(task => `
        <tr class="data-update" data-task-key="${task.key}">
            <td><span class="task-key">${task.key || 'N/A'}</span></td>
            <td class="editable-cell" data-field="name" data-task-key="${task.key}">
                <div class="task-name">
                    <strong>${task.name || 'N/A'}</strong>
                    ${task.description ? `<br><small class="text-muted">${task.description}</small>` : ''}
                </div>
            </td>
            <td class="editable-cell" data-field="job_no" data-task-key="${task.key}">${task.job_no || 'N/A'}</td>
            // ... more columns
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-outline-success" onclick="showCompletionData('${task.key}')" title="Görev Verileri">
                        <i class="fas fa-chart-line"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteTask('${task.key}')" title="Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}
```

### New Component Implementation
```javascript
import { TableComponent } from '../../../components/table/table.js';

const tasksTable = new TableComponent('tasks-table', {
    title: 'Görev Listesi',
    columns: [
        {
            field: 'key',
            label: 'TI No',
            sortable: true,
            formatter: (value) => `<span class="task-key">${value}</span>`
        },
        {
            field: 'name',
            label: 'Ad',
            sortable: true,
            editable: true,
            formatter: (value, row) => `
                <div class="task-name">
                    <strong>${value || 'N/A'}</strong>
                    ${row.description ? `<br><small class="text-muted">${row.description}</small>` : ''}
                </div>
            `,
            validate: (value) => value.length >= 3 ? true : 'En az 3 karakter olmalı'
        },
        // ... more columns
    ],
    data: tasks,
    editable: true,
    editableColumns: ['name', 'job_no', 'image_no', 'position_no', 'quantity', 'machine_name', 'estimated_hours', 'finish_time', 'status'],
    actions: [
        {
            key: 'view',
            label: 'Görev Verileri',
            icon: 'fas fa-chart-line',
            class: 'btn-outline-success',
            onClick: (row) => showCompletionData(row.key)
        },
        {
            key: 'delete',
            label: 'Sil',
            icon: 'fas fa-trash',
            class: 'btn-outline-danger',
            onClick: (row) => deleteTask(row.key)
        }
    ],
    pagination: true,
    itemsPerPage: 20,
    totalItems: totalTasks,
    sortable: true,
    onSort: (field, direction) => {
        currentSortField = field;
        currentSortDirection = direction;
        loadTasks();
    },
    onPageChange: (page) => {
        currentPage = page;
        loadTasks();
    },
    onEdit: async (row, field, newValue, oldValue) => {
        try {
            await updateTask(row.key, field, newValue);
            showNotification('Görev güncellendi', 'success');
        } catch (error) {
            throw new Error('Güncelleme başarısız');
        }
    },
    refreshable: true,
    onRefresh: () => {
        loadTasks();
    },
    exportable: true,
    onExport: () => {
        exportTasks();
    }
});
```

## Step-by-Step Migration

### Step 1: Update HTML Structure

**Before:**
```html
<div class="row">
    <div class="col-12">
        <div class="dashboard-card">
            <div class="card-header">
                <h5 class="card-title">
                    <i class="fas fa-table me-2 text-primary"></i>
                    Görev Listesi
                </h5>
                <div class="card-actions">
                    <button class="btn btn-sm btn-outline-secondary" id="refresh-tasks">
                        <i class="fas fa-sync-alt me-1"></i>Yenile
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" id="export-tasks">
                        <i class="fas fa-download me-1"></i>Dışa Aktar
                    </button>
                </div>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th class="sortable" data-field="key">TI No <i class="fas fa-sort sort-icon"></i></th>
                                <!-- ... more headers -->
                            </tr>
                        </thead>
                        <tbody id="tasks-table-body">
                            <!-- Tasks will be loaded here -->
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>
```

**After:**
```html
<div class="row">
    <div class="col-12">
        <div id="tasks-table"></div>
    </div>
</div>
```

### Step 2: Include the Component

Add to your HTML head or at the top of your JavaScript file:

```html
<link rel="stylesheet" href="/components/table/table.css">
```

```javascript
import { TableComponent } from '../../../components/table/table.js';
```

### Step 3: Define Column Configuration

Map your current columns to the new format:

```javascript
const columns = [
    {
        field: 'key',
        label: 'TI No',
        sortable: true,
        formatter: (value) => `<span class="task-key">${value || 'N/A'}</span>`
    },
    {
        field: 'name',
        label: 'Ad',
        sortable: true,
        editable: true,
        formatter: (value, row) => `
            <div class="task-name">
                <strong>${value || 'N/A'}</strong>
                ${row.description ? `<br><small class="text-muted">${row.description}</small>` : ''}
            </div>
        `,
        validate: (value) => value.length >= 3 ? true : 'En az 3 karakter olmalı'
    },
    {
        field: 'job_no',
        label: 'İş No',
        sortable: true,
        editable: true
    },
    {
        field: 'image_no',
        label: 'Resim No',
        sortable: true,
        editable: true
    },
    {
        field: 'position_no',
        label: 'Poz No',
        sortable: true,
        editable: true
    },
    {
        field: 'quantity',
        label: 'Adet',
        type: 'number',
        formatter: (value) => `<span class="quantity-badge">${value || 0}</span>`,
        editable: true,
        validate: (value) => value > 0 ? true : 'Adet 0\'dan büyük olmalı'
    },
    {
        field: 'machine_name',
        label: 'Makine',
        sortable: true,
        editable: true,
        formatter: (value) => `<span class="machine-name">${value || 'N/A'}</span>`
    },
    {
        field: 'estimated_hours',
        label: 'Tahmini Saat',
        type: 'number',
        formatter: (value) => `<span class="estimated-hours">${value ? value + ' saat' : 'Belirtilmemiş'}</span>`,
        editable: true,
        validate: (value) => value >= 0 ? true : 'Saat negatif olamaz'
    },
    {
        field: 'total_hours_spent',
        label: 'Harcanan Saat',
        type: 'number',
        formatter: (value) => `<span class="hours-spent">${value || 0} saat</span>`
    },
    {
        field: 'finish_time',
        label: 'Bitmesi Planlanan Tarih',
        type: 'date',
        formatter: (value) => value ? new Date(value).toLocaleDateString('tr-TR') : 'Belirtilmemiş',
        editable: true
    },
    {
        field: 'status',
        label: 'Durum',
        type: 'select',
        options: [
            { value: 'pending', label: 'Bekliyor' },
            { value: 'active', label: 'Aktif' },
            { value: 'completed', label: 'Tamamlandı' }
        ],
        formatter: (value, row) => {
            if (row.completion_date) {
                return '<span class="status-badge completed">Tamamlandı</span>';
            } else if (row.total_hours_spent > 0) {
                return '<span class="status-badge worked-on">Çalışıldı</span>';
            } else {
                return '<span class="status-badge pending">Bekliyor</span>';
            }
        },
        editable: true
    }
];
```

### Step 4: Define Actions

```javascript
const actions = [
    {
        key: 'view',
        label: 'Görev Verileri',
        icon: 'fas fa-chart-line',
        class: 'btn-outline-success',
        onClick: (row) => showCompletionData(row.key)
    },
    {
        key: 'delete',
        label: 'Sil',
        icon: 'fas fa-trash',
        class: 'btn-outline-danger',
        onClick: (row) => deleteTask(row.key)
    }
];
```

### Step 5: Initialize the Component

Replace your current table initialization with:

```javascript
let tasksTable;

async function initializeTasks() {
    try {
        initializeFiltersComponent();
        await loadMachines();
        
        // Initialize the table component
        tasksTable = new TableComponent('tasks-table', {
            title: 'Görev Listesi',
            columns: columns,
            data: tasks,
            editable: true,
            editableColumns: ['name', 'job_no', 'image_no', 'position_no', 'quantity', 'machine_name', 'estimated_hours', 'finish_time', 'status'],
            actions: actions,
            pagination: true,
            itemsPerPage: 20,
            totalItems: totalTasks,
            sortable: true,
            onSort: (field, direction) => {
                currentSortField = field;
                currentSortDirection = direction;
                loadTasks();
            },
            onPageChange: (page) => {
                currentPage = page;
                loadTasks();
            },
            onEdit: async (row, field, newValue, oldValue) => {
                try {
                    await updateTask(row.key, field, newValue);
                    showNotification('Görev güncellendi', 'success');
                } catch (error) {
                    throw new Error('Güncelleme başarısız');
                }
            },
            refreshable: true,
            onRefresh: () => {
                loadTasks();
            },
            exportable: true,
            onExport: () => {
                exportTasks();
            }
        });
        
        await loadTasks();
        updateTaskCounts();
    } catch (error) {
        console.error('Error initializing tasks:', error);
        showNotification('Görevler yüklenirken hata oluştu', 'error');
    }
}
```

### Step 6: Update Data Loading

Replace your current `renderTasksTable()` function with:

```javascript
async function loadTasks(page = 1) {
    try {
        showLoadingState();
        
        const query = buildTaskQuery(page);
        const response = await fetchTasks(query);
        
        tasks = response.tasks;
        totalTasks = response.total;
        
        // Update the table component
        if (tasksTable) {
            tasksTable.updateData(tasks, totalTasks);
            tasksTable.setLoading(false);
        }
        
        updateTaskCounts();
    } catch (error) {
        console.error('Error loading tasks:', error);
        showNotification('Görevler yüklenirken hata oluştu', 'error');
        if (tasksTable) {
            tasksTable.setLoading(false);
        }
    }
}
```

### Step 7: Remove Old Functions

You can remove these functions as they're now handled by the component:
- `renderTasksTable()`
- `setupInlineEditing()`
- `startInlineEdit()`
- `finishInlineEdit()`
- `createInputElement()`
- `getStatusBadge()`
- `renderPagination()`

### Step 8: Update Event Listeners

Remove the old event listeners and let the component handle them:

```javascript
function setupEventListeners() {
    // Remove old table-related event listeners
    // The component handles its own events
    
    // Keep other event listeners
    document.getElementById('create-task')?.addEventListener('click', showCreateTaskModal);
    document.getElementById('bulk-create-task')?.addEventListener('click', showBulkCreateModal);
    // ... other event listeners
}
```

## Benefits of Migration

1. **Reusability**: Use the same table component across different pages
2. **Maintainability**: Centralized table logic and styling
3. **Consistency**: Uniform table behavior across the application
4. **Flexibility**: Easy to customize for different use cases
5. **Performance**: Optimized rendering and event handling
6. **Accessibility**: Better keyboard navigation and screen reader support

## Testing the Migration

1. Start with a simple table configuration
2. Test inline editing functionality
3. Verify sorting and pagination work correctly
4. Test action buttons and their callbacks
5. Ensure all existing functionality is preserved
6. Test responsive behavior on mobile devices

## Troubleshooting

### Common Issues

1. **Table not rendering**: Check if the container element exists
2. **Editable cells not working**: Ensure `editable: true` is set
3. **Actions not showing**: Verify action configuration is correct
4. **Styling issues**: Make sure the CSS file is included

### Debug Tips

```javascript
// Add this to debug table issues
console.log('Table component:', tasksTable);
console.log('Table options:', tasksTable.options);
console.log('Table data:', tasksTable.options.data);
```
