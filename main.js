import { guardRoute, isAdmin, getUser, navigateByTeamIfFreshLogin } from './authService.js';
import { initNavbar } from './components/navbar.js';
import { MenuComponent } from './components/menu/menu.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();

    // Handle landing page specific logic
    if (window.location.pathname === '/') {
        await handleLandingPage();
    }
});

async function handleLandingPage() {
    try {
        const user = JSON.parse(localStorage.getItem('user'));

        // Initialize menu component
        const menuComponent = new MenuComponent('menu-container', {
            title: 'Çalışma Alanları',
            subtitle: 'Takımınıza göre ilgili alanı seçin ve verimliliğinizi artırın',
            cards: [
                {
                    title: 'Genel',
                    description: 'Çalışanlar, makineler ve mesai yönetimi ile genel iş süreçlerini yönetin.',
                    icon: 'fas fa-cogs',
                    iconColor: 'secondary',
                    link: '/general',
                    features: [
                        {
                            label: 'Çalışanlar',
                            icon: 'fas fa-users',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/general/users'
                        },
                        {
                            label: 'Makineler',
                            icon: 'fas fa-cogs',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/general/machines'
                        },
                        {
                            label: 'Mesailer',
                            icon: 'fas fa-clock',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/general/overtime'
                        }
                    ]
                },
                {
                    title: 'İmalat',
                    description: 'Üretim süreçlerini yönetin, üretim planlarını takip edin ve kalite standartlarını izleyin.',
                    icon: 'fas fa-industry',
                    iconColor: 'danger',
                    link: '/manufacturing',
                    features: [
                        {
                            label: 'Talaşlı İmalat',
                            icon: 'fas fa-cog',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/manufacturing/machining'
                        },
                        {
                            label: 'Bakım',
                            icon: 'fas fa-wrench',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/manufacturing/maintenance'
                        }
                    ]
                },
                {
                    title: 'Satın Alma',
                    description: 'Tedarikçi yönetimi, sipariş takibi ve satın alma süreçlerini yönetin.',
                    icon: 'fas fa-shopping-cart',
                    iconColor: 'success',
                    link: '/procurement',
                    features: [
                        {
                            label: 'Tedarikçi',
                            icon: 'fas fa-truck',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/procurement/suppliers'
                        },
                        {
                            label: 'Sipariş',
                            icon: 'fas fa-file-invoice',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/procurement/purchase-requests'
                        },
                        {
                            label: 'Fiyat Analizi',
                            icon: 'fas fa-balance-scale',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/procurement/reports'
                        }
                    ]
                },
                {
                    title: 'Finans',
                    description: 'Finansal süreçleri yönetin, mali durumu takip edin ve finansal raporlar oluşturun.',
                    icon: 'fas fa-dollar-sign',
                    iconColor: 'primary',
                    link: '/finance',
                    features: [
                        {
                            label: 'Satın Alma Siparişleri',
                            icon: 'fas fa-shopping-cart',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/finance/purchase-orders'
                        }
                    ]
                }
            ]
        });

        // Render the menu
        menuComponent.render();

        // Highlight user's team module (if needed)
        if (user.team) {
            // This can be implemented later if needed for team highlighting
        }

        // Only redirect on fresh logins, not manual navigation
        if (user.team && !isAdmin()) {
            navigateByTeamIfFreshLogin();
        }

    } catch (error) {
        console.error('Error handling landing page:', error);
    }
}