import { authedFetch } from '@/auth/authService';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SHEET } from '@/features/plan-sheet/fixtures.test-data';
import { sheetLang } from '@/features/plan-sheet/sheetLang';
import type { PlanSheetLink } from '@/features/plan-sheet/types';
import { theme } from '@/theme';
import { PlanSheetPage } from './PlanSheetPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(authedFetch).mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(search: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <MantineProvider theme={theme}>
      <ModalsProvider>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/projects/plan-sheet/${search}`]}>
            <Routes>
              <Route path="/projects/plan-sheet" element={<PlanSheetPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>,
  );
  const row = (key: string) => view.container.querySelector<HTMLElement>(`[data-row="${key}"]`);
  const cell = (key: string, field: string) => row(key)!.querySelector<HTMLElement>(`[data-field="${field}"]`)!;
  return { ...view, row, cell };
}

function shareLink(link: PlanSheetLink) {
  fetchMock.mockImplementation(async (_url, init) => {
    if (init?.method === 'PATCH') return json(link);
    return json({ link, sheet: SHEET });
  });
}

describe('PlanSheetPage', () => {
  it('opens a share link without the app session', async () => {
    shareLink({ expires_at: '2026-12-31T00:00:00Z', columns: ['plan_end', 'cause'], options: { show_header: true } });
    const { row } = renderPage('?share=tok%2F1');

    expect(await screen.findByText('Kazan Gövdesi', { selector: '[title]' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/projects/plan-sheet/shared/tok%2F1/',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(authedFetch).not.toHaveBeenCalled();
    // The hero, the chain, the link's columns and its validity.
    expect(screen.getAllByText('009-37').length).toBeGreaterThan(0);
    expect(screen.getByText('ACME Enerji')).toBeInTheDocument();
    expect(screen.getByText('Termine göre')).toBeInTheDocument();
    expect(row('task:1')!.querySelectorAll('[data-field]')).toHaveLength(3);
    expect(screen.getByText(/Bu bağlantı 31\.12\.2026 tarihine kadar geçerlidir/)).toBeInTheDocument();
    expect(screen.queryByText(/Düzenlenebilir bağlantı/)).not.toBeInTheDocument();
    expect(document.title).toBe('Plan ve Sapmalar · 009-37');
  });

  it("draws a link's options: English, no hero, department tasks only, folded jobs", async () => {
    shareLink({
      options: {
        language: 'en',
        show_header: false,
        main_only: true,
        expand_all: false,
        collapsed: ['job-009-37-01'],
      },
    });
    const { row } = renderPage('?share=abc');
    expect(await screen.findByText('Plan and Deviations')).toBeInTheDocument();
    expect(screen.getByText('009-37 · Kazan Gövdesi · ACME Enerji')).toBeInTheDocument();
    expect(screen.queryByText('Due date')).not.toBeInTheDocument();
    expect(row('task:3')).toBeNull();
    expect(row('task:4')).toBeNull();
    expect(row('job-009-37-01')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Print \/ PDF/ })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('puts the app back in Turkish when it closes', async () => {
    shareLink({ options: { language: 'en' } });
    const { unmount } = renderPage('?share=abc');
    await screen.findByText('Plan and Deviations');
    unmount();
    expect(sheetLang()).toBe('tr');
  });

  it('says when a link has expired, in the language of the link', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'Not found.' }, 404));
    renderPage('?share=gone&lang=en');
    expect(await screen.findByText('This link was not found or has expired.')).toBeInTheDocument();
  });

  it('asks for a job order when there is neither a link nor a job', async () => {
    renderPage('');
    expect(await screen.findByText('İş emri belirtilmedi.')).toBeInTheDocument();
  });

  it("loads the office's sheet through the session, with the URL's options", async () => {
    vi.mocked(authedFetch).mockResolvedValue(json(SHEET));
    const { row } = renderPage('?job_no=009-37&cols=deviation&head=0&collapsed=job-009-37');
    expect(await screen.findByText('009-37 · Kazan Gövdesi · ACME Enerji')).toBeInTheDocument();
    expect(vi.mocked(authedFetch).mock.calls[0]![0]).toBe('https://api.test/projects/job-orders/009-37/plan-sheet/');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(row('task:1')).toBeNull();
    expect(row('job-009-37')!.querySelectorAll('[data-field]')).toHaveLength(2);
  });

  it('saves the edits of an editable link on the link', async () => {
    shareLink({ editable: true, overrides: { header: { note: 'İlk not' } } });
    const { cell } = renderPage('?share=edit');
    expect(await screen.findByText(/Düzenlenebilir bağlantı/)).toBeInTheDocument();
    expect(screen.getByText('İlk not', { selector: 'div' })).toBeInTheDocument();
    expect(screen.getByText('Değişiklikler kayıtlı')).toBeInTheDocument();

    fireEvent.click(cell('task:1', 'progress'));
    const input = cell('task:1', 'progress').querySelector('input')!;
    fireEvent.change(input, { target: { value: '50' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('Kaydediliyor…')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('https://api.test/projects/plan-sheet/shared/edit/');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({
      overrides: { rows: { 'task:1': { progress: 50 } }, header: { note: 'İlk not' }, view: {} },
    });
    expect(await screen.findByText(/Kaydedildi/)).toBeInTheDocument();
    expect(cell('task:1', 'progress')).toHaveTextContent('%50');
  });

  it('edits the header figures and recomputes the chain', async () => {
    shareLink({ editable: true });
    renderPage('?share=edit');
    await screen.findByText(/Düzenlenebilir bağlantı/);
    const termin = screen.getByLabelText('Termin');
    fireEvent.change(termin, { target: { value: '16.10.2026' } });
    fireEvent.blur(termin);
    // Plan bitişi − Termin is now on the day.
    expect(await screen.findByText('tam gününde')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).overrides.header).toEqual({ termin: '2026-10-16' });

    const bad = screen.getByLabelText('Plan bitişi');
    fireEvent.change(bad, { target: { value: '31.04.2026' } });
    fireEvent.blur(bad);
    expect(bad).toHaveAttribute('aria-invalid', 'true');
  });

  it("picks an editable link's print choices and saves them", async () => {
    shareLink({ editable: true });
    const { row } = renderPage('?share=edit');
    await screen.findByText(/Düzenlenebilir bağlantı/);
    fireEvent.click(screen.getByRole('button', { name: /Yazdır \/ PDF/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('Neden'));
    fireEvent.click(within(dialog).getByLabelText(/Başlık bölümünü göster/));
    fireEvent.change(within(dialog).getByLabelText('Dil (PDF)'), { target: { value: 'en' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Uygula' }));

    await waitFor(() => expect(row('task:1')!.querySelector('[data-field="cause"]')).toBeNull());
    expect(screen.getByText('Plan and Deviations')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).overrides.view).toEqual({
      columns: ['title', 'plan_start', 'plan_end', 'plan_wd', 'progress', 'status', 'deviation', 'projected_end'],
      show_header: false,
      main_only: false,
      expand_all: true,
      language: 'en',
    });
    // The banner and the editing controls stay Turkish.
    expect(screen.getByText(/Düzenlenebilir bağlantı/)).toBeInTheDocument();
  });

  it('prints straight away on a read-only page', async () => {
    shareLink({});
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage('?share=abc');
    fireEvent.click(await screen.findByRole('button', { name: /Yazdır \/ PDF/ }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });
});
