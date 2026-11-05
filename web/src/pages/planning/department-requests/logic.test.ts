import type { DepartmentRequest } from '@/api/general/departmentRequests';
import type { PlanningRequest } from '@/api/planning/planningRequests';
import {
  attachmentsFromDepartmentRequest,
  attachmentsFromPlanningRequest,
  buildFiles,
  buildItems,
  changedFields,
  csvFileName,
  detectColumnMapping,
  itemRow,
  itemsCsv,
  lockReason,
  missingRequired,
  newAttachment,
  normalizePriority,
  normalizeTurkish,
  originalData,
  parseCsv,
  processRows,
  rejectionComments,
  rowsFromDepartmentRequest,
  rowsFromPlanningRequest,
} from './logic';

const PLANNING: PlanningRequest = {
  id: 7,
  title: 'Rulman',
  description: '',
  priority: 'normal',
  needed_date: '2026-12-01',
  check_inventory: false,
  files: [{ id: 1, asset_id: 10, file_name: 'u/teklif.pdf', file_url: 'https://f/teklif.pdf' }],
  items: [
    {
      id: 101,
      item_code: 'K-1',
      item_name: 'Rulman',
      item_unit: 'adet',
      job_no: '254-01',
      quantity: '4.00',
      specifications: 'SKF',
      quantity_from_inventory: '2',
      files: [{ id: 2, asset_id: 10, file_name: 'u/teklif.pdf', file_url: 'https://f/teklif.pdf' }],
    },
    {
      id: 102,
      item_code: 'K-2',
      item_unit: 'adet',
      job_no: '254-02',
      quantity: 1,
      is_converted: true,
      quantity_in_active_prs: '1',
      is_deletable: false,
    },
  ],
};

it('normalizes priorities to what the backend takes', () => {
  expect(normalizePriority('HIGH')).toBe('urgent');
  expect(normalizePriority('low')).toBe('normal');
  expect(normalizePriority('critical')).toBe('critical');
  expect(normalizePriority(null)).toBe('normal');
});

it('reads department request items in every shape and keeps the source index', () => {
  const rows = rowsFromDepartmentRequest({
    id: 3,
    items: [
      { code: 'A', name: 'Vida', unit: 'kg', quantity: 2, job_no: 'J1', specifications: 'M8' },
      { item_code: 'B', item_name: 'Somun', item_unit: 'adet' },
    ],
  } as DepartmentRequest);
  expect(
    rows.map((r) => [r.item_code, r.item_name, r.item_unit, r.quantity, r.job_no, r.sourceIndex]),
  ).toEqual([
    ['A', 'Vida', 'kg', 2, 'J1', 0],
    ['B', 'Somun', 'adet', 1, null, 1],
  ]);
  expect(rows[0]!.specifications).toBe('M8');
});

it('marks planning rows locked by inventory, purchase requests or conversion', () => {
  const [first, second] = rowsFromPlanningRequest(PLANNING);
  expect(first).toMatchObject({
    id: 101,
    inventoryLocked: true,
    deletable: true,
    converted: false,
  });
  expect(second).toMatchObject({ converted: true, deletable: false, prLocked: true });
  expect(lockReason(second!)).toBe('Satın alma talebine bağlı; silmek için önce talebi iptal edin');
  expect(lockReason(first!)).toBe('Ürünü Kaldır');
});

it('builds items with legacy checks; a numeric code is still a code', () => {
  expect(buildItems([itemRow({ item_code: 'X' })])).toEqual({
    ok: false,
    error: 'Tüm ürünler için iş no gereklidir',
  });
  expect(buildItems([itemRow({ item_code: 'X', job_no: 'J', quantity: 0 })])).toEqual({
    ok: false,
    error: 'Tüm ürünler için geçerli miktar gereklidir',
  });
  expect(buildItems([itemRow({ job_no: 'J' })])).toEqual({
    ok: false,
    error: 'Tüm ürünler için ürün kodu/ID gereklidir',
  });
  const built = buildItems(
    [
      itemRow({ item_code: '42', job_no: 'J', quantity: '2.5', sourceIndex: 0, id: 9 }),
      itemRow({ item_code: 'K-1', item_name: ' Vida ', job_no: 'J', specifications: 'M8' }),
    ],
    { fromDepartmentRequest: true, editing: true },
  );
  expect(built).toEqual({
    ok: true,
    value: [
      {
        job_no: 'J',
        quantity: 2.5,
        item_code: '42',
        item_unit: 'adet',
        source_item_index: 0,
        id: 9,
      },
      {
        job_no: 'J',
        quantity: 1,
        item_code: 'K-1',
        item_name: 'Vida',
        item_unit: 'adet',
        specifications: 'M8',
      },
    ],
  });
});

it('checks file targets and sends new uploads or asset ids', () => {
  const upload = {
    ...newAttachment(new File(['x'], 'a.pdf')),
    attachTo: [1, 'request' as const, 0],
  };
  expect(buildFiles([upload], 1)).toEqual({
    ok: false,
    error: '"a.pdf" dosyası için geçersiz ürün indeksi',
  });
  expect(buildFiles([{ ...upload, attachTo: [] }], 2)).toEqual({
    ok: false,
    error: '"a.pdf" dosyası için en az bir hedef seçilmelidir (Talep veya ürün)',
  });
  const built = buildFiles([upload], 2, { sort: true });
  expect(built.ok && built.value[0]).toEqual({
    description: '',
    attach_to: [0, 1, 'request'],
    file: upload.file,
  });
});

it('merges a planning request file used on the request and an item into one card', () => {
  const [card, ...rest] = attachmentsFromPlanningRequest(PLANNING);
  expect(rest).toHaveLength(0);
  expect(card).toMatchObject({
    name: 'teklif.pdf',
    isExisting: true,
    assetId: 10,
    attachTo: ['request', 0],
  });
});

it('attaches department files to their mapped items, else to the request', () => {
  const cards = attachmentsFromDepartmentRequest({
    id: 3,
    items: [{ file_asset_ids: [5] }, { file_asset_ids: [5] }],
    files: [
      { id: 1, asset_id: 5, file_name: 'x/a.pdf' },
      { id: 2, asset_id: 6, file_name: 'x/b.pdf' },
    ],
  } as DepartmentRequest);
  expect(cards.map((c) => c.attachTo)).toEqual([[0, 1], ['request']]);
});

describe('changedFields', () => {
  const original = originalData(PLANNING);
  const items = buildItems(rowsFromPlanningRequest(PLANNING), { editing: true });
  const base = {
    title: 'Rulman',
    description: '',
    priority: 'normal',
    needed_date: '2026-12-01',
    check_inventory: false,
    items: items.ok ? items.value : [],
  };

  it('is empty when nothing changed', () => {
    expect(changedFields(original, base)).toEqual({});
  });

  it('sends only the changed fields, and the whole item list when one item changed', () => {
    expect(changedFields(original, { ...base, title: 'Yeni' })).toEqual({ title: 'Yeni' });
    const changedItems = base.items.map((item, i) => (i === 0 ? { ...item, quantity: 5 } : item));
    expect(changedFields(original, { ...base, items: changedItems })).toEqual({
      items: changedItems,
    });
  });

  it('sees the same files as unchanged, a new upload as changed', () => {
    // A request file that is also on an item compares as that item's (legacy).
    const same = [{ asset_id: 10, attach_to: [0], description: '' }];
    expect(changedFields(original, { ...base, files: same })).toEqual({});
    const upload = [...same, { file: new File(['x'], 'b.pdf'), attach_to: ['request' as const] }];
    expect(changedFields(original, { ...base, files: upload })).toEqual({ files: upload });
  });
});

it('writes the ERP CSV: G for expense codes, the quantity to purchase, DD.MM.YYYY', () => {
  expect(
    itemsCsv(
      [
        { item_code: '730.06.004', quantity: 3, item_description: 'Bakım', specifications: 'Acil' },
        { item_code: 'K-1', quantity: 4, quantity_to_purchase: '1.5' },
      ],
      '2026-12-01',
    ),
  ).toBe('G;730.06.004;3,00;01.12.2026;Bakım|Acil\nS;K-1;1,50;01.12.2026;');
  expect(csvFileName(12)).toBe('planlama_talebi_urunleri_12.csv');
  expect(csvFileName(null, new Date('2026-11-03T10:00:00Z'))).toBe(
    'planlama_talebi_urunleri_2026-11-03.csv',
  );
});

describe('Excel import', () => {
  it('detects the ERP export headers', () => {
    expect(normalizeTurkish('Srm.Mrk. İsmi')).toBe('srmmrkismi');
    const mapping = detectColumnMapping([
      'Kodu',
      'İsmi',
      'Srm.Mrk.',
      'Miktar',
      'Birim',
      'Açıklama 1',
      'Açıklama 2',
    ]);
    expect(mapping).toEqual({
      item_code: 0,
      item_name: 1,
      job_no: 2,
      quantity: 3,
      unit: 4,
      item_description: 5,
      specifications: 6,
    });
    expect(missingRequired(detectColumnMapping(['Kodu', 'Miktar']))).toEqual([
      'item_name',
      'job_no',
      'unit',
    ]);
  });

  it('parses ; and , CSV with quotes', () => {
    expect(parseCsv('a;"b;c";"say ""hi"""\r\n\r\n1;2;3')).toEqual([
      ['a', 'b;c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('skips invalid rows with a message per problem', () => {
    const mapping = detectColumnMapping(['Kodu', 'İsmi', 'Srm.Mrk.', 'Miktar', 'Birim']);
    const result = processRows(
      [['K-1', 'Vida', 'J1', '2,5', 'KG'], ['K-2', '', 'J1', '0', 'adet'], []],
      mapping,
    );
    expect(result.items).toEqual([
      {
        item_code: 'K-1',
        item_name: 'Vida',
        job_no: 'J1',
        quantity: 2.5,
        unit: 'kg',
        item_description: '',
        specifications: '',
      },
    ]);
    expect(result.errors).toEqual([
      'Satır 3: Ürün adı eksik - satır atlandı',
      'Satır 3: Geçersiz miktar değeri - satır atlandı',
    ]);
    expect(result.skipped).toBe(3);
  });
});

it('collects rejection comments from the latest approval', () => {
  expect(
    rejectionComments({
      id: 1,
      approvals: [
        {
          stage_instances: [
            {
              name: 'Müdür',
              decisions: [
                {
                  decision: 'rejected',
                  comment: 'Bütçe yok',
                  approver_name: 'Ali',
                  decision_date: '2026-01-01',
                },
                { decision: 'approved', comment: 'ok' },
              ],
            },
          ],
        },
      ],
    } as DepartmentRequest),
  ).toEqual([{ approver: 'Ali', stage: 'Müdür', comment: 'Bütçe yok', date: '2026-01-01' }]);
});
