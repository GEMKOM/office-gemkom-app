import { hasRouteAccess } from './accessControl.js';
import { isLoggedIn, navigateTo, ROUTES, isAdmin, hasPerm } from '../authService.js';

/**
 * Route protection middleware
 * Protects pages from unauthorized access based on permissions
 */

/**
 * Check if current user has access to the current route
 * @param {string} route - Optional route to check, defaults to current pathname
 * @returns {boolean} - Whether user has access
 */
export function checkRouteAccess(route = null) {
    const currentRoute = route || window.location.pathname;
    
    // Allow home page and login page without authentication
    if (currentRoute === '/' || currentRoute === '/login') {
        return true;
    }
    
    // Check if user is logged in
    if (!isLoggedIn()) {
        return false;
    }
    
    // Check permission-based access
    return hasRouteAccess(currentRoute);
}

/**
 * Protect a route - redirect if user doesn't have access
 * @param {string} route - Optional route to check, defaults to current pathname
 * @param {string} redirectRoute - Route to redirect to if access denied
 * @returns {boolean} - Whether user has access (true) or was redirected (false)
 */
export function protectRoute(route = null, redirectRoute = null) {
    const currentRoute = route || window.location.pathname;
    
    // Allow home page and login page without authentication
    if (currentRoute === '/' || currentRoute === '/login') {
        return true;
    }
    
    // Check if user is logged in
    if (!isLoggedIn()) {
        const redirect = redirectRoute || ROUTES.LOGIN;
        navigateTo(redirect);
        return false;
    }
    
    // Check permission-based access
    if (!hasRouteAccess(currentRoute)) {
        // Show access denied message
        showAccessDeniedMessage(currentRoute);
        
        // Redirect to an appropriate page based on permissions
        const redirect = redirectRoute || getDefaultRedirectForUser();
        navigateTo(redirect);
        return false;
    }
    
    return true;
}

/**
 * Show access denied message to user
 * @param {string} route - The route that was denied
 */
function showAccessDeniedMessage(route) {
    const routeName = getRouteDisplayName(route);
    alert(`Bu sayfaya erişim yetkiniz bulunmamaktadır: ${routeName}`);
}

/**
 * Get display name for a route
 * @param {string} route - The route path
 * @returns {string} - Display name for the route
 */
function getRouteDisplayName(route) {
    const routeNames = {
        '/general/machines': 'Makineler',
        '/general/overtime': 'Mesailer',
        '/manufacturing/machining': 'İmalat - Torna',
        '/manufacturing/maintenance': 'İmalat - Bakım',
        '/manufacturing/welding': 'İmalat - Kaynak',
        '/procurement': 'Tedarik',
        '/finance': 'Finans'
    };
    
    // Check for exact match first
    if (routeNames[route]) {
        return routeNames[route];
    }
    
    // Check for partial matches
    for (const [path, name] of Object.entries(routeNames)) {
        if (route.startsWith(path)) {
            return name;
        }
    }
    
    // Default to route path
    return route;
}

/**
 * Get default redirect route for current user based on their team
 * @returns {string} - Default redirect route
 */
function getDefaultRedirectForUser() {
    try {
        if (isAdmin()) return ROUTES.HOME;

        // Pick the first route the user can actually access.
        const candidates = [
            '/management/dashboard',
            '/manufacturing/machining/dashboard',
            '/manufacturing/cnc-cutting/dashboard',
            '/manufacturing/maintenance/fault-requests',
            '/manufacturing/welding',
            '/procurement/purchase-requests',
            '/planning/projects',
            '/finance/purchase-orders',
            '/it/inventory',
            '/quality-control',
            '/general',
            '/projects',
            ROUTES.HOME
        ];

        for (const path of candidates) {
            if (hasRouteAccess(path)) return path;
        }

        // If permissions are missing for some reason, fall back to home.
        if (hasPerm('access_general')) return '/general';
        return ROUTES.HOME;
    } catch (error) {
        console.error('Error getting default redirect:', error);
        return ROUTES.HOME;
    }
}

/**
 * Initialize route protection for the current page
 * Call this function at the start of each page's JavaScript
 * @param {string} expectedRoute - Optional expected route, defaults to current pathname
 */
export function initRouteProtection(expectedRoute = null) {
    const route = expectedRoute || window.location.pathname;
    
    // Skip protection for home and login pages
    if (route === '/' || route === '/login') {
        return true;
    }
    
    // Protect the route
    if (!protectRoute(route)) {
        // User was redirected, stop execution
        return false;
    }
    
    return true;
}

/**
 * Create a route protection wrapper for page initialization functions
 * @param {Function} pageInitFunction - The page initialization function to wrap
 * @param {string} expectedRoute - Optional expected route
 * @returns {Function} - Wrapped function with route protection
 */
export function withRouteProtection(pageInitFunction, expectedRoute = null) {
    return function() {
        // Check route access first
        if (!initRouteProtection(expectedRoute)) {
            return; // Stop execution if access denied
        }
        
        // Call the original function
        return pageInitFunction.apply(this, arguments);
    };
}

/**
 * Check if user can access a specific feature/action
 * @param {string} feature - The feature to check (e.g., 'create_user', 'view_finance')
 * @returns {boolean} - Whether user has access to the feature
 */
export function canAccessFeature(feature) {
    try {
        if (isAdmin()) return true;

        // New behavior: treat feature as a permission codename, or as a suffix for access_*
        // Examples:
        // - canAccessFeature('access_it_permissions')
        // - canAccessFeature('it_permissions') -> checks access_it_permissions
        if (!feature) return false;
        if (feature.startsWith('access_')) return hasPerm(feature);
        return hasPerm(`access_${feature}`);
        
    } catch (error) {
        console.error('Error checking feature access:', error);
        return false;
    }
}
