import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const MACHINING_2_BASE_URL = `${backendBase}/tasks`;

/**
 * Machining Operations API Operations
 * Handles Operation model CRUD operations and custom actions
 * Based on OperationViewSet Django REST Framework ViewSet
 */

/**
 * Get all operations (list view)
 * @param {Object} [filters] - Optional filters and query parameters
 * @param {string} [filters.part__key] - Filter by part key
 * @param {number} [filters.machine_fk] - Filter by machine ID
 * @param {number} [filters.completion_date] - Filter by completion date (timestamp)
 * @param {string} [filters.part_key] - Filter by part key (query param)
 * @param {number} [filters.machine_id] - Filter by machine ID (query param)
 * @param {string} [filters.ordering] - Ordering field (e.g., 'part', 'order', 'created_at')
 * @param {number} [filters.page] - Page number for pagination
 * @param {number} [filters.page_size] - Page size for pagination
 * @returns {Promise<Array|Object>} Array of operations or paginated response
 */
export async function getOperations(filters = {}) {
    try {
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = queryParams.toString() 
            ? `${MACHINING_2_BASE_URL}/operations/?${queryParams.toString()}`
            : `${MACHINING_2_BASE_URL}/operations/`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to fetch operations: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        
        // Handle both direct array response and paginated response
        if (data.results && Array.isArray(data.results)) {
            return data; // Return the full paginated response
        } else if (Array.isArray(data)) {
            return data; // Return the direct array
        } else {
            throw new Error('Unexpected response format');
        }
    } catch (error) {
        console.error('Error fetching operations:', error);
        throw error;
    }
}

/**
 * Get a single operation by key (detail view)
 * @param {string} operationKey - The operation key (primary key)
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.view] - View parameter (e.g., 'detail')
 * @returns {Promise<Object>} Operation data with tools and hours spent
 */
export async function getOperation(operationKey, options = {}) {
    try {
        const queryParams = new URLSearchParams();
        if (options.view) {
            queryParams.append('view', options.view);
        }
        
        const url = queryParams.toString() 
            ? `${MACHINING_2_BASE_URL}/operations/${operationKey}/?${queryParams.toString()}`
            : `${MACHINING_2_BASE_URL}/operations/${operationKey}/`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to fetch operation: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching operation:', error);
        throw error;
    }
}

/**
 * Create a new operation
 * @param {Object} operationData - Operation data
 * @param {string} operationData.name - Operation name (required)
 * @param {string} [operationData.description] - Operation description
 * @param {string} operationData.part_key - Part key (required)
 * @param {number} operationData.order - Operation order (required)
 * @param {number} operationData.machine_fk - Machine ID (required)
 * @param {boolean} [operationData.interchangeable] - Whether operation can be done out of order
 * @param {number} [operationData.estimated_hours] - Estimated hours
 * @param {boolean} [operationData.in_plan] - Whether operation is in planning
 * @param {number} [operationData.plan_order] - Planning order
 * @param {number} [operationData.planned_start_ms] - Planned start time (timestamp)
 * @param {number} [operationData.planned_end_ms] - Planned end time (timestamp)
 * @param {boolean} [operationData.plan_locked] - Whether plan is locked
 * @param {Array<Object>} [operationData.operation_tools] - Array of operation tool data
 * @param {number} operation_tools[].tool - Tool ID (required)
 * @param {number} [operation_tools[].quantity] - Quantity needed (default: 1)
 * @param {string} [operation_tools[].notes] - Notes
 * @param {number} [operation_tools[].display_order] - Display order (default: 1)
 * @returns {Promise<Object>} Created operation
 */
export async function createOperation(operationData) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/operations/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(operationData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to create operation: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error creating operation:', error);
        throw error;
    }
}

/**
 * Update an existing operation
 * @param {string} operationKey - The operation key (primary key)
 * @param {Object} operationData - Updated operation data (only fields to update)
 * @param {string} [operationData.name] - Operation name
 * @param {string} [operationData.description] - Operation description
 * @param {number} [operationData.order] - Operation order
 * @param {number} [operationData.machine_fk] - Machine ID
 * @param {boolean} [operationData.interchangeable] - Whether operation can be done out of order
 * @param {number} [operationData.estimated_hours] - Estimated hours
 * @param {boolean} [operationData.in_plan] - Whether operation is in planning
 * @param {number} [operationData.plan_order] - Planning order
 * @param {number} [operationData.planned_start_ms] - Planned start time (timestamp)
 * @param {number} [operationData.planned_end_ms] - Planned end time (timestamp)
 * @param {boolean} [operationData.plan_locked] - Whether plan is locked
 * @returns {Promise<Object>} Updated operation
 */
export async function updateOperation(operationKey, operationData) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/operations/${operationKey}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(operationData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to update operation: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error updating operation:', error);
        throw error;
    }
}

/**
 * Delete an operation
 * @param {string} operationKey - The operation key (primary key)
 * @returns {Promise<boolean>} Success status
 */
export async function deleteOperation(operationKey) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/operations/${operationKey}/`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to delete operation: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error deleting operation:', error);
        throw error;
    }
}

/**
 * Mark an operation as completed
 * Custom action endpoint
 * @param {string} operationKey - The operation key (primary key)
 * @returns {Promise<Object>} Updated operation with completion date
 */
export async function markOperationCompleted(operationKey) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/operations/${operationKey}/mark_completed/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to mark operation as completed: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error marking operation as completed:', error);
        throw error;
    }
}

/**
 * Unmark operation completion (admin only)
 * Custom action endpoint
 * @param {string} operationKey - The operation key (primary key)
 * @returns {Promise<Object>} Updated operation without completion date
 */
export async function unmarkOperationCompleted(operationKey) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/operations/${operationKey}/unmark_completed/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to unmark operation completion: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error unmarking operation completion:', error);
        throw error;
    }
}

/**
 * Utility function to validate operation data
 * @param {Object} operationData - Operation data to validate
 * @param {boolean} isUpdate - Whether this is an update operation (optional fields)
 * @returns {Object} Validation result with isValid and errors
 */
export function validateOperationData(operationData, isUpdate = false) {
    const errors = [];
    
    if (!isUpdate) {
        // For creation, name, part_key, order, and machine_fk are required
        if (!operationData.name || operationData.name.trim() === '') {
            errors.push('Operation name is required');
        }
        
        if (!operationData.part_key) {
            errors.push('Part key is required');
        }
        
        if (operationData.order === undefined || operationData.order === null) {
            errors.push('Operation order is required');
        }
        
        if (!operationData.machine_fk) {
            errors.push('Machine ID is required');
        }
    }
    
    // Validate optional fields if provided
    if (operationData.estimated_hours !== undefined && operationData.estimated_hours !== null && operationData.estimated_hours !== '') {
        const hours = parseFloat(operationData.estimated_hours);
        if (isNaN(hours) || hours < 0) {
            errors.push('Estimated hours must be a valid positive number');
        }
    }
    
    if (operationData.order !== undefined && operationData.order !== null) {
        const order = parseInt(operationData.order);
        if (isNaN(order) || order < 1) {
            errors.push('Order must be a valid positive integer');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Bulk save operations planning data
 * @param {Array<Object>} planningData - Array of operation planning objects
 * @param {string} planningData[].key - Operation key
 * @param {number} planningData[].machine_fk - Machine ID
 * @param {number} planningData[].planned_start_ms - Planned start time in milliseconds (timestamp)
 * @param {number} planningData[].planned_end_ms - Planned end time in milliseconds (timestamp)
 * @param {number} planningData[].plan_order - Planning order
 * @param {boolean} planningData[].in_plan - Whether operation is in plan
 * @returns {Promise<Object>} Response from the bulk save operation
 */
export async function bulkSaveOperationsPlanning(planningData) {
    try {
        if (!Array.isArray(planningData)) {
            throw new Error('planningData must be an array');
        }

        const response = await authedFetch(`${MACHINING_2_BASE_URL}/operations/planning/bulk-save/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(planningData)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to bulk save operations planning: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error bulk saving operations planning:', error);
        throw error;
    }
}

/**
 * Utility function to format operation data for display
 * @param {Object} operation - Operation object
 * @returns {Object} Formatted operation data
 */
export function formatOperationForDisplay(operation) {
    return {
        key: operation.key,
        name: operation.name,
        description: operation.description,
        partKey: operation.part_key,
        partName: operation.part_name,
        order: operation.order,
        interchangeable: operation.interchangeable,
        machineFk: operation.machine_fk,
        machineName: operation.machine_name,
        estimatedHours: operation.estimated_hours,
        totalHoursSpent: operation.total_hours_spent,
        inPlan: operation.in_plan,
        planOrder: operation.plan_order,
        plannedStartMs: operation.planned_start_ms,
        plannedEndMs: operation.planned_end_ms,
        planLocked: operation.plan_locked,
        createdBy: operation.created_by_username,
        createdAt: operation.created_at,
        completedBy: operation.completed_by_username,
        completionDate: operation.completion_date,
        operationTools: operation.operation_tools || []
    };
}

/**
 * Create manual time entry for an operation
 * @param {Object} timeData - Manual time entry data
 * @param {string} timeData.task_key - Operation key (required)
 * @param {number} timeData.machine_fk - Machine ID (required)
 * @param {number} timeData.start_time - Start timestamp in milliseconds (required)
 * @param {number} timeData.finish_time - Finish timestamp in milliseconds (required)
 * @param {string} [timeData.comment] - Optional comment
 * @returns {Promise<Object>} Response with timer ID on success
 */
export async function createManualTimeEntry(timeData) {
    try {
        const response = await authedFetch(`${backendBase}/machining/manual-time/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(timeData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error || errorData.message || response.statusText;
            throw new Error(errorMessage);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error creating manual time entry:', error);
        throw error;
    }
}
