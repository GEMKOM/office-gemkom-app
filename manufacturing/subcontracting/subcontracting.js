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
        title: 'Taşeron Modülü',
        subtitle: 'Taşeron yönetimi, hakedişler ve düzeltmeler',
        cards: [
            {
                title: 'Genel Bakış',
                description: 'Taşeron bazında özet, atamalar ve maliyet göstergeleri.',
                icon: 'fas fa-chart-line',
                iconColor: 'primary',
                link: '/manufacturing/subcontracting/overview',
                features: []
            },
            {
                title: 'Taşeronlar',
                description: 'Taşeronları ve fiyat kademelerini oluşturun ve yönetin.',
                icon: 'fas fa-building',
                iconColor: 'info',
                link: '/manufacturing/subcontracting/subcontractors',
                features: []
            },
            {
                title: 'Hakedişler',
                description: 'Aylık taşeron hakedişlerini oluşturun, onaylayın ve takip edin.',
                icon: 'fas fa-file-invoice-dollar',
                iconColor: 'success',
                link: '/manufacturing/subcontracting/statements',
                features: []
            },
            {
                title: 'Düzeltmeler',
                description: 'Tüm hakediş düzeltmeleri — ek ödemeler ve kesintiler.',
                icon: 'fas fa-balance-scale-left',
                iconColor: 'warning',
                link: '/manufacturing/subcontracting/adjustments',
                features: []
            }
        ]
    });

    // Render the menu
    menuComponent.render();
});
