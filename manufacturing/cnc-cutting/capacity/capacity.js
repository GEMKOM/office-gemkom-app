// Capacity Management for CNC Cutting

import { initNavbar } from '../../../components/navbar.js';
import { MenuComponent } from '../../../components/menu/menu.js';

function initCapacityModule() {
    initNavbar();

    const menuComponent = new MenuComponent('menu-container', {
        title: 'Kapasite Yönetimi',
        subtitle: 'CNC Kesim kapasitelerini planlayın ve üretim programını yönetin',
        cards: [
            {
                title: 'Kapasite Planlayıcı',
                description: 'Kesim makineleri için plan oluşturun ve düzenleyin.',
                icon: 'fas fa-calendar-alt',
                iconColor: 'primary',
                link: '/manufacturing/cnc-cutting/capacity/planning',
                features: []
            }
        ]
    });

    menuComponent.render();
}

document.addEventListener('DOMContentLoaded', () => {
    initCapacityModule();
});


