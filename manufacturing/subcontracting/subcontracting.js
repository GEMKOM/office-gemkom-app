import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { hasRouteAccess } from '../../apis/accessControl.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    // İşçilik Fiyatı is restricted to the planning manager, and MenuComponent
    // does not filter by access on its own — an unfiltered card would just walk
    // people into a 403.
    const cards = [
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
            title: 'İşçilik Fiyatı',
            description: 'Satış fiyatından geriye giderek taşerona verilebilecek €/kg işçiliği hesaplayın.',
            icon: 'fas fa-calculator',
            iconColor: 'primary',
            link: '/manufacturing/subcontracting/labor-pricing',
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
    ];

    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Taşeron Modülü',
        subtitle: 'Taşeron yönetimi, hakedişler ve düzeltmeler',
        cards: cards.filter(card => hasRouteAccess(card.link))
    });

    // Render the menu
    menuComponent.render();
});
