import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

/**
 * Department Task API Service
 * Handles all department task related API requests
 * Base URL: /projects/department-tasks/
 */

/**
 * List department tasks with optional filters and pagination
 * @param {Object} options - Query parameters
 * @param {string} options.job_order - Filter by job order number (e.g., "254-01")
 * @param {string} options.department - Filter by department: design, planning, procurement, manufacturing, painting, logistics
 * @param {string} options.department__in - Filter by multiple departments: manufacturing,painting
 * @param {string} options.status - Filter by status: pending, in_progress, blocked, completed, skipped
 * @param {string} options.status__in - Filter by multiple statuses: pending,in_progress
 * @param {number} options.assigned_to - Filter by assigned user ID
 * @param {boolean} options.assigned_to__isnull - Filter unassigned tasks (true) or assigned tasks (false)
 * @param {boolean} options.parent__isnull - Filter main tasks only (true) or subtasks (false)
 * @param {boolean} options.is_blocked - Filter blocked tasks (true)
 * @param {boolean} options.main_only - Custom filter for main tasks only (true)
 * @param {string} options.search - Search in title, description
 * @param {string} options.ordering - Sort: sequence, created_at, -created_at, target_completion_date
 * @param {number} options.page - Page number for pagination
 * @returns {Promise<Object>} Paginated response with count, next, previous, and results
 */
export async function listDepartmentTasks(options = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        if (options.job_order) {
            queryParams.append('job_order', options.job_order);
        }
        if (options.department) {
            queryParams.append('department', options.department);
        }
        if (options.department__in) {
            queryParams.append('department__in', options.department__in);
        }
        if (options.status) {
            queryParams.append('status', options.status);
        }
        if (options.status__in) {
            queryParams.append('status__in', options.status__in);
        }
        if (options.assigned_to !== undefined && options.assigned_to !== null) {
            queryParams.append('assigned_to', options.assigned_to.toString());
        }
        if (options.assigned_to__isnull !== undefined && options.assigned_to__isnull !== null) {
            queryParams.append('assigned_to__isnull', options.assigned_to__isnull.toString());
        }
        if (options.parent !== undefined && options.parent !== null) {
            queryParams.append('parent', options.parent.toString());
        }
        if (options.parent__isnull !== undefined && options.parent__isnull !== null) {
            queryParams.append('parent__isnull', options.parent__isnull.toString());
        }
        if (options.is_blocked !== undefined && options.is_blocked !== null) {
            queryParams.append('is_blocked', options.is_blocked.toString());
        }
        if (options.main_only !== undefined) {
            queryParams.append('main_only', options.main_only.toString());
        }
        if (options.search) {
            queryParams.append('search', options.search);
        }
        if (options.ordering) {
            queryParams.append('ordering', options.ordering);
        }
        if (options.page) {
            queryParams.append('page', options.page.toString());
        }
        if (options.page_size) {
            queryParams.append('page_size', options.page_size.toString());
        }

        const url = `${backendBase}/projects/department-tasks/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error listing department tasks:', error);
        throw error;
    }
}

/**
 * Get department task detail by ID
 * @param {number} taskId - Task ID
 * @returns {Promise<Object>} Task detail object with subtasks and dependencies
 */
export async function getDepartmentTaskById(taskId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/${taskId}/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching department task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Create a new department task
 * @param {Object} taskData - Task data
 * @param {string} taskData.job_order - Job order number (required, e.g., "254-01")
 * @param {string} taskData.department - Department code (required): design, planning, procurement, manufacturing, painting, logistics
 * @param {string} taskData.title - Task title (required)
 * @param {string} [taskData.description] - Description
 * @param {number} [taskData.assigned_to] - Assigned user ID
 * @param {string} [taskData.target_start_date] - Target start date (YYYY-MM-DD)
 * @param {string} [taskData.target_completion_date] - Target completion date (YYYY-MM-DD)
 * @param {number} [taskData.sequence] - Sequence number
 * @param {Array<number>} [taskData.depends_on] - Array of task IDs this task depends on
 * @param {number} [taskData.parent] - Parent task ID (for subtasks)
 * @param {string} [taskData.notes] - Notes
 * @returns {Promise<Object>} Created task detail object
 */
export async function createDepartmentTask(taskData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(taskData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating department task:', error);
        throw error;
    }
}

/**
 * Bulk create department tasks
 * @param {Object} bulkData - Bulk creation data
 * @param {string|number} bulkData.job_order - Job order number or ID (required, e.g., "254-01" or 1)
 * @param {Array<Object>} bulkData.tasks - Array of task data objects (required)
 * @param {string} bulkData.tasks[].department - Department code (required): design, planning, procurement, manufacturing, painting, logistics
 * @param {string} [bulkData.tasks[].title] - Task title
 * @param {string} [bulkData.tasks[].description] - Description
 * @param {number} [bulkData.tasks[].sequence] - Sequence number
 * @param {string} [bulkData.tasks[].target_start_date] - Target start date (YYYY-MM-DD)
 * @param {string} [bulkData.tasks[].target_completion_date] - Target completion date (YYYY-MM-DD)
 * @param {number} [bulkData.tasks[].assigned_to] - Assigned user ID
 * @param {Array<number>} [bulkData.tasks[].depends_on] - Array of task IDs this task depends on
 * @param {number} [bulkData.tasks[].parent] - Parent task ID (for subtasks)
 * @param {string} [bulkData.tasks[].notes] - Notes
 * @returns {Promise<Object>} Response with status, message, and created tasks
 */
export async function bulkCreateDepartmentTasks(bulkData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/bulk_create/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bulkData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error bulk creating department tasks:', error);
        throw error;
    }
}

/**
 * Update department task (PUT - full update)
 * @param {number} taskId - Task ID
 * @param {Object} taskData - Complete task data
 * @returns {Promise<Object>} Updated task detail object
 */
export async function updateDepartmentTask(taskId, taskData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/${taskId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(taskData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error updating department task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Partially update department task (PATCH)
 * @param {number} taskId - Task ID
 * @param {Object} taskData - Partial task data
 * @returns {Promise<Object>} Updated task detail object
 */
export async function patchDepartmentTask(taskId, taskData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/${taskId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(taskData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error patching department task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Delete department task by ID
 * @param {number} taskId - Task ID
 * @returns {Promise<void>} Resolves if deletion successful
 */
export async function deleteDepartmentTask(taskId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/${taskId}/`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            let detail = '';
            try {
                const err = await response.json();
                detail = err?.detail || '';
            } catch (_) {}
            throw new Error(detail || `HTTP error! status: ${response.status}`);
        }
        return;
    } catch (error) {
        console.error(`Error deleting department task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Start task (pending → in_progress)
 * @param {number} taskId - Task ID
 * @returns {Promise<Object>} Response with status, message, and task
 */
export async function startDepartmentTask(taskId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/${taskId}/start/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error starting department task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Complete task (in_progress → completed)
 * @param {number} taskId - Task ID
 * @returns {Promise<Object>} Response with status, message, and task
 */
export async function completeDepartmentTask(taskId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/${taskId}/complete/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error completing department task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Uncomplete task (completed → in_progress)
 * Task must be in completed status
 * Clears completed_at and completed_by
 * If subtask, parent auto-completion is reverted
 * If job order was auto-completed, it reverts to active
 * @param {number} taskId - Task ID
 * @returns {Promise<Object>} Response with status, message, and task
 */
export async function uncompleteDepartmentTask(taskId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/${taskId}/uncomplete/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error uncompleting department task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Block task (pending/in_progress → blocked)
 * @param {number} taskId - Task ID
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.reason] - Reason for blocking (required)
 * @returns {Promise<Object>} Response with status, message, and task
 */
export async function blockDepartmentTask(taskId, options = {}) {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/${taskId}/block/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(options)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error blocking department task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Unblock task (blocked → in_progress or pending)
 * @param {number} taskId - Task ID
 * @returns {Promise<Object>} Response with status, message, and task
 */
export async function unblockDepartmentTask(taskId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/${taskId}/unblock/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error unblocking department task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Skip task (any non-completed → skipped)
 * @param {number} taskId - Task ID
 * @returns {Promise<Object>} Response with status, message, and task
 */
export async function skipDepartmentTask(taskId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/${taskId}/skip/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error skipping department task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Get status choices for department tasks
 * @returns {Promise<Array>} Array of status options with value, label, and color
 */
export async function getStatusChoices() {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/status_choices/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching status choices:', error);
        throw error;
    }
}

/**
 * Get department choices for department tasks
 * @returns {Promise<Array>} Array of department options with value and label
 */
export async function getDepartmentChoices() {
    try {
        const response = await authedFetch(`${backendBase}/projects/department-tasks/department_choices/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching department choices:', error);
        throw error;
    }
}

/**
 * Helper functions for common use cases
 */

/**
 * Get tasks by job order
 * @param {string} jobOrder - Job order number (e.g., "254-01")
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with tasks for the job order
 */
export async function getTasksByJobOrder(jobOrder, additionalOptions = {}) {
    return listDepartmentTasks({ ...additionalOptions, job_order: jobOrder });
}

/**
 * Get tasks by department
 * @param {string} department - Department code: design, planning, procurement, manufacturing, painting, logistics
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with tasks for the department
 */
export async function getTasksByDepartment(department, additionalOptions = {}) {
    return listDepartmentTasks({ ...additionalOptions, department });
}

/**
 * Get tasks by multiple departments
 * @param {Array<string>} departments - Array of department codes
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with tasks for the departments
 */
export async function getTasksByDepartments(departments, additionalOptions = {}) {
    return listDepartmentTasks({ ...additionalOptions, department__in: departments.join(',') });
}

/**
 * Get tasks by status
 * @param {string} status - Status: pending, in_progress, blocked, completed, skipped
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with tasks filtered by status
 */
export async function getTasksByStatus(status, additionalOptions = {}) {
    return listDepartmentTasks({ ...additionalOptions, status });
}

/**
 * Get tasks by multiple statuses
 * @param {Array<string>} statuses - Array of statuses
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with tasks filtered by statuses
 */
export async function getTasksByStatuses(statuses, additionalOptions = {}) {
    return listDepartmentTasks({ ...additionalOptions, status__in: statuses.join(',') });
}

/**
 * Get tasks assigned to user
 * @param {number} userId - User ID
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with tasks assigned to user
 */
export async function getTasksByAssignedUser(userId, additionalOptions = {}) {
    return listDepartmentTasks({ ...additionalOptions, assigned_to: userId });
}

/**
 * Get unassigned tasks
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with unassigned tasks
 */
export async function getUnassignedTasks(additionalOptions = {}) {
    return listDepartmentTasks({ ...additionalOptions, assigned_to__isnull: true });
}

/**
 * Get main tasks only (no subtasks)
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with main tasks
 */
export async function getMainTasks(additionalOptions = {}) {
    return listDepartmentTasks({ ...additionalOptions, main_only: true });
}

/**
 * Get blocked tasks
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with blocked tasks
 */
export async function getBlockedTasks(additionalOptions = {}) {
    return listDepartmentTasks({ ...additionalOptions, is_blocked: true });
}

/**
 * Search tasks by search term
 * @param {string} searchTerm - Search term for title, description
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with matching tasks
 */
export async function searchDepartmentTasks(searchTerm, additionalOptions = {}) {
    return listDepartmentTasks({ ...additionalOptions, search: searchTerm });
}

/**
 * Status options (static fallback if API is unavailable)
 */
export const STATUS_OPTIONS = [
    { value: 'pending', label: 'Bekliyor', color: 'yellow' },
    { value: 'in_progress', label: 'Devam Ediyor', color: 'blue' },
    { value: 'blocked', label: 'Engellendi', color: 'red' },
    { value: 'completed', label: 'Tamamlandı', color: 'green' },
    { value: 'skipped', label: 'Atlandı', color: 'grey' },
];

/**
 * Department options (static fallback if API is unavailable)
 */
export const DEPARTMENT_OPTIONS = [
    { value: 'design', label: 'Tasarım' },
    { value: 'planning', label: 'Planlama' },
    { value: 'procurement', label: 'Satın Alma' },
    { value: 'manufacturing', label: 'Üretim' },
    { value: 'painting', label: 'Boya' },
    { value: 'logistics', label: 'Lojistik' },
];
