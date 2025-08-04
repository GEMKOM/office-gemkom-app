# Machining Module - Shared Styling

This directory contains the machining module with a unified styling approach using shared CSS components.

## File Structure

```
manufacturing/machining/
├── shared.css              # Shared styles for all machining pages
├── dashboard/
│   ├── index.html         # Dashboard page (uses compact styling)
│   ├── dashboard.css      # Original dashboard styles (imported by shared.css)
│   └── dashboard.js       # Dashboard functionality
├── tasks/
│   ├── index.html         # Tasks page (uses compact styling)
│   ├── tasks.css          # Task-specific styles only
│   └── tasks.js           # Tasks functionality
└── README.md              # This documentation
```

## Styling Approach

### Shared CSS (`shared.css`)
- Contains all common styling for machining pages
- Includes compact component styles for smaller, more efficient layouts
- Imports base dashboard styles and extends them
- Provides consistent styling across all machining pages

### Compact Components
The following components support a `compact` class for smaller sizing:

- `.dashboard-header.compact` - Smaller header with reduced padding
- `.stat-card.compact` - Smaller statistics cards
- `.dashboard-card.compact` - Smaller dashboard cards
- `.modal-content.compact` - Smaller modals
- `.form-section.compact` - Smaller form sections

### Usage

For new machining pages:

1. **Include the shared CSS:**
   ```html
   <link rel="stylesheet" href="../shared.css">
   ```

2. **Use compact classes for smaller components:**
   ```html
   <div class="dashboard-header compact">
   <div class="stat-card compact">
   <div class="dashboard-card compact">
   ```

3. **Create page-specific CSS only for unique styles:**
   ```css
   /* Import shared styles */
   @import url('../shared.css');
   
   /* Page-specific styles only */
   .my-special-component {
       /* Custom styles */
   }
   ```

## Benefits

- **Consistency**: All machining pages use the same base styling
- **Maintainability**: Changes to shared styles affect all pages
- **Efficiency**: Reduced CSS duplication
- **Flexibility**: Compact styling option for space-constrained layouts
- **Scalability**: Easy to add new pages with consistent styling

## Current Pages

### Dashboard (`dashboard/index.html`)
- Uses compact styling for all components
- Real-time production tracking and analysis
- Statistics cards, active timers, machine status

### Tasks (`tasks/index.html`)
- Uses compact styling for all components
- Task management and tracking
- Bulk task creation functionality

## Future Pages

When adding new pages to the machining module:

1. Follow the same structure as existing pages
2. Use the shared CSS file
3. Apply compact styling for consistency
4. Keep page-specific CSS minimal and focused 