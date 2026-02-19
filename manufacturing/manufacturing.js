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
                title: 'Projeler',
                description: 'İmalat departmanı görevlerini görüntüleyin ve yönetin.',
                icon: 'fas fa-project-diagram',
                iconColor: 'primary',
                link: '/manufacturing/projects'
            },
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
                        label: 'Dashboard',
                        icon: 'fas fa-chart-line',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/cnc-cutting/dashboard'
                    },
                    {
                        label: 'Kesimler',
                        icon: 'fas fa-scissors',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/cnc-cutting/cuts'
                    },
                    {
                        label: 'Fire Plakalar',
                        icon: 'fas fa-layer-group',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/cnc-cutting/remnants'
                    },
                    {
                        label: 'Raporlar',
                        icon: 'fas fa-chart-bar',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/cnc-cutting/reports'
                    },
                    {
                        label: 'Kapasite Yönetimi',
                        icon: 'fas fa-industry',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/cnc-cutting/capacity'
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
                    },
                    {
                        label: 'Raporlar',
                        icon: 'fas fa-chart-bar',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/reports'
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
                    },
                    {
                        label: 'Raporlar',
                        icon: 'fas fa-chart-bar',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/welding/reports'
                    }
                ]
            },
            {
                title: 'Raporlar',
                description: 'raporlar ve analizler.',
                icon: 'fas fa-chart-pie',
                iconColor: 'info',
                link: '/manufacturing/reports',
                features: [
                    {
                        label: 'İş Maliyeti',
                        icon: 'fas fa-calculator',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/reports/combined-job-costs'
                    }
                ]
            },
            {
                title: 'Taşeron',
                description: 'Taşeron yönetimi, fiyat kademeleri ve hakediş işlemleri.',
                icon: 'fas fa-handshake',
                iconColor: 'primary',
                link: '/manufacturing/subcontracting/subcontractors',
                features: [
                    {
                        label: 'Taşeronlar',
                        icon: 'fas fa-building',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/subcontracting/subcontractors'
                    },
                    {
                        label: 'Hakedişler',
                        icon: 'fas fa-file-invoice-dollar',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/subcontracting/statements'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});