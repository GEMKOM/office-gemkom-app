import type { MenuCard } from '@/ui';

// The manufacturing hub pages, ported card for card from their legacy
// MenuComponent scripts (named per hub below). Feature links used to carry a
// dark red icon colour; they now take the card's own colour, as the design
// system keeps red out of cards.

/** Live counts a hub can show, defined in ManufacturingHubPage. */
export type HubFigure =
  | 'machiningTimers'
  | 'cncTimers'
  | 'openFaults'
  | 'stoppedMachines'
  | 'incompleteParts'
  | 'lateParts'
  | 'cncPendingCuts'
  | 'linearPendingTasks'
  | 'weldingEntriesToday'
  | 'timesheetsPending'
  | 'pendingPullRequests'
  | 'statementsInApproval';

/**
 * Panels under the cards, defined in ManufacturingHubPage: the open faults,
 * the machining parts backlog, and the shop's queues (a count per area).
 */
export type HubPanel = 'openFaults' | 'partsBacklog' | 'shopQueues';

export interface HubCard extends Omit<MenuCard, 'stat'> {
  /** Shown under the title as the card's figure. */
  figure?: HubFigure;
}

export interface ManufacturingHub {
  title: string;
  subtitle: string;
  /** Tiles on the band, in this order. */
  figures?: HubFigure[];
  panels?: HubPanel[];
  cards: HubCard[];
}

export const MANUFACTURING_HUBS: Record<string, ManufacturingHub> = {
  // manufacturing/manufacturing.js
  '/manufacturing': {
    title: 'İmalat Modülü',
    subtitle: 'İmalat süreçlerinizi yönetin ve optimize edin',
    figures: ['machiningTimers', 'cncTimers', 'openFaults', 'stoppedMachines'],
    panels: ['openFaults', 'shopQueues'],
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
        figure: 'weldingEntriesToday',
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
          { label: 'İş Maliyeti', icon: 'fas fa-calculator', link: '/manufacturing/reports/job-costs' },
          { label: 'Biten Zamanlayıcılar', icon: 'fas fa-clock', link: '/manufacturing/reports/finished-timers' },
          { label: 'Kullanıcı Raporu', icon: 'fas fa-calendar-alt', link: '/manufacturing/reports/user-report' },
        ],
      },
      {
        title: 'Taşeron',
        description: 'Taşeron yönetimi, fiyat kademeleri ve hakediş işlemleri.',
        icon: 'fas fa-handshake',
        iconColor: 'primary',
        link: '/manufacturing/subcontracting',
        figure: 'statementsInApproval',
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
        figure: 'pendingPullRequests',
      },
    ],
  },

  // manufacturing/machining/machining.js
  '/manufacturing/machining': {
    title: 'Talaşlı İmalat',
    subtitle: 'CNC işlemleri ve talaşlı imalat süreçleri yönetimi',
    figures: ['machiningTimers', 'incompleteParts', 'lateParts'],
    panels: ['partsBacklog'],
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
        figure: 'incompleteParts',
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
            link: '/manufacturing/reports/finished-timers?module=machining',
          },
          { label: 'Toplam Raporu', icon: 'fas fa-chart-pie', link: '/manufacturing/machining/reports/sum-report' },
          {
            label: 'Maliyet Analizi',
            icon: 'fas fa-calculator',
            link: '/manufacturing/reports/job-costs?breakdown=machining',
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
            link: '/manufacturing/reports/user-report?module=machining',
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
        link: '/manufacturing/machining/capacity/planning',
      },
    ],
  },

  // manufacturing/machining/tasks/tasks.js
  '/manufacturing/machining/tasks': {
    title: 'Görevler',
    subtitle: 'Görev yönetimi ve oluşturma işlemleri',
    figures: ['incompleteParts', 'lateParts'],
    panels: ['partsBacklog'],
    cards: [
      {
        title: 'Görev Listesi',
        description: 'Mevcut görevleri görüntüleyin, yeni görevler oluşturun ve toplu görev yönetimi yapın.',
        icon: 'fas fa-list',
        iconColor: 'success',
        link: '/manufacturing/machining/tasks/list',
        figure: 'incompleteParts',
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
    panels: ['openFaults'],
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
    figures: ['statementsInApproval'],
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
        figure: 'statementsInApproval',
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
    figures: ['weldingEntriesToday', 'timesheetsPending'],
    cards: [
      {
        title: 'Zaman Kayıtları',
        description: 'Kaynak zaman kayıtlarını görüntüleyin, oluşturun ve yönetin.',
        icon: 'fas fa-clock',
        iconColor: 'primary',
        link: '/manufacturing/welding/time-entries',
        figure: 'weldingEntriesToday',
      },
      {
        title: 'Puantaj Onayı',
        description:
          'Kaynakçıların telefondan gönderdiği günlük puantajları kontrol edin, düzeltin ve zaman kayıtlarına aktarın.',
        icon: 'fas fa-clipboard-check',
        iconColor: 'info',
        link: '/manufacturing/welding/timesheets',
        figure: 'timesheetsPending',
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

  // manufacturing/cnc-cutting/cnc-cutting.js (now under Planlama)
  '/planning/cnc-cutting': {
    title: 'CNC Kesim',
    subtitle: 'CNC kesim operasyonları yönetimi',
    figures: ['cncTimers', 'cncPendingCuts'],
    cards: [
      {
        title: 'Dashboard',
        description:
          'Gerçek zamanlı görünüm ile aktif zamanlayıcıları, makine durumlarını ve istatistikleri takip edin.',
        icon: 'fas fa-chart-line',
        iconColor: 'primary',
        link: '/planning/cnc-cutting/dashboard',
        figure: 'cncTimers',
      },
      {
        title: 'Kesimler',
        description: 'CNC kesim görevlerini yönetin ve takip edin',
        icon: 'fas fa-scissors',
        iconColor: 'success',
        link: '/planning/cnc-cutting/cuts/',
        figure: 'cncPendingCuts',
      },
      {
        title: 'Fire Plakalar',
        description: 'CNC kesim fire plakalarını görüntüleyin ve yönetin',
        icon: 'fas fa-layer-group',
        iconColor: 'info',
        link: '/planning/cnc-cutting/remnants/',
      },
      {
        title: 'Raporlar',
        description: 'Detaylı raporlar ve analizler ile performansınızı ölçün ve veriye dayalı kararlar alın.',
        icon: 'fas fa-chart-bar',
        iconColor: 'warning',
        link: '/planning/cnc-cutting/reports',
        features: [
          {
            label: 'Biten Zamanlayıcılar',
            icon: 'fas fa-clock',
            link: '/manufacturing/reports/finished-timers?module=cnc_cutting',
          },
          {
            label: 'Kullanıcı Raporu',
            icon: 'fas fa-calendar-alt',
            link: '/manufacturing/reports/user-report?module=cnc_cutting',
          },
        ],
      },
      {
        title: 'Kapasite Planlayıcı',
        description: 'Kesim makineleri için plan oluşturun ve düzenleyin.',
        icon: 'fas fa-calendar-alt',
        iconColor: 'secondary',
        link: '/planning/cnc-cutting/capacity',
      },
    ],
  },

  // manufacturing/linear-cutting/linear-cutting.js (now under Planlama)
  '/planning/linear-cutting': {
    title: 'Lineer Kesim',
    subtitle: 'Lineer kesim optimizasyonu ve görev yönetimi',
    figures: ['linearPendingTasks'],
    cards: [
      {
        title: 'Dashboard',
        description: 'Kesim planlarını ve kesim görevlerini hızlıca görüntüleyin.',
        icon: 'fas fa-chart-line',
        iconColor: 'primary',
        link: '/planning/linear-cutting/dashboard',
      },
      {
        title: 'Kesimler',
        description: 'Kesim planı oluşturun, parçaları yönetin, optimize edin ve onaylayın.',
        icon: 'fas fa-ruler-horizontal',
        iconColor: 'success',
        link: '/planning/linear-cutting/cuts/',
      },
      {
        title: 'Görevler',
        description: 'Oluşturulan bar görevlerini görüntüleyin, yönetin ve tamamlayın.',
        icon: 'fas fa-tasks',
        iconColor: 'warning',
        link: '/planning/linear-cutting/tasks/',
      },
      {
        title: 'Kapasite Planlayıcı',
        description: 'Lineer kesim görevlerini makinelere planlayın ve Gantt üzerinden takip edin.',
        icon: 'fas fa-calendar-alt',
        iconColor: 'primary',
        link: '/planning/linear-cutting/capacity',
      },
    ],
  },
};
