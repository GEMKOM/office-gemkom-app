import { guardRoute, isAdmin, getUser, navigateByTeamIfFreshLogin } from './authService.js';
import { initNavbar } from './components/navbar.js';
import { MenuComponent } from './components/menu/menu.js';
import { initRouteProtection, withRouteProtection } from './apis/routeProtection.js';
import { hasRouteAccess } from './apis/accessControl.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
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

        // Filter menu cards based on user access
        const allCards = [
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
                        },
                        {
                            label: 'Departman Talepleri',
                            icon: 'fas fa-boxes',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/general/department-requests'
                        }
                    ]
                },
                {
                    title: 'Projeler',
                    description: 'Proje takibi ve yönetim işlemlerinizi gerçekleştirin.',
                    icon: 'fas fa-project-diagram',
                    iconColor: 'primary',
                    link: '/projects',
                    features: [
                        {
                            label: 'Proje Takibi',
                            icon: 'fas fa-tasks',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/projects/project-tracking'
                        }
                    ]
                },
                {
                    title: 'Dizayn',
                    description: 'Dizayn süreçlerinizi yönetin ve optimize edin.',
                    icon: 'fas fa-drafting-compass',
                    iconColor: 'dark',
                    link: '/design',
                    features: [
                        {
                            label: 'Projeler',
                            icon: 'fas fa-project-diagram',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/design/projects'
                        }
                    ]
                },
                {
                    title: 'Planlama',
                    description: 'Planlama süreçlerini yönetin, stok takibi yapın ve görev şablonlarını oluşturun.',
                    icon: 'fas fa-calendar-alt',
                    iconColor: 'info',
                    link: '/planning',
                    features: [
                        {
                            label: 'Departman Talepleri',
                            icon: 'fas fa-boxes',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/planning/department-requests'
                        },
                        {
                            label: 'Görev Şablonları',
                            icon: 'fas fa-tasks',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/planning/task-templates'
                        },
                        {
                            label: 'Stok',
                            icon: 'fas fa-warehouse',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/planning/inventory'
                        },
                        {
                            label: 'Projeler',
                            icon: 'fas fa-project-diagram',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/planning/projects'
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
                            label: 'CNC Kesim',
                            icon: 'fas fa-cut',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/manufacturing/cnc-cutting'
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
                    title: 'Lojistik',
                    description: 'Lojistik süreçlerini yönetin, sevkiyat takibi yapın ve depo yönetimini optimize edin.',
                    icon: 'fas fa-truck',
                    iconColor: 'warning',
                    link: '/logistics',
                    features: [
                        {
                            label: 'Projeler',
                            icon: 'fas fa-project-diagram',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/logistics/projects'
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
                            label: 'Raporlar',
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
                },
                {
                    title: 'Bilgi İşlem',
                    description: 'IT cihazlarını yönetin, envanter takibi yapın ve donanım durumunu izleyin.',
                    icon: 'fas fa-laptop-code',
                    iconColor: 'dark',
                    link: '/it',
                    features: [
                        {
                            label: 'Envanter',
                            icon: 'fas fa-desktop',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/it/inventory'
                        }
                    ]
                },
                {
                    title: 'İnsan Kaynakları',
                    description: 'Çalışan yönetimi, maaş süreçleri ve insan kaynakları işlemlerini yönetin.',
                    icon: 'fas fa-users-cog',
                    iconColor: 'info',
                    link: '/human_resources',
                    features: [
                        {
                            label: 'Maaşlar',
                            icon: 'fas fa-money-bill-wave',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/human_resources/wages'
                        }
                    ]
                },
                {
                    title: 'Satış',
                    description: 'Müşteri yönetimi ve satış işlemlerini gerçekleştirin.',
                    icon: 'fas fa-handshake',
                    iconColor: 'success',
                    link: '/sales',
                    features: [
                        {
                            label: 'Müşteriler',
                            icon: 'fas fa-users',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/sales/customers'
                        }
                    ]
                },
                {
                    title: 'Yönetim',
                    description: 'Şirket yönetimi ve analitik işlemlerinizi gerçekleştirin.',
                    icon: 'fas fa-chart-line',
                    iconColor: 'warning',
                    link: '/management',
                    features: [
                        {
                            label: 'Dashboard',
                            icon: 'fas fa-tachometer-alt',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/management/dashboard'
                        },
                        {
                            label: 'Raporlar',
                            icon: 'fas fa-chart-bar',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/management/reports'
                        },
                        {
                            label: 'Analitik',
                            icon: 'fas fa-chart-pie',
                            iconColor: 'rgba(139, 0, 0, 1)',
                            link: '/management/analytics'
                        }
                    ]
                }
            ];

        // Filter cards and their features based on user access
        const filteredCards = allCards.map(card => {
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
            title: 'Çalışma Alanları',
            subtitle: 'Takımınıza göre ilgili alanı seçin ve verimliliğinizi artırın',
            cards: filteredCards
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