import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';
import { initRouteProtection } from '../../apis/routeProtection.js';

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
        title: 'Stok',
        subtitle: 'Stok yönetimi ve stok kartları',
        cards: [
            {
                title: 'Stok Kartları',
                description: 'Stok kartları listesi ve yönetimi.',
                icon: 'fas fa-boxes',
                iconColor: 'primary',
                link: '/planning/inventory/cards'
            }
        ]
    });

    // Render the menu
    menuComponent.render();
});

