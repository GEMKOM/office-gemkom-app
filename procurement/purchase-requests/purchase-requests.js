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
        title: 'Satın Alma Talepleri',
        subtitle: 'Satın alma taleplerinin yönetimi ve takibi',
        cards: [
            {
                title: 'Talep Oluştur',
                description: 'Yeni satın alma talebi oluşturma ve form yönetimi.',
                icon: 'fas fa-plus',
                iconColor: 'primary',
                link: '/procurement/purchase-requests/create'
            },
            {
                title: 'Bekleyen Talepler',
                description: 'Onay bekleyen satın alma taleplerinin listesi ve durum takibi.',
                icon: 'fas fa-clock',
                iconColor: 'warning',
                link: '/procurement/purchase-requests/pending'
            },
            {
                title: 'Kayıt Defteri',
                description: 'Tüm satın alma taleplerinin geçmişi ve kayıt defteri.',
                icon: 'fas fa-archive',
                iconColor: 'info',
                link: '/procurement/purchase-requests/registry'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
