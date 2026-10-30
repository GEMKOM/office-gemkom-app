import { MenuCards, PendingValue, type MenuCard, type PageFigure } from '@/ui';
import { countValue, useIsgSummary } from '../hubFigures';

const ISSUES = '/isg/issues';
const MINE = '/isg/issues?mine=true';

export function IsgHubPage() {
  // One request for every figure; the same counters as the cards on the list.
  const summary = useIsgSummary();
  const count = (key: 'open' | 'overdue' | 'mine_open') =>
    countValue({ data: summary.data && (summary.data[key] ?? 0), isError: summary.isError });

  // Ported from isg/isg.js. Open to everyone (/isg is always allowed).
  const cards: MenuCard[] = [
    {
      title: 'İSG Bildirimleri',
      description: 'Tüm İSG bildirimlerini görüntüleyin, filtreleyin ve takip edin.',
      icon: 'fas fa-helmet-safety',
      iconColor: 'primary',
      link: ISSUES,
    },
    {
      title: 'Bana Atananlar',
      description: 'Size atanmış, henüz kapanmamış İSG aksiyonlarını görün.',
      icon: 'fas fa-user-shield',
      iconColor: 'danger',
      link: MINE,
      stat: { value: count('mine_open'), label: 'açık aksiyon' },
    },
  ];

  // Each figure opens the list behind it (the list reads mine / overdue from the URL).
  const stats: PageFigure[] = [
    { id: 'isg-open', label: 'Açık', value: count('open'), icon: 'fas fa-folder-open', link: ISSUES },
    {
      id: 'isg-overdue',
      label: 'Geciken',
      value: count('overdue'),
      icon: 'fas fa-triangle-exclamation',
      link: '/isg/issues?overdue=true',
    },
    { id: 'isg-mine', label: 'Bana Atanan', value: count('mine_open'), icon: 'fas fa-user-shield', link: MINE },
  ].map((f) => ({ ...f, value: f.value ?? <PendingValue /> }));

  return (
    <MenuCards
      title="İş Sağlığı ve Güvenliği"
      subtitle="İSG bildirimlerini takip edin, üzerinize atanan aksiyonları kapatın"
      stats={stats}
      cards={cards}
    />
  );
}
