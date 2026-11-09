import type { PurchaseRequestDraft } from '@/api/procurement/purchaseRequests';
import {
  applyMerges,
  buildDraftPayload,
  buildOffer,
  buildSubmitPayload,
  duplicateItemsMessage,
  editItem,
  emptyState,
  formatItemsForSubmission,
  fromStorage,
  isPlanningItemOnPage,
  mergeSelection,
  removeItems,
  removeSupplier,
  stateFromDraft,
  today,
  toStorage,
  transformSuppliers,
  unplannedItemsMessage,
  validateAll,
  validateHeader,
  type PrItem,
  type PrState,
  type PrSupplier,
} from './model';

const item = (id: string, over: Partial<PrItem> = {}): PrItem => ({
  id,
  code: 'A1',
  name: 'Flanş',
  job_no: '254-01',
  quantity: 10,
  unit: 'adet',
  specs: '',
  specifications: '',
  item_description: '',
  ...over,
});

const supplier = (id: string, over: Partial<PrSupplier> = {}): PrSupplier => ({
  id,
  name: `Tedarikçi ${id}`,
  contact_person: '',
  phone: '',
  email: '',
  default_currency: 'TRY',
  default_payment_terms: '3',
  default_tax_rate: 20,
  ...over,
});

const offer = (unitPrice: number, qty: number) => ({ unitPrice, totalPrice: unitPrice * qty, deliveryDays: 5, notes: '' });

function readyState(): PrState {
  return {
    ...emptyState(),
    title: 'Konveyör malzemeleri',
    needed_date: '2026-11-20',
    items: [item('i1'), item('i2', { job_no: '254-02', quantity: 5 }), item('i3', { code: 'B2', name: 'Mil', unit: 'kg', quantity: 2.5 })],
    suppliers: [supplier('s1'), supplier('s2', { default_currency: 'EUR', default_tax_rate: 0 })],
    offers: {
      s1: { i1: offer(100, 10), i2: offer(90, 5), i3: offer(40, 2.5) },
      s2: { i1: offer(3, 10), i3: offer(1, 2.5) },
    },
    recommendations: { i1: 's1', i2: 's1', i3: 's2' },
  };
}

describe('header validation', () => {
  it('uses the legacy messages', () => {
    expect(validateHeader({ title: '', description: '', needed_date: '' })).toEqual({
      title: 'Talep başlığı zorunludur',
      needed_date: 'İhtiyaç tarihi zorunludur',
    });
    expect(validateHeader({ title: 'ab', description: 'x'.repeat(501), needed_date: '2026-01-01' })).toEqual({
      title: 'Talep başlığı en az 3 karakter olmalıdır',
      description: 'Talep açıklaması en fazla 500 karakter olabilir',
    });
    expect(validateHeader({ title: 'x'.repeat(101), description: '', needed_date: 'd' }).title).toBe(
      'Talep başlığı en fazla 100 karakter olabilir',
    );
  });

  it('defaults the needed date to the local day', () => {
    expect(today(new Date(2026, 10, 2, 1, 30))).toBe('2026-11-02');
  });
});

describe('submit validation', () => {
  it('lists every problem in legacy order', () => {
    const s: PrState = {
      ...emptyState(),
      title: 'Talep',
      items: [item('i1', { quantity: 1.5 }), item('i2', { code: '' })],
      suppliers: [supplier('s1')],
      offers: { s1: { i1: offer(10, 1.5) } },
    };
    expect(validateAll(s)).toEqual([
      "Malzeme 1: 'Adet' birimi için miktar tam sayı olmalıdır",
      'Malzeme 2: Malzeme kodu zorunludur',
      'En az 2 tedarikçi eklemelisiniz',
      'Malzeme 2: Bu malzeme için hiçbir tedarikçiden teklif bulunmamaktadır',
      'Malzeme 1: Bu malzeme için tedarikçi önerisi seçmelisiniz',
      'Malzeme 2: Bu malzeme için tedarikçi önerisi seçmelisiniz',
    ]);
    expect(validateAll(readyState())).toEqual([]);
  });

  it('names the rows that do not come from a planning line', () => {
    expect(unplannedItemsMessage([item('a', { source_planning_request_item_id: 5 })])).toBeNull();
    const msg = unplannedItemsMessage([
      item('a', { source_planning_request_item_id: 5 }),
      item('b', { code: 'B2' }),
    ]);
    expect(msg).toContain('yalnızca planlama talebi kalemlerinden');
    expect(msg).toContain('Malzeme 2: B2');
    expect(msg).not.toContain('Malzeme 1');
  });

  it('refuses identical rows', () => {
    const msg = duplicateItemsMessage([item('a'), item('b')]);
    expect(msg).toContain('Tekrarlanan satırlar: Satır 1 (10 adet), Satır 2 (10 adet)');
    expect(duplicateItemsMessage([item('a'), item('b', { job_no: 'X' })])).toBeNull();
  });
});

describe('submission payload', () => {
  it('groups rows by item (not job number) into allocations', () => {
    const { items, mapping } = formatItemsForSubmission(readyState().items);
    expect(mapping).toEqual([0, 0, 1]);
    expect(items[0]).toEqual({
      code: 'A1',
      name: 'Flanş',
      unit: 'adet',
      specifications: '',
      item_description: '',
      allocations: [
        { job_no: '254-01', quantity: '10.00' },
        { job_no: '254-02', quantity: '5.00' },
      ],
      file_asset_ids: [],
      quantity: '15.00',
      planning_request_item_id: null,
    });
  });

  it('builds the createPurchaseRequest body', () => {
    const body = buildSubmitPayload(readyState(), { TRY: 1, EUR: 0.025 });
    expect(body).toMatchObject({
      title: 'Konveyör malzemeleri',
      description: '',
      priority: 'normal',
      needed_date: '2026-11-20',
      is_rolling_mill: false,
      planning_request_item_ids: [],
    });
    // Grouped index 0 takes its last row's offer (legacy).
    expect(body.offers).toEqual({ s1: { 0: offer(90, 5), 1: offer(40, 2.5) }, s2: { 0: offer(3, 10), 1: offer(1, 2.5) } });
    expect(body.recommendations).toEqual({ 0: 's1', 1: 's2' });
    // 1000 + 450 TRY → 36.25 EUR, plus 2.5 EUR.
    expect(body.total_amount_eur).toBe(38.75);
    expect(body.suppliers[1]).toMatchObject({ currency: 'EUR', payment_terms_id: 3, tax_rate: 0 });
    expect(body.suppliers[1]).not.toHaveProperty('default_tax_rate');
  });

  it('flags rolling-mill job numbers', () => {
    const s = { ...readyState(), items: [item('i1', { job_no: 'rm-12' })] };
    expect(buildSubmitPayload(s, null).is_rolling_mill).toBe(true);
  });

  it('sends tax rate 0 (legacy dropped it)', () => {
    expect(transformSuppliers([supplier('s', { default_tax_rate: 0 })])[0]).toMatchObject({ tax_rate: 0 });
  });
});

describe('row keys (port of reindexByItemIndex.test.mjs)', () => {
  it('deleting a row keeps every other row with its own offer and recommendation', () => {
    const s = removeItems(readyState(), new Set(['i2']));
    expect(s.items.map((i) => i.id)).toEqual(['i1', 'i3']);
    expect(s.offers.s1).toEqual({ i1: offer(100, 10), i3: offer(40, 2.5) });
    // A supplier that never quoted the deleted row keeps its offers.
    expect(s.offers.s2).toEqual({ i1: offer(3, 10), i3: offer(1, 2.5) });
    expect(s.recommendations).toEqual({ i1: 's1', i3: 's2' });
    // Row-indexed payloads follow the new order.
    expect(buildDraftPayload(s, null, { strict: true })).toMatchObject({
      payload: { data: { original_recommendations: { 0: 's1', 1: 's2' } } },
    });
  });

  it('a quantity edit recomputes the offer totals', () => {
    const s = editItem(readyState(), 'i1', 'quantity', 4);
    expect(s.offers.s1!.i1!.totalPrice).toBe(400);
    expect(s.offers.s2!.i1!.totalPrice).toBe(12);
  });

  it('removing a supplier clears recommendations pointing at it', () => {
    const s = removeSupplier(readyState(), 's2');
    expect(s.offers).not.toHaveProperty('s2');
    expect(s.recommendations.i3).toBeNull();
  });
});

describe('offers and merge', () => {
  it('needs one row with price and delivery days', () => {
    const items = [item('a'), item('b')];
    expect(buildOffer(items, { a: { unitPrice: '5', deliveryDays: '', notes: '' } })).toEqual({
      ok: false,
      error: 'En az bir satır için hem birim fiyat hem de teslimat süresi girilmelidir.',
    });
    const ok = buildOffer(items, {
      a: { unitPrice: '5', deliveryDays: '3', notes: 'n' },
      b: { unitPrice: '', deliveryDays: '4', notes: '' },
    });
    expect(ok).toEqual({
      ok: true,
      offers: { a: { unitPrice: 5, totalPrice: 50, deliveryDays: 3, notes: 'n' }, b: { unitPrice: 0, totalPrice: 0, deliveryDays: 4, notes: '' } },
      warnings: ['Satır 2: Teslimat süresi girildi ancak birim fiyat girilmedi'],
    });
  });

  it('merges rows into allocations and keeps files, description and other offers', () => {
    const s = readyState();
    s.items[0] = { ...s.items[0]!, file_asset_ids: [7], item_description: 'dövme', source_planning_request_item_id: 31 };
    s.items[1] = { ...s.items[1]!, item_description: 'dövme', source_planning_request_item_id: 32 };
    const outcome = mergeSelection('A1', [s.items[0]!, s.items[1]!]);
    if (outcome.kind !== 'merged') throw new Error(outcome.kind);
    expect(outcome.item).toMatchObject({
      quantity: 15,
      job_no: '',
      item_description: 'dövme',
      file_asset_ids: [7],
      allocations: [
        { job_no: '254-01', quantity: '10.00' },
        { job_no: '254-02', quantity: '5.00' },
      ],
      source_planning_request_item_ids: [31, 32],
    });
    const next = applyMerges(s, [outcome]);
    expect(next.items.map((i) => i.code)).toEqual(['B2', 'A1']);
    expect(next.offers.s2).toEqual({ i3: offer(1, 2.5) });
    expect(isPlanningItemOnPage(next.items, 32)).toBe(true);
    expect(mergeSelection('A1', [item('x'), item('y')]).kind).toBe('identical');
    expect(mergeSelection('A1', [item('x'), item('y', { unit: 'kg', job_no: 'Z' })]).kind).toBe('different');
  });
});

describe('drafts', () => {
  it('round-trips through localStorage in the legacy shape', () => {
    const s = { ...readyState(), savedDraft: { id: 4, title: 'Eski' } };
    const raw = toStorage(s, new Date('2026-11-02T10:00:00Z'));
    expect(JSON.parse(raw).offers.s1['2']).toEqual(offer(40, 2.5));
    const back = fromStorage(raw, new Date('2026-11-02T12:00:00Z'))!;
    expect(back.offers).toEqual(s.offers);
    expect(back.recommendations).toEqual(s.recommendations);
    expect(back.savedDraft).toEqual({ id: 4, title: 'Eski' });
    expect(fromStorage(raw, new Date('2026-11-04T12:00:00Z'))).toBeNull();
  });

  it('loads a draft from original_items (keys by row)', () => {
    const built = buildDraftPayload(readyState(), null, { strict: true });
    if ('error' in built) throw new Error(built.error);
    const draft = { id: 8, title: 'T', is_autosave: false, needed_date: '2026-11-20', data: built.payload.data } as PurchaseRequestDraft;
    const s = stateFromDraft(draft);
    expect(s.items.map((i) => i.id)).toEqual(['i1', 'i2', 'i3']);
    expect(s.offers).toEqual(readyState().offers);
    expect(s.savedDraft).toEqual({ id: 8, title: 'T' });
  });

  it('ungroups old drafts: each allocation row takes its group offer', () => {
    const draft = {
      id: 2,
      is_autosave: true,
      data: {
        source_draft: { id: 1, title: 'Ana' },
        items: [{ code: 'A1', name: 'Flanş', unit: 'adet', allocations: [{ job_no: 'J1', quantity: '2.00' }, { job_no: 'J2', quantity: '3.00' }] }],
        suppliers: [{ id: 's1', name: 'Acme', currency: 'USD', tax_rate: '18' }],
        offers: { s1: { 0: offer(10, 5) } },
        recommendations: { 0: 's1' },
      },
    } as unknown as PurchaseRequestDraft;
    const s = stateFromDraft(draft);
    expect(s.items.map((i) => [i.job_no, i.quantity])).toEqual([
      ['J1', 2],
      ['J2', 3],
    ]);
    expect(Object.values(s.offers.s1!)).toHaveLength(2);
    expect(Object.values(s.recommendations)).toEqual(['s1', 's1']);
    expect(s.suppliers[0]).toMatchObject({ default_currency: 'USD', default_tax_rate: 18 });
    expect(s.savedDraft).toEqual({ id: 1, title: 'Ana' });
  });
});
