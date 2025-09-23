import { getUserTeam, isAdmin } from '../authService.js';

/**
 * Team-based access control configuration
 * Defines which routes/sections each team can access
 */
export const TEAM_ACCESS_CONFIG = {
    // Admin users have access to everything
    admin: {
        allowedRoutes: ['*'], // Wildcard means all routes
        allowedSections: ['*']
    },
    
    // Management team - has access to most sections
    management: {
        allowedRoutes: [
            '/',
            '/general',
            '/general/users',
            '/general/machines', 
            '/general/overtime',
            '/general/overtime/pending',
            '/general/overtime/registry',
            '/general/overtime/users',
            '/manufacturing',
            '/manufacturing/machining',
            '/manufacturing/machining/dashboard',
            '/manufacturing/machining/capacity',
            '/manufacturing/machining/capacity/planning',
            '/manufacturing/machining/capacity/history',
            '/manufacturing/machining/tasks',
            '/manufacturing/machining/reports',
            '/manufacturing/machining/reports/sum-report',
            '/manufacturing/machining/reports/finished-timers',
            '/manufacturing/maintenance',
            '/manufacturing/maintenance/fault-requests',
            '/manufacturing/maintenance/fault-requests/create',
            '/manufacturing/maintenance/fault-requests/list',
            '/manufacturing/welding',
            '/procurement',
            '/procurement/purchase-requests',
            '/procurement/purchase-requests/create',
            '/procurement/purchase-requests/pending',
            '/procurement/purchase-requests/registry',
            '/procurement/suppliers',
            '/procurement/suppliers/list',
            '/procurement/suppliers/payment-terms',
            '/procurement/items',
            '/procurement/reports',
            '/procurement/reports/items',
            '/procurement/reports/staff',
            '/procurement/reports/suppliers',
            '/finance',
            '/finance/purchase-orders',
            '/finance/reports',
            '/finance/reports/executive-overview',
            '/finance/reports/projects'
        ],
        allowedSections: ['general', 'manufacturing', 'procurement', 'finance']
    },
    
    // Manufacturing team - access to manufacturing and related areas
    manufacturing: {
        allowedRoutes: [
            '/',
            '/manufacturing',
            '/manufacturing/machining',
            '/manufacturing/machining/dashboard',
            '/manufacturing/machining/capacity',
            '/manufacturing/machining/capacity/planning',
            '/manufacturing/machining/capacity/history',
            '/manufacturing/machining/tasks',
            '/manufacturing/machining/reports',
            '/manufacturing/machining/reports/sum-report',
            '/manufacturing/machining/reports/finished-timers',
            '/manufacturing/maintenance',
            '/manufacturing/maintenance/fault-requests',
            '/manufacturing/maintenance/fault-requests/create',
            '/manufacturing/maintenance/fault-requests/list',
            '/manufacturing/welding',
            '/general/overtime',
            '/general/overtime/pending',
            '/general/overtime/registry',
            '/general/overtime/users'
        ],
        allowedSections: ['manufacturing', 'general_overtime']
    },
    
    // Machining team - specific to machining operations
    machining: {
        allowedRoutes: [
            '/',
            '/manufacturing/machining',
            '/manufacturing/machining/dashboard',
            '/manufacturing/machining/capacity',
            '/manufacturing/machining/capacity/planning',
            '/manufacturing/machining/capacity/history',
            '/manufacturing/machining/tasks',
            '/manufacturing/machining/reports',
            '/manufacturing/machining/reports/sum-report',
            '/manufacturing/machining/reports/finished-timers',
            '/general/overtime',
            '/general/overtime/pending',
            '/general/overtime/registry'
        ],
        allowedSections: ['manufacturing_machining', 'general_overtime']
    },
    
    // Maintenance team - access to maintenance and fault management
    maintenance: {
        allowedRoutes: [
            '/',
            '/manufacturing/maintenance',
            '/manufacturing/maintenance/fault-requests',
            '/manufacturing/maintenance/fault-requests/create',
            '/manufacturing/maintenance/fault-requests/list',
            '/general/overtime',
            '/general/overtime/pending',
            '/general/overtime/registry'
        ],
        allowedSections: ['manufacturing_maintenance', 'general_overtime']
    },
    
    // Welding team - access to welding operations
    welding: {
        allowedRoutes: [
            '/',
            '/manufacturing/welding',
            '/general/overtime',
            '/general/overtime/pending',
            '/general/overtime/registry'
        ],
        allowedSections: ['manufacturing_welding', 'general_overtime']
    },
    
    // Procurement team - access to procurement and related areas
    procurement: {
        allowedRoutes: [
            '/',
            '/procurement',
            '/procurement/purchase-requests',
            '/procurement/purchase-requests/create',
            '/procurement/purchase-requests/pending',
            '/procurement/purchase-requests/registry',
            '/procurement/suppliers',
            '/procurement/suppliers/list',
            '/procurement/suppliers/payment-terms',
            '/procurement/items',
            '/procurement/reports',
            '/procurement/reports/items',
            '/procurement/reports/staff',
            '/procurement/reports/suppliers',
            '/finance/purchase-orders',
            '/general/overtime',
            '/general/overtime/pending',
            '/general/overtime/registry'
        ],
        allowedSections: ['procurement', 'finance_purchase_orders', 'general_overtime']
    },
    
    // Planning team - access to planning and related areas
    planning: {
        allowedRoutes: [
            '/',
            '/general',
            '/general/overtime',
            '/general/overtime/pending',
            '/general/overtime/registry',
            '/manufacturing',
            '/manufacturing/machining',
            '/manufacturing/machining/capacity',
            '/manufacturing/machining/capacity/planning',
            '/manufacturing/machining/capacity/history',
            '/procurement',
            '/procurement/purchase-requests',
            '/procurement/purchase-requests/create',
            '/procurement/purchase-requests/pending',
            '/procurement/purchase-requests/registry'
        ],
        allowedSections: ['manufacturing_planning', 'procurement', 'general_overtime']
    },
    
    // Finance team - access to financial areas
    finance: {
        allowedRoutes: [
            '/',
            '/finance',
            '/finance/purchase-orders',
            '/finance/reports',
            '/finance/reports/executive-overview',
            '/finance/reports/projects',
            '/procurement/reports',
            '/procurement/reports/items',
            '/procurement/reports/staff',
            '/procurement/reports/suppliers',
            '/general/overtime',
            '/general/overtime/pending',
            '/general/overtime/registry'
        ],
        allowedSections: ['finance', 'procurement_reports', 'general_overtime']
    },
    
    // IT team - access to IT systems and inventory
    it: {
        allowedRoutes: [
            '/',
            '/it',
            '/it/inventory',
            '/general/overtime',
            '/general/overtime/pending',
            '/general/overtime/registry'
        ],
        allowedSections: ['it', 'general_overtime']
    },
    
    // Default/other teams - minimal access
    other: {
        allowedRoutes: [
            '/',
            '/general/overtime',
            '/general/overtime/pending',
            '/general/overtime/registry'
        ],
        allowedSections: ['general_overtime']
    }
};

/**
 * Check if a user has access to a specific route
 * @param {string} route - The route to check
 * @param {string} userTeam - The user's team
 * @returns {boolean} - Whether the user has access
 */
export function hasRouteAccess(route, userTeam = null) {
    try {
        // Get user team if not provided
        if (!userTeam) {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            userTeam = user.team || 'other';
        }
        
        // Admin users have access to everything
        if (isAdmin() || userTeam === null) {
            return true;
        }
        
        // Get team configuration
        const teamConfig = TEAM_ACCESS_CONFIG[userTeam] || TEAM_ACCESS_CONFIG.other;
        
        // Check if route is explicitly allowed
        if (teamConfig.allowedRoutes.includes('*')) {
            return true; // Wildcard access
        }
        
        // Check exact route match
        if (teamConfig.allowedRoutes.includes(route)) {
            return true;
        }
        
        // Check if route starts with any allowed route (for sub-routes)
        return teamConfig.allowedRoutes.some(allowedRoute => 
            route.startsWith(allowedRoute + '/') || route.startsWith(allowedRoute + '?')
        );
        
    } catch (error) {
        console.error('Error checking route access:', error);
        return false; // Default to no access on error
    }
}

/**
 * Check if a user has access to a specific section
 * @param {string} section - The section to check
 * @param {string} userTeam - The user's team
 * @returns {boolean} - Whether the user has access
 */
export function hasSectionAccess(section, userTeam = null) {
    try {
        // Get user team if not provided
        if (!userTeam) {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            userTeam = user.team || 'other';
        }
        
        // Admin users have access to everything
        if (isAdmin() || userTeam === null) {
            return true;
        }
        
        // Get team configuration
        const teamConfig = TEAM_ACCESS_CONFIG[userTeam] || TEAM_ACCESS_CONFIG.other;
        
        // Check if section is explicitly allowed
        if (teamConfig.allowedSections.includes('*')) {
            return true; // Wildcard access
        }
        
        return teamConfig.allowedSections.includes(section);
        
    } catch (error) {
        console.error('Error checking section access:', error);
        return false; // Default to no access on error
    }
}

/**
 * Filter navigation items based on user team access
 * @param {Object} navigationStructure - The navigation structure to filter
 * @param {string} userTeam - The user's team
 * @returns {Object} - Filtered navigation structure
 */
export function filterNavigationByAccess(navigationStructure, userTeam = null) {
    try {
        // Get user team if not provided
        if (!userTeam) {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            userTeam = user.team || 'other';
        }
        
        // Admin users see everything
        if (isAdmin() || userTeam === null) {
            return navigationStructure;
        }
        
        const filteredStructure = {};
        
        for (const [path, item] of Object.entries(navigationStructure)) {
            // Check if user has access to this route
            if (hasRouteAccess(path, userTeam)) {
                // Recursively filter children
                const filteredChildren = filterNavigationByAccess(item.children, userTeam);
                
                // Only include this item if it has children or if user has access to the route itself
                if (Object.keys(filteredChildren).length > 0 || hasRouteAccess(path, userTeam)) {
                    filteredStructure[path] = {
                        ...item,
                        children: filteredChildren
                    };
                }
            }
        }
        
        return filteredStructure;
        
    } catch (error) {
        console.error('Error filtering navigation:', error);
        return {}; // Return empty structure on error
    }
}

/**
 * Get user's accessible routes for debugging/logging
 * @param {string} userTeam - The user's team
 * @returns {Array} - Array of accessible routes
 */
export function getAccessibleRoutes(userTeam = null) {
    try {
        if (!userTeam) {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            userTeam = user.team || 'other';
        }
        
        if (isAdmin() || userTeam === null) {
            return ['*']; // All routes
        }
        
        const teamConfig = TEAM_ACCESS_CONFIG[userTeam] || TEAM_ACCESS_CONFIG.other;
        return teamConfig.allowedRoutes;
        
    } catch (error) {
        console.error('Error getting accessible routes:', error);
        return [];
    }
}
