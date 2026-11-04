import { authedFetch } from '@/auth/authService';
import { exportPagesToPdf } from '@/lib/pdfExport';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ProjectPlanningPage } from './ProjectPlanningPage';
import { testBoard } from './testBoard';

vi.setConfig({ testTimeout: 30_000 });

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/lib/pdfExport', () => ({ exportPagesToPdf: vi.fn() }));

const fetchMock = vi.mocked(authedFetch);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function serve() {
  const saves: unknown[] = [];
  fetchMock.mockImplementation(async (url, init) => {
    const u = new URL(String(url));
    if (u.pathname === '/welding/planning/board/') return json(testBoard());
    if (u.pathname === '/welding/planning/bulk-save/' && init?.method === 'POST') {
      saves.push(JSON.parse(String(init.body)));
      return json({ saved: true, board: testBoard() });
    }
    return json({}, 404);
  });
  return saves;
}

function renderPage() {
  return renderWithProviders(
    <ModalsProvider>
      <ProjectPlanningPage />
    </ModalsProvider>,
    { route: '/planning/project-planning' },
  );
}

const cell = (rowKey: string, field: string) =>
  document.querySelector<HTMLElement>(`.pg-cell[data-row="${rowKey}"][data-field="${field}"]`);

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
});

describe('ProjectPlanningPage', () => {
  it('shows the resource tabs and the first resource sheet', async () => {
    serve();
    renderPage();
    expect(await screen.findByRole('tab', { name: /Ekip 1/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /HARUN METAL/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Tümü/ })).toBeInTheDocument();
    expect(await screen.findByText('COOLED PANEL 4', { selector: '.pg-sub' })).toBeInTheDocument();
    expect(screen.getByText('Montaj')).toBeInTheDocument();
    // 100-102 holds 2000 kg of a 1500 kg job.
    expect(screen.getByText('Aşırı tahsis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.test/welding/planning/board/');
  });

  it('edits the İmalat duration and saves it in one bulk save', async () => {
    const saves = serve();
    renderPage();
    await screen.findByText('Montaj');
    const duration = cell('293-03-07-manufacturing', 'duration_wd')!;
    expect(duration).toHaveClass('pg-editable');
    fireEvent.click(duration);
    const input = within(duration).getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '40' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(cell('293-03-07-manufacturing', 'duration_wd')).toHaveTextContent('40 g');
    // A department edit is not the resource's: no dirty dot on the tab (legacy too).
    expect(
      screen
        .getByRole('tab', { name: /Ekip 1/ })
        .querySelector('[title="Kaydedilmemiş değişiklik"]'),
    ).toBeNull();

    const save = screen.getByRole('button', { name: 'Kaydet' });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toMatchObject({
      new_blocks: [],
      blocks: [],
      deleted_blocks: [],
      department_tasks: [{ task_id: 902, status: 'in_progress', duration_wd: 40 }],
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled());
  });

  it('shows a refused edit and keeps the old value', async () => {
    const error = vi.spyOn(notify, 'error').mockImplementation(() => '');
    serve();
    renderPage();
    await screen.findByText('Montaj');
    const progress = cell('internal_team-11-stage-s51', 'progress')!;
    fireEvent.click(progress);
    const input = within(progress).getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '140' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect((error.mock.calls[0]![0] as Error).message).toBe(
      'İlerleme 0 ile 100 arasında olmalıdır.',
    );
    expect(cell('internal_team-11-stage-s51', 'progress')).toHaveTextContent('40%');
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
  });

  it('switches to Tümü with the unassigned section and filters by text', async () => {
    serve();
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Tümü/ }));
    expect(await screen.findByText('Atanmamış / Eksik Atanan — 1 iş')).toBeInTheDocument();
    expect(cell('all-unassigned-9', 'title')).toHaveTextContent('195-35-01 — SILO');

    fireEvent.change(screen.getByRole('textbox', { name: 'Ara' }), { target: { value: 'hopper' } });
    expect(await screen.findByText('1 iş emri · 1 kaynak')).toBeInTheDocument();
    expect(cell('all-unassigned-9', 'title')).toBeNull();
  });

  it('folds and unfolds a job from its group row', async () => {
    serve();
    renderPage();
    await screen.findByText('Montaj');
    const toggle = document.querySelector('.pg-row[data-row="293-03-07-group"] .pg-toggle')!;
    fireEvent.click(toggle);
    expect(screen.queryByText('Montaj')).not.toBeInTheDocument();
    fireEvent.click(document.querySelector('.pg-row[data-row="293-03-07-group"] .pg-toggle')!);
    expect(screen.getByText('Montaj')).toBeInTheDocument();
  });

  it('exports what is on screen to PDF pages', async () => {
    serve();
    const success = vi.spyOn(notify, 'success').mockImplementation(() => '');
    renderPage();
    await screen.findByText('Montaj');
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(exportPagesToPdf).toHaveBeenCalledTimes(1));
    const [pages, options] = vi.mocked(exportPagesToPdf).mock.calls[0]!;
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]!.querySelector('.pg-pdf-head-sub')).toHaveTextContent('Ekip 1');
    // Every open row of the sheet, none of the interaction.
    const printed = pages.flatMap((page) => [...page.querySelectorAll('.pg-row')]);
    expect(printed.length).toBe(document.querySelectorAll('.pg-scroll .pg-row').length);
    expect(pages[0]!.querySelector('.pg-action-btn, .pg-grip')).toBeNull();
    expect(options?.fileName).toMatch(/^İmalat Planlama - Ekip 1 - \d{4}-\d{2}-\d{2}$/);
    await waitFor(() => expect(success).toHaveBeenCalled());
  });
});
