# Table Component

A highly customizable and reusable table component that supports inline editing, sorting, pagination, and custom actions.

## Features

- ✅ **Customizable Columns**: Define column types, formatters, and validation
- ✅ **Inline Editing**: Click to edit cells with different input types
- ✅ **Sorting**: Click column headers to sort data
- ✅ **Pagination**: Built-in pagination with customizable page sizes
- ✅ **Custom Actions**: Add action buttons with custom icons and colors
- ✅ **Responsive Design**: Mobile-friendly with horizontal scrolling
- ✅ **Loading States**: Built-in loading and empty states
- ✅ **Export Functionality**: Export data to different formats
- ✅ **Refresh Capability**: Refresh data with custom callbacks
- ✅ **Row Click Events**: Handle row selection and clicks
- ✅ **Flexible Styling**: Customizable table appearance

## Basic Usage

### 1. Include the Component

```html
<!-- Include the CSS -->
<link rel="stylesheet" href="/components/table/table.css">

<!-- Include the JavaScript -->
<script type="module" src="/components/table/table.js"></script>
```

### 2. Create a Container

```html
<div id="my-table"></div>
```

### 3. Initialize the Table

```javascript
import { TableComponent } from '/components/table/table.js';

const table = new TableComponent('my-table', {
    title: 'Görev Listesi',
    columns: [
        { field: 'key', label: 'TI No', sortable: true },
        { field: 'name', label: 'Ad', sortable: true },
        { field: 'status', label: 'Durum', sortable: true }
    ],
    data: [
        { key: 'TI-001', name: 'Görev 1', status: 'active' },
        { key: 'TI-002', name: 'Görev 2', status: 'completed' }
    ]
});
```

## Column Configuration

### Basic Column

```javascript
{
    field: 'name',
    label: 'Ad',
    sortable: true
}
```

### Column with Custom Formatter

```javascript
{
    field: 'status',
    label: 'Durum',
    formatter: (value, row) => {
        const badges = {
            'active': '<span class="status-badge pending">Aktif</span>',
            'completed': '<span class="status-badge completed">Tamamlandı</span>',
            'pending': '<span class="status-badge worked-on">Bekliyor</span>'
        };
        return badges[value] || value;
    }
}
```

### Editable Column

```javascript
{
    field: 'name',
    label: 'Ad',
    type: 'text',
    editable: true,
    validate: (value) => {
        if (value.length < 3) return 'En az 3 karakter olmalı';
        return true;
    }
}
```

### Select Column

```javascript
{
    field: 'status',
    label: 'Durum',
    type: 'select',
    options: [
        { value: 'active', label: 'Aktif' },
        { value: 'completed', label: 'Tamamlandı' },
        { value: 'pending', label: 'Bekliyor' }
    ]
}
```

### Date Column

```javascript
{
    field: 'created_at',
    label: 'Oluşturulma Tarihi',
    type: 'date',
    formatter: (value) => new Date(value).toLocaleDateString('tr-TR')
}
```

### Number Column

```javascript
{
    field: 'quantity',
    label: 'Adet',
    type: 'number',
    formatter: (value) => value.toLocaleString('tr-TR')
}
```

## Actions Configuration

### Basic Action

```javascript
actions: [
    {
        key: 'edit',
        label: 'Düzenle',
        icon: 'fas fa-edit',
        class: 'btn-outline-primary',
        onClick: (row, index) => {
            console.log('Edit clicked for:', row);
        }
    }
]
```

### Conditional Action

```javascript
actions: [
    {
        key: 'delete',
        label: 'Sil',
        icon: 'fas fa-trash',
        class: 'btn-outline-danger',
        visible: (row) => row.status !== 'completed',
        onClick: (row, index) => {
            if (confirm('Silmek istediğinizden emin misiniz?')) {
                deleteRow(row);
            }
        }
    }
]
```

### Multiple Actions

```javascript
actions: [
    {
        key: 'view',
        label: 'Görüntüle',
        icon: 'fas fa-eye',
        class: 'btn-outline-info',
        onClick: (row) => viewDetails(row)
    },
    {
        key: 'edit',
        label: 'Düzenle',
        icon: 'fas fa-edit',
        class: 'btn-outline-primary',
        onClick: (row) => editRow(row)
    },
    {
        key: 'delete',
        label: 'Sil',
        icon: 'fas fa-trash',
        class: 'btn-outline-danger',
        onClick: (row) => deleteRow(row)
    }
]
```

## Complete Example

```javascript
import { TableComponent } from '/components/table/table.js';

const tasksTable = new TableComponent('tasks-table', {
    title: 'Görev Listesi',
    
    // Column configuration
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
            validate: (value) => value.length >= 3 ? true : 'En az 3 karakter olmalı'
        },
        {
            field: 'job_no',
            label: 'İş No',
            sortable: true,
            editable: true
        },
        {
            field: 'quantity',
            label: 'Adet',
            type: 'number',
            formatter: (value) => `<span class="quantity-badge">${value}</span>`,
            editable: true,
            validate: (value) => value > 0 ? true : 'Adet 0\'dan büyük olmalı'
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
            formatter: (value) => {
                const badges = {
                    'pending': '<span class="status-badge pending">Bekliyor</span>',
                    'active': '<span class="status-badge worked-on">Aktif</span>',
                    'completed': '<span class="status-badge completed">Tamamlandı</span>'
                };
                return badges[value] || value;
            },
            editable: true
        }
    ],
    
    // Data
    data: tasks,
    
    // Editable configuration
    editable: true,
    editableColumns: ['name', 'job_no', 'quantity', 'status'],
    
    // Actions
    actions: [
        {
            key: 'view',
            label: 'Görüntüle',
            icon: 'fas fa-eye',
            class: 'btn-outline-info',
            onClick: (row) => viewTask(row)
        },
        {
            key: 'delete',
            label: 'Sil',
            icon: 'fas fa-trash',
            class: 'btn-outline-danger',
            visible: (row) => row.status !== 'completed',
            onClick: (row) => deleteTask(row)
        }
    ],
    
    // Pagination
    pagination: true,
    itemsPerPage: 20,
    totalItems: totalTasks,
    
    // Sort functionality
    sortable: true,
    onSort: (field, direction) => {
        loadTasks(field, direction);
    },
    
    // Page change
    onPageChange: (page) => {
        loadTasks(page);
    },
    
    // Edit callback
    onEdit: async (row, field, newValue, oldValue) => {
        try {
            await updateTask(row.key, field, newValue);
            showNotification('Görev güncellendi', 'success');
        } catch (error) {
            throw new Error('Güncelleme başarısız');
        }
    },
    
    // Refresh functionality
    refreshable: true,
    onRefresh: () => {
        loadTasks();
    },
    
    // Export functionality
    exportable: true,
    onExport: () => {
        exportTasks();
    },
    
    // Row click
    onRowClick: (row, index) => {
        console.log('Row clicked:', row);
    },
    
    // Styling
    tableClass: 'table table-hover',
    responsive: true,
    striped: true,
    small: false
});
```

## API Reference

### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `columns` | Array | `[]` | Column definitions |
| `data` | Array | `[]` | Table data |
| `sortable` | Boolean | `true` | Enable column sorting |
| `pagination` | Boolean | `false` | Enable pagination |
| `itemsPerPage` | Number | `20` | Items per page |
| `currentPage` | Number | `1` | Current page |
| `totalItems` | Number | `0` | Total number of items |
| `editable` | Boolean | `false` | Enable inline editing |
| `editableColumns` | Array | `[]` | Specific columns to make editable |
| `actions` | Array | `[]` | Action buttons |
| `title` | String | `'Tablo'` | Table title |
| `responsive` | Boolean | `true` | Make table responsive |
| `striped` | Boolean | `false` | Add striped rows |
| `bordered` | Boolean | `false` | Add borders |
| `small` | Boolean | `false` | Use small table styling |

### Column Options

| Option | Type | Description |
|--------|------|-------------|
| `field` | String | Data field name |
| `label` | String | Column header text |
| `sortable` | Boolean | Enable sorting for this column |
| `type` | String | Input type for editing (text, number, date, select) |
| `editable` | Boolean | Make this column editable |
| `formatter` | Function | Custom value formatter |
| `validate` | Function | Validation function |
| `options` | Array | Options for select type |
| `valueGetter` | Function | Custom value getter |

### Action Options

| Option | Type | Description |
|--------|------|-------------|
| `key` | String | Unique action identifier |
| `label` | String | Action label |
| `icon` | String | FontAwesome icon class |
| `class` | String | CSS class for styling |
| `visible` | Function | Function to determine visibility |
| `onClick` | Function | Click handler |

### Methods

| Method | Parameters | Description |
|--------|------------|-------------|
| `updateData(data, totalItems)` | Array, Number | Update table data |
| `setLoading(loading)` | Boolean | Set loading state |
| `updateColumn(field, updates)` | String, Object | Update column configuration |
| `addAction(action)` | Object | Add new action |
| `removeAction(key)` | String | Remove action |
| `destroy()` | - | Clean up component |

## Styling

The component includes comprehensive CSS styling that can be customized:

- **Dashboard Card**: Professional card layout with gradient header
- **Table Styling**: Clean, modern table design
- **Editable Cells**: Visual feedback for editable cells
- **Action Buttons**: Styled action buttons with hover effects
- **Status Badges**: Pre-defined status badge styles
- **Responsive Design**: Mobile-friendly responsive layout

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Dependencies

- FontAwesome 5+ (for icons)
- Bootstrap 5+ (for base styling)
