// Import navbar functionality
import { initNavbar } from '../../../components/navbar.js';
import { MenuComponent } from '../../../components/menu/menu.js';

// Initialize tasks module with menu
function initTasksModule() {
    // Initialize navbar
    initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Görevler',
        subtitle: 'Görev yönetimi ve oluşturma işlemleri',
        cards: [
            {
                title: 'Görev Listesi',
                description: 'Mevcut görevleri görüntüleyin, yeni görevler oluşturun ve toplu görev yönetimi yapın.',
                icon: 'fas fa-list',
                iconColor: 'success',
                link: '/manufacturing/machining/tasks/list'
            },
            {
                title: 'Görev Oluştur',
                description: 'Yeni görev oluşturun ve oluşturduğunuz görevleri görüntüleyin.',
                icon: 'fas fa-plus-circle',
                iconColor: 'primary',
                link: '/manufacturing/machining/tasks/create'
            },
            {
                title: 'Bekleyen Görevler',
                description: 'Makine atanmamış bekleyen görevleri görüntüleyin.',
                icon: 'fas fa-clock',
                iconColor: 'warning',
                link: '/manufacturing/machining/tasks/pending'
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
