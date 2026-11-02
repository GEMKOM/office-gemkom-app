import type { Page } from '@playwright/test';
import { expect, mockBackend, paginated, seedSession, test, type MockHandlers } from './fixtures';

// Neo, the assistant docked on the right of every React page.
// Contracts used here (the legacy widget's endpoints):
//   GET  /assistant/me/                 quota; 403 = access closed
//   POST /assistant/chat/               SSE: conversation, tool, delta, done
//   GET  /assistant/conversations/<id>/ a stored conversation
//   GET  /feedback/reports/             the user's reports; needs_info + questions = Neo asks
//   POST /feedback/reports/<id>/respond/
//   GET  /assistant/daily-summary/      summaries; /<id>/ detail; /<id>/read/
// Set NEO_SHOTS=<folder> to also save screenshots there.

const SHOTS = process.env.NEO_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const QUOTA = {
  allowed: true,
  used_credits: 1200,
  monthly_limit_credits: 5000,
  messages_today: 3,
  daily_message_limit: 40,
};

const QUESTION = 'TKL-2026-0142 ne durumda?';
const ANSWER = 'Teklif Onay Bekliyor aşamasında; son revizyon 28 Ekim günü gönderildi.';

const sseBody = [
  'event: conversation\ndata: {"conversation_id":501,"title":"Teklif durumu"}\n\n',
  'event: tool\ndata: {"name":"search_job_orders","status":"start"}\n\n',
  'event: tool\ndata: {"name":"search_job_orders","status":"done"}\n\n',
  `event: delta\ndata: ${JSON.stringify({ text: ANSWER.slice(0, 20) })}\n\n`,
  `event: delta\ndata: ${JSON.stringify({ text: ANSWER.slice(20) })}\n\n`,
  'event: done\ndata: {"conversation_id":501,"message_id":9001,"outcome":"ok"}\n\n',
].join('');

const chatHandlers: MockHandlers = {
  'GET /assistant/me/': { json: QUOTA },
  'POST /assistant/chat/': { body: sseBody, headers: { 'Content-Type': 'text/event-stream' } },
  'GET /assistant/conversations/': {
    json: paginated([{ id: 501, title: 'Teklif durumu', updated_at: '2026-11-02T08:00:00Z' }]),
  },
  'GET /assistant/conversations/501/': {
    json: {
      id: 501,
      title: 'Teklif durumu',
      messages: [
        { id: 9000, role: 'user', content: QUESTION },
        { id: 9001, role: 'assistant', content: ANSWER, feedback: null },
      ],
    },
  },
};

const neoEntry = (page: Page) => page.getByRole('button', { name: /^Neo, yapay zekâ asistanı/ });
const panel = (page: Page) => page.getByRole('complementary', { name: 'Neo' });

declare global {
  interface Window {
    __neoMarker?: string;
  }
}

test('opens from the rail, answers, and keeps the conversation across pages', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(page, chatHandlers, { session });

  await page.goto('/');
  await expect(
    page.getByRole('main').getByRole('heading', { level: 1, name: 'Çalışma Alanları' }),
  ).toBeVisible();
  await expect(neoEntry(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(panel(page)).toHaveCount(0); // inert while closed: not in the accessibility tree

  await neoEntry(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(
    panel(page).getByText('Merhaba, ben Neo. Size nasıl yardımcı olabilirim?'),
  ).toBeVisible();
  await expect(
    panel(page).getByText('Sorular kayıt altına alınır · Neo hata yapabilir'),
  ).toBeVisible();
  await expect(panel(page).getByText('Bu ay: 1.200/5.000 kredi · Bugün: 3/40')).toBeVisible();
  const input = panel(page).getByRole('textbox', { name: "Neo'ya sorunuz" });
  await expect(input).toBeFocused();

  // The page narrows instead of being covered: main makes room for the panel.
  await expect(page.getByRole('main')).toHaveCSS('padding-right', '380px');
  const panelBox = await panel(page).boundingBox();
  expect(panelBox).toMatchObject({ x: 1440 - 380, width: 380 });
  await shot(page, '10-desktop-empty');

  await input.fill(QUESTION);
  await input.press('Enter');
  const log = panel(page).getByRole('log', { name: 'Neo sohbeti' });
  await expect(log.getByText(QUESTION)).toBeVisible();
  await expect(log.getByText(ANSWER)).toBeVisible();
  await expect(log.getByText('İş emri aranıyor')).toBeVisible();
  await expect(log.getByRole('button', { name: 'Faydalı' })).toBeVisible();
  const chat = backend.callsTo('/assistant/chat/', 'POST');
  expect(chat).toHaveLength(1);
  expect(chat[0]!.body).toEqual({ message: QUESTION });
  await shot(page, '11-desktop-answer');

  // To another React page, client-side: the panel and its conversation stay.
  await page.evaluate(() => {
    window.__neoMarker = 'still here';
  });
  await page
    .getByRole('navigation', { name: 'Ana menü' })
    .getByRole('button', { name: 'Genel' })
    .click();
  await expect(
    page.getByRole('main').getByRole('heading', { level: 1, name: 'Genel Modülü' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__neoMarker)).toBe('still here');
  await expect(log.getByText(QUESTION)).toBeVisible();
  await expect(log.getByText(ANSWER)).toBeVisible();
  // The pointer leaves the Genel section, whose hover flyout would also take Escape.
  await page.mouse.move(700, 600);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await shot(page, '12-desktop-after-navigation');

  // Escape closes it and gives focus back to the entry.
  await input.focus();
  await page.keyboard.press('Escape');
  await expect(neoEntry(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(neoEntry(page)).toBeFocused();

  // A full reload: closed is remembered; Ctrl+K reopens on the same conversation.
  await page.reload();
  await expect(
    page.getByRole('main').getByRole('heading', { level: 1, name: 'Genel Modülü' }),
  ).toBeVisible();
  await expect(neoEntry(page)).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Control+k');
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByText(ANSWER)).toBeVisible();
  expect(backend.callsTo('/assistant/conversations/501/', 'GET')).toHaveLength(1);

  // Sohbet geçmişi lists it.
  await panel(page).getByRole('button', { name: 'Sohbet Geçmişi' }).click();
  await expect(panel(page).getByRole('button', { name: /^Teklif durumu/ })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Arşivle: Teklif durumu' })).toBeVisible();

  consoleErrors.expectNone();
});

const REPORT = {
  id: 77,
  kind: 'bug',
  title: 'Teklif PDF indirilmiyor',
  description: 'Teklif detayında PDF İndir butonuna basınca hiçbir şey olmuyor.',
  status: 'needs_info',
  ai_summary: 'PDF oluşturma isteği zaman aşımına uğruyor olabilir.',
  clarifying_questions: ['Hangi teklifte denediniz?', 'Tarayıcınız hangisi?'],
  user_responses: [],
  created_at: '2026-10-30T09:12:00Z',
  analyzed_at: '2026-10-30T09:14:00Z',
};

test("the bell's Neo notification opens that report's questions in the panel", async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      ...chatHandlers,
      'GET /notifications/unread_count/': { json: { count: 1 } },
      'GET /notifications/': {
        json: paginated([
          {
            id: 3001,
            title: 'Neo bildiriminizle ilgili bilgi istiyor',
            body: 'Teklif PDF indirilmiyor',
            category: 'system',
            link: '/?bildirim=77',
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ]),
      },
      'GET /feedback/reports/': {
        json: paginated([
          REPORT,
          { ...REPORT, id: 76, title: 'Eski bildirim', status: 'done', clarifying_questions: [] },
        ]),
      },
      'POST /feedback/reports/77/respond/': { json: { ...REPORT, status: 'new' } },
    },
    { session },
  );

  await page.goto('/general/');
  await expect(
    page.getByRole('main').getByRole('heading', { level: 1, name: 'Genel Modülü' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Bildirimler, 1 okunmamış' }).click();
  await page.getByRole('button', { name: /Neo bildiriminizle ilgili bilgi istiyor/ }).click();

  // Still on the same page, the panel on the report, the report open.
  await expect(page).toHaveURL(/\/general\/$/);
  await expect(panel(page)).toBeVisible();
  const report = panel(page).getByRole('listitem').filter({ hasText: 'Teklif PDF indirilmiyor' });
  await expect(report.getByRole('button', { name: /Teklif PDF indirilmiyor/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(report.getByText('Neo inceledi')).toBeVisible();
  await expect(report.getByText('Hangi teklifte denediniz?')).toBeVisible();
  await expect(
    panel(page).getByRole('listitem').filter({ hasText: 'Eski bildirim' }).getByRole('button'),
  ).toHaveAttribute('aria-expanded', 'false');
  await shot(page, '20-desktop-report-thread');

  await report
    .getByRole('textbox', { name: 'Yanıtınız' })
    .fill('TKL-2026-0142, Chrome kullanıyorum.');
  await report.getByRole('button', { name: 'Yanıtla' }).click();
  await expect(page.getByText('Yanıtınız alındı; bildirim yeniden inceleniyor.')).toBeVisible();
  expect(backend.callsTo('/feedback/reports/77/respond/', 'POST')[0]!.body).toEqual({
    message: 'TKL-2026-0142, Chrome kullanıyorum.',
  });
  expect(backend.callsTo('/notifications/3001/mark_read/', 'POST')).toHaveLength(1);

  // The same link opened as a URL (from an e-mail, or the Bildirimlerim page).
  await page.goto('/?bildirim=77');
  await expect(
    panel(page).getByRole('button', { name: /Teklif PDF indirilmiyor/ }),
  ).toHaveAttribute('aria-expanded', 'true');

  consoleErrors.expectNone();
});

test('locked access shows the legacy message instead of a chat', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(
    page,
    { 'GET /assistant/me/': { status: 403, json: { detail: 'Neo erişiminiz kapalı.' } } },
    { session },
  );
  consoleErrors.allow(/status of 403/);

  await page.goto('/');
  await neoEntry(page).click();
  await expect(panel(page).getByText(/Neo'ya erişiminiz kapatılmış görünüyor/)).toBeVisible();
  await expect(panel(page).getByText('Erişim kapalı')).toBeVisible();
  await expect(panel(page).getByRole('textbox')).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: 'Sohbet Geçmişi' })).toHaveCount(0);
  // Reports stay open to a locked user, as in the legacy widget.
  await panel(page).getByRole('button', { name: 'Hata / Öneri Bildir' }).click();
  await expect(panel(page).getByRole('textbox', { name: 'Kısa başlık' })).toBeVisible();

  consoleErrors.expectNone();
});

test("daily summaries open in a modal whose Neo'ya Sor prefills the chat", async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      ...chatHandlers,
      'GET /assistant/daily-summary/': {
        json: paginated([
          {
            id: 61,
            summary_date: '2026-11-02',
            status: 'ok',
            headline: 'Kaynakhanede iki iş emri tamamlandı',
            is_read: false,
            stats: { new_jobs_root: 2, new_jobs_child: 1, topics_new: 4, comments: 9 },
          },
          { id: 60, summary_date: '2026-11-01', status: 'empty', is_read: true, stats: {} },
        ]),
      },
      'GET /assistant/daily-summary/61/': {
        json: {
          id: 61,
          summary_date: '2026-11-02',
          status: 'ok',
          is_read: false,
          payload: { headline: 'Kaynakhanede iki iş emri tamamlandı', stats: {}, highlights: [] },
        },
      },
      'POST /assistant/daily-summary/61/read/': { json: { ok: true } },
    },
    { session },
  );

  await page.goto('/');
  await neoEntry(page).click();
  await panel(page).getByRole('button', { name: 'Günlük Özetler' }).click();
  await expect(panel(page).getByText('Hareket yok')).toBeVisible();
  await panel(page)
    .getByRole('button', { name: /Kaynakhanede iki iş emri tamamlandı/ })
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Kaynakhanede iki iş emri tamamlandı')).toBeVisible();
  await shot(page, '30-desktop-summary-modal');
  await dialog.getByRole('button', { name: "Neo'ya Sor" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel(page).getByRole('textbox', { name: "Neo'ya sorunuz" })).toHaveValue(
    'Dün neler oldu?',
  );
  expect(backend.callsTo('/assistant/daily-summary/61/read/', 'POST')).toHaveLength(1);
  expect(backend.callsTo('/assistant/chat/', 'POST')).toHaveLength(0);

  consoleErrors.expectNone();
});

test('first visit: a hint points at Neo, once', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true, neoHint: true });
  await mockBackend(page, chatHandlers, { session });

  await page.goto('/');
  const hint = page
    .getByRole('status')
    .filter({ hasText: "Neo'ya her sayfadan soru sorabilirsiniz" });
  await expect(hint).toBeVisible();
  await shot(page, '13-desktop-hint');
  await hint.getByRole('button', { name: 'Tamam' }).click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('main').getByRole('heading', { level: 1, name: 'Çalışma Alanları' }),
  ).toBeVisible();
  await expect(hint).toHaveCount(0);

  consoleErrors.expectNone();
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the top bar opens Neo as a full-height sheet', async ({ page, consoleErrors }) => {
    const session = await seedSession(page, { admin: true });
    await mockBackend(page, chatHandlers, { session });

    await page.goto('/');
    await expect(
      page.getByRole('main').getByRole('heading', { level: 1, name: 'Çalışma Alanları' }),
    ).toBeVisible();
    await shot(page, '40-phone-closed');
    await neoEntry(page).click();
    await expect(panel(page)).toBeVisible();
    // Once it has slid in, it covers the whole screen, top bar included.
    await expect.poll(async () => (await panel(page).boundingBox())?.x).toBe(0);
    const box = await panel(page).boundingBox();
    expect(box).toMatchObject({ y: 0, height: 844 });
    expect(Math.round(box!.width)).toBe(390);
    const input = panel(page).getByRole('textbox', { name: "Neo'ya sorunuz" });
    await input.fill(QUESTION);
    await input.press('Enter');
    await expect(panel(page).getByText(ANSWER)).toBeVisible();
    await shot(page, '41-phone-answer');

    await panel(page).getByRole('button', { name: 'Kapat' }).click();
    await expect(neoEntry(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(neoEntry(page)).toBeFocused();

    consoleErrors.expectNone();
  });
});
