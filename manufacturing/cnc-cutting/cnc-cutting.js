import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'CNC Kesim',
        subtitle: 'CNC kesim operasyonları yönetimi',
        cards: [
            {
                title: 'Kesimler',
                description: 'CNC kesim görevlerini yönetin ve takip edin',
                icon: 'fas fa-scissors',
                iconColor: 'primary',
                link: '/manufacturing/cnc-cutting/cuts/',
                features: []
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
