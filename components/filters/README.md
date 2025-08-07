# Filters Component

A reusable, flexible filters component that can be used across multiple pages with different filter configurations.

## Features

- **Dynamic Filter Creation**: Add different types of filters programmatically
- **Multiple Filter Types**: Text inputs, dropdowns, date pickers, and select elements
- **Responsive Design**: Works on all screen sizes
- **Flexible Configuration**: Customizable labels, placeholders, and column sizes
- **Event Handling**: Built-in support for apply, clear, and change events
- **Modern Dropdown Integration**: Uses the existing ModernDropdown component
- **Loading States**: Built-in loading indicators
- **Keyboard Support**: Enter key support for text inputs

## Usage

### Basic Setup

1. **Include the component files** in your HTML:

```html
<link rel="stylesheet" href="../../../components/filters/filters.css">
<script type="module" src="../../../components/filters/filters.js"></script>
```

2. **Add a container** for the filters:

```html
<div id="my-filters"></div>
```

3. **Initialize the component** in your JavaScript:

```javascript
import { FiltersComponent } from '../../../components/filters/filters.js';

const filters = new FiltersComponent('my-filters', {
    title: 'My Filters',
    onApply: (values) => {
        console.log('Applied filters:', values);
        // Your filtering logic here
    },
    onClear: () => {
        console.log('Filters cleared');
        // Your clear logic here
    }
});
```

### Adding Filters

#### Text Input Filter

```javascript
filters.addTextFilter({
    id: 'name-filter',
    label: 'Name',
    placeholder: 'Enter name...',
    type: 'text', // text, number, email, etc.
    colSize: 2 // Bootstrap column size (1-12)
});
```

#### Dropdown Filter

```javascript
filters.addDropdownFilter({
    id: 'status-filter',
    label: 'Status',
    options: [
        { value: 'active', label: 'Active' },
        { value: 'completed', label: 'Completed' },
        { value: 'pending', label: 'Pending' }
    ],
    placeholder: 'Select status...',
    searchable: true, // Enable search in dropdown
    colSize: 2
});
```

#### Date Filter

```javascript
filters.addDateFilter({
    id: 'date-filter',
    label: 'Date',
    value: '2024-01-01', // Default date
    colSize: 2
});
```

#### Select Filter (Native HTML Select)

```javascript
filters.addSelectFilter({
    id: 'category-filter',
    label: 'Category',
    options: [
        { value: 'cat1', label: 'Category 1' },
        { value: 'cat2', label: 'Category 2' }
    ],
    placeholder: 'Select category...',
    colSize: 2
});
```

### Configuration Options

```javascript
const filters = new FiltersComponent('container-id', {
    title: 'Filtreler', // Component title
    showClearButton: true, // Show clear button
    showApplyButton: true, // Show apply button
    applyButtonText: 'Filtrele', // Apply button text
    clearButtonText: 'Temizle', // Clear button text
    onApply: (values) => {
        // Called when apply button is clicked
        // values: Object with filter ID as key and value as value
    },
    onClear: () => {
        // Called when clear button is clicked
    },
    onFilterChange: (filterId, value) => {
        // Called when any filter value changes
    }
});
```

### API Methods

#### Getting Filter Values

```javascript
const values = filters.getFilterValues();
// Returns: { 'name-filter': 'John', 'status-filter': 'active' }
```

#### Setting Filter Values

```javascript
filters.setFilterValues({
    'name-filter': 'John',
    'status-filter': 'active'
});
```

#### Clearing Filters

```javascript
filters.clearFilters(); // Clears all filters
```

#### Removing Filters

```javascript
filters.removeFilter('name-filter'); // Remove specific filter
filters.removeAllFilters(); // Remove all filters
```

#### Updating Dropdown Options

```javascript
filters.updateFilterOptions('status-filter', [
    { value: 'new', label: 'New Status' },
    { value: 'updated', label: 'Updated Status' }
]);
```

#### Loading States

```javascript
filters.showLoading(); // Show loading state
filters.hideLoading(); // Hide loading state
```

#### Destroy Component

```javascript
filters.destroy(); // Clean up component
```

## Example: Tasks Page Implementation

Here's how to replace the existing filters in the tasks page:

```javascript
import { FiltersComponent } from '../../../components/filters/filters.js';

// Initialize filters component
const taskFilters = new FiltersComponent('filters-placeholder', {
    title: 'Görev Filtreleri',
    onApply: (values) => {
        // Apply filters and reload tasks
        loadTasks(1);
    },
    onClear: () => {
        // Clear filters and reload tasks
        loadTasks(1);
        showNotification('Filtreler temizlendi', 'info');
    }
});

// Add filters
taskFilters.addTextFilter({
    id: 'key-filter',
    label: 'TI No',
    placeholder: 'TI-001'
});

taskFilters.addTextFilter({
    id: 'name-filter',
    label: 'Görev Adı',
    placeholder: 'Görev adı'
});

taskFilters.addTextFilter({
    id: 'job-no-filter',
    label: 'İş No',
    placeholder: 'İş numarası'
});

taskFilters.addDropdownFilter({
    id: 'machine-filter',
    label: 'Makine',
    options: machines.map(m => ({ value: m.id, label: m.name })),
    placeholder: 'Makine seçin'
});

taskFilters.addDropdownFilter({
    id: 'status-filter',
    label: 'Durum',
    options: [
        { value: 'active', label: 'Aktif' },
        { value: 'completed', label: 'Tamamlanan' },
        { value: 'pending', label: 'Bekleyen' },
        { value: 'hold', label: 'Bekletilen' }
    ],
    placeholder: 'Durum seçin'
});
```

## Migration Guide

### From Static HTML to Component

**Before (Static HTML):**
```html
<div class="row mb-3">
    <div class="col-12">
        <div class="dashboard-card compact">
            <div class="card-header">
                <h6 class="card-title mb-0">
                    <i class="fas fa-filter me-2 text-primary"></i>
                    Filtreler
                </h6>
            </div>
            <div class="card-body py-3">
                <div class="row g-2">
                    <div class="col-md-2">
                        <label class="form-label small mb-1">TI No</label>
                        <input type="text" class="form-control form-control-sm" id="key-filter" placeholder="TI-001">
                    </div>
                    <!-- More filters... -->
                </div>
            </div>
        </div>
    </div>
</div>
```

**After (Component):**
```html
<div id="filters-placeholder"></div>
```

```javascript
const filters = new FiltersComponent('filters-placeholder');
filters.addTextFilter({
    id: 'key-filter',
    label: 'TI No',
    placeholder: 'TI-001'
});
// Add more filters...
```

## Styling

The component uses Bootstrap classes and includes responsive design. Custom styles can be added by targeting the `.filters-component` class.

## Browser Support

- Modern browsers with ES6+ support
- Requires Bootstrap 5.x
- Requires Font Awesome for icons
