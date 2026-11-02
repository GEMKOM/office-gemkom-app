import { expect, mockBackend, paginated, seedSession, test } from './fixtures';

// The talaşlı imalat dashboard (the most used page of the CNC / linear /
// machining batch). Contracts:
//   GET  /machining/timers/?is_active=true   running timers (live durations)
//   GET  /machines/?used_in=machining        machine status table
//   GET  /tasks/operations/<key>/?view=detail operation details modal
//   POST /machining/timers/stop/             { timer_id, finish_time }

const HOUR = 60 * 60 * 1000;

test('admin: the machining dashboard lists timers, opens a task and stops a timer', async ({
  page,
  consoleErrors,
}) => {
  const session = await seedSession(page, { admin: true });
  const running = [
    {
      id: 11,
      username: 'ahmet',
      machine_name: 'Torna 1',
      issue_key: 'OP-1',
      issue_name: 'Kaba torna',
      start_time: Date.now() - HOUR,
      estimated_hours: 4,
      task_total_hours: 1,
      timer_type: 'productive',
    },
    {
      id: 12,
      username: 'mehmet',
      machine_name: 'Freze 2',
      start_time: Date.now() - 2 * HOUR,
      timer_type: 'downtime',
      downtime_reason_name: 'Malzeme bekleniyor',
    },
  ];
  let stopped = false;
  const backend = await mockBackend(
    page,
    {
      'GET /machining/timers/': () => ({
        json: paginated(stopped ? running.filter((t) => t.id !== 11) : running),
      }),
      'GET /machines/': {
        json: paginated([
          {
            id: 1,
            name: 'Torna 1',
            machine_type_label: 'Torna',
            is_active: true,
            has_active_timer: true,
          },
          { id: 2, name: 'Freze 2', machine_type_label: 'Freze', is_active: true },
        ]),
      },
      'GET /tasks/operations/OP-1/': {
        json: {
          key: 'OP-1',
          name: 'Kaba torna',
          part_key: 'PRT-9',
          part_name: 'Mil',
          estimated_hours: 4,
        },
      },
      'POST /machining/timers/stop/': () => {
        stopped = true;
        return { json: {} };
      },
    },
    { session },
  );

  await page.goto('/manufacturing/machining/dashboard/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Talaşlı İmalat Dashboard' })).toBeVisible();
  await expect(main.getByText('Malzeme bekleniyor')).toBeVisible();
  await expect(main.locator('#active-timers-count')).toContainText('2');
  await expect(main.getByText('Boşta')).toBeVisible();
  const timerCall = backend.callsTo('/machining/timers/', 'GET')[0]!;
  expect(new URLSearchParams(timerCall.query).get('is_active')).toBe('true');

  // Task details from the task cell.
  await main.getByRole('button', { name: /OP-1/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Operasyon Bilgileri')).toBeVisible();
  await expect(dialog.getByText('Mil')).toBeVisible();
  await dialog.getByRole('button', { name: 'Kapat' }).last().click();
  await expect(dialog).toHaveCount(0);

  // Stop the productive timer; the list reloads without it.
  await main.getByRole('button', { name: 'Durdur' }).first().click();
  await expect(main.getByRole('button', { name: /OP-1/ })).toHaveCount(0);
  const [stop] = backend.callsTo('/machining/timers/stop/', 'POST');
  expect(stop?.body).toMatchObject({ timer_id: 11, finish_time: expect.any(Number) });
  await expect(main.locator('#active-timers-count')).toContainText('1');
  consoleErrors.expectNone();
});

test('a user without the dashboard grant is refused', async ({ page }) => {
  const session = await seedSession(page, { grants: ['/manufacturing/machining/'] });
  const backend = await mockBackend(page, {}, { session });
  await page.goto('/manufacturing/machining/dashboard/');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Erişim yetkiniz yok' })).toBeVisible();
  expect(backend.callsTo('/machining/timers/')).toHaveLength(0);
});
