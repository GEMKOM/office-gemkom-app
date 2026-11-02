import type { MenuCard } from '@/ui';

// The manufacturing hub pages, ported card for card from their legacy
// MenuComponent scripts (named per hub below). Feature links used to carry a
// dark red icon colour; they now take the card's own colour, as the design
// system keeps red out of cards.

/** Live counts a hub can show, defined in ManufacturingHubPage. */
export type HubFigure = 'machiningTimers' | 'cncTimers' | 'openFaults' | 'stoppedMachines';

export interface HubCard extends Omit<MenuCard, 'stat'> {
  /** Shown under the title as the card's figure. */
  figure?: HubFigure;
}

export interface ManufacturingHub {
  title: string;
  subtitle: string;
  /** Tiles on the band, in this order. */
  figures?: HubFigure[];
  cards: HubCard[];
}

export const MANUFACTURING_HUBS: Record<string, ManufacturingHub> = {
  // manufacturing/manufacturing.js
  '/manufacturing': {
    title: 'İmalat Modülü',
    subtitle: 'İmalat süreçlerinizi yönetin ve optimize edin',
    figures: ['machiningTimers', 'cncTimers', 'openFaults'],
    cards: [
      {
        title: 'Projeler',
        description: 'İmalat departmanı görevlerini görüntüleyin ve yönetin.',
        icon: 'fas fa-project-diagram',
        iconColor: 'primary',
        link: '/manufacturing/projects',
      },
      {
        title: 'Talaşlı İmalat',
        description: 'CNC işlemleri, torna, freze ve diğer talaşlı imalat süreçleri yönetimi.',
        icon: 'fas fa-cog',
        iconColor: 'success',
        link: '/manufacturing/machining',
        figure: 'machiningTimers',
        features: [
          { label: 'Dashboard', icon: 'fas fa-chart-line', link: '/manufacturing/machining/dashboard' },
          { label: 'Görevler', icon: 'fas fa-tasks', link: '/manufacturing/machining/tasks' },
          { label: 'Raporlar', icon: 'fas fa-chart-pie', link: '/manufacturing/machining/reports' },
          { label: 'Kapasite Yönetimi', icon: 'fas fa-industry', link: '/manufacturing/machining/capacity' },
        ],
      },
      {
        title: 'CNC Kesim',
        description: 'CNC kesim operasyonları, nesting dosyaları ve kesim görevleri yönetimi.',
        icon: 'fas fa-cut',
        iconColor: 'primary',
        link: '/manufacturing/cnc-cutting',
        figure: 'cncTimers',
        features: [
          { label: 'Dashboard', icon: 'fas fa-chart-line', link: '/manufacturing/cnc-cutting/dashboard' },
          { label: 'Kesimler', icon: 'fas fa-scissors', link: '/manufacturing/cnc-cutting/cuts' },
          { label: 'Fire Plakalar', icon: 'fas fa-layer-group', link: '/manufacturing/cnc-cutting/remnants' },
          { label: 'Raporlar', icon: 'fas fa-chart-bar', link: '/manufacturing/cnc-cutting/reports' },
          { label: 'Kapasite Yönetimi', icon: 'fas fa-industry', link: '/manufacturing/cnc-cutting/capacity' },
        ],
      },
      {
        title: 'Lineer Kesim',
        description: 'Profil ve çubuk kesim optimizasyonu, oturum ve bar görevleri yönetimi.',
        icon: 'fas fa-ruler-horizontal',
        iconColor: 'success',
        link: '/manufacturing/linear-cutting',
        features: [
          { label: 'Dashboard', icon: 'fas fa-chart-line', link: '/manufacturing/linear-cutting/dashboard' },
          { label: 'Kesimler', icon: 'fas fa-ruler-horizontal', link: '/manufacturing/linear-cutting/cuts' },
          { label: 'Görevler', icon: 'fas fa-tasks', link: '/manufacturing/linear-cutting/tasks' },
          { label: 'Kapasite Yönetimi', icon: 'fas fa-industry', link: '/manufacturing/linear-cutting/capacity' },
        ],
      },
      {
        title: 'Bakım',
        description: 'Ekipman bakım planları, arıza takibi ve önleyici bakım yönetimi.',
        icon: 'fas fa-wrench',
        iconColor: 'warning',
        link: '/manufacturing/maintenance',
        figure: 'openFaults',
        features: [
          { label: 'Dashboard', icon: 'fas fa-chart-line', link: '/manufacturing/maintenance/dashboard' },
          {
            label: 'Arıza Talepleri',
            icon: 'fas fa-exclamation-triangle',
            link: '/manufacturing/maintenance/fault-requests',
          },
          { label: 'Raporlar', icon: 'fas fa-chart-bar', link: '/manufacturing/maintenance/reports' },
        ],
      },
      {
        title: 'Kaynak',
        description: 'Kaynak işlemleri ve zaman kayıtları yönetimi.',
        icon: 'fas fa-fire',
        iconColor: 'danger',
        link: '/manufacturing/welding',
        features: [
          { label: 'Zaman Kayıtları', icon: 'fas fa-clock', link: '/manufacturing/welding/time-entries' },
          { label: 'Ekipler', icon: 'fas fa-users', link: '/manufacturing/welding/teams' },
          { label: 'Raporlar', icon: 'fas fa-chart-bar', link: '/manufacturing/welding/reports' },
        ],
      },
      {
        title: 'Raporlar',
        description: 'raporlar ve analizler.',
        icon: 'fas fa-chart-pie',
        iconColor: 'info',
        link: '/manufacturing/reports',
        features: [
          { label: 'İş Maliyeti', icon: 'fas fa-calculator', link: '/manufacturing/reports/combined-job-costs' },
        ],
      },
      {
        title: 'Taşeron',
        description: 'Taşeron yönetimi, fiyat kademeleri ve hakediş işlemleri.',
        icon: 'fas fa-handshake',
        iconColor: 'primary',
        link: '/manufacturing/subcontracting',
        features: [
          { label: 'Genel Bakış', icon: 'fas fa-eye', link: '/manufacturing/subcontracting/overview' },
          { label: 'Taşeronlar', icon: 'fas fa-building', link: '/manufacturing/subcontracting/subcontractors' },
          { label: 'Hakedişler', icon: 'fas fa-file-invoice-dollar', link: '/manufacturing/subcontracting/statements' },
          { label: 'Düzeltmeler', icon: 'fas fa-sliders-h', link: '/manufacturing/subcontracting/adjustments' },
        ],
      },
      {
        title: 'Malzeme Takibi',
        description: 'Teslim edilmiş planlama talebi kalemlerini görüntüleyin ve takip edin.',
        icon: 'fas fa-box',
        iconColor: 'info',
        link: '/manufacturing/material-tracking',
      },
      {
        title: 'Depo Çekme Talepleri',
        description: 'Taşeron ve kaynak ekiplerine depodan çekilen malzeme taleplerini izleyin.',
        icon: 'fas fa-dolly',
        iconColor: 'info',
        link: '/manufacturing/material-tracking/pull-requests',
      },
    ],
  },

  // manufacturing/cnc-cutting/cnc-cutting.js
  '/manufacturing/cnc-cutting': {
    title: 'CNC Kesim',
    subtitle: 'CNC kesim operasyonları yönetimi',
    figures: ['cncTimers'],
    cards: [
      {
        title: 'Dashboard',
        description:
          'Gerçek zamanlı görünüm ile aktif zamanlayıcıları, makine durumlarını ve istatistikleri takip edin.',
        icon: 'fas fa-chart-line',
        iconColor: 'primary',
        link: '/manufacturing/cnc-cutting/dashboard',
        figure: 'cncTimers',
      },
      {
        title: 'Kesimler',
        description: 'CNC kesim görevlerini yönetin ve takip edin',
        icon: 'fas fa-scissors',
        iconColor: 'success',
        link: '/manufacturing/cnc-cutting/cuts/',
      },
      {
        title: 'Fire Plakalar',
        description: 'CNC kesim fire plakalarını görüntüleyin ve yönetin',
        icon: 'fas fa-layer-group',
        iconColor: 'info',
        link: '/manufacturing/cnc-cutting/remnants/',
      },
      {
        title: 'Raporlar',
        description: 'Detaylı raporlar ve analizler ile performansınızı ölçün ve veriye dayalı kararlar alın.',
        icon: 'fas fa-chart-bar',
        iconColor: 'warning',
        link: '/manufacturing/cnc-cutting/reports',
        features: [
          {
            label: 'Biten Zamanlayıcılar',
            icon: 'fas fa-clock',
            link: '/manufacturing/cnc-cutting/reports/finished-timers',
          },
          {
            label: 'Kullanıcı Raporu',
            icon: 'fas fa-calendar-alt',
            link: '/manufacturing/cnc-cutting/reports/user-report',
          },
        ],
      },
      {
        title: 'Kapasite Yönetimi',
        description: 'Makine kapasitelerini planlayın ve geçmiş çalışma verilerini analiz edin.',
        icon: 'fas fa-industry',
        iconColor: 'secondary',
        link: '/manufacturing/cnc-cutting/capacity',
        features: [
          {
            label: 'Kapasite Planlayıcı',
            icon: 'fas fa-calendar-alt',
            link: '/manufacturing/cnc-cutting/capacity/planning',
          },
        ],
      },
    ],
  },

  // manufacturing/cnc-cutting/capacity/capacity.js
  '/manufacturing/cnc-cutting/capacity': {
    title: 'Kapasite Yönetimi',
    subtitle: 'CNC Kesim kapasitelerini planlayın ve üretim programını yönetin',
    cards: [
      {
        title: 'Kapasite Planlayıcı',
        description: 'Kesim makineleri için plan oluşturun ve düzenleyin.',
        icon: 'fas fa-calendar-alt',
        iconColor: 'primary',
        link: '/manufacturing/cnc-cutting/capacity/planning',
      },
    ],
  },

  // manufacturing/linear-cutting/linear-cutting.js
  '/manufacturing/linear-cutting': {
    title: 'Lineer Kesim',
    subtitle: 'Lineer kesim optimizasyonu ve görev yönetimi',
    cards: [
      {
        title: 'Dashboard',
        description: 'Kesim planlarını ve kesim görevlerini hızlıca görüntüleyin.',
        icon: 'fas fa-chart-line',
        iconColor: 'primary',
        link: '/manufacturing/linear-cutting/dashboard',
      },
      {
        title: 'Kesimler',
        description: 'Kesim planı oluşturun, parçaları yönetin, optimize edin ve onaylayın.',
        icon: 'fas fa-ruler-horizontal',
        iconColor: 'success',
        link: '/manufacturing/linear-cutting/cuts/',
      },
      {
        title: 'Görevler',
        description: 'Oluşturulan bar görevlerini görüntüleyin, yönetin ve tamamlayın.',
        icon: 'fas fa-tasks',
        iconColor: 'warning',
        link: '/manufacturing/linear-cutting/tasks/',
      },
      {
        title: 'Kapasite Planlayıcı',
        description: 'Lineer kesim görevlerini makinelere planlayın ve Gantt üzerinden takip edin.',
        icon: 'fas fa-calendar-alt',
        iconColor: 'primary',
        link: '/manufacturing/linear-cutting/capacity/planning/',
      },
    ],
  },

  // manufacturing/linear-cutting/capacity/capacity.js
  '/manufacturing/linear-cutting/capacity': {
    title: 'Kapasite Yönetimi',
    subtitle: 'Lineer kesim kapasitelerini planlayın ve üretim programını yönetin',
    cards: [
      {
        title: 'Kapasite Planlayıcı',
        description: 'Lineer kesim makineleri için plan oluşturun ve düzenleyin.',
        icon: 'fas fa-calendar-alt',
        iconColor: 'primary',
        link: '/manufacturing/linear-cutting/capacity/planning',
      },
    ],
  },

  // manufacturing/machining/machining.js
  '/manufacturing/machining': {
    title: 'Talaşlı İmalat',
    subtitle: 'CNC işlemleri ve talaşlı imalat süreçleri yönetimi',
    figures: ['machiningTimers'],
    cards: [
      {
        title: 'Dashboard',
        description:
          'Gerçek zamanlı görünüm ile aktif zamanlayıcıları, makine durumlarını ve istatistikleri takip edin.',
        icon: 'fas fa-chart-line',
        iconColor: 'primary',
        link: '/manufacturing/machining/dashboard',
        figure: 'machiningTimers',
      },
      {
        title: 'Görevler',
        description: 'Görev yönetimi ve oluşturma işlemleri.',
        icon: 'fas fa-tasks',
        iconColor: 'success',
        link: '/manufacturing/machining/tasks',
        features: [
          { label: 'Görev Listesi', icon: 'fas fa-list', link: '/manufacturing/machining/tasks/list' },
          { label: 'Görev Oluştur', icon: 'fas fa-plus-circle', link: '/manufacturing/machining/tasks/create' },
        ],
      },
      {
        title: 'Raporlar',
        description: 'Detaylı raporlar ve analizler ile performansınızı ölçün ve veriye dayalı kararlar alın.',
        icon: 'fas fa-chart-bar',
        iconColor: 'info',
        link: '/manufacturing/machining/reports',
        features: [
          {
            label: 'Biten Zamanlayıcılar',
            icon: 'fas fa-clock',
            link: '/manufacturing/machining/reports/finished-timers',
          },
          { label: 'Toplam Raporu', icon: 'fas fa-chart-pie', link: '/manufacturing/machining/reports/sum-report' },
          {
            label: 'Maliyet Analizi',
            icon: 'fas fa-calculator',
            link: '/manufacturing/machining/reports/cost-analysis',
          },
          {
            label: 'Makine Çalışma Geçmişi',
            icon: 'fas fa-history',
            link: '/manufacturing/machining/reports/history',
          },
          {
            label: 'Üretim Planı',
            icon: 'fas fa-calendar-alt',
            link: '/manufacturing/machining/reports/production-plan',
          },
          {
            label: 'Kullanıcı Raporu',
            icon: 'fas fa-calendar-alt',
            link: '/manufacturing/machining/reports/user-report',
          },
          {
            label: 'Performans Raporu',
            icon: 'fas fa-chart-bar',
            link: '/manufacturing/machining/reports/performance',
          },
        ],
      },
      {
        title: 'Kapasite Planlayıcı',
        description: 'Makine kapasitelerini planlayın ve geçmiş çalışma verilerini analiz edin.',
        icon: 'fas fa-industry',
        iconColor: 'warning',
        link: '/manufacturing/machining/capacity',
        features: [
          {
            label: 'Kapasite Planlayıcı',
            icon: 'fas fa-calendar-alt',
            link: '/manufacturing/machining/capacity/planning',
          },
        ],
      },
    ],
  },

  // manufacturing/machining/capacity/capacity.js
  '/manufacturing/machining/capacity': {
    title: 'Kapasite Yönetimi',
    subtitle: 'Makine kapasitelerini planlayın ve geçmiş çalışma verilerini analiz edin',
    cards: [
      {
        title: 'Kapasite Planlayıcı',
        description: 'Makine kapasitelerini planlayın ve üretim programını oluşturun.',
        icon: 'fas fa-calendar-alt',
        iconColor: 'primary',
        link: '/manufacturing/machining/capacity/planning',
      },
    ],
  },

  // manufacturing/machining/tasks/tasks.js
  '/manufacturing/machining/tasks': {
    title: 'Görevler',
    subtitle: 'Görev yönetimi ve oluşturma işlemleri',
    cards: [
      {
        title: 'Görev Listesi',
        description: 'Mevcut görevleri görüntüleyin, yeni görevler oluşturun ve toplu görev yönetimi yapın.',
        icon: 'fas fa-list',
        iconColor: 'success',
        link: '/manufacturing/machining/tasks/list',
      },
      {
        title: 'Görev Oluştur',
        description: 'Yeni görev oluşturun ve oluşturduğunuz görevleri görüntüleyin.',
        icon: 'fas fa-plus-circle',
        iconColor: 'primary',
        link: '/manufacturing/machining/tasks/create',
      },
    ],
  },

  // manufacturing/maintenance/maintenance.js
  '/manufacturing/maintenance': {
    title: 'Bakım Modülü',
    subtitle: 'Ekipman bakım planları, arıza takibi ve önleyici bakım yönetimi',
    figures: ['openFaults', 'stoppedMachines'],
    cards: [
      {
        title: 'Dashboard',
        description: 'Aktif arıza zamanlayıcıları ve temel istatistikleri takip edin.',
        icon: 'fas fa-chart-line',
        iconColor: 'primary',
        link: '/manufacturing/maintenance/dashboard',
      },
      {
        title: 'Arıza Talepleri',
        description: 'Yeni arıza talepleri oluşturun ve mevcut arıza durumlarını takip edin.',
        icon: 'fas fa-exclamation-triangle',
        iconColor: 'danger',
        link: '/manufacturing/maintenance/fault-requests',
        figure: 'openFaults',
      },
      {
        title: 'Raporlar',
        description: 'Bakım ve arıza süreçlerine ait raporlar.',
        icon: 'fas fa-chart-bar',
        iconColor: 'primary',
        link: '/manufacturing/maintenance/reports',
        features: [
          { label: 'Arızalar Özeti', icon: 'fas fa-file-alt', link: '/manufacturing/maintenance/reports/faults' },
          {
            label: 'Kullanıcı Çözüm Raporu',
            icon: 'fas fa-user-check',
            link: '/manufacturing/maintenance/reports/user-resolution',
          },
          {
            label: 'Personel Faaliyet Raporu',
            icon: 'fas fa-user-clock',
            link: '/manufacturing/maintenance/reports/staff-report',
          },
          {
            label: 'Aylık Metrikler',
            icon: 'fas fa-chart-line',
            link: '/manufacturing/maintenance/reports/monthly-metrics',
          },
        ],
      },
    ],
  },

  // manufacturing/subcontracting/subcontracting.js. İşçilik Fiyatı is for the
  // planning manager only; like every card it hides without the grant.
  '/manufacturing/subcontracting': {
    title: 'Taşeron Modülü',
    subtitle: 'Taşeron yönetimi, hakedişler ve düzeltmeler',
    cards: [
      {
        title: 'Genel Bakış',
        description: 'Taşeron bazında özet, atamalar ve maliyet göstergeleri.',
        icon: 'fas fa-chart-line',
        iconColor: 'primary',
        link: '/manufacturing/subcontracting/overview',
      },
      {
        title: 'Taşeronlar',
        description: 'Taşeronları ve fiyat kademelerini oluşturun ve yönetin.',
        icon: 'fas fa-building',
        iconColor: 'info',
        link: '/manufacturing/subcontracting/subcontractors',
      },
      {
        title: 'İşçilik Fiyatı',
        description: 'Satış fiyatından geriye giderek taşerona verilebilecek €/kg işçiliği hesaplayın.',
        icon: 'fas fa-calculator',
        iconColor: 'primary',
        link: '/manufacturing/subcontracting/labor-pricing',
      },
      {
        title: 'Hakedişler',
        description: 'Aylık taşeron hakedişlerini oluşturun, onaylayın ve takip edin.',
        icon: 'fas fa-file-invoice-dollar',
        iconColor: 'success',
        link: '/manufacturing/subcontracting/statements',
      },
      {
        title: 'Düzeltmeler',
        description: 'Tüm hakediş düzeltmeleri — ek ödemeler ve kesintiler.',
        icon: 'fas fa-balance-scale-left',
        iconColor: 'warning',
        link: '/manufacturing/subcontracting/adjustments',
      },
    ],
  },

  // manufacturing/welding/welding.js
  '/manufacturing/welding': {
    title: 'Kaynak Modülü',
    subtitle: 'Kaynak işlemleri ve zaman kayıtları yönetimi',
    cards: [
      {
        title: 'Zaman Kayıtları',
        description: 'Kaynak zaman kayıtlarını görüntüleyin, oluşturun ve yönetin.',
        icon: 'fas fa-clock',
        iconColor: 'primary',
        link: '/manufacturing/welding/time-entries',
      },
      {
        title: 'Puantaj Onayı',
        description:
          'Kaynakçıların telefondan gönderdiği günlük puantajları kontrol edin, düzeltin ve zaman kayıtlarına aktarın.',
        icon: 'fas fa-clipboard-check',
        iconColor: 'info',
        link: '/manufacturing/welding/timesheets',
      },
      {
        title: 'Ekipler',
        description: 'Kaynak ekiplerini oluşturun, ustabaşı ve üyeleri yönetin.',
        icon: 'fas fa-users',
        iconColor: 'warning',
        link: '/manufacturing/welding/teams',
      },
      {
        title: 'Raporlar',
        description: 'Kaynak zaman kayıtları analizleri ve performans raporları.',
        icon: 'fas fa-chart-bar',
        iconColor: 'success',
        link: '/manufacturing/welding/reports',
        features: [
          {
            label: 'Çalışan Çalışma Saatleri',
            icon: 'fas fa-user-clock',
            link: '/manufacturing/welding/reports/user-work-hours',
          },
        ],
      },
    ],
  },

  // manufacturing/welding/reports/reports.js
  '/manufacturing/welding/reports': {
    title: 'Kaynak Raporları',
    subtitle: 'Kaynak zaman kayıtları analizleri ve performans raporları',
    cards: [
      {
        title: 'Çalışan Çalışma Saatleri Raporu',
        description:
          'Çalışanların belirli bir tarih aralığındaki çalışma saatlerini mesai tipine göre görüntüleyin.',
        icon: 'fas fa-user-clock',
        iconColor: 'primary',
        link: '/manufacturing/welding/reports/user-work-hours',
      },
      {
        title: 'Maliyet Analizi Raporu',
        description: 'İş numaralarına göre detaylı saat analizi ve kullanıcı bazlı detaylar.',
        icon: 'fas fa-calculator',
        iconColor: 'success',
        link: '/manufacturing/welding/reports/cost-analysis',
      },
    ],
  },
};
