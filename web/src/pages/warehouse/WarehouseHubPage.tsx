import { useQuery } from '@tanstack/react-query';
import { equipmentCountQueryOptions, stockCardCountQueryOptions } from '@/api/planning/hubs';
import { stockCountsQueryOptions } from '@/api/warehouse/counts';
import { hasRouteAccess } from '@/auth/accessControl';
import { BAR_STOCK_ROUTE, PLATE_STOCK_ROUTE } from '@/routes/movedRoutes';
import { MenuCards, visibleMenuCards, type MenuCard } from '@/ui';
import { countValue } from '../hubCount';

const HAMMADDE = '/warehouse/hammadde';
const IS_EMRI = '/warehouse/is-emri';
const STOCK = '/warehouse/stock';
const EQUIPMENT = '/warehouse/equipment';
const MIKRO_COMPARISON = '/warehouse/mikro-comparison';
const RECEIPTS = '/warehouse/goods-receipts';
const PULLS = '/manufacturing/material-tracking/pull-requests';
const SLIPS = '/warehouse/production-slips';
const TRANSFERS = '/warehouse/transfers';
const COUNTS = '/warehouse/counts';
const PIECE_COUNTS = '/warehouse/piece-counts';
const WEIGHT_REDUCTION = '/warehouse/weight-reduction';

/**
 * Depo in the menu's four groups: Stoklar, Giriş / Çıkış, Sayım and Raporlar.
 * A card is a group and lists its pages; a user sees only the pages they can
 * open, and a group with none of them is left out.
 */
export function WarehouseHubPage() {
  const stockCards = useQuery({
    ...stockCardCountQueryOptions(),
    enabled: hasRouteAccess(STOCK),
  });
  const equipment = useQuery({
    ...equipmentCountQueryOptions(),
    enabled: hasRouteAccess(EQUIPMENT),
  });
  const drafts = useQuery({
    ...stockCountsQueryOptions({ status: 'draft', page_size: 1 }),
    enabled: hasRouteAccess(COUNTS),
  });

  const cards: MenuCard[] = [
    {
      title: 'Stoklar',
      description:
        'Hammadde: serbest stok. İş Emri: işlere ayrılmış stok, iş iş. İkisi arasında birkaç tıkla taşıma; sac ve boy parçaları, tüm stok kartları, ekipman.',
      icon: 'fas fa-boxes',
      iconColor: 'blue',
      stat: hasRouteAccess(STOCK)
        ? { value: countValue(stockCards), label: 'stok kartı' }
        : hasRouteAccess(EQUIPMENT)
          ? { value: countValue(equipment), label: 'aktif ekipman' }
          : undefined,
      features: [
        { label: 'Hammadde', icon: 'fas fa-cubes', link: HAMMADDE },
        { label: 'İş Emri', icon: 'fas fa-clipboard-list', link: IS_EMRI },
        { label: 'Sac Stoğu', icon: 'fas fa-layer-group', link: PLATE_STOCK_ROUTE },
        { label: 'Boy Stoğu', icon: 'fas fa-ruler-horizontal', link: BAR_STOCK_ROUTE },
        { label: 'Tüm Stok Kartları', icon: 'fas fa-boxes', link: STOCK },
        { label: 'Ekipman', icon: 'fas fa-toolbox', link: EQUIPMENT },
        { label: 'Mikro Karşılaştırması', icon: 'fas fa-balance-scale', link: MIKRO_COMPARISON },
      ],
    },
    {
      title: 'Giriş / Çıkış',
      description:
        'Gelen malzemenin kabulü, imalata teslim ve iade, depolar ve işler arası aktarım.',
      icon: 'fas fa-exchange-alt',
      iconColor: 'teal',
      features: [
        { label: 'Mal Kabul', icon: 'fas fa-truck-loading', link: RECEIPTS },
        { label: 'İmalata Çıkış Talepleri', icon: 'fas fa-dolly', link: PULLS },
        { label: 'İmalattan İade', icon: 'fas fa-undo', link: SLIPS },
        { label: 'Depo Transferi', icon: 'fas fa-exchange-alt', link: TRANSFERS },
      ],
    },
    {
      title: 'Sayım',
      description:
        'Sayım farkları stoğa düzeltme olarak yansır; sac ve boy parça adediyle sayılır.',
      icon: 'fas fa-clipboard-check',
      iconColor: 'primary',
      stat: hasRouteAccess(COUNTS)
        ? {
            value: drafts.isSuccess ? String(drafts.data.count) : undefined,
            label: 'açık sayım',
          }
        : undefined,
      features: [
        { label: 'Ana Stok Sayımı', icon: 'fas fa-clipboard-check', link: COUNTS },
        { label: 'Sac ve Boy Sayımı', icon: 'fas fa-ruler-combined', link: PIECE_COUNTS },
      ],
    },
    {
      title: 'Raporlar',
      description: 'Biten CNC kesimleri: kullanılan sac, dönen fire saclar ve fire; Mikro dosyası.',
      icon: 'fas fa-chart-bar',
      iconColor: 'orange',
      features: [
        { label: 'Ağırlık Düşüşü', icon: 'fas fa-weight-hanging', link: WEIGHT_REDUCTION },
      ],
    },
  ];

  return (
    <MenuCards
      title="Depo Modülü"
      subtitle="Stoklar, giriş ve çıkışlar, sayım ve raporlar"
      cards={visibleMenuCards(cards)}
    />
  );
}
