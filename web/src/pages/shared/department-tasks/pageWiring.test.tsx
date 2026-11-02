import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { DesignProjectsPage } from '@/pages/design/projects/DesignProjectsPage';
import { LogisticsProjectsPage } from '@/pages/logistics/projects/LogisticsProjectsPage';
import { ManufacturingProjectsPage } from '@/pages/manufacturing/projects/ManufacturingProjectsPage';
import { PlanningProjectsPage } from '@/pages/planning/projects/PlanningProjectsPage';
import { ProcurementProjectsPage } from '@/pages/procurement/projects/ProcurementProjectsPage';
import { renderWithProviders } from '@/test/render';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { username: 'ali' } }) }));

const fetchMock = vi.mocked(authedFetch);

const ROW = {
  id: 5,
  job_order: '300-02',
  job_order_title: 'Kazan',
  status: 'pending',
  subtasks_count: 0,
  assigned_subcontractors: [
    { subcontractor_id: 3, subcontractor_name: 'Usta Kaynak', allocated_weight_kg: '120' },
    { subcontractor_id: 9, subcontractor_name: 'Boyacı' },
  ],
  assigned_teams: [{ team_name: 'A Takımı', allocated_weight_kg: '40' }],
  job_order_total_weight_kg: '800',
};

interface Case {
  name: string;
  Page: ComponentType;
  route: string;
  department: string;
  title: string;
  back: string;
  createButton: boolean;
  extraHeader: string | null;
}

const CASES: Case[] = [
  {
    name: 'design',
    Page: DesignProjectsPage,
    route: '/design/projects/',
    department: 'design',
    title: 'Dizayn Departmanı Görevleri',
    back: '/design/',
    createButton: true,
    extraHeader: null,
  },
  {
    name: 'logistics',
    Page: LogisticsProjectsPage,
    route: '/logistics/projects/',
    department: 'logistics',
    title: 'Lojistik Departmanı Görevleri',
    back: '/logistics/',
    createButton: false,
    extraHeader: null,
  },
  {
    name: 'manufacturing',
    Page: ManufacturingProjectsPage,
    route: '/manufacturing/projects/',
    department: 'manufacturing',
    title: 'İmalat Departmanı Görevleri',
    back: '/manufacturing/',
    createButton: false,
    extraHeader: 'İş Emri Ağırlığı',
  },
  {
    name: 'planning',
    Page: PlanningProjectsPage,
    route: '/planning/projects/',
    department: 'planning',
    title: 'Planlama Departmanı Görevleri',
    back: '/planning/',
    createButton: false,
    extraHeader: 'Taşeron / Takım',
  },
  {
    name: 'procurement',
    Page: ProcurementProjectsPage,
    route: '/procurement/projects/',
    department: 'procurement',
    title: 'Satın Alma Departmanı Görevleri',
    back: '/procurement/',
    createButton: false,
    extraHeader: null,
  },
];

const EXTRA_HEADERS = ['İş Emri Ağırlığı', 'Taşeron / Takım'];

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    const body =
      path === '/projects/department-tasks/'
        ? { count: 1, next: null, previous: null, results: [ROW] }
        : path === '/users/dropdown/'
          ? []
          : path.endsWith('_choices/')
            ? []
            : {};
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
});

describe.each(CASES)(
  '$name/projects',
  ({ Page, route, department, title, back, createButton, extraHeader }) => {
    it('renders the shared component with its department config', async () => {
      renderWithProviders(
        <ModalsProvider>
          <Page />
        </ModalsProvider>,
        { route },
      );
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
      expect(screen.getByText('Görevleri görüntüleyin, başlatın ve yönetin')).toBeInTheDocument();
      expect(document.querySelector(`a[href="${back}"]`)).not.toBeNull();
      expect(await screen.findByText('Kazan')).toBeInTheDocument();

      const list = fetchMock.mock.calls
        .map(([u]) => new URL(String(u)))
        .find((u) => u.pathname === '/projects/department-tasks/')!;
      expect(list.searchParams.get('department')).toBe(department);
      const users = fetchMock.mock.calls
        .map(([u]) => new URL(String(u)))
        .find((u) => u.pathname === '/users/dropdown/')!;
      expect(users.searchParams.get('department_code')).toBe(department);

      expect(Boolean(screen.queryByRole('button', { name: /Yeni Görev/ }))).toBe(createButton);
      for (const header of EXTRA_HEADERS) {
        expect(Boolean(screen.queryByRole('columnheader', { name: header }))).toBe(
          header === extraHeader,
        );
      }
    });
  },
);

it('planning lists subcontractors and teams, without the fixed paint subcontractor', async () => {
  renderWithProviders(
    <ModalsProvider>
      <PlanningProjectsPage />
    </ModalsProvider>,
    { route: '/planning/projects/' },
  );
  expect(await screen.findByText('Usta Kaynak')).toBeInTheDocument();
  expect(screen.getByText('A Takımı')).toBeInTheDocument();
  expect(screen.queryByText('Boyacı')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByText('(120,00 kg)')).toBeInTheDocument());
});
