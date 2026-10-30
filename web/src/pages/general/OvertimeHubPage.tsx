import { MenuCards, type MenuCard } from '@/ui';
import { countValue, usePendingApprovalCount } from '../hubFigures';

const PENDING = '/general/overtime/pending';

export function OvertimeHubPage() {
  const pending = usePendingApprovalCount('overtime', PENDING);

  // Ported from general/overtime/overtime.js.
  const cards: MenuCard[] = [
    {
      title: 'Bekleyen Talepler',
      description: 'Onay bekleyen mesai taleplerinin listesi ve durum takibi.',
      icon: 'fas fa-clock',
      iconColor: 'warning',
      link: PENDING,
      stat: { value: countValue(pending), label: 'onayınızı bekliyor' },
    },
    {
      title: 'Kayıt Defteri',
      description: 'Tüm mesai taleplerinin geçmişi ve kayıt defteri.',
      icon: 'fas fa-archive',
      iconColor: 'info',
      link: '/general/overtime/registry',
    },
    {
      title: 'Mesai Kullanıcıları',
      description: 'Belirli bir tarihte mesai yapacak kullanıcıların listesi.',
      icon: 'fas fa-users',
      iconColor: 'primary',
      link: '/general/overtime/users',
    },
    {
      title: 'Talaşlı İmalat Mesai Raporu',
      description: 'Onaylı mesailerdeki operasyonların o gün çalışılıp çalışılmadığı ve süreleri.',
      icon: 'fas fa-cogs',
      iconColor: 'success',
      link: '/general/overtime/machining-report',
    },
    {
      title: 'Kaynaklı İmalat Mesai Raporu',
      description: 'Onaylı mesai saatleri ile kaynak zaman kayıtlarının karşılaştırması ve sapmalar.',
      icon: 'fas fa-fire',
      iconColor: 'danger',
      link: '/general/overtime/welding-report',
    },
    {
      title: 'Mesai Maliyet Raporu',
      description: 'Seçilen dönemdeki toplam mesai maliyeti; ekip, kişi ve iş bazında dağılım.',
      icon: 'fas fa-coins',
      iconColor: 'warning',
      link: '/general/overtime/cost-report',
    },
  ];

  return (
    <MenuCards title="Mesai Talepleri" subtitle="Mesai taleplerinin yönetimi ve takibi" cards={cards} />
  );
}
