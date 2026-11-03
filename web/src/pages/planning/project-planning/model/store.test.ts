import { testBoard } from '../testBoard';
import type { SheetRow } from './rowTypes';
import { PlanningStore, type StoreApi } from './store';

function makeStore(api: Partial<StoreApi> = {}) {
  const notify = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
  const store = new PlanningStore({
    api: {
      fetchBoard: vi.fn(async () => testBoard()),
      bulkSave: vi.fn(async () => ({ board: testBoard() })),
      ...api,
    },
    notify,
    today: () => '2026-11-03',
  });
  store.hydrate(testBoard());
  return { store, notify };
}

const rowByKey = (rows: SheetRow[], key: string) => {
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error(`no row ${key}`);
  return row;
};

describe('PlanningStore rows', () => {
  it('lays a resource sheet out as the task tree, job by job', () => {
    const { store } = makeStore();
    const rows = store.sheetRows();
    expect(store.activeResourceKey).toBe('team-3');
    // By iş emri number: 100-102 before 293-03-07.
    expect(rows.filter((r) => r.kind === 'group').map((r) => r.job_no)).toEqual([
      '100-102',
      '293-03-07',
    ]);
    const job = rows.filter((r) => r.job_no === '293-03-07').map((r) => r.key);
    expect(job).toEqual([
      '293-03-07-group',
      '293-03-07-band-other',
      '293-03-07-info-900',
      '293-03-07-info-901',
      '293-03-07-manufacturing',
      '293-03-07-info-903',
      '293-03-07-welding',
      'internal_team-11-block',
      'internal_team-11-stage-s51',
      'internal_team-11-stage-s52',
      '293-03-07-painting',
      '293-03-07-info-906',
    ]);
    const group = rowByKey(rows, '293-03-07-group');
    // This sheet's slice of the order: 6000 of 10000 kg, 2.4 of 4 units.
    expect(group.resource_kg).toBe(6000);
    expect(group.quantity).toBe(2);
    expect(group.quantity_of).toBe(4);
    // The last row of the group ends 17.12, after the 15.12 termin.
    expect(group.job_plan_end).toBe('2026-12-17');
    expect(group.job_plan_end_source).toBe('Lojistik');
    expect(group.job_target_late).toBe(true);
  });

  it('lists unassigned and partly assigned jobs at the end of Tümü', () => {
    const { store } = makeStore();
    store.switchResource('all');
    const rows = store.sheetRows();
    const bands = rows
      .filter((r) => r.kind === 'band' && r.key.startsWith('all-head-'))
      .map((r) => r.title);
    expect(bands).toEqual([
      'Ekip — Ekip 1',
      'Taşeron — HARUN METAL',
      'Atanmamış / Eksik Atanan — 1 iş',
    ]);
    const pending = rows.filter((r) => r.unassignedRow);
    expect(pending.map((r) => r.job_no)).toEqual(['195-35-01']);
    // Every job is folded on Tümü until it is opened.
    expect(store.collapsedForGrid().has('293-03-07')).toBe(true);
  });

  it('flags the over-allocated welding task', () => {
    const { store } = makeStore();
    const over = store.overAllocations();
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ job_no: '100-102', allocated: 2000, total: 1500 });
  });

  it('re-renders only the rows of the edited job, and only those that moved', () => {
    const { store } = makeStore();
    const before = store.sheetRows();
    const stage = rowByKey(before, 'internal_team-11-stage-s52');
    store.editCell(stage, 'progress', '50');
    const after = store.sheetRows();
    const changed = after.filter((row, i) => row !== before[i]).map((r) => r.key);
    // The other job's rows are the very same objects: the grid skips them.
    expect(
      changed.every((key) => key.startsWith('293-03-07') || key.startsWith('internal_team-11')),
    ).toBe(true);
    expect(changed).toContain('internal_team-11-stage-s52');
    // The cells derived from it moved too: its block, Kaynaklı İmalat, İmalat.
    expect(changed).toEqual(
      expect.arrayContaining([
        'internal_team-11-block',
        '293-03-07-welding',
        '293-03-07-manufacturing',
      ]),
    );
    // Rows on the same job that did not change keep their object.
    expect(changed).not.toContain('293-03-07-info-900');
    expect(after.find((r) => r.job_no === '100-102')).toBe(
      before.find((r) => r.job_no === '100-102'),
    );
    expect(rowByKey(after, 'internal_team-11-stage-s52').status).toBe('in_progress');
    expect(store.hasUnsavedChanges()).toBe(true);
  });

  it('refuses invalid edits with the reason', () => {
    const { store } = makeStore();
    const rows = store.sheetRows();
    const stage = rowByKey(rows, 'internal_team-11-stage-s51');
    expect(() => store.editCell(stage, 'progress', '120')).toThrow(
      'İlerleme 0 ile 100 arasında olmalıdır.',
    );
    expect(() => store.editCell(stage, 'title', 'Yeni')).toThrow(
      'Yalnızca özel aşamaların adı değiştirilebilir.',
    );
    const imalat = rowByKey(rows, '293-03-07-manufacturing');
    expect(() => store.editCell(imalat, 'progress', '10')).toThrow(
      'İmalat ilerlemesi alt görevlerinden hesaplanır.',
    );
    expect(store.hasUnsavedChanges()).toBe(false);
  });

  it('re-lays the plan live from an İmalat start and saves only the entry', async () => {
    const bulkSave = vi.fn(async () => ({ board: testBoard() }));
    const { store, notify } = makeStore({ bulkSave });
    const imalat = rowByKey(store.sheetRows(), '293-03-07-manufacturing');
    store.editCell(imalat, 'start_date', '2026-11-09');
    const rows = store.sheetRows();
    expect(rowByKey(rows, '293-03-07-manufacturing').start_date).toBe('2026-11-09');
    // Kaynaklı İmalat and the unpinned team follow the İmalat start.
    expect(rowByKey(rows, '293-03-07-welding').start_date).toBe('2026-11-09');

    await store.save();
    expect(bulkSave).toHaveBeenCalledTimes(1);
    const payload = (bulkSave.mock.calls[0] as unknown as [Record<string, unknown[]>])[0];
    expect(payload.department_tasks).toEqual([
      { task_id: 902, status: 'in_progress', start_date: '2026-11-09' },
    ]);
    expect(payload.blocks).toEqual([]);
    expect(notify.success).toHaveBeenCalledWith('Plan kaydedildi.');
    expect(store.hasUnsavedChanges()).toBe(false);
  });

  it('posts a new assignment once and adopts its id from the returned board', async () => {
    const saved = testBoard();
    saved.resources![0]!.blocks!.push({
      assignment_type: 'internal_team',
      assignment_id: 13,
      subtask_id: 103,
      welding_task_id: 9,
      job_no: '195-35-01',
      allocated_weight_kg: 3000,
      subtask: { status: 'in_progress' },
      stages: [],
    });
    const bulkSave = vi.fn(async () => ({ board: saved }));
    const { store } = makeStore({ bulkSave });
    const team = store.resources[0]!;
    store.pushNewBlock({
      resource: team,
      welding_task: store.weldingTasks[2]!,
      allocated_weight_kg: 3000,
      notes: 'yeni',
      price_tier: null,
    });
    expect(store.sheetRows().some((r) => r.key.startsWith('new-') && r.isNew)).toBe(true);
    await store.save();
    const payload = (bulkSave.mock.calls[0] as unknown as [Record<string, unknown[]>])[0];
    expect(payload.new_blocks).toEqual([
      {
        resource_type: 'team',
        resource_id: 3,
        welding_task_id: 9,
        allocated_weight_kg: 3000,
        notes: 'yeni',
        stages: [],
      },
    ]);
    expect(store.findBlock('internal_team-13')).not.toBeNull();
  });

  it('keeps the planner’s edit when they typed while the save was in flight', async () => {
    let release: (v: { board: ReturnType<typeof testBoard> }) => void = () => {};
    const bulkSave = vi.fn(
      () => new Promise<{ board: ReturnType<typeof testBoard> }>((r) => (release = r)),
    );
    const fetchBoard = vi.fn(async () => testBoard());
    const { store } = makeStore({ bulkSave, fetchBoard });
    const block = rowByKey(store.sheetRows(), 'internal_team-12-block');
    store.editCell(block, 'note', 'ilk');
    const saving = store.save();
    store.editCell(rowByKey(store.sheetRows(), 'internal_team-12-block'), 'note', 'ikinci');
    release({ board: testBoard() });
    await saving;
    // Not replaced by the server's board: the second note is still there.
    expect(store.findBlock('internal_team-12')?.notes).toBe('ikinci');
    expect(store.hasUnsavedChanges()).toBe(true);
  });
});
