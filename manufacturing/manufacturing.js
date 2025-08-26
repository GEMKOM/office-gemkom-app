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
                title: 'Bakım',
                description: 'Ekipman bakım planları, arıza takibi ve önleyici bakım yönetimi.',
                icon: 'fas fa-wrench',
                iconColor: 'warning',
                link: '/manufacturing/maintenance',
                features: [
                    {
                        label: 'Bakım Planı',
                        icon: 'fas fa-calendar-check',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/plans'
                    },
                    {
                        label: 'Arıza Takibi',
                        icon: 'fas fa-exclamation-triangle',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/issues'
                    },
                    {
                        label: 'Önleyici Bakım',
                        icon: 'fas fa-shield-alt',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/preventive'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});