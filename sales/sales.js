import { guardRoute } from '../authService.js';
import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Satış Modülü',
        subtitle: 'Müşteri ve satış işlemlerinizi gerçekleştirin',
        cards: [
            {
                title: 'Müşteriler',
                description: 'Müşteri bilgileri, iletişim detayları ve yönetim işlemleri.',
                icon: 'fas fa-users',
                iconColor: 'primary',
                link: '/sales/customers'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
