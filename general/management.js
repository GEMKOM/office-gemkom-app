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
        title: 'Genel Modülü',
        subtitle: 'Şirket geneli yönetim işlemlerinizi gerçekleştirin',
        cards: [
            {
                title: 'Çalışanlar',
                description: 'Şirket çalışanlarının yönetimi, profil bilgileri ve departman atamaları.',
                icon: 'fas fa-users',
                iconColor: 'primary',
                link: '/general/users'
            },
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
                title: 'Departman Talepleri',
                description: 'Departman taleplerinin oluşturulması, onay süreçleri ve takibi.',
                icon: 'fas fa-boxes',
                iconColor: 'info',
                link: '/general/department-requests'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});