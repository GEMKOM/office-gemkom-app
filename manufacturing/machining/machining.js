// Import navbar functionality
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';

// Initialize machining module with enhanced features
function initMachiningModule() {
    // Initialize navbar
    initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Talaşlı İmalat',
        subtitle: 'CNC işlemleri ve talaşlı imalat süreçleri yönetimi',
        cards: [
            {
                title: 'Dashboard',
                description: 'Gerçek zamanlı görünüm ile aktif zamanlayıcıları, makine durumlarını ve istatistikleri takip edin.',
                icon: 'fas fa-chart-line',
                iconColor: 'primary',
                link: '/manufacturing/machining/dashboard'
            },
            {
                title: 'Görevler',
                description: 'Mevcut görevleri görüntüleyin, yeni görevler oluşturun ve toplu görev yönetimi yapın.',
                icon: 'fas fa-tasks',
                iconColor: 'success',
                link: '/manufacturing/machining/tasks'
            },
            {
                title: 'Raporlar',
                description: 'Detaylı raporlar ve analizler ile performansınızı ölçün ve veriye dayalı kararlar alın.',
                icon: 'fas fa-chart-bar',
                iconColor: 'info',
                link: '/manufacturing/machining/reports',
                features: [
                    {
                        label: 'Biten Zamanlayıcılar',
                        icon: 'fas fa-clock',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/machining/reports/finished-timers'
                    },
                    {
                        label: 'Toplam Raporu',
                        icon: 'fas fa-chart-pie',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/machining/reports/sum-report'
                    },
                    {
                        label: 'Maliyet Analizi',
                        icon: 'fas fa-calculator',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/machining/reports/cost-analysis'
                    },
                    {
                        label: 'Makine Çalışma Geçmişi',
                        icon: 'fas fa-history',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/machining/reports/history'
                    },
                    {
                        label: 'Üretim Planı',
                        icon: 'fas fa-calendar-alt',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/machining/reports/production-plan'
                    }
                ]
            },
            {
                title: 'Kapasite Planlayıcı',
                description: 'Makine kapasitelerini planlayın ve geçmiş çalışma verilerini analiz edin.',
                icon: 'fas fa-industry',
                iconColor: 'warning',
                link: '/manufacturing/machining/capacity',
                features: [
                    {
                        label: 'Kapasite Planlayıcı',
                        icon: 'fas fa-calendar-alt',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/machining/capacity/planning'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initMachiningModule();
});