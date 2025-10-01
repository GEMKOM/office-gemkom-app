# Gantt Chart Component

A reusable Gantt chart component for displaying timeline-based data with interactive period controls and task visualization.

## Features

- **Multiple Time Periods**: Day, Week, Month, and Year views
- **Interactive Navigation**: Previous/Next period buttons and "Today" button
- **Current Period Indicator**: Shows the current time period being viewed
- **Current Time Indicator**: Visual line showing current time (day/week views)
- **Task Visualization**: Color-coded task bars (unlocked/locked states)
- **Responsive Design**: Adapts to different screen sizes
- **Drag & Drop Support**: Ready for task rescheduling functionality
- **Company Branding**: Uses custom color scheme (#8b0000)

## Usage

### Basic Setup

```html
<!-- Include the component files -->
<link rel="stylesheet" href="components/gantt/gantt.css">
<script src="components/gantt/gantt.js"></script>

<!-- Create a container -->
<div id="my-gantt-chart"></div>

<script>
// Initialize the Gantt chart
const ganttChart = new GanttChart('my-gantt-chart', {
    title: 'My Project Timeline',
    defaultPeriod: 'month',
    showDateOverlay: true,
    showCurrentTime: true
});
</script>
```

### Configuration Options

```javascript
const options = {
    title: 'Zaman Çizelgesi',           // Chart title
    defaultPeriod: 'month',             // Initial period: 'day', 'week', 'month', 'year'
    availableViews: ['day', 'week', 'month', 'year'], // Available view options
    showDateOverlay: true,              // Show current period indicator
    showCurrentTime: true,              // Show current time line
    onPeriodChange: (period, date) => { // Callback when period changes
        console.log('Period changed to:', period, date);
    },
    onTaskClick: (task, event) => {     // Callback when task is clicked
        console.log('Task clicked:', task);
    },
    onTaskDrag: (task, newDate) => {    // Callback when task is dragged
        console.log('Task moved:', task, newDate);
    },
    // Progress color customization
    progressColors: {
        completed: 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)',
        inProgress: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
        delayed: 'linear-gradient(135deg, #dc3545 0%, #bd2130 100%)',
        onHold: 'linear-gradient(135deg, #ffc107 0%, #e0a800 100%)'
    },
    useCustomProgressColors: false      // Enable custom progress colors
};
```

### Task Data Format

Tasks should be provided as an array of objects with the following structure:

```javascript
const tasks = [
    {
        id: 1,
        title: 'Task Name',
        planned_start_ms: 1704067200000,  // Start time in milliseconds
        planned_end_ms: 1704153600000,    // End time in milliseconds
        plan_order: 1,                    // Display order
        plan_locked: false,               // Locked state (affects color)
        in_plan: true,                    // Whether task is in plan
        
        // Progress fields (optional)
        progress_percentage: 75,          // Progress percentage (0-100)
        completed_hours: 30,              // Completed hours
        total_hours: 40,                  // Total estimated hours
        status: 'in-progress',            // Task status: 'in-progress', 'completed', 'delayed', 'on-hold'
        remaining_hours: 10,              // Remaining hours
        estimated_hours: 40               // Total estimated hours (alternative to total_hours)
    }
];
```

#### Progress Visualization

The Gantt chart now supports progress visualization with the following features:

- **Progress Bars**: Visual progress indicators overlaid on task bars
- **Color Coding**: Different colors for different progress states:
  - Green: Completed tasks (100% progress)
  - Blue: In-progress tasks
  - Red: Delayed/overdue tasks
  - Yellow: On-hold/paused tasks
- **Progress Labels**: Percentage labels shown on larger task bars
- **Enhanced Tooltips**: Progress information included in hover tooltips

#### Progress Data Fields

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `progress_percentage` | number | Progress percentage (0-100) | Optional |
| `completed_hours` | number | Hours completed | Optional |
| `total_hours` | number | Total estimated hours | Optional |
| `status` | string | Task status | Optional |
| `remaining_hours` | number | Hours remaining | Optional |
| `estimated_hours` | number | Total estimated hours | Optional |

**Note**: If `progress_percentage` is not provided, it will be calculated from `completed_hours` and `total_hours` if available.

#### Progress Color Customization

The Gantt chart supports full customization of progress bar colors through multiple methods:

**Method 1: CSS Custom Properties**
```css
:root {
    --progress-completed-color: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
    --progress-in-progress-color: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
    --progress-delayed-color: linear-gradient(135deg, #dc3545 0%, #bd2130 100%);
    --progress-on-hold-color: linear-gradient(135deg, #ffc107 0%, #e0a800 100%);
}
```

**Method 2: JavaScript API**
```javascript
// Set all progress colors at once
ganttChart.setProgressColors({
    completed: 'linear-gradient(135deg, #6f42c1 0%, #5a2d91 100%)',
    inProgress: 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)',
    delayed: 'linear-gradient(135deg, #fd7e14 0%, #e55100 100%)',
    onHold: 'linear-gradient(135deg, #6c757d 0%, #545b62 100%)'
});

// Set individual colors
ganttChart.setProgressColor('completed', 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)');
```

**Method 3: Configuration Options**
```javascript
const ganttChart = new GanttChart('container', {
    progressColors: {
        completed: 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)',
        inProgress: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
        delayed: 'linear-gradient(135deg, #dc3545 0%, #bd2130 100%)',
        onHold: 'linear-gradient(135deg, #ffc107 0%, #e0a800 100%)'
    },
    useCustomProgressColors: true
});
```

### Public API Methods

```javascript
// Set tasks data
ganttChart.setTasks(tasks);

// Update chart title
ganttChart.updateTitle('New Title');

// Get current period
const period = ganttChart.getCurrentPeriod();

// Get current date
const date = ganttChart.getCurrentDate();

// Get all tasks
const tasks = ganttChart.getTasks();

// Get available views
const availableViews = ganttChart.getAvailableViews();

// Progress color customization
ganttChart.setProgressColors({
    completed: 'linear-gradient(135deg, #28a745 0%, #1e7e34 100%)',
    inProgress: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
    delayed: 'linear-gradient(135deg, #dc3545 0%, #bd2130 100%)',
    onHold: 'linear-gradient(135deg, #ffc107 0%, #e0a800 100%)'
});

// Set individual progress color
ganttChart.setProgressColor('completed', 'linear-gradient(135deg, #6f42c1 0%, #5a2d91 100%)');

// Reset to default colors
ganttChart.resetProgressColors();

// Get current progress colors
const colors = ganttChart.getProgressColors();

// Destroy the component
ganttChart.destroy();
```

## Styling

The component uses CSS custom properties and can be customized by overriding the following variables:

```css
:root {
    --gantt-primary-color: #8b0000;
    --gantt-secondary-color: #660000;
    --gantt-background-color: #ffe6e6;
    --gantt-border-color: #ff9999;
}
```

## Responsive Breakpoints

- **Desktop**: Full functionality with all features
- **Tablet (≤768px)**: Adjusted spacing and button layout
- **Mobile (≤576px)**: Compact layout with stacked controls

## Browser Support

- Modern browsers with ES6+ support
- Requires Font Awesome for icons
- Bootstrap classes for button styling

## Examples

### Basic Implementation

```javascript
// Simple Gantt chart
const gantt = new GanttChart('gantt-container');

// Load tasks
const tasks = [
    {
        id: 1,
        title: 'Project Planning',
        planned_start_ms: Date.now(),
        planned_end_ms: Date.now() + (7 * 24 * 60 * 60 * 1000),
        plan_order: 1,
        plan_locked: false,
        in_plan: true
    }
];

gantt.setTasks(tasks);
```

### Progress Implementation Example

```javascript
// Gantt chart with progress visualization
const gantt = new GanttChart('gantt-container');

// Load tasks with progress information
const tasks = [
    {
        id: 1,
        title: 'Project Planning',
        planned_start_ms: Date.now(),
        planned_end_ms: Date.now() + (7 * 24 * 60 * 60 * 1000),
        plan_order: 1,
        plan_locked: false,
        in_plan: true,
        progress_percentage: 75,
        completed_hours: 30,
        total_hours: 40,
        status: 'in-progress'
    },
    {
        id: 2,
        title: 'Development',
        planned_start_ms: Date.now() + (3 * 24 * 60 * 60 * 1000),
        planned_end_ms: Date.now() + (14 * 24 * 60 * 60 * 1000),
        plan_order: 2,
        plan_locked: false,
        in_plan: true,
        progress_percentage: 100,
        completed_hours: 80,
        total_hours: 80,
        status: 'completed'
    },
    {
        id: 3,
        title: 'Testing',
        planned_start_ms: Date.now() + (10 * 24 * 60 * 60 * 1000),
        planned_end_ms: Date.now() + (17 * 24 * 60 * 60 * 1000),
        plan_order: 3,
        plan_locked: false,
        in_plan: true,
        progress_percentage: 25,
        completed_hours: 5,
        total_hours: 20,
        status: 'delayed'
    }
];

gantt.setTasks(tasks);
```

### Customizing Available Views

```javascript
// Only show day and week views
const gantt = new GanttChart('gantt-container', {
    availableViews: ['day', 'week'],
    defaultPeriod: 'day'
});

// Only show month and year views
const gantt = new GanttChart('gantt-container', {
    availableViews: ['month', 'year'],
    defaultPeriod: 'month'
});

// Show all views (default behavior)
const gantt = new GanttChart('gantt-container', {
    availableViews: ['day', 'week', 'month', 'year']
});
```

### With Event Handlers

```javascript
const gantt = new GanttChart('gantt-container', {
    onPeriodChange: (period, date) => {
        // Reload data for new period
        loadTasksForPeriod(period, date);
    },
    onTaskClick: (task) => {
        // Open task details modal
        openTaskModal(task);
    }
});
```

## Integration with Existing Systems

This component is designed to work seamlessly with the existing project structure:

- Uses the same color scheme as other components
- Follows the same naming conventions
- Compatible with existing CSS frameworks
- Supports the same event patterns

## File Structure

```
components/gantt/
├── gantt.html          # Component HTML template
├── gantt.css           # Component styles
├── gantt.js            # Component logic
└── README.md           # This documentation
```
