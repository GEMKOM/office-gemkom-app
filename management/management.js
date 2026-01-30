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
        title: 'Yönetim Modülü',
        subtitle: 'Şirket yönetimi ve analitik işlemlerinizi gerçekleştirin',
        cards: [
            {
                title: 'Dashboard',
                description: 'Genel performans göstergeleri, önemli metrikler ve hızlı erişim panosu.',
                icon: 'fas fa-tachometer-alt',
                iconColor: 'primary',
                link: '/management/dashboard'
            },
            {
                title: 'Raporlar',
                description: 'Detaylı analiz raporları, performans değerlendirmeleri ve trend analizleri.',
                icon: 'fas fa-chart-bar',
                iconColor: 'success',
                link: '/management/reports'
            },
            {
                title: 'Analitik',
                description: 'Gelişmiş veri analizi, tahminleme modelleri ve stratejik öngörüler.',
                icon: 'fas fa-chart-pie',
                iconColor: 'warning',
                link: '/management/analytics'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
