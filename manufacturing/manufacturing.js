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
        title: 'İmalat Modülü',
        subtitle: 'İmalat süreçlerinizi yönetin ve optimize edin',
        cards: [
            {
                title: 'Talaşlı İmalat',
                description: 'CNC işlemleri, torna, freze ve diğer talaşlı imalat süreçleri yönetimi.',
                icon: 'fas fa-cog',
                iconColor: 'success',
                link: '/manufacturing/machining',
                features: [
                    {
                        label: 'Dashboard',
                        icon: 'fas fa-chart-line',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/machining/dashboard'
                    },
                    {
                        label: 'Görevler',
                        icon: 'fas fa-tasks',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/machining/tasks'
                    },
                    {
                        label: 'Raporlar',
                        icon: 'fas fa-chart-pie',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/machining/reports'
                    },
                    {
                        label: 'Kapasite Yönetimi',
                        icon: 'fas fa-industry',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/machining/capacity'
                    }
                ]
            },
            {
                title: 'CNC Kesim',
                description: 'CNC kesim operasyonları, nesting dosyaları ve kesim görevleri yönetimi.',
                icon: 'fas fa-cut',
                iconColor: 'primary',
                link: '/manufacturing/cnc-cutting',
                features: [
                    {
                        label: 'Kesimler',
                        icon: 'fas fa-scissors',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/cnc-cutting/cuts'
                    },
                    {
                        label: 'Raporlar',
                        icon: 'fas fa-chart-bar',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/cnc-cutting/reports'
                    }
                ]
            },
            {
                title: 'Bakım',
                description: 'Ekipman bakım planları, arıza takibi ve önleyici bakım yönetimi.',
                icon: 'fas fa-wrench',
                iconColor: 'warning',
                link: '/manufacturing/maintenance',
                features: [
                    {
                        label: 'Arıza Talepleri',
                        icon: 'fas fa-exclamation-triangle',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests'
                    }
                ]
            },
            {
                title: 'Kaynak',
                description: 'Kaynak işlemleri ve zaman kayıtları yönetimi.',
                icon: 'fas fa-fire',
                iconColor: 'danger',
                link: '/manufacturing/welding',
                features: [
                    {
                        label: 'Zaman Kayıtları',
                        icon: 'fas fa-clock',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/welding/time-entries'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});