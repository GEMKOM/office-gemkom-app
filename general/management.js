import { guardRoute } from '../authService.js';
import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';
import { hasRouteAccess } from '../apis/accessControl.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    const allCards = [
        {
            title: 'Makineler',
            description: 'Şirket makinelerinin envanteri, durum takibi ve planlama yönetimi.',
            icon: 'fas fa-cogs',
            iconColor: 'success',
            link: '/general/machines'
        },
        {
            title: 'Mesailer',
            description: 'Mesai talepleri, onay süreçleri ve mesai raporları yönetimi.',
            icon: 'fas fa-clock',
            iconColor: 'warning',
            link: '/general/overtime'
        },
        {
            title: 'İzin Talepleri',
            description: 'İzin taleplerinin oluşturulması, onay süreçleri ve bakiye takibi.',
            icon: 'fas fa-calendar-check',
            iconColor: 'primary',
            link: '/general/vacation'
        },
        {
            title: 'Departman Talepleri',
            description: 'Departman taleplerinin oluşturulması, onay süreçleri ve takibi.',
            icon: 'fas fa-boxes',
            iconColor: 'info',
            link: '/general/department-requests'
        },
        {
            title: 'Vinç Talepleri',
            description: 'Vinç taleplerinin oluşturulması, onay süreçleri ve fiyat listesi.',
            icon: 'fas fa-truck-pickup',
            iconColor: 'secondary',
            link: '/general/crane-requests'
        },
        {
            title: 'İSG Bildirimleri',
            description: 'İş sağlığı ve güvenliği bildirimlerini takip edin, üzerinize atanan aksiyonları kapatın.',
            icon: 'fas fa-helmet-safety',
            iconColor: 'danger',
            link: '/isg/issues'
        }
    ];

    // The İSG card is open to everyone, so this page can be reached by users
    // who hold none of the other Genel pages: only show what they can open.
    const cards = allCards.filter(card => hasRouteAccess(card.link));

    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Genel Modülü',
        subtitle: 'Şirket geneli yönetim işlemlerinizi gerçekleştirin',
        cards
    });
    
    // Render the menu
    menuComponent.render();
});