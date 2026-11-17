import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { JobOrderFormModal } from './JobOrderFormModal';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const JOB = {
  job_no: '008-12',
  title: 'Kazan',
  status: 'active',
  customer: 4,
  customer_name: 'ACME',
  general_expenses_rate: '0.10',
};

it('edit: the job number can be changed and is sent with the update', async () => {
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ ...JOB, job_no: '008-21' }), { status: 200 })),
  );
  const onSaved = vi.fn();
  renderWithProviders(
    <JobOrderFormModal
      mode={{ kind: 'edit', jobOrder: JOB }}
      onClose={() => {}}
      onSaved={onSaved}
    />,
  );

  const field = await screen.findByLabelText(/İş Emri No/);
  expect(field).toBeEnabled();
  expect(field).toHaveValue('008-12');
  fireEvent.change(field, { target: { value: ' 008-21 ' } });
  fireEvent.submit(field.closest('form')!);

  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'PATCH')!;
  expect(String(url)).toBe('https://api.test/projects/job-orders/008-12/');
  expect(JSON.parse(String(init?.body))).toMatchObject({ job_no: '008-21', title: 'Kazan' });
});

it('edit: an empty job number is refused', async () => {
  renderWithProviders(
    <JobOrderFormModal
      mode={{ kind: 'edit', jobOrder: JOB }}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );
  const field = await screen.findByLabelText(/İş Emri No/);
  fireEvent.change(field, { target: { value: '  ' } });
  fireEvent.submit(field.closest('form')!);
  expect(await screen.findByText('Bu alan gereklidir')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PATCH')).toBe(false);
});
