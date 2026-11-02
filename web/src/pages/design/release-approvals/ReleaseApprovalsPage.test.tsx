import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, type ApiFetchOptions } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ReleaseApprovalsPage } from './ReleaseApprovalsPage';

vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  apiFetch: vi.fn(),
  apiUpload: vi.fn(),
}));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 7, username: 'ben' } }) }));

const PENDING = [
  {
    id: 41,
    job_order_no: '293-12',
    job_order_title: 'COPPER PANEL',
    revision_code: 'B2',
    released_by_name: 'Ayşe Yılmaz',
    folder_path: '\\\\nas\\cizim\\293-12\\B2',
    changelog: 'Flanş delikleri güncellendi',
    status: 'pending_approval',
    status_display: 'İnceleme Bekliyor',
    approval_state: { approval_count: 1, required_count: 2 },
    released_at: '2026-11-01T09:00:00Z',
    can_approve: true,
    release_topic_id: 77,
  },
];

const COMPLETED = {
  count: 1,
  results: [
    {
      id: 40,
      job_order_no: '290-01',
      revision_code: 'A1',
      status: 'released',
      status_display: 'Yayınlandı',
      reviewers_summary: 'Caner Şahin (Olumlu), Ben (Olumlu)',
      review_completed_at: '2026-10-28T10:00:00Z',
    },
  ],
};

let approveResponse: { message?: string; published?: boolean } = {
  message: 'Değerlendirmeniz kaydedildi',
  published: false,
};

type Call = { path: string; options: ApiFetchOptions };
const calls = (): Call[] =>
  vi.mocked(apiFetch).mock.calls.map(([path, options]) => ({ path, options: options ?? {} }));
const callsTo = (path: string, method = 'GET') =>
  calls().filter((c) => c.path === path && (c.options.method ?? 'GET') === method);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

beforeEach(() => {
  approveResponse = { message: 'Değerlendirmeniz kaydedildi', published: false };
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(async (path: string, options: ApiFetchOptions = {}) => {
    const method = options.method ?? 'GET';
    if (path === '/projects/drawing-releases/pending_approvals/') return PENDING;
    if (path === '/projects/drawing-releases/completed_reviews/') return COMPLETED;
    if (path === '/projects/drawing-releases/41/') return PENDING[0];
    if (path === '/projects/drawing-releases/41/approve/' && method === 'POST')
      return approveResponse;
    if (path === '/projects/drawing-releases/41/reject/' && method === 'POST') return {};
    if (path === '/projects/discussion-topics/77/')
      return { id: 77, title: 'Rev B2', content: 'Lütfen **flanşlara** bakın' };
    if (path === '/projects/discussion-topics/77/comments/') return [];
    if (path === '/users/dropdown/')
      return [{ id: 1, username: 'caner', full_name: 'Caner Şahin' }];
    if (path === '/organization/groups/') return [];
    throw new Error(`unexpected ${method} ${path}`);
  });
});

function renderPage(route = '/design/release-approvals') {
  return renderWithProviders(
    <ModalsProvider>
      <ReleaseApprovalsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

describe('ReleaseApprovalsPage', () => {
  it('lists the releases waiting for review with their progress', async () => {
    renderPage();
    expect(await screen.findByText('Flanş delikleri güncellendi')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Olumlu' })).toBeInTheDocument();
    expect(callsTo('/projects/drawing-releases/completed_reviews/')).toHaveLength(0);
  });

  it('the history tab keeps its state in the URL and asks the server with the legacy defaults', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Tamamlanan/ }));
    expect(await screen.findByText('Caner Şahin (Olumlu), Ben (Olumlu)')).toBeInTheDocument();
    expect(screen.getByTestId('location').textContent).toContain('tab=completed');
    expect(
      callsTo('/projects/drawing-releases/completed_reviews/')[0]!.options.params,
    ).toMatchObject({
      status__in: 'released,rejected',
      ordering: '-review_completed_at',
      page: 1,
      page_size: 20,
    });
  });

  it('opens a release from ?release_id= with its discussion', async () => {
    renderPage('/design/release-approvals?release_id=41');
    const dialog = await screen.findByRole('dialog', { name: '293-12 — Rev.B2' });
    expect(within(dialog).getByText('1/2')).toBeInTheDocument();
    expect((await within(dialog).findByText('flanşlara')).tagName).toBe('STRONG');
    expect(within(dialog).getByRole('textbox', { name: 'Yorum' })).toBeInTheDocument();
  });

  it('approves after a confirm', async () => {
    const success = vi.spyOn(notify, 'success');
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Olumlu' }));
    const confirmDialog = await screen.findByRole('dialog', { name: 'Olumlu Değerlendirme' });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Evet, Olumlu' }));
    await waitFor(() => expect(success).toHaveBeenCalledWith('Değerlendirmeniz kaydedildi'));
    expect(callsTo('/projects/drawing-releases/41/approve/', 'POST')).toHaveLength(1);
  });

  it('rejecting needs a reason', async () => {
    renderPage('/design/release-approvals?release_id=41');
    const dialog = await screen.findByRole('dialog', { name: '293-12 — Rev.B2' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));
    const reject = await screen.findByRole('dialog', { name: 'Yayını Reddet' });
    fireEvent.click(within(reject).getByRole('button', { name: 'Reddet' }));
    expect(await within(reject).findByText('Reddetme nedeni gereklidir')).toBeInTheDocument();
    fireEvent.change(within(reject).getByLabelText(/Reddetme Nedeni/), {
      target: { value: 'Ölçü hatası' },
    });
    fireEvent.click(within(reject).getByRole('button', { name: 'Reddet' }));
    await waitFor(() =>
      expect(callsTo('/projects/drawing-releases/41/reject/', 'POST')[0]?.options.body).toEqual({
        reason: 'Ölçü hatası',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).not.toContain('release_id'),
    );
  });
});
