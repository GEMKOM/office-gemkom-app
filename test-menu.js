import { guardRoute } from './authService.js';
import { initNavbar } from './components/navbar.js';
import { MenuComponent } from './components/menu/menu.js';

let menuComponent;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize menu component
    menuComponent = new MenuComponent('menu-container');
    
    // Show procurement menu by default
    testProcurementMenu();
});

// Test Procurement Menu (exact copy of current procurement page)
window.testProcurementMenu = () => {
    menuComponent.update({
        title: 'Satın Alma Modülü',
        subtitle: 'Tedarik süreçlerinizi yönetin ve optimize edin',
        cards: [
            {
                title: 'Tedarikçiler',
                description: 'Tedarikçi bilgileri, performans takibi ve tedarikçi değerlendirme yönetimi.',
                icon: 'fas fa-handshake',
                iconColor: 'primary',
                link: '/procurement/suppliers'
            },
            {
                title: 'Satın Alma Talepleri',
                description: 'Satın alma taleplerinin oluşturulması, onay süreçleri ve takip yönetimi.',
                icon: 'fas fa-shopping-cart',
                iconColor: 'success',
                link: '/procurement/purchase-requests',
                features: [
                    {
                        label: 'Talep Oluştur',
                        icon: 'fas fa-plus',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/procurement/purchase-requests/create'
                    },
                    {
                        label: 'Bekleyen Talepler',
                        icon: 'fas fa-clock',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/procurement/purchase-requests/pending'
                    },
                    {
                        label: 'Onaylanan Talepler',
                        icon: 'fas fa-check-circle',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/procurement/purchase-requests/approved'
                    }
                ]
            },
            {
                title: 'Malzemeler',
                description: 'Malzeme kataloğu, stok takibi ve malzeme bilgileri yönetimi.',
                icon: 'fas fa-boxes',
                iconColor: 'warning',
                link: '/procurement/items',
                features: [
                    {
                        label: 'Malzeme Kataloğu',
                        icon: 'fas fa-book',
                        link: '/procurement/items/catalog'
                    },
                    {
                        label: 'Stok Takibi',
                        icon: 'fas fa-warehouse',
                        link: '/procurement/items/inventory'
                    },
                    {
                        label: 'Teknik Özellikler',
                        icon: 'fas fa-info-circle',
                        link: '/procurement/items/specifications'
                    }
                ]
            },
            {
                title: 'Raporlar',
                description: 'Satın alma raporları, analizler ve performans metrikleri.',
                icon: 'fas fa-chart-bar',
                iconColor: 'info',
                link: '/procurement/reports',
                features: [
                    {
                        label: 'Satın Alma Analizi',
                        icon: 'fas fa-chart-line',
                        link: '/procurement/reports/purchase-analysis'
                    },
                    {
                        label: 'Tedarikçi Performansı',
                        icon: 'fas fa-chart-pie',
                        link: '/procurement/reports/supplier-performance'
                    },
                    {
                        label: 'Maliyet Analizi',
                        icon: 'fas fa-dollar-sign',
                        link: '/procurement/reports/cost-analysis'
                    }
                ]
            }
        ]
    });
};

// Test Manufacturing Menu
window.testManufacturingMenu = () => {
    menuComponent.update({
        title: 'İmalat Modülü',
        subtitle: 'İmalat süreçlerinizi yönetin ve optimize edin',
        cards: [
            {
                title: 'Talaşlı İmalat',
                description: 'CNC işlemleri, torna, freze ve diğer talaşlı imalat süreçleri yönetimi.',
                icon: 'fas fa-cog',
                iconColor: 'success',
                link: '/manufacturing/machining',
                features: [
                    {
                        label: 'Dashboard',
                        icon: 'fas fa-chart-line',
                        link: '/manufacturing/machining/dashboard'
                    },
                    {
                        label: 'Görevler',
                        icon: 'fas fa-tasks',
                        link: '/manufacturing/machining/tasks'
                    },
                    {
                        label: 'Raporlar',
                        icon: 'fas fa-chart-pie',
                        link: '/manufacturing/machining/reports'
                    },
                    {
                        label: 'Kapasite Yönetimi',
                        icon: 'fas fa-industry',
                        link: '/manufacturing/machining/capacity'
                    }
                ]
            },
            {
                title: 'Bakım',
                description: 'Ekipman bakım planları, arıza takibi ve önleyici bakım yönetimi.',
                icon: 'fas fa-wrench',
                iconColor: 'warning',
                link: '/manufacturing/maintenance',
                features: [
                    {
                        label: 'Bakım Planı',
                        icon: 'fas fa-calendar-check',
                        link: '/manufacturing/maintenance/plans'
                    },
                    {
                        label: 'Arıza Takibi',
                        icon: 'fas fa-exclamation-triangle',
                        link: '/manufacturing/maintenance/issues'
                    },
                    {
                        label: 'Önleyici Bakım',
                        icon: 'fas fa-shield-alt',
                        link: '/manufacturing/maintenance/preventive'
                    }
                ]
            }
        ]
    });
};

// Test Suppliers Menu
window.testSuppliersMenu = () => {
    menuComponent.update({
        title: 'Tedarikçiler',
        subtitle: 'Tedarikçi bilgileri ve ödeme koşulları yönetimi',
        cards: [
            {
                title: 'Tedarikçi Listesi',
                description: 'Tedarikçi bilgileri, performans takibi ve tedarikçi değerlendirme yönetimi.',
                icon: 'fas fa-list',
                iconColor: 'primary',
                link: '/procurement/suppliers/list',
                features: [
                    {
                        label: 'Tedarikçi Kayıtları',
                        icon: 'fas fa-building',
                        link: '/procurement/suppliers/list'
                    },
                    {
                        label: 'Performans Takibi',
                        icon: 'fas fa-chart-line',
                        link: '/procurement/suppliers/list'
                    },
                    {
                        label: 'Değerlendirme',
                        icon: 'fas fa-star',
                        link: '/procurement/suppliers/list'
                    }
                ]
            },
            {
                title: 'Ödeme Koşulları',
                description: 'Ödeme koşulları tanımlama, düzenleme ve tedarikçi bazında yönetimi.',
                icon: 'fas fa-credit-card',
                iconColor: 'success',
                link: '/procurement/suppliers/payment-terms',
                features: [
                    {
                        label: 'Koşul Tanımlama',
                        icon: 'fas fa-cog',
                        link: '/procurement/suppliers/payment-terms'
                    },
                    {
                        label: 'Düzenleme',
                        icon: 'fas fa-edit',
                        link: '/procurement/suppliers/payment-terms'
                    },
                    {
                        label: 'Tedarikçi Bağlantısı',
                        icon: 'fas fa-link',
                        link: '/procurement/suppliers/payment-terms'
                    }
                ]
            }
        ]
    });
};

// Test Finance Menu
window.testFinanceMenu = () => {
    menuComponent.update({
        title: 'Finans Modülü',
        subtitle: 'Finansal süreçlerinizi yönetin ve mali durumunuzu takip edin',
        cards: [
            {
                title: 'Satın Alma Siparişleri',
                description: 'Satın alma siparişlerini görüntüle, fatura oluştur ve finansal takip yap.',
                icon: 'fas fa-shopping-cart',
                iconColor: 'primary',
                link: '/finance/purchase-orders',
                features: [
                    {
                        label: 'Sipariş Listesi',
                        icon: 'fas fa-list',
                        link: '/finance/purchase-orders'
                    },
                    {
                        label: 'Fatura Oluştur',
                        icon: 'fas fa-file-invoice-dollar',
                        link: '/finance/purchase-orders'
                    },
                    {
                        label: 'Finansal Analiz',
                        icon: 'fas fa-chart-line',
                        link: '/finance/purchase-orders'
                    }
                ]
            },
            {
                title: 'Faturalar',
                description: 'Gelen ve giden faturaların yönetimi, onay süreçleri ve takip sistemi.',
                icon: 'fas fa-file-invoice-dollar',
                iconColor: 'success',
                link: '/finance/invoices',
                features: [
                    {
                        label: 'Gelen Faturalar',
                        icon: 'fas fa-download',
                        link: '/finance/invoices/incoming'
                    },
                    {
                        label: 'Giden Faturalar',
                        icon: 'fas fa-upload',
                        link: '/finance/invoices/outgoing'
                    },
                    {
                        label: 'Onay Süreçleri',
                        icon: 'fas fa-check-circle',
                        link: '/finance/invoices/approval'
                    }
                ]
            },
            {
                title: 'Ödemeler',
                description: 'Ödeme planları, nakit akışı yönetimi ve banka işlemleri takibi.',
                icon: 'fas fa-credit-card',
                iconColor: 'success',
                link: '/finance/payments',
                features: [
                    {
                        label: 'Ödeme Planları',
                        icon: 'fas fa-calendar-alt',
                        link: '/finance/payments/schedule'
                    },
                    {
                        label: 'Nakit Akışı',
                        icon: 'fas fa-chart-line',
                        link: '/finance/payments/cashflow'
                    },
                    {
                        label: 'Banka İşlemleri',
                        icon: 'fas fa-university',
                        link: '/finance/payments/banking'
                    }
                ]
            },
            {
                title: 'Bütçe',
                description: 'Bütçe planlaması, maliyet kontrolü ve bütçe performans analizi.',
                icon: 'fas fa-chart-pie',
                iconColor: 'warning',
                link: '/finance/budget',
                features: [
                    {
                        label: 'Bütçe Planlama',
                        icon: 'fas fa-tasks',
                        link: '/finance/budget/planning'
                    },
                    {
                        label: 'Bütçe Takibi',
                        icon: 'fas fa-eye',
                        link: '/finance/budget/tracking'
                    },
                    {
                        label: 'Performans Analizi',
                        icon: 'fas fa-chart-bar',
                        link: '/finance/budget/analysis'
                    }
                ]
            }
        ]
    });
};

// Test Custom Menu with different configurations
window.testCustomMenu = () => {
    menuComponent.update({
        title: 'Özel Test Menüsü',
        subtitle: 'Farklı sayıda kart ve özellikler ile test edin',
        cards: [
            {
                title: 'Tek Kart Test',
                description: 'Bu tek bir kart ile test edilmiştir.',
                icon: 'fas fa-star',
                iconColor: 'primary',
                link: '#',
                features: [
                    {
                        label: 'Özellik 1',
                        icon: 'fas fa-check',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '#'
                    },
                    {
                        label: 'Özellik 2',
                        icon: 'fas fa-heart',
                        iconColor: '#dc3545',
                        link: '#'
                    },
                    {
                        label: 'Özellik 3',
                        icon: 'fas fa-gem',
                        iconColor: '#007bff',
                        link: '#'
                    }
                ]
            }
        ]
    });
    
    // Add more cards after 2 seconds to demonstrate dynamic functionality
    setTimeout(() => {
        menuComponent.addCard({
            title: 'Dinamik Kart',
            description: 'Bu kart dinamik olarak eklenmiştir.',
            icon: 'fas fa-plus',
            iconColor: 'success',
            link: '#',
            features: [
                {
                    label: 'Dinamik Özellik',
                    icon: 'fas fa-bolt',
                    link: '#'
                }
            ]
        });
    }, 2000);

    // Add another card after 4 seconds
    setTimeout(() => {
        menuComponent.addCard({
            title: 'Üçüncü Kart',
            description: 'Bu üçüncü kart da dinamik olarak eklenmiştir.',
            icon: 'fas fa-heart',
            iconColor: 'danger',
            link: '#',
            features: [
                {
                    label: 'Sevgi Özelliği',
                    icon: 'fas fa-heart',
                    link: '#'
                },
                {
                    label: 'Başka Özellik',
                    icon: 'fas fa-gem',
                    link: '#'
                }
            ]
        });
    }, 4000);
};
