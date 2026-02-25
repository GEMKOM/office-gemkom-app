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
            },
            '/general/department-requests': {
                label: 'Departman Talepleri',
                icon: 'fas fa-boxes',
                children: {
                    '/general/department-requests/list': {
                        label: 'Tüm Talepler',
                        icon: 'fas fa-list',
                        children: {}
                    },
                    '/general/department-requests/pending': {
                        label: 'Bekleyen Talepler',
                        icon: 'fas fa-clock',
                        children: {}
                    }
                }
            }
        }
    },
    '/projects': {
        label: 'Projeler',
        icon: 'fas fa-project-diagram',
        children: {
            '/projects/project-tracking': {
                label: 'Proje Takibi',
                icon: 'fas fa-tasks',
                children: {}
            },
            '/projects/cost-table': {
                label: 'Maliyet Tablosu',
                icon: 'fas fa-calculator',
                children: {}
            }
        }
    },
    '/design': {
        label: 'Dizayn',
        icon: 'fas fa-drafting-compass',
        children: {
            '/design/projects': {
                label: 'Projeler',
                icon: 'fas fa-project-diagram',
                children: {}
            },
            '/design/revision-requests': {
                label: 'Revizyon Talepleri',
                icon: 'fas fa-edit',
                children: {}
            }
        }
    },
    '/planning': {
        label: 'Planlama',
        icon: 'fas fa-calendar-alt',
        children: {
            '/planning/department-requests': {
                label: 'Departman Talepleri',
                icon: 'fas fa-boxes',
                children: {}
            },
            '/planning/task-templates': {
                label: 'Görev Şablonları',
                icon: 'fas fa-tasks',
                children: {}
            },
            '/planning/inventory': {
                label: 'Stok',
                icon: 'fas fa-warehouse',
                children: {
                    '/planning/inventory/cards': {
                        label: 'Stok Kartları',
                        icon: 'fas fa-boxes',
                        children: {}
                    }
                }
            },
            '/planning/projects': {
                label: 'Projeler',
                icon: 'fas fa-project-diagram',
                children: {}
            },
            '/planning/procurement-lines': {
                label: 'Malzeme Maliyeti Satırları',
                icon: 'fas fa-shopping-cart',
                children: {}
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
                        children: {
                            '/manufacturing/machining/tasks/list': {
                                label: 'Görev Listesi',
                                icon: 'fas fa-list',
                                children: {}
                            },
                            '/manufacturing/machining/tasks/create': {
                                label: 'Görev Oluştur',
                                icon: 'fas fa-plus-circle',
                                children: {}
                            }
                        }
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
                            },
                            '/manufacturing/machining/reports/daily-report': {
                                label: 'Günlük Rapor',
                                icon: 'fas fa-calendar-day',
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
                    },
                    '/manufacturing/maintenance/reports': {
                        label: 'Raporlar',
                        icon: 'fas fa-chart-bar',
                        children: {
                            '/manufacturing/maintenance/reports/faults': {
                                label: 'Arızalar Özeti',
                                icon: 'fas fa-file-alt',
                                children: {}
                            },
                            '/manufacturing/maintenance/reports/user-resolution': {
                                label: 'Kullanıcı Çözüm Raporu',
                                icon: 'fas fa-user-check',
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
                    '/manufacturing/cnc-cutting/dashboard': {
                        label: 'Dashboard',
                        icon: 'fas fa-chart-line',
                        children: {}
                    },
                    '/manufacturing/cnc-cutting/cuts': {
                        label: 'Kesimler',
                        icon: 'fas fa-scissors',
                        children: {}
                    },
                    '/manufacturing/cnc-cutting/remnants': {
                        label: 'Fire Plakalar',
                        icon: 'fas fa-layer-group',
                        children: {}
                    },
                    '/manufacturing/cnc-cutting/reports': {
                        label: 'Raporlar',
                        icon: 'fas fa-chart-bar',
                        children: {
                            '/manufacturing/cnc-cutting/reports/finished-timers': {
                                label: 'Biten Zamanlayıcılar',
                                icon: 'fas fa-clock',
                                children: {}
                            }
                        }
                    },
                    '/manufacturing/cnc-cutting/capacity': {
                        label: 'Kapasite Yönetimi',
                        icon: 'fas fa-industry',
                        children: {
                            '/manufacturing/cnc-cutting/capacity/planning': {
                                label: 'Kapasite Planlayıcı',
                                icon: 'fas fa-calendar-alt',
                                children: {}
                            }
                        }
                    }
                }
            },
            '/manufacturing/welding': {
                label: 'Kaynak',
                icon: 'fas fa-fire',
                children: {
                    '/manufacturing/welding/time-entries': {
                        label: 'Zaman Kayıtları',
                        icon: 'fas fa-clock',
                        children: {}
                    },
                    '/manufacturing/welding/reports': {
                        label: 'Raporlar',
                        icon: 'fas fa-chart-bar',
                        children: {
                            '/manufacturing/welding/reports/user-work-hours': {
                                label: 'Çalışan Çalışma Saatleri',
                                icon: 'fas fa-user-clock',
                                children: {}
                            },
                            '/manufacturing/welding/reports/cost-analysis': {
                                label: 'Maliyet Analizi',
                                icon: 'fas fa-calculator',
                                children: {}
                            }
                        }
                    }
                }
            },
            '/manufacturing/reports': {
                label: 'Raporlar',
                icon: 'fas fa-chart-pie',
                children: {
                    '/manufacturing/reports/combined-job-costs': {
                        label: 'İş Maliyeti',
                        icon: 'fas fa-calculator',
                        children: {}
                    }
                }
            },
            '/manufacturing/projects': {
                label: 'Projeler',
                icon: 'fas fa-project-diagram',
                children: {}
            },
            '/manufacturing/subcontracting': {
                label: 'Taşeron',
                icon: 'fas fa-handshake',
                children: {
                    '/manufacturing/subcontracting/subcontractors': {
                        label: 'Taşeronlar',
                        icon: 'fas fa-building',
                        children: {}
                    },
                    '/manufacturing/subcontracting/statements': {
                        label: 'Hakedişler',
                        icon: 'fas fa-file-invoice-dollar',
                        children: {}
                    }
                }
            },
            '/manufacturing/material-tracking': {
                label: 'Malzeme Takibi',
                icon: 'fas fa-box',
                children: {}
            }


        }
    },
    '/logistics': {
        label: 'Lojistik',
        icon: 'fas fa-truck',
        children: {
            '/logistics/projects': {
                label: 'Projeler',
                icon: 'fas fa-project-diagram',
                children: {}
            }
        }
    },
    '/procurement': {
        label: 'Satın Alma',
        icon: 'fas fa-shopping-cart',
        children: {
            '/procurement/projects': {
                label: 'Projeler',
                icon: 'fas fa-project-diagram',
                children: {}
            },
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
    '/sales': {
        label: 'Satış',
        icon: 'fas fa-handshake',
        children: {
            '/sales/customers': {
                label: 'Müşteriler',
                icon: 'fas fa-users',
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
    },
    '/quality-control': {
        label: 'Kalite Kontrol',
        icon: 'fas fa-clipboard-check',
        children: {
            '/quality-control/qc-reviews': {
                label: 'KK İncelemeleri',
                icon: 'fas fa-search',
                children: {}
            },
            '/quality-control/ncrs': {
                label: 'Uygunsuzluk Raporları',
                icon: 'fas fa-exclamation-triangle',
                children: {}
            }
        }
    }
};