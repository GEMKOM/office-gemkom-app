import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { HomePage } from './HomePage';

// null: every route opens (admin); a set: only those routes (and the always-open ones).
const access = vi.hoisted(() => ({ granted: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) => {
    const open = ['/', '/general', '/general/discussions', '/isg', '/isg/issues'];
    return access.granted === null || open.includes(route) || access.granted.has(route);
  },
}));

beforeEach(() => {
  access.granted = null;
});

const cardTitles = () =>
  screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);

const card = (title: string) => screen.getByRole('heading', { level: 3, name: title }).closest('article')!;

it('shows every work area in the legacy order', () => {
  renderWithProviders(<HomePage />);

  expect(screen.getByRole('heading', { level: 1, name: 'Çalışma Alanları' })).toBeInTheDocument();
  expect(cardTitles()).toEqual([
    'Genel',
    'Projeler',
    'Dizayn',
    'Planlama',
    'Kalite Kontrol',
    'İmalat',
    'Lojistik',
    'Satın Alma',
    'Finans',
    'Muhasebe',
    'Bilgi İşlem',
    'İnsan Kaynakları',
    'Satış',
    'Yönetim',
  ]);
  const sales = within(card('Satış'));
  expect(sales.getByRole('link', { name: 'Satış' })).toHaveAttribute('href', '/sales');
  expect(sales.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
    '/sales',
    '/sales/customers',
    '/sales/offers',
    '/sales/catalog',
  ]);
});

it('drops the areas and shortcuts the user cannot open', () => {
  access.granted = new Set(['/sales', '/sales/customers']);
  renderWithProviders(<HomePage />);

  expect(cardTitles()).toEqual(['Genel', 'Satış']);
  // Genel is open to all, but only its İSG shortcut is.
  expect(within(card('Genel')).getAllByRole('link').map((link) => link.textContent)).toEqual([
    'Genel',
    'İSG Bildirimleri',
  ]);
  expect(within(card('Satış')).getAllByRole('link').map((link) => link.textContent)).toEqual([
    'Satış',
    'Müşteriler',
  ]);
});
