// Maintenance Module JavaScript

// Import navbar functionality
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';

// Navigation function for different sections
function navigateTo(section) {
    switch(section) {
        case 'plans':
            // Navigate to maintenance plans
            console.log('Navigating to maintenance plans...');
            window.location.href = '/manufacturing/maintenance/plans/';
            break;
        case 'issues':
            // Navigate to issues tracking
            console.log('Navigating to issues tracking...');
            window.location.href = '/manufacturing/maintenance/issues/';
            break;
        case 'preventive':
            // Navigate to preventive maintenance
            console.log('Navigating to preventive maintenance...');
            window.location.href = '/manufacturing/maintenance/preventive/';
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

// Initialize maintenance module with enhanced features
function initMaintenanceModule() {
    console.log('Maintenance module initialized');
    
    // Initialize navbar
    initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Bakım',
        subtitle: 'Ekipman bakım planları, arıza takibi ve önleyici bakım yönetimi',
        cards: [
            {
                title: 'Bakım Planı',
                description: 'Planlı bakım işlemlerini yönetin, takvim görünümü ile bakım programlarını organize edin.',
                icon: 'fas fa-calendar-check',
                iconColor: 'primary',
                link: '/manufacturing/maintenance/plans',
                features: [
                    {
                        label: 'Bakım takvimi',
                        icon: 'fas fa-calendar-alt',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/plans/calendar'
                    },
                    {
                        label: 'Bakım programları',
                        icon: 'fas fa-tasks',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/plans/programs'
                    },
                    {
                        label: 'Bakım geçmişi',
                        icon: 'fas fa-history',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/plans/history'
                    }
                ]
            },
            {
                title: 'Arıza Takibi',
                description: 'Arıza bildirimlerini takip edin, önceliklendirin ve çözüm süreçlerini yönetin.',
                icon: 'fas fa-exclamation-triangle',
                iconColor: 'danger',
                link: '/manufacturing/maintenance/issues',
                features: [
                    {
                        label: 'Arıza bildirimleri',
                        icon: 'fas fa-bell',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/issues/notifications'
                    },
                    {
                        label: 'Arıza analizi',
                        icon: 'fas fa-chart-line',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/issues/analysis'
                    },
                    {
                        label: 'Çözüm takibi',
                        icon: 'fas fa-tools',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/issues/solutions'
                    }
                ]
            },
            {
                title: 'Önleyici Bakım',
                description: 'Önleyici bakım stratejilerini uygulayın, ekipman ömrünü uzatın ve arıza riskini azaltın.',
                icon: 'fas fa-shield-alt',
                iconColor: 'success',
                link: '/manufacturing/maintenance/preventive',
                features: [
                    {
                        label: 'Bakım stratejileri',
                        icon: 'fas fa-cogs',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/preventive/strategies'
                    },
                    {
                        label: 'Ekipman durumu',
                        icon: 'fas fa-heartbeat',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/preventive/equipment-status'
                    },
                    {
                        label: 'Risk analizi',
                        icon: 'fas fa-exclamation-circle',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/preventive/risk-analysis'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
}

// Module status tracking
const moduleStatus = {
    plans: 'development',
    issues: 'coming-soon',
    preventive: 'coming-soon'
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
    initMaintenanceModule,
    getModuleStatus,
    isModuleAvailable
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    addCustomStyles();
    initMaintenanceModule();
});

// Make functions globally available
window.navigateTo = navigateTo;
window.showNotification = showNotification;
