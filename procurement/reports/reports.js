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
        title: 'Raporlar',
        subtitle: 'Satın alma analizleri ve performans raporları',
        cards: [
            {
                title: 'Ürün Raporu',
                description: 'Ürün satın alma analizleri, miktar ve maliyet metrikleri.',
                icon: 'fas fa-chart-bar',
                iconColor: 'primary',
                link: '/procurement/reports/items'
            },
            {
                title: 'Tedarikçi Raporu',
                description: 'Tedarikçi performans analizleri, satın alma metrikleri ve DBS durumları.',
                icon: 'fas fa-chart-pie',
                iconColor: 'success',
                link: '/procurement/reports/suppliers'
            },
            {
                title: 'Personel Raporu',
                description: 'Satın alma personeli performans analizleri, PR/PO metrikleri ve aktivite durumları.',
                icon: 'fas fa-users',
                iconColor: 'info',
                link: '/procurement/reports/staff'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
