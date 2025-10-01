# Generic Services

This folder contains reusable service modules that provide API functionality and utility functions for the application.

## Overtime Service (`overtime.js`)

The overtime service provides a complete API interface for managing overtime requests using the `authedFetch` function for authenticated requests.

### Features

- **Overtime Requests Management**: CRUD operations for overtime requests
- **User Management**: Fetch users for participant selection
- **Validation**: Built-in validation for overtime request data
- **Utility Functions**: Status formatting, permission checks, and duration formatting

### API Endpoints

- `GET /overtime/requests/` - List overtime requests with filtering
- `POST /overtime/requests/` - Create new overtime request
- `GET /overtime/requests/{id}/` - Get overtime request details
- `PATCH /overtime/requests/{id}/` - Update overtime request (reason only while submitted)
- `POST /overtime/requests/{id}/cancel/` - Cancel overtime request

**Note**: Users are fetched using the existing `authFetchUsers` function from `users.js`

### Usage Example

```javascript
import { 
    fetchOvertimeRequests, 
    createOvertimeRequest, 
    validateOvertimeRequest 
} from '../generic/overtime.js';
import { authFetchUsers } from '../generic/users.js';

// Fetch overtime requests with filters
const requests = await fetchOvertimeRequests({
    status: 'submitted',
    start_date: '2024-01-01',
    end_date: '2024-01-31'
});

// Fetch users for participant selection
const usersResponse = await authFetchUsers(1, 100);

// Create new overtime request
const overtimeData = {
    start_at: '2024-01-15T08:00:00Z',
    end_at: '2024-01-15T16:00:00Z',
    reason: 'Production deadline',
    entries: [
        { user: 1, job_no: 'JOB001', description: 'Assembly work' }
    ]
};

// Validate before submission
const validation = validateOvertimeRequest(overtimeData);
if (validation.isValid) {
    const response = await createOvertimeRequest(overtimeData);
}
```

### Utility Functions

- `validateOvertimeRequest(data)` - Validates overtime request data
- `getOvertimeStatusInfo(status)` - Returns status display configuration
- `formatOvertimeDuration(hours)` - Formats duration for display
- `canCancelOvertime(request, userId)` - Checks if user can cancel request
- `canEditOvertime(request, userId)` - Checks if user can edit request

**Note**: The overtime service focuses on core CRUD operations. User management is handled by the existing `users.js` service.

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
