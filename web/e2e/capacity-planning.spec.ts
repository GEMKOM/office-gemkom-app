import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// Capacity planners and machining reports on the React Gantt. Contracts:
//   GET  /machines/?used_in=cutting                  CNC machine list (tasks_count)
//   GET  /cnc_cutting/planning/list/?machine_fk=     plan rows (bare array)
//   GET  /machines/calendar?machine_fk=              week_template / work_exceptions
//   POST /cnc_cutting/planning/bulk-save/            { items: [...] }
//   GET  /machines/dropdown/?used_in=machining       machining machines
//   GET  /tasks/operations/?machine_fk=&completion_date__isnull=true&page_size=1000
//   PUT  /tasks/operations/planning/bulk-save/       bare array; dragged rows locked
//   GET  /machining/analytics/machine-timeline/?machine_fk=&start_after=&start_before=
//   GET  /machining/planning/overview/, /machining/reports/production-plan/?machine_fk=

const HOUR = 3_600_000;
const now = new Date();
// The 10th of this month, 08:00 in Istanbul (the browser's zone): always inside
// the month view, whatever day the tests run.
const DAY10 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 10, 5);
const weekday = [
  { start: '08:00', end: '12:00' },
  { start: '13:00', end: '18:00' },
];
const CALENDAR = {
  week_template: { 0: weekday, 1: weekday, 2: weekday, 3: weekday, 4: weekday, 5: [], 6: [] },
  work_exceptions: [],
};

test('CNC planner: drag a task to another slot and save the plan', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const tasks = [
    {
      key: 'CNC-501',
      name: 'Gövde sacı',
      nesting_id: 'N-77',
      thickness_mm: 10,
      quantity: 2,
      material: 'S355',
      dimensions: '3000x1500',
      estimated_hours: '4.00',
      remaining_hours: '4.00',
      in_plan: true,
      plan_order: 1,
      plan_locked: false,
      planned_start_ms: DAY10,
      planned_end_ms: DAY10 + 4 * HOUR,
      finish_time: '2099-01-01',
      machine_fk: 3,
    },
    {
      key: 'CNC-502',
      name: 'Kapak sacı',
      nesting_id: 'N-78',
      thickness_mm: 8,
      quantity: 1,
      material: 'S235',
      dimensions: '2000x1000',
      estimated_hours: '2.00',
      remaining_hours: '2.00',
      in_plan: true,
      plan_order: 2,
      plan_locked: true,
      planned_start_ms: DAY10 + 4 * HOUR,
      planned_end_ms: DAY10 + 6 * HOUR,
      machine_fk: 3,
    },
  ];
  const backend = await mockBackend(
    page,
    {
      'GET /machines/': {
        json: paginated([
          { id: 3, name: 'Plazma 1', tasks_count: 2 },
          { id: 4, name: 'Lazer 2', tasks_count: 0 },
        ]),
      },
      'GET /cnc_cutting/planning/list/': ({ query }) => ({
        json: query.get('machine_fk') === '3' ? tasks : [],
      }),
      'GET /machines/calendar': { json: CALENDAR },
      'POST /cnc_cutting/planning/bulk-save/': { json: { ok: true } },
    },
    { session },
  );

  await page.goto('/manufacturing/cnc-cutting/capacity/planning/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Kapasite Planlayıcı' })).toBeVisible();
  await main.getByText('Plazma 1').click();
  await expect(page).toHaveURL(/machine=3/);
  await expect(main.getByText('N-77')).toBeVisible();

  const bar = main.locator('[data-bar-id="CNC-501"]');
  await bar.scrollIntoViewIfNeeded();
  const box = (await bar.boundingBox())!;
  // Grab the middle of the bar (not its resize edges) and drag it two-plus days right.
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 10, y);
  await page.mouse.up();

  await expect(main.getByText('Kaydedilmemiş değişiklik: 1')).toBeVisible();
  await main.getByRole('button', { name: 'Planı Kaydet' }).click();
  await expect(page.getByText('Plan başarıyla kaydedildi')).toBeVisible();
  await expect(main.getByText('Kaydedildi', { exact: true })).toBeVisible();

  const saves = backend.callsTo('/cnc_cutting/planning/bulk-save/', 'POST');
  expect(saves).toHaveLength(1);
  const body = saves[0]!.body as { items: Record<string, unknown>[] };
  expect(body.items).toHaveLength(1);
  const item = body.items[0]!;
  const start = item.planned_start_ms as number;
  const end = item.planned_end_ms as number;
  expect(item).toEqual({
    key: 'CNC-501',
    in_plan: true,
    machine_fk: 3,
    name: 'Gövde sacı',
    planned_start_ms: start,
    planned_end_ms: end,
    plan_order: 1,
    plan_locked: false,
  });
  // Moved later, snapped to the hour (month view), duration kept.
  expect(start).toBeGreaterThan(DAY10);
  expect((start - DAY10) % HOUR).toBe(0);
  expect(end - start).toBe(4 * HOUR);
  // The locked task did not move.
  expect(body.items.some((i) => i.key === 'CNC-502')).toBe(false);
  consoleErrors.expectNone();
});

test('machining planner: reorder the queue in the Gantt and save', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const ops = [
    {
      key: 'OP-11',
      name: 'Kaba torna',
      part_name: 'Mil',
      part_job_no: 'J-100',
      due_date: '2099-01-10',
      due_source: 'part',
      slack_hours: '12.5',
      estimated_hours: 4,
      total_hours_spent: 1,
      planned_start_ms: DAY10,
      planned_end_ms: DAY10 + 4 * HOUR,
      in_plan: true,
      plan_order: 1,
      plan_locked: false,
      plan_flags: [],
    },
    {
      key: 'OP-12',
      name: 'Freze',
      part_name: 'Flanş',
      part_job_no: 'J-101',
      due_date: '2099-01-05',
      due_source: 'job_order',
      slack_hours: '-3',
      estimated_hours: 2,
      total_hours_spent: 0,
      planned_start_ms: DAY10 + 4 * HOUR,
      planned_end_ms: DAY10 + 6 * HOUR,
      in_plan: true,
      plan_order: 2,
      plan_locked: false,
      projected_late: true,
      plan_flags: [],
    },
    {
      key: 'OP-13',
      name: 'Taşlama',
      part_name: 'Burç',
      part_job_no: 'J-102',
      due_date: null,
      slack_hours: null,
      estimated_hours: null,
      total_hours_spent: 0,
      planned_start_ms: DAY10 + 6 * HOUR,
      planned_end_ms: DAY10 + 8 * HOUR,
      in_plan: true,
      plan_order: 3,
      plan_locked: false,
      plan_flags: ['estimate_missing', 'due_missing'],
    },
  ];
  const backend = await mockBackend(
    page,
    {
      'GET /machines/dropdown/': { json: [{ id: 21, name: 'Torna 1' }] },
      'GET /tasks/operations/': { json: paginated(ops) },
      'GET /machines/calendar': { json: CALENDAR },
      'PUT /tasks/operations/planning/bulk-save/': { json: [] },
    },
    { session },
  );

  await page.goto('/manufacturing/machining/capacity/planning/?machine=21');
  const main = page.getByRole('main');
  await expect(main.getByRole('cell', { name: 'Flanş' })).toBeVisible();
  const list = backend.callsTo('/tasks/operations/', 'GET')[0]!;
  expect(Object.fromEntries(new URLSearchParams(list.query))).toEqual({
    machine_fk: '21',
    completion_date__isnull: 'true',
    page_size: '1000',
  });

  // Drag OP-13's row by its grip above OP-11.
  const grip = main.locator('[data-reorder="OP-13"]');
  await grip.scrollIntoViewIfNeeded();
  const from = (await grip.boundingBox())!;
  const to = (await main.locator('[data-row-label="OP-11"]').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(
      from.x + from.width / 2,
      from.y + from.height / 2 + ((to.y + 4 - from.y - from.height / 2) * i) / 10,
    );
  }
  await page.mouse.up();
  await expect(main.getByText('Kaydedilmemiş değişiklik: 3')).toBeVisible();

  await main.getByRole('button', { name: 'Planı Kaydet' }).click();
  await expect(
    page.getByText('Plan kaydedildi; sıra ve tarihler yeniden hesaplandı'),
  ).toBeVisible();
  const saves = backend.callsTo('/tasks/operations/planning/bulk-save/', 'PUT');
  expect(saves).toHaveLength(1);
  expect(saves[0]!.body).toEqual([
    { key: 'OP-11', in_plan: true, plan_order: 2 },
    { key: 'OP-12', in_plan: true, plan_order: 3 },
    { key: 'OP-13', in_plan: true, plan_order: 1, plan_locked: true },
  ]);
  // Saved, then the queue is refetched from the server.
  await expect.poll(() => backend.callsTo('/tasks/operations/', 'GET').length).toBeGreaterThan(1);
  consoleErrors.expectNone();
});

test('machining history report loads a machine timeline for the week', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /machines/': { json: paginated([{ id: 21, name: 'Torna 1', tasks_count: 3 }]) },
      'GET /machining/analytics/machine-timeline/': {
        json: {
          machines: [
            {
              machine_id: 21,
              machine_name: 'Torna 1',
              segments: [
                {
                  start_ms: DAY10,
                  end_ms: DAY10 + 3 * HOUR,
                  category: 'work',
                  task_key: 'OP-11',
                  task_name: 'Kaba torna',
                  timer_id: 501,
                },
                {
                  start_ms: DAY10 + 3 * HOUR,
                  end_ms: DAY10 + 4 * HOUR,
                  category: 'hold',
                  task_key: 'H-1',
                  task_name: 'Malzeme bekleme',
                  timer_id: 502,
                },
              ],
              totals: { productive_seconds: 10800, hold_seconds: 3600, idle_seconds: 900 },
            },
          ],
        },
      },
      'GET /machines/calendar': { json: CALENDAR },
    },
    { session },
  );
  await page.goto('/manufacturing/machining/reports/history/?machine=21');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Kapasite Geçmişi' })).toBeVisible();
  await expect(main.locator('#productive-time')).toContainText('3h 0m');
  await expect(main.locator('#total-time')).toContainText('4h 15m');
  await expect(main.getByText('Kaba torna')).toBeVisible();
  const call = backend.callsTo('/machining/analytics/machine-timeline/', 'GET')[0]!;
  const query = new URLSearchParams(call.query);
  expect(query.get('machine_fk')).toBe('21');
  // The current week, Monday 00:00 to Sunday 23:59:59.999.
  expect(Number(query.get('start_before')) - Number(query.get('start_after'))).toBe(
    7 * 24 * HOUR - 1,
  );
  consoleErrors.expectNone();
});

test('production plan report loads and opens a machine Gantt', async ({ page, consoleErrors }) => {
  const session = await seedSession(page, { admin: true });
  await mockBackend(
    page,
    {
      'GET /machining/planning/overview/': {
        json: {
          machines: [
            {
              machine_id: 21,
              machine_name: 'Torna 1',
              machine_type_label: 'Torna',
              totals: {
                total_estimated_hours: 42.5,
                latest_planned_end_ms: DAY10 + 48 * HOUR,
                task_count: 6,
              },
            },
            {
              machine_id: 22,
              machine_name: 'Freze 2',
              machine_type_label: 'Freze',
              totals: { total_estimated_hours: 12, latest_planned_end_ms: DAY10, task_count: 2 },
            },
          ],
          overall_totals: {
            total_estimated_hours: 54.5,
            latest_planned_end_ms: DAY10 + 48 * HOUR,
            task_count: 8,
          },
        },
      },
      'GET /machining/reports/production-plan/': {
        json: [
          {
            key: 'TI-1',
            name: 'Mil tornalama',
            plan_order: 1,
            planned_start_ms: DAY10,
            planned_end_ms: DAY10 + 30 * HOUR,
            estimated_hours: 10,
            total_hours_spent: 6,
          },
        ],
      },
      'GET /machines/calendar': { json: CALENDAR },
      'GET /machining/tasks/TI-1/': {
        json: {
          key: 'TI-1',
          name: 'Mil tornalama',
          estimated_hours: 10,
          total_hours_spent: 6,
          machine_name: 'Torna 1',
        },
      },
    },
    { session },
  );
  await page.goto('/manufacturing/machining/reports/production-plan/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Üretim Planı', exact: true })).toBeVisible();
  await expect(main.locator('#busiest-machine')).toContainText('Torna 1');
  await expect(main.locator('#total-hours')).toContainText('54.5 saat');
  await expect(main.getByText('Freze 2')).toBeVisible();

  await main
    .getByRole('row', { name: /Torna 1/ })
    .getByRole('button', { name: 'Gantt Görünümü' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Torna 1 - Zaman Çizelgesi')).toBeVisible();
  await dialog.locator('[data-bar-id="TI-1"]').click();
  await expect(page.getByRole('dialog', { name: /Görev Durumu/ })).toBeVisible();
  consoleErrors.expectNone();
});
