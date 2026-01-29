import { guardRoute } from '../authService.js';
import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';
import { initRouteProtection } from '../apis/routeProtection.js';

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
        title: 'Satın Alma Modülü',
        subtitle: 'Tedarik süreçlerinizi yönetin ve optimize edin',
        cards: [
            {
                title: 'Projeler',
                description: 'Satın alma departmanı görevlerini görüntüleyin ve yönetin.',
                icon: 'fas fa-project-diagram',
                iconColor: 'primary',
                link: '/procurement/projects'
            },
            {
                title: 'Tedarikçiler',
                description: 'Tedarikçi bilgileri, performans takibi ve tedarikçi değerlendirme yönetimi.',
                icon: 'fas fa-handshake',
                iconColor: 'primary',
                link: '/procurement/suppliers'
            },
            {
                title: 'Satın Alma Talepleri',
                description: 'Satın alma taleplerinin oluşturulması, onay süreçleri ve takip yönetimi.',
                icon: 'fas fa-shopping-cart',
                iconColor: 'success',
                link: '/procurement/purchase-requests',
                features: [
                    {
                        label: 'Talep Oluştur',
                        icon: 'fas fa-plus',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/procurement/purchase-requests/create'
                    },
                    {
                        label: 'Bekleyen Talepler',
                        icon: 'fas fa-clock',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/procurement/purchase-requests/pending'
                    },
                    {
                        label: 'Onaylanan Talepler',
                        icon: 'fas fa-check-circle',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/procurement/purchase-requests/approved'
                    }
                ]
            },
            {
                title: 'Raporlar',
                description: 'Satın alma raporları, analizler ve performans metrikleri.',
                icon: 'fas fa-chart-bar',
                iconColor: 'info',
                link: '/procurement/reports',
                features: [
                    {
                        label: 'Satın Alma Analizi',
                        icon: 'fas fa-chart-line',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/procurement/reports/purchase-analysis'
                    },
                    {
                        label: 'Tedarikçi Performansı',
                        icon: 'fas fa-chart-pie',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/procurement/reports/supplier-performance'
                    },
                    {
                        label: 'Maliyet Analizi',
                        icon: 'fas fa-dollar-sign',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/procurement/reports/cost-analysis'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
