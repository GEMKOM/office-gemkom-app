import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQueries } from '@tanstack/react-query';
import { supplierCountQueryOptions } from '@/api/procurement/hubs';
import { MenuCards, type MenuCard, type PageFigure } from '@/ui';
import { countFigure, countValue } from '../hubCount';

const LIST = '/procurement/suppliers/list';

export function SuppliersHubPage() {
  const canList = hasRouteAccess(LIST);
  const [all, watch, blacklisted] = useQueries({
    queries: [undefined, 'watch', 'blacklisted'].map((status) => ({
      ...supplierCountQueryOptions(status),
      enabled: canList,
    })),
  });

  // Ported from procurement/suppliers/suppliers.js.
  const cards: MenuCard[] = [
    {
      title: 'Tedarikçi Listesi',
      description: 'Tedarikçi bilgileri, performans takibi ve tedarikçi değerlendirme yönetimi.',
      icon: 'fas fa-list',
      iconColor: 'primary',
      link: LIST,
      stat: { value: countValue(all!), label: 'aktif tedarikçi' },
    },
    {
      title: 'Ödeme Koşulları',
      description: 'Ödeme koşulları tanımlama, düzenleme ve tedarikçi bazında yönetimi.',
      icon: 'fas fa-credit-card',
      iconColor: 'success',
      link: '/procurement/suppliers/payment-terms',
    },
  ];

  // The suppliers to be careful with, each opening the list filtered to them.
  const stats: PageFigure[] = canList
    ? [
        countFigure(
          { id: 'suppliers-all', label: 'Aktif Tedarikçi', icon: 'fas fa-handshake', link: LIST },
          all!,
        ),
        countFigure(
          {
            id: 'suppliers-watch',
            label: 'İzlemede',
            icon: 'fas fa-eye',
            link: `${LIST}?supplier_status=watch`,
          },
          watch!,
        ),
        countFigure(
          {
            id: 'suppliers-blacklisted',
            label: 'Kara Liste',
            icon: 'fas fa-ban',
            link: `${LIST}?supplier_status=blacklisted`,
          },
          blacklisted!,
        ),
      ]
    : [];

  return (
    <MenuCards
      title="Tedarikçiler"
      subtitle="Tedarikçi bilgileri ve ödeme koşulları yönetimi"
      stats={stats}
      cards={cards}
    />
  );
}
