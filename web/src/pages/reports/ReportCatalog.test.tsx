import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { fireEvent, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { ReportCenterPage } from './ReportCenterPage';
import { ReportHubPage } from './ReportHubPage';

vi.mock('@legacy/apis/accessControl.js', () => ({ hasRouteAccess: vi.fn() }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 7 } }) }));

const accessMock = vi.mocked(hasRouteAccess);

const GRANTED = new Set([
  '/procurement/reports/items',
  '/procurement/reports/suppliers',
  '/procurement/reports/staff',
  '/finance/reports/projects',
  '/management/reports/cash-flow',
  '/manufacturing/maintenance/reports/faults',
]);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

const cardTitles = () => screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);
const groupTitles = () =>
  screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent?.replace(/\d+$/, ''));

beforeEach(() => {
  localStorage.clear();
  accessMock.mockReset();
  accessMock.mockImplementation((route: string) => GRANTED.has(route));
});

it('lists only the reports the user can open, grouped by topic, each with its question', () => {
  renderWithProviders(<ReportCenterPage />, { route: '/reports' });

  expect(screen.getByRole('heading', { name: 'Rapor Merkezi', level: 1 })).toBeInTheDocument();
  expect(groupTitles()).toEqual(['Bakım', 'Satın Alma', 'Finans']);
  expect(cardTitles()).toEqual([
    'Arızalar Özeti',
    'Ürün Raporu',
    'Tedarikçi Raporu',
    'Personel Raporu',
    'Proje Raporu',
    'Nakit Akış Tablosu',
  ]);
  expect(screen.getByText('Hangi makinede kaç arıza ve ne kadar duruş oldu?')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ürün Raporu' })).toHaveAttribute('href', '/procurement/reports/items');
});

it('searches and filters by department through the URL', () => {
  renderWithProviders(
    <>
      <ReportCenterPage />
      <LocationProbe />
    </>,
    { route: '/reports' },
  );

  fireEvent.change(screen.getByLabelText('Rapor ara'), { target: { value: 'tedarikçi' } });
  expect(cardTitles()).toEqual(['Tedarikçi Raporu']);
  expect(screen.getByTestId('location')).toHaveTextContent('q=tedarik');

  fireEvent.change(screen.getByLabelText('Rapor ara'), { target: { value: 'kayıp rapor' } });
  expect(screen.getByText('Aramanıza uyan rapor yok.')).toBeInTheDocument();
});

it('opens with the department from the URL and drops one the user has nothing in', () => {
  const { unmount } = renderWithProviders(<ReportCenterPage />, { route: '/reports?dept=finance' });
  expect(cardTitles()).toEqual(['Proje Raporu', 'Nakit Akış Tablosu']);
  unmount();

  renderWithProviders(<ReportCenterPage />, { route: '/reports?dept=welding' });
  expect(cardTitles()).toHaveLength(6);
});

it('pins favourites on top and remembers them for the user', () => {
  const { unmount } = renderWithProviders(<ReportCenterPage />, { route: '/reports' });

  fireEvent.click(screen.getByRole('button', { name: 'Nakit Akış Tablosu: favorilere ekle' }));
  expect(groupTitles()[0]).toBe('Favoriler');
  const favourites = screen.getByRole('region', { name: /Favoriler/ });
  expect(within(favourites).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Nakit Akış Tablosu',
  ]);
  expect(JSON.parse(localStorage.getItem('gk.reportFavourites.7')!)).toEqual(['/management/reports/cash-flow']);
  unmount();

  renderWithProviders(<ReportCenterPage />, { route: '/reports' });
  expect(groupTitles()[0]).toBe('Favoriler');
  fireEvent.click(screen.getByRole('button', { name: 'Nakit Akış Tablosu: favorilerden çıkar' }));
  expect(groupTitles()).toEqual(['Bakım', 'Satın Alma', 'Finans']);
});

it('says so when there is nothing to open', () => {
  accessMock.mockReturnValue(false);
  renderWithProviders(<ReportCenterPage />, { route: '/reports' });
  expect(screen.getByText('Açabileceğiniz bir rapor yok.')).toBeInTheDocument();
});

it('shows a hub as the catalog filtered to its departments, merged reports at their view', () => {
  accessMock.mockReturnValue(true);
  renderWithProviders(<ReportHubPage />, { route: '/manufacturing/cnc-cutting/reports/' });

  expect(screen.getByRole('heading', { name: 'CNC Kesim Raporları', level: 1 })).toBeInTheDocument();
  expect(cardTitles()).toEqual(['Biten Zamanlayıcılar', 'Kullanıcı Raporu', 'Parça Arama', 'CNC Kesim Dashboard']);
  expect(screen.getByRole('link', { name: 'Biten Zamanlayıcılar' })).toHaveAttribute(
    'href',
    '/manufacturing/reports/finished-timers?module=cnc_cutting',
  );
  // One department: no department filter; a way to the whole catalog.
  expect(screen.queryByLabelText('Departman')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Tüm Raporlar' })).toHaveAttribute('href', '/reports');
});
