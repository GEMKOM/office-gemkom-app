import { expect, mockBackend, seedSession, test } from './fixtures';

// Özel Günler, direction C "Tema günü". Contracts:
//   GET  /special-days/today/       occasions, colleagues with a day today, received
//   GET  /special-days/upcoming/    {start, days, results}
//   POST /special-days/celebrate/   Kutla

const birthday = {
  key: 'birthday:2026',
  kind: 'birthday',
  theme: 'birthday',
  name: 'Doğum gününüz',
  title: 'İyi ki doğdunuz, E2E',
  body: 'GEMKOM ailesi olarak sağlıklı, mutlu ve başarılı bir yaş dileriz.',
  show_popup: true,
  years: null,
  is_half_day: false,
};

const arife = {
  key: 'holiday:cumhuriyet-bayrami:2026',
  kind: 'public_holiday',
  theme: 'national',
  name: 'Cumhuriyet Bayramı',
  local_name: 'Cumhuriyet Bayramı Arifesi',
  title: 'Cumhuriyet Bayramı kutlu olsun',
  body: 'Cumhuriyetimizin 103. yılını gururla kutluyoruz.',
  show_popup: true,
  years: null,
  is_half_day: true,
};

const colleagues = [
  {
    user_id: 21,
    full_name: 'Ayşe Kaya',
    department_code: 'procurement',
    position_title: 'Uzman',
    kind: 'birthday',
    years: null,
    celebrated_by_me: false,
    celebration_count: 2,
  },
  {
    user_id: 22,
    full_name: 'Burak Tunç',
    department_code: 'welding',
    position_title: 'Ustabaşı',
    kind: 'work_anniversary',
    years: 10,
    celebrated_by_me: true,
    celebration_count: 4,
  },
];

const upcoming = {
  start: '2026-10-28',
  days: 14,
  results: [
    {
      date: '2026-10-29',
      end_date: '2026-10-29',
      kind: 'public_holiday',
      theme: 'national',
      name: 'Cumhuriyet Bayramı',
      key: 'holiday:cumhuriyet-bayrami:2026',
      is_half_day: false,
    },
    {
      date: '2026-11-02',
      end_date: '2026-11-02',
      kind: 'birthday',
      theme: 'birthday',
      name: 'Doğum günü',
      user_id: 30,
      full_name: 'Selin Yıldız',
    },
    {
      date: '2026-11-04',
      end_date: '2026-11-04',
      kind: 'work_anniversary',
      theme: 'anniversary',
      name: '5. iş yılı',
      user_id: 31,
      full_name: 'Kemal Aras',
      years: 5,
    },
  ],
};

const shots = process.env.SPECIAL_DAYS_SHOTS;

test('your birthday: the band turns plum and a full-screen welcome opens once', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const session = await seedSession(page, { admin: true });
  await mockBackend(
    page,
    {
      'GET /special-days/today/': {
        json: {
          date: '2026-11-11',
          occasions: [birthday],
          colleagues: [],
          received: [
            {
              sender_id: 21,
              sender_name: 'Ayşe Kaya',
              kind: 'birthday',
              message: 'Nice mutlu yıllara',
              created_at: '2026-11-11T07:00:00Z',
            },
            {
              sender_id: 22,
              sender_name: 'Burak Tunç',
              kind: 'birthday',
              message: 'İyi ki varsın, kaynak ekibinden selamlar',
              created_at: '2026-11-11T07:10:00Z',
            },
          ],
        },
      },
      'GET /special-days/upcoming/': { json: upcoming },
    },
    { session },
  );

  await page.goto('/');
  const welcome = page.getByTestId('occasion-welcome');
  await expect(
    page.getByRole('heading', { level: 1, name: 'İyi ki doğdunuz, E2E' }).last(),
  ).toBeVisible();
  await expect(page.getByText('Nice mutlu yıllara')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/1-birthday-welcome.png` });

  await page.getByRole('button', { name: 'Uygulamaya Geç' }).click();
  await expect(welcome).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-occasion', 'birthday');
  const band = page.locator('header').filter({ hasText: 'İyi ki doğdunuz, E2E' }).first();
  await expect(band).toHaveCSS('background-color', 'rgb(74, 35, 102)');
  if (shots) await page.screenshot({ path: `${shots}/2-birthday-home.png` });

  // Same day, next visit: theme yes, welcome no.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-occasion', 'birthday');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('occasion-welcome')).toHaveCount(0);
});

test('arife: the flag-red band, colleagues with Kutla, and the message goes out', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /special-days/today/': {
        json: { date: '2026-10-28', occasions: [arife], colleagues, received: [] },
      },
      'GET /special-days/upcoming/': { json: upcoming },
      'POST /special-days/celebrate/': { status: 201, json: { id: 1 } },
    },
    { session },
  );

  await page.goto('/');
  await expect(page.getByText('Bugün yarım gün çalışılır.')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/3-arife-welcome.png` });
  await page.getByRole('button', { name: 'Uygulamaya Geç' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-occasion', 'national');
  await expect(page.getByText('Cumhuriyet Bayramı kutlu olsun').first()).toBeVisible();
  await expect(page.getByText('Selin Yıldız, doğum günü')).toBeVisible();
  await expect(page.getByText('Kutladınız')).toBeVisible();

  await page.getByRole('button', { name: 'Ayşe Kaya kutla' }).click();
  await page.getByLabel('Kısa mesaj (isteğe bağlı)').fill('Nice mutlu yıllara');
  if (shots) await page.screenshot({ path: `${shots}/4-arife-kutla.png` });
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByText('Ayşe Kaya için kutlamanız iletildi')).toBeVisible();
  const sent = backend.calls.find(
    (c) => c.method === 'POST' && c.path === '/special-days/celebrate/',
  );
  expect(sent?.body).toEqual({ recipient: 21, kind: 'birthday', message: 'Nice mutlu yıllara' });

  // Another page keeps the theme.
  await page.goto('/general');
  await expect(page.locator('html')).toHaveAttribute('data-occasion', 'national');
  if (shots) await page.screenshot({ path: `${shots}/5-arife-other-page.png` });
});

test('HR previews a day from İnsan Kaynakları > Özel Günler, like impersonation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const session = await seedSession(page, { admin: true });
  await mockBackend(
    page,
    {
      'GET /special-days/today/': ({ query }) =>
        query.get('date') === '2026-10-28'
          ? { json: { date: '2026-10-28', occasions: [arife], colleagues, received: [] } }
          : { json: { date: '2026-11-11', occasions: [], colleagues: [], received: [] } },
      'GET /special-days/upcoming/': { json: upcoming },
    },
    { session },
  );

  await page.goto('/human_resources/special-days');
  await expect(page.getByRole('heading', { level: 1, name: 'Özel Günler' })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-occasion', /.+/);
  await page.getByRole('tab', { name: 'Önizleme' }).click();
  await page.getByRole('textbox', { name: 'Gün', exact: true }).fill('2026-10-28');
  if (shots) await page.screenshot({ path: `${shots}/6-hr-preview-page.png` });
  await page.getByRole('button', { name: 'Bu Günü Önizle' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('occasion-preview-banner')).toContainText('28 Ekim 2026');
  await page.getByRole('button', { name: 'Uygulamaya Geç' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-occasion', 'national');
  await expect(page.getByRole('button', { name: 'Ayşe Kaya kutla' })).toBeDisabled();
  if (shots) await page.screenshot({ path: `${shots}/7-hr-preview-home.png` });

  // It holds across a reload and other pages, until ended.
  await page.reload();
  await expect(page.getByTestId('occasion-preview-banner')).toBeVisible();
  await page.goto('/general');
  await expect(page.locator('html')).toHaveAttribute('data-occasion', 'national');
  await page.getByRole('button', { name: 'Önizlemeyi Bitir' }).click();
  await expect(page.getByTestId('occasion-preview-banner')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-occasion', /.+/);
});

test('HR designs a day in Tasarım, then previews it across the app', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const session = await seedSession(page, { admin: true });
  const flag = {
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
  const texts = {
    popup_title: 'Cumhuriyet Bayramımız kutlu olsun',
    popup_body: 'Cumhuriyetimizin {years}. yılını gururla kutluyoruz. İyi bayramlar.',
    popup_note: '',
    before_title: 'Cumhuriyet Bayramımız şimdiden kutlu olsun',
    before_body: '',
    before_note: '{tatil_gunleri} tatil. {donus_gunu} günü görüşmek üzere.',
    return_title: '',
    return_body: '',
  };
  let cumhuriyet: Record<string, unknown> = {
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
    defaults: {
      design: flag,
      ...texts,
      show_on: 'both',
      color_band: true,
      keep_theme_during: true,
      show_popup: true,
      return_enabled: false,
    },
    ...texts,
  };
  const birthday = {
    kind: 'birthday',
    kind_label: 'Doğum günü',
    title: 'İyi ki doğdunuz, {first_name}',
    body: 'GEMKOM ailesi olarak sağlıklı, mutlu ve başarılı bir yaş dileriz.',
    show_popup: true,
    updated_by: null,
    updated_at: null,
  };
  const calendarRow = (year: string) => ({
    date: `${year}-10-29`,
    end_date: `${year}-10-29`,
    kind: 'public_holiday',
    theme: 'national',
    name: 'Cumhuriyet Bayramı',
    key: `holiday:cumhuriyet-bayrami:${year}`,
    id: 12,
    slug: 'cumhuriyet-bayrami',
    before_date: `${year}-10-27`,
    display_date: `${year}-10-27`,
    return_date: null,
    design: cumhuriyet.design,
    show_on: 'both',
    is_active: true,
  });
  const backend = await mockBackend(
    page,
    {
      'GET /special-days/today/': ({ query }) =>
        query.get('date') === '2026-10-27'
          ? {
              json: {
                date: '2026-10-27',
                occasions: [
                  {
                    key: 'holiday:cumhuriyet-bayrami:2026',
                    kind: 'public_holiday',
                    theme: 'national',
                    name: 'Cumhuriyet Bayramı',
                    phase: 'before',
                    date: '2026-10-29',
                    end_date: '2026-10-29',
                    display_date: '2026-10-27',
                    kicker: '',
                    title: String(cumhuriyet.before_title),
                    body: 'Cumhuriyetimizin 103. yılını gururla kutluyoruz. İyi bayramlar.',
                    note: '28 Ekim arifesi ve 29 Ekim tatil. 30 Ekim Cuma günü görüşmek üzere.',
                    numeral: '103',
                    design: cumhuriyet.design,
                    color_band: true,
                    show_popup: true,
                    years: 103,
                    is_half_day: false,
                  },
                ],
                colleagues: [],
                received: [],
              },
            }
          : { json: { date: '2026-11-11', occasions: [], colleagues: [], received: [] } },
      'GET /special-days/upcoming/': { json: { start: '2026-11-11', days: 60, results: [] } },
      'GET /special-days/calendar/': ({ query }) => ({
        json: {
          year: Number(query.get('year')),
          results: [calendarRow(String(query.get('year')))],
        },
      }),
      'GET /special-days/days/': () => ({ json: [cumhuriyet] }),
      'PATCH /special-days/days/12/': ({ body }) => {
        cumhuriyet = { ...cumhuriyet, ...(body as object) };
        return { json: cumhuriyet };
      },
      'GET /special-days/templates/': () => ({ json: [birthday] }),
      'GET /special-days/settings/': { json: { arife_is_holiday: true, founded_on: null } },
    },
    { session },
  );

  // Takvim: the year by month, each day's look, and when its welcome shows.
  await page.goto('/human_resources/special-days');
  const year = new Date().getFullYear();
  const yearList = page.getByTestId('year-calendar');
  const october = yearList.getByRole('region', { name: `Ekim ${year}` });
  await expect(october).toContainText('Cumhuriyet Bayramı');
  await expect(october).toContainText('Karşılama 27 Ekim');
  await expect(october.getByTestId('design-chip')).toBeVisible();
  await page
    .locator('label')
    .filter({ hasText: new RegExp(`^${year + 1}$`) })
    .click();
  await expect(yearList.getByRole('region', { name: `Ekim ${year + 1}` })).toBeVisible();
  await page
    .locator('label')
    .filter({ hasText: new RegExp(`^${year}$`) })
    .click();
  if (shots) await page.screenshot({ path: `${shots}/8-hr-takvim.png`, fullPage: true });

  // Tasarım, opened from the day's row.
  await yearList.getByRole('button', { name: 'Cumhuriyet Bayramı 29 Ekim tasarımı' }).click();
  await expect(page.getByRole('tab', { name: 'Tasarım' })).toHaveAttribute('aria-selected', 'true');
  const preview = page.getByTestId('design-welcome-preview');
  await expect(preview).toContainText('Cumhuriyet Bayramımız şimdiden kutlu olsun');
  await expect(preview).toContainText('30 Ekim Cuma günü görüşmek üzere');
  await expect(page.getByTestId('when-hint')).toContainText('27 Ekim Salı gösterilir');
  if (shots) await page.screenshot({ path: `${shots}/9-hr-tasarim.png`, fullPage: true });

  await page
    .getByRole('radiogroup', { name: 'Düzen' })
    .getByRole('radio', { name: 'Anma' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Motif' })
    .getByRole('radio', { name: 'Defne' })
    .click();
  await page
    .getByLabel('Başlık', { exact: true })
    .fill('Cumhuriyetimizin 103. yılı şimdiden kutlu olsun');
  await expect(preview.getByTestId('welcome-template')).toHaveAttribute('data-layout', 'solemn');
  await expect(preview).toContainText('Cumhuriyetimizin 103. yılı şimdiden kutlu olsun');
  if (shots) await page.screenshot({ path: `${shots}/10-hr-tasarim-edit.png`, fullPage: true });
  await expect(page.getByRole('button', { name: 'Bu Günü Önizle' })).toBeDisabled();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByRole('button', { name: 'Bu Günü Önizle' })).toBeEnabled();
  const patched = backend.calls.find(
    (c) => c.method === 'PATCH' && c.path === '/special-days/days/12/',
  );
  expect(patched?.body).toMatchObject({
    design: { ...flag, layout: 'solemn', motif: 'defne' },
    before_title: 'Cumhuriyetimizin 103. yılı şimdiden kutlu olsun',
    popup_title: 'Cumhuriyet Bayramımız kutlu olsun',
  });

  // The preview opens on the working day before, in the saved design.
  await page.getByRole('button', { name: 'Bu Günü Önizle' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('occasion-preview-banner')).toContainText('27 Ekim 2026');
  const welcome = page.getByTestId('occasion-welcome');
  await expect(welcome.getByTestId('welcome-template')).toHaveAttribute('data-layout', 'solemn');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Cumhuriyetimizin 103. yılı şimdiden kutlu olsun',
    }),
  ).toBeVisible();
  await expect(page.getByText('Perşembe · 29 Ekim')).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/11-hr-preview-welcome.png` });
  await page.getByRole('button', { name: 'Uygulamaya Geç' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-occasion', 'national');
});
