import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Tedarikçiler',
        subtitle: 'Tedarikçi bilgileri ve ödeme koşulları yönetimi',
        cards: [
            {
                title: 'Tedarikçi Listesi',
                description: 'Tedarikçi bilgileri, performans takibi ve tedarikçi değerlendirme yönetimi.',
                icon: 'fas fa-list',
                iconColor: 'primary',
                link: '/procurement/suppliers/list'
            },
            {
                title: 'Ödeme Koşulları',
                description: 'Ödeme koşulları tanımlama, düzenleme ve tedarikçi bazında yönetimi.',
                icon: 'fas fa-credit-card',
                iconColor: 'success',
                link: '/procurement/suppliers/payment-terms'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
