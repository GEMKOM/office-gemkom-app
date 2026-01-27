import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

/**
 * Task Template API Service
 * Handles all task template related API requests
 * Base URL: /projects/task-templates/
 */

/**
 * List task templates with optional filters and pagination
 * @param {Object} options - Query parameters
 * @param {string} options.search - Search in name, description
 * @param {boolean} options.is_active - Filter by active status
 * @param {boolean} options.is_default - Filter by default status
 * @param {string} options.ordering - Sort by field: name, created_at, updated_at, -name for desc
 * @param {number} options.page - Page number for pagination
 * @returns {Promise<Object>} Paginated response with count, next, previous, and results
 */
export async function listTaskTemplates(options = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        if (options.search) {
            queryParams.append('search', options.search);
        }
        if (options.is_active !== undefined && options.is_active !== null) {
            queryParams.append('is_active', options.is_active.toString());
        }
        if (options.is_default !== undefined && options.is_default !== null) {
            queryParams.append('is_default', options.is_default.toString());
        }
        if (options.ordering) {
            queryParams.append('ordering', options.ordering);
        }
        if (options.page) {
            queryParams.append('page', options.page.toString());
        }

        const url = `${backendBase}/projects/task-templates/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error listing task templates:', error);
        throw error;
    }
}

/**
 * Get task template detail by ID
 * @param {number} templateId - Template ID
 * @returns {Promise<Object>} Template detail object with items
 */
export async function getTaskTemplateById(templateId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/task-templates/${templateId}/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching task template ${templateId}:`, error);
        throw error;
    }
}

/**
 * Create a new task template
 * @param {Object} templateData - Template data
 * @param {string} templateData.name - Template name (required)
 * @param {string} [templateData.description] - Description
 * @param {boolean} [templateData.is_active] - Active status (default: true)
 * @param {boolean} [templateData.is_default] - Default template flag (default: false)
 * @returns {Promise<Object>} Created template detail object
 */
export async function createTaskTemplate(templateData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/task-templates/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(templateData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating task template:', error);
        throw error;
    }
}

/**
 * Update task template (PUT - full update)
 * @param {number} templateId - Template ID
 * @param {Object} templateData - Complete template data
 * @returns {Promise<Object>} Updated template detail object
 */
export async function updateTaskTemplate(templateId, templateData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/task-templates/${templateId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(templateData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error updating task template ${templateId}:`, error);
        throw error;
    }
}

/**
 * Partially update task template (PATCH)
 * @param {number} templateId - Template ID
 * @param {Object} templateData - Partial template data
 * @returns {Promise<Object>} Updated template detail object
 */
export async function patchTaskTemplate(templateId, templateData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/task-templates/${templateId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(templateData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error patching task template ${templateId}:`, error);
        throw error;
    }
}

/**
 * Delete task template by ID
 * @param {number} templateId - Template ID
 * @returns {Promise<void>} Resolves if deletion successful
 */
export async function deleteTaskTemplate(templateId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/task-templates/${templateId}/`, {
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
        console.error(`Error deleting task template ${templateId}:`, error);
        throw error;
    }
}

/**
 * Get template items
 * @param {number} templateId - Template ID
 * @returns {Promise<Array>} Array of template items
 */
export async function getTemplateItems(templateId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/task-templates/${templateId}/items/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching template items for template ${templateId}:`, error);
        throw error;
    }
}

/**
 * Add item to template
 * @param {number} templateId - Template ID
 * @param {Object} itemData - Template item data
 * @param {string} itemData.department - Department code: design, planning, procurement, manufacturing, painting, logistics
 * @param {string} itemData.title - Task title (required)
 * @param {number} [itemData.sequence] - Sequence number
 * @param {Array<number>} [itemData.depends_on] - Array of template item IDs this item depends on
 * @returns {Promise<Object>} Created template item object
 */
export async function addTemplateItem(templateId, itemData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/task-templates/${templateId}/items/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(itemData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error adding item to template ${templateId}:`, error);
        throw error;
    }
}

/**
 * Update template item (PATCH)
 * @param {number} templateId - Template ID
 * @param {number} itemId - Template item ID
 * @param {Object} itemData - Partial template item data
 * @param {number} [itemData.weight] - Weight (1-100)
 * @param {number} [itemData.sequence] - Sequence number
 * @param {Array<number>} [itemData.depends_on] - Array of template item IDs this item depends on
 * @returns {Promise<Object>} Updated template item object
 */
export async function updateTemplateItem(templateId, itemId, itemData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/task-templates/${templateId}/items/${itemId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(itemData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error updating item ${itemId} in template ${templateId}:`, error);
        throw error;
    }
}

/**
 * Remove item from template
 * @param {number} templateId - Template ID
 * @param {number} itemId - Template item ID
 * @returns {Promise<void>} Resolves if deletion successful
 */
export async function removeTemplateItem(templateId, itemId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/task-templates/${templateId}/items/${itemId}/`, {
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
        console.error(`Error removing item ${itemId} from template ${templateId}:`, error);
        throw error;
    }
}

/**
 * Add child item to a template item
 * @param {number} templateId - Template ID
 * @param {number} itemId - Parent template item ID
 * @param {Object} childData - Child item data
 * @param {string} childData.title - Child task title (required)
 * @param {number} [childData.sequence] - Sequence number
 * @returns {Promise<Object>} Created child item object
 */
export async function addTemplateItemChild(templateId, itemId, childData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/task-templates/${templateId}/items/${itemId}/children/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(childData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error adding child item to template item ${itemId} in template ${templateId}:`, error);
        throw error;
    }
}

/**
 * Get department choices for task templates
 * @returns {Promise<Array>} Array of department options with value and label
 */
export async function getDepartmentChoices() {
    try {
        const response = await authedFetch(`${backendBase}/projects/task-templates/department_choices/`);
        
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
 * Search task templates by search term
 * @param {string} searchTerm - Search term for name, description
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with matching templates
 */
export async function searchTaskTemplates(searchTerm, additionalOptions = {}) {
    return listTaskTemplates({ ...additionalOptions, search: searchTerm });
}

/**
 * Get active task templates only
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with active templates
 */
export async function getActiveTaskTemplates(additionalOptions = {}) {
    return listTaskTemplates({ ...additionalOptions, is_active: true });
}

/**
 * Get default task template
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with default template
 */
export async function getDefaultTaskTemplate(additionalOptions = {}) {
    return listTaskTemplates({ ...additionalOptions, is_default: true });
}

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
