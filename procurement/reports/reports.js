import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Raporlar',
        subtitle: 'Satın alma analizleri ve performans raporları',
        cards: [
            {
                title: 'Satın Alma Analizi',
                description: 'Satın alma trendleri, miktar analizleri ve karşılaştırmalı raporlar.',
                icon: 'fas fa-chart-line',
                iconColor: 'primary',
                link: '/procurement/reports/purchase-analysis'
            },
            {
                title: 'Tedarikçi Performansı',
                description: 'Tedarikçi performans metrikleri, değerlendirme raporları ve karşılaştırmalar.',
                icon: 'fas fa-chart-pie',
                iconColor: 'success',
                link: '/procurement/reports/supplier-performance'
            },
            {
                title: 'Maliyet Analizi',
                description: 'Maliyet trendleri, bütçe analizleri ve tasarruf raporları.',
                icon: 'fas fa-dollar-sign',
                iconColor: 'warning',
                link: '/procurement/reports/cost-analysis'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
