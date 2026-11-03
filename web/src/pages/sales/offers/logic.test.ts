import type { OfferItem } from '@/api/sales/offers';
import {
  approvalItemRows,
  buildKalemTree,
  buildPasteItems,
  buildPastePrices,
  deadlineUrgency,
  draftBadge,
  EMPTY_DRAFT,
  flatItemMap,
  flattenStaged,
  guessItemColumnRoles,
  guessPriceColumnRoles,
  itemSubtotal,
  missingCustomerFields,
  parsePasteTable,
  pricingTotals,
  seedPriceEdits,
  setColumnRole,
  setPricesPayload,
  stagedSubtree,
  statusTab,
  wouldCreateCycle,
  workflowRows,
  type ItemsDraft,
  type StagedItem,
} from './logic';

const NOW = new Date(2026, 10, 3, 12);

describe('deadline urgency', () => {
  it('is red from one day left, yellow under three, none for offers with the customer', () => {
    expect(deadlineUrgency({ status: 'draft', offer_expiry_date: '2026-11-04' }, NOW)).toBe('red');
    expect(deadlineUrgency({ status: 'draft', offer_expiry_date: '2026-11-01' }, NOW)).toBe('red');
    expect(deadlineUrgency({ status: 'pricing', offer_expiry_date: '2026-11-05' }, NOW)).toBe(
      'yellow',
    );
    expect(deadlineUrgency({ status: 'pricing', offer_expiry_date: '2026-11-06' }, NOW)).toBeNull();
    expect(
      deadlineUrgency({ status: 'submitted_customer', offer_expiry_date: '2026-11-01' }, NOW),
    ).toBeNull();
    expect(deadlineUrgency({ status: 'draft', offer_expiry_date: null }, NOW)).toBeNull();
  });
});

it('maps a status to the tab the badge opens', () => {
  expect(statusTab('consultation')).toBe('consultations');
  expect(statusTab('pricing')).toBe('pricing');
  expect(statusTab('approved')).toBe('approval');
  expect(statusTab('won')).toBe('genel');
});

describe('pasting items', () => {
  const table = parsePasteTable('Konveyör\tA1\t2\n\nBant\t\t1,6\nMotor\tB2\tx\n');

  it('drops blank lines and pads short rows', () => {
    expect(table.columnCount).toBe(3);
    expect(table.rows).toHaveLength(3);
  });

  it('guesses the title and the quantity column', () => {
    // 2 of 3 values in column 3 are numbers: under 75 %, so no quantity.
    expect(guessItemColumnRoles(table.rows, 3)).toEqual(['title', 'ignore', 'ignore']);
    const numeric = parsePasteTable('A\t2\nB\t3');
    expect(guessItemColumnRoles(numeric.rows, 2)).toEqual(['title', 'quantity']);
  });

  it('joins title columns and rounds the quantity', () => {
    expect(buildPasteItems(table.rows, ['title', 'title', 'quantity'], ' / ')).toEqual([
      { title: 'Konveyör / A1', quantity: 2 },
      { title: 'Bant', quantity: 2 },
      { title: 'Motor / B2', quantity: 1 },
    ]);
  });

  it('keeps an exclusive role on one column', () => {
    expect(setColumnRole(['quantity', 'title', 'ignore'], 2, 'quantity', ['quantity'])).toEqual([
      'ignore',
      'title',
      'quantity',
    ]);
    expect(setColumnRole(['title', 'ignore'], 1, 'title', ['quantity'])).toEqual([
      'title',
      'title',
    ]);
  });
});

describe('pasting prices', () => {
  const table = parsePasteTable(
    '1250,5\t12\t6 ay\tçok uzun bir açıklama metni burada\n900\t8\t4 ay\tnot',
  );

  it('takes the larger numbers as the price, then weight, period and notes', () => {
    expect(guessPriceColumnRoles(table.rows, 4)).toEqual([
      'unit_price',
      'weight_kg',
      'delivery_period',
      'notes',
    ]);
  });

  it('skips rows with text in a numeric column', () => {
    const rows = parsePasteTable('10\nabc\n12,345').rows;
    expect(buildPastePrices(rows, ['unit_price'])).toEqual([
      { unit_price: 10, weight_kg: null, delivery_period: null, notes: null },
      { unit_price: 12.35, weight_kg: null, delivery_period: null, notes: null },
    ]);
  });
});

const staged = (ref: string, extra: Partial<StagedItem> = {}): StagedItem => ({
  ref,
  templateNode: null,
  titleOverride: ref,
  quantity: 1,
  parentRef: null,
  parentId: null,
  label: ref,
  isCustom: true,
  ...extra,
});

describe('kalemler draft', () => {
  const saved: OfferItem[] = [
    {
      id: 1,
      parent: null,
      sequence: 2,
      title: 'B',
      children: [{ id: 3, parent: 1, sequence: 1, title: 'B1' }],
    },
    { id: 2, parent: null, sequence: 1, title: 'A' },
  ];
  const flat = flatItemMap(saved);

  it('sends parents before children, staged children right after their parent', () => {
    const draft = [
      staged('item-1'),
      staged('item-2', { parentId: 2 }),
      staged('item-3', { parentRef: 'item-1', templateNode: 7, titleOverride: null }),
    ];
    expect(flattenStaged(draft)).toEqual([
      { _ref: 'item-1', quantity: 1, title_override: 'item-1' },
      { _ref: 'item-3', quantity: 1, template_node: 7, parent_ref: 'item-1' },
      { _ref: 'item-2', quantity: 1, title_override: 'item-2', parent: 2 },
    ]);
    expect([...stagedSubtree(draft, 'item-1')]).toEqual(['item-1', 'item-3']);
  });

  it('rebuilds the tree with moves, deletes and staged rows', () => {
    const draft: ItemsDraft = {
      staged: [staged('item-1'), staged('item-2', { parentId: 2 })],
      edits: { 3: { parent: 2 } },
      deletes: [1],
    };
    const tree = buildKalemTree(flat, draft);
    // A (sequence 1) first; B is deleted; B1 moved under A; staged roots last.
    expect(tree.map((n) => (n.kind === 'existing' ? n.id : n.staged.ref))).toEqual([2, 'item-1']);
    const a = tree[0]!;
    expect(a.children.map((n) => (n.kind === 'existing' ? n.id : n.staged.ref))).toEqual([
      3,
      'item-2',
    ]);
    expect(draftBadge(draft)).toBe('+2 ~1 −1');
    expect(draftBadge(EMPTY_DRAFT)).toBe('0');
  });

  it('refuses a move under the item itself or its descendants', () => {
    expect(wouldCreateCycle(1, 3, flat, EMPTY_DRAFT)).toBe(true);
    expect(wouldCreateCycle(1, 1, flat, EMPTY_DRAFT)).toBe(true);
    expect(wouldCreateCycle(3, 2, flat, EMPTY_DRAFT)).toBe(false);
    // After moving 2 under 3, putting 1 under 2 would loop.
    expect(wouldCreateCycle(1, 2, flat, { ...EMPTY_DRAFT, edits: { 2: { parent: 3 } } })).toBe(
      true,
    );
  });
});

describe('pricing', () => {
  const items: OfferItem[] = [
    {
      id: 1,
      parent: null,
      quantity: 2,
      unit_price: '100',
      children: [
        { id: 2, parent: 1, quantity: 3, unit_price: '10', weight_kg: '2' },
        { id: 3, parent: 1, quantity: 1, unit_price: null, weight_kg: '4' },
      ],
    },
  ];
  const edits = seedPriceEdits(items);

  it('prices root items in flat mode and sums leaves in leaf mode', () => {
    expect(itemSubtotal(items[0]!, 'flat', edits)).toBe(200);
    expect(itemSubtotal(items[0]!, 'leaf', edits)).toBe(30);
    expect(pricingTotals(items, 'leaf', edits, 50)).toEqual({
      itemsTotal: 30,
      weight: 10,
      avgKg: 3,
      shipping: 50,
      grand: 80,
    });
  });

  it('clears the other mode’s prices in the payload', () => {
    const payload = setPricesPayload(items, 'flat', edits, 0);
    expect(payload.items.find((i) => i.id === 1)).toMatchObject({
      unit_price: 100,
      weight_kg: null,
    });
    expect(payload.items.find((i) => i.id === 2)).toMatchObject({
      unit_price: null,
      weight_kg: null,
      quantity: 3,
    });
  });
});

describe('approval tab', () => {
  it('shows leaf totals on a parent in leaf mode', () => {
    const rows = approvalItemRows(
      [
        {
          id: 1,
          quantity: 2,
          children: [
            { id: 2, quantity: 2, weight_kg: '5', subtotal: '40' },
            { id: 3, quantity: 1, weight_kg: '10', subtotal: '20' },
          ],
        },
      ],
      'leaf',
    );
    expect(rows[0]).toMatchObject({ unitPrice: 30, weight: 20, kgPrice: 3, depth: 0 });
    expect(rows[1]).toMatchObject({
      unitPrice: null,
      weight: 5,
      kgPrice: 4,
      subtotal: 40,
      depth: 1,
    });
  });

  it('summarises workflows newest first with the latest decision', () => {
    const rows = workflowRows(
      [
        { created_at: '2026-01-01', is_complete: true, snapshot: { round: 1, amount: '10' } },
        {
          created_at: '2026-02-01',
          current_stage_order: 1,
          stage_instances: [
            {
              order: 1,
              name: 'Müdür',
              required_approvals: 1,
              approved_count: 0,
              approvers: [{ id: 5, first_name: 'Ayşe', last_name: 'Kaya' }],
              decisions: [
                {
                  approver: 5,
                  decision: 'reject',
                  decided_at: '2026-02-02T10:00:00Z',
                  comment: 'Pahalı',
                },
              ],
            },
          ],
        },
      ],
      'EUR',
    );
    expect(rows.map((r) => r.status.label)).toEqual(['Devam Ediyor', 'Tamamlandı']);
    expect(rows[0]).toMatchObject({
      stage: 'Müdür',
      approvers: 'Ayşe Kaya',
      comment: 'Pahalı',
      currency: 'EUR',
    });
    expect(rows[0]!.lastDecision?.label).toBe('Red');
    expect(rows[0]!.lastDecisionBy).toBe('#5');
  });
});

it('lists the customer fields a conversion needs', () => {
  expect(missingCustomerFields({ phone: '1', address: ' ', tax_id: 'x' })).toEqual([
    'Adres',
    'Vergi Dairesi',
  ]);
  expect(missingCustomerFields(null)).toHaveLength(4);
});
