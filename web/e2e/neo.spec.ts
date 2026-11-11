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
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /, E2E$/ })).toBeVisible();
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
  await expect(log.getByText('İş emirleri aranıyor')).toBeVisible();
  await expect(log.getByRole('button', { name: 'Faydalı' })).toBeVisible();
  const chat = backend.callsTo('/assistant/chat/', 'POST');
  expect(chat).toHaveLength(1);
  expect(chat[0]!.body).toEqual({ message: QUESTION, source: 'panel' });
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

// What a list answer looks like now: a real table, linked job numbers,
// follow-up questions, the Excel export and the wide panel.
const TABLE_ANSWER = [
  'Toplam **2** aktif iş emri var:',
  '',
  '| İş No | Başlık | Tutar |',
  '|---|---|---:|',
  '| 293-10 | TUNNEL PANEL | 1.200,50 |',
  '| 114-14 | LADLE | 980 |',
  '',
  'Detay için [satın alma talepleri](/procurement/purchase-requests/registry/) sayfasına bakın.',
].join('\n');

const tableSse = [
  'event: conversation\ndata: {"conversation_id":502,"title":"Aktif işler"}\n\n',
  'event: tool\ndata: {"name":"query_data","status":"start"}\n\n',
  'event: tool\ndata: {"name":"query_data","status":"done"}\n\n',
  'event: tool\ndata: {"name":"get_job_costs","status":"start"}\n\n',
  'event: tool\ndata: {"name":"get_job_costs","status":"done"}\n\n',
  'event: tool\ndata: {"name":"get_job_costs","status":"start"}\n\n',
  'event: tool\ndata: {"name":"get_job_costs","status":"done"}\n\n',
  `event: delta\ndata: ${JSON.stringify({ text: TABLE_ANSWER.slice(0, 60) })}\n\n`,
  `event: delta\ndata: ${JSON.stringify({ text: TABLE_ANSWER.slice(60) })}\n\n`,
  `event: followups\ndata: ${JSON.stringify({ items: ['293-10 maliyeti ne?', 'Geciken işler hangileri?'] })}\n\n`,
  'event: done\ndata: {"conversation_id":502,"message_id":9101,"outcome":"answered"}\n\n',
].join('');

test('a list answer is a table with job links, Excel export, follow-ups and wide mode', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      ...chatHandlers,
      'POST /assistant/chat/': { body: tableSse, headers: { 'Content-Type': 'text/event-stream' } },
      'POST /assistant/messages/9101/feedback/': { json: { ok: true } },
    },
    { session },
  );

  await page.goto('/');
  await neoEntry(page).click();
  const input = panel(page).getByRole('textbox', { name: "Neo'ya sorunuz" });
  await input.fill('Aktif iş emirlerini listele');
  await input.press('Enter');
  const log = panel(page).getByRole('log', { name: 'Neo sohbeti' });

  // A table, not pipes.
  const table = log.getByRole('table');
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveText(['İş No', 'Başlık', 'Tutar']);
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(log.getByText('| İş No |')).toHaveCount(0);
  await expect(log.getByText('2 satır')).toBeVisible();
  // Job numbers and in-app links go to the app's pages.
  await expect(table.getByRole('link', { name: '293-10' })).toHaveAttribute(
    'href',
    '/projects/project-tracking/?job_no=293-10',
  );
  await expect(log.getByRole('link', { name: 'satın alma talepleri' })).toHaveAttribute(
    'href',
    '/procurement/purchase-requests/registry/',
  );
  // Every tool has a Turkish label; repeated runs show a count.
  await expect(log.getByText('Veri sorgulanıyor')).toBeVisible();
  await expect(log.getByText('Maliyetler alınıyor ×2')).toBeVisible();
  await shot(page, '15-table-answer');

  // The table downloads as .xlsx.
  const download = page.waitForEvent('download');
  await log.getByRole('button', { name: 'Tabloyu Excel’e aktar' }).click();
  expect((await download).suggestedFilename()).toMatch(/^neo-tablo-\d{4}-\d{2}-\d{2}\.xlsx$/);

  // Follow-up questions under the answer; a thumbs down asks why.
  const followup = log.getByRole('button', { name: /Geciken işler hangileri\?/ });
  await expect(followup).toBeVisible();
  await log.getByRole('button', { name: 'Faydasız' }).click();
  await log.getByRole('button', { name: 'Eksik' }).click();
  await expect
    .poll(() => backend.callsTo('/assistant/messages/9101/feedback/', 'POST').length)
    .toBe(2);
  expect(backend.callsTo('/assistant/messages/9101/feedback/', 'POST')[1]!.body).toEqual({
    value: -1,
    reason: 'incomplete',
  });

  // A follow-up is sent as the next question.
  await followup.click();
  await expect.poll(() => backend.callsTo('/assistant/chat/', 'POST').length).toBe(2);
  expect(backend.callsTo('/assistant/chat/', 'POST')[1]!.body).toMatchObject({
    message: 'Geciken işler hangileri?',
    conversation_id: 502,
  });

  // Wide mode: the page makes room for a wider panel, and it is remembered.
  await panel(page).getByRole('button', { name: 'Genişlet' }).click();
  await expect(page.getByRole('main')).toHaveCSS('padding-right', '680px');
  await shot(page, '16-wide');
  await page.reload();
  await expect(page.getByRole('main')).toHaveCSS('padding-right', '680px');
  await panel(page).getByRole('button', { name: 'Daralt' }).click();
  await expect(page.getByRole('main')).toHaveCSS('padding-right', '380px');

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

// A record's modal: "Neo'ya sor" asks about that record, with it as context.
const ORDER = {
  id: 44,
  supplier_name: 'e2e Çelik A.Ş.',
  purchase_request_number: 'SAT-44',
  status: 'awaiting_payment',
  status_label: 'Ödeme Bekliyor',
  total_amount: '12000.00',
  total_tax_amount: '2400.00',
  tax_rate: '20.00',
  tax_outstanding: '2400.00',
  currency: 'EUR',
  priority: 'normal',
  created_at: '2026-10-20T08:00:00Z',
  payment_schedules: [],
  lines: [],
};

test("a record modal's Neo'ya sor asks about that record, and Neo stays usable beside it", async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      ...chatHandlers,
      'GET /procurement/purchase-orders/': {
        json: { count: 1, next: null, previous: null, results: [ORDER] },
      },
      'GET /procurement/purchase-orders/44/': { json: ORDER },
    },
    { session },
  );

  await page.goto('/finance/purchase-orders/?order=44');
  const dialog = page.getByRole('dialog', { name: /Sipariş Detayları/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: "Neo'ya sor" }).click();
  await page.getByRole('menuitem', { name: '44 numaralı sipariş ne durumda?' }).click();

  // Asked at once, with the record, the page and where it came from.
  await expect.poll(() => backend.callsTo('/assistant/chat/', 'POST').length).toBe(1);
  const body = backend.callsTo('/assistant/chat/', 'POST')[0]!.body as Record<string, unknown>;
  expect(body).toMatchObject({
    message: '44 numaralı sipariş ne durumda?',
    source: 'page_button',
    context: { type: 'purchase_order', id: '44', label: 'e2e Çelik A.Ş.' },
  });
  expect(String((body.context as { path: string }).path)).toContain('/finance/purchase-orders/');

  // The modal stays; the panel is beside it, not under its overlay.
  await expect(dialog).toBeVisible();
  const log = panel(page).getByRole('log', { name: 'Neo sohbeti' });
  await expect(log.getByText(ANSWER)).toBeVisible();
  await expect(log.getByText('Sipariş 44 · e2e Çelik A.Ş.')).toBeVisible();
  const box = await panel(page).boundingBox();
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.closest('#neo-panel') !== null,
    [box!.x + box!.width / 2, box!.y + box!.height / 2],
  );
  expect(hit).toBe(true);
  // ...and the modal narrows into the space left of it, fully on screen.
  const modalBox = await dialog.boundingBox();
  expect(modalBox!.x).toBeGreaterThanOrEqual(0);
  expect(modalBox!.x + modalBox!.width).toBeLessThanOrEqual(box!.x + 1);
  await shot(page, '17-record-modal');

  // The pill carries the record to the next question until it is taken off.
  const input = panel(page).getByRole('textbox', { name: "Neo'ya sorunuz" });
  await input.fill('Teslim tarihi ne?');
  await expect(input).toHaveValue('Teslim tarihi ne?');
  await expect(panel(page).getByText('Sipariş 44 · e2e Çelik A.Ş.').last()).toBeVisible();
  await panel(page).getByRole('button', { name: 'Kaydı sorudan çıkar' }).click();
  await input.press('Enter');
  await expect.poll(() => backend.callsTo('/assistant/chat/', 'POST').length).toBe(2);
  expect(backend.callsTo('/assistant/chat/', 'POST')[1]!.body).not.toHaveProperty('context');

  consoleErrors.expectNone();
});

test('a write Neo proposes waits for Onayla, then shows what it created', async ({
  page,
  consoleErrors,
}) => {
  const card = {
    id: 77,
    kind: 'discussion_topic',
    label: 'Tartışma konusu aç',
    status: 'pending',
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    fields: [
      { key: 'job_no', label: 'İş emri', type: 'text', value: '293-10', editable: false, required: true, display: '293-10 · Tunnel panel' },
      { key: 'title', label: 'Başlık', type: 'text', value: 'Sevk tarihi', editable: true, required: true },
      { key: 'content', label: 'İçerik', type: 'textarea', value: 'Sevk ne zaman?', editable: true, required: true },
    ],
  };
  const actionSse = [
    'event: conversation\ndata: {"conversation_id":502,"title":"Konu"}\n\n',
    'event: tool\ndata: {"name":"propose_discussion_topic","status":"start"}\n\n',
    'event: tool\ndata: {"name":"propose_discussion_topic","status":"done"}\n\n',
    `event: action\ndata: ${JSON.stringify(card)}\n\n`,
    `event: delta\ndata: ${JSON.stringify({ text: 'Kartı kontrol edip onaylayabilirsiniz.' })}\n\n`,
    'event: done\ndata: {"conversation_id":502,"message_id":9201,"outcome":"answered"}\n\n',
  ].join('');
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      ...chatHandlers,
      'POST /assistant/chat/': { body: actionSse, headers: { 'Content-Type': 'text/event-stream' } },
      'POST /assistant/actions/77/confirm/': {
        json: {
          ...card,
          status: 'confirmed',
          fields: card.fields.map((f) => (f.key === 'title' ? { ...f, value: 'Sevk tarihi kesin mi?' } : f)),
          result: { id: 41, label: 'Tartışma #41', url: '/projects/project-tracking/?job_no=293-10&topic_id=41' },
        },
      },
    },
    { session },
  );

  await page.goto('/');
  await neoEntry(page).click();
  const input = panel(page).getByRole('textbox', { name: "Neo'ya sorunuz" });
  await input.fill('293-10 için sevk tarihi konusu aç');
  await input.press('Enter');

  const action = panel(page).getByRole('region', { name: 'Tartışma konusu aç' });
  await expect(action).toBeVisible();
  await expect(action.getByText('Onay bekliyor')).toBeVisible();
  await expect(action.getByText('293-10 · Tunnel panel')).toBeVisible();
  await expect(panel(page).getByText('Tartışma konusu hazırlanıyor')).toBeVisible();
  // Nothing is written by the answer itself.
  expect(backend.callsTo('/assistant/actions/77/confirm/', 'POST')).toHaveLength(0);
  await shot(page, '19-action-card');

  await action.getByRole('textbox', { name: /Başlık/ }).fill('Sevk tarihi kesin mi?');
  await action.getByRole('button', { name: 'Onayla' }).click();
  await expect(action.getByText(/Tartışma #41 oluşturuldu/)).toBeVisible();
  expect(backend.callsTo('/assistant/actions/77/confirm/', 'POST')[0]!.body).toEqual({
    payload: { title: 'Sevk tarihi kesin mi?' },
  });
  await expect(action.getByRole('link', { name: 'Aç' })).toHaveAttribute(
    'href',
    '/projects/project-tracking/?job_no=293-10&topic_id=41',
  );
  await expect(action.getByRole('button', { name: 'Onayla' })).toHaveCount(0);
  await shot(page, '20-action-confirmed');

  consoleErrors.expectNone();
});

test('the home page card asks Neo at once', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(page, chatHandlers, { session });

  await page.goto('/');
  const card = page
    .getByRole('main')
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: "Neo'ya sorun" }) });
  await expect(card).toBeVisible();
  await card.getByRole('textbox', { name: "Neo'ya sorunuz" }).fill(QUESTION);
  await card.getByRole('button', { name: "Neo'ya sor" }).click();

  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByText(ANSWER)).toBeVisible();
  expect(backend.callsTo('/assistant/chat/', 'POST')[0]!.body).toMatchObject({
    message: QUESTION,
    source: 'home',
  });
  await shot(page, '18-home-card');

  consoleErrors.expectNone();
});

test("daily summaries open in a modal whose Neo'ya sor asks about that summary", async ({
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
  await dialog.getByRole('button', { name: "Neo'ya sor" }).click();
  await page
    .getByRole('menuitem', { name: '02.11.2026 özetinde beni ilgilendiren ne var?' })
    .click();
  await expect.poll(() => backend.callsTo('/assistant/chat/', 'POST').length).toBe(1);
  expect(backend.callsTo('/assistant/chat/', 'POST')[0]!.body).toMatchObject({
    source: 'page_button',
    context: { type: 'daily_summary', id: '2026-11-02' },
  });
  // Opened from the summaries list, asking leaves the summary as read (as
  // the old button did), and the answer comes up in the chat.
  await expect(dialog).toHaveCount(0);
  await expect(panel(page).getByText(ANSWER)).toBeVisible();
  await expect.poll(() => backend.callsTo('/assistant/daily-summary/61/read/', 'POST').length).toBe(1);

  consoleErrors.expectNone();
});

// The morning check: an unread daily summary pops up on the first page of a
// visit, a banner and Neo's dot carry it afterwards.
const istanbulToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

function morningHandlers(read: { value: boolean }): MockHandlers {
  const summary = () => ({
    id: 62,
    summary_date: istanbulToday(),
    status: 'ok',
    is_read: read.value,
    generated_at: '2026-11-03T05:20:00Z',
    headline: 'Dün üç iş emri açıldı',
    payload: { headline: 'Dün üç iş emri açıldı', stats: {}, highlights: [] },
  });
  return {
    ...chatHandlers,
    'GET /assistant/daily-summary/latest/': () => ({ json: { summary: summary() } }),
    'GET /assistant/daily-summary/62/': () => ({ json: summary() }),
    'GET /assistant/daily-summary/': () => ({ json: paginated([summary()]) }),
    'POST /assistant/daily-summary/62/read/': () => {
      read.value = true;
      return { json: { ok: true } };
    },
  };
}

test('the daily summary pops up on the first page, and "Okudum" reads it for good', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const read = { value: false };
  const backend = await mockBackend(page, morningHandlers(read), { session });

  await page.goto('/');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Dün üç iş emri açıldı')).toBeVisible();
  await expect(neoEntry(page).locator('[data-unread]')).toHaveCount(1);
  await shot(page, '50-desktop-morning-summary');

  await dialog.getByRole('button', { name: 'Okudum' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(neoEntry(page).locator('[data-unread]')).toHaveCount(0);
  expect(backend.callsTo('/assistant/daily-summary/62/read/', 'POST')).toHaveLength(1);
  expect(backend.callsTo('/assistant/daily-summary/62/read/', 'POST')[0]!.body).toMatchObject({
    source: 'modal',
  });

  // Read: a reload (a new visit in the same tab) is quiet.
  await page.reload();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /, E2E$/ })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('daily-summary-banner')).toHaveCount(0);

  consoleErrors.expectNone();
});

test('"Daha sonra" snoozes: no read, then a banner whose "Oku" opens it, and the dot leads to the list', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const read = { value: false };
  const backend = await mockBackend(page, morningHandlers(read), { session });

  await page.goto('/');
  await page.getByRole('dialog').getByRole('button', { name: 'Daha Sonra' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(backend.callsTo('/assistant/daily-summary/62/read/', 'POST')).toHaveLength(0);
  await expect(neoEntry(page).locator('[data-unread]')).toHaveCount(1);

  // Next load: no popup any more today, a banner in its place.
  await page.reload();
  const banner = page.getByTestId('daily-summary-banner');
  await expect(banner.getByText('Bugünün özeti hazır')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await shot(page, '51-desktop-morning-banner');

  await banner.getByRole('button', { name: 'Oku' }).click();
  await expect(page.getByRole('dialog').getByText('Dün üç iş emri açıldı')).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Okudum' }).click();
  expect(backend.callsTo('/assistant/daily-summary/62/read/', 'POST')).toHaveLength(1);
  expect(backend.callsTo('/assistant/daily-summary/62/read/', 'POST')[0]!.body).toMatchObject({
    source: 'banner',
  });

  consoleErrors.expectNone();
});

test('the unread dot sends the first click to the summaries, the second just toggles', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const read = { value: false };
  await mockBackend(page, morningHandlers(read), { session });
  // The popup has been dealt with: snoozed once, the banner twice.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__e2eSnoozed')) return;
    sessionStorage.setItem('__e2eSnoozed', '1');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(
      new Date(),
    );
    localStorage.setItem('ds:snooze:990001', JSON.stringify({ id: 62, date: today, count: 2 }));
  });

  await page.goto('/');
  await expect(neoEntry(page).locator('[data-unread]')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('daily-summary-banner')).toHaveCount(0);

  await neoEntry(page).click();
  await expect(panel(page).getByRole('heading', { name: 'Günlük Özetler' })).toBeVisible();
  await expect(panel(page).getByText('Dün üç iş emri açıldı')).toBeVisible();
  await neoEntry(page).click();
  await expect(neoEntry(page)).toHaveAttribute('aria-expanded', 'false');
  await neoEntry(page).click();
  await expect(neoEntry(page)).toHaveAttribute('aria-expanded', 'true');

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
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /, E2E$/ })).toBeVisible();
  await expect(hint).toHaveCount(0);

  consoleErrors.expectNone();
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the top bar opens Neo as a full-height sheet', async ({ page, consoleErrors }) => {
    const session = await seedSession(page, { admin: true });
    await mockBackend(page, chatHandlers, { session });

    await page.goto('/');
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /, E2E$/ })).toBeVisible();
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
