// Import navbar functionality
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';

// Initialize machining_2 module with enhanced features
function initMachining2Module() {
    // Initialize navbar
    initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Talaşlı İmalat (Yeni)',
        subtitle: 'Yeni talaşlı imalat süreçleri yönetimi - Parça ve operasyon bazlı',
        cards: [
            {
                title: 'Parçalar',
                description: 'Parça yönetimi ve oluşturma işlemleri.',
                icon: 'fas fa-tasks',
                iconColor: 'success',
                link: '/manufacturing/machining_2/tasks',
                features: [
                    {
                        label: 'Parça Listesi',
                        icon: 'fas fa-list',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/machining_2/tasks/list'
                    }
                ]
            },
            {
                title: 'Kapasite Yönetimi',
                description: 'Makine kapasitelerini planlayın ve geçmiş çalışma verilerini analiz edin.',
                icon: 'fas fa-calendar-alt',
                iconColor: 'primary',
                link: '/manufacturing/machining_2/capacity',
                features: [
                    {
                        label: 'Kapasite Planlayıcı',
                        icon: 'fas fa-calendar-check',
                        iconColor: 'rgba(0, 123, 255, 1)',
                        link: '/manufacturing/machining_2/capacity/planning'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initMachining2Module();
});

