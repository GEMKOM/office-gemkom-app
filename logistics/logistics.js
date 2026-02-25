import { guardRoute } from '../authService.js';
import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';
import { initRouteProtection } from '../apis/routeProtection.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Lojistik Modülü',
        subtitle: 'Lojistik süreçlerinizi yönetin ve optimize edin',
        cards: [
            {
                title: 'Projeler',
                description: 'Lojistik departmanı görevlerini görüntüleyin ve yönetin.',
                icon: 'fas fa-project-diagram',
                iconColor: 'primary',
                link: '/logistics/projects'
            },
            {
                title: 'Maliyet Satırları',
                description: 'Sevkiyat maliyeti girilmemiş iş emirleri ve maliyet satırları.',
                icon: 'fas fa-euro-sign',
                iconColor: 'primary',
                link: '/logistics/cost-lines'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
