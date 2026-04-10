/**
 * Human Resources -> Attendance (Yoklama) section menu
 */

import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';
import { initRouteProtection } from '../../apis/routeProtection.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();

    const menuComponent = new MenuComponent('menu-container', {
        title: 'Yoklama',
        subtitle: 'Yoklama kayıtlarını yönetin ve ofis dışı giriş taleplerini değerlendirin',
        cards: [
            {
                title: 'Onay Bekleyenler',
                description: 'Ofis dışı giriş taleplerini onaylayın veya reddedin',
                icon: 'fas fa-user-clock',
                iconColor: 'warning',
                link: '/human_resources/attendance/pending-overrides'
            },
            {
                title: 'Kayıtlar',
                description: 'Yoklama kayıtlarını filtreleyin ve inceleyin',
                icon: 'fas fa-clipboard-list',
                iconColor: 'info',
                link: '/human_resources/attendance/records'
            }
        ]
    });

    menuComponent.render();
});

