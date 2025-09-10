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
    }
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
        in_plan: true                     // Whether task is in plan
    }
];
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
