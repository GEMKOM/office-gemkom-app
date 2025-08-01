// --- admin.js ---
// Entry point for admin page - only DOM event listeners and authentication

import { initNavbar } from '../components/navbar.js';
import { guardRoute, isAdmin, navigateTo, ROUTES } from '../authService.js';
import { 
    setupAdminSidebar, 
    setupSidebarEventListeners, 
    restoreLastView, 
    showWelcomeMessage 
} from './adminLogic.js';
import './machiningDetailedReport.js';
import './finishedTimers.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication and admin status
    if (!guardRoute()) {
        return;
    }
    
    if (!isAdmin()) {
        navigateTo(ROUTES.HOME);
        return;
    }
    
    initNavbar();
    
    // Show welcome message
    showWelcomeMessage();

    // Setup sidebar
    const sidebarRoot = document.getElementById('sidebar-root');
    if (sidebarRoot) {
        setupAdminSidebar(sidebarRoot);
        setupSidebarEventListeners();
        restoreLastView();
    }
});