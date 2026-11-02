import { MenuCards, type MenuCard } from '@/ui';

// Ported from main.js (the landing page at /). Legacy painted every feature
// icon dark red; here they take their card's colour, since red is kept for
// the band. Cards and feature links the user cannot open hide themselves.
const CARDS: MenuCard[] = [
  {
    title: 'Genel',
    description: 'Çalışanlar, makineler, mesai ve İSG bildirimleri ile genel iş süreçlerini yönetin.',
    icon: 'fas fa-cogs',
    iconColor: 'secondary',
    link: '/general',
    features: [
      { label: 'Makineler', icon: 'fas fa-cogs', link: '/general/machines' },
      { label: 'Mesailer', icon: 'fas fa-clock', link: '/general/overtime' },
      { label: 'Departman Talepleri', icon: 'fas fa-boxes', link: '/general/department-requests' },
      { label: 'İSG Bildirimleri', icon: 'fas fa-helmet-safety', link: '/isg/issues' },
    ],
  },
  {
    title: 'Projeler',
    description: 'Proje takibi ve yönetim işlemlerinizi gerçekleştirin.',
    icon: 'fas fa-project-diagram',
    iconColor: 'primary',
    link: '/projects',
    features: [{ label: 'Proje Takibi', icon: 'fas fa-tasks', link: '/projects/project-tracking' }],
  },
  {
    title: 'Dizayn',
    description: 'Dizayn süreçlerinizi yönetin ve optimize edin.',
    icon: 'fas fa-drafting-compass',
    iconColor: 'dark',
    link: '/design',
    features: [
      { label: 'Projeler', icon: 'fas fa-project-diagram', link: '/design/projects' },
      { label: 'Revizyon Talepleri', icon: 'fas fa-edit', link: '/design/revision-requests' },
      { label: 'Çizim İncelemesi', icon: 'fas fa-search', link: '/design/release-approvals' },
    ],
  },
  {
    title: 'Planlama',
    description: 'Planlama süreçlerini yönetin, stok takibi yapın ve görev şablonlarını oluşturun.',
    icon: 'fas fa-calendar-alt',
    iconColor: 'info',
    link: '/planning',
    features: [
      { label: 'Departman Talepleri', icon: 'fas fa-boxes', link: '/planning/department-requests' },
      { label: 'Görev Şablonları', icon: 'fas fa-tasks', link: '/planning/task-templates' },
      { label: 'Stok', icon: 'fas fa-warehouse', link: '/planning/inventory' },
      { label: 'Projeler', icon: 'fas fa-project-diagram', link: '/planning/projects' },
    ],
  },
  {
    title: 'Kalite Kontrol',
    description: 'KK incelemeleri, uygunsuzluk raporları (NCR) ve kalite maliyet satırlarını yönetin.',
    icon: 'fas fa-clipboard-check',
    iconColor: 'success',
    link: '/quality-control',
    features: [
      { label: 'KK İncelemeleri', icon: 'fas fa-search', link: '/quality-control/qc-reviews' },
      { label: 'Uygunsuzluk Raporları', icon: 'fas fa-exclamation-triangle', link: '/quality-control/ncrs' },
      { label: 'Maliyet Satırları', icon: 'fas fa-euro-sign', link: '/quality-control/cost-lines' },
      { label: 'Kalite Evrakları', icon: 'fas fa-file-alt', link: '/quality-control/documents' },
    ],
  },
  {
    title: 'İmalat',
    description:
      'Üretim süreçlerini yönetin, üretim planlarını takip edin ve kalite standartlarını izleyin.',
    icon: 'fas fa-industry',
    iconColor: 'danger',
    link: '/manufacturing',
    features: [
      { label: 'Talaşlı İmalat', icon: 'fas fa-cog', link: '/manufacturing/machining' },
      { label: 'CNC Kesim', icon: 'fas fa-cut', link: '/manufacturing/cnc-cutting' },
      { label: 'Bakım', icon: 'fas fa-wrench', link: '/manufacturing/maintenance' },
    ],
  },
  {
    title: 'Lojistik',
    description:
      'Lojistik süreçlerini yönetin, sevkiyat takibi yapın ve depo yönetimini optimize edin.',
    icon: 'fas fa-truck',
    iconColor: 'warning',
    link: '/logistics',
    features: [{ label: 'Projeler', icon: 'fas fa-project-diagram', link: '/logistics/projects' }],
  },
  {
    title: 'Satın Alma',
    description: 'Tedarikçi yönetimi, sipariş takibi ve satın alma süreçlerini yönetin.',
    icon: 'fas fa-shopping-cart',
    iconColor: 'success',
    link: '/procurement',
    features: [
      { label: 'Tedarikçi', icon: 'fas fa-truck', link: '/procurement/suppliers' },
      { label: 'Sipariş', icon: 'fas fa-file-invoice', link: '/procurement/purchase-requests' },
      { label: 'Raporlar', icon: 'fas fa-balance-scale', link: '/procurement/reports' },
      { label: 'Ödeme Listeleri', icon: 'fas fa-money-check-dollar', link: '/procurement/payment-lists' },
    ],
  },
  {
    title: 'Finans',
    description:
      'Finansal süreçleri yönetin, mali durumu takip edin ve finansal raporlar oluşturun.',
    icon: 'fas fa-dollar-sign',
    iconColor: 'primary',
    link: '/finance',
    features: [{ label: 'Finans İşlemleri', icon: 'fas fa-coins', link: '/finance/purchase-orders' }],
  },
  {
    title: 'Muhasebe',
    description: 'Muhasebe işlemleri, dışa aktarımlar ve finansal entegrasyonlar.',
    icon: 'fas fa-file-invoice',
    iconColor: 'primary',
    link: '/accounting',
    features: [
      {
        label: 'Hakedişler',
        icon: 'fas fa-file-invoice-dollar',
        link: '/accounting/subcontracting-statements',
      },
    ],
  },
  {
    title: 'Bilgi İşlem',
    description: 'IT cihazlarını yönetin, envanter takibi yapın ve donanım durumunu izleyin.',
    icon: 'fas fa-laptop-code',
    iconColor: 'dark',
    link: '/it',
    features: [{ label: 'Envanter', icon: 'fas fa-desktop', link: '/it/inventory' }],
  },
  {
    title: 'İnsan Kaynakları',
    description: 'Çalışan yönetimi, maaş süreçleri ve insan kaynakları işlemlerini yönetin.',
    icon: 'fas fa-users-cog',
    iconColor: 'info',
    link: '/human_resources',
    features: [
      { label: 'Çalışanlar', icon: 'fas fa-users', link: '/human_resources/users' },
      { label: 'PDKS', icon: 'fas fa-user-check', link: '/human_resources/attendance' },
      { label: 'Organizasyon', icon: 'fas fa-sitemap', link: '/human_resources/org' },
    ],
  },
  {
    title: 'Satış',
    description: 'Müşteri yönetimi, teklif oluşturma ve satış süreçlerini yönetin.',
    icon: 'fas fa-handshake',
    iconColor: 'success',
    link: '/sales',
    features: [
      { label: 'Müşteriler', icon: 'fas fa-users', link: '/sales/customers' },
      { label: 'Teklifler', icon: 'fas fa-file-invoice-dollar', link: '/sales/offers' },
      { label: 'Ürün Kataloğu', icon: 'fas fa-book', link: '/sales/catalog' },
    ],
  },
  {
    title: 'Yönetim',
    description: 'Şirket yönetimi ve analitik işlemlerinizi gerçekleştirin.',
    icon: 'fas fa-chart-line',
    iconColor: 'primary',
    link: '/management',
    features: [
      { label: 'Dashboard', icon: 'fas fa-tachometer-alt', link: '/management/dashboard' },
      { label: 'Raporlar', icon: 'fas fa-chart-bar', link: '/management/reports' },
      { label: 'Analitik', icon: 'fas fa-chart-pie', link: '/management/analytics' },
    ],
  },
];

export function HomePage() {
  return (
    <MenuCards
      title="Çalışma Alanları"
      subtitle="Takımınıza göre ilgili alanı seçin ve verimliliğinizi artırın"
      cards={CARDS}
    />
  );
}
