import { MenuCards, type MenuCard } from '@/ui';
import { PENDING_REQUESTS_LINK, usePendingRequests } from './pendingRequests';

export function PurchaseRequestsHubPage() {
  const pending = usePendingRequests();

  // Ported from procurement/purchase-requests/purchase-requests.js.
  const cards: MenuCard[] = [
    {
      title: 'Talep Oluştur',
      description: 'Yeni satın alma talebi oluşturma ve form yönetimi.',
      icon: 'fas fa-plus',
      iconColor: 'primary',
      link: '/procurement/purchase-requests/create',
    },
    {
      title: 'Bekleyen Talepler',
      description: 'Onay bekleyen satın alma taleplerinin listesi ve durum takibi.',
      icon: 'fas fa-clock',
      iconColor: 'warning',
      link: PENDING_REQUESTS_LINK,
      stat: pending.stat,
    },
    {
      title: 'Kayıt Defteri',
      description: 'Tüm satın alma taleplerinin geçmişi ve kayıt defteri.',
      icon: 'fas fa-archive',
      iconColor: 'info',
      link: '/procurement/purchase-requests/registry',
    },
  ];

  return (
    <MenuCards
      title="Satın Alma Talepleri"
      subtitle="Satın alma taleplerinin yönetimi ve takibi"
      stats={pending.stats}
      cards={cards}
    />
  );
}
