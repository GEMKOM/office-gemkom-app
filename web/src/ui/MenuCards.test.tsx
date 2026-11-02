import { screen } from '@testing-library/react';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { renderWithProviders } from '@/test/render';
import { MenuCards, type MenuCard } from './MenuCards';

vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: vi.fn(),
}));

const granted = new Set(['/procurement/suppliers', '/procurement/reports/spend']);

const cards: MenuCard[] = [
  { title: 'Tedarikçiler', icon: 'fas fa-truck', link: '/procurement/suppliers' },
  { title: 'Ödeme Listeleri', icon: 'fas fa-money-bill', link: '/procurement/payment-lists' },
  {
    title: 'Raporlar',
    icon: 'fas fa-chart-bar',
    features: [
      { label: 'Harcama', link: '/procurement/reports/spend' },
      { label: 'Teslimat', link: '/procurement/reports/delivery' },
    ],
  },
  {
    title: 'Arşiv',
    icon: 'fas fa-archive',
    features: [{ label: 'Eski Siparişler', link: '/procurement/archive' }],
  },
  { title: 'Bilgi', icon: 'fas fa-info', description: 'Bağlantısız kart' },
];

describe('MenuCards', () => {
  beforeEach(() => {
    vi.mocked(hasRouteAccess).mockImplementation((route: string) => granted.has(route));
  });

  it('shows only the cards and features the user may open', () => {
    renderWithProviders(<MenuCards title="Satın Alma" cards={cards} />);

    expect(screen.getByText('Tedarikçiler')).toBeInTheDocument();
    expect(screen.queryByText('Ödeme Listeleri')).not.toBeInTheDocument();

    // A link-less card stays while one of its features is granted...
    expect(screen.getByText('Raporlar')).toBeInTheDocument();
    expect(screen.getByText('Harcama')).toBeInTheDocument();
    expect(screen.queryByText('Teslimat')).not.toBeInTheDocument();
    // ...and goes once none is.
    expect(screen.queryByText('Arşiv')).not.toBeInTheDocument();

    // Informational cards always stay.
    expect(screen.getByText('Bilgi')).toBeInTheDocument();
  });

  it('links cards with real hrefs', () => {
    renderWithProviders(<MenuCards cards={cards} />);
    expect(screen.getByRole('link', { name: 'Tedarikçiler' })).toHaveAttribute(
      'href',
      '/procurement/suppliers',
    );
    expect(screen.getByRole('link', { name: 'Harcama' })).toHaveAttribute(
      'href',
      '/procurement/reports/spend',
    );
  });

  it('puts figures and actions on the band, and a live figure on the card', () => {
    renderWithProviders(
      <MenuCards
        title="Satın Alma"
        stats={[{ label: 'Açık Sipariş', value: '12' }]}
        actions={<button type="button">Yeni Sipariş</button>}
        cards={[
          {
            title: 'Tedarikçiler',
            icon: 'fas fa-truck',
            link: '/procurement/suppliers',
            stat: { value: '148', label: 'aktif tedarikçi' },
            badge: { label: '3 Onay Bekliyor', color: 'yellow' },
          },
          {
            title: 'Bilgi',
            icon: 'fas fa-info',
            stat: { value: undefined, label: 'kayıt' },
          },
        ]}
      />,
    );
    const band = screen.getByRole('banner');
    expect(band).toHaveTextContent('Açık Sipariş');
    expect(band).toHaveTextContent('12');
    expect(screen.getByRole('button', { name: 'Yeni Sipariş' })).toBeInTheDocument();

    const card = screen.getByRole('heading', { name: 'Tedarikçiler' }).closest('article')!;
    expect(card).toHaveTextContent('148 aktif tedarikçi');
    expect(card).toHaveTextContent('3 Onay Bekliyor');
    // A figure still loading shows a placeholder, not a number.
    expect(screen.getByLabelText('Yükleniyor')).toBeInTheDocument();
  });

  it('compact cards keep the description to one line under the title, and panels follow', () => {
    renderWithProviders(
      <MenuCards compact cards={[{ title: 'Bilgi', icon: 'fas fa-info', description: 'Bağlantısız kart' }]}>
        <section>Son Kayıtlar</section>
      </MenuCards>,
    );
    expect(screen.getByText('Bağlantısız kart')).toBeInTheDocument();
    expect(screen.getByText('Son Kayıtlar')).toBeInTheDocument();
  });
});
