import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();

    const menuComponent = new MenuComponent('menu-container', {
        title: 'Yönetim Raporları',
        subtitle: 'Dönem bazlı performans raporları ve karşılaştırmalar',
        cards: [
            {
                title: 'Genel Bakış',
                description: 'Üretim, satış, maliyet, taşeron, satınalma ve kalite metriklerinin dönem bazlı özeti.',
                icon: 'fas fa-chart-line',
                iconColor: 'primary',
                link: '/management/reports/overview'
            },
            {
                title: 'Nakit Akış Tablosu',
                description: 'Satış girişleri ile satınalma çıkışlarının birleşik nakit akış tablosu.',
                icon: 'fas fa-money-bill-wave',
                iconColor: 'success',
                link: '/management/reports/cash-flow'
            }
        ]
    });

    menuComponent.render();
});
