# Migration Guide: Statistics Cards Component

This guide shows how to migrate from the existing hardcoded statistics cards to the new reusable StatisticsCards component.

## Step 1: Include the Component Files

Add the component files to your HTML page:

```html
<!-- Add these to your HTML head section -->
<link rel="stylesheet" href="../../../components/statistics-cards/statistics-cards.css">
<script src="../../../components/statistics-cards/statistics-cards.js"></script>
```

## Step 2: Replace HTML Structure

### Before (Current HTML)
```html
<!-- Statistics Cards -->
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
    <div class="col-lg-3 col-md-6">
        <div class="stat-card compact">
            <div class="stat-card-body">
                <div class="stat-icon bg-success">
                    <i class="fas fa-play"></i>
                </div>
                <div class="stat-content">
                    <h4 class="stat-number" id="active-tasks-count">0</h4>
                    <p class="stat-label small">Aktif Görevler</p>
                </div>
            </div>
        </div>
    </div>
    <div class="col-lg-3 col-md-6">
        <div class="stat-card compact">
            <div class="stat-card-body">
                <div class="stat-icon bg-info">
                    <i class="fas fa-check"></i>
                </div>
                <div class="stat-content">
                    <h4 class="stat-number" id="completed-tasks-count">0</h4>
                    <p class="stat-label small">Tamamlanan</p>
                </div>
            </div>
        </div>
    </div>
    <div class="col-lg-3 col-md-6">
        <div class="stat-card compact">
            <div class="stat-card-body">
                <div class="stat-icon bg-warning">
                    <i class="fas fa-clock"></i>
                </div>
                <div class="stat-content">
                    <h4 class="stat-number" id="pending-tasks-count">0</h4>
                    <p class="stat-label small">Bekleyen</p>
                </div>
            </div>
        </div>
    </div>
</div>
```

### After (New HTML)
```html
<!-- Statistics Cards -->
<div id="tasks-statistics"></div>
```

## Step 3: Update JavaScript Code

### Before (Current JavaScript)
```javascript
// In your tasks.js file
function updateTaskCounts() {
    // Calculate counts from current data
    const allCount = totalTasks;
    const activeCount = tasks.filter(t => t.total_hours_spent > 0 && !t.completion_date).length;
    const completedCount = tasks.filter(t => t.completion_date).length;
    const pendingCount = tasks.filter(t => t.total_hours_spent === 0 && !t.completion_date).length;
    
    // Animate number updates
    animateNumber('all-tasks-count', allCount);
    animateNumber('active-tasks-count', activeCount);
    animateNumber('completed-tasks-count', completedCount);
    animateNumber('pending-tasks-count', pendingCount);
}

function animateNumber(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const currentValue = parseInt(element.textContent) || 0;
    const increment = (targetValue - currentValue) / 20;
    let current = currentValue;
    
    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= targetValue) || (increment < 0 && current <= targetValue)) {
            element.textContent = targetValue;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 50);
}
```

### After (New JavaScript)
```javascript
// Add this to your tasks.js file after the imports
let tasksStats = null;

// Initialize the component in your DOMContentLoaded event
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Talaşlı İmalat Görevleri',
        subtitle: 'Görev yönetimi ve takibi',
        icon: 'tasks',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'block',
        createButtonText: '      Yeni Görev',
        bulkCreateButtonText: 'Toplu Oluştur',
        onBackClick: () => window.location.href = '/manufacturing/machining/',
        onCreateClick: () => showCreateTaskModal(),
        onBulkCreateClick: () => showBulkCreateModal()
    });
    
    // Initialize statistics cards component
    tasksStats = new StatisticsCards('tasks-statistics', {
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
        compact: true,
        animation: true
    });
    
    await initializeTasks();
    setupEventListeners();
});

// Replace the updateTaskCounts function
function updateTaskCounts() {
    // Calculate counts from current data
    const allCount = totalTasks;
    const activeCount = tasks.filter(t => t.total_hours_spent > 0 && !t.completion_date).length;
    const completedCount = tasks.filter(t => t.completion_date).length;
    const pendingCount = tasks.filter(t => t.total_hours_spent === 0 && !t.completion_date).length;
    
    // Update the statistics cards
    if (tasksStats) {
        tasksStats.updateValues({
            0: allCount.toString(),
            1: activeCount.toString(),
            2: completedCount.toString(),
            3: pendingCount.toString()
        });
    }
}

// Remove the animateNumber function as it's handled by the component
```

## Step 4: Update CSS Imports

### Before
```css
/* In your tasks.css file */
@import url('../shared.css');
```

### After
```css
/* In your tasks.css file */
@import url('../shared.css');
/* The statistics cards styles are now imported via the component CSS */
```

## Step 5: Optional - Add Interactive Features

You can enhance the statistics cards with interactive features:

```javascript
// Initialize with click handlers
tasksStats = new StatisticsCards('tasks-statistics', {
    cards: [
        {
            title: 'Tüm Görevler',
            value: '0',
            icon: 'fas fa-list',
            color: 'primary',
            id: 'all-tasks-count',
            onClick: 'filterAllTasks()',
            tooltip: 'Tüm görevleri görüntüle'
        },
        {
            title: 'Aktif Görevler',
            value: '0',
            icon: 'fas fa-play',
            color: 'success',
            id: 'active-tasks-count',
            onClick: 'filterActiveTasks()',
            tooltip: 'Aktif görevleri görüntüle'
        },
        {
            title: 'Tamamlanan',
            value: '0',
            icon: 'fas fa-check',
            color: 'info',
            id: 'completed-tasks-count',
            onClick: 'filterCompletedTasks()',
            tooltip: 'Tamamlanan görevleri görüntüle'
        },
        {
            title: 'Bekleyen',
            value: '0',
            icon: 'fas fa-clock',
            color: 'warning',
            id: 'pending-tasks-count',
            onClick: 'filterPendingTasks()',
            tooltip: 'Bekleyen görevleri görüntüle'
        }
    ],
    compact: true,
    animation: true
});

// Add filter functions
function filterAllTasks() {
    currentFilter = 'all';
    loadTasks(1);
}

function filterActiveTasks() {
    currentFilter = 'active';
    loadTasks(1);
}

function filterCompletedTasks() {
    currentFilter = 'completed';
    loadTasks(1);
}

function filterPendingTasks() {
    currentFilter = 'pending';
    loadTasks(1);
}
```

## Benefits of Migration

1. **Reusability**: Use the same component across multiple pages
2. **Maintainability**: Centralized styling and behavior
3. **Flexibility**: Easy to add/remove cards or change layouts
4. **Consistency**: Uniform appearance across all pages
5. **Performance**: Optimized rendering and animations
6. **Accessibility**: Built-in accessibility features

## Testing the Migration

1. Replace the HTML structure
2. Update the JavaScript code
3. Test that the statistics cards display correctly
4. Verify that the counts update when data changes
5. Test responsive behavior on different screen sizes
6. Check that animations work properly

## Troubleshooting

### Cards not displaying
- Check that the component CSS and JS files are properly loaded
- Verify the container ID matches between HTML and JavaScript
- Check browser console for any JavaScript errors

### Counts not updating
- Ensure the `tasksStats` variable is accessible in the scope where `updateTaskCounts()` is called
- Verify that the component is initialized before calling update methods

### Styling issues
- Make sure the component CSS is loaded after Bootstrap CSS
- Check for any conflicting CSS rules in your existing stylesheets

## Next Steps

After successfully migrating to the new component, you can:

1. Use the same component in other pages (dashboard, reports, etc.)
2. Add more interactive features like click handlers
3. Customize the appearance with different colors and layouts
4. Add loading states for better user experience
