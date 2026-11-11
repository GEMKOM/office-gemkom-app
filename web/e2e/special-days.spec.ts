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

test('HR edits a greeting and a company day, then previews the day', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const session = await seedSession(page, { admin: true });
  let birthdayTemplate = {
    kind: 'birthday',
    kind_label: 'Doğum günü',
    title: 'İyi ki doğdunuz, {first_name}',
    body: 'GEMKOM ailesi olarak yeni yaşınızı kutlarız.',
    show_popup: true,
    updated_by: null as number | null,
    updated_at: null as string | null,
  };
  const otherTemplates = [
    {
      kind: 'work_anniversary',
      kind_label: 'İş yıl dönümü',
      title: '{years}. yılınız kutlu olsun, {first_name}',
      body: '',
      show_popup: true,
      updated_by: null,
      updated_at: null,
    },
    {
      kind: 'public_holiday',
      kind_label: 'Resmi tatil',
      title: '{holiday_name} kutlu olsun',
      body: '',
      show_popup: true,
      updated_by: null,
      updated_at: null,
    },
  ];
  let yilsonu = {
    id: 4,
    name: 'Yılsonu',
    category: 'company',
    month: 12,
    day: 31,
    date: null as string | null,
    theme: 'company',
    popup_title: '',
    popup_body: '',
    show_popup: true,
    is_active: true,
    created_by: 1,
    created_by_name: 'İK',
    created_at: '2026-11-01T08:00:00Z',
    updated_at: '2026-11-01T08:00:00Z',
  };
  const backend = await mockBackend(
    page,
    {
      'GET /special-days/today/': ({ query }) =>
        query.get('date')
          ? {
              json: {
                date: query.get('date'),
                occasions: [
                  {
                    key: `special:4:${query.get('date')?.slice(0, 4)}`,
                    kind: 'special_day',
                    theme: 'company',
                    name: yilsonu.name,
                    category: 'company',
                    title: yilsonu.popup_title.replace('{first_name}', 'E2E') || yilsonu.name,
                    body: yilsonu.popup_body,
                    show_popup: true,
                    years: null,
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
          results: [
            {
              date: `${query.get('year')}-10-29`,
              end_date: `${query.get('year')}-10-29`,
              kind: 'public_holiday',
              theme: 'national',
              name: 'Cumhuriyet Bayramı',
              key: `holiday:cumhuriyet-bayrami:${query.get('year')}`,
              is_half_day: false,
            },
            {
              date: `${query.get('year')}-12-31`,
              end_date: `${query.get('year')}-12-31`,
              kind: 'special_day',
              theme: 'company',
              name: yilsonu.name,
              category: 'company',
              key: `special:4:${query.get('year')}`,
              id: 4,
            },
          ],
        },
      }),
      'GET /special-days/templates/': () => ({ json: [birthdayTemplate, ...otherTemplates] }),
      'PATCH /special-days/templates/birthday/': ({ body }) => {
        birthdayTemplate = {
          ...birthdayTemplate,
          ...(body as object),
          updated_at: '2026-11-11T09:30:00Z',
        };
        return { json: birthdayTemplate };
      },
      'GET /special-days/days/': () => ({ json: [yilsonu] }),
      'PATCH /special-days/days/4/': ({ body }) => {
        yilsonu = { ...yilsonu, ...(body as object) };
        return { json: yilsonu };
      },
    },
    { session },
  );

  await page.goto('/human_resources/special-days');
  await expect(page.getByText('İyi ki doğdunuz, Ayşe')).toBeVisible();

  // The whole year, by month; next year is a click away.
  const year = new Date().getFullYear();
  const yearList = page.getByTestId('year-calendar');
  await expect(yearList.getByRole('region', { name: `Ekim ${year}` })).toContainText(
    'Cumhuriyet Bayramı',
  );
  await page
    .locator('label')
    .filter({ hasText: new RegExp(`^${year + 1}$`) })
    .click();
  await expect(yearList.getByRole('region', { name: `Aralık ${year + 1}` })).toContainText(
    'Yılsonu',
  );
  await page
    .locator('label')
    .filter({ hasText: new RegExp(`^${year}$`) })
    .click();
  await expect(yearList.getByRole('region', { name: `Aralık ${year}` })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/8-hr-page.png`, fullPage: true });

  // Kutlama metinleri: the preview follows the text as it is typed.
  await page.getByRole('button', { name: 'Doğum günü metnini düzenle' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Başlık').fill('Doğum gününüz kutlu olsun, {full_name}');
  await expect(dialog.getByTestId('greeting-preview')).toContainText(
    'Doğum gününüz kutlu olsun, Ayşe Kaya',
  );
  if (shots) await page.screenshot({ path: `${shots}/8b-hr-edit-template.png` });
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Doğum gününüz kutlu olsun, Ayşe Kaya')).toBeVisible();
  const patchedTemplate = backend.calls.find(
    (c) => c.method === 'PATCH' && c.path === '/special-days/templates/birthday/',
  );
  expect(patchedTemplate?.body).toEqual({
    title: 'Doğum gününüz kutlu olsun, {full_name}',
    body: 'GEMKOM ailesi olarak yeni yaşınızı kutlarız.',
    show_popup: true,
  });

  // Şirket özel günleri: a new welcome title for Yılsonu.
  await page.getByRole('button', { name: 'Yılsonu düzenle' }).click();
  await dialog.getByLabel('Başlık').fill('Yeni yılınız kutlu olsun, {first_name}');
  await expect(dialog.getByTestId('greeting-preview')).toContainText(
    'Yeni yılınız kutlu olsun, Ayşe',
  );
  if (shots) await page.screenshot({ path: `${shots}/9-hr-edit-day.png` });
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(dialog).toHaveCount(0);
  const patchedDay = backend.calls.find(
    (c) => c.method === 'PATCH' && c.path === '/special-days/days/4/',
  );
  expect(patchedDay?.body).toMatchObject({
    name: 'Yılsonu',
    month: 12,
    day: 31,
    date: null,
    popup_title: 'Yeni yılınız kutlu olsun, {first_name}',
  });

  // Right after saving: preview that day across the app.
  const saved = page.getByTestId('day-saved');
  await expect(saved).toContainText('Yılsonu kaydedildi.');
  await saved.getByRole('button', { name: 'Bu Günü Önizle' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('occasion-preview-banner')).toContainText('31 Aralık');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Yeni yılınız kutlu olsun, E2E' }).last(),
  ).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/10-hr-day-preview.png` });
});
