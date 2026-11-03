import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError, apiFetch, type ApiFetchOptions } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { WeightPlannerModal } from './WeightPlannerModal';

vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/client')>()),
  apiFetch: vi.fn(),
}));

const job = (extra: Record<string, unknown>) => ({
  title: '',
  status: 'active',
  status_display: 'Aktif',
  parent: '950-01',
  depth: 1,
  is_phase: false,
  can_plan: true,
  quantity: 1,
  total_weight_kg: null,
  offer_weight_kg: null,
  tiers: [],
  ...extra,
});

const PLANNER = {
  root: '950-01',
  job_orders: [
    job({
      job_no: '950-01',
      title: 'Kova Hattı',
      parent: null,
      depth: 0,
      total_weight_kg: '5000.00',
      tiers: [
        {
          id: 11,
          tier_type: 'welding',
          tier_type_display: 'Kaynak',
          name: 'ÇELİK',
          price_per_kg: '30.0000',
          currency: 'TRY',
          allocated_weight_kg: '1000.00',
          used_weight_kg: '0',
          remaining_weight_kg: '1000.00',
          assignment_count: 0,
        },
      ],
    }),
    job({ job_no: '950-01-01', title: 'Gövde', quantity: 2, offer_weight_kg: '730.00' }),
    job({ job_no: '950-01-02', title: 'Kapak' }),
    job({
      job_no: '950-01-03',
      title: 'Eski parça',
      status: 'completed',
      status_display: 'Tamamlandı',
      can_plan: false,
      total_weight_kg: '100.00',
    }),
  ],
};

const TEMPLATES = [
  {
    id: 3,
    name: 'Çelik + Boya',
    description: '',
    is_active: true,
    items: [
      {
        sequence: 1,
        tier_type: 'welding',
        name: 'ÇELİK',
        price_per_kg: '30.0000',
        currency: 'TRY',
        weight_share_pct: '70.00',
      },
      {
        sequence: 2,
        tier_type: 'paint',
        name: 'Boya',
        price_per_kg: '4.0000',
        currency: 'TRY',
        weight_share_pct: '100.00',
      },
    ],
  },
];

type Call = { path: string; options: ApiFetchOptions };
const calls = (): Call[] =>
  vi.mocked(apiFetch).mock.calls.map(([path, options]) => ({ path, options: options ?? {} }));
const posts = () => calls().filter((c) => c.options.method === 'POST');

let bulkPlan: (body: unknown) => Promise<unknown>;

beforeEach(() => {
  bulkPlan = async () => ({ message: '1 iş emri kaydedildi' });
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation(async (path: string, options: ApiFetchOptions = {}) => {
    const method = options.method ?? 'GET';
    if (path === '/subcontracting/price-tiers/planner/' && method === 'GET') return PLANNER;
    if (path === '/subcontracting/price-tier-templates/' && method === 'GET') return TEMPLATES;
    if (path === '/subcontracting/price-tiers/bulk_plan/' && method === 'POST')
      return bulkPlan(options.body);
    throw new ApiError(404, { detail: 'not mocked' }, 'not mocked');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function open(jobNo: string | null = '950-01') {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  renderWithProviders(<WeightPlannerModal jobNo={jobNo} onClose={onClose} onSaved={onSaved} />);
  return { onClose, onSaved };
}

const weightInput = (jobNo: string) =>
  screen.getByLabelText(`${jobNo} ağırlık (kg)`) as HTMLInputElement;
const summary = () => screen.getByTestId('weight-planner-summary');
const detailTemplateSelect = () =>
  screen.getAllByLabelText('Kademe şablonu')[1] as HTMLSelectElement;

async function loaded() {
  await waitFor(() => expect(screen.getByLabelText('950-01-01 ağırlık (kg)')).toBeInTheDocument());
}

describe('WeightPlannerModal', () => {
  test('renders nothing while closed', () => {
    open(null);
    expect(screen.queryByText(/Ağırlık ve Fiyat Kademeleri/)).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test('loads the tree and focuses the first open job order without a weight', async () => {
    open();
    expect(screen.getByText('Yükleniyor…')).toBeInTheDocument();
    await loaded();
    expect(calls()[0]).toMatchObject({
      path: '/subcontracting/price-tiers/planner/',
      options: { params: { job_order: '950-01' } },
    });
    expect(screen.getByText('— 950-01')).toBeInTheDocument();
    expect(screen.getByText('Kova Hattı · 4 iş emri')).toBeInTheDocument();
    expect(weightInput('950-01').value).toBe('5000');
    expect(weightInput('950-01-03')).toBeDisabled();
    // The detail panel shows 950-01-01 with its offer hint.
    expect(screen.getByText(/Teklif: 730 kg × 2 adet ≈/)).toBeInTheDocument();
    expect(
      screen.getByText('Bu iş emrine eklenecek kademe yok.', { exact: false }),
    ).toBeInTheDocument();
    expect(summary()).toHaveTextContent('Henüz değişiklik yok');
    expect(screen.getByRole('button', { name: /Kaydet/ })).toBeDisabled();
  });

  test('shows the load error', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/subcontracting/price-tier-templates/') return TEMPLATES;
      throw new ApiError(500, {}, 'HTTP 500');
    });
    open();
    expect(await screen.findByText('İş emri ağacı yüklenemedi.')).toBeInTheDocument();
  });

  test('editing a weight: changed, read back on blur, Enter and arrows move, Escape undoes', async () => {
    const { onClose } = open();
    await loaded();
    const input = weightInput('950-01-01');
    input.focus();
    fireEvent.change(input, { target: { value: '3.250' } });
    expect(input).toHaveAttribute('data-changed');
    expect(summary()).toHaveTextContent('1 iş emrinde 1 ağırlık kaydedilecek');
    expect(screen.getByText('3.250 kg')).toBeInTheDocument();
    expect(screen.getByText('Değişti')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(document.activeElement).toBe(weightInput('950-01-02'));
    // Committed: the number as it was read.
    expect(input.value).toBe('3250');
    // The detail panel followed the cursor.
    expect(
      screen.getByText('Kapak', { selector: 'div[class*="detailTitle"]' }),
    ).toBeInTheDocument();

    fireEvent.keyDown(weightInput('950-01-02'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
    expect(summary()).toHaveTextContent('Henüz değişiklik yok');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input).toHaveAttribute('data-invalid');
    expect(screen.getByText('Ağırlık okunamadı')).toBeInTheDocument();
  });

  test('pasting a column fills the weights down, two columns map by job number', async () => {
    const success = vi.spyOn(notify, 'success');
    const warning = vi.spyOn(notify, 'warning');
    open();
    await loaded();
    fireEvent.paste(weightInput('950-01-01'), {
      clipboardData: { getData: () => '1.000\r\n2.000,5\r\n4\r\n' },
    });
    expect(weightInput('950-01-01').value).toBe('1.000');
    expect(weightInput('950-01-02').value).toBe('2.000,5');
    // 950-01-03 is closed: the third value has nowhere to go.
    expect(weightInput('950-01-03').value).toBe('100');
    expect(success).toHaveBeenCalledWith('2 ağırlık yapıştırıldı');

    fireEvent.paste(weightInput('950-01'), {
      clipboardData: { getData: () => '950-01-02\tKapak\t862,5\n999-99\t\t5' },
    });
    expect(weightInput('950-01-02').value).toBe('862,5');
    expect(warning).toHaveBeenCalledWith(
      '1 ağırlık yapıştırıldı, 1 satır atlandı (iş emri bu ağaçta yok ya da kapalı)',
    );
    expect(summary()).toHaveTextContent('2 iş emrinde 2 ağırlık kaydedilecek');
  });

  test('applying a template and adding a tier', async () => {
    const success = vi.spyOn(notify, 'success');
    open();
    await loaded();
    fireEvent.change(detailTemplateSelect(), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Şablonu ekle/ }));
    expect(success).toHaveBeenCalledWith(
      '«Çelik + Boya» eklendi. 1 iş emrinin ağırlığı girilince kademeler boyutlanacak',
    );
    expect(
      screen.getAllByLabelText('Kademe adı').map((el) => (el as HTMLInputElement).value),
    ).toEqual(['ÇELİK', 'Boya']);
    // No weight yet: the kg cells wait for it and the weight cell is marked.
    expect(screen.getAllByLabelText('Ayrılan ağırlık (kg)')[0]).toHaveAttribute(
      'placeholder',
      'ağırlık yok',
    );
    expect(weightInput('950-01-01')).toHaveAttribute('data-missing');
    expect(screen.getAllByLabelText('Ayrılan ağırlık (kg)')[0]).toHaveAttribute('data-invalid');

    fireEvent.change(weightInput('950-01-01'), { target: { value: '1000' } });
    expect(
      screen.getAllByLabelText('Ayrılan ağırlık (kg)').map((el) => (el as HTMLInputElement).value),
    ).toEqual(['700', '1000']);

    fireEvent.click(screen.getByRole('button', { name: /Kademe ekle/ }));
    const shares = screen.getAllByLabelText('Ağırlık payı (%)') as HTMLInputElement[];
    expect(shares.map((el) => el.value)).toEqual(['70', '100', '30']);
    expect(summary()).toHaveTextContent('1 iş emrinde 1 ağırlık, 3 yeni kademe kaydedilecek');
  });

  test('a typed kg pins the row; Enter on a hand-sized kg goes to the next one', async () => {
    open();
    await loaded();
    fireEvent.change(weightInput('950-01-01'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: /Kademe ekle/ }));
    const share = screen.getByLabelText('Ağırlık payı (%)') as HTMLInputElement;
    // Clearing the share makes the kg hand-typed.
    fireEvent.change(share, { target: { value: '' } });
    fireEvent.blur(share);
    const kg = screen.getByLabelText('Ayrılan ağırlık (kg)') as HTMLInputElement;
    expect(kg).toHaveAttribute('data-missing');
    expect(kg).toHaveAttribute('placeholder', 'kg girin');

    fireEvent.change(kg, { target: { value: '640' } });
    const success = vi.spyOn(notify, 'success');
    fireEvent.keyDown(kg, { key: 'Enter' });
    expect(kg.value).toBe('640');
    expect(kg).not.toHaveAttribute('data-missing');
    expect(success).toHaveBeenCalledWith('Kg bekleyen kademe kalmadı');
    expect((screen.getByLabelText('Ağırlık payı (%)') as HTMLInputElement).value).toBe('64');
  });

  test('validation stops the save and names the job order', async () => {
    const error = vi.spyOn(notify, 'error');
    open();
    await loaded();
    fireEvent.change(weightInput('950-01-01'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /Kademe ekle/ }));
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    expect(error).toHaveBeenCalledWith('950-01-01: Kademe adı boş');
    expect(screen.getByLabelText('Kademe adı')).toHaveAttribute('data-invalid');
    expect(
      screen.getByLabelText('950-01-01 ağırlık (kg)').closest('[role="listitem"]'),
    ).toHaveAttribute('data-error');
    expect(posts()).toHaveLength(0);
  });

  test('saves weights, new tiers and existing-tier edits in one request', async () => {
    const success = vi.spyOn(notify, 'success');
    const { onClose, onSaved } = open();
    await loaded();
    fireEvent.change(weightInput('950-01-01'), { target: { value: '1.200' } });
    fireEvent.change(detailTemplateSelect(), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Şablonu ekle/ }));

    // Root: change the saved tier's price and stage nothing else.
    fireEvent.click(screen.getByText('Kova Hattı'));
    const price = screen.getByLabelText('Fiyat/kg') as HTMLInputElement;
    expect(price.value).toBe('30');
    fireEvent.change(price, { target: { value: '32,5' } });
    fireEvent.blur(price);
    expect(price).toHaveAttribute('data-changed');
    expect(summary()).toHaveTextContent(
      '2 iş emrinde 1 ağırlık, 2 yeni kademe, 1 kademe düzenlemesi kaydedilecek',
    );

    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts()).toHaveLength(1);
    expect(posts()[0]?.options.body).toEqual({
      plans: [
        { job_order: '950-01', update_tiers: [{ id: 11, price_per_kg: '32.5000' }] },
        {
          job_order: '950-01-01',
          total_weight_kg: '1200.00',
          tiers: [
            {
              tier_type: 'welding',
              name: 'ÇELİK',
              price_per_kg: '30.0000',
              currency: 'TRY',
              allocated_weight_kg: '840.00',
            },
            {
              tier_type: 'paint',
              name: 'Boya',
              price_per_kg: '4.0000',
              currency: 'TRY',
              allocated_weight_kg: '1200.00',
            },
          ],
        },
      ],
    });
    expect(success).toHaveBeenCalledWith('1 iş emri kaydedildi');
    expect(onSaved).toHaveBeenCalled();
  });

  test('a refused save points at the job and row the backend names', async () => {
    const error = vi.spyOn(notify, 'error');
    bulkPlan = async () => {
      throw new ApiError(
        400,
        {
          message: 'Kademe kaydedilemedi.',
          job_order: '950-01-01',
          index: 1,
          errors: { name: ['Bu ad kullanılıyor.'] },
        },
        'Kademe kaydedilemedi.',
      );
    };
    const { onClose } = open();
    await loaded();
    fireEvent.change(weightInput('950-01-01'), { target: { value: '1000' } });
    fireEvent.change(detailTemplateSelect(), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Şablonu ekle/ }));
    fireEvent.click(screen.getByText('Kova Hattı'));
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));

    const message = 'Kademe kaydedilemedi. Ad: Bu ad kullanılıyor.';
    await waitFor(() => expect(error).toHaveBeenCalledWith(message));
    expect(onClose).not.toHaveBeenCalled();
    // Back on the job order the backend refused, with its second row marked.
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    const rows = screen.getAllByLabelText('Kademe adı').map((el) => el.closest('tr'));
    expect(rows[1]?.className).toMatch(/rowError/);
    expect(screen.getByRole('button', { name: /Kaydet/ })).toBeEnabled();
  });

  test('bulk apply asks where to apply when a selected job already has tiers', async () => {
    const success = vi.spyOn(notify, 'success');
    open();
    await loaded();
    fireEvent.click(screen.getByLabelText('950-01 seç'));
    fireEvent.click(screen.getByLabelText('950-01-02 seç'), { shiftKey: true });
    expect(screen.getByText('iş emri seçili', { exact: false })).toHaveTextContent(
      '3 iş emri seçili',
    );
    fireEvent.change(screen.getAllByLabelText('Kademe şablonu')[0] as HTMLSelectElement, {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Seçililere uygula/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Seçili 3 iş emrinin 1 tanesinde zaten kayıtlı kademe var.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yalnızca kademesizlere (2)' }));
    expect(success).toHaveBeenCalledWith(
      '«Çelik + Boya» 2 iş emrine eklendi. 2 iş emrinin ağırlığı girilince kademeler boyutlanacak',
    );
    expect(summary()).toHaveTextContent('2 iş emrinde 4 yeni kademe kaydedilecek');
  });

  test('closing with unsaved changes asks first', async () => {
    const { onClose } = open();
    await loaded();
    fireEvent.change(weightInput('950-01-01'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'İptal' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Kaydedilmemiş değişiklikler silinecek.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydetmeden kapat' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('closes at once without changes', async () => {
    const { onClose } = open();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'İptal' }));
    expect(onClose).toHaveBeenCalled();
  });

  test('saves a new template from the template manager', async () => {
    const success = vi.spyOn(notify, 'success');
    const error = vi.spyOn(notify, 'error');
    vi.mocked(apiFetch).mockImplementation(async (path: string, options: ApiFetchOptions = {}) => {
      const method = options.method ?? 'GET';
      if (path === '/subcontracting/price-tiers/planner/') return PLANNER;
      if (path === '/subcontracting/price-tier-templates/' && method === 'GET') return TEMPLATES;
      if (path === '/subcontracting/price-tier-templates/' && method === 'POST') {
        return { id: 9, ...(options.body as object), items: [] };
      }
      throw new ApiError(404, {}, 'not mocked');
    });
    open();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /Şablonlar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Yeni şablon/ }));
    fireEvent.change(screen.getByLabelText('Şablon kademe adı'), { target: { value: 'ÇELİK' } });
    fireEvent.change(screen.getByLabelText('Şablon fiyat/kg'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Şablon pay (%)'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /Şablonu kaydet/ }));
    expect(error).toHaveBeenCalledWith('Pay %0–100 arası olmalı ya da boş bırakılmalı');

    fireEvent.change(screen.getByLabelText('Şablon pay (%)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Şablonu kaydet/ }));
    expect(error).toHaveBeenCalledWith('Şablon adı boş olamaz');

    fireEvent.change(screen.getByLabelText('Şablon adı'), { target: { value: 'Elle Çelik' } });
    fireEvent.click(screen.getByRole('button', { name: /Şablonu kaydet/ }));
    await waitFor(() => expect(success).toHaveBeenCalledWith('«Elle Çelik» kaydedildi'));
    expect(posts()[0]?.options.body).toEqual({
      name: 'Elle Çelik',
      description: '',
      is_active: true,
      items: [
        {
          tier_type: 'welding',
          name: 'ÇELİK',
          price_per_kg: '30.0000',
          currency: 'TRY',
          weight_share_pct: null,
        },
      ],
    });
  });
});
