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
        title: 'Projeler Modülü',
        subtitle: 'Proje takibi ve yönetim işlemlerinizi gerçekleştirin',
        cards: [
            {
                title: 'Proje Takibi',
                description: 'İş emirleri, proje durumu ve ilerleme takibi.',
                icon: 'fas fa-project-diagram',
                iconColor: 'primary',
                link: '/projects/project-tracking'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
