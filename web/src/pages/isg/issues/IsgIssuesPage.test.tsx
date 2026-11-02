import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiUpload, type ApiFetchOptions } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { IsgIssuesPage } from './IsgIssuesPage';

vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  apiFetch: vi.fn(),
  apiUpload: vi.fn(),
}));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 7, username: 'ben' } }) }));

const ISSUES = [
  {
    id: 1,
    issue_number: 'ISG-2026-001',
    title: 'Kaynakhanede baret kullanılmıyor',
    category: 'ppe',
    category_display: 'Kişisel Koruyucu Donanım',
    severity: 'high',
    severity_display: 'Yüksek',
    status: 'open',
    status_display: 'Açık',
    location: 'Kaynakhane B',
    assigned_to: [7],
    assigned_to_data: [{ id: 7, name: 'Ben Kullanıcı' }],
    due_date: '2026-10-30',
    is_overdue: true,
    file_count: 2,
    created_at: '2026-10-20T08:00:00Z',
    discussion_topic_id: null,
  },
  {
    id: 2,
    issue_number: 'ISG-2026-002',
    title: 'Yangın tüpü dolumu',
    severity: 'medium',
    status: 'in_progress',
    assigned_to: [9],
    assigned_to_data: [{ id: 9, name: 'Ayşe Yılmaz' }],
    created_at: '2026-10-21T08:00:00Z',
    discussion_topic_id: null,
  },
];

const FILES = [
  {
    id: 31,
    url: 'https://files.test/foto1',
    name: 'Bulgu fotoğrafı',
    extension: 'jpg',
    file_type_display: 'Fotoğraf',
    uploaded_by_name: 'Ayşe',
  },
];

let canManage = false;

type Call = { path: string; options: ApiFetchOptions };
const calls = (): Call[] =>
  vi.mocked(apiFetch).mock.calls.map(([path, options]) => ({ path, options: options ?? {} }));
const callsTo = (path: string, method = 'GET') =>
  calls().filter((c) => c.path === path && (c.options.method ?? 'GET') === method);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

beforeEach(() => {
  canManage = false;
  vi.mocked(apiUpload).mockReset();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(async (path: string, options: ApiFetchOptions = {}) => {
    const method = options.method ?? 'GET';
    if (path === '/isg/issues/' && method === 'GET')
      return { count: ISSUES.length, results: ISSUES };
    if (path === '/isg/issues/summary/')
      return { total: 12, open: 3, in_progress: 2, resolved: 1, overdue: 1, mine_open: 1 };
    if (path === '/isg/issues/my-permissions/') return { can_manage: canManage };
    if (path === '/users/dropdown/')
      return [{ id: 7, username: 'ben', full_name: 'Ben Kullanıcı' }];
    if (path === '/isg/issues/1/') return ISSUES[0];
    if (path === '/isg/issues/2/') return ISSUES[1];
    if (path === '/isg/issues/1/files/') return FILES;
    if (path === '/isg/issues/2/files/') return [];
    if (path === '/isg/issues/1/start/') return { ...ISSUES[0], status: 'in_progress' };
    if (path === '/isg/issues/1/resolve/') return { ...ISSUES[0], status: 'resolved' };
    if (path === '/isg/issues/' && method === 'POST')
      return { id: 3, issue_number: 'ISG-2026-003' };
    throw new Error(`unexpected ${method} ${path}`);
  });
});

function renderPage(route = '/isg/issues') {
  return renderWithProviders(
    <ModalsProvider>
      <IsgIssuesPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

describe('IsgIssuesPage', () => {
  it('opens on the worklist: open, in progress and awaiting approval', async () => {
    renderPage();
    expect(await screen.findByText('Kaynakhanede baret kullanılmıyor')).toBeInTheDocument();
    const [list] = callsTo('/isg/issues/');
    expect(list!.options.params).toMatchObject({
      status__in: 'open,in_progress,resolved',
      ordering: '-created_at',
      page: 1,
      page_size: 20,
    });
    // The cards follow every filter but the status one.
    await waitFor(() => expect(callsTo('/isg/issues/summary/')).toHaveLength(1));
    expect(callsTo('/isg/issues/summary/')[0]!.options.params).not.toHaveProperty(
      'status__in',
      expect.any(String),
    );
    expect(await screen.findByText('Onay Bekleyen')).toBeInTheDocument();
  });

  it('keeps the legacy comma lists in the URL', async () => {
    renderPage('/isg/issues?status__in=closed,cancelled&mine=true');
    await screen.findByText('Kaynakhanede baret kullanılmıyor');
    expect(callsTo('/isg/issues/')[0]!.options.params).toMatchObject({
      status__in: 'closed,cancelled',
      mine: 'true',
    });
  });

  it('an assignee may work their own issue; only İSG may create or edit', async () => {
    renderPage();
    await screen.findByText('Kaynakhanede baret kullanılmıyor');
    await waitFor(() => expect(callsTo('/isg/issues/my-permissions/')).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Yeni Bildirim' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'İşleme Al' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Düzenle' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'İşleme Al' }));
    await waitFor(() => expect(callsTo('/isg/issues/1/start/', 'POST')).toHaveLength(1));
  });

  it('resolve asks what was done', async () => {
    const success = vi.spyOn(notify, 'success');
    renderPage();
    await screen.findByText('Kaynakhanede baret kullanılmıyor');
    fireEvent.click(screen.getAllByRole('button', { name: 'Giderildi' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Giderildi Olarak İşaretle' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gönder' }));
    expect(
      await within(dialog).findByText('Yapılan işlemi yazmanız gerekiyor'),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/Ne yapıldı/), {
      target: { value: 'Baretler dağıtıldı' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(success).toHaveBeenCalledWith('Bildirim İSG onayına gönderildi'));
    expect(callsTo('/isg/issues/1/resolve/', 'POST')[0]!.options.body).toEqual({
      corrective_action: 'Baretler dağıtıldı',
    });
  });

  it('opens an issue from its number in the URL, with its files', async () => {
    renderPage('/isg/issues?issue=ISG-2026-001');
    const dialog = await screen.findByRole('dialog', { name: /ISG-2026-001 — Kaynakhanede baret/ });
    expect(
      await within(dialog).findByRole('button', { name: 'Bulgu fotoğrafı.jpg' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Tür: Fotoğraf')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Bu bildirim için tartışma konusu bulunamadı.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Tümünü İndir (ZIP)' })).toBeInTheDocument();
    // Assigned to the user, so they may add files.
    expect(within(dialog).getByRole('button', { name: 'Dosya Yükle' })).toBeInTheDocument();
    // Found by searching for the number, as legacy openIssueByNumber did.
    expect(callsTo('/isg/issues/').some((c) => c.options.params?.search === 'ISG-2026-001')).toBe(
      true,
    );

    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Kapat' }).at(-1)!);
    await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('issue='));
  });

  it('uploads files with their type from the details', async () => {
    vi.mocked(apiUpload).mockResolvedValue({ id: 32 });
    renderPage('/isg/issues?issue=ISG-2026-001');
    const dialog = await screen.findByRole('dialog', { name: /ISG-2026-001/ });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Dosya Yükle' }));
    const upload = await screen.findByRole('dialog', { name: 'Dosya Yükle' });
    fireEvent.change(within(upload).getByTestId('file-input'), {
      target: { files: [new File(['x'], 'kanit.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.change(within(upload).getByLabelText('Dosya Adı'), { target: { value: 'Kanıt' } });
    fireEvent.click(within(upload).getByRole('button', { name: 'Yükle' }));
    await waitFor(() => expect(apiUpload).toHaveBeenCalledTimes(1));
    const [path, form] = vi.mocked(apiUpload).mock.calls[0]!;
    expect(path).toBe('/isg/issues/1/files/upload/');
    expect((form as FormData).get('file_type')).toBe('photo');
    expect((form as FormData).get('name')).toBe('Kanıt');
    // Back on the details once the upload is done.
    expect(await screen.findByRole('dialog', { name: /ISG-2026-001/ })).toBeInTheDocument();
  });

  it('İSG creates an issue and must assign someone', async () => {
    canManage = true;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Bildirim' }));
    const dialog = await screen.findByRole('dialog', { name: 'Yeni İSG Bildirimi' });
    fireEvent.change(within(dialog).getByLabelText(/Başlık/), {
      target: { value: 'Merdiven korkuluğu' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Açıklama/), { target: { value: 'Gevşek' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
    expect(await within(dialog).findByText('En az bir kişi atamalısınız')).toBeInTheDocument();
    expect(callsTo('/isg/issues/', 'POST')).toHaveLength(0);
  });
});
