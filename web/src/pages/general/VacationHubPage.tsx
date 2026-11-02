import { MenuCards, type MenuCard } from '@/ui';
import { countValue, usePendingApprovalCount } from '../hubFigures';

const PENDING = '/general/vacation/pending';

export function VacationHubPage() {
  const pending = usePendingApprovalCount('vacation', PENDING);

  // Ported from general/vacation/vacation.js.
  const cards: MenuCard[] = [
    {
      title: 'İzin Taleplerim',
      description: 'Yeni izin talebi oluşturun, bakiyenizi görün ve taleplerinizi yönetin.',
      icon: 'fas fa-calendar-plus',
      iconColor: 'primary',
      link: '/general/vacation/requests',
    },
    {
      title: 'Bekleyen Onaylar',
      description: 'Onayınızda olan izin taleplerini onaylayın veya reddedin.',
      icon: 'fas fa-user-check',
      iconColor: 'warning',
      link: PENDING,
      stat: { value: countValue(pending), label: 'onayınızı bekliyor' },
    },
  ];

  return (
    <MenuCards
      title="İzin Talepleri"
      subtitle="İzin taleplerinizi oluşturun, takip edin ve onay süreçlerini yönetin"
      cards={cards}
    />
  );
}
