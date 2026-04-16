import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';

document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();

    const menuComponent = new MenuComponent('menu-container', {
        title: 'Lineer Kesim',
        subtitle: 'Lineer kesim optimizasyonu ve görev yönetimi',
        cards: [
            {
                title: 'Dashboard',
                description: 'Kesim planlarını ve kesim görevlerini hızlıca görüntüleyin.',
                icon: 'fas fa-chart-line',
                iconColor: 'primary',
                link: '/manufacturing/linear-cutting/dashboard'
            },
            {
                title: 'Kesimler',
                description: 'Kesim planı oluşturun, parçaları yönetin, optimize edin ve onaylayın.',
                icon: 'fas fa-ruler-horizontal',
                iconColor: 'success',
                link: '/manufacturing/linear-cutting/cuts/'
            }
        ]
    });

    menuComponent.render();
});

