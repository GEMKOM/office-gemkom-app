import { fireEvent, render, screen, within } from '@testing-library/react';
import { PlanParts, PlanTable } from './PlanTables';
import { printReport } from './printReport';
import { ReportContext, type ReportActions, type ReportView } from './reportParts';
import { reportModel } from './reportModel';
import { DoneReport, gotoResolver } from './ReportSections';

const REPORT = {
  id: 7,
  version: 2,
  status: 'done',
  subject_key: '270-01',
  markdown: [
    '# Rapor',
    '## 1. Özet',
    '**En önemli 3 risk**',
    '- Bakır fiyatı [Teklif s.2]',
    '## 2. Maliyet tablosu',
    'Ayrıntı §2.2 bölümünde.',
    '## 3. Teklif önerisi',
    '- Önerilen fiyat: 100.000 € (toplam 100.000 €)',
    '## 4. Dikkat noktaları',
    '### İmalat',
    '- Kaynak kalitesi',
  ].join('\n'),
  hours: { calibration: { in_house: { factor_mean: 1.1, references_used: ['250-01'], expected_h_per_unit: 12 } } },
  cost_table: {
    found: true,
    routes: ['in_house', 'subcontract'],
    expected_total: { in_house: 80000, subcontract: 90000 },
    rows: [
      { key: 'material', label: 'Malzeme', in_house: { expected: 20000 }, subcontract: { expected: 21000 }, basis: 'BOM' },
      { key: 'total', label: 'TOPLAM', in_house: { low: 70000, expected: 80000, high: 90000 }, subcontract: { expected: 90000 } },
    ],
  },
  similar_jobs: Array.from({ length: 10 }, (_, i) => ({ job_no: `250-0${i}`, title: `İş ${i}`, similarity: 1 - i / 20 })),
};

function makeActions(): ReportActions {
  return {
    toggle: vi.fn(),
    goto: vi.fn(),
    expandAll: vi.fn(),
    collapseAll: vi.fn(),
    top: vi.fn(),
    confHelp: vi.fn(),
    similarAll: vi.fn(),
    weldToggle: vi.fn(),
    route: vi.fn(),
  };
}

function renderDone(view: Partial<ReportView> = {}) {
  const m = reportModel(REPORT);
  const actions = makeActions();
  const value = {
    view: {
      uid: 't',
      collapsed: new Set<string>(),
      costRoute: 'in_house',
      similarAll: false,
      confOpen: false,
      weldOpen: false,
      navActive: 'ozet',
      navStuck: false,
      navTop: null,
      ...view,
    },
    actions,
    resolve: gotoResolver(m),
  };
  const utils = render(
    <ReportContext.Provider value={value}>
      <DoneReport r={REPORT} m={m} weld={null} />
    </ReportContext.Provider>,
  );
  return { ...utils, actions };
}

it('renders the summary, the nav and the sections the payload has', () => {
  const { container } = renderDone();
  expect(container.querySelector('.est-price-value')?.textContent).toBe('100.000 €');
  expect([...container.querySelectorAll('[data-nav-key]')].map((b) => (b as HTMLElement).dataset.navKey)).toEqual([
    'ozet',
    'maliyet',
    'iscilik',
    'benzer',
    'teklif',
    'dikkat',
    'metin',
    'girdiler',
  ]);
  expect(container.querySelector('.est-nav-item.is-active')?.textContent).toBe('Özet');
  expect(container.querySelector('table.est-cost:not(.is-compare)')).not.toBeNull();
  // citations become chips
  expect(container.querySelector('.est-risks .est-cite')?.textContent).toBe('Teklif s.2');
  // the department card of §4
  expect(within(container.querySelector('section[data-sec="dikkat"]')!).getByText('İmalat')).toBeInTheDocument();
  // 8 of 10 similar jobs until "Tümünü göster"
  expect(container.querySelectorAll('table.est-similar tbody tr')).toHaveLength(8);
});

it('section, nav, route and § clicks call the card actions', () => {
  const { container, actions } = renderDone();
  fireEvent.click(screen.getByRole('button', { name: /Maliyet tablosu/ }));
  expect(actions.toggle).toHaveBeenCalledWith('maliyet');
  fireEvent.click(container.querySelector('[data-nav-key="teklif"]')!);
  expect(actions.goto).toHaveBeenCalledWith('teklif');
  fireEvent.click(screen.getByRole('button', { name: /Karşılaştır/ }));
  expect(actions.route).toHaveBeenCalledWith('compare');
  fireEvent.click(screen.getAllByRole('button', { name: '§2.2' })[0]!);
  expect(actions.goto).toHaveBeenCalledWith('iscilik');
  fireEvent.click(screen.getByRole('button', { name: 'Tümünü göster (10)' }));
  expect(actions.similarAll).toHaveBeenCalled();
  fireEvent.click(screen.getByTitle('Tüm bölümleri kapat'));
  expect(actions.collapseAll).toHaveBeenCalled();
});

it('shows the view state: collapsed sections, the compare table, every similar job', () => {
  const { container } = renderDone({ collapsed: new Set(['dikkat']), costRoute: 'compare', similarAll: true });
  expect(container.querySelector('section[data-sec="dikkat"]')!.classList.contains('is-collapsed')).toBe(true);
  expect(container.querySelector('table.est-cost.is-compare')).not.toBeNull();
  expect(container.querySelectorAll('table.est-similar tbody tr')).toHaveLength(10);
});

const PLAN_BU = {
  method: 'plan_v5',
  total_h: 10,
  work_centres: [
    { key: 'shop', label: 'Kaynak atölyesi', hours: 8, share: 0.8 },
    { key: 'mach', label: 'Talaşlı imalat', hours: 2, share: 0.2 },
  ],
  lines: [{ joint_type: 'plate_fillet', material: 'carbon_steel', qty: 4, hours: 6, unit_h: 1.5, unit: 'h/m', source: 'deduced' }],
  non_welding_lines: [{ step: 'handling', label: 'Taşıma', work_centre: 'shop', hours: 2, unit_h: 2, unit: 'h/piece', qty: 1 }],
  machining: { machining_h: 2, parts: [{ part: 'Mil', qty: 1, hours: 2, features: [{ kind: 'turn', machine: 'lathe', qty: 1 }] }] },
};

it('the plan table groups the bottom-up by work centre', () => {
  const { container } = render(<PlanTable bottomUp={PLAN_BU} />);
  const groups = container.querySelectorAll('details.est-plan-group');
  expect(groups).toHaveLength(2);
  expect(groups[0]!.textContent).toContain('Kaynak · Sac köşe');
  expect(groups[0]!.querySelector('.status-badge')?.textContent).toBe('çıkarım');
  expect(groups[0]!.textContent).toContain('Taşıma');
  expect(groups[1]!.textContent).toContain('Tornalama');
});

it('the parts list joins sub-assemblies and their parts', () => {
  const { container } = render(
    <PlanParts
      schedule={{
        sub_assemblies: [{ sub_id: 'A1', name: 'Gövde', qty_per_unit: 1, mass_kg_each: 100 }],
        parts: [
          { part_id: 'P1', sub_id: 'A1', name: 'Sac', kind: 'plate', machining: [{ kind: 'drill', spec: 'Ø20' }] },
          { part_id: 'P2', sub_id: '', name: 'Cıvata' },
        ],
      }}
    />,
  );
  expect(container.querySelector('summary')?.textContent).toContain('1 alt montaj, 2 parça, 1 işlenen');
  const rows = [...container.querySelectorAll('tbody tr')].map((r) => r.textContent);
  expect(rows[0]).toContain('Gövde');
  expect(rows[1]).toContain('Sac');
  expect(rows[2]).toContain('Tek parçalar');
  expect(rows[3]).toContain('Cıvata');
});

it('printReport writes the report into a new window, text only', () => {
  vi.useFakeTimers();
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const win = frame.contentWindow!;
  win.print = vi.fn();
  const open = vi.spyOn(window, 'open').mockReturnValue(win);
  printReport({ ...REPORT, title: '<b>Kazan</b>' } as never, { version: 1, joints: [{ joint_id: 'J1', joint_type: 'pipe_butt' }] });
  const doc = win.document;
  expect(doc.title).toBe('Tahmin raporu v2 · 270-01 · <b>Kazan</b>');
  expect(doc.querySelector('h1')?.textContent).toBe('Tahmin raporu v2 · 270-01 · <b>Kazan</b>');
  expect(doc.querySelector('b')).toBeNull();
  expect(doc.querySelector('table.cost')?.textContent).toContain('Malzeme');
  expect(doc.querySelector('table.weld')?.textContent).toContain('Boru alın');
  vi.advanceTimersByTime(400);
  expect(win.print).toHaveBeenCalled();
  open.mockRestore();
  vi.useRealTimers();
  frame.remove();
});

it('printReport reports a blocked pop-up', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const onBlocked = vi.fn();
  printReport(REPORT as never, null, { onBlocked });
  expect(onBlocked).toHaveBeenCalled();
  open.mockRestore();
});
