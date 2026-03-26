import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';
import { initRouteProtection } from '../apis/routeProtection.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    const menuComponent = new MenuComponent('menu-container', {
        title: 'Muhasebe Modülü',
        subtitle: 'Dışa aktarımlar ve muhasebe entegrasyonları',
        cards: [
            {
                title: 'Hakedişler',
                description: 'Seçilen yıl/ay için hakediş muhasebe çıktısını tablo olarak görüntüle.',
                icon: 'fas fa-file-invoice-dollar',
                iconColor: 'primary',
                link: '/accounting/subcontracting-statements'
            }
        ]
    });

    menuComponent.render();
});

