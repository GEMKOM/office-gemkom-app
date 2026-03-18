import { hasPerm, isAdmin, getPermissions, getGrantedPageRoutes } from '../authService.js';

/**
 * Permission-based access control
 *
 * Convention:
 * - Route `/manufacturing/cnc-cutting/dashboard` -> permission `access_manufacturing_cnc_cutting_dashboard`
 * - Dashes in path segments are converted to underscores.
 */

const ALWAYS_ALLOWED_ROUTES = new Set(['/', '/login', '/login/']);

function normalizePath(path) {
    if (!path) return '/';
    const noQuery = String(path).split('?')[0].split('#')[0];
    if (noQuery.length > 1 && noQuery.endsWith('/')) return noQuery.slice(0, -1);
    return noQuery || '/';
}

function routeIsAllowedByGrantedPages(route) {
    const normalized = normalizePath(route);
    if (ALWAYS_ALLOWED_ROUTES.has(normalized)) return true;

    const allowed = getGrantedPageRoutes();
    for (const base of allowed) {
        if (!base) continue;
        if (normalized === base) return true;
    }
    return false;
}

function sectionToPermissionCandidates(section) {
    if (!section) return [];
    const normalized = String(section).trim().replace(/-/g, '_');
    const base = `access_${normalized}`;

    // Sections may map to exact permission or any deeper permission under that prefix.
    // Example: section "procurement_reports" should allow "access_procurement_reports_*".
    return [base];
}

/**
 * Check if current user has access to a route using permissions.
 */
export function hasRouteAccess(route) {
    try {
        const normalized = normalizePath(route);

        // Always allow public routes
        if (ALWAYS_ALLOWED_ROUTES.has(normalized)) {
            return true;
        }

        // Admin users have access to everything
        if (isAdmin()) return true;
        // New permission payload includes "name": "Page: /some/route/"
        // Use that mapping (and allow subroutes under granted base routes).
        if (routeIsAllowedByGrantedPages(normalized)) return true;

        // Backward compatibility: fall back to codename-based checks
        // for environments that still return boolean permissions.
        const segments = normalized
            .split('/')
            .filter(Boolean)
            .map(s => s.replace(/-/g, '_'));
        if (!segments.length) return false;
        return hasPerm(`access_${segments.join('_')}`);
        
    } catch (error) {
        console.error('Error checking route access:', error);
        return false; // Default to no access on error
    }
}

/**
 * Check if current user has access to a navigation section using permissions.
 */
export function hasSectionAccess(section) {
    try {
        if (isAdmin()) return true;

        // New behavior: infer section visibility from granted "Page:" routes.
        // Example: section "quality-control" should show if user has any granted page under "/quality-control".
        const s = String(section || '').trim();
        if (!s) return false;

        const routePrefix = '/' + s.replace(/_/g, '-');
        const normalizedPrefix = normalizePath(routePrefix);

        const allowed = getGrantedPageRoutes();
        for (const r of allowed) {
            if (!r) continue;
            if (r === normalizedPrefix) return true;
            if (r.startsWith(normalizedPrefix + '/')) return true;
        }

        // Backward compatibility: old codename-based section checks
        const [base] = sectionToPermissionCandidates(section);
        if (!base) return false;
        if (hasPerm(base)) return true;
        const perms = getPermissions();
        return Object.keys(perms || {}).some(code => code === base || code.startsWith(base + '_'));
        
    } catch (error) {
        console.error('Error checking section access:', error);
        return false; // Default to no access on error
    }
}

/**
 * Filter navigation items based on permission access
 * @param {Object} navigationStructure - The navigation structure to filter
 * @returns {Object} - Filtered navigation structure
 */
export function filterNavigationByAccess(navigationStructure) {
    try {
        // Admin users see everything
        if (isAdmin()) {
            return navigationStructure;
        }
        
        const filteredStructure = {};
        
        for (const [path, item] of Object.entries(navigationStructure)) {
            // Check if user has access to this route
            if (hasRouteAccess(path)) {
                // Recursively filter children
                const filteredChildren = filterNavigationByAccess(item.children);
                
                // Only include this item if it has children or if user has access to the route itself
                if (Object.keys(filteredChildren).length > 0 || hasRouteAccess(path)) {
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
 * Get user's accessible permission codenames for debugging/logging
 * @returns {Array<string>} - Array of permission codenames that are true
 */
export function getAccessibleRoutes() {
    try {
        if (isAdmin()) return ['*'];
        const perms = getPermissions();
        return Object.entries(perms || {})
            .filter(([, v]) => v === true)
            .map(([k]) => k);
        
    } catch (error) {
        console.error('Error getting accessible routes:', error);
        return [];
    }
}
