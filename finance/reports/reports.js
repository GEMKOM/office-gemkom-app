// Finance Reports Module JavaScript
import { initNavbar } from '../../../components/navbar.js';
import { MenuComponent } from '../../../components/menu/menu.js';

// Initialize the finance reports module
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize navbar
    await initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Finans Raporları',
        subtitle: 'Finansal analizler, maliyet raporları ve performans metrikleri',
        cards: [
            {
                title: 'Yönetici Özeti',
                description: 'Finansal durumun genel görünümü, temel performans göstergeleri ve trend analizleri.',
                icon: 'fas fa-chart-pie',
                iconColor: 'primary',
                link: '/finance/reports/executive-overview'
            },
            {
                title: 'Proje Raporu',
                description: 'Proje bazlı satın alma analizleri, maliyet metrikleri ve performans takibi.',
                icon: 'fas fa-chart-line',
                iconColor: 'success',
                link: '/finance/reports/projects'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
    
    // Add any finance reports-specific functionality here
    console.log('Finance reports module initialized');
});

// Export for potential use in other modules
export function initFinanceReports() {
    console.log('Finance reports module functions available');
}
