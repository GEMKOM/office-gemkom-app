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
        title: 'Planlama',
        subtitle: 'Planlama süreçlerinizi yönetin ve optimize edin',
        cards: [
            {
                title: 'Departman Talepleri',
                description: 'Onaylanan departman taleplerinin listesi ve transfer işlemleri.',
                icon: 'fas fa-boxes',
                iconColor: 'primary',
                link: '/planning/department-requests'
            },
            {
                title: 'Görev Şablonları',
                description: 'Departman görev şablonlarını yönetin ve oluşturun.',
                icon: 'fas fa-tasks',
                iconColor: 'primary',
                link: '/planning/task-templates'
            },
            {
                title: 'Stok',
                description: 'Stok yönetimi ve stok kartları.',
                icon: 'fas fa-warehouse',
                iconColor: 'primary',
                link: '/planning/inventory'
            },
            {
                title: 'Projeler',
                description: 'Planlama departmanı görevlerini görüntüleyin ve yönetin.',
                icon: 'fas fa-project-diagram',
                iconColor: 'primary',
                link: '/planning/projects'
            }
        ]
    });

    // Render the menu
    menuComponent.render();
});

