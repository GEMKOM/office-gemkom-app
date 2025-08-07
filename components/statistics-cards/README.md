# Statistics Cards Component

A flexible and reusable component for displaying statistics cards with customizable content, icons, and colors.

## Features

- **Flexible Layout**: Support for grid and flex layouts
- **Responsive Design**: Automatically adapts to different screen sizes
- **Customizable**: Configurable colors, icons, and content
- **Interactive**: Support for click handlers and tooltips
- **Animations**: Smooth entrance animations with staggered effects
- **Accessibility**: High contrast mode and reduced motion support
- **Multiple Variants**: Compact and full-size card options

## Installation

Include the component files in your HTML:

```html
<!-- CSS -->
<link rel="stylesheet" href="components/statistics-cards/statistics-cards.css">

<!-- JavaScript -->
<script src="components/statistics-cards/statistics-cards.js"></script>
```

## Basic Usage

### HTML Structure

Create a container for the statistics cards:

```html
<div id="statistics-container"></div>
```

### JavaScript Initialization

```javascript
// Initialize the component
const statsCards = new StatisticsCards('statistics-container', {
    cards: [
        {
            title: 'Total Tasks',
            value: '150',
            icon: 'fas fa-list',
            color: 'primary'
        },
        {
            title: 'Active Tasks',
            value: '45',
            icon: 'fas fa-play',
            color: 'success'
        },
        {
            title: 'Completed',
            value: '95',
            icon: 'fas fa-check',
            color: 'info'
        },
        {
            title: 'Pending',
            value: '10',
            icon: 'fas fa-clock',
            color: 'warning'
        }
    ],
    compact: true,
    animation: true
});
```

## Configuration Options

### Component Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cards` | Array | `[]` | Array of card objects |
| `layout` | String | `'grid'` | Layout type: `'grid'` or `'flex'` |
| `responsive` | Boolean | `true` | Enable responsive behavior |
| `compact` | Boolean | `true` | Use compact card style |
| `animation` | Boolean | `true` | Enable entrance animations |

### Card Object Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `title` | String | `''` | Card label text |
| `value` | String/Number | `'0'` | Displayed value |
| `icon` | String | `'fas fa-chart-bar'` | FontAwesome icon class |
| `color` | String | `'primary'` | Bootstrap color class |
| `bgColor` | String | `null` | Custom background color |
| `textColor` | String | `null` | Custom text color |
| `compact` | Boolean | `true` | Override component compact setting |
| `id` | String | `'stat-card-{index}'` | Custom card ID |
| `onClick` | String | `null` | Click handler function name |
| `tooltip` | String | `null` | Tooltip text |

## Available Colors

The component supports all Bootstrap color classes:

- `primary` - Blue
- `success` - Green
- `info` - Cyan
- `warning` - Yellow
- `danger` - Red
- `secondary` - Gray
- `dark` - Dark gray
- `light` - Light gray

## Methods

### setCards(cards)
Update all cards at once:

```javascript
statsCards.setCards([
    {
        title: 'New Metric',
        value: '25',
        icon: 'fas fa-star',
        color: 'warning'
    }
]);
```

### addCard(card)
Add a single card:

```javascript
statsCards.addCard({
    title: 'Additional Metric',
    value: '100',
    icon: 'fas fa-plus',
    color: 'success'
});
```

### removeCard(index)
Remove a card by index:

```javascript
statsCards.removeCard(0); // Remove first card
```

### updateCard(index, cardData)
Update a specific card:

```javascript
statsCards.updateCard(0, {
    value: '200',
    title: 'Updated Metric'
});
```

### updateValues(values)
Update multiple card values:

```javascript
statsCards.updateValues({
    0: '150',
    1: '75',
    2: '25'
});
```

### showLoading()
Display loading state:

```javascript
statsCards.showLoading();
```

### showEmpty(message)
Display empty state:

```javascript
statsCards.showEmpty('No data available');
```

### destroy()
Clean up the component:

```javascript
statsCards.destroy();
```

## Advanced Examples

### Custom Colors

```javascript
const statsCards = new StatisticsCards('statistics-container', {
    cards: [
        {
            title: 'Custom Card',
            value: '42',
            icon: 'fas fa-cog',
            bgColor: '#ff6b6b',
            textColor: '#ffffff'
        }
    ]
});
```

### Clickable Cards

```javascript
const statsCards = new StatisticsCards('statistics-container', {
    cards: [
        {
            title: 'Clickable Card',
            value: '10',
            icon: 'fas fa-hand-pointer',
            color: 'primary',
            onClick: 'handleCardClick(0)',
            tooltip: 'Click to view details'
        }
    ]
});

// Define the click handler
function handleCardClick(index) {
    console.log(`Card ${index} clicked`);
}
```

### Dynamic Updates

```javascript
// Update values periodically
setInterval(() => {
    statsCards.updateValues({
        0: Math.floor(Math.random() * 100),
        1: Math.floor(Math.random() * 50),
        2: Math.floor(Math.random() * 25)
    });
}, 5000);
```

### Different Layouts

```javascript
// Grid layout (default)
const gridStats = new StatisticsCards('grid-container', {
    layout: 'grid',
    responsive: true
});

// Flex layout
const flexStats = new StatisticsCards('flex-container', {
    layout: 'flex',
    responsive: false
});
```

## Migration from Existing Code

To replace the existing statistics cards in your tasks page:

### Before (HTML)
```html
<div class="row g-3 mb-3">
    <div class="col-lg-3 col-md-6">
        <div class="stat-card compact">
            <div class="stat-card-body">
                <div class="stat-icon bg-primary">
                    <i class="fas fa-list"></i>
                </div>
                <div class="stat-content">
                    <h4 class="stat-number" id="all-tasks-count">0</h4>
                    <p class="stat-label small">Tüm Görevler</p>
                </div>
            </div>
        </div>
    </div>
    <!-- More cards... -->
</div>
```

### After (HTML)
```html
<div id="tasks-statistics"></div>
```

### After (JavaScript)
```javascript
const tasksStats = new StatisticsCards('tasks-statistics', {
    cards: [
        {
            title: 'Tüm Görevler',
            value: '0',
            icon: 'fas fa-list',
            color: 'primary',
            id: 'all-tasks-count'
        },
        {
            title: 'Aktif Görevler',
            value: '0',
            icon: 'fas fa-play',
            color: 'success',
            id: 'active-tasks-count'
        },
        {
            title: 'Tamamlanan',
            value: '0',
            icon: 'fas fa-check',
            color: 'info',
            id: 'completed-tasks-count'
        },
        {
            title: 'Bekleyen',
            value: '0',
            icon: 'fas fa-clock',
            color: 'warning',
            id: 'pending-tasks-count'
        }
    ],
    compact: true
});

// Update values when data changes
function updateTaskStatistics(data) {
    tasksStats.updateValues({
        0: data.totalTasks,
        1: data.activeTasks,
        2: data.completedTasks,
        3: data.pendingTasks
    });
}
```

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Dependencies

- FontAwesome 5+ (for icons)
- Bootstrap 5+ (for color classes and grid system)

## License

This component is part of the white-app project and follows the same license terms.
