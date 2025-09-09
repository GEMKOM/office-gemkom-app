// Finance Module JavaScript
import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';

// Initialize the finance module
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize navbar
    await initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Finans Modülü',
        subtitle: 'Finansal süreçlerinizi yönetin ve mali durumunuzu takip edin',
        cards: [
            {
                title: 'Satın Alma Siparişleri',
                description: 'Satın alma siparişlerini görüntüle, fatura oluştur ve finansal takip yap.',
                icon: 'fas fa-shopping-cart',
                iconColor: 'primary',
                link: '/finance/purchase-orders'
            },
            {
                title: 'Raporlar',
                description: 'Finansal analizler, maliyet raporları ve performans metrikleri.',
                icon: 'fas fa-chart-bar',
                iconColor: 'info',
                link: '/finance/reports'
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
