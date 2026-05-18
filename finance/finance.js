// Finance Module JavaScript
import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';
import { initRouteProtection } from '../apis/routeProtection.js';

// Initialize the finance module
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    // Initialize navbar
    await initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Finans Modülü',
        subtitle: 'Finansal süreçlerinizi yönetin ve mali durumunuzu takip edin',
        cards: [
            {
                title: 'Finans İşlemleri',
                description: 'Satın alma siparişleri, ödemeler, tahsilatlar, giderler, krediler ve vergiler.',
                icon: 'fas fa-coins',
                iconColor: 'primary',
                link: '/finance/purchase-orders'
            },
            {
                title: 'Raporlar',
                description: 'Finansal analizler, maliyet raporları ve performans metrikleri.',
                icon: 'fas fa-chart-bar',
                iconColor: 'info',
                link: '/finance/reports',
                features: [
                    {
                        label: 'Yönetici Özeti',
                        icon: 'fas fa-chart-pie',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/finance/reports/executive-overview'
                    },
                    {
                        label: 'Proje Raporu',
                        icon: 'fas fa-chart-line',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/finance/reports/projects'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
    
    // Add any finance-specific functionality here
    console.log('Finance module initialized');
});

// Export for potential use in other modules
export function initFinance() {
    console.log('Finance module functions available');
}
