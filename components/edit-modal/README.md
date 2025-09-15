# EditModal Component

A reusable, configurable modal component for creating dynamic forms with various field types. This component is designed to be flexible and can be used across different pages in the application.

## Features

- **Multiple Field Types**: Support for text, email, password, number, date, datetime-local, time, textarea, dropdown, checkbox, radio, file, color, and range fields
- **Sectioned Forms**: Organize fields into logical sections with custom titles and icons
- **Dropdown Integration**: Uses the ModernDropdown component for enhanced dropdown functionality
- **Form Validation**: Built-in validation with visual feedback
- **Responsive Design**: Mobile-friendly layout that adapts to different screen sizes
- **Loading States**: Built-in loading indicators for async operations
- **Customizable Styling**: Consistent with the application's design system
- **Event Callbacks**: Support for save and cancel event handlers

## Installation

1. Include the component files in your project:
   ```html
   <link rel="stylesheet" href="components/edit-modal/edit-modal.css">
   <link rel="stylesheet" href="components/dropdown.css">
   <script type="module" src="components/edit-modal/edit-modal.js"></script>
   <script type="module" src="components/dropdown.js"></script>
   ```

2. Create a container element for the modal:
   ```html
   <div id="edit-modal-container"></div>
   ```

## Basic Usage

```javascript
import { EditModal } from './components/edit-modal/edit-modal.js';

// Initialize the modal
const modal = new EditModal('edit-modal-container', {
    title: 'Edit User',
    icon: 'fas fa-edit',
    saveButtonText: 'Save Changes'
});

// Add sections and fields
modal
    .addSection({
        title: 'Basic Information',
        icon: 'fas fa-user',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'username',
                name: 'username',
                label: 'Username',
                type: 'text',
                placeholder: 'Enter username',
                required: true,
                icon: 'fas fa-user',
                colSize: 6
            },
            {
                id: 'email',
                name: 'email',
                label: 'Email',
                type: 'email',
                placeholder: 'Enter email',
                required: true,
                icon: 'fas fa-envelope',
                colSize: 6
            }
        ]
    })
    .render()
    .onSaveCallback(async (formData) => {
        console.log('Form data:', formData);
        // Handle save logic here
        modal.hide();
    })
    .show();
```

## Field Types

### Text Fields
```javascript
{
    id: 'field_id',
    name: 'field_name',
    label: 'Field Label',
    type: 'text', // or 'email', 'password'
    placeholder: 'Enter value',
    required: true,
    icon: 'fas fa-user',
    colSize: 6
}
```

### Number Fields
```javascript
{
    id: 'age',
    name: 'age',
    label: 'Age',
    type: 'number',
    min: 0,
    max: 120,
    step: 1,
    required: true,
    colSize: 6
}
```

### Date Fields
```javascript
{
    id: 'birth_date',
    name: 'birth_date',
    label: 'Birth Date',
    type: 'date', // or 'datetime-local', 'time'
    required: true,
    colSize: 6
}
```

### Dropdown Fields
```javascript
{
    id: 'team',
    name: 'team',
    label: 'Team',
    type: 'dropdown',
    placeholder: 'Select team...',
    required: true,
    options: [
        { value: 'dev', label: 'Development' },
        { value: 'design', label: 'Design' },
        { value: 'marketing', label: 'Marketing' }
    ],
    searchable: true,
    colSize: 6
}
```

### Checkbox Fields
```javascript
{
    id: 'newsletter',
    name: 'newsletter',
    label: 'Subscribe to Newsletter',
    type: 'checkbox',
    value: true,
    colSize: 12
}
```

### Radio Fields
```javascript
{
    id: 'notification_type',
    name: 'notification_type',
    label: 'Notification Type',
    type: 'radio',
    value: 'email',
    options: [
        { value: 'email', label: 'Email' },
        { value: 'sms', label: 'SMS' },
        { value: 'push', label: 'Push Notification' }
    ],
    colSize: 12
}
```

### File Fields
```javascript
{
    id: 'avatar',
    name: 'avatar',
    label: 'Profile Picture',
    type: 'file',
    accept: 'image/*',
    required: true,
    colSize: 6
}
```

### Color Fields
```javascript
{
    id: 'theme_color',
    name: 'theme_color',
    label: 'Theme Color',
    type: 'color',
    value: '#DC143C',
    colSize: 6
}
```

### Range Fields
```javascript
{
    id: 'volume',
    name: 'volume',
    label: 'Volume',
    type: 'range',
    min: 0,
    max: 100,
    value: 50,
    colSize: 12
}
```

### Textarea Fields
```javascript
{
    id: 'description',
    name: 'description',
    label: 'Description',
    type: 'textarea',
    placeholder: 'Enter description...',
    rows: 4,
    colSize: 12
}
```

## API Reference

### Constructor Options

```javascript
new EditModal(containerId, options)
```

**Options:**
- `title` (string): Modal title
- `icon` (string): Font Awesome icon class
- `saveButtonText` (string): Text for save button
- `size` (string): Modal size ('sm', 'lg', 'xl')

### Methods

#### `addSection(sectionConfig)`
Add a new section to the form.

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

#### `getFormData()`
Get all form data as an object.

#### `setFormData(data)`
Set form data from an object.

#### `validateForm()`
Validate all form fields.

#### `setLoading(loading)`
Set the loading state of the modal.

#### `onSaveCallback(callback)`
Set the save button callback function.

#### `onCancelCallback(callback)`
Set the cancel button callback function.

#### `setTitle(title)`
Update the modal title.

#### `setIcon(icon)`
Update the modal icon.

#### `setSaveButtonText(text)`
Update the save button text.

#### `clearForm()`
Clear all form fields.

#### `resetForm()`
Reset all form fields to their default values.

#### `destroy()`
Destroy the modal and clean up resources.

## Field Configuration

### Common Field Properties

- `id` (string): Unique field identifier
- `name` (string): Field name for form submission
- `label` (string): Field label text
- `type` (string): Field type (see field types above)
- `placeholder` (string): Placeholder text
- `help` (string): Help text displayed below the field
- `required` (boolean): Whether the field is required
- `icon` (string): Font Awesome icon class
- `colSize` (number): Bootstrap column size (1-12)
- `value` (any): Default field value

### Validation

The component includes built-in validation for:
- Required fields
- Email format validation
- Number range validation
- Custom validation rules

### Styling

The component uses CSS custom properties for theming and includes:
- Responsive design
- Dark mode support
- High contrast support
- Reduced motion support
- Consistent with Bootstrap styling

## Examples

### User Management Form
```javascript
const userModal = new EditModal('modal-container', {
    title: 'Edit User',
    icon: 'fas fa-user-edit'
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
                required: true,
                colSize: 6
            },
            {
                id: 'last_name',
                label: 'Last Name',
                type: 'text',
                required: true,
                colSize: 6
            },
            {
                id: 'email',
                label: 'Email',
                type: 'email',
                required: true,
                colSize: 12
            }
        ]
    })
    .addSection({
        title: 'Work Information',
        icon: 'fas fa-briefcase',
        iconColor: 'text-success',
        fields: [
            {
                id: 'team',
                label: 'Team',
                type: 'dropdown',
                required: true,
                options: [
                    { value: 'dev', label: 'Development' },
                    { value: 'design', label: 'Design' }
                ],
                colSize: 6
            },
            {
                id: 'work_location',
                label: 'Work Location',
                type: 'dropdown',
                required: true,
                options: [
                    { value: 'office', label: 'Office' },
                    { value: 'remote', label: 'Remote' }
                ],
                colSize: 6
            }
        ]
    })
    .render()
    .onSaveCallback(async (data) => {
        // Save user data
        await saveUser(data);
        userModal.hide();
    })
    .show();
```

## Testing

Open `test-edit-modal.html` in a browser to see various examples and test different field types and configurations.

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Dependencies

- Bootstrap 5.3.0+
- Font Awesome 6.4.0+
- ModernDropdown component
