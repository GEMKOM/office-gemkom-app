import { testBoard } from '../src/pages/planning/project-planning/testBoard';
import { expect, mockBackend, seedSession, test } from './fixtures';

// /planning/project-planning/ (İmalat Planlama). Contracts used here:
//   GET  /welding/planning/board/[?include_completed=true]
//   POST /welding/planning/bulk-save/  -> {saved, board}
//   GET  /welding/planning/capacity/?months=6&difficulty=1

const REPORT = {
  generated_at: '2026-11-03T09:00:00Z',
  params: { difficulty: true, reference_eur_per_kg: 2.1 },
  summary: { late_blocks: 1 },
  resources: [
    {
      key: 'team-3',
      resource_type: 'team',
      id: 3,
      display_name: 'Ekip 1',
      verdict: 'overloaded',
      pressure: 1.8,
      rate_kg_per_wd: 400,
      rate_source: 'statements',
      open_blocks: 2,
      remaining_kg: 6800,
      blocks: [
        {
          assignment_type: 'internal_team',
          assignment_id: 11,
          job_no: '293-03-07',
          job_order_title: 'COOLED PANEL 4',
          verdict: 'late_risk',
          relaxed_slack_wd: -4,
          relaxed_finish: '2026-12-21',
          deadline: '2026-12-15',
          flags: [],
          remaining_kg: 4800,
        },
      ],
    },
  ],
};

async function openPage(page: import('@playwright/test').Page) {
  const session = await seedSession(page, { admin: true });
  const backend = await mockBackend(
    page,
    {
      'GET /welding/planning/board/': { json: testBoard() },
      'POST /welding/planning/bulk-save/': { json: { saved: true, board: testBoard() } },
      'GET /welding/planning/capacity/': { json: REPORT },
    },
    { session },
  );
  await page.goto('/planning/project-planning/');
  return backend;
}

test.describe('İmalat Planlama', () => {
  test('edits the plan in the sheet and saves it in one bulk save', async ({
    page,
    consoleErrors,
  }) => {
    const backend = await openPage(page);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'İmalat Planlama' })).toBeVisible();
    await expect(main.getByRole('tab', { name: /Ekip 1/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(main.getByText('Aşırı tahsis')).toBeVisible();

    const duration = page.locator(
      '.pg-cell[data-row="293-03-07-manufacturing"][data-field="duration_wd"]',
    );
    await duration.click();
    await duration.locator('input').fill('40');
    await duration.locator('input').press('Enter');
    await expect(duration).toHaveText('40 g');

    await main.getByRole('button', { name: 'Kaydet' }).click();
    await expect.poll(() => backend.callsTo('/welding/planning/bulk-save/', 'POST').length).toBe(1);
    expect(backend.callsTo('/welding/planning/bulk-save/', 'POST')[0]!.body).toMatchObject({
      department_tasks: [{ task_id: 902, duration_wd: 40 }],
    });
    await expect(main.getByRole('button', { name: 'Kaydet' })).toBeDisabled();
    consoleErrors.expectNone();
  });

  test('Tümü lists the unassigned jobs and the Kapasite drawer locates a late block', async ({
    page,
  }) => {
    await openPage(page);
    const main = page.getByRole('main');
    await main.getByRole('tab', { name: /Tümü/ }).click();
    await expect(page.locator('.pg-row[data-row="all-unassigned-9"]')).toContainText(
      '195-35-01 — SILO',
    );

    await main.getByRole('button', { name: /Kapasite/ }).click();
    const drawer = page.getByRole('dialog', { name: /Kapasite önerileri/ });
    await expect(drawer.getByText('Termine yetişmeyen bloklar (1)')).toBeVisible();
    await drawer.getByRole('button', { name: 'Göster' }).filter({ visible: true }).first().click();
    // Back on the team's sheet, the job unfolded and the row on screen.
    await expect(main.getByRole('tab', { name: /Ekip 1/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('.pg-row[data-row="internal_team-11-block"]')).toBeVisible();
    // The saved plan's verdict marks the row while nothing on it is edited.
    await expect(
      page.locator('.pg-row[data-row="internal_team-11-block"] .cap-row-flag'),
    ).toHaveCount(1);
  });
});
