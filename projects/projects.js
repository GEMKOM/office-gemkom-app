import { guardRoute } from '../authService.js';
import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();

    const cards = [
        {
            title: 'Proje Takibi',
            description: 'İş emirleri, proje durumu ve ilerleme takibi.',
            icon: 'fas fa-project-diagram',
            iconColor: 'primary',
            link: '/projects/project-tracking'
        },
        {
            title: 'Tahminler',
            description: 'Çizimlerden üretilen maliyet ve risk raporları; iş emri ve teklif tahminleri.',
            icon: 'fas fa-calculator',
            iconColor: 'primary',
            link: '/projects/estimates'
        }
    ];

    const menuComponent = new MenuComponent('menu-container', {
        title: 'Projeler Modülü',
        subtitle: 'Proje takibi ve yönetim işlemlerinizi gerçekleştirin',
        cards
    });

    menuComponent.render();
});
