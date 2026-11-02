import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ProjectsHubPage } from '../projects/ProjectsHubPage';
import { ManagementHubPage } from './ManagementHubPage';
import { ManagementReportsHubPage } from './reports/ManagementReportsHubPage';

const granted = vi.hoisted(() => ({ routes: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) => granted.routes === null || granted.routes.has(route.replace(/\/$/, '')),
}));

const cardTitles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

beforeEach(() => {
  granted.routes = null;
});

it('management hub: the three legacy cards, each linking where it did', () => {
  renderWithProviders(<ManagementHubPage />, { route: '/management/' });

  expect(screen.getByRole('heading', { name: 'Yönetim Modülü' })).toBeInTheDocument();
  expect(cardTitles()).toEqual(['Dashboard', 'Raporlar', 'Analitik']);
  expect(screen.getByRole('link', { name: 'Raporlar' })).toHaveAttribute('href', '/management/reports');
});

it('management hub: cards the user cannot open are hidden', () => {
  granted.routes = new Set(['/management/dashboard']);
  renderWithProviders(<ManagementHubPage />, { route: '/management/' });

  expect(cardTitles()).toEqual(['Dashboard']);
});

it('reports and projects hubs keep their cards and order', () => {
  const { unmount } = renderWithProviders(<ManagementReportsHubPage />, { route: '/management/reports/' });
  expect(cardTitles()).toEqual(['Genel Bakış', 'Nakit Akış Tablosu']);
  unmount();

  renderWithProviders(<ProjectsHubPage />, { route: '/projects/' });
  expect(cardTitles()).toEqual(['Proje Takibi', 'Tahminler', 'Referanslar']);
});
