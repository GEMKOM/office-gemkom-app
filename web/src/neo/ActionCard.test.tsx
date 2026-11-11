import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/api/client';
import { cancelAction, confirmAction, type NeoAction } from '@/api/assistant';
import { renderWithProviders } from '@/test/render';
import { ActionCard } from './ActionCard';
import { resetNeoStore, showConversation, useNeo, type AssistantItem } from './neoStore';

vi.mock('@/api/assistant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/assistant')>()),
  confirmAction: vi.fn(),
  cancelAction: vi.fn(),
}));
vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const confirmMock = vi.mocked(confirmAction);
const cancelMock = vi.mocked(cancelAction);

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

function topicCard(overrides: Partial<NeoAction> = {}): NeoAction {
  return {
    id: 7,
    kind: 'discussion_topic',
    label: 'Tartışma konusu aç',
    status: 'pending',
    expires_at: inAnHour(),
    fields: [
      { key: 'job_no', label: 'İş emri', type: 'text', value: '960-01', editable: false, required: true, display: '960-01 · Tank imalatı' },
      { key: 'title', label: 'Başlık', type: 'text', value: 'Sevk tarihi', editable: true, required: true },
      { key: 'content', label: 'İçerik', type: 'textarea', value: 'Sevk ne zaman?', editable: true, required: true },
      {
        key: 'priority',
        label: 'Öncelik',
        type: 'select',
        value: 'normal',
        editable: true,
        required: true,
        options: [
          { value: 'normal', label: 'Normal' },
          { value: 'urgent', label: 'Acil' },
        ],
      },
    ],
    ...overrides,
  };
}

/** The card as the chat shows it: read from the store, so a confirm's result lands. */
function Harness() {
  const item = useNeo((s) => s.items[1]) as AssistantItem | undefined;
  const action = item?.actions?.[0];
  return action && item ? <ActionCard action={action} itemId={item.id} /> : null;
}

function renderCard(card: NeoAction) {
  showConversation({
    id: 1,
    messages: [
      { id: 1, role: 'user', content: 'Konu aç' },
      { id: 2, role: 'assistant', content: 'Kartı onaylayabilirsiniz.', actions: [card] },
    ],
  });
  return renderWithProviders(<Harness />);
}

beforeEach(() => {
  resetNeoStore();
  confirmMock.mockReset();
  cancelMock.mockReset();
});

it('sends only the edited fields, then shows what was created', async () => {
  confirmMock.mockResolvedValue(
    topicCard({ status: 'confirmed', result: { id: 41, label: 'Tartışma #41', url: '/projects/project-tracking/?job_no=960-01&topic_id=41' } }),
  );
  renderCard(topicCard());

  expect(screen.getByText('960-01 · Tank imalatı')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'İş emri' })).toBeNull();   // locked
  expect(screen.getByText('Onaylayana kadar hiçbir şey kaydedilmez.')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: /Başlık/ }), { target: { value: 'Sevk tarihi kesin mi?' } });
  fireEvent.change(screen.getByRole('combobox', { name: /Öncelik/ }), { target: { value: 'urgent' } });
  fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));

  await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(7, { title: 'Sevk tarihi kesin mi?', priority: 'urgent' }));
  expect(await screen.findByText(/Tartışma #41 oluşturuldu/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Aç' })).toHaveAttribute('href', '/projects/project-tracking/?job_no=960-01&topic_id=41');
  expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
});

it('cancel writes nothing and says so', async () => {
  cancelMock.mockResolvedValue(topicCard({ status: 'cancelled' }));
  renderCard(topicCard());
  fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
  expect(await screen.findByText('Vazgeçildi; hiçbir şey kaydedilmedi.')).toBeInTheDocument();
  expect(confirmMock).not.toHaveBeenCalled();
});

it('shows the server’s reason and stays open when the confirm is refused', async () => {
  confirmMock.mockRejectedValue(new ApiError(400, {}, 'content: Bu alan boş bırakılamaz.'));
  renderCard(topicCard());
  fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Bu alan boş bırakılamaz.');
  expect(screen.getByRole('button', { name: 'Onayla' })).toBeEnabled();
});

it('cannot be confirmed with a required field emptied', () => {
  renderCard(topicCard());
  fireEvent.change(screen.getByRole('textbox', { name: /İçerik/ }), { target: { value: '  ' } });
  expect(screen.getByRole('button', { name: 'Onayla' })).toBeDisabled();
});

it('an expired card offers nothing to confirm', () => {
  renderCard(topicCard({ expires_at: new Date(Date.now() - 1000).toISOString() }));
  expect(screen.getByText(/süresi doldu/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
});

it('a failed write shows why', () => {
  renderCard(topicCard({ status: 'failed', error: 'Onay politikası yok' }));
  expect(screen.getByText('Kaydedilemedi: Onay politikası yok')).toBeInTheDocument();
});
