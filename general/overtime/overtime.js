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
        title: 'Mesai Talepleri',
        subtitle: 'Mesai taleplerinin yönetimi ve takibi',
        cards: [
            {
                title: 'Bekleyen Talepler',
                description: 'Onay bekleyen mesai taleplerinin listesi ve durum takibi.',
                icon: 'fas fa-clock',
                iconColor: 'warning',
                link: '/general/overtime/pending'
            },
            {
                title: 'Kayıt Defteri',
                description: 'Tüm mesai taleplerinin geçmişi ve kayıt defteri.',
                icon: 'fas fa-archive',
                iconColor: 'info',
                link: '/general/overtime/registry'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
