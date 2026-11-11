import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { authedFetch } from '@/auth/authService';
import type {
  CelebrationTemplate,
  OccasionDesign,
  SpecialDay,
  SpecialDayDefaults,
} from '@/api/general/specialDays';
import { getOccasionPreview } from '@/shell/occasion/previewStore';
import { renderWithProviders } from '@/test/render';
import { SpecialDaysPreviewPage } from '../SpecialDaysPreviewPage';

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
  body: unknown;
}

let calls: Call[] = [];
let days: SpecialDay[] = [];
let templates: CelebrationTemplate[] = [];
let settings = { arife_is_holiday: true, founded_on: null as string | null };

const flag: OccasionDesign = {
  layout: 'flag',
  tone: '#c8102e',
  ink: '#ffffff',
  accent: '#ffffff',
  accent_on_ink: '',
  paper: '#fff8f4',
  font: 'Bebas Neue',
  motif: 'ayyildiz',
  numeral: '{years}',
  cta: 'Uygulamaya Geç',
};

const cumhuriyetTexts = {
  popup_title: 'Cumhuriyet Bayramımız kutlu olsun',
  popup_body: 'Cumhuriyetimizin {years}. yılını gururla kutluyoruz. İyi bayramlar.',
  popup_note: '',
  before_title: 'Cumhuriyet Bayramımız şimdiden kutlu olsun',
  before_body: '',
  before_note: '{tatil_gunleri} tatil. {donus_gunu} günü görüşmek üzere.',
  return_title: '',
  return_body: '',
};

const defaults: SpecialDayDefaults = {
  design: flag,
  ...cumhuriyetTexts,
  show_on: 'both',
  color_band: true,
  keep_theme_during: true,
  show_popup: true,
  return_enabled: false,
};

const cumhuriyet: SpecialDay = {
  id: 12,
  name: 'Cumhuriyet Bayramı',
  category: 'national',
  month: null,
  day: null,
  date: null,
  theme: 'national',
  show_popup: true,
  is_active: true,
  created_by: null,
  created_by_name: null,
  created_at: '2026-11-11T08:00:00Z',
  updated_at: '2026-11-11T08:00:00Z',
  slug: 'cumhuriyet-bayrami',
  recurrence: 'holiday',
  holiday_key: 'cumhuriyet-bayrami',
  since_year: 1923,
  show_on: 'both',
  color_band: true,
  keep_theme_during: true,
  return_enabled: false,
  design: flag,
  defaults,
  ...cumhuriyetTexts,
};

const kandiller: SpecialDay = {
  ...cumhuriyet,
  id: 30,
  name: 'Kandiller',
  category: 'religious',
  slug: 'kandiller',
  recurrence: 'kandil',
  is_active: false,
  since_year: null,
  design: { ...flag, layout: 'celebration', tone: '#2e2152', motif: 'hilal', font: 'Amiri' },
};

const birthday: CelebrationTemplate = {
  kind: 'birthday',
  kind_label: 'Doğum günü',
  title: 'İyi ki doğdunuz, {first_name}',
  body: 'GEMKOM ailesi olarak sağlıklı, mutlu ve başarılı bir yaş dileriz.',
  show_popup: true,
  updated_by: null,
  updated_at: null,
};

const calendarRow = {
  date: '2026-10-29',
  end_date: '2026-10-29',
  kind: 'public_holiday',
  theme: 'national',
  name: 'Cumhuriyet Bayramı',
  key: 'holiday:cumhuriyet-bayrami:2026',
  id: 12,
  slug: 'cumhuriyet-bayrami',
  before_date: '2026-10-27',
  display_date: '2026-10-27',
  return_date: null,
  show_on: 'both',
  is_active: true,
};

const json = (data: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(data), { status }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-11T09:00:00'));
  Element.prototype.scrollIntoView ??= () => {};
  sessionStorage.clear();
  calls = [];
  days = [{ ...cumhuriyet }, { ...kandiller }];
  templates = [{ ...birthday }];
  settings = { arife_is_holiday: true, founded_on: null };
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const path = parsed.pathname;
    calls.push({ method, path, body });
    if (path === '/special-days/days/') return json(days);
    if (path === '/special-days/templates/') return json(templates);
    if (path === '/special-days/calendar/') return json({ year: 2026, results: [calendarRow] });
    if (path === '/special-days/settings/') {
      if (method === 'PATCH') settings = { ...settings, ...(body as object) };
      return json(settings);
    }
    const day = /^\/special-days\/days\/(\d+)\/$/.exec(path);
    if (day && method === 'PATCH') {
      days = days.map((d) =>
        d.id === Number(day[1]) ? ({ ...d, ...(body as object) } as SpecialDay) : d,
      );
      return json(days.find((d) => d.id === Number(day[1])));
    }
    const tpl = /^\/special-days\/templates\/(\w+)\/$/.exec(path);
    if (tpl && method === 'PATCH') {
      templates = templates.map((t) => (t.kind === tpl[1] ? { ...t, ...(body as object) } : t));
      return json(templates.find((t) => t.kind === tpl[1]));
    }
    return json({ detail: 'Bulunamadı.' }, 404);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderEditor(query = '') {
  return renderWithProviders(
    <ModalsProvider>
      <SpecialDaysPreviewPage />
    </ModalsProvider>,
    { route: `/human_resources/special-days?bolum=tasarim${query}` },
  );
}

const preview = () => screen.getByTestId('design-welcome-preview');
const group = (name: string) => screen.getByRole('radiogroup', { name });

it('opens the first day with its look and the day-before texts, filled in', async () => {
  renderEditor();
  const list = await screen.findByRole('list', { name: 'Günler' });
  expect(
    within(list)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Cumhuriyet Bayramı', 'Kandiller', 'Doğum günü']);
  expect(within(list).getByRole('button', { name: 'Cumhuriyet Bayramı' })).toHaveAttribute(
    'aria-current',
    'true',
  );

  // The day before a holiday: its own title, the day's body as fallback, the note's helpers.
  await waitFor(() => expect(preview()).toHaveTextContent('Perşembe · 29 Ekim'));
  expect(preview()).toHaveTextContent('Cumhuriyet Bayramımız şimdiden kutlu olsun');
  expect(preview()).toHaveTextContent('Cumhuriyetimizin 103. yılını gururla kutluyoruz.');
  expect(preview()).toHaveTextContent('29 Ekim tatil. 30 Ekim Cuma günü görüşmek üzere.');
  expect(preview()).toHaveTextContent('103');
  expect(screen.getByTestId('welcome-template')).toHaveAttribute('data-layout', 'flag');
  expect(screen.getByTestId('design-band-preview')).toHaveStyle({ background: '#c8102e' });

  // The day itself.
  fireEvent.click(
    within(screen.getByLabelText('Hangi günün metni')).getByRole('radio', { name: 'Günün kendisi' }),
  );
  expect(preview()).toHaveTextContent('Cumhuriyet Bayramımız kutlu olsun');
  expect(preview()).toHaveTextContent('29 Ekim 2026 Perşembe');
});

it('shows when the welcome opens this year for each choice', async () => {
  renderEditor();
  const hint = await screen.findByTestId('when-hint');
  expect(hint).toHaveTextContent(
    '2026: 27 Ekim Salı gösterilir; o gün görmeyen biri 29 Ekim günü açarsa bir kez daha görür.',
  );
  fireEvent.click(
    within(group('Ne zaman gösterilsin')).getByRole('radio', { name: 'Önceki iş günü' }),
  );
  expect(hint).toHaveTextContent('2026: 27 Ekim Salı, tatilden önceki son iş günü.');
  fireEvent.click(
    within(group('Ne zaman gösterilsin')).getByRole('radio', { name: 'Günün kendisi' }),
  );
  expect(hint).toHaveTextContent('2026: 29 Ekim Perşembe. Tatil olduğu için az kişi görür.');
});

it('changes the look, saves it, and only then offers the preview', async () => {
  renderEditor();
  await screen.findByTestId('when-hint');
  const previewButton = screen.getByRole('button', { name: 'Bu Günü Önizle' });
  expect(previewButton).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Kaydet' })).toBeDisabled();

  fireEvent.click(within(group('Düzen')).getByRole('radio', { name: 'Anma' }));
  fireEvent.click(screen.getByRole('button', { name: 'Zemin #111111' }));
  fireEvent.click(
    within(group('Başlık yazı tipi')).getByRole('radio', { name: 'Cormorant Garamond' }),
  );
  fireEvent.click(within(group('Motif')).getByRole('radio', { name: 'Çizgi' }));
  fireEvent.change(screen.getByLabelText('Vurgu rengi'), { target: { value: '#C9C9C9' } });
  fireEvent.change(screen.getByLabelText('Buton'), { target: { value: 'Devam Et' } });

  expect(screen.getByTestId('welcome-template')).toHaveAttribute('data-layout', 'solemn');
  expect(preview()).toHaveTextContent('Devam Et');
  expect(screen.getByTestId('design-band-preview')).toHaveStyle({ background: '#111111' });
  expect(previewButton).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
  const patch = calls.find((c) => c.method === 'PATCH');
  expect(patch?.path).toBe('/special-days/days/12/');
  expect(patch?.body).toMatchObject({
    design: {
      ...flag,
      layout: 'solemn',
      tone: '#111111',
      accent: '#c9c9c9',
      font: 'Cormorant Garamond',
      motif: 'cizgi',
      cta: 'Devam Et',
    },
    popup_title: 'Cumhuriyet Bayramımız kutlu olsun',
    before_title: 'Cumhuriyet Bayramımız şimdiden kutlu olsun',
    show_on: 'both',
    is_active: true,
  });

  await waitFor(() => expect(previewButton).toBeEnabled());
  fireEvent.click(previewButton);
  expect(getOccasionPreview()).toBe('2026-10-27');
});

it('restores the seeded design with Varsayılana Dön', async () => {
  days = [{ ...cumhuriyet, design: { ...flag, tone: '#111111', motif: 'cizgi' } }];
  renderEditor();
  await screen.findByTestId('when-hint');
  expect(screen.getByTestId('design-band-preview')).toHaveStyle({ background: '#111111' });
  fireEvent.click(screen.getByRole('button', { name: 'Varsayılana Dön' }));
  expect(screen.getByTestId('design-band-preview')).toHaveStyle({ background: '#c8102e' });
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ design: flag }),
  );
});

it('turns on the return-day message and edits its text', async () => {
  renderEditor();
  await screen.findByTestId('when-hint');
  expect(screen.queryByRole('radio', { name: 'Dönüş günü' })).toBeNull();
  fireEvent.click(screen.getByLabelText('Dönüş günü mesajı'));
  fireEvent.change(screen.getByLabelText('Başlık'), {
    target: { value: 'Geçmiş bayramınız kutlu olsun' },
  });
  expect(preview()).toHaveTextContent('Geçmiş bayramınız kutlu olsun');
  expect(preview()).toHaveTextContent('Cuma · 30 Ekim 2026');
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      return_enabled: true,
      return_title: 'Geçmiş bayramınız kutlu olsun',
    }),
  );
});

it('switches a day on, and asks before leaving unsaved changes', async () => {
  renderEditor();
  await screen.findByTestId('when-hint');
  fireEvent.change(screen.getByLabelText('Başlık'), { target: { value: 'Değişti' } });
  fireEvent.click(screen.getByRole('button', { name: 'Kandiller' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Değişiklikleri Bırak' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Kandiller' })).toHaveAttribute(
      'aria-current',
      'true',
    ),
  );
  expect(screen.getByText('Kapalı')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Bu günü kullan'));
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(calls.find((c) => c.method === 'PATCH')?.path).toBe('/special-days/days/30/'),
  );
  expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ is_active: true });
});

it('designs the birthday template', async () => {
  renderEditor('&gun=template:birthday');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Doğum günü' })).toHaveAttribute(
      'aria-current',
      'true',
    ),
  );
  expect(screen.queryByTestId('when-hint')).toBeNull();
  expect(
    screen.getByText(/hafta sonuna ya da tatile denk gelirse önceki iş günü/),
  ).toBeInTheDocument();
  expect(screen.getByTestId('welcome-template')).toHaveAttribute('data-layout', 'celebration');
  expect(preview()).toHaveTextContent('İyi ki doğdunuz, Ayşe');
  fireEvent.click(within(group('Motif')).getByRole('radio', { name: 'Konfeti' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
  const patch = calls.find((c) => c.method === 'PATCH');
  expect(patch?.path).toBe('/special-days/templates/birthday/');
  expect(patch?.body).toMatchObject({
    title: 'İyi ki doğdunuz, {first_name}',
    design: { layout: 'celebration', motif: 'konfeti', tone: '#4a2366' },
    show_on: 'both',
  });
});

it('sets the company-wide arife rule at once', async () => {
  renderEditor();
  const arife = await screen.findByLabelText('Arife yarım gününü tatil say (şirket geneli)');
  await waitFor(() => expect(arife).toBeEnabled());
  expect(arife).toBeChecked();
  fireEvent.click(arife);
  await waitFor(() =>
    expect(
      calls.find((c) => c.method === 'PATCH' && c.path === '/special-days/settings/')?.body,
    ).toEqual({
      arife_is_holiday: false,
    }),
  );
});
