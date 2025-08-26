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
        title: 'Malzemeler',
        subtitle: 'Malzeme kataloğu ve stok yönetimi',
        cards: [
            {
                title: 'Malzeme Kataloğu',
                description: 'Tüm malzemelerin kataloğu, kategoriler ve arama fonksiyonları.',
                icon: 'fas fa-book',
                iconColor: 'primary',
                link: '/procurement/items/catalog'
            },
            {
                title: 'Stok Takibi',
                description: 'Malzeme stok durumu, minimum stok uyarıları ve stok hareketleri.',
                icon: 'fas fa-warehouse',
                iconColor: 'success',
                link: '/procurement/items/inventory'
            },
            {
                title: 'Teknik Özellikler',
                description: 'Malzeme teknik özellikleri, standartlar ve kalite gereksinimleri.',
                icon: 'fas fa-info-circle',
                iconColor: 'warning',
                link: '/procurement/items/specifications'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
