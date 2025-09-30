import { hasRouteAccess } from './accessControl.js';
import { isLoggedIn, navigateTo, ROUTES, isAdmin } from '../authService.js';

/**
 * Route protection middleware
 * Protects pages from unauthorized access based on user team
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
    
    // Check team-based access
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
    console.log(`Route protection: Checking access to ${currentRoute}`);
    
    // Allow home page and login page without authentication
    if (currentRoute === '/' || currentRoute === '/login') {
        console.log('Route protection: Allowing home/login page');
        return true;
    }
    
    // Check if user is logged in
    if (!isLoggedIn()) {
        console.log('Route protection: User not logged in, redirecting to login');
        const redirect = redirectRoute || ROUTES.LOGIN;
        navigateTo(redirect);
        return false;
    }
    
    // Check team-based access
    const hasAccess = hasRouteAccess(currentRoute);
    console.log(`Route protection: Has access to ${currentRoute}: ${hasAccess}`);
    
    if (!hasAccess) {
        console.log(`Route protection: Access denied to ${currentRoute}, redirecting...`);
        // Show access denied message
        showAccessDeniedMessage(currentRoute);
        
        // Redirect to appropriate page based on user team
        const redirect = redirectRoute || getDefaultRedirectForUser();
        navigateTo(redirect);
        return false;
    }
    
    console.log(`Route protection: Access granted to ${currentRoute}`);
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
        '/general/users': 'Çalışanlar',
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
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userTeam = user.team || 'other';
        
        // Admin users go to home
        if (isAdmin() || userTeam === null) {
            return ROUTES.HOME;
        }
        
        // Team-specific redirects
        switch (userTeam) {
            case 'machining':
                return '/manufacturing/machining/dashboard';
            case 'maintenance':
                return '/manufacturing/maintenance/fault-requests';
            case 'welding':
                return '/manufacturing/welding';
            case 'manufacturing':
                return '/manufacturing/machining/dashboard';
            case 'procurement':
                return '/procurement/purchase-requests';
            case 'planning':
                return '/manufacturing/machining/capacity/planning';
            case 'finance':
                return '/finance/purchase-orders';
            default:
                return ROUTES.HOME;
        }
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
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userTeam = user.team || 'other';
        
        // Admin users can access everything
        if (isAdmin() || userTeam === null) {
            return true;
        }
        
        // Feature-based access control
        const featureAccess = {
            'create_user': ['management', 'admin'],
            'edit_user': ['management', 'admin'],
            'delete_user': ['management', 'admin'],
            'view_finance': ['management', 'finance', 'admin'],
            'edit_finance': ['management', 'finance', 'admin'],
            'view_procurement': ['management', 'procurement', 'planning', 'admin'],
            'edit_procurement': ['management', 'procurement', 'planning', 'admin'],
            'view_manufacturing': ['management', 'manufacturing', 'machining', 'maintenance', 'welding', 'admin'],
            'edit_manufacturing': ['management', 'manufacturing', 'machining', 'maintenance', 'welding', 'admin'],
            'view_overtime': ['management', 'manufacturing', 'machining', 'maintenance', 'welding', 'procurement', 'planning', 'finance', 'admin'],
            'edit_overtime': ['management', 'manufacturing', 'machining', 'maintenance', 'welding', 'procurement', 'planning', 'finance', 'admin']
        };
        
        const allowedTeams = featureAccess[feature] || [];
        return allowedTeams.includes(userTeam);
        
    } catch (error) {
        console.error('Error checking feature access:', error);
        return false;
    }
}
