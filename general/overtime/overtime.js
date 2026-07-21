import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';
import { initRouteProtection } from '../../apis/routeProtection.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
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
            },
            {
                title: 'Mesai Kullanıcıları',
                description: 'Belirli bir tarihte mesai yapacak kullanıcıların listesi.',
                icon: 'fas fa-users',
                iconColor: 'primary',
                link: '/general/overtime/users'
            },
            {
                title: 'Talaşlı İmalat Mesai Raporu',
                description: 'Onaylı mesailerdeki operasyonların o gün çalışılıp çalışılmadığı ve süreleri.',
                icon: 'fas fa-cogs',
                iconColor: 'success',
                link: '/general/overtime/machining-report'
            },
            {
                title: 'Mesai Maliyet Raporu',
                description: 'Seçilen dönemdeki toplam mesai maliyeti; ekip, kişi ve iş bazında dağılım.',
                icon: 'fas fa-coins',
                iconColor: 'warning',
                link: '/general/overtime/cost-report'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
