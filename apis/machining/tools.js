import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const MACHINING_2_BASE_URL = `${backendBase}/tasks`;

/**
 * Machining Tools API Operations
 * Handles Tool model CRUD operations
 * Based on ToolViewSet Django REST Framework ViewSet
 * Note: Write operations (create, update, delete) require admin permissions
 */

/**
 * Get all tools (list view)
 * Read-only for all authenticated users
 * @param {Object} [filters] - Optional filters and query parameters
 * @param {string} [filters.category] - Filter by category
 * @param {boolean} [filters.is_active] - Filter by active status
 * @param {string} [filters.ordering] - Ordering field (e.g., 'code', 'name', 'category')
 * @param {number} [filters.page] - Page number for pagination
 * @param {number} [filters.page_size] - Page size for pagination
 * @returns {Promise<Array|Object>} Array of tools or paginated response
 */
export async function getTools(filters = {}) {
    try {
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = queryParams.toString() 
            ? `${MACHINING_2_BASE_URL}/tools/?${queryParams.toString()}`
            : `${MACHINING_2_BASE_URL}/tools/`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to fetch tools: ${response.statusText} - ${JSON.stringify(errorData)}`);
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
        console.error('Error fetching tools:', error);
        throw error;
    }
}

/**
 * Get a single tool by ID (detail view)
 * Read-only for all authenticated users
 * @param {number} toolId - The tool ID
 * @returns {Promise<Object>} Tool data with availability information
 */
export async function getTool(toolId) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/tools/${toolId}/`);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to fetch tool: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching tool:', error);
        throw error;
    }
}

/**
 * Create a new tool
 * Admin only - requires IsAdminUser permission
 * @param {Object} toolData - Tool data
 * @param {string} toolData.code - Tool code (required, unique)
 * @param {string} toolData.name - Tool name (required)
 * @param {string} [toolData.description] - Tool description
 * @param {string} [toolData.category] - Tool category
 * @param {number} [toolData.quantity] - Total quantity (default: 1)
 * @param {boolean} [toolData.is_active] - Whether tool is active (default: true)
 * @param {Object} [toolData.properties] - Additional properties (JSON object)
 * @returns {Promise<Object>} Created tool
 */
export async function createTool(toolData) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/tools/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(toolData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to create tool: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error creating tool:', error);
        throw error;
    }
}

/**
 * Update an existing tool
 * Admin only - requires IsAdminUser permission
 * @param {number} toolId - The tool ID
 * @param {Object} toolData - Updated tool data (only fields to update)
 * @param {string} [toolData.code] - Tool code
 * @param {string} [toolData.name] - Tool name
 * @param {string} [toolData.description] - Tool description
 * @param {string} [toolData.category] - Tool category
 * @param {number} [toolData.quantity] - Total quantity
 * @param {boolean} [toolData.is_active] - Whether tool is active
 * @param {Object} [toolData.properties] - Additional properties (JSON object)
 * @returns {Promise<Object>} Updated tool
 */
export async function updateTool(toolId, toolData) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/tools/${toolId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(toolData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to update tool: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error updating tool:', error);
        throw error;
    }
}

/**
 * Delete a tool
 * Admin only - requires IsAdminUser permission
 * Note: Tools in use cannot be deleted (PROTECT constraint)
 * @param {number} toolId - The tool ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteTool(toolId) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/tools/${toolId}/`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to delete tool: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error deleting tool:', error);
        throw error;
    }
}

/**
 * Get tools by category
 * Convenience function to filter tools by category
 * @param {string} category - Tool category
 * @param {Object} [additionalFilters] - Additional filters
 * @returns {Promise<Array|Object>} Array of tools or paginated response
 */
export async function getToolsByCategory(category, additionalFilters = {}) {
    return getTools({
        category,
        ...additionalFilters
    });
}

/**
 * Get active tools only
 * Convenience function to get only active tools
 * @param {Object} [filters] - Additional filters
 * @returns {Promise<Array|Object>} Array of active tools or paginated response
 */
export async function getActiveTools(filters = {}) {
    return getTools({
        is_active: true,
        ...filters
    });
}

/**
 * Check tool availability
 * Checks if a tool is available in the required quantity
 * @param {number} toolId - The tool ID
 * @param {number} [requiredQuantity=1] - Required quantity
 * @returns {Promise<Object>} Availability information
 */
export async function checkToolAvailability(toolId, requiredQuantity = 1) {
    try {
        const tool = await getTool(toolId);
        const available = tool.available_quantity >= requiredQuantity;
        
        return {
            toolId,
            toolCode: tool.code,
            toolName: tool.name,
            totalQuantity: tool.quantity,
            inUseCount: tool.in_use_count,
            availableQuantity: tool.available_quantity,
            requiredQuantity,
            isAvailable: available
        };
    } catch (error) {
        console.error('Error checking tool availability:', error);
        throw error;
    }
}

/**
 * Utility function to validate tool data
 * @param {Object} toolData - Tool data to validate
 * @param {boolean} isUpdate - Whether this is an update operation (optional fields)
 * @returns {Object} Validation result with isValid and errors
 */
export function validateToolData(toolData, isUpdate = false) {
    const errors = [];
    
    if (!isUpdate) {
        // For creation, code and name are required
        if (!toolData.code || toolData.code.trim() === '') {
            errors.push('Tool code is required');
        }
        
        if (!toolData.name || toolData.name.trim() === '') {
            errors.push('Tool name is required');
        }
    }
    
    // Validate optional fields if provided
    if (toolData.quantity !== undefined && toolData.quantity !== null && toolData.quantity !== '') {
        const quantity = parseInt(toolData.quantity);
        if (isNaN(quantity) || quantity < 0) {
            errors.push('Quantity must be a valid positive integer');
        }
    }
    
    if (toolData.properties !== undefined && toolData.properties !== null) {
        if (typeof toolData.properties !== 'object' || Array.isArray(toolData.properties)) {
            errors.push('Properties must be a valid JSON object');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Utility function to format tool data for display
 * @param {Object} tool - Tool object
 * @returns {Object} Formatted tool data
 */
export function formatToolForDisplay(tool) {
    return {
        id: tool.id,
        code: tool.code,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        quantity: tool.quantity,
        availableQuantity: tool.available_quantity,
        inUseCount: tool.in_use_count,
        isActive: tool.is_active,
        properties: tool.properties,
        createdAt: tool.created_at,
        updatedAt: tool.updated_at
    };
}

