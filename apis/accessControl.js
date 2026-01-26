import { getUserTeam, isAdmin } from '../authService.js';

/**
 * Team-based access control configuration
 * Defines which routes/sections each team can access
 */
// Base routes that all logged-in users should have access to
const BASE_GENERAL_ROUTES = [
    '/',
    '/general',
    '/general/users',
    '/general/machines',
    '/general/overtime',
    '/general/overtime/pending',
    '/general/overtime/registry',
    '/general/overtime/users',
    '/projects',
    '/projects/project-tracking'
];

// Helper function to merge base routes with team-specific routes
const mergeWithBaseRoutes = (teamRoutes) => {
    return [...BASE_GENERAL_ROUTES, ...teamRoutes.filter(route => !BASE_GENERAL_ROUTES.includes(route))];
};

export const TEAM_ACCESS_CONFIG = {
    // Admin users have access to everything
    admin: {
        allowedRoutes: ['*'], // Wildcard means all routes
        allowedSections: ['*']
    },
    
    // Management team - has access to most sections
    management: {
        allowedRoutes: mergeWithBaseRoutes([
            '/management',
            '/management/dashboard',
            '/planning',
            '/planning/department-requests',
            '/planning/task-templates',
            '/manufacturing',
            '/manufacturing/machining',
            '/manufacturing/machining/dashboard',
            '/manufacturing/machining/capacity',
            '/manufacturing/machining/capacity/planning',
            '/manufacturing/machining/capacity/history',
            '/manufacturing/machining/tasks',
            '/manufacturing/machining/tasks/list',
            '/manufacturing/machining/tasks/create',
            '/manufacturing/machining/reports',
            '/manufacturing/machining/reports/sum-report',
            '/manufacturing/machining/reports/finished-timers',
            '/manufacturing/machining/reports/daily-report',
            '/manufacturing/maintenance',
            '/manufacturing/maintenance/fault-requests',
            '/manufacturing/maintenance/fault-requests/list',
            '/manufacturing/cnc-cutting',
            '/manufacturing/cnc-cutting/cuts',
            '/manufacturing/welding',
            '/procurement',
            '/procurement/purchase-requests',
            '/procurement/purchase-requests/create',
            '/procurement/purchase-requests/pending',
            '/procurement/purchase-requests/registry',
            '/procurement/suppliers',
            '/procurement/suppliers/list',
            '/procurement/suppliers/payment-terms',
            '/procurement/reports',
            '/procurement/reports/items',
            '/procurement/reports/staff',
            '/procurement/reports/suppliers',
            '/finance',
            '/finance/purchase-orders',
            '/finance/reports',
            '/finance/reports/executive-overview',
            '/finance/reports/projects'
        ]),
        allowedSections: ['planning', 'general', 'manufacturing', 'procurement', 'finance']
    },
    
    // Manufacturing team - access to manufacturing and related areas
    manufacturing: {
        allowedRoutes: mergeWithBaseRoutes([
            '/manufacturing',
            '/manufacturing/machining',
            '/manufacturing/machining/dashboard',
            '/manufacturing/machining/capacity',
            '/manufacturing/machining/capacity/planning',
            '/manufacturing/machining/capacity/history',
            '/manufacturing/machining/tasks',
            '/manufacturing/machining/tasks/list',
            '/manufacturing/machining/tasks/create',
            '/manufacturing/machining/reports',
            '/manufacturing/machining/reports/sum-report',
            '/manufacturing/machining/reports/finished-timers',
            '/manufacturing/machining/reports/daily-report',
            '/manufacturing/maintenance',
            '/manufacturing/maintenance/fault-requests',
            '/manufacturing/maintenance/fault-requests/list',
            '/manufacturing/cnc-cutting',
            '/manufacturing/cnc-cutting/cuts',
            '/manufacturing/welding'
        ]),
        allowedSections: ['manufacturing', 'general', 'general_overtime']
    },
    
    // Machining team - specific to machining operations
    machining: {
        allowedRoutes: mergeWithBaseRoutes([
            '/manufacturing/machining',
            '/manufacturing/machining/dashboard',
            '/manufacturing/machining/capacity',
            '/manufacturing/machining/capacity/planning',
            '/manufacturing/machining/capacity/history',
            '/manufacturing/machining/tasks',
            '/manufacturing/machining/tasks/list',
            '/manufacturing/machining/tasks/create',
            '/manufacturing/machining/reports',
            '/manufacturing/machining/reports/sum-report',
            '/manufacturing/machining/reports/finished-timers',
            '/manufacturing/machining/reports/daily-report',
            '/manufacturing/cnc-cutting',
            '/manufacturing/cnc-cutting/cuts'
        ]),
        allowedSections: ['manufacturing_machining', 'general', 'general_overtime']
    },
    
    // Maintenance team - access to maintenance and fault management
    maintenance: {
        allowedRoutes: mergeWithBaseRoutes([
            '/manufacturing/maintenance',
            '/manufacturing/maintenance/fault-requests',
            '/manufacturing/maintenance/fault-requests/list'
        ]),
        allowedSections: ['manufacturing_maintenance', 'general', 'general_overtime']
    },
    
    // Welding team - access to welding operations
    welding: {
        allowedRoutes: mergeWithBaseRoutes([
            '/manufacturing/welding'
        ]),
        allowedSections: ['manufacturing_welding', 'general', 'general_overtime']
    },
    
    // Procurement team - access to procurement and related areas
    procurement: {
        allowedRoutes: mergeWithBaseRoutes([
            '/procurement',
            '/procurement/purchase-requests',
            '/procurement/purchase-requests/create',
            '/procurement/purchase-requests/pending',
            '/procurement/purchase-requests/registry',
            '/procurement/suppliers',
            '/procurement/suppliers/list',
            '/procurement/suppliers/payment-terms',
            '/procurement/reports',
            '/procurement/reports/items',
            '/procurement/reports/staff',
            '/procurement/reports/suppliers',
            '/finance/purchase-orders'
        ]),
        allowedSections: ['procurement', 'finance_purchase_orders', 'general', 'general_overtime']
    },

    // External workshops team - access to procurement and related areas
    external_workshops: {
        allowedRoutes: mergeWithBaseRoutes([
            '/procurement',
            '/procurement/purchase-requests',
            '/procurement/purchase-requests/create',
            '/procurement/purchase-requests/pending',
            '/procurement/purchase-requests/registry',
            '/procurement/suppliers',
            '/procurement/suppliers/list',
            '/procurement/suppliers/payment-terms',
            '/procurement/reports',
            '/procurement/reports/items',
            '/procurement/reports/staff',
            '/procurement/reports/suppliers',
            '/finance/purchase-orders'
        ]),
        allowedSections: ['procurement', 'finance_purchase_orders', 'general', 'general_overtime']
    },
    
    // Planning team - access to planning and related areas
    planning: {
        allowedRoutes: mergeWithBaseRoutes([
            '/planning',
            '/planning/department-requests',
            '/planning/task-templates',
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
        ]),
        allowedSections: ['planning', 'manufacturing_planning', 'procurement', 'general', 'general_overtime']
    },
    
    // Finance team - access to financial areas
    finance: {
        allowedRoutes: mergeWithBaseRoutes([
            '/finance',
            '/finance/purchase-orders',
            '/finance/reports',
            '/finance/reports/executive-overview',
            '/finance/reports/projects',
            '/procurement/reports',
            '/procurement/reports/items',
            '/procurement/reports/staff',
            '/procurement/reports/suppliers'
        ]),
        allowedSections: ['finance', 'procurement_reports', 'general', 'general_overtime']
    },
    
    // Sales team - access to sales and customer management
    sales: {
        allowedRoutes: mergeWithBaseRoutes([
            '/sales',
            '/sales/customers'
        ]),
        allowedSections: ['sales', 'general', 'general_overtime']
    },
    
    // IT team - access to IT systems and inventory
    it: {
        allowedRoutes: mergeWithBaseRoutes([
            '/it',
            '/it/inventory'
        ]),
        allowedSections: ['it', 'general', 'general_overtime']
    },
    
    // Human Resources team - access to HR and related areas
    human_resources: {
        allowedRoutes: mergeWithBaseRoutes([
            '/human_resources',
            '/human_resources/wages'
        ]),
        allowedSections: ['human_resources', 'general', 'general_overtime']
    },
    
    // Handle misspelled team name (human_resouces instead of human_resources)
    human_resouces: {
        allowedRoutes: mergeWithBaseRoutes([
            '/human_resources',
            '/human_resources/wages'
        ]),
        allowedSections: ['human_resources', 'general', 'general_overtime']
    },
    
    // Design team - access to design and related areas
    design: {
        allowedRoutes: mergeWithBaseRoutes([
            '/design',
            '/design/projects'
        ]),
        allowedSections: ['design', 'general', 'general_overtime']
    },
    
    // Default/other teams - minimal access
    other: {
        allowedRoutes: mergeWithBaseRoutes([]),
        allowedSections: ['general', 'general_overtime']
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
