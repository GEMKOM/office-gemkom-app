/**
 * Human Resources module
 * Handles HR-related functionality
 */

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
        title: 'İnsan Kaynakları Modülü',
        subtitle: 'İnsan kaynakları süreçlerinizi yönetin ve çalışan bilgilerini takip edin',
        cards: [
            {
                title: 'Maaş Yönetimi',
                description: 'Çalışan ücret oranlarını görüntüleyin ve yönetin',
                icon: 'fas fa-money-bill-wave',
                iconColor: 'success',
                link: '/human_resources/wages'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
    
    console.log('Human Resources module initialized');
});
