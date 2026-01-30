import { guardRoute } from '../authService.js';
import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';
import { initRouteProtection, withRouteProtection } from '../apis/routeProtection.js';
import { hasRouteAccess } from '../apis/accessControl.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    // Handle IT department page logic
    await handleITPage();
});

async function handleITPage() {
    try {
        const user = JSON.parse(localStorage.getItem('user'));

        // IT department menu cards
        const itCards = [
            {
                title: 'Envanter',
                description: 'IT cihazlarını yönetin, donanım envanterini takip edin ve cihaz durumlarını izleyin.',
                icon: 'fas fa-desktop',
                iconColor: 'primary',
                link: '/it/inventory',
                features: [
                    {
                        label: 'Bilgisayarlar',
                        icon: 'fas fa-desktop',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/inventory'
                    },
                    {
                        label: 'Laptoplar',
                        icon: 'fas fa-laptop',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/inventory'
                    },
                    {
                        label: 'Yazıcılar',
                        icon: 'fas fa-print',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/inventory'
                    },
                    {
                        label: 'Ağ Cihazları',
                        icon: 'fas fa-network-wired',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/inventory'
                    }
                ]
            },
            {
                title: 'Şifre Sıfırlama Talepleri',
                description: 'Kullanıcı şifre sıfırlama taleplerini yönetin ve işleme alın.',
                icon: 'fas fa-key',
                iconColor: 'warning',
                link: '/it/password-resets'
            }
        ];

        // Filter cards based on user access
        const filteredCards = itCards.map(card => {
            // Check if user has access to the main card route
            if (!hasRouteAccess(card.link)) {
                return null; // Skip this card entirely
            }
            
            // Filter features within the card
            const filteredFeatures = card.features ? card.features.filter(feature => 
                hasRouteAccess(feature.link)
            ) : [];
            
            return {
                ...card,
                features: filteredFeatures
            };
        }).filter(card => card !== null); // Remove null cards

        // Initialize menu component with filtered cards
        const menuComponent = new MenuComponent('menu-container', {
            title: 'Bilgi İşlem Departmanı',
            subtitle: 'IT sistemlerini yönetin, teknik destek sağlayın ve güvenlik süreçlerini takip edin',
            cards: filteredCards
        });

        // Render the menu
        menuComponent.render();

    } catch (error) {
        console.error('Error handling IT page:', error);
    }
}
