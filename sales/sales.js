import { guardRoute } from '../authService.js';
import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Satış Modülü',
        subtitle: 'Müşteri yönetimi, teklif oluşturma ve satış süreçlerinizi yönetin',
        cards: [
            {
                title: 'Müşteriler',
                description: 'Müşteri bilgileri, iletişim detayları ve yönetim işlemleri.',
                icon: 'fas fa-users',
                iconColor: 'primary',
                link: '/sales/customers'
            },
            {
                title: 'Teklifler',
                description: 'Satış teklifleri oluşturun, fiyatlandırın, departman görüşü alın ve onay süreçlerini yönetin.',
                icon: 'fas fa-file-invoice-dollar',
                iconColor: 'success',
                link: '/sales/offers',
                features: [
                    {
                        label: 'Teklif Listesi',
                        icon: 'fas fa-list',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/sales/offers'
                    },
                    {
                        label: 'Ürün Kataloğu',
                        icon: 'fas fa-book',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/sales/catalog'
                    }
                ]
            },
            {
                title: 'Ürün Kataloğu',
                description: 'Teklif şablonları ve ürün ağaçlarını yönetin.',
                icon: 'fas fa-book',
                iconColor: 'info',
                link: '/sales/catalog'
            }
        ]
    });
    
    menuComponent.render();
});
