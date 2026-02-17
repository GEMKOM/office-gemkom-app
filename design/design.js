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
        title: 'Dizayn',
        subtitle: 'Dizayn süreçlerinizi yönetin ve optimize edin',
        cards: [
            {
                title: 'Projeler',
                description: 'Dizayn departmanı görevlerini görüntüleyin ve yönetin.',
                icon: 'fas fa-project-diagram',
                iconColor: 'primary',
                link: '/design/projects'
            },
            {
                title: 'Revizyon Talepleri',
                description: 'Bekleyen revizyon taleplerini görüntüleyin, onaylayın veya reddedin.',
                icon: 'fas fa-edit',
                iconColor: 'warning',
                link: '/design/revision-requests'
            }
        ]
    });

    // Render the menu
    menuComponent.render();
});
