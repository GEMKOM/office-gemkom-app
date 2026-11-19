// The menu tree: every section and page with its label and Font Awesome icon.
// The rail, the hubs and the search are built from it, filtered by
// filterNavigationByAccess (auth/accessControl.ts). Keys are routes.

export interface NavItem {
  label: string;
  /** Font Awesome classes, e.g. "fas fa-home". */
  icon: string;
  children: NavTree;
}
export type NavTree = Record<string, NavItem>;

export const NAVIGATION_STRUCTURE: NavTree = {
  '/': {
    label: 'Ana Sayfa',
    icon: 'fas fa-home',
    children: {},
  },
  // Open to everyone (ALWAYS_ALLOWED_ROUTES); a click on the rail opens the quiz.
  '/quiz': {
    label: 'Günün Quizi',
    icon: 'fas fa-trophy',
    children: {
      '/quiz/leaderboard': {
        label: 'Sıralama',
        icon: 'fas fa-ranking-star',
        children: {},
      },
      '/quiz/review': {
        label: 'Dünün Cevapları',
        icon: 'fas fa-list-check',
        children: {},
      },
      // manage_quiz holders only (ROUTE_EXTRA_CODENAMES).
      '/quiz/manage': {
        label: 'Quiz Onayı',
        icon: 'fas fa-clipboard-check',
        children: {},
      },
    },
  },
  '/reports': {
    label: 'Raporlar',
    icon: 'fas fa-chart-pie',
    children: {},
  },
  // Talepler (was Genel, reorganised 2026-11-19): the requests that cross
  // departments. Makineler moved to Depo, Mesailer to İnsan Kaynakları, İSG got
  // its own section; personal leave / overtime requests and approvals are in
  // the user menu (shell/UserMenu.tsx).
  '/general': {
    label: 'Talepler',
    icon: 'fas fa-inbox',
    children: {
      '/general/department-requests': {
        label: 'Departman Talepleri',
        icon: 'fas fa-boxes',
        children: {
          '/general/department-requests/list': {
            label: 'Tüm Talepler',
            icon: 'fas fa-list',
            children: {},
          },
          '/general/department-requests/pending': {
            label: 'Bekleyen Talepler',
            icon: 'fas fa-clock',
            children: {},
          },
        },
      },
      '/general/crane-requests': {
        label: 'Vinç Talepleri',
        icon: 'fas fa-truck-pickup',
        children: {
          '/general/crane-requests/list': {
            label: 'Tüm Talepler',
            icon: 'fas fa-list',
            children: {},
          },
          '/general/crane-requests/pending': {
            label: 'Bekleyen Talepler',
            icon: 'fas fa-clock',
            children: {},
          },
          '/general/crane-requests/prices': {
            label: 'Fiyat Listesi',
            icon: 'fas fa-tags',
            children: {},
          },
        },
      },
      // Fason: imalat, depo, planlama and satınalma all follow it (accessControl).
      '/general/fason': {
        label: 'Fason',
        icon: 'fas fa-people-carry',
        children: {},
      },
    },
  },
  // İSG: its own section. The page is open to everyone (ALWAYS_ALLOWED_ROUTES
  // in auth/accessControl.ts), so the section shows for everyone too.
  '/isg': {
    label: 'İSG',
    icon: 'fas fa-helmet-safety',
    children: {
      '/isg/issues': {
        label: 'İSG Bildirimleri',
        icon: 'fas fa-helmet-safety',
        children: {},
      },
    },
  },
  '/projects': {
    label: 'Projeler',
    icon: 'fas fa-project-diagram',
    children: {
      '/projects/project-tracking': {
        label: 'Proje Takibi',
        icon: 'fas fa-tasks',
        children: {},
      },
      // Tahmin raporları (estimator app); a sub-entry, so the navbar's
      // 7-section limit is untouched. Page permission: users/0066.
      '/projects/estimates': {
        label: 'Tahminler',
        icon: 'fas fa-calculator',
        children: {},
      },
      // Tahmin referansları (reference profiles, review, unit times).
      // Page permission: users/0067.
      '/projects/references': {
        label: 'Referanslar',
        icon: 'fas fa-book-open',
        children: {},
      },
    },
  },
  '/design': {
    label: 'Dizayn',
    icon: 'fas fa-drafting-compass',
    children: {
      '/design/projects': {
        label: 'Projeler',
        icon: 'fas fa-project-diagram',
        children: {},
      },
      '/design/revision-requests': {
        label: 'Revizyon Talepleri',
        icon: 'fas fa-edit',
        children: {},
      },
      '/design/release-approvals': {
        label: 'Çizim İncelemesi',
        icon: 'fas fa-search',
        children: {},
      },
    },
  },
  '/planning': {
    label: 'Planlama',
    icon: 'fas fa-calendar-alt',
    children: {
      '/planning/department-requests': {
        label: 'Departman Talepleri',
        icon: 'fas fa-boxes',
        children: {},
      },
      '/planning/items': {
        label: 'Planlama Kalemleri',
        icon: 'fas fa-list',
        children: {},
      },
      '/planning/procurement-lines': {
        label: 'Malzeme Maliyeti Satırları',
        icon: 'fas fa-shopping-cart',
        children: {},
      },
      '/planning/projects': {
        label: 'Projeler',
        icon: 'fas fa-project-diagram',
        // The Projeler page is a row of its own: a parent is only a heading.
        children: {
          '/planning/projects': {
            label: 'Görevler',
            icon: 'fas fa-list-check',
            children: {},
          },
          '/planning/project-planning': {
            label: 'Proje Planlama',
            icon: 'fas fa-calendar-alt',
            children: {},
          },
          '/planning/task-templates': {
            label: 'Görev Şablonları',
            icon: 'fas fa-tasks',
            children: {},
          },
        },
      },
      '/planning/cnc-cutting': {
        label: 'CNC Kesim',
        icon: 'fas fa-cut',
        children: {
          '/planning/cnc-cutting/dashboard': {
            label: 'Dashboard',
            icon: 'fas fa-chart-line',
            children: {},
          },
          '/planning/cnc-cutting/cuts': {
            label: 'Kesimler',
            icon: 'fas fa-scissors',
            children: {},
          },
          '/planning/cnc-cutting/reports': {
            label: 'Raporlar',
            icon: 'fas fa-chart-bar',
            children: {
              '/planning/cnc-cutting/reports/parts-search': {
                label: 'Parça Arama',
                icon: 'fas fa-search',
                children: {},
              },
            },
          },
          '/planning/cnc-cutting/capacity': {
            label: 'Kapasite Planlayıcı',
            icon: 'fas fa-calendar-alt',
            children: {},
          },
          // The Depo's Sac Stoğu page, under its own planning URL.
          '/planning/cnc-cutting/plate-stock': {
            label: 'Sac Stoğu',
            icon: 'fas fa-layer-group',
            children: {},
          },
        },
      },
      '/planning/linear-cutting': {
        label: 'Lineer Kesim',
        icon: 'fas fa-ruler-horizontal',
        children: {
          '/planning/linear-cutting/dashboard': {
            label: 'Dashboard',
            icon: 'fas fa-chart-line',
            children: {},
          },
          '/planning/linear-cutting/cuts': {
            label: 'Kesimler',
            icon: 'fas fa-ruler-horizontal',
            children: {},
          },
          '/planning/linear-cutting/tasks': {
            label: 'Görevler',
            icon: 'fas fa-tasks',
            children: {},
          },
          '/planning/linear-cutting/capacity': {
            label: 'Kapasite Planlayıcı',
            icon: 'fas fa-calendar-alt',
            children: {},
          },
          // The Depo's Boy Stoğu page, under its own planning URL.
          '/planning/linear-cutting/bar-stock': {
            label: 'Boy Stoğu',
            icon: 'fas fa-ruler-horizontal',
            children: {},
          },
        },
      },
    },
  },
  '/quality-control': {
    label: 'Kalite Kontrol',
    icon: 'fas fa-clipboard-check',
    children: {
      '/quality-control/qc-reviews': {
        label: 'KK İncelemeleri',
        icon: 'fas fa-search',
        children: {},
      },
      '/quality-control/ncrs': {
        label: 'Uygunsuzluk Raporları',
        icon: 'fas fa-exclamation-triangle',
        children: {},
      },
      '/quality-control/cost-lines': {
        label: 'Maliyet Satırları',
        icon: 'fas fa-euro-sign',
        children: {},
      },
      '/quality-control/documents': {
        label: 'Kalite Evrakları',
        icon: 'fas fa-file-alt',
        children: {},
      },
    },
  },
  '/manufacturing': {
    label: 'İmalat',
    icon: 'fas fa-industry',
    children: {
      '/manufacturing/projects': {
        label: 'Projeler',
        icon: 'fas fa-project-diagram',
        children: {},
      },
      '/manufacturing/welding': {
        label: 'Kaynaklı İmalat',
        icon: 'fas fa-fire',
        children: {
          '/manufacturing/welding/time-entries': {
            label: 'Zaman Kayıtları',
            icon: 'fas fa-clock',
            children: {},
          },
          '/manufacturing/welding/timesheets': {
            label: 'Puantaj Onayı',
            icon: 'fas fa-clipboard-check',
            children: {},
          },
          '/manufacturing/welding/teams': {
            label: 'Ekipler',
            icon: 'fas fa-users',
            children: {},
          },
          '/manufacturing/welding/reports': {
            label: 'Raporlar',
            icon: 'fas fa-chart-bar',
            children: {
              '/manufacturing/welding/reports/user-work-hours': {
                label: 'Çalışan Çalışma Saatleri',
                icon: 'fas fa-user-clock',
                children: {},
              },
            },
          },
        },
      },
      '/manufacturing/machining': {
        label: 'Talaşlı İmalat',
        icon: 'fas fa-cog',
        children: {
          '/manufacturing/machining/dashboard': {
            label: 'Dashboard',
            icon: 'fas fa-chart-line',
            children: {},
          },
          '/manufacturing/machining/tasks': {
            label: 'Görevler',
            icon: 'fas fa-tasks',
            children: {
              '/manufacturing/machining/tasks/list': {
                label: 'Görev Listesi',
                icon: 'fas fa-list',
                children: {},
              },
              '/manufacturing/machining/tasks/create': {
                label: 'Görev Oluştur',
                icon: 'fas fa-plus-circle',
                children: {},
              },
            },
          },
          '/manufacturing/machining/reports': {
            label: 'Raporlar',
            icon: 'fas fa-chart-pie',
            children: {
              '/manufacturing/machining/reports/daily-efficiency': {
                label: 'Günlük Verimlilik',
                icon: 'fas fa-chart-line',
                children: {},
              },
              '/manufacturing/machining/reports/performance': {
                label: 'Performans Raporu',
                icon: 'fas fa-tachometer-alt',
                children: {},
              },
              '/manufacturing/machining/reports/sum-report': {
                label: 'Toplam Raporu',
                icon: 'fas fa-chart-pie',
                children: {},
              },
              '/manufacturing/machining/reports/history': {
                label: 'Makine Çalışma Geçmişi',
                icon: 'fas fa-history',
                children: {},
              },
              '/manufacturing/machining/reports/production-plan': {
                label: 'Üretim Planı',
                icon: 'fas fa-calendar-alt',
                children: {},
              },
            },
          },
          '/manufacturing/machining/capacity/planning': {
            label: 'Kapasite Planlayıcı',
            icon: 'fas fa-calendar-alt',
            children: {},
          },
        },
      },
      '/manufacturing/maintenance': {
        label: 'Bakım',
        icon: 'fas fa-wrench',
        children: {
          '/manufacturing/maintenance/dashboard': {
            label: 'Dashboard',
            icon: 'fas fa-chart-line',
            children: {},
          },
          '/manufacturing/maintenance/fault-requests': {
            label: 'Arıza Talepleri',
            icon: 'fas fa-exclamation-triangle',
            children: {
              '/manufacturing/maintenance/fault-requests/list': {
                label: 'Arıza Listesi',
                icon: 'fas fa-list',
                children: {},
              },
            },
          },
          '/manufacturing/maintenance/reports': {
            label: 'Raporlar',
            icon: 'fas fa-chart-bar',
            children: {
              '/manufacturing/maintenance/reports/faults': {
                label: 'Arızalar Özeti',
                icon: 'fas fa-file-alt',
                children: {},
              },
              '/manufacturing/maintenance/reports/staff-report': {
                label: 'Personel Faaliyet Raporu',
                icon: 'fas fa-users-cog',
                children: {},
              },
              '/manufacturing/maintenance/reports/monthly-metrics': {
                label: 'Aylık Metrikler',
                icon: 'fas fa-chart-bar',
                children: {},
              },
            },
          },
        },
      },
      '/manufacturing/reports': {
        label: 'Raporlar',
        icon: 'fas fa-chart-pie',
        children: {
          '/manufacturing/reports/job-costs': {
            label: 'İş Maliyeti',
            icon: 'fas fa-calculator',
            children: {},
          },
          '/manufacturing/reports/finished-timers': {
            label: 'Biten Zamanlayıcılar',
            icon: 'fas fa-clock',
            children: {},
          },
          '/manufacturing/reports/user-report': {
            label: 'Kullanıcı Raporu',
            icon: 'fas fa-calendar-alt',
            children: {},
          },
        },
      },
      '/manufacturing/subcontracting': {
        label: 'Taşeron',
        icon: 'fas fa-handshake',
        children: {
          '/manufacturing/subcontracting/overview': {
            label: 'Genel Bakış',
            icon: 'fas fa-chart-line',
            children: {},
          },
          '/manufacturing/subcontracting/subcontractors': {
            label: 'Taşeronlar',
            icon: 'fas fa-building',
            children: {},
          },
          '/manufacturing/subcontracting/labor-pricing': {
            label: 'İşçilik Fiyatı',
            icon: 'fas fa-calculator',
            children: {},
          },
          '/manufacturing/subcontracting/statements': {
            label: 'Hakedişler',
            icon: 'fas fa-file-invoice-dollar',
            children: {},
          },
          '/manufacturing/subcontracting/adjustments': {
            label: 'Düzeltmeler',
            icon: 'fas fa-balance-scale-left',
            children: {},
          },
        },
      },
      '/manufacturing/material-tracking': {
        label: 'Malzeme Takibi',
        icon: 'fas fa-box',
        children: {},
      },
      '/manufacturing/material-tracking/pull-requests': {
        label: 'İmalata Çıkış Talepleri',
        icon: 'fas fa-dolly',
        children: {},
      },
    },
  },
  // Depo in four groups. A group key is a heading only (no page of its own),
  // like the Projeler group under Planlama.
  '/warehouse': {
    label: 'Depo',
    icon: 'fas fa-warehouse',
    children: {
      '/warehouse#stoklar': {
        label: 'Stoklar',
        icon: 'fas fa-boxes',
        children: {
          // The two daily inventories: free stock, and stock set aside per job.
          '/warehouse/hammadde': {
            label: 'Hammadde',
            icon: 'fas fa-cubes',
            children: {},
          },
          '/warehouse/is-emri': {
            label: 'İş Emri',
            icon: 'fas fa-clipboard-list',
            children: {},
          },
          '/warehouse/plate-stock': {
            label: 'Sac Stoğu',
            icon: 'fas fa-layer-group',
            children: {},
          },
          '/warehouse/bar-stock': {
            label: 'Boy Stoğu',
            icon: 'fas fa-ruler-horizontal',
            children: {},
          },
          // Every card with its Hammadde / İş Emri / Mamul balances (was Ana Stok).
          '/warehouse/stock': {
            label: 'Tüm Stok Kartları',
            icon: 'fas fa-boxes',
            children: {},
          },
          '/warehouse/equipment': {
            label: 'Ekipman',
            icon: 'fas fa-toolbox',
            children: {},
          },
          // Makineler (moved from Genel).
          '/warehouse/machines': {
            label: 'Makineler',
            icon: 'fas fa-cogs',
            children: {},
          },
          '/warehouse/mikro-comparison': {
            label: 'Mikro Karşılaştırması',
            icon: 'fas fa-balance-scale',
            children: {},
          },
        },
      },
      '/warehouse#giris-cikis': {
        label: 'Giriş / Çıkış',
        icon: 'fas fa-exchange-alt',
        children: {
          '/warehouse/goods-receipts': {
            label: 'Mal Kabul',
            icon: 'fas fa-truck-loading',
            children: {},
          },
          // Also under İmalat, where Malzeme Takibi creates them.
          '/manufacturing/material-tracking/pull-requests': {
            label: 'İmalata Çıkış Talepleri',
            icon: 'fas fa-dolly',
            children: {},
          },
          '/warehouse/production-slips': {
            label: 'İmalattan İade',
            icon: 'fas fa-undo',
            children: {},
          },
          '/warehouse/transfers': {
            label: 'Depo Transferi',
            icon: 'fas fa-exchange-alt',
            children: {},
          },
        },
      },
      '/warehouse#sayim': {
        label: 'Sayım',
        icon: 'fas fa-clipboard-check',
        children: {
          '/warehouse/counts': {
            label: 'Ana Stok Sayımı',
            icon: 'fas fa-clipboard-check',
            children: {},
          },
          '/warehouse/piece-counts': {
            label: 'Sac ve Boy Sayımı',
            icon: 'fas fa-ruler-combined',
            children: {},
          },
        },
      },
      '/warehouse#raporlar': {
        label: 'Raporlar',
        icon: 'fas fa-chart-bar',
        children: {
          '/warehouse/weight-reduction': {
            label: 'Ağırlık Düşüşü',
            icon: 'fas fa-weight-hanging',
            children: {},
          },
        },
      },
    },
  },
  '/logistics': {
    label: 'Lojistik',
    icon: 'fas fa-truck',
    children: {
      '/logistics/projects': {
        label: 'Projeler',
        icon: 'fas fa-project-diagram',
        children: {},
      },
      '/logistics/cost-lines': {
        label: 'Maliyet Satırları',
        icon: 'fas fa-euro-sign',
        children: {},
      },
    },
  },
  '/procurement': {
    label: 'Satın Alma',
    icon: 'fas fa-shopping-cart',
    children: {
      '/procurement/projects': {
        label: 'Projeler',
        icon: 'fas fa-project-diagram',
        children: {},
      },
      '/procurement/suppliers': {
        label: 'Tedarikçiler',
        icon: 'fas fa-handshake',
        children: {
          '/procurement/suppliers/list': {
            label: 'Tedarikçi Listesi',
            icon: 'fas fa-list',
            children: {},
          },
          '/procurement/suppliers/payment-terms': {
            label: 'Ödeme Koşulları',
            icon: 'fas fa-credit-card',
            children: {},
          },
        },
      },
      '/procurement/critical-items': {
        label: 'Kritik Malzemeler',
        icon: 'fas fa-circle-exclamation',
        children: {},
      },
      '/procurement/planning-items': {
        label: 'Satın Alma Kalemleri',
        icon: 'fas fa-list-check',
        children: {},
      },
      '/procurement/purchase-requests': {
        label: 'Satın Alma Talepleri',
        icon: 'fas fa-shopping-cart',
        children: {
          '/procurement/purchase-requests/create': {
            label: 'Talep Oluştur',
            icon: 'fas fa-plus',
            children: {},
          },
          '/procurement/purchase-requests/pending': {
            label: 'Bekleyen Talepler',
            icon: 'fas fa-clock',
            children: {},
          },
          '/procurement/purchase-requests/registry': {
            label: 'Kayıt Defteri',
            icon: 'fas fa-archive',
            children: {},
          },
        },
      },
      '/procurement/payment-lists': {
        label: 'Ödeme Listeleri',
        icon: 'fas fa-money-check-dollar',
        children: {},
      },
      '/procurement/reports': {
        label: 'Raporlar',
        icon: 'fas fa-chart-bar',
        children: {
          '/procurement/reports/items': {
            label: 'Ürün Raporu',
            icon: 'fas fa-chart-bar',
            children: {},
          },
          '/procurement/reports/suppliers': {
            label: 'Tedarikçi Raporu',
            icon: 'fas fa-chart-pie',
            children: {},
          },
          '/procurement/reports/staff': {
            label: 'Personel Raporu',
            icon: 'fas fa-users',
            children: {},
          },
        },
      },
    },
  },
  '/finance': {
    label: 'Finans',
    icon: 'fas fa-dollar-sign',
    children: {
      '/finance/purchase-orders': {
        label: 'Finans İşlemleri',
        icon: 'fas fa-coins',
        children: {},
      },
      '/finance/reports': {
        label: 'Raporlar',
        icon: 'fas fa-chart-bar',
        children: {
          '/finance/reports/projects': {
            label: 'Proje Raporu',
            icon: 'fas fa-chart-line',
            children: {},
          },
          '/finance/reports/executive-overview': {
            label: 'Yönetici Özeti',
            icon: 'fas fa-chart-pie',
            children: {},
          },
        },
      },
    },
  },
  '/accounting': {
    label: 'Muhasebe',
    icon: 'fas fa-file-invoice',
    children: {
      '/accounting/subcontracting-statements': {
        label: 'Hakedişler',
        icon: 'fas fa-file-invoice-dollar',
        children: {},
      },
      '/accounting/job-cost-by-period': {
        label: 'Dönemsel İş Maliyeti',
        icon: 'fas fa-calendar-alt',
        children: {},
      },
    },
  },
  '/it': {
    label: 'Bilgi İşlem',
    icon: 'fas fa-laptop-code',
    children: {
      '/it/inventory': {
        label: 'Envanter',
        icon: 'fas fa-desktop',
        children: {},
      },
      '/it/password-resets': {
        label: 'Şifre Sıfırlama Talepleri',
        icon: 'fas fa-key',
        children: {},
      },
      '/it/permissions': {
        label: 'Yetki Yönetimi',
        icon: 'fas fa-user-shield',
        children: {},
      },
      '/it/job-completion': {
        label: 'İş Emri Tamamlama',
        icon: 'fas fa-check-double',
        children: {},
      },
      '/it/notifications': {
        label: 'Bildirim Yönlendirmeleri',
        icon: 'fas fa-bell',
        children: {},
      },
      '/it/approvals': {
        label: 'Onay Yönetimi',
        icon: 'fas fa-check-double',
        children: {},
      },
      '/it/groups': {
        label: 'Organizasyon Grupları',
        icon: 'fas fa-object-group',
        children: {},
      },
      '/it/neo': {
        label: 'Neo Kullanımı',
        icon: 'fas fa-robot',
        children: {},
      },
      '/it/feedback': {
        label: 'Geri Bildirimler',
        icon: 'fas fa-bug',
        children: {},
      },
    },
  },
  '/human_resources': {
    label: 'İnsan Kaynakları',
    icon: 'fas fa-users-cog',
    children: {
      '/human_resources/users': {
        label: 'Çalışanlar',
        icon: 'fas fa-users',
        children: {},
      },
      '/human_resources/attendance': {
        label: 'PDKS',
        icon: 'fas fa-user-check',
        children: {
          '/human_resources/attendance/pending-overrides': {
            label: 'Onay Bekleyenler',
            icon: 'fas fa-user-clock',
            children: {},
          },
          '/human_resources/attendance/records': {
            label: 'Kayıtlar',
            icon: 'fas fa-clipboard-list',
            children: {},
          },
          '/human_resources/attendance/summary': {
            label: 'Özet',
            icon: 'fas fa-chart-bar',
            children: {},
          },
          '/human_resources/attendance/shift-rules': {
            label: 'Vardiya Kuralları',
            icon: 'fas fa-clock',
            children: {},
          },
        },
      },
      // Mesailer (moved from Genel). Pending approvals are in the user menu.
      '/human_resources/overtime': {
        label: 'Mesailer',
        icon: 'fas fa-clock',
        children: {
          '/human_resources/overtime/registry': {
            label: 'Kayıt Defteri',
            icon: 'fas fa-archive',
            children: {},
          },
          '/human_resources/overtime/users': {
            label: 'Mesai Kullanıcıları',
            icon: 'fas fa-users',
            children: {},
          },
          '/human_resources/overtime/machining-report': {
            label: 'Talaşlı İmalat Mesai Raporu',
            icon: 'fas fa-cogs',
            children: {},
          },
          '/human_resources/overtime/welding-report': {
            label: 'Kaynaklı İmalat Mesai Raporu',
            icon: 'fas fa-fire',
            children: {},
          },
          '/human_resources/overtime/cost-report': {
            label: 'Mesai Maliyet Raporu',
            icon: 'fas fa-coins',
            children: {},
          },
        },
      },
      '/human_resources/vacation': {
        label: 'İzin Yönetimi',
        icon: 'fas fa-calendar-check',
        children: {},
      },
      '/human_resources/special-days': {
        label: 'Özel Günler',
        icon: 'fas fa-cake-candles',
        children: {},
      },
      '/human_resources/org': {
        label: 'Organizasyon',
        icon: 'fas fa-sitemap',
        children: {
          '/human_resources/org/positions': {
            label: 'Pozisyonlar',
            icon: 'fas fa-id-badge',
            children: {},
          },
        },
      },
    },
  },
  '/sales': {
    label: 'Satış',
    icon: 'fas fa-handshake',
    children: {
      '/sales/cost-table': {
        label: 'Maliyet Tablosu',
        icon: 'fas fa-calculator',
        children: {},
      },
      '/sales/customers': {
        label: 'Müşteriler',
        icon: 'fas fa-users',
        children: {},
      },
      '/sales/offers': {
        label: 'Teklifler',
        icon: 'fas fa-file-invoice-dollar',
        children: {},
      },
      '/sales/catalog': {
        label: 'Ürün Kataloğu',
        icon: 'fas fa-book',
        children: {},
      },
    },
  },
  '/management': {
    label: 'Yönetim',
    icon: 'fas fa-chart-line',
    children: {
      '/management/dashboard': {
        label: 'Dashboard',
        icon: 'fas fa-tachometer-alt',
        children: {},
      },
      '/management/reports': {
        label: 'Raporlar',
        icon: 'fas fa-chart-bar',
        children: {
          '/management/reports/overview': {
            label: 'Genel Bakış',
            icon: 'fas fa-chart-line',
            children: {},
          },
          '/management/reports/cash-flow': {
            label: 'Nakit Akış Tablosu',
            icon: 'fas fa-money-bill-wave',
            children: {},
          },
        },
      },
      '/management/analytics': {
        label: 'Analitik',
        icon: 'fas fa-chart-pie',
        children: {},
      },
    },
  },
};
