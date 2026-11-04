import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, apiUpload, type ApiFetchOptions } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { JobOrderActionsProvider, type JobOrderActions } from '../jobOrderActions';
import { JobOrderDetailModal, releaseReviewUrl } from './JobOrderDetailModal';

const auth = vi.hoisted(() => ({
  groups: ['planlama'] as string[],
  admin: false,
  perms: new Set<string>(),
}));

vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  apiFetch: vi.fn(),
  apiUpload: vi.fn(),
}));
vi.mock('@/auth/authService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasPerm: (perm: string) => auth.perms.has(perm),
}));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 7, username: 'ben', user_groups: auth.groups },
    isAdmin: auth.admin,
  }),
}));
// The Tahmin card has its own tests; here only whether the tab exists matters.
vi.mock('@/pages/projects/estimate-report/EstimateReport', () => ({
  EstimateReport: ({ subject }: { subject: { jobNo: string } }) => (
    <div>Tahmin raporu {subject.jobNo}</div>
  ),
}));

const fetchMock = vi.mocked(apiFetch);
const uploadMock = vi.mocked(apiUpload);

const JOB = {
  job_no: '260-01',
  title: 'Kazan imalatı',
  description: 'Açıklama metni',
  status: 'active',
  status_display: 'Aktif',
  customer_short_name: 'ACME',
  customer_code: 'C-9',
  customer_order_no: 'PO-77',
  quantity: 3,
  incoterms: 'EXW',
  total_weight_kg: '1250.5',
  target_completion_date: '2026-12-01',
  created_by_name: 'Ayşe',
  children_count: 1,
  children: [
    {
      job_no: '260-01-01',
      title: 'Gövde',
      status: 'on_hold',
      hold_kind: 'revision',
      status_display: 'Beklemede',
      completion_percentage: '40',
      quantity: 3,
    },
  ],
  target_date_revisions: [
    {
      id: 5,
      previous_date: '2026-10-01',
      new_date: '2026-12-01',
      reason: 'Malzeme gecikti',
      changed_by_name: 'Mehmet',
      changed_at: '2026-09-20T10:00:00Z',
    },
  ],
};

const TASKS = [
  {
    id: 31,
    department: 'design',
    department_display: 'Dizayn',
    weight: '12.5',
    completion_percentage: '50',
    status: 'in_progress',
    status_display: 'Devam Ediyor',
    assigned_to_name: 'Can',
  },
];

const TOPICS = [
  {
    id: 70,
    title: 'Kaynak sırası',
    priority: 'high',
    priority_display: 'Yüksek',
    created_by_name: 'Ali',
    created_at: '2026-10-01T08:00:00Z',
    comment_count: 4,
    participant_count: 2,
  },
];

type Call = { path: string; options: ApiFetchOptions };
const calls = (): Call[] =>
  fetchMock.mock.calls.map(([path, options]) => ({ path: String(path), options: options ?? {} }));
const requested = (path: string) => calls().some((c) => c.path === path);

let topics = TOPICS;

function route(path: string, options: ApiFetchOptions = {}): unknown {
  const method = options.method ?? 'GET';
  if (path === '/projects/job-orders/260-01/') return JOB;
  if (path === '/projects/job-orders/260-01/phases/') return [];
  if (path === '/projects/job-orders/260-01/department_tasks/') return { results: TASKS };
  if (path === '/projects/job-orders/260-01/files/') return { job_order_files: [], offer_files: [] };
  if (path === '/projects/discussion-topics/' && method === 'POST') return { id: 99 };
  if (path === '/projects/discussion-topics/') return { results: topics };
  if (path === '/projects/discussion-topics/70/')
    return { ...TOPICS[0], content: 'Önce **gövde** kaynaklansın' };
  if (path === '/projects/discussion-topics/70/comments/') return [];
  if (path.startsWith('/assistant/discussion-summaries/'))
    throw new ApiError(403, { detail: 'Yetkisiz' }, 'Yetkisiz');
  if (path === '/subcontracting/price-tiers/') return [];
  throw new Error(`unexpected ${method} ${path}`);
}

function makeActions(overrides: Partial<JobOrderActions> = {}): JobOrderActions {
  return {
    view: vi.fn(),
    edit: vi.fn(),
    reviseTargetDate: vi.fn(),
    start: vi.fn(async () => {}),
    hold: vi.fn(),
    resume: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    recalculateProgress: vi.fn(async () => {}),
    createChild: vi.fn(),
    openTaskPlanner: vi.fn(),
    openWeightPlanner: vi.fn(),
    hideActions: false,
    ...overrides,
  };
}

function renderModal(
  actions = makeActions(),
  props: { topicId?: number | null; onClose?: () => void } = {},
) {
  const onClose = props.onClose ?? vi.fn();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ModalsProvider>
      <JobOrderActionsProvider value={actions}>{children}</JobOrderActionsProvider>
    </ModalsProvider>
  );
  renderWithProviders(
    <Wrapper>
      <JobOrderDetailModal jobNo="260-01" topicId={props.topicId} onClose={onClose} />
    </Wrapper>,
  );
  return { actions, onClose };
}

const openTab = async (name: string) => fireEvent.click(await screen.findByRole('tab', { name }));

beforeEach(() => {
  auth.groups = ['planlama'];
  auth.admin = false;
  auth.perms = new Set();
  topics = TOPICS;
  fetchMock.mockReset();
  uploadMock.mockReset();
  fetchMock.mockImplementation(async (path, options) => route(String(path), options) as never);
  uploadMock.mockResolvedValue({} as never);
});

describe('JobOrderDetailModal', () => {
  it('shows Genel with the job fields, sub-jobs and target date history', async () => {
    const { actions } = renderModal();
    expect(await screen.findByText('İş Emri Detayları: 260-01')).toBeInTheDocument();
    expect(await screen.findByText('Kazan imalatı')).toBeInTheDocument();
    expect(screen.getByText('ACME (C-9)')).toBeInTheDocument();
    expect(screen.getByText('PO-77')).toBeInTheDocument();
    expect(screen.getByText('EXW')).toBeInTheDocument();
    expect(screen.getByText('1.250,5 kg')).toBeInTheDocument();
    expect(screen.getByText('Malzeme gecikti')).toBeInTheDocument();
    // The sub-job on hold for a drawing revision reads "Revizyonda".
    expect(screen.getByText('Revizyonda')).toBeInTheDocument();
    expect(await screen.findByText('Bu iş emri için henüz üretim fazı oluşturulmamış.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Faz Oluştur/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Detay/ }));
    expect(actions.view).toHaveBeenCalledWith('260-01-01');
  });

  it('routes Düzenle and Revize Et through the actions context', async () => {
    const { actions } = renderModal();
    fireEvent.click(await screen.findByRole('button', { name: /Düzenle/ }));
    expect(actions.edit).toHaveBeenCalledWith('260-01');
    fireEvent.click(screen.getByRole('button', { name: 'Revize Et' }));
    expect(actions.reviseTargetDate).toHaveBeenCalledWith('260-01', '2026-12-01');
  });

  it('hides Düzenle and Revize Et when actions are hidden, and Düzenle without planlama', async () => {
    renderModal(makeActions({ hideActions: true }));
    await screen.findByText('Kazan imalatı');
    expect(screen.queryByRole('button', { name: /Düzenle/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revize Et' })).not.toBeInTheDocument();
  });

  it('loads a tab only when it is first opened', async () => {
    renderModal();
    await screen.findByText('Kazan imalatı');
    expect(requested('/projects/job-orders/260-01/department_tasks/')).toBe(false);
    expect(requested('/projects/job-orders/260-01/files/')).toBe(false);

    await openTab('Görevler');
    expect(await screen.findByText('Dizayn', { selector: 'a' })).toHaveAttribute(
      'href',
      '/design/projects/?task=31',
    );
    expect(screen.getByText('12.50')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(requested('/projects/job-orders/260-01/files/')).toBe(false);
  });

  it('gates Fiyat ve Ağırlık and Tahmin by permission', async () => {
    auth.groups = [];
    const first = renderModal();
    await screen.findByText('Kazan imalatı');
    expect(screen.queryByRole('tab', { name: 'Fiyat ve Ağırlık' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Tahmin' })).not.toBeInTheDocument();
    // Without planlama there is no Düzenle either.
    expect(screen.queryByRole('button', { name: /Düzenle/ })).not.toBeInTheDocument();
    expect(first.actions.edit).not.toHaveBeenCalled();
  });

  it('shows Fiyat ve Ağırlık and Tahmin to those allowed', async () => {
    auth.groups = ['yonetim'];
    auth.perms = new Set(['view_estimates']);
    renderModal();
    await openTab('Tahmin');
    expect(await screen.findByText('Tahmin raporu 260-01')).toBeInTheDocument();
    await openTab('Fiyat ve Ağırlık');
    expect(await screen.findByText('Bu iş emrinde fiyat kademesi yok.')).toBeInTheDocument();
  });

  it('validates the file upload form before sending', async () => {
    const warning = vi.spyOn(notify, 'warning');
    renderModal();
    await openTab('Dosyalar & Tartışmalar');
    expect(await screen.findByText('Henüz dosya eklenmemiş.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Dosya Yükle/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Dosya Yükle' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Kaydet/ }));
    expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByLabelText(/Dosya Türü/));
    fireEvent.click(await screen.findByRole('option', { name: 'Çizim', hidden: true }));
    fireEvent.click(within(dialog).getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(warning).toHaveBeenCalledWith('Lütfen en az bir dosya seçin'));
    expect(uploadMock).not.toHaveBeenCalled();

    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await within(dialog).findByText('Seçilen dosyalar (1):')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Kaydet/ }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    const [path, form] = uploadMock.mock.calls[0]!;
    expect(path).toBe('/projects/job-orders/260-01/upload_file/');
    expect((form as FormData).get('file_type')).toBe('drawing');
    expect((form as FormData).getAll('files')).toHaveLength(1);
  });

  it('lists the topics and creates a new one', async () => {
    const success = vi.spyOn(notify, 'success');
    renderModal();
    await openTab('Dosyalar & Tartışmalar');
    expect(await screen.findByRole('button', { name: 'Kaynak sırası' })).toBeInTheDocument();
    expect(screen.getByText('Tartışmalar (1)')).toBeInTheDocument();
    expect(screen.getByText('4 yorum', { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Yeni Tartışma/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Yeni Tartışma Oluştur' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Kaydet/ }));
    expect((await within(dialog).findAllByText('Bu alan gereklidir')).length).toBe(2);

    fireEvent.change(within(dialog).getByRole('textbox', { name: /Başlık/ }), {
      target: { value: 'Boya rengi' },
    });
    const editor = within(dialog).getByRole('textbox', { name: /İçerik/ });
    editor.innerHTML = 'RAL 7035 mi?';
    fireEvent.input(editor);
    topics = [...TOPICS, { ...TOPICS[0]!, id: 99, title: 'Boya rengi' }];
    fireEvent.click(within(dialog).getByRole('button', { name: /Kaydet/ }));

    await waitFor(() => expect(success).toHaveBeenCalledWith('Tartışma başarıyla oluşturuldu'));
    const post = calls().find(
      (c) => c.path === '/projects/discussion-topics/' && c.options.method === 'POST',
    )!;
    expect(post.options.body).toEqual({
      job_order: '260-01',
      title: 'Boya rengi',
      content: 'RAL 7035 mi?',
      priority: 'normal',
    });
    expect(await screen.findByText('Tartışmalar (2)')).toBeInTheDocument();
  });

  it('opens the deep-linked topic on top of the job', async () => {
    renderModal(makeActions(), { topicId: 70 });
    expect(await screen.findByText('Tartışma: Kaynak sırası')).toBeInTheDocument();
    expect((await screen.findByText('gövde')).tagName).toBe('STRONG');
    expect(await screen.findByText('Yorumlar (0)')).toBeInTheDocument();
  });

  it('closes with a notification when the job cannot be loaded', async () => {
    const error = vi.spyOn(notify, 'error');
    fetchMock.mockImplementation(async () => {
      throw new ApiError(404, { detail: 'Yok' }, 'Yok');
    });
    const { onClose } = renderModal();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(error).toHaveBeenCalledWith('İş emri bilgileri yüklenirken hata oluştu');
  });
});

describe('releaseReviewUrl', () => {
  it('sends release review topics to the approvals page', () => {
    expect(releaseReviewUrl({ topic_type: 'release_review', linked_release_id: 12 })).toBe(
      '/design/release-approvals/?release_id=12',
    );
    expect(releaseReviewUrl({ topic_type: 'general', linked_release_id: 12 })).toBeNull();
    expect(releaseReviewUrl(null)).toBeNull();
  });
});
