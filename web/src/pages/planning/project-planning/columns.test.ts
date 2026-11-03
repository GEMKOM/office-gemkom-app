import { rowBarEditing, rowLinks, rowTooltip } from './columns';
import type { SheetRow } from './model/rowTypes';

const row = (key: string, extra: Partial<SheetRow> = {}): SheetRow => ({
  key,
  kind: 'stage',
  job_no: '293-03-07',
  indent: 2,
  title: key,
  note: '',
  start_date: '2026-11-02',
  end_date: '2026-11-06',
  duration_wd: 5,
  weight: 10,
  progress: 0,
  status: 'in_progress',
  ...extra,
});

describe('rowBarEditing', () => {
  it('lets a bar be dragged where its cells can be typed', () => {
    // The İmalat row takes a start and a duration.
    expect(rowBarEditing(row('m', { kind: 'dept', slot: 'manufacturing' }))).toEqual({
      move: true,
      resize: true,
    });
    // A saved assignment too; a new one has neither until it is saved.
    expect(rowBarEditing(row('b', { kind: 'block' }))).toEqual({ move: true, resize: true });
    expect(rowBarEditing(row('n', { kind: 'block', isNew: true }))).toBeNull();
    // Welding's dates derive from İmalat: fixed.
    expect(rowBarEditing(row('w', { kind: 'dept', slot: 'welding' }))).toBeNull();
    // Lojistik: its length is an entry, its start is not.
    expect(rowBarEditing(row('l', { kind: 'info', editable_duration: true }))).toEqual({
      move: false,
      resize: true,
    });
    expect(rowBarEditing(row('g', { kind: 'group' }))).toBeNull();
  });
});

describe('rowLinks', () => {
  it('chains an assignment’s stages and runs Boya after welding and machining', () => {
    const rows = [
      row('g', { kind: 'group' }),
      row('mach', { kind: 'machining' }),
      row('weld', { kind: 'dept', slot: 'welding' }),
      row('blk', { kind: 'block', blockRef: 'b1' }),
      row('s1', { blockRef: 'b1' }),
      row('s2', { blockRef: 'b1', status: 'cancelled' }),
      row('s3', { blockRef: 'b1' }),
      row('blk2', { kind: 'block', blockRef: 'b2' }),
      row('t1', { blockRef: 'b2' }),
      row('paint', { kind: 'dept', slot: 'painting' }),
    ];
    expect(rowLinks(rows)).toEqual([
      // A cancelled stage drops out of the sequence.
      { from: 's1', to: 's3' },
      { from: 'mach', to: 'paint' },
      { from: 'weld', to: 'paint' },
    ]);
  });
});

describe('rowTooltip', () => {
  it('says when, how far along and how to change it', () => {
    const tip = rowTooltip(
      row('İmalat', {
        kind: 'dept',
        slot: 'manufacturing',
        progress: 40,
        job_target: '2026-12-15',
      }),
    )!;
    expect(tip.title).toBe('İmalat');
    expect(tip.lines).toEqual([
      '02.11.2026 – 06.11.2026 · 5 g',
      'İlerleme %40 · Devam Ediyor',
      'Termin 15.12.2026',
      'Sürükleyin: başlangıcı taşır',
      'Sağ kenar: süreyi değiştirir',
    ]);
  });
});
