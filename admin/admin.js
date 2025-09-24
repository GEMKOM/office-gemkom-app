// admin/admin.js
import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';
import { isAdmin } from '../authService.js';

// Admin menu configuration
const adminMenuConfig = {
    title: 'Admin Paneli',
    subtitle: 'Sistem yönetimi ve kullanıcı işlemleri',
    cards: [
        {
            title: 'Şifre Sıfırlama Talepleri',
            description: 'Kullanıcı şifre sıfırlama taleplerini görüntüleyin ve yönetin',
            icon: 'fas fa-key',
            link: 'password-resets/',
            color: 'primary'
        }
    ]
};

// Initialize admin page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check if user is admin/superuser
        if (!isAdmin()) {
            console.error('Admin access denied');
            alert('Bu sayfaya erişim yetkiniz bulunmamaktadır. Sadece yöneticiler admin paneline erişebilir.');
            window.location.href = '../login/';
            return;
        }

        // Initialize navbar
        await initNavbar();

        // Initialize admin menu
        const menuComponent = new MenuComponent('menu-container', adminMenuConfig);
        menuComponent.render();

    } catch (error) {
        console.error('Admin initialization error:', error);
        window.location.href = '../login/';
    }
});
