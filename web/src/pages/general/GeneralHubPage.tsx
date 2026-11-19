import { MenuCards, type MenuCard } from '@/ui';
import { waitingBadge } from '../hubFigures';
import { useCranePendingCount, useDepartmentRequestPendingCount } from './generalHubData';

/**
 * Talepler (was Genel, reorganised 2026-11-19): the requests that cross
 * departments, nothing else. Makineler moved to Depo, Mesailer to İnsan
 * Kaynakları and İSG to its own section; leave and overtime (balance,
 * requests, approvals) live in the user menu. /general stays always allowed;
 * each card shows only to users who can open it, and its pill counts what
 * waits on the user behind it.
 */
export function GeneralHubPage() {
  const department = useDepartmentRequestPendingCount();
  const crane = useCranePendingCount();

  const cards: MenuCard[] = [
    {
      title: 'Departman Talepleri',
      description: 'Departman taleplerinin oluşturulması, onay süreçleri ve takibi.',
      icon: 'fas fa-boxes',
      iconColor: 'info',
      link: '/general/department-requests',
      badge: waitingBadge(department.data, 'onayınızı bekliyor', 'yellow'),
    },
    {
      title: 'Vinç Talepleri',
      description: 'Vinç taleplerinin oluşturulması, onay süreçleri ve fiyat listesi.',
      icon: 'fas fa-truck-pickup',
      iconColor: 'secondary',
      link: '/general/crane-requests',
      badge: waitingBadge(crane.data, 'onayınızı bekliyor', 'yellow'),
    },
    {
      title: 'Fason',
      description:
        'Atölyenin fason işleri: satınalma ve malzeme yan yana; depodan tedarikçiye gidiş ve dönüş.',
      icon: 'fas fa-people-carry',
      iconColor: 'warning',
      link: '/general/fason',
    },
  ];

  return (
    <MenuCards
      title="Talepler"
      subtitle="Departman ve vinç talepleri, atölyenin fason işleri"
      compact
      cards={cards}
    />
  );
}
