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
                title: 'Dashboard',
                description: 'Gerçek zamanlı görünüm ile aktif zamanlayıcıları, makine durumlarını ve istatistikleri takip edin.',
                icon: 'fas fa-chart-line',
                iconColor: 'primary',
                link: '/manufacturing/cnc-cutting/dashboard'
            },
            {
                title: 'Kesimler',
                description: 'CNC kesim görevlerini yönetin ve takip edin',
                icon: 'fas fa-scissors',
                iconColor: 'success',
                link: '/manufacturing/cnc-cutting/cuts/',
                features: []
            },
            {
                title: 'Artık Plakalar',
                description: 'CNC kesim artık plakalarını görüntüleyin ve yönetin',
                icon: 'fas fa-layer-group',
                iconColor: 'info',
                link: '/manufacturing/cnc-cutting/remnants/',
                features: []
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
