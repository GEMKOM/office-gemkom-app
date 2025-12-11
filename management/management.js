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
                link: '/management/reports',
                features: [
                    {
                        label: 'Finansal Raporlar',
                        icon: 'fas fa-dollar-sign',
                        link: '/management/reports/financial'
                    },
                    {
                        label: 'Operasyonel Raporlar',
                        icon: 'fas fa-cogs',
                        link: '/management/reports/operational'
                    },
                    {
                        label: 'Personel Raporları',
                        icon: 'fas fa-users',
                        link: '/management/reports/personnel'
                    }
                ]
            },
            {
                title: 'Analitik',
                description: 'Gelişmiş veri analizi, tahminleme modelleri ve stratejik öngörüler.',
                icon: 'fas fa-chart-pie',
                iconColor: 'warning',
                link: '/management/analytics',
                features: [
                    {
                        label: 'Veri Görselleştirme',
                        icon: 'fas fa-chart-area',
                        link: '/management/analytics/visualization'
                    },
                    {
                        label: 'Tahminleme',
                        icon: 'fas fa-crystal-ball',
                        link: '/management/analytics/forecasting'
                    },
                    {
                        label: 'Karşılaştırma Analizi',
                        icon: 'fas fa-balance-scale',
                        link: '/management/analytics/comparison'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
