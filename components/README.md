# apis Report Component

A reusable, configurable report component that can be used across different parts of the application to display tabular data with optional filtering, editing, and deletion capabilities.

## Features

- **Configurable Columns**: Show/hide columns with persistent user preferences
- **Flexible Filtering**: Support for text, select, and datetime filters
- **Optional Actions**: Edit and delete buttons can be enabled/disabled
- **Resizable Columns**: Users can resize table columns by dragging
- **Responsive Design**: Works well on mobile and desktop
- **Custom Styling**: Built-in CSS with dark mode support
- **Data Transformation**: Custom formatting and styling of cell values
- **Event Handling**: Customizable edit and delete actions

## Usage

### Basic Setup

```javascript
import { apisReport } from './components/apisReport.js';

const report = new apisReport({
    title: 'My Report',
    containerId: 'my-report-container',
    apiEndpoint: '/api/data/',
    defaultColumns: ['id', 'name', 'status'],
    allColumns: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'status', label: 'Status' }
    ]
});
```

### Advanced Configuration

```javascript
const report = new apisReport({
    title: 'Advanced Report',
    containerId: 'advanced-report-container',
    apiEndpoint: '/api/advanced-data/',
    defaultColumns: ['id', 'name', 'category', 'status'],
    allColumns: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Name' },
        { key: 'category', label: 'Category' },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Created At' }
    ],
    showEditButton: true,
    showDeleteButton: true,
    filters: [
        {
            key: 'name',
            label: 'Name',
            type: 'text',
            placeholder: 'Search by name...'
        },
        {
            key: 'category',
            label: 'Category',
            type: 'select',
            options: [
                { value: 'tech', label: 'Technology' },
                { value: 'business', label: 'Business' }
            ]
        },
        {
            key: 'created_after',
            label: 'Created After',
            type: 'datetime'
        }
    ],
    onDataTransform: (row, col, val) => {
        // Custom data transformation
        if (col === 'status') {
            return val === 'active' ? 'Active' : 'Inactive';
        }
        return val;
    },
    onEdit: async (row, data) => {
        // Custom edit logic
        console.log('Editing:', row);
    },
    onDelete: async (id, data) => {
        // Custom delete logic
        await deleteRecord(id);
        report.refresh();
    }
});
```

## Configuration Options

### Required Options

- `title`: Report title displayed at the top
- `containerId`: ID of the container element where the report will be rendered
- `apiEndpoint`: API endpoint to fetch data from
- `defaultColumns`: Array of column keys to show by default
- `allColumns`: Array of column definitions with `key` and `label` properties

### Optional Options

- `filters`: Array of filter configurations
- `showEditButton`: Boolean to show/hide edit buttons (default: false)
- `showDeleteButton`: Boolean to show/hide delete buttons (default: false)
- `onDataTransform`: Function to transform cell values
- `onEdit`: Function called when edit button is clicked
- `onDelete`: Function called when delete button is clicked

## Filter Types

### Text Filter
```javascript
{
    key: 'name',
    label: 'Name',
    type: 'text',
    placeholder: 'Search...'
}
```

### Select Filter
```javascript
{
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' }
    ]
}
```

### Datetime Filter
```javascript
{
    key: 'created_after',
    label: 'Created After',
    type: 'datetime'
}
```

## API Requirements

The component expects the API endpoint to:

1. Accept query parameters for filtering
2. Return an array of objects
3. Each object should have an `id` field for edit/delete operations

### Example API Response
```json
[
    {
        "id": 1,
        "name": "Item 1",
        "status": "active",
        "created_at": 1640995200000
    }
]
```

## CSS Classes

The component uses the following CSS classes for styling:

- `.apis-report-container`: Main container
- `.table-responsive`: Table wrapper
- `.resizable-table`: Table with resizable columns
- `.resize-handle`: Column resize handle
- `.edit-row-btn`: Edit button
- `.delete-row-btn`: Delete button

## Methods

### `refresh()`
Refreshes the report data by refetching from the API.

```javascript
report.refresh();
```

## Examples

See `apisReportExample.js` for complete usage examples including:

1. Simple report without filters
2. Report with filters but no actions
3. Report with edit functionality
4. Report with both edit and delete
5. Report with custom styling

## Integration with Existing Code

The component has been integrated with the existing `finishedTimers.js` file, demonstrating how to migrate existing report functionality to use the apis component.

## Browser Support

- Modern browsers with ES6+ support
- Responsive design for mobile devices
- Dark mode support where available 