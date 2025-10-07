// Capacity Management Module JavaScript

// Import navbar functionality
import { initNavbar } from '../../../components/navbar.js';
import { MenuComponent } from '../../../components/menu/menu.js';

// Initialize capacity management module
function initCapacityModule() {
    // Initialize navbar
    initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Kapasite Yönetimi',
        subtitle: 'Makine kapasitelerini planlayın ve geçmiş çalışma verilerini analiz edin',
        cards: [
            {
                title: 'Kapasite Planlayıcı',
                description: 'Makine kapasitelerini planlayın ve üretim programını oluşturun.',
                icon: 'fas fa-calendar-alt',
                iconColor: 'primary',
                link: '/manufacturing/machining/capacity/planning',
                features: []
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
}


// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initCapacityModule();
});
