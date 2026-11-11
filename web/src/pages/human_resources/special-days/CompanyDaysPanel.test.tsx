import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { authedFetch } from '@/auth/authService';
import type { CelebrationTemplate, SpecialDay } from '@/api/general/specialDays';
import { getOccasionPreview } from '@/shell/occasion/previewStore';
import { renderWithProviders } from '@/test/render';
import { SpecialDaysPreviewPage } from './SpecialDaysPreviewPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isAdmin: () => false,
  hasPerm: (codename: string) => codename === 'manage_hr',
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/accessControl', () => ({ hasRouteAccess: () => true }));

const fetchMock = vi.mocked(authedFetch);

interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

let calls: Call[] = [];
let templates: CelebrationTemplate[] = [];
let days: SpecialDay[] = [];

const template = (
  kind: CelebrationTemplate['kind'],
  kind_label: string,
  title: string,
  body: string,
): CelebrationTemplate => ({
  kind,
  kind_label,
  title,
  body,
  show_popup: true,
  updated_by: null,
  updated_at: null,
});

const yilsonu: SpecialDay = {
  id: 4,
  name: 'Yılsonu',
  category: 'company',
  month: 12,
  day: 31,
  date: null,
  theme: 'company',
  popup_title: 'Yeni yılınız kutlu olsun, {first_name}',
  popup_body: '',
  show_popup: true,
  is_active: true,
  created_by: 1,
  created_by_name: 'İK',
  created_at: '2026-11-01T08:00:00Z',
  updated_at: '2026-11-01T08:00:00Z',
};

const json = (data: unknown, status = 200) =>
  Promise.resolve(
    status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(data), { status }),
  );

beforeEach(() => {
  // Mantine's Select scrolls the picked option into view; jsdom has no scrolling.
  Element.prototype.scrollIntoView ??= () => {};
  sessionStorage.clear();
  calls = [];
  templates = [
    template('birthday', 'Doğum günü', 'İyi ki doğdunuz, {first_name}', 'Nice mutlu yıllara.'),
    template(
      'work_anniversary',
      'İş yıl dönümü',
      '{years}. yılınız kutlu olsun, {first_name}',
      'GEMKOM ailesindeki {years} yılınız için teşekkür ederiz.',
    ),
    template('public_holiday', 'Resmi tatil', '{holiday_name} kutlu olsun', ''),
  ];
  days = [{ ...yilsonu }];
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const path = parsed.pathname;
    calls.push({ method, path, query: parsed.searchParams, body });

    if (path === '/special-days/upcoming/') return json({ results: [] });
    if (path === '/special-days/calendar/') {
      return json({
        year: 2026,
        results: days
          .filter((d) => d.is_active && d.month && d.day)
          .map((d) => ({
            date: `2026-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`,
            end_date: `2026-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`,
            kind: 'special_day',
            theme: d.theme,
            name: d.name,
            category: d.category,
            key: `special:${d.id}:2026`,
            id: d.id,
          })),
      });
    }
    if (path === '/special-days/templates/') return json(templates);
    const tpl = /^\/special-days\/templates\/(\w+)\/$/.exec(path);
    if (tpl && method === 'PATCH') {
      templates = templates.map((t) =>
        t.kind === tpl[1]
          ? { ...t, ...(body as object), updated_at: '2026-11-11T09:30:00Z', updated_by: 1 }
          : t,
      );
      return json(templates.find((t) => t.kind === tpl[1]));
    }
    if (path === '/special-days/days/' && method === 'GET') {
      const active = parsed.searchParams.get('is_active');
      return json(active === null ? days : days.filter((d) => String(d.is_active) === active));
    }
    if (path === '/special-days/days/' && method === 'POST') {
      const input = body as Partial<SpecialDay>;
      const row: SpecialDay = {
        ...yilsonu,
        ...input,
        id: 9,
        theme: input.theme ?? 'company',
      } as SpecialDay;
      days = [...days, row];
      return json(row, 201);
    }
    const one = /^\/special-days\/days\/(\d+)\/$/.exec(path);
    if (one) {
      const id = Number(one[1]);
      if (method === 'DELETE') {
        days = days.filter((d) => d.id !== id);
        return json(null, 204);
      }
      if (method === 'PATCH') {
        days = days.map((d) => (d.id === id ? ({ ...d, ...(body as object) } as SpecialDay) : d));
        return json(days.find((d) => d.id === id));
      }
    }
    return json({ detail: 'Bulunamadı.' }, 404);
  });
});

function renderPage() {
  return renderWithProviders(
    <ModalsProvider>
      <SpecialDaysPreviewPage />
    </ModalsProvider>,
    { route: '/human_resources/special-days' },
  );
}

async function pick(dialog: HTMLElement, label: RegExp, option: string) {
  fireEvent.click(within(dialog).getByLabelText(label));
  fireEvent.click(await screen.findByRole('option', { name: option, hidden: true }));
}

describe('Şirket özel günleri', () => {
  it('adds a yearly day, then offers to preview it or open its design', async () => {
    renderPage();
    expect(await screen.findByText('Her yıl 31 Aralık')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yeni Özel Gün' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Tasarım bölümünde düzenlenir/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await within(dialog).findByText('Ad zorunludur.')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/^Ad/), { target: { value: 'Kuruluş Günü' } });
    fireEvent.change(within(dialog).getByLabelText('Gün'), { target: { value: '31' } });
    await pick(dialog, /^Ay$/, 'Şubat');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await within(dialog).findByText('Bu ayda böyle bir gün yok.')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Gün'), { target: { value: '14' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const post = calls.find((c) => c.method === 'POST');
    // The look and the texts are Tasarım's: the backend starts from the category's design.
    expect(post?.body).toEqual({
      name: 'Kuruluş Günü',
      category: 'company',
      month: 2,
      day: 14,
      date: null,
      is_active: true,
    });
    expect(await screen.findByText('Her yıl 14 Şubat')).toBeInTheDocument();

    const saved = screen.getByTestId('day-saved');
    expect(saved).toHaveTextContent('Kuruluş Günü kaydedildi.');
    fireEvent.click(within(saved).getByRole('button', { name: 'Bu Günü Önizle' }));
    expect(getOccasionPreview()).toMatch(/^\d{4}-02-14$/);
  });

  it('turns a yearly day into a one-off, which clears month and day', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Yılsonu düzenle' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Bir kez' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
    expect(await within(dialog).findByText('Tarih seçin.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Tarih'), { target: { value: '2026-12-31' } });
    await pick(dialog, /^Kategori/, 'Uluslararası');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.path).toBe('/special-days/days/4/');
    expect(patch?.body).toEqual({
      name: 'Yılsonu',
      category: 'international',
      date: '2026-12-31',
      month: null,
      day: null,
      is_active: true,
    });
    expect(await screen.findByText('31 Aralık 2026')).toBeInTheDocument();
  });

  it('deletes a day after confirming', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Yılsonu sil' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sil' }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE' && c.path === '/special-days/days/4/')).toBe(
        true,
      ),
    );
    expect(await screen.findByText('Henüz şirket özel günü eklenmedi.')).toBeInTheDocument();
  });

  it('filters by is_active and previews an active day', async () => {
    days = [{ ...yilsonu }, { ...yilsonu, id: 5, name: 'Eski Gün', is_active: false }];
    renderPage();
    expect(await screen.findByText('Eski Gün')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eski Gün önizle' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Pasif' }));
    await waitFor(() => expect(calls.some((c) => c.query.get('is_active') === 'false')).toBe(true));
    await waitFor(() => expect(screen.queryByTestId('special-day-4')).toBeNull());

    fireEvent.click(screen.getByRole('radio', { name: 'Tümü' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yılsonu önizle' }));
    expect(getOccasionPreview()).toMatch(/^\d{4}-12-31$/);
  });

  it('lists only the custom days; seeded ones are designed in Tasarım', async () => {
    days = [
      { ...yilsonu },
      { ...yilsonu, id: 12, name: 'Cumhuriyet Bayramı', slug: 'cumhuriyet-bayrami' },
    ];
    renderPage();
    expect(await screen.findByTestId('special-day-4')).toBeInTheDocument();
    expect(screen.queryByTestId('special-day-12')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yılsonu tasarımı' }));
    expect(await screen.findByRole('tab', { name: 'Tasarım' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
