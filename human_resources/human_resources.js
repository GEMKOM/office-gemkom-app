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
                title: 'Çalışanlar',
                description: 'Çalışan listesini görüntüleyin ve yönetin',
                icon: 'fas fa-users',
                iconColor: 'primary',
                link: '/human_resources/users'
            },
            {
                title: 'PDKS Onayları',
                description: 'Ofis dışı giriş taleplerini onaylayın veya reddedin',
                icon: 'fas fa-user-check',
                iconColor: 'warning',
                link: '/human_resources/attendance'
            },
            {
                title: 'PDKS Kayıtları',
                description: 'PDKS kayıtlarını filtreleyin ve inceleyin',
                icon: 'fas fa-clipboard-list',
                iconColor: 'info',
                link: '/human_resources/attendance'
            },
            {
                title: 'İzin Yönetimi',
                description: 'İzin bakiyelerini düzenleyin ve bekleyen izin taleplerini yönetin',
                icon: 'fas fa-calendar-check',
                iconColor: 'success',
                link: '/human_resources/vacation'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
    
    console.log('Human Resources module initialized');
});
