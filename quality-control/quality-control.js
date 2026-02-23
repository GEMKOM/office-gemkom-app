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
        title: 'Kalite Kontrol Modülü',
        subtitle: 'Kalite kontrol süreçlerinizi yönetin ve takip edin',
        cards: [
            {
                title: 'KK İncelemeleri',
                description: 'Kalite kontrol incelemelerini görüntüleyin, onaylayın veya reddedin.',
                icon: 'fas fa-search',
                iconColor: 'primary',
                link: '/quality-control/qc-reviews'
            },
            {
                title: 'Uygunsuzluk Raporları',
                description: 'NCR (Non-Conformance Report) oluşturun, düzenleyin ve yönetin.',
                icon: 'fas fa-exclamation-triangle',
                iconColor: 'warning',
                link: '/quality-control/ncrs'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
