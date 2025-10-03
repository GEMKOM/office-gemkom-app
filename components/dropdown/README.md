# Modern Dropdown Component

A modern, accessible, and feature-rich dropdown component with support for single and multi-select functionality.

## Features

- ✅ **Single & Multi-Select**: Support for both single selection and multiple selection modes
- ✅ **Searchable**: Optional search functionality for large lists
- ✅ **Keyboard Navigation**: Full keyboard support with arrow keys, Enter, and Escape
- ✅ **Accessibility**: ARIA compliant with screen reader support
- ✅ **Customizable**: Extensive styling options and configuration
- ✅ **Event System**: Custom events for integration
- ✅ **Disabled Items**: Support for disabled options
- ✅ **Responsive**: Mobile-friendly design
- ✅ **Dark Mode**: Built-in dark mode support
- ✅ **Z-Index Management**: Automatic z-index handling for multiple dropdowns

## Installation

1. Copy the `dropdown.css` and `dropdown.js` files to your project
2. Include the CSS and JavaScript files in your HTML
3. Make sure Font Awesome is available for icons

```html
<link rel="stylesheet" href="dropdown.css">
<script type="module" src="dropdown.js"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
```

## Basic Usage

### Single Select Dropdown

```javascript
import { ModernDropdown } from './dropdown.js';

// Create container element
const container = document.getElementById('my-dropdown');

// Initialize dropdown
const dropdown = new ModernDropdown(container, {
    placeholder: 'Select an option...',
    multiple: false,
    searchable: false
});

// Set options
const options = [
    { value: 'option1', text: 'Option 1' },
    { value: 'option2', text: 'Option 2' },
    { value: 'option3', text: 'Option 3' }
];

dropdown.setItems(options);

// Get selected value
const selectedValue = dropdown.getValue();

// Set selected value
dropdown.setValue('option2');
```

### Multi-Select Dropdown

```javascript
// Initialize multi-select dropdown
const multiDropdown = new ModernDropdown(container, {
    placeholder: 'Select multiple options...',
    multiple: true,
    searchable: true
});

// Set options
multiDropdown.setItems(options);

// Get selected values (returns array)
const selectedValues = multiDropdown.getValue();

// Set selected values
multiDropdown.setValue(['option1', 'option3']);
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `placeholder` | string | 'Seçiniz...' | Placeholder text when no selection |
| `searchable` | boolean | false | Enable search functionality |
| `multiple` | boolean | false | Enable multiple selection |
| `maxHeight` | number | 300 | Maximum height of dropdown menu in pixels |
| `width` | string | '100%' | Width of the dropdown |

## API Methods

### `setItems(items)`
Set the options for the dropdown.

```javascript
const items = [
    { value: 'id1', text: 'Display Text 1' },
    { value: 'id2', text: 'Display Text 2', disabled: true },
    { value: 'id3', text: 'Display Text 3' }
];
dropdown.setItems(items);
```

### `getValue()`
Get the currently selected value(s).

```javascript
// Single select
const value = dropdown.getValue(); // Returns string or null

// Multi select
const values = dropdown.getValue(); // Returns array
```

### `setValue(value)`
Set the selected value(s).

```javascript
// Single select
dropdown.setValue('option1');

// Multi select
dropdown.setValue(['option1', 'option2']);
```

### `destroy()`
Destroy the dropdown and clean up event listeners.

```javascript
dropdown.destroy();
```

## Events

The dropdown component dispatches custom events:

### `dropdown:open`
Fired when the dropdown is opened.

```javascript
dropdown.container.addEventListener('dropdown:open', (e) => {
    console.log('Dropdown opened');
});
```

### `dropdown:close`
Fired when the dropdown is closed.

```javascript
dropdown.container.addEventListener('dropdown:close', (e) => {
    console.log('Dropdown closed');
});
```

### `dropdown:select`
Fired when a selection is made.

```javascript
dropdown.container.addEventListener('dropdown:select', (e) => {
    console.log('Selected:', e.detail.value);
    console.log('Item:', e.detail.item);
});
```

## Styling

The component uses CSS custom properties for easy theming:

```css
:root {
    --primary-color: #8B0000;
    --secondary-color: #DC143C;
    --accent-color: #FF4D4D;
    --text-color: #2c3e50;
    --text-light: #6c757d;
    --light-bg: #f8f9fa;
    --white: #ffffff;
}
```

## Keyboard Navigation

- **Arrow Down/Up**: Navigate through options
- **Enter**: Select focused option
- **Escape**: Close dropdown
- **Tab**: Focus management

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Testing

Run the test file to see all features in action:

```bash
# Open test-multi-select.html in your browser
open test-multi-select.html
```

The test file includes:
- Basic multi-select functionality
- Searchable multi-select
- Single vs multi-select comparison
- Disabled items handling
- Event testing and logging

## Examples

### Example 1: Country Selection

```javascript
const countryDropdown = new ModernDropdown(document.getElementById('country-select'), {
    placeholder: 'Select countries...',
    multiple: true,
    searchable: true
});

const countries = [
    { value: 'us', text: 'United States' },
    { value: 'uk', text: 'United Kingdom' },
    { value: 'ca', text: 'Canada' },
    { value: 'de', text: 'Germany' }
];

countryDropdown.setItems(countries);
```

### Example 2: Form Integration

```javascript
// Initialize dropdown
const priorityDropdown = new ModernDropdown(document.getElementById('priority'), {
    placeholder: 'Select priority...',
    multiple: false
});

priorityDropdown.setItems([
    { value: 'high', text: 'High Priority' },
    { value: 'medium', text: 'Medium Priority' },
    { value: 'low', text: 'Low Priority' }
]);

// Listen for changes
priorityDropdown.container.addEventListener('dropdown:select', (e) => {
    console.log('Priority changed to:', e.detail.value);
    // Update form or trigger validation
});
```

## Troubleshooting

### Common Issues

1. **Dropdown not appearing**: Check z-index conflicts and ensure parent containers don't have `overflow: hidden`
2. **Search not working**: Ensure `searchable: true` is set in options
3. **Multi-select not working**: Ensure `multiple: true` is set in options
4. **Styling issues**: Check if CSS is properly loaded and no conflicting styles

### Debug Mode

Enable debug logging by setting:

```javascript
window.dropdownDebug = true;
```

## License

This component is part of the white-app project and follows the same licensing terms.
