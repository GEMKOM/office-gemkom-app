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
        title: 'Bakım Modülü',
        subtitle: 'Ekipman bakım planları, arıza takibi ve önleyici bakım yönetimi',
        cards: [
            {
                title: 'Arıza Talepleri',
                description: 'Yeni arıza talepleri oluşturun ve mevcut arıza durumlarını takip edin.',
                icon: 'fas fa-exclamation-triangle',
                iconColor: 'danger',
                link: '/manufacturing/maintenance/fault-requests',
                features: [
                    {
                        label: 'Yeni Arıza Talebi',
                        icon: 'fas fa-plus-circle',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests/create'
                    },
                    {
                        label: 'Arıza Listesi',
                        icon: 'fas fa-list',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests/list'
                    },
                    {
                        label: 'Arıza İstatistikleri',
                        icon: 'fas fa-chart-bar',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests/statistics'
                    }
                ]
            },
            {
                title: 'Bakım Planları',
                description: 'Önleyici bakım planları oluşturun ve bakım takvimini yönetin.',
                icon: 'fas fa-calendar-check',
                iconColor: 'success',
                link: '/manufacturing/maintenance/plans',
                features: [
                    {
                        label: 'Bakım Takvimi',
                        icon: 'fas fa-calendar-alt',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/plans/calendar'
                    },
                    {
                        label: 'Bakım Geçmişi',
                        icon: 'fas fa-history',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/plans/history'
                    }
                ]
            },
            {
                title: 'Ekipman Yönetimi',
                description: 'Ekipman bilgilerini yönetin ve bakım kayıtlarını tutun.',
                icon: 'fas fa-cogs',
                iconColor: 'info',
                link: '/manufacturing/maintenance/equipment',
                features: [
                    {
                        label: 'Ekipman Listesi',
                        icon: 'fas fa-tools',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/equipment/list'
                    },
                    {
                        label: 'Bakım Kayıtları',
                        icon: 'fas fa-clipboard-list',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/equipment/records'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
