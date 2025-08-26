# Header Component

A reusable header component that provides consistent navigation and action buttons across different pages in the application.

## Features

- **Configurable Title & Subtitle**: Set custom titles and descriptions for each page
- **Flexible Button System**: Show/hide different action buttons as needed
- **Responsive Design**: Adapts to different screen sizes
- **Accessibility Support**: Proper focus states and keyboard navigation
- **Customizable Callbacks**: Define custom actions for each button

## Usage

### How It Works

The header component uses a **placeholder approach** similar to the navbar component:

1. **Add a placeholder** in your HTML where you want the header to appear
2. **Initialize the component** with your desired configuration
3. **The component replaces** the placeholder with the actual header

This approach gives you full control over where the header appears in your page layout.

### Basic Implementation

```html
<!-- Include the CSS -->
<link rel="stylesheet" href="components/header/header.css">

<!-- Include the JavaScript -->
<script src="components/header/header.js"></script>

<!-- Add placeholder where you want the header to appear -->
<div id="header-placeholder"></div>
```

### JavaScript Usage

```javascript
// Basic header with back button only
const header = new HeaderComponent({
    title: 'Talaşlı İmalat Görevleri',
    subtitle: 'Görev yönetimi ve takibi',
    icon: 'tasks',
    showBackButton: 'block'
});

// Header with multiple buttons
const header = new HeaderComponent({
    title: 'Kullanıcı Yönetimi',
    subtitle: 'Kullanıcı listesi ve yönetimi',
    icon: 'users',
    showBackButton: 'block',
    showCreateButton: 'block',
    showExportButton: 'block',
    createButtonText: 'Yeni Kullanıcı',
    exportButtonText: 'Excel İndir',
    onBackClick: () => window.history.back(),
    onCreateClick: () => openCreateUserModal(),
    onExportClick: () => exportUsersToExcel()
});
```

## Configuration Options

### Basic Settings

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `title` | string | 'Sayfa Başlığı' | Main page title |
| `subtitle` | string | 'Sayfa açıklaması' | Page description |
| `icon` | string | 'home' | FontAwesome icon name |

### Button Visibility

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `showBackButton` | string | 'block' | Show/hide back button |
| `showCreateButton` | string | 'none' | Show/hide create button |
| `showBulkCreateButton` | string | 'none' | Show/hide bulk create button |
| `showExportButton` | string | 'none' | Show/hide export button |
| `showRefreshButton` | string | 'none' | Show/hide refresh button |

### Button Text

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `createButtonText` | string | 'Yeni Oluştur' | Text for create button |
| `bulkCreateButtonText` | string | 'Toplu Oluştur' | Text for bulk create button |
| `exportButtonText` | string | 'Dışa Aktar' | Text for export button |
| `refreshButtonText` | string | 'Yenile' | Text for refresh button |

### Callback Functions

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `onBackClick` | function | null | Custom back button action |
| `onCreateClick` | function | null | Custom create button action |
| `onBulkCreateClick` | function | null | Custom bulk create action |
| `onExportClick` | function | null | Custom export action |
| `onRefreshClick` | function | null | Custom refresh action |

### Navigation

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `backUrl` | string | null | Specific URL for back navigation |

## Methods

### updateConfig(newConfig)
Update the header configuration dynamically.

```javascript
header.updateConfig({
    title: 'Updated Title',
    showCreateButton: 'block'
});
```

### showButton(buttonId)
Show a specific button.

```javascript
header.showButton('create-btn');
```

### hideButton(buttonId)
Hide a specific button.

```javascript
header.hideButton('export-btn');
```

### updateTitle(title, subtitle)
Update the title and subtitle.

```javascript
header.updateTitle('New Title', 'New Subtitle');
```

## Examples

### Tasks Page Header

**HTML:**
```html
<div id="header-placeholder"></div>
```

**JavaScript:**
```javascript
const tasksHeader = new HeaderComponent({
    title: 'Talaşlı İmalat Görevleri',
    subtitle: 'Görev yönetimi ve takibi',
    icon: 'tasks',
    showBackButton: 'block',
    showCreateButton: 'block',
    showBulkCreateButton: 'block',
    createButtonText: 'Yeni Görev',
    bulkCreateButtonText: 'Toplu Oluştur',
    onBackClick: () => window.location.href = '/machining/',
    onCreateClick: () => openCreateTaskModal(),
    onBulkCreateClick: () => openBulkCreateModal()
});
```

### Users Page Header

**HTML:**
```html
<div id="header-placeholder"></div>
```

**JavaScript:**
```javascript
const usersHeader = new HeaderComponent({
    title: 'Kullanıcı Yönetimi',
    subtitle: 'Kullanıcı listesi ve yönetimi',
    icon: 'users',
    showBackButton: 'block',
    showCreateButton: 'block',
    showExportButton: 'block',
    createButtonText: 'Yeni Kullanıcı',
    exportButtonText: 'Excel İndir',
    onBackClick: () => window.location.href = '/general/',
    onCreateClick: () => openCreateUserModal(),
    onExportClick: () => exportUsersToExcel()
});
```

### Reports Page Header

**HTML:**
```html
<div id="header-placeholder"></div>
```

**JavaScript:**
```javascript
const reportsHeader = new HeaderComponent({
    title: 'Raporlar',
    subtitle: 'Sistem raporları ve analizler',
    icon: 'chart-bar',
    showBackButton: 'block',
    showExportButton: 'block',
    showRefreshButton: 'block',
    exportButtonText: 'PDF İndir',
    refreshButtonText: 'Yenile',
    onBackClick: () => window.location.href = '/machining/',
    onExportClick: () => exportReportToPDF(),
    onRefreshClick: () => refreshReportData()
});
```

## CSS Classes

The component uses the following CSS classes:

- `.dashboard-header` - Main header container
- `.dashboard-header.compact` - Compact version for smaller spaces
- `.dashboard-controls` - Button container
- `.section-title` - Main title styling
- `.section-subtitle` - Subtitle styling

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Accessibility

- Proper focus states for keyboard navigation
- ARIA labels for screen readers
- High contrast mode support
- Reduced motion support for users with vestibular disorders 