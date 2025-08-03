// Machining Module JavaScript

// Import navbar functionality
import { initNavbar } from '../../components/navbar.js';

// Navigation function for different sections
function navigateTo(section) {
    switch(section) {
        case 'dashboard':
            // Navigate to dashboard
            console.log('Navigating to dashboard...');
            window.location.href = '/manufacturing/machining/dashboard/';
            break;
        case 'tasks':
            // Navigate to tasks
            console.log('Navigating to tasks...');
            window.location.href = '/manufacturing/machining/tasks/';
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

// Show notification function with enhanced styling
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.custom-notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `custom-notification alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = `
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 350px;
        backdrop-filter: blur(15px);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 15px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        animation: slideInRight 0.5s ease-out;
    `;
    
    const iconClass = type === 'error' ? 'exclamation-triangle' : 
                     type === 'success' ? 'check-circle' : 
                     type === 'warning' ? 'exclamation-circle' : 'info-circle';
    
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-${iconClass} me-3" style="font-size: 1.2rem;"></i>
            <div class="flex-grow-1">
                <strong>${type === 'error' ? 'Hata' : type === 'success' ? 'Başarılı' : type === 'warning' ? 'Uyarı' : 'Bilgi'}</strong>
                <br>
                <span>${message}</span>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.5s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 500);
        }
    }, 5000);
}

// Initialize machining module with enhanced features
function initMachiningModule() {
    console.log('Machining module initialized');
    
    // Initialize navbar
    initNavbar();
    
    // Add enhanced click event listeners to functionality cards
    const cards = document.querySelectorAll('.functionality-card');
    cards.forEach((card, index) => {
        // Add entrance animation delay
        card.style.animationDelay = `${0.1 + index * 0.1}s`;
        
        card.addEventListener('click', function(e) {
            // Prevent default if it's a link
            if (e.target.tagName === 'A') return;
            
            // Add enhanced click animation
            this.style.transform = 'scale(0.95)';
            this.style.filter = 'brightness(0.9)';
            
            setTimeout(() => {
                this.style.transform = '';
                this.style.filter = '';
            }, 200);
            
            // Get the section from onclick attribute
            const onclick = this.getAttribute('onclick');
            if (onclick) {
                const match = onclick.match(/navigateTo\('([^']+)'\)/);
                if (match) {
                    navigateTo(match[1]);
                }
            }
        });
        
        // Enhanced hover effects
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-8px) scale(1.02)';
            this.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.25)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = '';
            this.style.boxShadow = '';
        });
        
        // Add ripple effect on click
        card.addEventListener('mousedown', function(e) {
            const ripple = document.createElement('div');
            ripple.className = 'ripple';
            ripple.style.cssText = `
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                transform: scale(0);
                animation: ripple-animation 0.6s linear;
                pointer-events: none;
                left: ${e.offsetX}px;
                top: ${e.offsetY}px;
                width: 100px;
                height: 100px;
                margin-left: -50px;
                margin-top: -50px;
            `;
            
            this.appendChild(ripple);
            
            setTimeout(() => {
                if (ripple.parentNode) {
                    ripple.remove();
                }
            }, 600);
        });
    });
    
    // Add feature list hover effects
    const featureItems = document.querySelectorAll('.feature-list li');
    featureItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateX(8px)';
            this.style.background = 'rgba(255, 255, 255, 0.15)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = '';
            this.style.background = '';
        });
    });
    
    // Add status badge interactions
    const statusBadges = document.querySelectorAll('.status-badge');
    statusBadges.forEach(badge => {
        badge.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.1)';
        });
        
        badge.addEventListener('mouseleave', function() {
            this.style.transform = '';
        });
    });
    
    // Add section title animation on scroll
    const sectionTitle = document.querySelector('.section-title');
    if (sectionTitle) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.animation = 'slideInDown 1s ease-out';
                }
            });
        });
        observer.observe(sectionTitle);
    }
    
    // Add floating elements animation
    const floatingElements = document.querySelectorAll('.floating-element');
    floatingElements.forEach((element, index) => {
        element.style.animationDelay = `${index * 2}s`;
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

// Add CSS animations
function addCustomStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                opacity: 0;
                transform: translateX(100%);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
        
        @keyframes slideOutRight {
            from {
                opacity: 1;
                transform: translateX(0);
            }
            to {
                opacity: 0;
                transform: translateX(100%);
            }
        }
        
        @keyframes ripple-animation {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
        
        .custom-notification {
            transition: all 0.3s ease;
        }
        
        .custom-notification:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
        }
    `;
    document.head.appendChild(style);
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
    addCustomStyles();
    initMachiningModule();
});

// Make functions globally available
window.navigateTo = navigateTo;
window.showNotification = showNotification;