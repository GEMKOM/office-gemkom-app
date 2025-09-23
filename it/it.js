import { guardRoute } from '../authService.js';
import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';
import { initRouteProtection, withRouteProtection } from '../generic/routeProtection.js';
import { hasRouteAccess } from '../generic/accessControl.js';

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
                title: 'Sistem Yönetimi',
                description: 'Sunucu ve sistem altyapısını yönetin, performansı izleyin ve sistem durumunu takip edin.',
                icon: 'fas fa-server',
                iconColor: 'primary',
                link: '/it/systems',
                features: [
                    {
                        label: 'Sunucu Durumu',
                        icon: 'fas fa-server',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/systems'
                    },
                    {
                        label: 'Sistem Performansı',
                        icon: 'fas fa-chart-line',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/systems'
                    },
                    {
                        label: 'Yedekleme Durumu',
                        icon: 'fas fa-database',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/systems'
                    }
                ]
            },
            {
                title: 'Teknik Destek',
                description: 'Kullanıcı destek taleplerini yönetin, teknik sorunları çözün ve destek süreçlerini takip edin.',
                icon: 'fas fa-headset',
                iconColor: 'success',
                link: '/it/support',
                features: [
                    {
                        label: 'Destek Talepleri',
                        icon: 'fas fa-ticket-alt',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/support'
                    },
                    {
                        label: 'Kullanıcı Yardımı',
                        icon: 'fas fa-user-cog',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/support'
                    },
                    {
                        label: 'Teknik Dokümantasyon',
                        icon: 'fas fa-book',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/support'
                    }
                ]
            },
            {
                title: 'Güvenlik',
                description: 'Sistem güvenliğini yönetin, güvenlik olaylarını izleyin ve güvenlik politikalarını uygulayın.',
                icon: 'fas fa-shield-alt',
                iconColor: 'warning',
                link: '/it/security',
                features: [
                    {
                        label: 'Güvenlik Olayları',
                        icon: 'fas fa-exclamation-triangle',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/security'
                    },
                    {
                        label: 'Erişim Kontrolü',
                        icon: 'fas fa-key',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/security'
                    },
                    {
                        label: 'Güvenlik Raporları',
                        icon: 'fas fa-shield-alt',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/security'
                    }
                ]
            },
            {
                title: 'Raporlar',
                description: 'IT departmanı performans raporlarını görüntüleyin ve sistem istatistiklerini analiz edin.',
                icon: 'fas fa-chart-bar',
                iconColor: 'info',
                link: '/it/reports',
                features: [
                    {
                        label: 'Sistem Raporları',
                        icon: 'fas fa-chart-pie',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/reports'
                    },
                    {
                        label: 'Performans Analizi',
                        icon: 'fas fa-chart-line',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/reports'
                    },
                    {
                        label: 'Kullanım İstatistikleri',
                        icon: 'fas fa-users',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/it/reports'
                    }
                ]
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
