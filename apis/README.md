# apis Services

This folder contains reusable service modules that provide API functionality and utility functions for the application.

## Other Services

- **`users.js`** - User management and authentication
- **`tasks.js`** - Task management for machining operations
- **`machines.js`** - Machine management and status
- **`maintenance.js`** - Maintenance request handling
- **`procurement.js`** - Procurement and purchase management
- **`purchaseOrders.js`** - Purchase order operations
- **`formatters.js`** - Data formatting utilities
- **`paginationHelper.js`** - Pagination utilities for API responses

## Authentication

All services use the `authedFetch` function from `authService.js` which:
- Automatically includes authentication headers
- Handles token refresh on 401 responses
- Redirects to login on authentication failure

## Error Handling

Services return fetch Response objects, allowing calling code to:
- Check response status with `response.ok`
- Handle errors appropriately
- Access response data with `response.json()`

## Best Practices

1. **Import only what you need** - Use destructured imports for better tree-shaking
2. **Handle responses properly** - Always check `response.ok` before processing data
3. **Use utility functions** - Leverage built-in validation and formatting functions
4. **Error handling** - Implement proper error handling in calling code
5. **Type checking** - Use JSDoc comments for better IDE support




++++