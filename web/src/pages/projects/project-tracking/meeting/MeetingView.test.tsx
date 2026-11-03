import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { apiFetch, type ApiFetchOptions } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { MeetingView } from './MeetingView';

vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  apiFetch: vi.fn(),
}));

const SLOW = { timeout: 4000 };

const OVERVIEW = {
  generated_at: '2026-11-03T11:32:00Z',
  items: [
    { job_no: '101-10', title: 'Kazan B', customer_name: 'Acme', status: 'active' },
    { job_no: '101-2', title: 'Kazan A', customer_name: 'Acme', status: 'active' },
  ],
};

const BRIEF = {
  quality: { open: 2, total: 5, open_by_severity: { critical: 1, major: 1 }, open_list: [] },
  files: { job_order: { total: 0, items: [] } },
  financial: { verdict: 'healthy', reason: 'Maliyet planda', can_view_details: false },
};

const QUALITY = {
  list: [
    {
      ncr_number: 'NCR-77',
      title: 'Kaynak çatlağı',
      severity: 'critical',
      severity_display: 'Kritik',
      status: 'open',
      status_display: 'Açık',
      job_no: '101-2',
      created_at: '2026-10-30',
    },
  ],
};

const SHEET = { rows: [{ id: 1 }], summary: { rows: 1, late_rows: 2 }, termin: '2026-12-01' };

type Call = { path: string; options: ApiFetchOptions };
const calls = (): Call[] =>
  vi.mocked(apiFetch).mock.calls.map(([path, options]) => ({ path, options: options ?? {} }));

beforeEach(() => {
  localStorage.clear();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(async (path: string, options: ApiFetchOptions = {}) => {
    if (path === '/projects/job-orders/production-plan-overview/') return OVERVIEW;
    if (/\/meeting-brief\/quality\/$/.test(path)) return QUALITY;
    if (/\/meeting-brief\/$/.test(path)) return BRIEF;
    if (/\/plan-sheet\/share\/$/.test(path) && options.method === 'POST') {
      return { token: 'tok-1', expires_at: '2026-11-10T00:00:00Z' };
    }
    if (/\/plan-sheet\/$/.test(path)) return SHEET;
    throw new Error(`not mocked: ${path}`);
  });
});

function Harness({ initial = null, onExit = () => {} }: { initial?: string | null; onExit?: () => void }) {
  const [jobNo, setJobNo] = useState<string | null>(initial);
  return (
    <>
      <output data-testid="url-job">{jobNo ?? ''}</output>
      <MeetingView jobNo={jobNo} onJobChange={setJobNo} onExit={onExit} />
    </>
  );
}

const hero = () => screen.getByTestId('meeting-hero');

it('opens on the first active job (natural job-no order) with the refreshed portfolio', async () => {
  renderWithProviders(<Harness />);
  expect(screen.getByText('Proje portföyü yükleniyor...')).toBeInTheDocument();
  expect(await screen.findByText('1 / 2')).toBeInTheDocument();
  expect(within(hero()).getByText('101-2')).toBeInTheDocument();
  expect(screen.getByTestId('url-job')).toHaveTextContent('101-2');
  const overviewCall = calls().find((c) => c.path === '/projects/job-orders/production-plan-overview/')!;
  expect(overviewCall.options.params).toMatchObject({ status: 'active', refresh: '1' });

  // The brief and the sheet wait for the slide to settle, then fill in.
  expect(await screen.findByText('Kalite · NCR', {}, SLOW)).toBeInTheDocument();
  expect(screen.getByText('2 görev planın gerisinde')).toBeInTheDocument();
  expect(calls().some((c) => c.path === '/projects/job-orders/101-2/meeting-brief/')).toBe(true);
  expect(calls().some((c) => c.path === '/projects/job-orders/101-2/plan-sheet/')).toBe(true);
});

it('moves between slides with the arrow keys and keeps the URL on the slide', async () => {
  renderWithProviders(<Harness initial="101-2" />);
  expect(await screen.findByText('1 / 2')).toBeInTheDocument();

  fireEvent.keyDown(document, { key: 'ArrowRight' });
  expect(await screen.findByText('2 / 2')).toBeInTheDocument();
  expect(within(hero()).getByText('101-10')).toBeInTheDocument();
  expect(screen.getByTestId('url-job')).toHaveTextContent('101-10');

  // Past the last slide nothing happens.
  fireEvent.keyDown(document, { key: 'ArrowRight' });
  expect(screen.getByText('2 / 2')).toBeInTheDocument();

  fireEvent.keyDown(document, { key: 'ArrowLeft' });
  expect(await screen.findByText('1 / 2')).toBeInTheDocument();
  expect(screen.getByTestId('url-job')).toHaveTextContent('101-2');
});

it('jumps to a job from the search box', async () => {
  renderWithProviders(<Harness />);
  const box = await screen.findByLabelText('İş emrine git');
  fireEvent.change(box, { target: { value: '101-1' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  expect(await screen.findByText('2 / 2')).toBeInTheDocument();
});

it('opens a section modal from its tile and fetches the section', async () => {
  renderWithProviders(<Harness />);
  const tile = (await screen.findByText('Kalite · NCR', {}, SLOW)).closest('[role="button"]')!;
  fireEvent.click(tile);

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Kalite · NCR Detayı')).toBeInTheDocument();
  expect(await within(dialog).findByText('NCR-77')).toBeInTheDocument();
  expect(within(dialog).getByText('Kaynak çatlağı')).toBeInTheDocument();
  expect(calls().some((c) => c.path === '/projects/job-orders/101-2/meeting-brief/quality/')).toBe(true);

  // Esc closes the modal, not the deck; arrows are muted while it is open.
  fireEvent.keyDown(document, { key: 'ArrowRight' });
  expect(screen.getByText('1 / 2')).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('1 / 2')).toBeInTheDocument();
});

it('creates a customer link with the chosen columns and options', async () => {
  renderWithProviders(<Harness />);
  fireEvent.click(await screen.findByText('PDF / Bağlantı', {}, SLOW));
  const dialog = await screen.findByRole('dialog');

  fireEvent.click(within(dialog).getByLabelText('Neden'));
  fireEvent.change(within(dialog).getByLabelText('Bağlantının geçerlilik süresi'), { target: { value: '14' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Müşteri bağlantısı/ }));

  const url = (await within(dialog).findByLabelText('Bağlantı')) as HTMLInputElement;
  expect(url.value).toBe(`${window.location.origin}/projects/plan-sheet/?share=tok-1`);
  const post = calls().find((c) => c.path === '/projects/job-orders/101-2/plan-sheet/share/')!;
  expect(post.options.method).toBe('POST');
  expect(post.options.body).toEqual({
    columns: ['title', 'plan_start', 'plan_end', 'plan_wd', 'progress', 'status', 'deviation', 'projected_end'],
    expires_in_days: 14,
    editable: false,
    options: { expand_all: true, main_only: false, show_header: true, language: 'tr', collapsed: [] },
  });
  // The choice is remembered for next time.
  expect(JSON.parse(localStorage.getItem('pp.sheetShare')!)).toMatchObject({ days: 14, language: 'tr' });
});

it('leaves the deck with Esc and with Çık', async () => {
  const onExit = vi.fn();
  renderWithProviders(<Harness onExit={onExit} />);
  await screen.findByText('1 / 2');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onExit).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: /Çık/ }));
  expect(onExit).toHaveBeenCalledTimes(2);
});

it('shows the error state with a retry when the portfolio fails', async () => {
  vi.mocked(apiFetch).mockImplementation(async () => {
    throw new Error('Sunucu hatası');
  });
  renderWithProviders(<Harness />);
  expect(await screen.findByText('Proje portföyü yüklenemedi.')).toBeInTheDocument();
  expect(screen.getByText('Sunucu hatası')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Tekrar Dene/ })).toBeInTheDocument();
});
