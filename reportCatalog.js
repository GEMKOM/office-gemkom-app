// Every report and dashboard, for the Rapor Merkezi (/reports) and the report
// hubs, which are filtered views of it. Kept next to the menu
// (navigationStructure.js): a new report page gets an entry here and then shows
// up in the catalog, its department's hub and the search on its own.
// web/src/pages/reports/catalog.test.ts fails when a menu report is missing.
//
// Entry fields:
//   route        the page; its grant decides who sees the entry
//   title        as on the page
//   question     the one question the report answers
//   topic        a REPORT_TOPICS key (the catalog groups by it)
//   departments  REPORT_DEPARTMENTS keys (the department filter and the hubs)
//   views        for a report merged from several departments: each
//                department's entry point (query preset) and the old page whose
//                grant opens that view
//   keywords     extra search words

export const REPORT_TOPICS = {
    maliyet: 'Maliyet',
    verimlilik: 'Verimlilik',
    uretim: 'Üretim ve Planlama',
    personel: 'Personel ve Mesai',
    bakim: 'Bakım',
    satinalma: 'Satın Alma',
    finans: 'Finans',
    yonetim: 'Yönetim',
    canli: 'Canlı Panolar',
    sistem: 'Sistem',
};

export const REPORT_DEPARTMENTS = {
    machining: 'Talaşlı İmalat',
    cnc: 'CNC Kesim',
    linear: 'Lineer Kesim',
    welding: 'Kaynaklı İmalat',
    maintenance: 'Bakım',
    subcontracting: 'Taşeron',
    overtime: 'Mesai',
    hr: 'İnsan Kaynakları',
    procurement: 'Satın Alma',
    finance: 'Finans',
    management: 'Yönetim',
    sales: 'Satış',
    it: 'Bilgi İşlem',
};

export const REPORT_CATALOG = [
    // ---- İmalat: merged reports ----
    {
        route: '/manufacturing/reports/job-costs',
        title: 'İş Maliyeti',
        question: 'Bir iş numarasına talaşlı ve kaynaklı imalatta kaç saat ve ne kadar işçilik maliyeti harcandı?',
        topic: 'maliyet',
        icon: 'fas fa-calculator',
        departments: ['machining', 'welding'],
        views: {
            machining: { query: 'breakdown=machining', route: '/manufacturing/machining/reports/cost-analysis' },
            welding: { query: 'breakdown=welding', route: '/manufacturing/welding/reports/cost-analysis' },
        },
        keywords: ['maliyet analizi', 'birleşik', 'saat', 'job cost'],
    },
    {
        route: '/manufacturing/reports/finished-timers',
        title: 'Biten Zamanlayıcılar',
        question: 'Bir dönemde hangi zamanlayıcılar tamamlandı; kim, hangi makinede, ne kadar sürdü?',
        topic: 'verimlilik',
        icon: 'fas fa-clock',
        departments: ['machining', 'cnc'],
        views: {
            machining: { query: 'module=machining', route: '/manufacturing/machining/reports/finished-timers' },
            cnc: { query: 'module=cnc_cutting', route: '/manufacturing/cnc-cutting/reports/finished-timers' },
        },
        keywords: ['timer', 'zamanlayıcı', 'nesting'],
    },
    {
        route: '/manufacturing/reports/user-report',
        title: 'Kullanıcı Raporu',
        question: 'Operatörler seçilen günlerde ne kadar çalıştı, boşta ve beklemede kaldı; verimlilikleri ne?',
        topic: 'verimlilik',
        icon: 'fas fa-calendar-alt',
        departments: ['machining', 'cnc'],
        views: {
            machining: { query: 'module=machining', route: '/manufacturing/machining/reports/user-report' },
            cnc: { query: 'module=cnc_cutting', route: '/manufacturing/cnc-cutting/reports/user-report' },
        },
        keywords: ['operatör', 'boşta', 'verimlilik'],
    },

    // ---- Talaşlı İmalat ----
    {
        route: '/manufacturing/machining/reports/daily-efficiency',
        title: 'Günlük Verimlilik Raporu',
        question: 'Bir günde her talaşlı operatör hangi görevlerde ne kadar verimli çalıştı?',
        topic: 'verimlilik',
        icon: 'fas fa-chart-line',
        departments: ['machining'],
    },
    {
        route: '/manufacturing/machining/reports/performance',
        title: 'Performans Raporu',
        question: 'Bir dönemde talaşlı operatörlerin saatleri, tamamladığı görevler, verimliliği ve zamanında bitirme oranı ne?',
        topic: 'verimlilik',
        icon: 'fas fa-tachometer-alt',
        departments: ['machining'],
    },
    {
        route: '/manufacturing/machining/reports/sum-report',
        title: 'Toplam Raporu',
        question: 'Bir zaman aralığında zamanlayıcı saatleri kullanıcıya, makineye, işe ya da göreve göre toplam ne kadar?',
        topic: 'verimlilik',
        icon: 'fas fa-chart-pie',
        departments: ['machining'],
    },
    {
        route: '/manufacturing/machining/reports/history',
        title: 'Makine Çalışma Geçmişi',
        question: 'Her makine bir gün ya da hafta boyunca ne zaman çalıştı, bekledi ya da boşta kaldı?',
        topic: 'uretim',
        icon: 'fas fa-history',
        departments: ['machining'],
        keywords: ['kapasite geçmişi', 'gantt'],
    },
    {
        route: '/manufacturing/machining/reports/production-plan',
        title: 'Üretim Planı',
        question: 'Her talaşlı makinede ne kadar planlı iş sırada ve plan ne zaman bitiyor?',
        topic: 'uretim',
        icon: 'fas fa-calendar-alt',
        departments: ['machining'],
    },

    // ---- CNC, kaynak, bakım, taşeron ----
    {
        route: '/manufacturing/cnc-cutting/reports/parts-search',
        title: 'Parça Arama',
        question: 'Bir CNC parçası hangi nestingte, hangi plakadan ve ne zaman kesildi ya da kesilecek?',
        topic: 'uretim',
        icon: 'fas fa-search',
        departments: ['cnc'],
    },
    {
        route: '/manufacturing/welding/reports/user-work-hours',
        title: 'Çalışan Çalışma Saatleri',
        question: 'Kaynakçılar normal, fazla mesai ve tatil olarak kaç saat işledi, hangi işlere?',
        topic: 'personel',
        icon: 'fas fa-user-clock',
        departments: ['welding'],
    },
    {
        route: '/manufacturing/maintenance/reports/faults',
        title: 'Arızalar Özeti',
        question: 'Hangi makinede kaç arıza ve ne kadar duruş oldu?',
        topic: 'bakim',
        icon: 'fas fa-file-alt',
        departments: ['maintenance'],
    },
    {
        route: '/manufacturing/maintenance/reports/monthly-metrics',
        title: 'Aylık Metrikler',
        question: 'Arıza sayısı, çözüm süresi ve duruş aydan aya nasıl değişiyor?',
        topic: 'bakim',
        icon: 'fas fa-chart-bar',
        departments: ['maintenance'],
    },
    {
        route: '/manufacturing/maintenance/reports/staff-report',
        title: 'Personel Faaliyet Raporu',
        question: 'Bakım personeli bir ayda kaç arıza çözdü ve ne kadar çalıştı?',
        topic: 'bakim',
        icon: 'fas fa-users-cog',
        departments: ['maintenance'],
    },
    {
        route: '/manufacturing/subcontracting/overview',
        title: 'Taşeron Genel Bakış',
        question: 'Her taşeron hangi ay ve kalemde ne kadar iş yaptı, ne faturalandı, ne kaldı?',
        topic: 'maliyet',
        icon: 'fas fa-handshake',
        departments: ['subcontracting'],
        keywords: ['hakediş', 'kg'],
    },

    // ---- Canlı panolar ----
    {
        route: '/manufacturing/machining/dashboard',
        title: 'Talaşlı İmalat Dashboard',
        question: 'Şu an hangi talaşlı zamanlayıcılar çalışıyor, ne kadar verimliler ve makineler ne kadar dolu?',
        topic: 'canli',
        icon: 'fas fa-chart-line',
        departments: ['machining'],
    },
    {
        route: '/manufacturing/cnc-cutting/dashboard',
        title: 'CNC Kesim Dashboard',
        question: 'Şu an hangi CNC zamanlayıcıları çalışıyor ve kesim makineleri ne durumda?',
        topic: 'canli',
        icon: 'fas fa-chart-line',
        departments: ['cnc'],
    },
    {
        route: '/manufacturing/linear-cutting/dashboard',
        title: 'Lineer Kesim Dashboard',
        question: 'Şu an hangi lineer kesim zamanlayıcıları çalışıyor ve hangi makineler dolu?',
        topic: 'canli',
        icon: 'fas fa-chart-line',
        departments: ['linear'],
    },
    {
        route: '/manufacturing/maintenance/dashboard',
        title: 'Bakım Dashboard',
        question: 'Şu an hangi arızalar üzerinde çalışılıyor ve bugün neler çözüldü?',
        topic: 'canli',
        icon: 'fas fa-chart-line',
        departments: ['maintenance'],
    },

    // ---- Mesai ve personel ----
    {
        route: '/general/overtime/cost-report',
        title: 'Mesai Maliyet Raporu',
        question: 'Fazla mesai SGK dahil kaça mal oldu; katsayı, iş, ekip ve kişi bazında?',
        topic: 'maliyet',
        icon: 'fas fa-coins',
        departments: ['overtime'],
    },
    {
        route: '/general/overtime/machining-report',
        title: 'Talaşlı İmalat Mesai Raporu',
        question: 'Onaylı mesaide talaşlı operatörler talep edilen operasyonlarda gerçekten çalıştı mı?',
        topic: 'personel',
        icon: 'fas fa-cogs',
        departments: ['overtime', 'machining'],
    },
    {
        route: '/general/overtime/welding-report',
        title: 'Kaynaklı İmalat Mesai Raporu',
        question: 'Kaynakçıların onaylı mesaisi, işlenen mesai saatleriyle gün gün tutuyor mu?',
        topic: 'personel',
        icon: 'fas fa-fire',
        departments: ['overtime', 'welding'],
        keywords: ['sapma'],
    },
    {
        route: '/human_resources/attendance/summary',
        title: 'PDKS Özeti',
        question: 'Kim kaç gün geldi, izinli ya da devamsızdı; ne kadar geç kaldı ya da erken çıktı?',
        topic: 'personel',
        icon: 'fas fa-user-check',
        departments: ['hr'],
        keywords: ['yoklama', 'devam'],
    },

    // ---- Satın alma ----
    {
        route: '/procurement/reports/items',
        title: 'Ürün Raporu',
        question: 'En çok hangi ürünleri, ne miktarda, kaça ve kimden alıyoruz?',
        topic: 'satinalma',
        icon: 'fas fa-chart-bar',
        departments: ['procurement'],
    },
    {
        route: '/procurement/reports/suppliers',
        title: 'Tedarikçi Raporu',
        question: 'Her tedarikçiye kaç sipariş verdik, ne kadar ödedik, ne kadarı ödenmedi?',
        topic: 'satinalma',
        icon: 'fas fa-chart-pie',
        departments: ['procurement'],
        keywords: ['dbs'],
    },
    {
        route: '/procurement/reports/staff',
        title: 'Personel Raporu',
        question: 'Her satın almacı kaç talep ve sipariş işledi, ne kadar harcama yaptı?',
        topic: 'satinalma',
        icon: 'fas fa-users',
        departments: ['procurement'],
    },

    // ---- Finans ve yönetim ----
    {
        route: '/finance/reports/projects',
        title: 'Proje Raporu',
        question: 'Her iş için ne kadar satın alma taahhüt edildi, ne kadarı ödenmedi, tahmin ne?',
        topic: 'finans',
        icon: 'fas fa-chart-line',
        departments: ['finance'],
    },
    {
        route: '/finance/reports/executive-overview',
        title: 'Yönetici Özeti',
        question: 'Satın alma harcaması, ödenen ve bekleyen tutarlar aydan aya nasıl gidiyor?',
        topic: 'finans',
        icon: 'fas fa-chart-pie',
        departments: ['finance'],
    },
    {
        route: '/management/reports/cash-flow',
        title: 'Nakit Akış Tablosu',
        question: 'Aydan aya ne kadar para girip çıkıyor, kümülatif nakit nerede eksiye düşüyor?',
        topic: 'finans',
        icon: 'fas fa-money-bill-wave',
        departments: ['management', 'finance'],
        keywords: ['dbs', 'giriş', 'çıkış'],
    },
    {
        route: '/management/reports/overview',
        title: 'Genel Bakış',
        question: 'Seçilen dönemde iş emirleri, üretim, satış, taşeron, satın alma ve kalite nasıl gitti?',
        topic: 'yonetim',
        icon: 'fas fa-chart-area',
        departments: ['management'],
    },
    {
        route: '/management/dashboard',
        title: 'Yönetim Dashboard',
        question: 'Fabrikanın hangi alanı şu an kırmızıda ve bugün neye karar verilmeli?',
        topic: 'yonetim',
        icon: 'fas fa-tachometer-alt',
        departments: ['management'],
        keywords: ['fabrika karnesi'],
    },
    {
        route: '/management/analytics',
        title: 'Analitik',
        question: 'Her iş emrinin maliyet kalemleri, satış fiyatı ve marjı ne; en pahalı işler hangileri?',
        topic: 'maliyet',
        icon: 'fas fa-chart-bar',
        departments: ['management'],
        keywords: ['marj'],
    },
    {
        route: '/sales/cost-table',
        title: 'Maliyet Tablosu',
        question: 'Her iş emrinin işçilik, malzeme, taşeron ve diğer maliyetleri toplamda ne kadar?',
        topic: 'maliyet',
        icon: 'fas fa-table',
        departments: ['sales'],
    },
    {
        route: '/it/neo',
        title: 'Neo Kullanımı',
        question: 'Asistan Neo’ya kim ne sordu, hangi konular öne çıkıyor ve maliyeti ne?',
        topic: 'sistem',
        icon: 'fas fa-robot',
        departments: ['it'],
    },
];

// The report hubs: each is the catalog filtered to its departments.
export const REPORT_HUBS = {
    '/manufacturing/reports': {
        title: 'İmalat Raporları',
        departments: ['machining', 'cnc', 'linear', 'welding', 'maintenance', 'subcontracting'],
        backTo: '/manufacturing',
    },
    '/manufacturing/machining/reports': {
        title: 'Talaşlı İmalat Raporları',
        departments: ['machining'],
        backTo: '/manufacturing/machining',
    },
    '/manufacturing/cnc-cutting/reports': {
        title: 'CNC Kesim Raporları',
        departments: ['cnc'],
        backTo: '/manufacturing/cnc-cutting',
    },
    '/manufacturing/welding/reports': {
        title: 'Kaynaklı İmalat Raporları',
        departments: ['welding'],
        backTo: '/manufacturing/welding',
    },
    '/manufacturing/maintenance/reports': {
        title: 'Bakım Raporları',
        departments: ['maintenance'],
        backTo: '/manufacturing/maintenance',
    },
    '/procurement/reports': {
        title: 'Satın Alma Raporları',
        departments: ['procurement'],
        backTo: '/procurement',
    },
    '/finance/reports': {
        title: 'Finans Raporları',
        departments: ['finance'],
        backTo: '/finance',
    },
    '/management/reports': {
        title: 'Yönetim Raporları',
        departments: ['management'],
        backTo: '/management',
    },
};
