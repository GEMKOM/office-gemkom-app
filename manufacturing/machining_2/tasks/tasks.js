// Import navbar functionality
import { initNavbar } from '../../../components/navbar.js';
import { MenuComponent } from '../../../components/menu/menu.js';

// Initialize tasks module with menu
function initTasksModule() {
    // Initialize navbar
    initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Parçalar',
        subtitle: 'Parça yönetimi ve oluşturma işlemleri',
        cards: [
            {
                title: 'Parça Listesi',
                description: 'Mevcut parçaları görüntüleyin, yeni parçalar oluşturun ve parça yönetimi yapın.',
                icon: 'fas fa-list',
                iconColor: 'success',
                link: '/manufacturing/machining_2/tasks/list'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initTasksModule();
});

