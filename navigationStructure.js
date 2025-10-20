export const NAVIGATION_STRUCTURE = {
    '/': {
        label: 'Ana Sayfa',
        icon: 'fas fa-home',
        children: {}
    },
    '/general': {
        label: 'Genel',
        icon: 'fas fa-cogs',
        children: {
            '/general/users': {
                label: 'Çalışanlar',
                icon: 'fas fa-users',
                children: {}
            },
            '/general/machines': {
                label: 'Makineler',
                icon: 'fas fa-cogs',
                children: {}
            },
            '/general/overtime': {
                label: 'Mesailer',
                icon: 'fas fa-clock',
                children: {
                    '/general/overtime/pending': {
                        label: 'Bekleyen Talepler',
                        icon: 'fas fa-clock',
                        children: {}
                    },
                    '/general/overtime/registry': {
                        label: 'Kayıt Defteri',
                        icon: 'fas fa-archive',
                        children: {}
                    },
                    '/general/overtime/users': {
                        label: 'Mesai Kullanıcıları',
                        icon: 'fas fa-users',
                        children: {}
                    }
                }
            }
        }
    },
    '/manufacturing': {
        label: 'İmalat',
        icon: 'fas fa-industry',
        children: {
            '/manufacturing/machining': {
                label: 'Talaşlı İmalat',
                icon: 'fas fa-cog',
                children: {
                    '/manufacturing/machining/dashboard': {
                        label: 'Dashboard',
                        icon: 'fas fa-chart-line',
                        children: {}
                    },
                                         '/manufacturing/machining/tasks': {
                         label: 'Görevler',
                         icon: 'fas fa-tasks',
                         children: {}
                     },
                    '/manufacturing/machining/reports': {
                        label: 'Raporlar',
                        icon: 'fas fa-chart-pie',
                        children: {
                            '/manufacturing/machining/reports/finished-timers': {
                                label: 'Biten Zamanlayıcılar',
                                icon: 'fas fa-clock',
                                children: {}
                            },
                            '/manufacturing/machining/reports/sum-report': {
                                label: 'Toplam Raporu',
                                icon: 'fas fa-chart-pie',
                                children: {}
                            },
                            '/manufacturing/machining/reports/cost-analysis': {
                                label: 'Maliyet Analizi',
                                icon: 'fas fa-calculator',
                                children: {}
                            },
                            '/manufacturing/machining/reports/history': {
                                label: 'Makine Çalışma Geçmişi',
                                icon: 'fas fa-history',
                                children: {}
                            },
                            '/manufacturing/machining/reports/production-plan': {
                                label: 'Üretim Planı',
                                icon: 'fas fa-calendar-alt',
                                children: {}
                            }
                        }
                    },
                    '/manufacturing/machining/capacity': {
                        label: 'Kapasite Yönetimi',
                        icon: 'fas fa-industry',
                        children: {
                            '/manufacturing/machining/capacity/planning': {
                                label: 'Kapasite Planlayıcı',
                                icon: 'fas fa-calendar-alt',
                                children: {}
                            }
                        }
                    }
                }
            },
            '/manufacturing/maintenance': {
                label: 'Bakım',
                icon: 'fas fa-wrench',
                children: {
                    '/manufacturing/maintenance/fault-requests': {
                        label: 'Arıza Talepleri',
                        icon: 'fas fa-exclamation-triangle',
                        children: {
                            '/manufacturing/maintenance/fault-requests/list': {
                                label: 'Arıza Listesi',
                                icon: 'fas fa-list',
                                children: {}
                            },
                            '/manufacturing/maintenance/fault-requests/statistics': {
                                label: 'Arıza İstatistikleri',
                                icon: 'fas fa-chart-bar',
                                children: {}
                            }
                        }
                    }
                }
            },
            '/manufacturing/cnc-cutting': {
                label: 'CNC Kesim',
                icon: 'fas fa-cut',
                children: {
                    '/manufacturing/cnc-cutting/cuts': {
                        label: 'Kesimler',
                        icon: 'fas fa-scissors',
                        children: {}
                    }
                }
            },


        }
    },
    '/procurement': {
        label: 'Satın Alma',
        icon: 'fas fa-shopping-cart',
        children: {
            '/procurement/suppliers': {
                label: 'Tedarikçiler',
                icon: 'fas fa-handshake',
                children: {
                    '/procurement/suppliers/list': {
                        label: 'Tedarikçi Listesi',
                        icon: 'fas fa-list',
                        children: {}
                    },
                    '/procurement/suppliers/payment-terms': {
                        label: 'Ödeme Koşulları',
                        icon: 'fas fa-credit-card',
                        children: {}
                    }
                }
            },
            '/procurement/purchase-requests': {
                label: 'Satın Alma Talepleri',
                icon: 'fas fa-shopping-cart',
                children: {
                    '/procurement/purchase-requests/create': {
                        label: 'Talep Oluştur',
                        icon: 'fas fa-plus',
                        children: {}
                    },
                    '/procurement/purchase-requests/pending': {
                        label: 'Bekleyen Talepler',
                        icon: 'fas fa-clock',
                        children: {}
                    },
                    '/procurement/purchase-requests/registry': {
                        label: 'Kayıt Defteri',
                        icon: 'fas fa-archive',
                        children: {}
                    }
                }
            },
            '/procurement/items': {
                label: 'Malzemeler',
                icon: 'fas fa-boxes',
                children: {
                    '/procurement/items/catalog': {
                        label: 'Malzeme Kataloğu',
                        icon: 'fas fa-book',
                        children: {}
                    },
                    '/procurement/items/inventory': {
                        label: 'Stok Takibi',
                        icon: 'fas fa-warehouse',
                        children: {}
                    },
                    '/procurement/items/specifications': {
                        label: 'Teknik Özellikler',
                        icon: 'fas fa-info-circle',
                        children: {}
                    }
                }
            },
            '/procurement/reports': {
                label: 'Raporlar',
                icon: 'fas fa-chart-bar',
                children: {
                    '/procurement/reports/items': {
                        label: 'Ürün Raporu',
                        icon: 'fas fa-chart-bar',
                        children: {}
                    },
                    '/procurement/reports/suppliers': {
                        label: 'Tedarikçi Raporu',
                        icon: 'fas fa-chart-pie',
                        children: {}
                    },
                    '/procurement/reports/staff': {
                        label: 'Personel Raporu',
                        icon: 'fas fa-users',
                        children: {}
                    }
                }
            }
        }
    },

    '/finance': {
        label: 'Finans',
        icon: 'fas fa-dollar-sign',
        children: {
            '/finance/purchase-orders': {
                label: 'Satın Alma Siparişleri',
                icon: 'fas fa-shopping-cart',
                children: {}
            },
            '/finance/reports': {
                label: 'Raporlar',
                icon: 'fas fa-chart-bar',
                children: {
                    '/finance/reports/executive-overview': {
                        label: 'Yönetici Özeti',
                        icon: 'fas fa-chart-pie',
                        children: {}
                    },
                    '/finance/reports/projects': {
                        label: 'Proje Raporu',
                        icon: 'fas fa-chart-line',
                        children: {}
                    }
                }
            }
        }
    },
    '/it': {
        label: 'Bilgi İşlem',
        icon: 'fas fa-laptop-code',
        children: {
            '/it/inventory': {
                label: 'Envanter',
                icon: 'fas fa-desktop',
                children: {}
            },
            '/it/password-resets': {
                label: 'Şifre Sıfırlama Talepleri',
                icon: 'fas fa-desktop',
                children: {}

            }
        }
    },
    '/human_resources': {
        label: 'İnsan Kaynakları',
        icon: 'fas fa-users-cog',
        children: {
            '/human_resources/wages': {
                label: 'Maaşlar',
                icon: 'fas fa-money-bill-wave',
                children: {}
            }
        }
    },
    '/management': {
        label: 'Yönetim',
        icon: 'fas fa-chart-line',
        children: {
            '/management/dashboard': {
                label: 'Dashboard',
                icon: 'fas fa-tachometer-alt',
                children: {}
            },
            '/management/reports': {
                label: 'Raporlar',
                icon: 'fas fa-chart-bar',
                children: {}
            },
            '/management/analytics': {
                label: 'Analitik',
                icon: 'fas fa-chart-pie',
                children: {}
            }
        }
    }
};