# Notification Component

A reusable notification system for displaying alerts across the application.

## Installation

Include the component files in your HTML:

```html
<link rel="stylesheet" href="components/notification/notification.css">
<script type="module" src="components/notification/notification.js"></script>
```

## Usage

### Basic Usage

```javascript
import { showNotification, Notification } from './components/notification/notification.js';

// Simple notification
showNotification('Operation completed successfully', 'success');

// Or use the class directly
Notification.show('Something happened', 'info');
```

### Notification Types

```javascript
// Info (default)
showNotification('Information message', 'info');

// Success
showNotification('Operation successful', 'success');

// Warning
showNotification('Warning message', 'warning');

// Error
showNotification('Error occurred', 'error');
```

### Using Class Methods

```javascript
import { Notification } from './components/notification/notification.js';

Notification.info('Info message');
Notification.success('Success message');
Notification.warning('Warning message');
Notification.error('Error message');
```

### Custom Timeout

```javascript
// Show notification for 10 seconds
showNotification('This will show for 10 seconds', 'info', 10000);

// Show notification that doesn't auto-dismiss
showNotification('Click to dismiss', 'info', 0);
```

### Remove Existing Notifications

```javascript
// Remove all existing notifications before showing new one
Notification.show('New notification', 'info', 5000, { removeExisting: true });

// Or remove all manually
Notification.removeAll();
```

## API Reference

### `showNotification(message, type, timeout)`

Global function for showing notifications.

**Parameters:**
- `message` (string): The message to display
- `type` (string): Notification type - 'info', 'success', 'warning', 'error' (default: 'info')
- `timeout` (number): Auto-dismiss timeout in milliseconds (default: 5000)

**Returns:** The notification DOM element

### `Notification.show(message, type, timeout, options)`

Class method for showing notifications.

**Parameters:**
- `message` (string): The message to display
- `type` (string): Notification type (default: 'info')
- `timeout` (number): Auto-dismiss timeout (default: 5000)
- `options` (object): Additional options
  - `removeExisting` (boolean): Remove existing notifications before showing (default: false)

**Returns:** The notification DOM element

### `Notification.info(message, timeout)`

Show info notification.

### `Notification.success(message, timeout)`

Show success notification.

### `Notification.warning(message, timeout)`

Show warning notification.

### `Notification.error(message, timeout)`

Show error notification.

### `Notification.removeAll()`

Remove all active notifications.

## Examples

### Basic Success Notification

```javascript
showNotification('Data saved successfully', 'success');
```

### Error with Custom Timeout

```javascript
showNotification('Failed to save data', 'error', 10000);
```

### Replace Existing Notifications

```javascript
Notification.show('New message', 'info', 5000, { removeExisting: true });
```

### Multiple Notifications

```javascript
showNotification('First notification', 'info');
setTimeout(() => {
    showNotification('Second notification', 'success');
}, 1000);
```

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Dependencies

- Bootstrap 5.3.0+ (for alert styling and dismiss functionality)
