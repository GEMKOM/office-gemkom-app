# Team-Based Access Control System

This document explains how to use the team-based access control system implemented in the GEMKOM application.

## Overview

The access control system restricts user access to pages and features based on their team assignment (`user.team`). It provides:

1. **Route Protection**: Prevents users from accessing unauthorized pages
2. **Navigation Filtering**: Hides menu items that users cannot access
3. **Feature Access Control**: Controls access to specific features/actions
4. **Team-Based Configuration**: Centralized configuration for different teams

## Files Created/Modified

### New Files
- `generic/accessControl.js` - Core access control configuration and functions
- `generic/routeProtection.js` - Route protection middleware
- `test-access-control.html` - Test page for access control system
- `ACCESS_CONTROL_GUIDE.md` - This documentation

### Modified Files
- `components/navbar.js` - Updated to use access control for navigation
- `main.js` - Updated to use route protection and filter menu items

## Team Configuration

The system supports the following teams with their respective access levels:

### Admin
- **Access**: All routes and features
- **Description**: Full system access

### Management
- **Access**: General, Manufacturing, Procurement, Finance sections
- **Description**: Management-level access to most areas

### Manufacturing
- **Access**: Manufacturing operations, overtime management
- **Description**: Access to manufacturing processes and related overtime

### Machining
- **Access**: Machining-specific operations, overtime
- **Description**: Limited to machining operations and overtime

### Maintenance
- **Access**: Maintenance operations, overtime
- **Description**: Access to maintenance and fault management

### Welding
- **Access**: Welding operations, overtime
- **Description**: Limited to welding operations and overtime

### Procurement
- **Access**: Procurement operations, purchase orders, overtime
- **Description**: Access to procurement and related financial operations

### Planning
- **Access**: Capacity planning, procurement, overtime
- **Description**: Access to planning and procurement operations

### Finance
- **Access**: Financial operations, reports, overtime
- **Description**: Access to financial management and reporting

### Other/Default
- **Access**: Basic overtime access only
- **Description**: Minimal access for unassigned users

## Usage

### 1. Route Protection

To protect a page, add route protection at the beginning of your page's JavaScript:

```javascript
import { initRouteProtection } from '../generic/routeProtection.js';

// At the start of your page initialization
if (!initRouteProtection()) {
    return; // User was redirected, stop execution
}

// Your page initialization code here...
```

### 2. Feature Access Control

Check if a user can access a specific feature:

```javascript
import { canAccessFeature } from '../generic/routeProtection.js';

// Check if user can create users
if (canAccessFeature('create_user')) {
    // Show create user button
    showCreateUserButton();
} else {
    // Hide or disable create user button
    hideCreateUserButton();
}
```

### 3. Route Access Check

Check if a user has access to a specific route:

```javascript
import { hasRouteAccess } from '../generic/accessControl.js';

// Check if user can access a route
if (hasRouteAccess('/manufacturing/machining/dashboard')) {
    // User has access
    navigateTo('/manufacturing/machining/dashboard');
} else {
    // Show access denied message
    alert('Bu sayfaya erişim yetkiniz bulunmamaktadır.');
}
```

### 4. Navigation Filtering

The navbar automatically filters navigation items based on user team. No additional code needed.

### 5. Menu Filtering

The main page menu automatically filters cards and features based on user access. No additional code needed.

## Available Features for Access Control

The following features can be controlled:

- `create_user` - Create new users
- `edit_user` - Edit existing users
- `delete_user` - Delete users
- `view_finance` - View financial information
- `edit_finance` - Edit financial information
- `view_procurement` - View procurement information
- `edit_procurement` - Edit procurement information
- `view_manufacturing` - View manufacturing information
- `edit_manufacturing` - Edit manufacturing information
- `view_overtime` - View overtime information
- `edit_overtime` - Edit overtime information

## Testing

Use the test page `test-access-control.html` to:

1. View current user information
2. Test route access for different routes
3. Test feature access for different features
4. Test navigation filtering
5. Simulate different team configurations

## Configuration

### Adding New Teams

To add a new team, update the `TEAM_ACCESS_CONFIG` in `generic/accessControl.js`:

```javascript
'new_team': {
    allowedRoutes: [
        '/',
        '/new_team/section1',
        '/new_team/section2'
    ],
    allowedSections: ['new_team_section']
}
```

### Adding New Routes

Add new routes to the appropriate team configurations in `TEAM_ACCESS_CONFIG`.

### Adding New Features

Add new features to the `featureAccess` object in `canAccessFeature()` function in `generic/routeProtection.js`.

## Security Notes

1. **Frontend Only**: This is a frontend access control system. Backend API endpoints should also implement proper authorization.

2. **User Data**: User team information is stored in localStorage and should be validated on the backend.

3. **Route Protection**: Always use route protection on sensitive pages.

4. **Feature Checks**: Always check feature access before showing sensitive UI elements.

## Error Handling

The system includes comprehensive error handling:

- Invalid user data defaults to 'other' team
- Access check failures default to no access
- Navigation filtering errors return empty structure
- Route protection errors redirect to appropriate pages

## Integration with Existing Code

The system is designed to integrate seamlessly with existing code:

1. **Navbar**: Automatically filters navigation items
2. **Main Page**: Automatically filters menu cards
3. **Route Protection**: Can be added to any page with minimal code changes
4. **Feature Access**: Can be used anywhere in the application

## Troubleshooting

### Common Issues

1. **Navigation items not filtering**: Check if `filterNavigationByAccess` is being called in navbar initialization
2. **Route protection not working**: Ensure `initRouteProtection()` is called at the start of page initialization
3. **Feature access always false**: Check if user team is properly set in localStorage
4. **Access denied for admin users**: Ensure `isAdmin()` function is working correctly

### Debug Information

Use the test page to debug access control issues. The test page shows:
- Current user information
- Route access results
- Feature access results
- Navigation filtering results

## Future Enhancements

Potential future enhancements:

1. **Role-based access**: Extend beyond team-based to role-based access
2. **Dynamic permissions**: Allow dynamic permission changes without code updates
3. **Audit logging**: Log access attempts and denials
4. **Permission inheritance**: Allow teams to inherit permissions from other teams
5. **Time-based access**: Add time-based access restrictions
