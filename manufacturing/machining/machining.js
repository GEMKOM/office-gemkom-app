// Machining Module JavaScript

// Import navbar functionality
import { initNavbar } from '../../components/navbar.js';

// Navigation function for different sections
function navigateTo(section) {
    switch(section) {
        case 'dashboard':
            // Navigate to dashboard
            console.log('Navigating to dashboard...');
            // TODO: Implement dashboard navigation
            showNotification('Dashboard özelliği yakında eklenecek!', 'info');
            break;
        case 'tasks':
            // Navigate to tasks
            console.log('Navigating to tasks...');
            // TODO: Implement tasks navigation
            showNotification('Görevler özelliği yakında eklenecek!', 'info');
            break;
        case 'reports':
            // Navigate to reports
            console.log('Navigating to reports...');
            // TODO: Implement reports navigation
            showNotification('Raporlar özelliği yakında eklenecek!', 'info');
            break;
        case 'capacity':
            // Navigate to capacity view
            console.log('Navigating to capacity view...');
            // TODO: Implement capacity view navigation
            showNotification('Kapasite görünümü özelliği yakında eklenecek!', 'info');
            break;
        default:
            console.log('Unknown section:', section);
            showNotification('Bilinmeyen bölüm!', 'error');
    }
}

// Show notification function
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = `
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 300px;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    notification.innerHTML = `
        <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : 'info-circle'} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// Initialize machining module
function initMachiningModule() {
    console.log('Machining module initialized');
    
    // Initialize navbar
    initNavbar();
    
    // Add click event listeners to functionality cards
    const cards = document.querySelectorAll('.functionality-card');
    cards.forEach(card => {
        card.addEventListener('click', function() {
            // Add click animation
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });
    
    // Add hover effects for better UX
    cards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = '';
        });
    });
}

// Module status tracking
const moduleStatus = {
    dashboard: 'ready',
    tasks: 'development',
    reports: 'coming-soon',
    capacity: 'coming-soon'
};

// Get module status
function getModuleStatus(section) {
    return moduleStatus[section] || 'unknown';
}

// Check if module is available
function isModuleAvailable(section) {
    return moduleStatus[section] === 'ready';
}

// Export functions for use in other modules
export {
    navigateTo,
    showNotification,
    initMachiningModule,
    getModuleStatus,
    isModuleAvailable
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initMachiningModule();
});

// Make functions globally available
window.navigateTo = navigateTo;
window.showNotification = showNotification;