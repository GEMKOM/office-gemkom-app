# DisplayModal Component

A reusable, configurable modal component for displaying data in various formats. This component is designed to show read-only information with optional edit functionality, making it perfect for viewing user profiles, product details, system information, and more.

## Features

- **Multiple Display Types**: Support for text, number, date, datetime, time, currency, percentage, boolean, email, URL, image, badge, list, and JSON fields
- **Sectioned Layout**: Organize data into logical sections with custom titles and icons
- **Copy to Clipboard**: Click on copyable fields to copy their values
- **Responsive Design**: Mobile-friendly layout that adapts to different screen sizes
- **Loading States**: Built-in loading indicators for async operations
- **Customizable Styling**: Consistent with the application's design system
- **Event Callbacks**: Support for edit and close event handlers
- **Data Formatting**: Automatic formatting for dates, currencies, percentages, and more

## Installation

1. Include the component files in your project:
   ```html
   <link rel="stylesheet" href="components/display-modal/display-modal.css">
   <script type="module" src="components/display-modal/display-modal.js"></script>
   ```

2. Create a container element for the modal:
   ```html
   <div id="display-modal-container"></div>
   ```

## Basic Usage

```javascript
import { DisplayModal } from './components/display-modal/display-modal.js';

// Initialize the modal
const modal = new DisplayModal('display-modal-container', {
    title: 'User Profile',
    icon: 'fas fa-user',
    showEditButton: false
});

// Add sections and fields
modal
    .addSection({
        title: 'Personal Information',
        icon: 'fas fa-user',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'name',
                label: 'Full Name',
                type: 'text',
                value: 'John Doe',
                icon: 'fas fa-user',
                colSize: 6
            },
            {
                id: 'email',
                label: 'Email',
                type: 'email',
                value: 'john.doe@example.com',
                copyable: true,
                colSize: 6
            }
        ]
    })
    .render()
    .onCloseCallback(() => {
        console.log('Modal closed');
    })
    .show();

// Custom Content Example
modal
    .addCustomSection({
        title: 'Financial Summary',
        icon: 'fas fa-calculator',
        iconColor: 'text-info',
        customContent: `
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="card border-primary">
                        <div class="card-body">
                            <h5 class="card-title">Total Amount</h5>
                            <h3 class="text-primary">€1,234.56</h3>
                        </div>
                    </div>
                </div>
            </div>
        `
    })
    .render()
    .show();
```

## Custom Content

The DisplayModal component supports custom HTML content for maximum flexibility:

### addCustomSection()
Add a section with completely custom HTML content:

```javascript
modal.addCustomSection({
    title: 'Custom Section',
    icon: 'fas fa-star',
    iconColor: 'text-warning',
    customContent: '<div class="alert alert-info">Custom HTML content here</div>'
});
```

### addCustomContent()
Add custom HTML to the last section:

```javascript
modal.addSection({ title: 'My Section' });
modal.addCustomContent('<div class="custom-widget">Custom content</div>');
```

### Mixed Content
You can combine regular fields with custom content:

```javascript
modal.addSection({
    title: 'Mixed Section',
    fields: [
        { id: 'name', label: 'Name', value: 'John Doe' }
    ],
    customContent: '<div class="alert alert-success">Custom message</div>'
});
```

## Field Types

### Text Fields
```javascript
{
    id: 'field_id',
    label: 'Field Label',
    type: 'text',
    value: 'Display value',
    icon: 'fas fa-user',
    copyable: true,
    colSize: 6
}
```

### Date Fields
```javascript
{
    id: 'birth_date',
    label: 'Birth Date',
    type: 'date', // or 'datetime', 'time'
    value: '1990-01-15',
    colSize: 6
}
```

### Number Fields
```javascript
{
    id: 'age',
    label: 'Age',
    type: 'number',
    value: 34,
    colSize: 6
}
```

### Currency Fields
```javascript
{
    id: 'salary',
    label: 'Salary',
    type: 'currency',
    value: 50000,
    colSize: 6
}
```

### Percentage Fields
```javascript
{
    id: 'completion',
    label: 'Completion',
    type: 'percentage',
    value: 75,
    colSize: 6
}
```

### Boolean Fields
```javascript
{
    id: 'is_active',
    label: 'Active',
    type: 'boolean',
    value: true,
    colSize: 6
}
```

### Email Fields
```javascript
{
    id: 'email',
    label: 'Email',
    type: 'email',
    value: 'user@example.com',
    copyable: true,
    colSize: 6
}
```

### URL Fields
```javascript
{
    id: 'website',
    label: 'Website',
    type: 'url',
    value: 'https://example.com',
    colSize: 6
}
```

### Image Fields
```javascript
{
    id: 'avatar',
    label: 'Avatar',
    type: 'image',
    value: 'https://example.com/avatar.jpg',
    colSize: 6
}
```

### Badge Fields
```javascript
{
    id: 'status',
    label: 'Status',
    type: 'badge',
    value: 'Active',
    badgeClass: 'bg-success',
    colSize: 6
}
```

### List Fields
```javascript
{
    id: 'skills',
    label: 'Skills',
    type: 'list',
    value: ['JavaScript', 'React', 'Node.js'],
    colSize: 12
}
```

### JSON Fields
```javascript
{
    id: 'metadata',
    label: 'Metadata',
    type: 'json',
    value: { key: 'value', nested: { data: true } },
    colSize: 12
}
```

## API Reference

### Constructor Options

```javascript
new DisplayModal(containerId, options)
```

**Options:**
- `title` (string): Modal title
- `icon` (string): Font Awesome icon class
- `showEditButton` (boolean): Whether to show edit button
- `editButtonText` (string): Text for edit button
- `size` (string): Modal size ('sm', 'lg', 'xl')

### Methods

#### `addSection(sectionConfig)`
Add a new section to the display.

**Parameters:**
- `sectionConfig` (object): Section configuration
  - `id` (string): Unique section ID
  - `title` (string): Section title
  - `icon` (string): Font Awesome icon class
  - `iconColor` (string): Icon color class
  - `fields` (array): Array of field configurations

#### `addField(fieldConfig)`
Add a field to the last section.

**Parameters:**
- `fieldConfig` (object): Field configuration (see field types above)

#### `render()`
Render the modal with all sections and fields.

#### `show()`
Display the modal.

#### `hide()`
Hide the modal.

#### `setFieldValue(fieldId, value)`
Set the value of a specific field.

#### `getFieldValue(fieldId)`
Get the value of a specific field.

#### `getData()`
Get all field data as an object.

#### `setData(data)`
Set field data from an object.

#### `setLoading(loading)`
Set the loading state of the modal.

#### `onEditCallback(callback)`
Set the edit button callback function.

#### `onCloseCallback(callback)`
Set the close button callback function.

#### `setTitle(title)`
Update the modal title.

#### `setIcon(icon)`
Update the modal icon.

#### `setShowEditButton(show)`
Show or hide the edit button.

#### `setEditButtonText(text)`
Update the edit button text.

#### `clearData()`
Clear all field data.

#### `destroy()`
Destroy the modal and clean up resources.

## Field Configuration

### Common Field Properties

- `id` (string): Unique field identifier
- `label` (string): Field label text
- `type` (string): Field type (see field types above)
- `value` (any): Field value to display
- `icon` (string): Font Awesome icon class
- `colSize` (number): Bootstrap column size (1-12)
- `copyable` (boolean): Whether the field can be copied to clipboard
- `format` (function): Custom formatting function
- `badgeClass` (string): CSS class for badge fields

### Data Formatting

The component includes built-in formatting for:
- **Dates**: Automatic locale formatting
- **Currencies**: Localized currency display
- **Percentages**: Automatic percentage formatting
- **Numbers**: Localized number formatting
- **JSON**: Pretty-printed JSON display

### Copy to Clipboard

Fields with `copyable: true` can be clicked to copy their values to the clipboard. Visual feedback is provided during the copy operation.

## Examples

### User Profile Display
```javascript
const userModal = new DisplayModal('modal-container', {
    title: 'User Profile',
    icon: 'fas fa-user'
});

userModal
    .addSection({
        title: 'Personal Information',
        icon: 'fas fa-user',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'first_name',
                label: 'First Name',
                type: 'text',
                value: 'John',
                colSize: 6
            },
            {
                id: 'last_name',
                label: 'Last Name',
                type: 'text',
                value: 'Doe',
                colSize: 6
            },
            {
                id: 'email',
                label: 'Email',
                type: 'email',
                value: 'john.doe@example.com',
                copyable: true,
                colSize: 12
            },
            {
                id: 'birth_date',
                label: 'Birth Date',
                type: 'date',
                value: '1990-01-15',
                colSize: 6
            },
            {
                id: 'is_active',
                label: 'Active',
                type: 'boolean',
                value: true,
                colSize: 6
            }
        ]
    })
    .render()
    .show();
```

### Product Details Display
```javascript
const productModal = new DisplayModal('modal-container', {
    title: 'Product Details',
    icon: 'fas fa-box'
});

productModal
    .addSection({
        title: 'Product Information',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'name',
                label: 'Product Name',
                type: 'text',
                value: 'MacBook Pro 16"',
                colSize: 8
            },
            {
                id: 'sku',
                label: 'SKU',
                type: 'text',
                value: 'MBP16-M2MAX',
                copyable: true,
                colSize: 4
            },
            {
                id: 'price',
                label: 'Price',
                type: 'currency',
                value: 2500,
                colSize: 6
            },
            {
                id: 'discount',
                label: 'Discount',
                type: 'percentage',
                value: 15,
                colSize: 6
            },
            {
                id: 'image',
                label: 'Product Image',
                type: 'image',
                value: 'https://example.com/product.jpg',
                colSize: 12
            }
        ]
    })
    .render()
    .show();
```

## Testing

Open `test-display-modal.html` in a browser to see various examples and test different field types and configurations.

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Dependencies

- Bootstrap 5.3.0+
- Font Awesome 6.4.0+
